import type { OAuthVia } from '../../utils/auth'

/**
 * Step 2 of the code sign-in (poll until you approve the code), and refreshing an expired access
 * token. Refreshing uses the token the app sends, or the remembered session cookie.
 */
export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'cache-control', 'no-store')
  const body = await readBody<{ via?: OAuthVia, deviceCode?: string, refreshToken?: string }>(event)
  const via: OAuthVia = body?.via === 'google' || body?.via === 'web' ? body.via : 'tv'
  if (body?.deviceCode) {
    const r = await exchangeToken(via, { deviceCode: String(body.deviceCode).slice(0, 512) })
    if (r.status === 'ok' && r.refreshToken) rememberSession(event, via, r.refreshToken)
    return r
  }
  const session = readSession(event)
  const refreshToken = body?.refreshToken ? String(body.refreshToken).slice(0, 1024) : session?.via === via ? session.refreshToken : ''
  if (!refreshToken) throw createError({ statusCode: 400, statusMessage: 'Missing deviceCode or refreshToken' })
  const r = await exchangeToken(via, { refreshToken })
  if (r.status === 'ok') {
    // Re-save (Google may rotate the token) and slide the cookie's expiry forward.
    rememberSession(event, via, r.refreshToken ?? refreshToken)
  }
  else if (r.status === 'revoked' && session?.refreshToken === refreshToken) {
    forgetSession(event)
  }
  return r
})
