export default defineEventHandler(async (event) => {
  const { q, next } = getQuery(event) as { q?: string, next?: string }
  const gl = regionOf(event)
  if (next) {
    edgeCache(event, 3600)
    return moreResults(next, gl)
  }
  const query = (q ?? '').trim().slice(0, 200)
  if (!query) throw createError({ statusCode: 400, statusMessage: 'Missing q' })
  edgeCache(event, 3600)
  return startSearch(query, gl)
})
