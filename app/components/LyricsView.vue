<script setup lang="ts">
import type { LyricsResult, Song } from '#shared/types/music'
import { db } from '~/utils/db'

/** Time-synced lyrics: follows the song, highlights the current line, tap a line to seek. */
const props = defineProps<{ song: Song }>()
const player = usePlayer()

const state = ref<'loading' | 'none' | 'ok'>('loading')
const lyrics = shallowRef<LyricsResult | null>(null)
const current = ref(-1)
const box = ref<HTMLElement | null>(null)
let userScrollUntil = 0
let raf = 0

async function load(force = false) {
  const s = props.song
  state.value = 'loading'
  lyrics.value = null
  current.value = -1
  try {
    const d = await db()
    const cached = force ? null : await d.get('lyrics', s.id)
    let result: LyricsResult | null = cached && Date.now() - cached.ts < 30 * 86400_000 ? cached : null
    if (!result) {
      result = await $fetch<LyricsResult>(`/api/lyrics/${s.id}`, {
        query: { title: s.title, artist: s.artist, duration: Math.round(player.duration.value || s.duration || 0) },
      })
      await d.put('lyrics', { ...result, id: s.id, ts: Date.now() })
    }
    if (s.id !== props.song.id) return
    lyrics.value = result
    state.value = result.synced.length || result.plain ? 'ok' : 'none'
  }
  catch {
    state.value = 'none'
  }
}

watch(() => props.song.id, () => load(), { immediate: true })

function tick() {
  const lines = lyrics.value?.synced
  if (lines?.length) {
    const t = player.livePosition() * 1000 + 250
    let lo = 0, hi = lines.length - 1, idx = -1
    while (lo <= hi) {
      const mid = (lo + hi) >> 1
      if (lines[mid]!.time <= t) { idx = mid; lo = mid + 1 }
      else hi = mid - 1
    }
    if (idx !== current.value) {
      current.value = idx
      if (Date.now() > userScrollUntil) scrollToCurrent()
    }
  }
  raf = requestAnimationFrame(tick)
}

function scrollToCurrent() {
  const el = box.value?.querySelector<HTMLElement>(`[data-i="${current.value}"]`)
  if (!el || !box.value) return
  const top = el.offsetTop - box.value.clientHeight * 0.35
  box.value.scrollTo({ top, behavior: 'smooth' })
}

function onUserScroll() { userScrollUntil = Date.now() + 2500 }

onMounted(() => { raf = requestAnimationFrame(tick) })
onBeforeUnmount(() => cancelAnimationFrame(raf))
</script>

<template>
  <div ref="box" class="lyr" @wheel.passive="onUserScroll" @touchmove.passive="onUserScroll">
    <div v-if="state === 'loading'" class="center"><span class="spinner" /></div>
    <EmptyState
      v-else-if="state === 'none'"
      icon="lyrics"
      title="No lyrics found"
      message="Instrumentals and very new releases often don't have lyrics yet."
    >
      <button class="btn btn-outline" @click="load(true)">Try again</button>
    </EmptyState>
    <template v-else-if="lyrics">
      <div v-if="lyrics.synced.length" class="synced">
        <p
          v-for="(l, i) in lyrics.synced"
          :key="i"
          :data-i="i"
          class="line"
          :class="{ on: i === current, past: i < current }"
          @click="player.seek(l.time / 1000)"
        >
          {{ l.text || '♪' }}
        </p>
      </div>
      <p v-else class="plain">{{ lyrics.plain }}</p>
      <p class="src small">Lyrics from {{ lyrics.source }}<template v-if="!lyrics.synced.length"> • not time-synced</template></p>
    </template>
  </div>
</template>

<style scoped>
.lyr { height: 100%; overflow-y: auto; padding: 24px 24px 40vh; scrollbar-width: none; overscroll-behavior: contain; }
.lyr::-webkit-scrollbar { display: none; }
.center { display: grid; place-items: center; height: 60%; }
.spinner { width: 32px; height: 32px; border: 3px solid rgba(255, 255, 255, .2); border-top-color: #fff; border-radius: 50%; animation: spin .8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.line {
  margin: 0; padding: 8px 0; font-size: clamp(22px, 3.2vw, 32px); font-weight: 800; line-height: 1.3; letter-spacing: -.3px;
  color: rgba(255, 255, 255, .35); cursor: pointer; transform-origin: left center;
  transform: scale(.96); transition: color .3s, transform .3s var(--ease);
}
.line.past { color: rgba(255, 255, 255, .55); }
.line.on { color: #fff; transform: none; }
.line:hover { color: rgba(255, 255, 255, .8); }
.plain { white-space: pre-line; font-size: 20px; font-weight: 600; line-height: 1.55; color: rgba(255, 255, 255, .92); margin: 0; }
.src { color: rgba(255, 255, 255, .5); margin-top: 24px; }
</style>
