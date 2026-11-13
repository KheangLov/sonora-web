/** Which sign-in options this server offers. */
export default defineEventHandler((event) => {
  setResponseHeader(event, 'cache-control', 'public, max-age=60, s-maxage=300')
  return { google: !!webClient() }
})
