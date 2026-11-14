/** Sign out: forget the remembered session and revoke it at Google. */
export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'cache-control', 'no-store')
  const session = readSession(event)
  forgetSession(event)
  if (session) await revokeToken(session.via, session.refreshToken)
  return { ok: true }
})
