/**
 * "Continue with Google": send the browser to Google's normal account chooser.
 * `state` is made by the browser (and checked by it on return) so nobody can plant a sign-in.
 */
export default defineEventHandler((event) => {
  const web = webClient()
  if (!web) throw createError({ statusCode: 503, statusMessage: 'Google sign-in is not set up on this server' })
  const state = String(getQuery(event).state ?? '')
  if (!/^[\w-]{16,64}(\|\/[^\s]{0,200})?$/.test(state)) throw createError({ statusCode: 400, statusMessage: 'Bad state' })
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  url.search = new URLSearchParams({
    client_id: web.id,
    redirect_uri: callbackUrl(event),
    response_type: 'code',
    scope: WEB_SCOPES,
    access_type: 'offline', // a refresh token, so you stay signed in
    include_granted_scopes: 'true',
    prompt: 'select_account consent',
    state,
  }).toString()
  return sendRedirect(event, url.toString(), 302)
})
