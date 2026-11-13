/** Open an album (MPRE…), playlist (VL…/PL…/RD…), artist (UC…) or mix. */
export default defineEventHandler(event => withAuth(event, async (auth) => {
  const { id, queue, title, subtitle, thumbnail } = getQuery(event) as Record<string, string | undefined>
  if (!id || !/^[\w-]{2,80}$/.test(id)) throw createError({ statusCode: 400, statusMessage: 'Bad id' })
  const isQueue = queue === '1'
  const browseId = !isQueue && /^(PL|OLAK|RD)/.test(id) ? `VL${id}` : id
  // One-click Google accounts: your likes and playlists (private ones too) via the YouTube Data API.
  if (auth?.via === 'web' && browseId.startsWith('VL') && !browseId.startsWith('VLRD')) {
    const page = browseId === 'VLLM'
      ? { title: 'Liked music', thumbnail: '', songs: await dataLiked() }
      : await dataPlaylist(browseId.slice(2)).catch(() => null)
    if (page) return { title: page.title, subtitle: '', thumbnail: page.thumbnail || page.songs[0]?.thumbnail || '', songs: filterSongs(page.songs), sections: [] }
  }
  edgeCache(event, 3600)
  const page = await collection({ id: browseId, isQueue, title, subtitle, thumbnail }, regionOf(event))
  return { ...page, songs: filterSongs(page.songs), sections: filterSections(page.sections) }
}))
