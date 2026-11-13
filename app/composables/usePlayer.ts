import { computed, ref, shallowRef, watch } from 'vue'
import type { Song } from '#shared/types/music'
import { db } from '~/utils/db'
import { art } from '~/utils/art'
import { YouTubeFallback } from './useYouTubeFallback'

export type RepeatMode = 'off' | 'all' | 'one'
type Engine = 'audio' | 'youtube'

const STORE_KEY = 'sonora-player'
/** When the server gets bot-checked, go straight to the fallback player for a while. */
const SERVER_DOWN_MS = 10 * 60_000

// ------------------------------------------------------------------ state (singleton)

const queue = shallowRef<Song[]>([])
const index = ref(0)
const isPlaying = ref(false)
const isBuffering = ref(false)
const position = ref(0) // seconds
const duration = ref(0) // seconds
const shuffle = ref(false)
const repeat = ref<RepeatMode>('off')
const volume = ref(1)
const muted = ref(false)
const sleepAt = ref<number | null>(null)
const engine = ref<Engine>('audio')
const nowPlayingOpen = ref(false)

let unshuffled: Song[] | null = null
let audio: HTMLAudioElement | null = null
let yt: YouTubeFallback | null = null
let objectUrl: string | null = null
let loadToken = 0
let errorStreak = 0
let extending = false
let serverDownUntil = 0
let sleepTimer: ReturnType<typeof setTimeout> | null = null
let ytPoll: ReturnType<typeof setInterval> | null = null
let started = false

const current = computed<Song | null>(() => queue.value[index.value] ?? null)

// ------------------------------------------------------------------ helpers

function toast(msg: string) {
  useToast().show(msg)
}

function persist() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({
      queue: queue.value.slice(0, 500),
      index: index.value,
      position: Math.floor(position.value),
      shuffle: shuffle.value,
      repeat: repeat.value,
      volume: volume.value,
    }))
  }
  catch {}
}

function restore() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE_KEY) ?? 'null')
    if (!s?.queue?.length) return
    queue.value = s.queue
    index.value = Math.min(s.index ?? 0, s.queue.length - 1)
    shuffle.value = !!s.shuffle
    repeat.value = s.repeat ?? 'off'
    volume.value = s.volume ?? 1
    position.value = s.position ?? 0
    duration.value = current.value?.duration ?? 0
  }
  catch {}
}

function ensureAudio(): HTMLAudioElement {
  if (audio) return audio
  audio = new Audio()
  audio.preload = 'auto'
  audio.crossOrigin = 'anonymous'
  audio.volume = volume.value
  audio.addEventListener('playing', () => { isPlaying.value = true; isBuffering.value = false; errorStreak = 0; updateMediaSession() })
  audio.addEventListener('pause', () => { isPlaying.value = false; updateMediaSession() })
  audio.addEventListener('waiting', () => { isBuffering.value = true })
  audio.addEventListener('canplay', () => { isBuffering.value = false })
  audio.addEventListener('timeupdate', () => {
    position.value = audio!.currentTime
    maybePrefetchNext()
  })
  audio.addEventListener('durationchange', () => {
    if (Number.isFinite(audio!.duration)) duration.value = audio!.duration
  })
  audio.addEventListener('ended', onEnded)
  audio.addEventListener('error', () => {
    if (engine.value !== 'audio' || !audio!.src) return
    onPlaybackError()
  })
  return audio
}

// ------------------------------------------------------------------ embeddable alternatives
// YouTube Music "Topic" art tracks often refuse to play embedded (error 101/150). Then we play
// another upload of the same song (official video / lyric video / audio) with a matching length,
// and remember the swap so it's instant next time.
const ALIAS_KEY = 'sonora-embed-alias'
let aliases: Record<string, string> = {}
try { aliases = JSON.parse(localStorage.getItem(ALIAS_KEY) ?? '{}') } catch {}
let altFor: { id: string, list: string[], at: number, playing: string } | null = null

function embedId(song: Song): string {
  return aliases[song.id] ?? song.id
}

async function tryAlternative(song: Song): Promise<boolean> {
  if (altFor?.id !== song.id) {
    let list: string[] = []
    try {
      const alts = await $fetch<Song[]>(`/api/alternatives/${song.id}`, {
        query: { title: song.title, artist: song.artist, duration: song.duration || Math.round(duration.value) },
      })
      list = alts.map(a => a.id).filter(x => x !== aliases[song.id])
    }
    catch {}
    altFor = { id: song.id, list, at: 0, playing: song.id }
  }
  if (current.value?.id !== song.id || altFor.at >= altFor.list.length) return false
  const next = altFor.list[altFor.at++]!
  altFor.playing = next
  await ensureYt().load(next, position.value, true)
  return true
}

function rememberAlias(song: Song | null) {
  if (!song || altFor?.id !== song.id || altFor.playing === song.id) return
  aliases[song.id] = altFor.playing
  try { localStorage.setItem(ALIAS_KEY, JSON.stringify(aliases)) } catch {}
}

function ensureYt(): YouTubeFallback {
  yt ??= new YouTubeFallback({
    onPlaying: () => { isPlaying.value = true; isBuffering.value = false; errorStreak = 0; rememberAlias(current.value); updateMediaSession() },
    onPaused: () => { isPlaying.value = false; updateMediaSession() },
    onBuffering: () => { isBuffering.value = true },
    onEnded,
    onError: async (code) => {
      const song = current.value
      // 101/150/152: this upload can't be embedded. Try another upload of the same song.
      if (song && (code === 101 || code === 150 || code === 152)) {
        if (aliases[song.id]) { delete aliases[song.id]; try { localStorage.setItem(ALIAS_KEY, JSON.stringify(aliases)) } catch {} }
        if (await tryAlternative(song).catch(() => false)) return
      }
      toast('Couldn\'t play this song — skipping')
      skipAfterError()
    },
  })
  return yt
}

function startYtPoll() {
  stopYtPoll()
  ytPoll = setInterval(() => {
    if (!yt || engine.value !== 'youtube') return
    position.value = yt.time
    const d = yt.duration
    if (d > 0) duration.value = d
    maybePrefetchNext()
  }, 250)
}
function stopYtPoll() {
  if (ytPoll) clearInterval(ytPoll)
  ytPoll = null
}

function stopEngines() {
  audio?.pause()
  if (audio) { audio.removeAttribute('src'); audio.load() }
  yt?.stop()
  stopYtPoll()
  if (objectUrl) { URL.revokeObjectURL(objectUrl); objectUrl = null }
}

/** Asks the server for the first bytes: resolves + caches the stream, and tells us if it's usable. */
let probeFailures = 0
async function serverStreamOk(id: string): Promise<boolean> {
  if (Date.now() < serverDownUntil) return false
  try {
    // Don't make the listener wait long for a server that's struggling: the fallback is instant.
    const r = await fetch(`/api/stream/${id}`, { headers: { range: 'bytes=0-1' }, cache: 'no-store', signal: AbortSignal.timeout(8000) })
    await r.body?.cancel()
    if (r.ok) { probeFailures = 0; return true }
    // 503 = YouTube bot-checked the server. Two failures in a row means the same, in practice.
    if (r.status === 503 || ++probeFailures >= 2) serverDownUntil = Date.now() + SERVER_DOWN_MS
    return false
  }
  catch {
    if (++probeFailures >= 2) serverDownUntil = Date.now() + SERVER_DOWN_MS
    return false
  }
}

// ------------------------------------------------------------------ loading

async function load(startAt = 0, autoplay = true) {
  const song = current.value
  if (!song) return
  const token = ++loadToken
  stopEngines()
  position.value = startAt
  duration.value = song.duration || 0
  isBuffering.value = autoplay
  updateMediaSession()

  const lib = useLibrary()
  if (lib.isDisliked(song.id)) return skipAfterError(true)

  // 1. Downloaded: play from IndexedDB, works offline.
  if (lib.isDownloaded(song.id)) {
    const rec = await (await db()).get('audio', song.id)
    if (token !== loadToken) return
    if (rec) {
      objectUrl = URL.createObjectURL(rec.blob)
      return playAudio(objectUrl, startAt, autoplay)
    }
    await lib.clearDownloaded(song.id)
  }

  if (!navigator.onLine) {
    toast('You\'re offline — downloaded songs still play')
    isBuffering.value = false
    return skipToNextDownloaded()
  }

  // 2. Our server stream (audio only, seekable, cacheable).
  if (await serverStreamOk(song.id)) {
    if (token !== loadToken) return
    return playAudio(`/api/stream/${song.id}`, startAt, autoplay)
  }
  if (token !== loadToken) return

  // 3. Fallback: YouTube's embedded player from the listener's own connection.
  engine.value = 'youtube'
  try {
    altFor = null
    await ensureYt().load(embedId(song), startAt, autoplay)
    startYtPoll()
  }
  catch {
    toast('Couldn\'t play this song')
    skipAfterError()
  }
}

function playAudio(src: string, startAt: number, autoplay: boolean) {
  engine.value = 'audio'
  const a = ensureAudio()
  a.src = src
  if (startAt > 0) {
    const seek = () => { a.currentTime = startAt; a.removeEventListener('loadedmetadata', seek) }
    a.addEventListener('loadedmetadata', seek)
  }
  if (autoplay) {
    a.play().catch((e) => {
      isBuffering.value = false
      // Autoplay blocked (no user gesture yet): stay paused, ready to go.
      if (e?.name !== 'NotAllowedError') onPlaybackError()
    })
  }
  else isBuffering.value = false
}

function onPlaybackError() {
  errorStreak++
  const song = current.value
  if (!song) return
  if (errorStreak === 1) {
    // Usually an expired URL or a flaky chunk: one quick retry from where we were.
    return load(position.value, true)
  }
  if (errorStreak === 2) {
    // Server stream keeps failing: try the fallback player before giving up.
    serverDownUntil = Date.now() + SERVER_DOWN_MS
    return load(position.value, true)
  }
  toast('Couldn\'t play this song — skipping')
  skipAfterError()
}

function skipAfterError(silent = false) {
  if (errorStreak > 6) { errorStreak = 0; isPlaying.value = false; return }
  if (index.value < queue.value.length - 1) {
    index.value++
    load(0, true)
  }
  else if (!silent) {
    isPlaying.value = false
    isBuffering.value = false
  }
}

function skipToNextDownloaded() {
  const lib = useLibrary()
  const next = queue.value.findIndex((s, i) => i > index.value && lib.isDownloaded(s.id))
  if (next >= 0) { index.value = next; load(0, true) }
  else isPlaying.value = false
}

function onEnded() {
  if (repeat.value === 'one') return load(0, true)
  if (index.value < queue.value.length - 1) {
    index.value++
    return load(0, true)
  }
  if (repeat.value === 'all' && queue.value.length) {
    index.value = 0
    return load(0, true)
  }
  isPlaying.value = false
}

// Warm the server cache for the next song ~20 s before this one ends: near-gapless starts.
let prefetchedFor = ''
function maybePrefetchNext() {
  const d = duration.value
  if (!d || d - position.value > 20) return
  const next = queue.value[index.value + 1]
  if (!next || prefetchedFor === next.id) return
  prefetchedFor = next.id
  if (!useLibrary().isDownloaded(next.id) && Date.now() >= serverDownUntil) {
    fetch(`/api/stream/${next.id}`, { headers: { range: 'bytes=0-1' } }).then(r => r.body?.cancel()).catch(() => {})
  }
  // Pre-load lyrics and artwork too.
  const img = new Image()
  img.src = art(next.thumbnail, 600)
}

// ------------------------------------------------------------------ autoplay radio

async function fetchRadio(id: string): Promise<Song[]> {
  try {
    return await $fetch<Song[]>(`/api/radio/${id}`, { query: { gl: region() } })
  }
  catch { return [] }
}

function appendUnique(songs: Song[]) {
  const existing = new Set(queue.value.map(s => s.id))
  const toAdd = useLibrary().visible(songs).filter(s => !existing.has(s.id) && !!existing.add(s.id))
  if (!toAdd.length) return
  queue.value = [...queue.value, ...toAdd]
  if (unshuffled) unshuffled = [...unshuffled, ...toAdd]
}

async function maybeExtendQueue() {
  if (extending || repeat.value !== 'off') return
  if (queue.value.length - index.value > 3) return
  const id = current.value?.id
  if (!id || !navigator.onLine) return
  extending = true
  appendUnique(await fetchRadio(id))
  extending = false
}

// ------------------------------------------------------------------ media session

function updateMediaSession() {
  if (!('mediaSession' in navigator)) return
  const s = current.value
  if (!s) return
  navigator.mediaSession.metadata = new MediaMetadata({
    title: s.title,
    artist: s.artist,
    album: s.album ?? 'Sonora',
    artwork: [96, 256, 512].map(px => ({ src: art(s.thumbnail, px / 2), sizes: `${px}x${px}` })),
  })
  navigator.mediaSession.playbackState = isPlaying.value ? 'playing' : 'paused'
}

let lastPositionState = 0
function updatePositionState() {
  if (!('mediaSession' in navigator) || !duration.value) return
  if (Date.now() - lastPositionState < 1000) return
  lastPositionState = Date.now()
  try {
    navigator.mediaSession.setPositionState({
      duration: duration.value,
      position: Math.min(position.value, duration.value),
      playbackRate: 1,
    })
  }
  catch {}
}

function setupMediaSession() {
  if (!('mediaSession' in navigator)) return
  const ms = navigator.mediaSession
  const set = (a: MediaSessionAction, h: MediaSessionActionHandler | null) => { try { ms.setActionHandler(a, h) } catch {} }
  set('play', () => api.play())
  set('pause', () => api.pause())
  set('previoustrack', () => api.previous())
  set('nexttrack', () => api.next())
  set('seekto', d => d.seekTime != null && api.seek(d.seekTime))
  set('seekbackward', d => api.seek(position.value - (d.seekOffset ?? 10)))
  set('seekforward', d => api.seek(position.value + (d.seekOffset ?? 10)))
  set('stop', () => api.pause())
}

// ------------------------------------------------------------------ public API

function shuffled<T>(xs: T[]): T[] {
  const a = [...xs]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!]
  }
  return a
}

const api = {
  queue, index, current, isPlaying, isBuffering, position, duration,
  shuffle, repeat, volume, muted, sleepAt, engine, nowPlayingOpen,
  hasNext: computed(() => index.value < queue.value.length - 1 || repeat.value === 'all'),
  hasPrevious: computed(() => index.value > 0),

  play(list?: Song[], start = 0, shuffleOn = false) {
    if (!list) {
      if (!current.value) return
      if (engine.value === 'youtube' && yt) { yt.play(); return }
      if (audio?.src) { audio.play().catch(() => load(position.value, true)); return }
      return load(position.value, true)
    }
    const songs = useLibrary().visible(list)
    if (!songs.length) return
    const startSong = list[start]
    let startIdx = Math.max(0, songs.findIndex(s => s.id === startSong?.id))
    shuffle.value = shuffleOn
    if (shuffleOn) {
      unshuffled = songs
      const first = songs[Math.floor(Math.random() * songs.length)]!
      queue.value = [first, ...shuffled(songs.filter(s => s !== first))]
      startIdx = 0
    }
    else {
      unshuffled = null
      queue.value = songs
    }
    index.value = startIdx
    errorStreak = 0
    load(0, true)
    persist()
  },

  /** Play one song, then keep going with related tracks (endless autoplay). */
  async playRadio(song: Song) {
    api.play([song])
    const related = await fetchRadio(song.id)
    if (current.value?.id === song.id) appendUnique(related.filter(s => s.id !== song.id))
  },

  playNext(song: Song) {
    if (!queue.value.length) return api.play([song])
    const q = queue.value.filter((s, i) => s.id !== song.id || i === index.value)
    const at = q.findIndex(s => s.id === current.value?.id) + 1
    q.splice(at, 0, song)
    queue.value = q
    index.value = at - 1
    toast('Playing next')
  },

  addToQueue(song: Song) {
    if (!queue.value.length) return api.play([song])
    if (queue.value.some(s => s.id === song.id)) return toast('Already in queue')
    queue.value = [...queue.value, song]
    toast('Added to queue')
  },

  pause() {
    if (engine.value === 'youtube') yt?.pause()
    else audio?.pause()
  },
  togglePlay() {
    isPlaying.value ? api.pause() : api.play()
  },
  next() {
    if (index.value < queue.value.length - 1) index.value++
    else if (repeat.value === 'all' || queue.value.length) index.value = 0
    else return
    errorStreak = 0
    load(0, true)
  },
  previous() {
    if (position.value > 3 || index.value === 0) return api.seek(0)
    index.value--
    errorStreak = 0
    load(0, true)
  },
  seek(sec: number) {
    const t = Math.max(0, Math.min(sec, duration.value || sec))
    position.value = t
    if (engine.value === 'youtube') yt?.seek(t)
    else if (audio) audio.currentTime = t
    lastPositionState = 0
    updatePositionState()
  },
  skipTo(i: number) {
    if (i < 0 || i >= queue.value.length) return
    index.value = i
    errorStreak = 0
    load(0, true)
  },
  removeAt(i: number) {
    if (i === index.value) return
    const q = [...queue.value]
    const [removed] = q.splice(i, 1)
    queue.value = q
    if (i < index.value) index.value--
    if (unshuffled && removed) unshuffled = unshuffled.filter(s => s.id !== removed.id)
  },
  toggleShuffle() {
    const cur = current.value
    if (!cur) { shuffle.value = !shuffle.value; return }
    if (!shuffle.value) {
      unshuffled = [...queue.value]
      const rest = queue.value.filter((_, i) => i !== index.value)
      queue.value = [cur, ...shuffled(rest)]
      index.value = 0
      shuffle.value = true
    }
    else {
      const original = unshuffled ?? queue.value
      // Keep anything added while shuffled.
      const extra = queue.value.filter(s => !original.some(o => o.id === s.id))
      queue.value = [...original, ...extra]
      index.value = Math.max(0, queue.value.findIndex(s => s.id === cur.id))
      unshuffled = null
      shuffle.value = false
    }
  },
  cycleRepeat() {
    repeat.value = repeat.value === 'off' ? 'all' : repeat.value === 'all' ? 'one' : 'off'
  },
  setVolume(v: number) {
    volume.value = Math.max(0, Math.min(1, v))
    muted.value = volume.value === 0
    if (audio) audio.volume = volume.value
    yt?.setVolume(volume.value)
  },
  toggleMute() {
    if (muted.value || volume.value === 0) api.setVolume(Number(localStorage.getItem('sonora-vol') ?? 1) || 1)
    else { localStorage.setItem('sonora-vol', String(volume.value)); api.setVolume(0) }
  },

  /** Hide this song everywhere, remove it from the queue and skip it if it's playing. */
  async dislike(song: Song) {
    await useLibrary().setDisliked(song, true)
    const cur = current.value
    const curIdx = index.value
    const isCurrent = cur?.id === song.id
    const q = queue.value.filter(s => s.id !== song.id)
    queue.value = q
    if (unshuffled) unshuffled = unshuffled.filter(s => s.id !== song.id)
    if (isCurrent) {
      if (q.length) {
        index.value = Math.min(curIdx, q.length - 1)
        load(0, true)
      }
      else { stopEngines(); isPlaying.value = false }
    }
    else index.value = Math.max(0, q.findIndex(s => s.id === cur?.id))
    toast('Disliked — hidden everywhere. Undo in Library')
  },
  async undislike(song: Song) {
    await useLibrary().setDisliked(song, false)
    toast('Song is back')
  },

  setSleepTimer(minutes: number) {
    if (sleepTimer) clearTimeout(sleepTimer)
    sleepTimer = null
    if (minutes <= 0) { sleepAt.value = null; return }
    sleepAt.value = Date.now() + minutes * 60_000
    sleepTimer = setTimeout(() => { api.pause(); sleepAt.value = null }, minutes * 60_000)
  },

  /** Current position, read directly from the engine (for smooth lyrics / progress). */
  livePosition(): number {
    if (engine.value === 'youtube' && yt) return yt.time
    return audio?.currentTime ?? position.value
  },

  /** Call once from the app root (client only). */
  start() {
    if (started) return
    started = true
    restore()
    setupMediaSession()
    watch(current, (s) => {
      if (!s) return
      useLibrary().markPlayed(s)
      updateMediaSession()
      maybeExtendQueue()
      document.title = `${s.title} • ${s.artist}`
    })
    watch(position, updatePositionState)
    watch([queue, index, shuffle, repeat, volume], persist)
    let lastSave = 0
    watch(position, () => {
      if (Date.now() - lastSave > 5000) { lastSave = Date.now(); persist() }
    })
    window.addEventListener('pagehide', persist)
    // Cue the restored song so one tap resumes where you left off.
    if (current.value) updateMediaSession()
  },

  /** Restored-but-not-loaded queue: the first play() call loads it at the saved position. */
  resumeIfIdle() {
    if (current.value && !audio?.src && engine.value === 'audio') load(position.value, true)
  },
}

export function usePlayer() {
  return api
}
