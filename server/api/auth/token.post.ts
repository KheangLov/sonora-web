import type { OAuthVia } from '../../utils/auth'

/** Step 2 (poll until you approve the code) and refreshing an expired access token. */
export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'cache-control', 'no-store')
  const body = await readBody<{ via?: OAuthVia, deviceCode?: string, refreshToken?: string }>(event)
  const via: OAuthVia = body?.via === 'google' || body?.via === 'web' ? body.via : 'tv'
  if (body?.deviceCode) return exchangeToken(via, { deviceCode: String(body.deviceCode).slice(0, 512) })
  if (body?.refreshToken) return exchangeToken(via, { refreshToken: String(body.refreshToken).slice(0, 1024) })
  throw createError({ statusCode: 400, statusMessage: 'Missing deviceCode or refreshToken' })
})
