import type { Song } from '#shared/types/music'

/**
 * Other uploads of the same song (official video, lyric video, audio upload), for when the
 * embedded player refuses an id: YouTube Music's "Topic" art tracks are often not embeddable.
 * Ranked by how well title, artist and length match.
 */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') ?? ''
  const q = getQuery(event) as { title?: string, artist?: string, duration?: string }
  const title = String(q.title ?? '').trim().slice(0, 150)
  const artist = String(q.artist ?? '').trim().slice(0, 100)
  const duration = Number(q.duration) || 0
  if (!/^[\w-]{11}$/.test(id) || !title) throw createError({ statusCode: 400, statusMessage: 'Bad request' })

  const norm = (s: string) => s.toLowerCase().normalize('NFKC').replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
  const words = norm(title).split(' ').filter(w => w.length > 1)
  const firstArtist = norm(artist.split(/,|&| x | feat/i)[0] ?? '')

  const raw = await searchMusic(`${title} ${artist}`.trim(), FILTER_VIDEOS, regionOf(event)).catch(() => null)
  const found = new Map<string, Song>()
  if (raw) collectSongs(raw, found)
  const scored = [...found.values()]
    .filter(s => s.id !== id && !isBlockedSong(s))
    .map((s) => {
      const t = norm(`${s.title} ${s.artist}`)
      let score = words.filter(w => t.includes(w)).length / Math.max(1, words.length) * 10
      if (firstArtist && t.includes(firstArtist)) score += 4
      if (duration && s.duration) {
        const diff = Math.abs(s.duration - duration)
        score += diff <= 3 ? 6 : diff <= 10 ? 3 : diff <= 25 ? 0 : -8
      }
      if (/\b(cover|karaoke|instrumental|remix|sped up|slowed|nightcore|reaction|live)\b/.test(t)
        && !/\b(cover|karaoke|instrumental|remix|sped up|slowed|nightcore|live)\b/.test(norm(title))) score -= 8
      return { s, score }
    })
    .filter(x => x.score >= 8)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)
    .map(x => x.s)
  edgeCache(event, 7 * 86400)
  return scored
})
