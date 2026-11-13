<script setup lang="ts">
import type { Song } from '#shared/types/music'

const props = defineProps<{
  song: Song
  index?: number
  showIndex?: boolean
  status?: string | null
  hideMore?: boolean
}>()
const emit = defineEmits<{ play: [], more: [] }>()

const player = usePlayer()
const lib = useLibrary()
const dl = useDownloads()
const isCurrent = computed(() => player.current.value?.id === props.song.id)
const downloaded = computed(() => lib.isDownloaded(props.song.id))
const progress = computed(() => dl.progress.get(props.song.id))

let pressTimer: ReturnType<typeof setTimeout> | null = null
let longPressed = false
function down() {
  longPressed = false
  pressTimer = setTimeout(() => { longPressed = true; emit('more'); navigator.vibrate?.(10) }, 480)
}
function up() { if (pressTimer) clearTimeout(pressTimer) }
function click() { if (!longPressed) emit('play') }
</script>

<template>
  <div
    class="song-row pad"
    :class="{ current: isCurrent }"
    role="button"
    tabindex="0"
    @click="click"
    @keydown.enter="emit('play')"
    @pointerdown="down"
    @pointerup="up"
    @pointerleave="up"
    @pointercancel="up"
    @contextmenu.prevent="emit('more')"
  >
    <span v-if="showIndex" class="idx muted small">
      <EqBars v-if="isCurrent" :playing="player.isPlaying.value" />
      <template v-else>{{ (index ?? 0) + 1 }}</template>
    </span>
    <div class="thumb">
      <Artwork :src="song.thumbnail" :size="48" :radius="6" />
      <div v-if="isCurrent && !showIndex" class="overlay">
        <EqBars :playing="player.isPlaying.value" :size="16" />
      </div>
    </div>
    <div class="grow col meta">
      <span class="title ellipsis" :class="{ accent: isCurrent }">{{ song.title }}</span>
      <span class="body muted ellipsis row sub">
        <Icon v-if="downloaded" name="downloaded" :size="14" class="dl" />
        <template v-if="progress != null">Downloading {{ progress }}%</template>
        <template v-else-if="status">{{ status }}</template>
        <template v-else>{{ song.artist }}<template v-if="song.duration"> • {{ formatDuration(song.duration) }}</template></template>
      </span>
    </div>
    <slot name="trailing">
      <button v-if="!hideMore" class="icon-btn more" aria-label="More options" @click.stop="emit('more')" @pointerdown.stop>
        <Icon name="more" :size="22" />
      </button>
    </slot>
  </div>
</template>

<style scoped>
.song-row {
  display: flex; align-items: center; gap: 12px; height: 64px; cursor: pointer; user-select: none;
  transition: background .12s; content-visibility: auto; contain-intrinsic-size: auto 64px;
}
.song-row:hover { background: rgba(255, 255, 255, .04); }
.song-row:active { background: rgba(255, 255, 255, .07); }
.idx { width: 24px; text-align: center; display: grid; place-items: center; flex-shrink: 0; }
.thumb { position: relative; width: 48px; height: 48px; flex-shrink: 0; }
.overlay { position: absolute; inset: 0; background: rgba(0, 0, 0, .5); border-radius: 6px; display: grid; place-items: center; }
.meta { gap: 2px; }
.sub { gap: 4px; }
.dl { color: var(--accent); flex-shrink: 0; }
.more { color: var(--muted); margin-right: -10px; }
</style>
