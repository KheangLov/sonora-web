import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { LyricsResult, Song } from '#shared/types/music'

export interface SongRecord extends Song {
  liked?: boolean
  likedAt?: number
  lastPlayedAt?: number
  playCount?: number
  disliked?: boolean
  dislikedAt?: number
  downloaded?: boolean
  downloadedAt?: number
  size?: number
}

export interface Playlist { id: number, name: string, createdAt: number }
export interface PlaylistSong { playlistId: number, songId: string, addedAt: number }

interface SonoraDB extends DBSchema {
  songs: { key: string, value: SongRecord }
  playlists: { key: number, value: Playlist }
  playlistSongs: { key: [number, string], value: PlaylistSong, indexes: { playlistId: number, songId: string } }
  searches: { key: string, value: { term: string, ts: number } }
  audio: { key: string, value: { id: string, blob: Blob, mime: string, size: number } }
  lyrics: { key: string, value: LyricsResult & { id: string, ts: number } }
}

let dbp: Promise<IDBPDatabase<SonoraDB>> | null = null

export function db() {
  dbp ??= openDB<SonoraDB>('sonora', 1, {
    upgrade(d) {
      d.createObjectStore('songs', { keyPath: 'id' })
      d.createObjectStore('playlists', { keyPath: 'id', autoIncrement: true })
      const ps = d.createObjectStore('playlistSongs', { keyPath: ['playlistId', 'songId'] })
      ps.createIndex('playlistId', 'playlistId')
      ps.createIndex('songId', 'songId')
      d.createObjectStore('searches', { keyPath: 'term' })
      d.createObjectStore('audio', { keyPath: 'id' })
      d.createObjectStore('lyrics', { keyPath: 'id' })
    },
  })
  return dbp
}
