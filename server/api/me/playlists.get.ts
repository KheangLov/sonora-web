/** Playlists saved in your YouTube Music library. */
export default defineEventHandler(event => withAuth(event, async (auth) => {
  if (!auth) throw createError({ statusCode: 401, statusMessage: 'Not signed in' })
  const list = await libraryPlaylists()
  return list.filter(c => !isBlockedCollection(c))
}))
