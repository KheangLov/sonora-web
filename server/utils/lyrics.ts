import type { LyricLine, LyricsResult } from '#shared/types/music'

const LRCLIB = 'https://lrclib.net'
const UA = 'Sonora Web (https://github.com/KheangLov/sonora-web)'

interface LrcItem { trackName?: string, artistName?: string, duration?: number, syncedLyrics?: string | null, plainLyrics?: string | null }

async function lrclib<T>(path: string, params: Record<string, string>): Promise<T | null> {
  const url = `${LRCLIB}${path}?${new URLSearchParams(params)}`
  const res = await fetch(url, { headers: { 'user-agent': UA } }).catch(() => null)
  if (!res?.ok) return null
  return res.json() as Promise<T>
}

const has = (x: LrcItem | null | undefined) => !!(x?.syncedLyrics || x?.plainLyrics)

export async function findLyrics(id: string, rawTitle: string, rawArtist: string, duration: number): Promise<LyricsResult | null> {
  const title = cleanTitle(rawTitle)
  const artist = cleanArtist(rawArtist, rawTitle)

  if (title) {
    const exact = await lrclib<LrcItem>('/api/get', {
      track_name: title,
      artist_name: artist,
      ...(duration > 0 ? { duration: String(Math.round(duration)) } : {}),
    })
    if (has(exact)) return toResult(exact!)

    const attempts: Record<string, string>[] = [{ track_name: title, artist_name: artist }, { q: `${title} ${artist}`.trim() }, { q: title }]
    for (const params of attempts) {
      const list = await lrclib<LrcItem[]>('/api/search', params)
      const candidates = (list ?? []).filter(has)
        .filter(c => duration <= 0 || !c.duration || Math.abs(c.duration - duration) <= 4)
      const best = candidates.sort((a, b) => score(b) - score(a))[0]
      if (best) return toResult(best)
    }
  }

  function score(c: LrcItem) {
    let s = 0
    if (c.syncedLyrics) s += 10
    if (c.artistName?.toLowerCase() === artist.toLowerCase()) s += 5
    if (c.trackName?.toLowerCase() === title.toLowerCase()) s += 5
    if (duration > 0 && c.duration) s -= Math.abs(c.duration - duration)
    return s
  }

  const yt = await ytLyrics(id).catch(() => null)
  if (yt) return { synced: [], plain: yt, source: 'YouTube Music' }
  return null
}

function toResult(x: LrcItem): LyricsResult {
  const synced = x.syncedLyrics ? parseLrc(x.syncedLyrics) : []
  return { synced, plain: x.plainLyrics || (synced.length ? synced.map(l => l.text).join('\n') : null), source: 'LRCLIB' }
}

const TAG = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?]/g

export function parseLrc(lrc: string): LyricLine[] {
  const out: LyricLine[] = []
  for (const raw of lrc.split(/\r?\n/)) {
    const tags = [...raw.matchAll(TAG)]
    if (!tags.length) continue
    const last = tags[tags.length - 1]!
    const text = raw.slice(last.index! + last[0].length).trim()
    for (const m of tags) {
      const frac = m[3] ?? ''
      const ms = frac.length === 0 ? 0 : frac.length === 1 ? +frac * 100 : frac.length === 2 ? +frac * 10 : +frac.slice(0, 3)
      out.push({ time: +m[1]! * 60_000 + +m[2]! * 1000 + ms, text })
    }
  }
  return out.sort((a, b) => a.time - b.time)
}

const NOISE = /\s*[([][^)\]]*(official|video|audio|lyric|lyrics|visualizer|mv|m\/v|hd|4k|remaster|live|explicit|clean|prod\.)[^)\]]*[)\]]/gi
const FEAT = /\s*[([]?\s*(feat\.?|ft\.?|featuring)\s.*$/i

export function cleanTitle(title: string): string {
  let t = title.replace(NOISE, '')
  if (t.includes(' - ')) t = t.slice(t.indexOf(' - ') + 3)
  t = t.replace(FEAT, '')
  return t.replace(/\s+/g, ' ').trim().replace(/^[-| ]+|[-| ]+$/g, '')
}

export function cleanArtist(artist: string, title: string): string {
  let a = artist.replace(/ - Topic$/, '').replace(/VEVO$/, '').trim()
  if (title.includes(' - ') && (!a || /records|music/i.test(a))) a = title.slice(0, title.indexOf(' - '))
  return a.split(/,|&| x | X | feat| ft\./)[0]!.trim()
}
