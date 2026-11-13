/**
 * YouTube Music sign-in.
 *
 * Two ways in, both kept in the listener's own browser (like the Android app keeps its cookie
 * on the phone). The server stores nothing:
 *  - "Sign in with Google": the TV-style device flow. You enter a short code at google.com/device.
 *    Uses your own Google OAuth client (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET, type
 *    "TVs and Limited Input devices") when set, otherwise YouTube's TV client.
 *  - A YouTube cookie pasted from a signed-in browser (the Android app's method).
 *
 * The browser sends the short-lived access token (or the cookie) as a first-party cookie scoped
 * to /api, so even <audio> requests carry it. Requests that use it are never edge-cached.
 */
import { AsyncLocalStorage } from 'node:async_hooks'
import { createHash, randomUUID } from 'node:crypto'
import type { H3Event } from 'h3'

export interface YtAuth { bearer?: string, cookie?: string }

/** Auth for the current request, visible to ytm() and the stream resolver without threading it through. */
export const authStore = new AsyncLocalStorage<YtAuth | null>()

export const TOKEN_COOKIE = 'sonora_yt_token'
export const YTCOOKIE_COOKIE = 'sonora_yt_cookie'

export function getAuth(event: H3Event): YtAuth | null {
  const c = parseCookies(event)
  const bearer = c[TOKEN_COOKIE]
  if (bearer && /^[\w.\-~+/=]{20,4096}$/.test(bearer)) return { bearer }
  const cookie = c[YTCOOKIE_COOKIE]
  if (cookie && /(?:^|;\s*)(?:SAPISID|__Secure-3PAPISID)=/.test(cookie)) return { cookie }
  return null
}

/** Run a handler with the caller's YouTube auth. Personal responses are private (never edge-cached). */
export function withAuth<T>(event: H3Event, fn: (auth: YtAuth | null) => Promise<T>): Promise<T> {
  const auth = getAuth(event)
  if (auth) {
    event.context.private = true
    setResponseHeader(event, 'cache-control', 'private, no-store')
    appendResponseHeader(event, 'vary', 'Cookie')
  }
  return authStore.run(auth, () => fn(auth))
}

/** Headers that sign a YouTube / YouTube Music InnerTube request. */
export function authHeaders(auth: YtAuth | null | undefined, origin: string): Record<string, string> {
  if (!auth) return {}
  if (auth.bearer) return { 'authorization': `Bearer ${auth.bearer}`, 'x-goog-request-time': String(Math.floor(Date.now() / 1000)) }
  const cookie = auth.cookie!
  const sapisid = /(?:^|;\s*)SAPISID=([^;]+)/.exec(cookie)?.[1] ?? /(?:^|;\s*)__Secure-3PAPISID=([^;]+)/.exec(cookie)?.[1]
  const h: Record<string, string> = { 'cookie': cookie, 'x-goog-authuser': '0' }
  if (sapisid) {
    const ts = Math.floor(Date.now() / 1000)
    h.authorization = `SAPISIDHASH ${ts}_${createHash('sha1').update(`${ts} ${sapisid} ${origin}`).digest('hex')}`
  }
  return h
}

/** Keep only the cookies YouTube needs for a signed-in session (keeps our cookie under 4 KB). */
const AUTH_COOKIES = [
  'SID', 'HSID', 'SSID', 'APISID', 'SAPISID', 'LOGIN_INFO', 'PREF',
  '__Secure-1PSID', '__Secure-3PSID', '__Secure-1PAPISID', '__Secure-3PAPISID',
  '__Secure-1PSIDTS', '__Secure-3PSIDTS', '__Secure-1PSIDCC', '__Secure-3PSIDCC', 'SIDCC',
]
export function trimYouTubeCookie(raw: string): string {
  const pairs = raw.replace(/^cookie:\s*/i, '').split(';').map(p => p.trim()).filter(Boolean)
  const keep = pairs.filter(p => AUTH_COOKIES.includes(p.split('=')[0]!))
  return keep.join('; ')
}

// ------------------------------------------------------------------ OAuth device flow

export type OAuthVia = 'google' | 'tv'
interface OAuthClient { via: OAuthVia, id: string, secret: string, codeUrl: string, tokenUrl: string, scope: string }

let tvClient: Promise<OAuthClient> | null = null

export function oauthClient(via?: OAuthVia): Promise<OAuthClient> {
  const id = process.env.GOOGLE_CLIENT_ID?.trim()
  const secret = process.env.GOOGLE_CLIENT_SECRET?.trim()
  if (id && secret && via !== 'tv') {
    return Promise.resolve({
      via: 'google', id, secret,
      codeUrl: 'https://oauth2.googleapis.com/device/code',
      tokenUrl: 'https://oauth2.googleapis.com/token',
      scope: 'https://www.googleapis.com/auth/youtube',
    })
  }
  tvClient ??= fetchTvClient().catch((e) => { tvClient = null; throw e })
  return tvClient
}

/** YouTube on TV's own OAuth client, read from its player script (what youtubei.js does). */
async function fetchTvClient(): Promise<OAuthClient> {
  const headers = { 'user-agent': 'Mozilla/5.0 (ChromiumStylePlatform) Cobalt/Version', 'referer': 'https://www.youtube.com/tv', 'accept-language': 'en-US' }
  const html = await (await fetch('https://www.youtube.com/tv', { headers })).text()
  const src = /<script\s+id="base-js"\s+src="([^"]+)"[^>]*><\/script>/.exec(html)?.[1]
  if (!src) throw createError({ statusCode: 502, statusMessage: 'Could not load YouTube TV sign-in' })
  const js = await (await fetch(new URL(src, 'https://www.youtube.com'), { headers })).text()
  const m = /clientId:"(?<id>[^"]+)",[^"]*?:"(?<secret>[^"]+)"/.exec(js)
  if (!m?.groups) throw createError({ statusCode: 502, statusMessage: 'Could not read YouTube TV sign-in client' })
  return {
    via: 'tv', id: m.groups.id!, secret: m.groups.secret!,
    codeUrl: 'https://www.youtube.com/o/oauth2/device/code',
    tokenUrl: 'https://www.youtube.com/o/oauth2/token',
    scope: 'http://gdata.youtube.com https://www.googleapis.com/auth/youtube-paid-content',
  }
}

async function postJson(url: string, body: Record<string, string>, form: boolean) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': form ? 'application/x-www-form-urlencoded' : 'application/json' },
    body: form ? new URLSearchParams(body).toString() : JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({})) as Record<string, any>
  return { ok: res.ok, status: res.status, data }
}

export async function startDeviceFlow() {
  const c = await oauthClient()
  const body: Record<string, string> = { client_id: c.id, scope: c.scope }
  if (c.via === 'tv') Object.assign(body, { device_id: randomUUID(), device_model: 'ytlr::' })
  const r = await postJson(c.codeUrl, body, c.via === 'google')
  if (!r.ok || !r.data.device_code) {
    throw createError({ statusCode: 502, statusMessage: `Google sign-in unavailable (${r.data.error ?? r.status})` })
  }
  return {
    via: c.via,
    deviceCode: String(r.data.device_code),
    userCode: String(r.data.user_code),
    verificationUrl: String(r.data.verification_url ?? r.data.verification_uri ?? 'https://www.google.com/device'),
    interval: Number(r.data.interval) || 5,
    expiresIn: Number(r.data.expires_in) || 1800,
  }
}

export type TokenResult =
  | { status: 'ok', accessToken: string, refreshToken?: string, expiresIn: number }
  | { status: 'pending' | 'slow_down' | 'denied' | 'expired' | 'error', message?: string }

export async function exchangeToken(via: OAuthVia, grant: { deviceCode: string } | { refreshToken: string }): Promise<TokenResult> {
  const c = await oauthClient(via)
  const body: Record<string, string> = { client_id: c.id, client_secret: c.secret }
  if ('deviceCode' in grant) {
    body.code = grant.deviceCode
    body.device_code = grant.deviceCode
    body.grant_type = c.via === 'google' ? 'urn:ietf:params:oauth:grant-type:device_code' : 'http://oauth.net/grant_type/device/1.0'
  }
  else {
    body.refresh_token = grant.refreshToken
    body.grant_type = 'refresh_token'
  }
  const r = await postJson(c.tokenUrl, body, c.via === 'google')
  const err = String(r.data.error ?? '')
  if (r.data.access_token) {
    return { status: 'ok', accessToken: String(r.data.access_token), refreshToken: r.data.refresh_token ? String(r.data.refresh_token) : undefined, expiresIn: Number(r.data.expires_in) || 3600 }
  }
  if (err === 'authorization_pending') return { status: 'pending' }
  if (err === 'slow_down') return { status: 'slow_down' }
  if (err === 'access_denied') return { status: 'denied' }
  if (err === 'expired_token') return { status: 'expired' }
  return { status: 'error', message: String(r.data.error_description ?? err ?? r.status) }
}
