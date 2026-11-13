/** Open an album (MPRE…), playlist (VL…/PL…/RD…), artist (UC…) or mix. */
export default defineEventHandler(event => withAuth(event, async () => {
  const { id, queue, title, subtitle, thumbnail } = getQuery(event) as Record<string, string | undefined>
  if (!id || !/^[\w-]{2,80}$/.test(id)) throw createError({ statusCode: 400, statusMessage: 'Bad id' })
  const isQueue = queue === '1'
  const browseId = !isQueue && /^(PL|OLAK|RD)/.test(id) ? `VL${id}` : id
  edgeCache(event, 3600)
  const page = await collection({ id: browseId, isQueue, title, subtitle, thumbnail }, regionOf(event))
  return { ...page, songs: filterSongs(page.songs), sections: filterSections(page.sections) }
}))
