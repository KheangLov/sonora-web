/** "Radio" for a song: YouTube Music's automix queue. Powers endless autoplay. */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') ?? ''
  if (!/^[\w-]{11}$/.test(id)) throw createError({ statusCode: 400, statusMessage: 'Bad id' })
  edgeCache(event, 6 * 3600)
  return filterSongs(await radio(id, regionOf(event)))
})
