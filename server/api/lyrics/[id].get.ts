export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') ?? ''
  if (!/^[\w-]{11}$/.test(id)) throw createError({ statusCode: 400, statusMessage: 'Bad id' })
  const { title = '', artist = '', duration = '0' } = getQuery(event) as Record<string, string>
  const result = await findLyrics(id, title, artist, Number(duration) || 0)
  edgeCache(event, result ? 7 * 86400 : 86400)
  return result ?? { synced: [], plain: null, source: 'none' }
})
