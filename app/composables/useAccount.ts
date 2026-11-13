import { computed, reactive, ref } from 'vue'

/**
 * Your YouTube Music sign-in. Like the Android app, it stays on this device only:
 * the refresh token (or YouTube cookie) lives in localStorage, and the short-lived access token
 * is handed to Sonora's server as a first-party cookie scoped to /api, so every API call and
 * every <audio> request is signed in. Nothing is stored on the server.
 */
export type SignInVia = 'google' | 'tv' | 'cookie'
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
  window.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') ensureFresh() })
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
    return
  }
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
  if (!a.refreshToken) return false
  refreshing ??= (async () => {
    try {
      const r = await $fetch<{ status: string, accessToken?: string, expiresIn?: number }>('/api/auth/token', {
        method: 'POST', body: { via: a.via, refreshToken: a.refreshToken },
      })
      if (r.status === 'ok' && r.accessToken) {
        account.value = { ...a, accessToken: r.accessToken, expiresAt: Date.now() + (r.expiresIn ?? 3600) * 1000 }
        save()
        applyCookies()
        return true
      }
      // The refresh token was revoked or expired.
      account.value = { ...a, accessToken: undefined, expired: true }
      save()
      applyCookies()
      useToast().show('Your YouTube sign-in expired. Sign in again from Library.')
      changed()
      return false
    }
    catch { return !!a.accessToken } // offline: keep what we have
    finally { refreshing = null }
  })()
  return refreshing
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
  await fetchProfile()
  await changed()
  useToast().show(account.value?.name ? `Signed in as ${account.value.name}` : 'Signed in to YouTube Music')
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
    startDeviceLogin,
    cancelDeviceLogin,
    signInWithCookie,
    signOut,
    refreshProfile: fetchProfile,
  }
}
