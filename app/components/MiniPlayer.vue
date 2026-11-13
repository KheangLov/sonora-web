<script setup lang="ts">
/** Phone mini player: tap to open, swipe sideways to skip, live progress line. */
const player = usePlayer()
const song = computed(() => player.current.value)
const accent = useArtColor(computed(() => song.value?.thumbnail))
const progress = computed(() => {
  const d = player.duration.value || song.value?.duration || 0
  return d ? Math.min(1, player.position.value / d) : 0
})

const dx = ref(0)
let sx = 0, active = false, moved = false
function down(e: PointerEvent) {
  if ((e.target as HTMLElement).closest('button')) return
  active = true; moved = false; sx = e.clientX
}
function move(e: PointerEvent) {
  if (!active) return
  dx.value = e.clientX - sx
  if (Math.abs(dx.value) > 8) moved = true
}
function up() {
  if (!active) return
  active = false
  if (dx.value < -70) player.next()
  else if (dx.value > 70) player.previous()
  else if (!moved) player.nowPlayingOpen.value = true
  dx.value = 0
}
</script>

<template>
  <div
    v-if="song"
    class="mini"
    :style="{ '--tint': accent }"
    role="button"
    aria-label="Open player"
    @pointerdown="down"
    @pointermove="move"
    @pointerup="up"
    @pointercancel="up"
  >
    <div class="inner row" :style="dx ? { transform: `translateX(${dx * .4}px)`, opacity: 1 - Math.min(.6, Math.abs(dx) / 300) } : undefined">
      <Artwork :src="song.thumbnail" :size="44" :radius="8" />
      <div class="col grow text">
        <span class="title ellipsis">{{ song.title }}</span>
        <span class="small ellipsis dim">{{ song.artist }}</span>
      </div>
      <button class="icon-btn" :aria-label="player.isPlaying.value ? 'Pause' : 'Play'" @click.stop="player.togglePlay()">
        <Icon :name="player.isPlaying.value ? 'pause' : 'play'" :size="30" />
      </button>
      <button class="icon-btn" aria-label="Next" @click.stop="player.next()"><Icon name="next" :size="28" /></button>
    </div>
    <div class="line"><div class="fill" :style="{ transform: `scaleX(${progress})` }" /></div>
  </div>
</template>

<style scoped>
.mini {
  position: relative; margin: 0 8px; border-radius: 14px; overflow: hidden; touch-action: pan-y; user-select: none;
  background: color-mix(in srgb, var(--tint) 55%, #111); transition: background .6s; box-shadow: 0 8px 24px rgba(0, 0, 0, .4);
}
.inner { gap: 10px; padding: 8px 4px 8px 8px; height: 60px; }
.text { gap: 1px; }
.dim { color: rgba(255, 255, 255, .75); }
.line { position: absolute; left: 10px; right: 10px; bottom: 0; height: 2px; background: rgba(255, 255, 255, .2); border-radius: 2px; }
.fill { height: 100%; background: #fff; transform-origin: left; will-change: transform; }
</style>
