/** Step 1 of "Sign in with Google": get a short code for google.com/device. */
export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'cache-control', 'no-store')
  return startDeviceFlow()
})
