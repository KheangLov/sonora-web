import { reactive } from 'vue'
import type { Song } from '#shared/types/music'
import { db } from '~/utils/db'

/**
 * Download for offline: the audio is fetched in 2 MB ranges through /api/stream and stored
 * in IndexedDB. Downloaded songs play with no connection at all.
 */
const progress = reactive(new Map<string, number>()) // id -> 0..100, present while downloading
const failed = reactive(new Set<string>())
const pending: Song[] = []
let active = 0
const MAX_PARALLEL = 2
const CHUNK = 2 * 1024 * 1024

async function fetchAll(song: Song): Promise<{ blob: Blob, mime: string }> {
  const parts: ArrayBuffer[] = []
  let start = 0
  let total = Infinity
  let mime = 'audio/mp4'
  while (start < total) {
    let res: Response | null = null
    for (let attempt = 0; attempt < 3 && !res?.ok; attempt++) {
      res = await fetch(`/api/stream/${song.id}`, { headers: { range: `bytes=${start}-${start + CHUNK - 1}` } }).catch(() => null)
      if (res?.status === 503) throw new Error('bot-check')
    }
    if (!res?.ok) throw new Error(`HTTP ${res?.status}`)
    mime = res.headers.get('content-type') ?? mime
    const range = res.headers.get('content-range')
    if (range) total = Number(range.split('/')[1]) || total
    const buf = await res.arrayBuffer()
    if (!buf.byteLength) break
    parts.push(buf)
    start += buf.byteLength
    if (!range) break
    if (Number.isFinite(total)) progress.set(song.id, Math.min(99, Math.round(start / total * 100)))
  }
  return { blob: new Blob(parts, { type: mime }), mime }
}

async function pump() {
  while (active < MAX_PARALLEL && pending.length) {
    const song = pending.shift()!
    active++
    run(song).finally(() => { active--; pump() })
  }
}

async function run(song: Song) {
  const lib = useLibrary()
  try {
    progress.set(song.id, 0)
    const { blob, mime } = await fetchAll(song)
    await (await db()).put('audio', { id: song.id, blob, mime, size: blob.size })
    await lib.setDownloaded(song, blob.size)
    failed.delete(song.id)
  }
  catch (e: any) {
    failed.add(song.id)
    useToast().show(e?.message === 'bot-check'
      ? 'Downloads are paused — YouTube is limiting the server. Try again later.'
      : `Download failed: ${song.title}`)
  }
  finally {
    progress.delete(song.id)
  }
}

export function useDownloads() {
  return {
    progress,
    failed,
    isDownloading: (id: string) => progress.has(id) || pending.some(s => s.id === id),
    download(song: Song) {
      if (useLibrary().isDownloaded(song.id) || progress.has(song.id) || pending.some(s => s.id === song.id)) return
      // Ask the browser to keep our storage even when space runs low.
      navigator.storage?.persist?.().catch(() => {})
      pending.push(song)
      progress.set(song.id, 0)
      pump()
    },
    downloadAll(songs: Song[]) {
      let n = 0
      for (const s of songs) {
        if (!useLibrary().isDownloaded(s.id) && !progress.has(s.id)) { n++; this.download(s) }
      }
      useToast().show(n ? `Downloading ${n} songs` : 'Everything is already downloaded')
    },
    async remove(id: string) {
      const i = pending.findIndex(s => s.id === id)
      if (i >= 0) pending.splice(i, 1)
      progress.delete(id)
      await (await db()).delete('audio', id)
      await useLibrary().clearDownloaded(id)
    },
    async usage(): Promise<{ used: number, quota: number } | null> {
      const est = await navigator.storage?.estimate?.()
      return est ? { used: est.usage ?? 0, quota: est.quota ?? 0 } : null
    },
  }
}
