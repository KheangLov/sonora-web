<script setup lang="ts">
/** Desktop player bar: track, transport + seek, and volume / lyrics / queue. */
const player = usePlayer()
const lib = useLibrary()
const ui = useUi()
const audioFx = useAudioFx()
const fxOn = computed(() => fxActive(audioFx.settings.value) || audioFx.settings.value.tempo !== 1)
const song = computed(() => player.current.value)
const liked = computed(() => !!song.value && lib.isLiked(song.value.id))
const scrub = ref<number | null>(null)
const duration = computed(() => player.duration.value || song.value?.duration || 0)
function openLyrics() { player.nowPlayingOpen.value = true }
</script>

<template>
  <div class="bar">
    <div class="left row">
      <template v-if="song">
        <button class="cover" aria-label="Open player" @click="player.nowPlayingOpen.value = true">
          <Artwork :src="song.thumbnail" :size="56" :radius="8" />
        </button>
        <div class="col grow">
          <button class="title ellipsis tl" @click="player.nowPlayingOpen.value = true">{{ song.title }}</button>
          <span class="small muted ellipsis">{{ song.artist }}</span>
        </div>
        <button class="icon-btn" :class="{ active: liked }" :aria-label="liked ? 'Unlike' : 'Like'" @click="lib.setLiked(song, !liked)">
          <Icon :name="liked ? 'heart' : 'heartOutline'" :size="20" />
        </button>
      </template>
    </div>

    <div class="center col">
      <div class="row ctrls">
        <button class="icon-btn sm" :class="{ active: player.shuffle.value }" aria-label="Shuffle" @click="player.toggleShuffle()"><Icon name="shuffle" :size="20" /></button>
        <button class="icon-btn sm" aria-label="Previous" :disabled="!song" @click="player.previous()"><Icon name="prev" :size="26" /></button>
        <button class="pp" :aria-label="player.isPlaying.value ? 'Pause' : 'Play'" :disabled="!song" @click="player.togglePlay()">
          <Icon :name="player.isPlaying.value ? 'pause' : 'play'" :size="22" />
        </button>
        <button class="icon-btn sm" aria-label="Next" :disabled="!song" @click="player.next()"><Icon name="next" :size="26" /></button>
        <button class="icon-btn sm" :class="{ active: player.repeat.value !== 'off' }" aria-label="Repeat" @click="player.cycleRepeat()">
          <Icon :name="player.repeat.value === 'one' ? 'repeatOne' : 'repeat'" :size="20" />
        </button>
      </div>
      <div class="row seekrow small muted">
        <span class="t">{{ formatDuration(scrub ?? player.position.value) }}</span>
        <SeekBar class="grow" thin :position="player.position.value" :duration="duration" @seek="player.seek" @scrub="scrub = $event" />
        <span class="t">{{ formatDuration(duration) }}</span>
      </div>
    </div>

    <div class="right row">
      <button class="icon-btn sm" :class="{ active: fxOn }" aria-label="Equalizer" @click="ui.eqOpen.value = true"><Icon name="graphicEq" :size="20" /></button>
      <button class="icon-btn sm" aria-label="Lyrics" :disabled="!song" @click="openLyrics"><Icon name="lyrics" :size="20" /></button>
      <button class="icon-btn sm" aria-label="Queue" @click="ui.queueOpen.value = true"><Icon name="queue" :size="20" /></button>
      <button class="icon-btn sm" aria-label="Mute" @click="player.toggleMute()"><Icon :name="player.volume.value === 0 ? 'volumeOff' : 'volume'" :size="20" /></button>
      <input
        class="vol"
        type="range"
        min="0"
        max="1"
        step="0.01"
        :value="player.volume.value"
        aria-label="Volume"
        :style="{ '--v': `${player.volume.value * 100}%` }"
        @input="player.setVolume(+($event.target as HTMLInputElement).value)"
      >
    </div>
  </div>
</template>

<style scoped>
.bar {
  height: 88px; display: grid; grid-template-columns: minmax(180px, 1fr) minmax(320px, 2fr) minmax(180px, 1fr);
  align-items: center; gap: 16px; padding: 0 16px; background: var(--surface-0); border-top: 1px solid var(--outline-soft);
}
.left { gap: 12px; min-width: 0; }
.cover { flex-shrink: 0; }
.tl { text-align: left; max-width: 100%; }
.tl:hover { text-decoration: underline; }
.center { align-items: center; gap: 2px; }
.ctrls { gap: 10px; }
.sm { width: 36px; height: 36px; color: var(--muted); }
.sm:hover:not(:disabled) { color: var(--on-bg); }
.sm.active { color: var(--accent); }
.pp { width: 38px; height: 38px; border-radius: 50%; background: #fff; color: #000; display: grid; place-items: center; transition: transform .15s; }
.pp:hover:not(:disabled) { transform: scale(1.06); }
.seekrow { width: 100%; max-width: 620px; gap: 10px; }
.t { width: 40px; text-align: center; font-variant-numeric: tabular-nums; }
.right { justify-content: flex-end; gap: 4px; }
.vol {
  width: 110px; height: 4px; appearance: none; background: linear-gradient(90deg, #fff var(--v), rgba(255, 255, 255, .25) var(--v));
  border-radius: 4px; cursor: pointer;
}
.vol::-webkit-slider-thumb { appearance: none; width: 12px; height: 12px; border-radius: 50%; background: #fff; }
.vol::-moz-range-thumb { width: 12px; height: 12px; border: 0; border-radius: 50%; background: #fff; }
</style>
