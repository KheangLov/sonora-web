/**
 * Minimal YouTube Music (InnerTube WEB_REMIX) client: search, suggestions, home feed,
 * radio queues, albums / playlists / artists and lyrics. Raw JSON + a forgiving
 * tree walker, so small layout changes on YouTube's side don't break it.
 * Port of data/youtube/YtMusicApi.kt from the Android app.
 */
import type { Collection, HomeSection, Song } from '#shared/types/music'

const ORIGIN = 'https://music.youtube.com'
const CLIENT_VERSION = '1.20251110.01.00'
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36'

/** Search filter params (YouTube Music "Songs" / "Videos" chips). */
export const FILTER_SONGS = 'EgWKAQIIAWoMEA4QChADEAQQCRAF'
export const FILTER_VIDEOS = 'EgWKAQIQAWoMEA4QChADEAQQCRAF'

type J = Record<string, any>

export async function ytm(endpoint: string, body: J, opts: { gl?: string, hl?: string, query?: string } = {}): Promise<J> {
  const payload = {
    ...body,
    context: {
      client: {
        clientName: 'WEB_REMIX',
        clientVersion: CLIENT_VERSION,
        hl: opts.hl || 'en',
        gl: opts.gl || 'US',
      },
    },
  }
  const res = await fetch(`${ORIGIN}/youtubei/v1/${endpoint}?prettyPrint=false${opts.query ?? ''}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'user-agent': UA,
      'origin': ORIGIN,
      'x-origin': ORIGIN,
      'referer': `${ORIGIN}/`,
      'x-youtube-client-name': '67',
      'x-youtube-client-version': CLIENT_VERSION,
      // Signed in (see server/utils/auth.ts): your personal YouTube Music.
      ...authHeaders(authStore.getStore(), ORIGIN),
    },
    body: JSON.stringify(payload),
  })
  if (res.status === 401 || res.status === 403) {
    if (authStore.getStore()) throw createError({ statusCode: 401, statusMessage: 'YouTube sign-in expired' })
  }
  if (!res.ok) throw createError({ statusCode: 502, statusMessage: `YouTube Music HTTP ${res.status}` })
  return res.json()
}

export function ytmContinuation(token: string, endpoint = 'browse', opts: { gl?: string, hl?: string } = {}) {
  const t = encodeURIComponent(token)
  return ytm(endpoint, { continuation: token }, { ...opts, query: `&ctoken=${t}&continuation=${t}&type=next` })
}

// ------------------------------------------------------------------ public API

export async function searchMusic(query: string, params: string, gl?: string) {
  return ytm('search', { query, params }, { gl })
}

export async function suggestions(input: string, gl?: string): Promise<string[]> {
  const r = await ytm('music/get_search_suggestions', { input }, { gl })
  return findAllOf(r, ['searchSuggestionRenderer'])
    .map(([, o]) => text(o.suggestion))
    .filter(Boolean)
    .slice(0, 8)
}

export async function homeFeed(gl?: string): Promise<HomeSection[]> {
  let r = await ytm('browse', { browseId: 'FEmusic_home' }, { gl })
  const sections = parseShelves(r)
  for (let i = 0; i < 2; i++) {
    const token = findContinuation(r)
    if (!token) break
    r = await ytmContinuation(token, 'browse', { gl })
    sections.push(...parseShelves(r))
  }
  return sections.filter(s => s.songs.length || s.collections.length)
}

/** YouTube Music radio for a song ("Up next" / automix). */
export async function radio(videoId: string, gl?: string): Promise<Song[]> {
  const r = await ytm('next', {
    videoId,
    playlistId: `RDAMVM${videoId}`,
    enablePersistentPlaylistPanel: true,
    isAudioOnly: true,
    tunerSettingValue: 'AUTOMIX_SETTING_NORMAL',
  }, { gl })
  const out = new Map<string, Song>()
  collectSongs(r, out)
  return [...out.values()]
}

export interface CollectionPage {
  title: string
  subtitle: string
  thumbnail: string
  songs: Song[]
  sections: HomeSection[]
}

export async function collection(c: Pick<Collection, 'id' | 'isQueue'> & Partial<Collection>, gl?: string, maxPages = 8): Promise<CollectionPage> {
  const out = new Map<string, Song>()
  if (c.isQueue) {
    const r = await ytm('next', { playlistId: c.id, enablePersistentPlaylistPanel: true, isAudioOnly: true }, { gl })
    collectSongs(r, out)
    return { title: c.title ?? 'Mix', subtitle: c.subtitle ?? '', thumbnail: c.thumbnail ?? '', songs: [...out.values()], sections: [] }
  }

  const first = await ytm('browse', { browseId: c.id }, { gl })
  let r = first
  const header = findFirstOf(r, ['musicResponsiveHeaderRenderer', 'musicDetailHeaderRenderer', 'musicImmersiveHeaderRenderer', 'musicVisualHeaderRenderer', 'musicEditablePlaylistDetailHeaderRenderer'])
  const title = text(header?.title) || c.title || ''
  const subtitle = [text(header?.subtitle), text(header?.straplineTextOne), text(header?.secondSubtitle)].filter(Boolean).join(' • ') || c.subtitle || ''
  const thumbnail = upscale(lastThumb(findFirstOf(header, ['musicThumbnailRenderer'])?.thumbnail ?? header?.thumbnail?.croppedSquareThumbnailRenderer?.thumbnail)) || c.thumbnail || ''

  // Main track list (playlist / album / artist "Top songs"); carousels become sections.
  const mainShelf = findFirstOf(r, ['musicPlaylistShelfRenderer', 'musicShelfRenderer'])
  if (mainShelf) collectSongs(mainShelf, out)
  let token = mainShelf ? findContinuation(mainShelf) : null
  let pages = 0
  while (token && pages++ < maxPages) {
    r = await ytmContinuation(token, 'browse', { gl })
    const before = out.size
    collectSongs(r, out)
    if (out.size === before) break
    token = findContinuation(r)
  }
  const sections = c.id.startsWith('UC') || c.id.startsWith('MPLA') ? parseShelves(first) : []

  const fallbackArtist = subtitle.split(' • ').find(s => s && !TYPE_WORDS.has(s) && !/^\d{4}$/.test(s)) ?? ''
  const songs = [...out.values()].map(s => ({
    ...s,
    thumbnail: s.thumbnail || thumbnail,
    artist: s.artist || fallbackArtist,
  }))
  return { title, subtitle, thumbnail, songs, sections }
}

// ------------------------------------------------------------------ signed in

export interface AccountInfo { name: string | null, handle: string | null, photo: string | null }

/** Name and photo of the signed-in account (call inside withAuth). */
export async function accountInfo(): Promise<AccountInfo> {
  const r = await ytm('account/account_menu', {})
  const h = findFirstOf(r, ['activeAccountHeaderRenderer'])
  if (!h) throw createError({ statusCode: 401, statusMessage: 'Not signed in' })
  return {
    name: text(h.accountName) || null,
    handle: text(h.channelHandle) || text(h.email) || null,
    photo: upscale(lastThumb(h.accountPhoto)) || null,
  }
}

/** Playlists in your YouTube Music library (call inside withAuth). */
export async function libraryPlaylists(): Promise<Collection[]> {
  const r = await ytm('browse', { browseId: 'FEmusic_liked_playlists' })
  const out = new Map<string, Collection>()
  for (const [key, o] of findAllOf(r, ['musicTwoRowItemRenderer', 'musicResponsiveListItemRenderer'])) {
    const c = key === 'musicTwoRowItemRenderer' ? parseTwoRow(o) : parseResponsive(o)
    if (c && 'isQueue' in c && c.id.startsWith('VL') && c.id !== 'VLLM' && !out.has(c.id)) out.set(c.id, c)
  }
  return [...out.values()]
}

/** Plain lyrics from YouTube Music's "Lyrics" tab. */
export async function ytLyrics(videoId: string): Promise<string | null> {
  const next = await ytm('next', { videoId, isAudioOnly: true })
  const browseId = findAllOf(next, ['browseEndpoint'])
    .map(([, o]) => o.browseId as string)
    .find(id => id?.startsWith('MPLY'))
  if (!browseId) return null
  const page = await ytm('browse', { browseId })
  const shelf = findFirstOf(page, ['musicDescriptionShelfRenderer'])
  return text(shelf?.description) || null
}

// ------------------------------------------------------------------ parsing

export function parseShelves(response: J): HomeSection[] {
  return findAllOf(response, ['musicCarouselShelfRenderer', 'musicImmersiveCarouselShelfRenderer']).map(([, shelf]) => {
    const header = shelf.header?.musicCarouselShelfBasicHeaderRenderer ?? shelf.header?.musicImmersiveHeaderRenderer
    const songs: Song[] = []
    const collections: Collection[] = []
    for (const entry of shelf.contents ?? []) {
      const parsed = entry.musicResponsiveListItemRenderer
        ? parseResponsive(entry.musicResponsiveListItemRenderer)
        : entry.musicTwoRowItemRenderer ? parseTwoRow(entry.musicTwoRowItemRenderer) : null
      if (!parsed) continue
      if ('duration' in parsed) songs.push(parsed)
      else collections.push(parsed)
    }
    return {
      title: text(header?.title) || 'For you',
      subtitle: text(header?.strapline) || undefined,
      songs: dedupe(songs),
      collections: dedupe(collections),
    }
  })
}

export function collectSongs(node: unknown, out: Map<string, Song>) {
  for (const [key, obj] of findAllOf(node, ['musicResponsiveListItemRenderer', 'playlistPanelVideoRenderer'])) {
    const s = key === 'playlistPanelVideoRenderer' ? parsePanelVideo(obj) : parseResponsive(obj)
    if (s && 'duration' in s && !out.has(s.id)) out.set(s.id, s)
  }
}

/** A list row: usually a song, sometimes an album / playlist / artist link. */
export function parseResponsive(r: J): Song | Collection | null {
  const col = (i: number) => r.flexColumns?.[i]?.musicResponsiveListItemFlexColumnRenderer?.text
  const title = text(col(0))
  const subRuns = [...runs(col(1)), ...runs(col(2))]
  const thumb = upscale(lastThumb(r.thumbnail?.musicThumbnailRenderer?.thumbnail))
  const videoId: string = r.playlistItemData?.videoId
    || findString(r.overlay, 'videoId')
    || findString(col(0), 'videoId')
    || ''

  if (!videoId) {
    const browseId: string = r.navigationEndpoint?.browseEndpoint?.browseId ?? ''
    if (!browseId || !title) return null
    return { id: browseId, isQueue: false, title, subtitle: subRuns.map(x => x.text).join(''), thumbnail: thumb }
  }
  if (!title) return null
  const fixed = r.fixedColumns?.[0]?.musicResponsiveListItemFixedColumnRenderer?.text
  const duration = parseDuration(text(fixed)) || subRuns.map(x => parseDuration(x.text)).find(d => d > 0) || 0
  return { id: videoId, title, artist: artistFrom(subRuns), album: albumFrom(subRuns), thumbnail: thumb || ytThumb(videoId), duration }
}

/** A card: a song / video, or a playlist / album / artist / mix. */
export function parseTwoRow(r: J): Song | Collection | null {
  const title = text(r.title)
  if (!title) return null
  const subRuns = runs(r.subtitle)
  const subtitle = subRuns.map(x => x.text).join('')
  const thumb = upscale(lastThumb(r.thumbnailRenderer?.musicThumbnailRenderer?.thumbnail))
  const nav = r.navigationEndpoint
  const vid = nav?.watchEndpoint?.videoId
  if (vid) return { id: vid, title, artist: artistFrom(subRuns), thumbnail: thumb || ytThumb(vid), duration: 0 }
  const pl = nav?.watchPlaylistEndpoint?.playlistId
  if (pl) return { id: pl, isQueue: true, title, subtitle, thumbnail: thumb }
  const browse = nav?.browseEndpoint?.browseId
  if (browse) return { id: browse, isQueue: false, title, subtitle, thumbnail: thumb }
  return null
}

function parsePanelVideo(r: J): Song | null {
  const id = r.videoId
  if (!id) return null
  const byline = runs(r.longBylineText).length ? runs(r.longBylineText) : runs(r.shortBylineText)
  return {
    id,
    title: text(r.title),
    artist: artistFrom(byline),
    album: albumFrom(byline),
    thumbnail: upscale(lastThumb(r.thumbnail)) || ytThumb(id),
    duration: parseDuration(text(r.lengthText)),
  }
}

const TYPE_WORDS = new Set(['Song', 'Video', 'Episode', 'Single', 'Album', 'EP', 'Playlist', 'Artist', 'Podcast', 'Profile'])
const NOISE = /^(\d[\d.,]*\s*[KMB]?\s*(views|plays|subscribers|songs|tracks|monthly audience)|\d+:\d{2}(:\d{2})?|\d{4})$/i

function pageType(run: J): string | undefined {
  return run?.navigationEndpoint?.browseEndpoint?.browseEndpointContextSupportedConfigs
    ?.browseEndpointContextMusicConfig?.pageType
}

function artistFrom(rs: J[]): string {
  const artists = rs.filter(x => ['MUSIC_PAGE_TYPE_ARTIST', 'MUSIC_PAGE_TYPE_USER_CHANNEL'].includes(pageType(x) ?? ''))
  if (artists.length) return artists.map(x => x.text).join(', ')
  return rs.map(x => String(x.text ?? '').trim())
    .find(t => t && t !== '•' && t !== '&' && t !== ',' && !TYPE_WORDS.has(t) && !NOISE.test(t)) ?? ''
}

function albumFrom(rs: J[]): string | undefined {
  return rs.find(x => pageType(x) === 'MUSIC_PAGE_TYPE_ALBUM')?.text
}

// ------------------------------------------------------------------ json helpers

export function runs(o: J | undefined): J[] {
  return Array.isArray(o?.runs) ? o!.runs : []
}

export function text(o: J | undefined): string {
  if (!o) return ''
  if (typeof o.simpleText === 'string') return o.simpleText
  return runs(o).map(x => x.text ?? '').join('')
}

function lastThumb(o: J | undefined): string {
  const arr = o?.thumbnails
  return Array.isArray(arr) && arr.length ? arr[arr.length - 1].url ?? '' : ''
}

export function upscale(url: string): string {
  if (!url) return url
  if (url.startsWith('//')) url = `https:${url}`
  if (url.includes('googleusercontent.com') || url.includes('ggpht.com')) {
    return url.replace(/=w\d+-h\d+[^&?]*/, '=w544-h544-l90-rj')
  }
  return url
}

export const ytThumb = (id: string) => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`

export function parseDuration(s: string | undefined): number {
  const parts = (s ?? '').trim().split(':')
  if (parts.length < 2 || parts.length > 3 || parts.some(p => !/^\d+$/.test(p))) return 0
  return parts.reduce((acc, p) => acc * 60 + Number(p), 0)
}

/** All objects stored under any of [keys], in document order. */
export function findAllOf(node: unknown, keys: string[]): [string, J][] {
  const set = new Set(keys)
  const out: [string, J][] = []
  const walk = (n: unknown) => {
    if (Array.isArray(n)) { for (const v of n) walk(v); return }
    if (n && typeof n === 'object') {
      for (const [k, v] of Object.entries(n)) {
        if (set.has(k) && v && typeof v === 'object' && !Array.isArray(v)) out.push([k, v as J])
        else walk(v)
      }
    }
  }
  walk(node)
  return out
}

export function findFirstOf(node: unknown, keys: string[]): J | undefined {
  return findAllOf(node, keys)[0]?.[1]
}

function findString(node: unknown, key: string): string {
  if (Array.isArray(node)) {
    for (const v of node) { const s = findString(v, key); if (s) return s }
  }
  else if (node && typeof node === 'object') {
    const v = (node as J)[key]
    if (typeof v === 'string' && v) return v
    for (const child of Object.values(node)) { const s = findString(child, key); if (s) return s }
  }
  return ''
}

export function findContinuation(node: unknown): string | null {
  return findFirstOf(node, ['nextContinuationData'])?.continuation
    || findFirstOf(node, ['continuationCommand'])?.token
    || null
}

function dedupe<T extends { id: string }>(xs: T[]): T[] {
  const seen = new Set<string>()
  return xs.filter(x => !seen.has(x.id) && !!seen.add(x.id))
}
