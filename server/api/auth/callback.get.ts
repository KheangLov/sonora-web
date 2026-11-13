/**
 * Google sends you back here. We swap the one-time code for tokens and hand them to the browser
 * in the URL fragment (#…), which never reaches any server or log. The browser checks `state`,
 * stores the sign-in on this device, and removes the fragment.
 */
export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'cache-control', 'no-store')
  setResponseHeader(event, 'referrer-policy', 'no-referrer')
  const q = getQuery(event) as Record<string, string | undefined>
  const state = String(q.state ?? '')
  const back = (() => {
    const p = state.split('|')[1]
    return p && p.startsWith('/') && !p.startsWith('//') ? p : '/library'
  })()
  const to = (payload: Record<string, unknown>) =>
    sendRedirect(event, `${back}#sonora-auth=${Buffer.from(JSON.stringify(payload)).toString('base64url')}`, 302)

  if (q.error || !q.code) return to({ state, error: q.error === 'access_denied' ? 'You cancelled the Google sign-in.' : String(q.error ?? 'No code') })
  try {
    const t = await exchangeAuthCode(event, String(q.code))
    return to({ state, ...t })
  }
  catch (e: any) {
    return to({ state, error: String(e?.statusMessage ?? e?.message ?? 'Sign-in failed') })
  }
})
