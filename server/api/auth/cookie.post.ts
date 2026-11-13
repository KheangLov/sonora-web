/**
 * The Android app's way in: a cookie from a browser that's signed in to music.youtube.com.
 * We keep only the sign-in cookies, check they work, and hand them back to the browser.
 */
export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'cache-control', 'no-store')
  const body = await readBody<{ cookie?: string }>(event)
  const cookie = trimYouTubeCookie(String(body?.cookie ?? '').slice(0, 16_000))
  if (!/(?:^|;\s*)(?:SAPISID|__Secure-3PAPISID)=/.test(cookie)) {
    throw createError({ statusCode: 400, statusMessage: 'That cookie has no YouTube sign-in (SAPISID) in it' })
  }
  const account = await authStore.run({ cookie }, () => accountInfo()).catch(() => null)
  if (!account) throw createError({ statusCode: 401, statusMessage: 'YouTube didn\'t accept this cookie. Copy it again from music.youtube.com while signed in.' })
  return { cookie, account }
})
