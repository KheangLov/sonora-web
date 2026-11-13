import { computed, ref, shallowReactive } from 'vue'
import type { Song } from '#shared/types/music'
import { db, type Playlist, type PlaylistSong, type SongRecord } from '~/utils/db'

/**
 * Everything you own, stored in IndexedDB: likes, dislikes, history, playlists, searches, downloads.
 * Loaded into memory once (it's small), so every list is instant and works offline.
 * Changes are mirrored to other open tabs.
 */
const songs = shallowReactive(new Map<string, SongRecord>())
const playlists = ref<Playlist[]>([])
const playlistSongs = shallowReactive(new Map<number, PlaylistSong[]>())
const searches = ref<{ term: string, ts: number }[]>([])
const ready = ref(false)
let initPromise: Promise<void> | null = null
let channel: BroadcastChannel | null = null

const now = () => Date.now()
const meta = (s: Song): Song => ({ id: s.id, title: s.title, artist: s.artist, album: s.album, thumbnail: s.thumbnail, duration: s.duration })

async function loadAll() {
  const d = await db()
  const [allSongs, allPlaylists, allRefs, allSearches] = await Promise.all([
    d.getAll('songs'), d.getAll('playlists'), d.getAll('playlistSongs'), d.getAll('searches'),
  ])
  songs.clear()
  for (const s of allSongs) songs.set(s.id, s)
  playlists.value = allPlaylists.sort((a, b) => b.createdAt - a.createdAt)
  playlistSongs.clear()
  for (const r of allRefs) {
    const list = playlistSongs.get(r.playlistId) ?? []
    list.push(r)
    playlistSongs.set(r.playlistId, list)
  }
  for (const [k, v] of playlistSongs) playlistSongs.set(k, v.sort((a, b) => a.addedAt - b.addedAt))
  searches.value = allSearches.sort((a, b) => b.ts - a.ts)
}

function notify() {
  channel?.postMessage('changed')
}

async function put(rec: SongRecord) {
  songs.set(rec.id, rec)
  await (await db()).put('songs', rec)
  notify()
}

async function patch(song: Song, changes: Partial<SongRecord>) {
  const current = songs.get(song.id)
  const rec: SongRecord = { ...(current ?? {}), ...meta(song), ...changes }
  // Keep a known duration / artwork if the new copy doesn't have them.
  if (!song.duration && current?.duration) rec.duration = current.duration
  if (!song.thumbnail && current?.thumbnail) rec.thumbnail = current.thumbnail
  await put(rec)
  return rec
}

export function useLibrary() {
  if (import.meta.client && !initPromise) {
    initPromise = loadAll().then(() => { ready.value = true })
    try {
      channel = new BroadcastChannel('sonora-library')
      channel.onmessage = () => { loadAll() }
    }
    catch { /* old browsers */ }
  }

  const all = computed(() => [...songs.values()])
  const liked = computed(() => all.value.filter(s => s.liked && !s.disliked).sort((a, b) => (b.likedAt ?? 0) - (a.likedAt ?? 0)))
  const history = computed(() => all.value.filter(s => (s.lastPlayedAt ?? 0) > 0 && !s.disliked).sort((a, b) => b.lastPlayedAt! - a.lastPlayedAt!))
  const downloads = computed(() => all.value.filter(s => s.downloaded).sort((a, b) => (b.downloadedAt ?? 0) - (a.downloadedAt ?? 0)))
  const disliked = computed(() => all.value.filter(s => s.disliked).sort((a, b) => (b.dislikedAt ?? 0) - (a.dislikedAt ?? 0)))
  const dislikedIds = computed(() => new Set(disliked.value.map(s => s.id)))

  const playlistList = computed(() => playlists.value.map((p) => {
    const refs = playlistSongs.get(p.id) ?? []
    const cover = refs.map(r => songs.get(r.songId)?.thumbnail).find(Boolean)
    return { ...p, count: refs.length, cover }
  }))

  function playlistTracks(id: number): SongRecord[] {
    return (playlistSongs.get(id) ?? []).map(r => songs.get(r.songId)).filter((s): s is SongRecord => !!s && !s.disliked)
  }

  return {
    ready,
    songs,
    get: (id: string) => songs.get(id),
    isLiked: (id: string) => !!songs.get(id)?.liked,
    isDisliked: (id: string) => !!songs.get(id)?.disliked,
    isDownloaded: (id: string) => !!songs.get(id)?.downloaded,
    liked,
    history,
    downloads,
    disliked,
    dislikedIds,
    playlists: playlistList,
    playlistTracks,
    searches: computed(() => searches.value.map(s => s.term)),

    /** Hide Thai content and anything you disliked. */
    visible<T extends Song>(list: T[]): T[] {
      const d = dislikedIds.value
      return list.filter(s => !d.has(s.id) && !isBlockedSong(s))
    },

    ensure: (song: Song) => patch(song, {}),
    async setLiked(song: Song, liked: boolean) {
      const rec = await patch(song, liked ? { liked: true, likedAt: now(), disliked: false } : { liked: false })
      // "Download songs you like": every like is also saved for offline.
      if (liked && usePrefs().value.autoDownloadLiked && !rec.downloaded) useDownloads().download(song)
      return rec
    },
    setDisliked: (song: Song, disliked: boolean) =>
      patch(song, disliked ? { disliked: true, dislikedAt: now(), liked: false } : { disliked: false, dislikedAt: 0 }),
    async restoreAllDisliked() {
      for (const s of disliked.value) await put({ ...s, disliked: false, dislikedAt: 0 })
    },
    markPlayed: (song: Song) =>
      patch(song, { lastPlayedAt: now(), playCount: (songs.get(song.id)?.playCount ?? 0) + 1 }),
    async clearHistory() {
      for (const s of history.value) await put({ ...s, lastPlayedAt: 0 })
    },
    setDownloaded: (song: Song, size: number) => patch(song, { downloaded: true, downloadedAt: now(), size }),
    async clearDownloaded(id: string) {
      const s = songs.get(id)
      if (s) await put({ ...s, downloaded: false, downloadedAt: 0, size: 0 })
    },

    async createPlaylist(name: string): Promise<number> {
      const id = await (await db()).add('playlists', { name, createdAt: now() } as Playlist)
      playlists.value = [{ id, name, createdAt: now() }, ...playlists.value]
      notify()
      return id
    },
    async renamePlaylist(id: number, name: string) {
      const p = playlists.value.find(x => x.id === id)
      if (!p) return
      const next = { ...p, name }
      await (await db()).put('playlists', next)
      playlists.value = playlists.value.map(x => x.id === id ? next : x)
      notify()
    },
    async deletePlaylist(id: number) {
      const d = await db()
      const tx = d.transaction(['playlists', 'playlistSongs'], 'readwrite')
      await tx.objectStore('playlists').delete(id)
      for (const r of playlistSongs.get(id) ?? []) await tx.objectStore('playlistSongs').delete([id, r.songId])
      await tx.done
      playlists.value = playlists.value.filter(x => x.id !== id)
      playlistSongs.delete(id)
      notify()
    },
    async addToPlaylist(id: number, song: Song) {
      await patch(song, {})
      const ref: PlaylistSong = { playlistId: id, songId: song.id, addedAt: now() }
      await (await db()).put('playlistSongs', ref)
      const list = (playlistSongs.get(id) ?? []).filter(r => r.songId !== song.id)
      playlistSongs.set(id, [...list, ref])
      notify()
    },
    async removeFromPlaylist(id: number, songId: string) {
      await (await db()).delete('playlistSongs', [id, songId])
      playlistSongs.set(id, (playlistSongs.get(id) ?? []).filter(r => r.songId !== songId))
      notify()
    },

    async addSearch(term: string) {
      const t = term.trim()
      if (!t || isBlockedQuery(t)) return
      const entry = { term: t, ts: now() }
      await (await db()).put('searches', entry)
      searches.value = [entry, ...searches.value.filter(s => s.term !== t)].slice(0, 30)
    },
    async removeSearch(term: string) {
      await (await db()).delete('searches', term)
      searches.value = searches.value.filter(s => s.term !== term)
    },
    async clearSearches() {
      await (await db()).clear('searches')
      searches.value = []
    },
  }
}
