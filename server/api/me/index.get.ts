/** The signed-in account (name, handle, photo). 401 when not signed in or the sign-in expired. */
export default defineEventHandler(event => withAuth(event, async (auth) => {
  if (!auth) throw createError({ statusCode: 401, statusMessage: 'Not signed in' })
  return auth.via === 'web' ? dataProfile() : accountInfo()
}))
