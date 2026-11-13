/**
 * YouTube Data API v3, for accounts signed in with one-click Google sign-in.
 * Liked music, your playlists and their songs; all official and well documented.
 * (Needs "YouTube Data API v3" enabled in the Google Cloud project of GOOGLE_CLIENT_ID.)
 */
import type { Collection, Song } from '#shared/types/music'

const API = 'https://www.googleapis.com/youtube/v3'
type J = Record<string, any>

async function get(path: string, params: Record<string, string>): Promise<J> {
  const auth = authStore.getStore()
  if (!auth?.bearer) throw createError({ statusCode: 401, statusMessage: 'Not signed in' })
  const res = await fetch(`${API}/${path}?${new URLSearchParams(params)}`, { headers: { authorization: `Bearer ${auth.bearer}` } })
  if (res.status === 401) throw createError({ statusCode: 401, statusMessage: 'Google sign-in expired' })
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as J
    const reason = body?.error?.errors?.[0]?.reason ?? body?.error?.message ?? res.status
    throw createError({
      statusCode: 502,
      statusMessage: reason === 'accessNotConfigured' || /has not been used|is disabled/i.test(String(body?.error?.message))
        ? 'Enable "YouTube Data API v3" in your Google Cloud project'
        : `YouTube Data API: ${reason}`,
    })
  }
  return res.json()
}

const isoSeconds = (d?: string) => {
  const m = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(d ?? '')
  return m ? (+(m[1] ?? 0) * 86400) + (+(m[2] ?? 0) * 3600) + (+(m[3] ?? 0) * 60) + +(m[4] ?? 0) : 0
}
const bestThumb = (t?: J) => (t?.maxres ?? t?.standard ?? t?.high ?? t?.medium ?? t?.default)?.url ?? ''
const cleanArtist = (s?: string) => (s ?? '').replace(/ - Topic$/, '').replace(/VEVO$/, '').trim()

function videoToSong(v: J): Song | null {
  const id = v.id
  if (typeof id !== 'string' || !v.snippet) return null
  return {
    id,
    title: v.snippet.title ?? '',
    artist: cleanArtist(v.snippet.channelTitle),
    thumbnail: bestThumb(v.snippet.thumbnails) || `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    duration: isoSeconds(v.contentDetails?.duration),
  }
}

/** Videos by id, in that order (50 per request). */
async function videos(ids: string[]): Promise<Song[]> {
  const out = new Map<string, Song>()
  for (let i = 0; i < ids.length; i += 50) {
    const r = await get('videos', { part: 'snippet,contentDetails', id: ids.slice(i, i + 50).join(','), maxResults: '50' })
    for (const v of r.items ?? []) { const s = videoToSong(v); if (s) out.set(s.id, s) }
  }
  return ids.map(id => out.get(id)).filter((s): s is Song => !!s)
}

/** Everything you've liked on YouTube / YouTube Music, newest first. */
export async function dataLiked(maxPages = 6): Promise<Song[]> {
  const songs: Song[] = []
  let pageToken = ''
  for (let p = 0; p < maxPages; p++) {
    const r = await get('videos', { part: 'snippet,contentDetails', myRating: 'like', maxResults: '50', ...(pageToken ? { pageToken } : {}) })
    for (const v of r.items ?? []) { const s = videoToSong(v); if (s) songs.push(s) }
    pageToken = r.nextPageToken ?? ''
    if (!pageToken) break
  }
  return songs
}

/** Your playlists (as browse links: VL + playlist id). */
export async function dataPlaylists(): Promise<Collection[]> {
  const out: Collection[] = []
  let pageToken = ''
  for (let p = 0; p < 4; p++) {
    const r = await get('playlists', { part: 'snippet,contentDetails', mine: 'true', maxResults: '50', ...(pageToken ? { pageToken } : {}) })
    for (const pl of r.items ?? []) {
      out.push({
        id: `VL${pl.id}`,
        isQueue: false,
        title: pl.snippet?.title ?? 'Playlist',
        subtitle: `Playlist • ${pl.contentDetails?.itemCount ?? 0} songs`,
        thumbnail: bestThumb(pl.snippet?.thumbnails),
      })
    }
    pageToken = r.nextPageToken ?? ''
    if (!pageToken) break
  }
  return out
}

/** Songs of a playlist (private ones too). */
export async function dataPlaylist(playlistId: string, maxPages = 6): Promise<{ title: string, thumbnail: string, songs: Song[] }> {
  const meta = await get('playlists', { part: 'snippet', id: playlistId })
  const pl = meta.items?.[0]
  const ids: string[] = []
  let pageToken = ''
  for (let p = 0; p < maxPages; p++) {
    const r = await get('playlistItems', { part: 'contentDetails', playlistId, maxResults: '50', ...(pageToken ? { pageToken } : {}) })
    for (const it of r.items ?? []) if (it.contentDetails?.videoId) ids.push(it.contentDetails.videoId)
    pageToken = r.nextPageToken ?? ''
    if (!pageToken) break
  }
  return { title: pl?.snippet?.title ?? 'Playlist', thumbnail: bestThumb(pl?.snippet?.thumbnails), songs: await videos(ids) }
}

/** Name and photo of the Google account. */
export async function dataProfile(): Promise<{ name: string | null, handle: string | null, photo: string | null }> {
  const auth = authStore.getStore()
  const res = await fetch('https://openidconnect.googleapis.com/v1/userinfo', { headers: { authorization: `Bearer ${auth?.bearer}` } })
  if (!res.ok) throw createError({ statusCode: 401, statusMessage: 'Google sign-in expired' })
  const u = await res.json() as J
  return { name: u.name ?? null, handle: u.email ?? null, photo: u.picture ?? null }
}
