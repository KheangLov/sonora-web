/**
 * "Continue with Google": send the browser to Google's normal account chooser.
 * `state` is made by the browser (and checked by it on return). It's also kept in an HttpOnly cookie
 * and checked by the callback, so the sign-in can be remembered safely even when the browser comes
 * back in a different tab or app window than the one that left.
 */
export default defineEventHandler((event) => {
  const web = webClient()
  if (!web) throw createError({ statusCode: 503, statusMessage: 'Google sign-in is not set up on this server' })
  const state = String(getQuery(event).state ?? '')
  if (!/^[\w-]{16,64}(\|\/[^\s]{0,200})?$/.test(state)) throw createError({ statusCode: 400, statusMessage: 'Bad state' })
  setCookie(event, STATE_COOKIE, state.split('|')[0]!, {
    httpOnly: true, sameSite: 'lax', path: '/api/auth', maxAge: 15 * 60,
    secure: getRequestURL(event, { xForwardedProto: true }).protocol === 'https:',
  })
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
