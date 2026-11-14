/**
 * Restore a remembered sign-in (see rememberSession): when this browser's app storage was wiped,
 * or the sign-in finished in another window. Returns a fresh access token, or 401.
 */
export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'cache-control', 'no-store')
  const session = readSession(event)
  if (!session) throw createError({ statusCode: 401, statusMessage: 'No remembered sign-in' })
  const r = await exchangeToken(session.via, { refreshToken: session.refreshToken })
    .catch(() => ({ status: 'error' as const }))
  if (r.status === 'ok') {
    rememberSession(event, session.via, r.refreshToken ?? session.refreshToken)
    return { status: 'ok' as const, via: session.via, accessToken: r.accessToken, expiresIn: r.expiresIn }
  }
  if (r.status === 'revoked') {
    forgetSession(event)
    throw createError({ statusCode: 401, statusMessage: 'Your Google sign-in expired' })
  }
  throw createError({ statusCode: 503, statusMessage: 'Couldn\'t reach Google, try again' })
})
