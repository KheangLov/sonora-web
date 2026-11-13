export default defineEventHandler(async (event) => {
  const q = String(getQuery(event).q ?? '').trim().slice(0, 100)
  if (!q || isBlockedQuery(q)) return []
  edgeCache(event, 86400)
  const list = await suggestions(q, regionOf(event)).catch(() => [])
  return list.filter(s => !isBlockedQuery(s))
})
