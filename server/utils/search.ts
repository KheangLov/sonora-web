/**
 * Search = YouTube Music "Songs" + regular music "Videos", side by side, re-ranked for a
 * music app (port of SearchRanker.kt): word coverage first, then clean audio sources,
 * then YouTube's own order. Covers, remixes, reactions, live and shorts are pushed down
 * unless you asked for them. Thai content and repeats are removed.
 */
import type { SearchPage, Song } from '#shared/types/music'

interface Cursor { q: string, s: string | null, v: string | null, o: number, seen: string[] }

const enc = (c: Cursor) => Buffer.from(JSON.stringify(c)).toString('base64url')
const dec = (s: string): Cursor => JSON.parse(Buffer.from(s, 'base64url').toString())

export async function startSearch(query: string, gl?: string): Promise<SearchPage> {
  if (isBlockedQuery(query)) return { songs: [], next: null, blocked: true }
  const [songsR, videosR] = await Promise.all([
    searchMusic(query, FILTER_SONGS, gl).catch(() => null),
    searchMusic(query, FILTER_VIDEOS, gl).catch(() => null),
  ])
  if (!songsR && !videosR) throw createError({ statusCode: 502, statusMessage: 'Search failed' })

  const songs = shelfSongs(songsR)
  const videos = shelfSongs(videosR)
  const cursor: Cursor = { q: query, s: shelfToken(songsR), v: shelfToken(videosR), o: 0, seen: [] }
  const ranked = rank(cursor, songs, videos)

  const spelling = spellingOf(songsR ?? videosR)
  return {
    songs: ranked,
    next: cursor.s || cursor.v ? enc(cursor) : null,
    correctedTo: spelling.corrected,
    didYouMean: spelling.didYouMean,
  }
}

export async function moreResults(token: string, gl?: string): Promise<SearchPage> {
  const cursor = dec(token)
  const [songsR, videosR] = await Promise.all([
    cursor.s ? ytmContinuation(cursor.s, 'search', { gl }).catch(() => null) : null,
    cursor.v ? ytmContinuation(cursor.v, 'search', { gl }).catch(() => null) : null,
  ])
  cursor.s = songsR ? shelfToken(songsR) : null
  cursor.v = videosR ? shelfToken(videosR) : null
  const ranked = rank(cursor, shelfSongs(songsR), shelfSongs(videosR))
  return { songs: ranked, next: cursor.s || cursor.v ? enc(cursor) : null }
}

function shelfSongs(r: any): Song[] {
  if (!r) return []
  const out = new Map<string, Song>()
  collectSongs(r, out)
  return [...out.values()]
}

function shelfToken(r: any): string | null {
  if (!r) return null
  const shelf = findFirstOf(r, ['musicShelfRenderer', 'musicShelfContinuation'])
  return findContinuation(shelf ?? r)
}

function spellingOf(r: any): { corrected: string | null, didYouMean: string | null } {
  const showing = findFirstOf(r, ['showingResultsForRenderer'])
  const dym = findFirstOf(r, ['didYouMeanRenderer'])
  return {
    corrected: showing ? text(showing.correctedQuery) || null : null,
    didYouMean: dym ? text(dym.correctedQuery) || null : null,
  }
}

// ------------------------------------------------------------------ ranking

const AUDIO_HINTS = ['official audio', 'audio', 'lyrics', 'lyric video']
const VIDEO_HINTS = ['official music video', 'official video', 'official mv', ' mv']
const VARIANT_WORDS = ['cover', 'remix', 'karaoke', 'instrumental', 'slowed', 'reverb', 'sped up', '8d', 'nightcore', 'live', 'acoustic', 'piano']
const JUNK_WORDS = ['reaction', 'reacts', 'tutorial', 'how to play', 'behind the scenes', 'interview', 'trailer', 'teaser']
const LONG_WORDS = ['mix', 'playlist', 'full album', 'nonstop', 'non stop', 'compilation', 'hour', 'megamix', 'medley']
const WORD = /[\p{L}\p{N}\p{M}]+/gu
const MIN_SCORE = -40

const normalize = (s: string) => s.normalize('NFKC').toLowerCase().replace(/’/g, '\'').replace(/\s+/g, ' ').trim()
const words = (s: string): string[] => s.match(WORD) ?? []
const tokenize = (s: string) => [...new Set(words(s).filter(t => t.length > 1 || [...t].some(c => c.codePointAt(0)! > 0x2FF)))]
const containsWord = (s: string, w: string) => w.includes(' ') ? s.includes(w) : words(s).includes(w)

export function dedupeKey(song: Song): string {
  const title = normalize(song.title).replace(/[([].*?[)\]]/g, '')
  return `${tokenize(title).join(' ')}|${normalize(song.artist)}`
}

/** Short, stable hash so the cursor stays small enough for a URL. */
function hash(s: string): string {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0
  return `k${(h >>> 0).toString(36)}`
}

function rank(cursor: Cursor, songs: Song[], videos: Song[]): Song[] {
  const q = normalize(cursor.q)
  const tokens = tokenize(q)
  const wantsVariant = new Set(VARIANT_WORDS.filter(w => tokens.includes(w) || q.includes(w)))
  const wantsLong = LONG_WORDS.some(w => q.includes(w))

  const score = (s: Song, position: number, isMusicSong: boolean) => {
    const title = normalize(s.title)
    const artist = normalize(s.artist)
    const hay = `${title} ${artist}`
    let sc = 0
    if (tokens.length) {
      const hits = tokens.filter(t => hay.includes(t)).length
      sc += 60 * hits / tokens.length
      if (hits === 0) sc -= 30
    }
    if (q.length >= 3 && title.includes(q)) sc += 25
    if (q.length >= 3 && hay.includes(q)) sc += 8
    if (artist.length >= 3 && q.includes(artist)) sc += 15
    if (title === q) sc += 10
    if (isMusicSong) sc += 20
    else {
      if (AUDIO_HINTS.some(h => title.includes(h))) sc += 5
      if (VIDEO_HINTS.some(h => title.includes(h))) sc += 3
    }
    if (s.duration > 0 && s.duration < 60) sc -= 45
    if (s.duration > 20 * 60 && !wantsLong) sc -= 18
    for (const w of VARIANT_WORDS) if (!wantsVariant.has(w) && containsWord(title, w)) sc -= 12
    for (const w of JUNK_WORDS) if (containsWord(title, w) && !q.includes(w)) sc -= 25
    sc -= position * 0.6
    return sc
  }

  const scored = [
    ...songs.map((s, i) => [score(s, i + cursor.o, true), s] as const),
    ...videos.map((s, i) => [score(s, i + cursor.o, false), s] as const),
  ]
  cursor.o += Math.max(songs.length, videos.length)
  const seen = new Set(cursor.seen)
  const out: Song[] = []
  for (const [sc, s] of scored.filter(x => x[0] > MIN_SCORE).sort((a, b) => b[0] - a[0])) {
    if (isBlockedSong(s)) continue
    const key = hash(dedupeKey(s))
    if (seen.has(s.id) || seen.has(key)) continue
    seen.add(s.id).add(key)
    out.push(s)
  }
  // Keep the cursor small: only the most recent keys matter for de-duplication.
  cursor.seen = [...seen].slice(-200)
  return out
}
