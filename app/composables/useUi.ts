import { ref, shallowRef } from 'vue'
import type { Song } from '#shared/types/music'

/** App-wide sheets and dialogs, opened from anywhere. */
const songMenu = shallowRef<{ song: Song, playlistId?: number } | null>(null)
const addToPlaylist = shallowRef<Song | null>(null)
const queueOpen = ref(false)
const lyricsOpen = ref(false)
const sleepOpen = ref(false)
const signInOpen = ref(false)
const nameDialog = shallowRef<{ title: string, initial?: string, confirm: string, onConfirm: (name: string) => void } | null>(null)

export function useUi() {
  return {
    songMenu, addToPlaylist, queueOpen, lyricsOpen, sleepOpen, signInOpen, nameDialog,
    openSongMenu: (song: Song, playlistId?: number) => { songMenu.value = { song, playlistId } },
  }
}

export async function shareSong(song: Song) {
  const url = `https://music.youtube.com/watch?v=${song.id}`
  const text = `${song.title} — ${song.artist}`
  try {
    if (navigator.share) return await navigator.share({ title: song.title, text, url })
    await navigator.clipboard.writeText(`${text}\n${url}`)
    useToast().show('Link copied')
  }
  catch {}
}
