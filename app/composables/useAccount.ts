import { computed, reactive, ref } from 'vue'

/**
 * Your YouTube Music sign-in. Like the Android app, it stays on this device only:
 * the refresh token (or YouTube cookie) lives in localStorage, and the short-lived access token
 * is handed to Sonora's server as a first-party cookie scoped to /api, so every API call and
 * every <audio> request is signed in. Nothing is stored on the server.
 */
export type SignInVia = 'web' | 'google' | 'tv' | 'cookie'
export interface Account {
  via: SignInVia
  refreshToken?: string
  accessToken?: string
  expiresAt?: number
  cookie?: string
  name?: string | null
  handle?: string | null
  photo?: string | null
  /** Set when the sign-in stopped working and you need to sign in again. */
  expired?: boolean
}

const KEY = 'sonora-account'
const TOKEN_COOKIE = 'sonora_yt_token'
const YTCOOKIE_COOKIE = 'sonora_yt_cookie'
const VIA_COOKIE = 'sonora_yt_via'
const STATE_KEY = 'sonora-oauth-state'
const googleEnabled = ref(false)

const account = ref<Account | null>(null)
/** Bumps on sign in / out, so feeds reload. */
const version = ref(0)
let loaded = false
let refreshing: Promise<boolean> | null = null
let timer: ReturnType<typeof setInterval> | null = null

function load() {
  if (loaded || !import.meta.client) return
  loaded = true
  try { account.value = JSON.parse(localStorage.getItem(KEY) ?? 'null') } catch { account.value = null }
  applyCookies()
  startTimer()
  window.addEventListener('hashchange', () => finishGoogleRedirect())
  $fetch<{ google: boolean }>('/api/auth/config').then((c) => { googleEnabled.value = c.google }).catch(() => {})
  // Coming back to the app (e.g. from Google in another window): refresh, or pick up a sign-in made there.
  const wake = () => { if (account.value && !account.value.expired) ensureFresh(); else restoreSession() }
  window.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') wake() })
  window.addEventListener('focus', wake)
  window.addEventListener('pageshow', (e) => { if ((e as PageTransitionEvent).persisted) wake() })
  if (!account.value || account.value.expired) restoreSession()
  window.addEventListener('storage', (e) => {
    if (e.key !== KEY) return
    try { account.value = JSON.parse(e.newValue ?? 'null') } catch { account.value = null }
    applyCookies()
    changed()
  })
}

function save() {
  try {
    if (account.value) localStorage.setItem(KEY, JSON.stringify(account.value))
    else localStorage.removeItem(KEY)
  }
  catch {}
}

function setCookie(name: string, value: string, maxAge: number) {
  const secure = location.protocol === 'https:' ? '; Secure' : ''
  document.cookie = `${name}=${encodeURIComponent(value)}; Path=/api; Max-Age=${Math.max(0, Math.floor(maxAge))}; SameSite=Strict${secure}`
}

function applyCookies() {
  const a = account.value
  if (!a || a.expired) {
    setCookie(TOKEN_COOKIE, '', 0)
    setCookie(YTCOOKIE_COOKIE, '', 0)
    setCookie(VIA_COOKIE, '', 0)
    return
  }
  setCookie(VIA_COOKIE, a.via, 400 * 86400)
  if (a.via === 'cookie' && a.cookie) {
    setCookie(YTCOOKIE_COOKIE, a.cookie, 400 * 86400)
    setCookie(TOKEN_COOKIE, '', 0)
  }
  else if (a.accessToken && a.expiresAt) {
    setCookie(TOKEN_COOKIE, a.accessToken, (a.expiresAt - Date.now()) / 1000)
    setCookie(YTCOOKIE_COOKIE, '', 0)
  }
}

/** Clear everything cached for the previous account and reload feeds. */
async function changed() {
  version.value++
  clearApiMemo()
  try { await caches.delete('feeds') } catch {}
}

function startTimer() {
  if (timer) clearInterval(timer)
  timer = setInterval(() => { ensureFresh() }, 4 * 60_000)
}

/** Make sure the access token is good for at least 5 more minutes. Returns false if signed out. */
async function ensureFresh(): Promise<boolean> {
  const a = account.value
  if (!a || a.expired) return false
  if (a.via === 'cookie') return true
  if (a.accessToken && (a.expiresAt ?? 0) - Date.now() > 5 * 60_000) return true
  refreshing ??= (async () => {
    try {
      // No refresh token here (e.g. a restored session)? The server uses the remembered-session cookie.
      const r = await $fetch<{ status: string, accessToken?: string, expiresIn?: number }>('/api/auth/token', {
        method: 'POST', body: { via: a.via, ...(a.refreshToken ? { refreshToken: a.refreshToken } : {}) },
      })
      if (r.status === 'ok' && r.accessToken) {
        account.value = { ...a, accessToken: r.accessToken, expiresAt: Date.now() + (r.expiresIn ?? 3600) * 1000 }
        save()
        applyCookies()
        return true
      }
      if (r.status !== 'revoked') return (a.expiresAt ?? 0) > Date.now() // a hiccup at Google: try again later
      // The refresh token is really dead. Maybe a newer sign-in is remembered in this browser.
      if (a.refreshToken && hasRememberedSession() && await restoreSession(true)) return true
      account.value = { ...a, accessToken: undefined, expired: true }
      save()
      applyCookies()
      useToast().show('Your YouTube sign-in expired. Sign in again from Library.')
      changed()
      return false
    }
    catch { return (a.expiresAt ?? 0) > Date.now() } // offline or server error: keep what we have, retry later
    finally { refreshing = null }
  })()
  return refreshing
}

function hasRememberedSession() {
  return /(?:^|;\s*)sonora_signed=/.test(document.cookie)
}

let restoring: Promise<boolean> | null = null
/**
 * Pick up a sign-in remembered by the server cookie: after the phone wiped this site's storage,
 * or when the Google redirect finished in another window (e.g. the browser instead of the installed app).
 */
function restoreSession(force = false): Promise<boolean> {
  if (!hasRememberedSession()) return Promise.resolve(false)
  if (!force && account.value && !account.value.expired) return Promise.resolve(true)
  restoring ??= (async () => {
    try {
      const r = await $fetch<{ status: string, via: SignInVia, accessToken: string, expiresIn: number }>('/api/auth/session', { method: 'POST' })
      if (r.status !== 'ok') return false
      const prev = account.value
      const same = prev && prev.via === r.via
      account.value = {
        via: r.via,
        accessToken: r.accessToken,
        expiresAt: Date.now() + (r.expiresIn || 3600) * 1000,
        name: prev && same ? prev.name : null, handle: prev && same ? prev.handle : null, photo: prev && same ? prev.photo : null,
      }
      save()
      applyCookies()
      if (!account.value.name) await fetchProfile()
      await changed()
      return true
    }
    catch { return false }
    finally { restoring = null }
  })()
  return restoring
}

async function fetchProfile() {
  try {
    const me = await $fetch<{ name: string | null, handle: string | null, photo: string | null }>('/api/me')
    if (account.value) {
      account.value = { ...account.value, ...me }
      save()
    }
  }
  catch {}
}

async function signedIn(a: Account) {
  account.value = a
  save()
  applyCookies()
  if (!a.name) await fetchProfile()
  await changed()
  useToast().show(account.value?.name ? `Signed in as ${account.value.name}` : 'Signed in to YouTube Music')
}

// ------------------------------------------------------------------ one-click Google sign-in (redirect)

/** Off to Google's account chooser; we come back to this same page, signed in. */
function startGoogleSignIn() {
  const bytes = crypto.getRandomValues(new Uint8Array(18))
  const nonce = btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  const state = `${nonce}|${location.pathname}`
  try { localStorage.setItem(STATE_KEY, state) } catch {}
  location.href = `/api/auth/google?state=${encodeURIComponent(state)}`
}

/** Back from Google: the tokens are in the URL fragment (never sent to any server). */
function finishGoogleRedirect(router?: ReturnType<typeof useRouter>) {
  const m = /[#&]sonora-auth=([\w-]+)/.exec(location.hash)
  if (!m) return
  // Take the tokens out of the address bar and history right away. The router remembers the URL it
  // started with and would write the hash back, so clear it through the router when we have it.
  if (router) {
    const clear = (tries: number) => {
      const r = router.currentRoute.value
      if (!r.hash.includes('sonora-auth')) return
      // Fails while another navigation is still running: try again shortly.
      router.replace({ path: r.path, query: r.query, hash: '' })
        .then(fail => { if (fail && tries > 0) setTimeout(() => clear(tries - 1), 150) })
        .catch(() => { if (tries > 0) setTimeout(() => clear(tries - 1), 150) })
    }
    clear(10)
  }
  else history.replaceState(history.state, '', location.pathname + location.search)
  let data: Record<string, any> = {}
  try { data = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(m[1]!.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0)))) } catch { return }
  const expected = localStorage.getItem(STATE_KEY)
  localStorage.removeItem(STATE_KEY)
  if (!expected || data.state !== expected) {
    // This window didn't start the sign-in (another tab, or the browser instead of the installed app),
    // or its storage was cleared on the way. The server checked the sign-in and remembered it: use that.
    // The tokens in the address bar are never trusted on their own here.
    restoreSession(true).then((ok) => {
      if (ok) useToast().show(account.value?.name ? `Signed in as ${account.value.name}` : 'Signed in to YouTube Music')
      else useToast().show(data.error || 'Sign-in was interrupted. Please try again.')
    })
    return
  }
  if (data.error || !data.accessToken) { useToast().show(data.error || 'Google sign-in failed'); return }
  signedIn({
    via: 'web',
    accessToken: data.accessToken,
    refreshToken: data.refreshToken,
    expiresAt: Date.now() + (Number(data.expiresIn) || 3600) * 1000,
    name: data.name, handle: data.email, photo: data.photo,
  })
}

// ------------------------------------------------------------------ device flow ("Sign in with Google")

export interface DeviceLogin {
  phase: 'starting' | 'code' | 'done' | 'error'
  userCode: string
  url: string
  error: string
}

let pollTimer: ReturnType<typeof setTimeout> | null = null

function cancelDeviceLogin() {
  if (pollTimer) clearTimeout(pollTimer)
  pollTimer = null
}

function startDeviceLogin(): DeviceLogin {
  cancelDeviceLogin()
  const state = reactive<DeviceLogin>({ phase: 'starting', userCode: '', url: '', error: '' })
  ;(async () => {
    try {
      const d = await $fetch<{ via: 'google' | 'tv', deviceCode: string, userCode: string, verificationUrl: string, interval: number, expiresIn: number }>(
        '/api/auth/device', { method: 'POST' },
      )
      state.userCode = d.userCode
      state.url = d.verificationUrl
      state.phase = 'code'
      const until = Date.now() + d.expiresIn * 1000
      let every = Math.max(3, d.interval) * 1000
      const poll = async () => {
        if (Date.now() > until) { state.phase = 'error'; state.error = 'The code expired. Get a new one.'; return }
        try {
          const r = await $fetch<{ status: string, accessToken?: string, refreshToken?: string, expiresIn?: number, message?: string }>(
            '/api/auth/token', { method: 'POST', body: { via: d.via, deviceCode: d.deviceCode } },
          )
          if (r.status === 'ok' && r.accessToken) {
            state.phase = 'done'
            await signedIn({ via: d.via, accessToken: r.accessToken, refreshToken: r.refreshToken, expiresAt: Date.now() + (r.expiresIn ?? 3600) * 1000 })
            return
          }
          if (r.status === 'slow_down') every += 2000
          else if (r.status === 'denied') { state.phase = 'error'; state.error = 'Sign-in was cancelled on Google\'s page.'; return }
          else if (r.status === 'expired') { state.phase = 'error'; state.error = 'The code expired. Get a new one.'; return }
          else if (r.status === 'error') { state.phase = 'error'; state.error = r.message || 'Google refused the sign-in.'; return }
        }
        catch {}
        pollTimer = setTimeout(poll, every)
      }
      pollTimer = setTimeout(poll, every)
    }
    catch (e: any) {
      state.phase = 'error'
      state.error = e?.data?.statusMessage ?? e?.statusMessage ?? 'Couldn\'t start Google sign-in. Check your connection.'
    }
  })()
  return state
}

// ------------------------------------------------------------------ cookie sign-in (the Android app's way)

async function signInWithCookie(raw: string) {
  const r = await $fetch<{ cookie: string, account: { name: string | null, handle: string | null, photo: string | null } }>(
    '/api/auth/cookie', { method: 'POST', body: { cookie: raw } },
  )
  await signedIn({ via: 'cookie', cookie: r.cookie, ...r.account })
}

async function signOut() {
  cancelDeviceLogin()
  await $fetch('/api/auth/signout', { method: 'POST' }).catch(() => {})
  account.value = null
  save()
  applyCookies()
  await changed()
  useToast().show('Signed out of YouTube Music')
}

export function useAccount() {
  load()
  return {
    account,
    version,
    signedIn: computed(() => !!account.value && !account.value.expired),
    /** Stable, non-secret key per account: keeps cached feeds of different accounts apart. */
    key: computed(() => {
      const a = account.value
      if (!a || a.expired) return ''
      const s = `${a.via}:${a.handle ?? a.name ?? ''}`
      let h = 0
      for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
      return (h >>> 0).toString(36)
    }),
    ensureFresh,
    /** One-click "Continue with Google" is set up on this server. */
    googleEnabled,
    startGoogleSignIn,
    startDeviceLogin,
    cancelDeviceLogin,
    signInWithCookie,
    finishGoogleRedirect,
    signOut,
    refreshProfile: fetchProfile,
  }
}
