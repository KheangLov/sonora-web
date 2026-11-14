<script setup lang="ts">
/**
 * Full-screen player. Phone: artwork ⇄ lyrics, drag down to close, swipe the art to skip.
 * Desktop: artwork + controls on the left, lyrics / up next on the right.
 */
const player = usePlayer()
const lib = useLibrary()
const dl = useDownloads()
const ui = useUi()
const audioFx = useAudioFx()
const fxOn = computed(() => fxActive(audioFx.settings.value) || audioFx.settings.value.tempo !== 1)
const toast = useToast()

const song = computed(() => player.current.value)
const thumb = computed(() => song.value?.thumbnail)
const accent = useArtColor(thumb)
const liked = computed(() => !!song.value && lib.isLiked(song.value.id))
const downloaded = computed(() => !!song.value && lib.isDownloaded(song.value.id))
const dlProgress = computed(() => song.value ? dl.progress.get(song.value.id) : undefined)
const scrub = ref<number | null>(null)
const shownPos = computed(() => scrub.value ?? player.position.value)
const duration = computed(() => player.duration.value || song.value?.duration || 0)
const mobileView = ref<'art' | 'lyrics'>('art')
const sideTab = ref<'lyrics' | 'queue'>('lyrics')

function close() { player.nowPlayingOpen.value = false }

// ---- drag down to dismiss
const dragY = ref(0)
let startY = 0, startX = 0, dragging: 'y' | 'x' | null = null, armed = false
const swipeX = ref(0)

function down(e: PointerEvent, zone: 'top' | 'art') {
  if ((e.target as HTMLElement).closest('button, .seek')) return
  armed = true; dragging = null
  startY = e.clientY; startX = e.clientX
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  ;(e.currentTarget as HTMLElement).dataset.zone = zone
}
function move(e: PointerEvent) {
  if (!armed) return
  const dy = e.clientY - startY, dx = e.clientX - startX
  const zone = (e.currentTarget as HTMLElement).dataset.zone
  if (!dragging) {
    if (Math.abs(dy) > 8 && Math.abs(dy) > Math.abs(dx)) dragging = 'y'
    else if (zone === 'art' && Math.abs(dx) > 8) dragging = 'x'
  }
  if (dragging === 'y') dragY.value = Math.max(0, dy)
  if (dragging === 'x') swipeX.value = dx
}
function up() {
  if (!armed) return
  armed = false
  if (dragging === 'y' && dragY.value > 140) close()
  if (dragging === 'x') {
    if (swipeX.value < -90) player.next()
    else if (swipeX.value > 90) player.previous()
  }
  dragY.value = 0
  swipeX.value = 0
  dragging = null
}

function toggleDownload() {
  const s = song.value
  if (!s) return
  if (downloaded.value) { dl.remove(s.id); toast.show('Removed download') }
  else if (dlProgress.value != null) dl.remove(s.id)
  else { dl.download(s); toast.show('Downloading for offline') }
}

// Close on browser back.
watch(player.nowPlayingOpen, (open) => {
  if (open) history.pushState({ np: true }, '')
  else if (history.state?.np) history.back()
})
onMounted(() => window.addEventListener('popstate', () => { if (player.nowPlayingOpen.value) player.nowPlayingOpen.value = false }))
</script>

<template>
  <Transition name="np">
    <div
      v-if="player.nowPlayingOpen.value && song"
      class="np"
      :style="{
        '--tint': accent,
        'transform': dragY ? `translateY(${dragY}px)` : undefined,
        'transition': dragY ? 'none' : undefined,
      }"
    >
      <div class="bg" />
      <div class="layout">
        <section class="main">
          <header class="top" @pointerdown="down($event, 'top')" @pointermove="move" @pointerup="up" @pointercancel="up">
            <button class="icon-btn" aria-label="Close player" @click="close"><Icon name="down" :size="30" /></button>
            <div class="col grow center">
              <span class="label dim">{{ player.engine.value === 'youtube' ? 'Playing via YouTube player' : 'Playing from your queue' }}</span>
              <span class="title">{{ player.index.value + 1 }} of {{ player.queue.value.length }}</span>
            </div>
            <button class="icon-btn" aria-label="More" @click="ui.openSongMenu(song)"><Icon name="more" /></button>
          </header>

          <div class="stage">
            <div
              v-show="mobileView === 'art'"
              class="art-wrap"
              @pointerdown="down($event, 'art')"
              @pointermove="move"
              @pointerup="up"
              @pointercancel="up"
            >
              <Transition name="art" mode="out-in">
                <div
                  :key="song.id"
                  class="art-box"
                  :class="{ paused: !player.isPlaying.value }"
                  :style="swipeX ? { transform: `translateX(${swipeX * .35}px) rotate(${swipeX / 90}deg)`, transition: 'none' } : undefined"
                >
                  <Artwork :src="song.thumbnail" :size="540" :radius="14" eager />
                </div>
              </Transition>
            </div>
            <div v-if="mobileView === 'lyrics'" class="mobile-lyrics">
              <LyricsView :song="song" />
            </div>
          </div>

          <div class="meta row">
            <div class="col grow">
              <h1 class="name ellipsis">{{ song.title }}</h1>
              <span class="artist ellipsis">{{ song.artist }}</span>
            </div>
            <button class="icon-btn like" :class="{ on: liked }" :aria-label="liked ? 'Unlike' : 'Like'" @click="lib.setLiked(song, !liked)">
              <Icon :name="liked ? 'heart' : 'heartOutline'" :size="28" />
            </button>
          </div>

          <SeekBar :position="player.position.value" :duration="duration" @seek="player.seek" @scrub="scrub = $event" />
          <div class="times row small">
            <span>{{ formatDuration(shownPos) }}</span>
            <span class="grow" />
            <span>{{ formatDuration(duration) }}</span>
          </div>

          <div class="transport row">
            <button class="icon-btn toggle" :class="{ active: player.shuffle.value }" aria-label="Shuffle" @click="player.toggleShuffle()">
              <Icon name="shuffle" /><i />
            </button>
            <button class="icon-btn big" aria-label="Previous" @click="player.previous()"><Icon name="prev" :size="40" /></button>
            <button class="pp" :aria-label="player.isPlaying.value ? 'Pause' : 'Play'" @click="player.togglePlay()">
              <Icon :name="player.isPlaying.value ? 'pause' : 'play'" :size="38" />
              <span v-if="player.isBuffering.value" class="ring" />
            </button>
            <button class="icon-btn big" aria-label="Next" @click="player.next()"><Icon name="next" :size="40" /></button>
            <button class="icon-btn toggle" :class="{ active: player.repeat.value !== 'off' }" aria-label="Repeat" @click="player.cycleRepeat()">
              <Icon :name="player.repeat.value === 'one' ? 'repeatOne' : 'repeat'" /><i />
            </button>
          </div>

          <div class="secondary row">
            <button class="icon-btn" :aria-label="downloaded ? 'Remove download' : 'Download'" @click="toggleDownload">
              <span v-if="dlProgress != null" class="mini-ring" :style="{ '--p': dlProgress }" />
              <Icon v-else :name="downloaded ? 'downloaded' : 'download'" :class="{ accent: downloaded }" />
            </button>
            <button class="icon-btn" aria-label="Dislike" @click="player.dislike(song)"><Icon name="thumbDownOutline" /></button>
            <button class="icon-btn only-mobile" :class="{ active: mobileView === 'lyrics' }" aria-label="Lyrics" @click="mobileView = mobileView === 'lyrics' ? 'art' : 'lyrics'">
              <Icon name="lyrics" />
            </button>
            <button class="icon-btn" :class="{ active: !!player.sleepAt.value }" aria-label="Sleep timer" @click="ui.sleepOpen.value = true"><Icon name="bedtime" /></button>
            <button class="icon-btn" :class="{ active: fxOn }" aria-label="Equalizer" @click="ui.eqOpen.value = true"><Icon name="graphicEq" /></button>
            <button class="icon-btn" aria-label="Share" @click="shareSong(song)"><Icon name="share" /></button>
            <button class="icon-btn only-mobile" aria-label="Queue" @click="ui.queueOpen.value = true"><Icon name="queue" /></button>
          </div>
        </section>

        <aside class="side">
          <div class="tabs row">
            <button class="chip" :class="{ on: sideTab === 'lyrics' }" @click="sideTab = 'lyrics'">Lyrics</button>
            <button class="chip" :class="{ on: sideTab === 'queue' }" @click="sideTab = 'queue'">Up next</button>
          </div>
          <div class="side-body">
            <LyricsView v-if="sideTab === 'lyrics'" :song="song" />
            <div v-else class="side-queue">
              <SongRow
                v-for="(s, i) in player.queue.value"
                :key="`${i}_${s.id}`"
                :song="s"
                hide-more
                @play="player.skipTo(i)"
                @more="ui.openSongMenu(s)"
              >
                <template #trailing>
                  <button v-if="i !== player.index.value" class="icon-btn" aria-label="Remove" @click.stop="player.removeAt(i)" @pointerdown.stop>
                    <Icon name="close" :size="20" />
                  </button>
                </template>
              </SongRow>
            </div>
          </div>
        </aside>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.np { position: fixed; inset: 0; z-index: 60; overflow: hidden; color: #fff; will-change: transform; }
.bg {
  position: absolute; inset: 0; z-index: -1; transition: background 0.7s;
  background: linear-gradient(180deg,
    color-mix(in srgb, var(--tint) 75%, #000) 0%,
    color-mix(in srgb, var(--tint) 28%, #000) 62%,
    var(--bg) 100%);
}
.layout { height: 100%; display: flex; max-width: 1400px; margin: 0 auto; }
.main {
  flex: 1; min-width: 0; display: flex; flex-direction: column; padding: calc(var(--safe-t) + 8px) 24px calc(var(--safe-b) + 12px);
  max-width: 560px; margin: 0 auto; width: 100%;
}
.top { display: flex; align-items: center; touch-action: none; margin: 0 -12px; }
.center { align-items: center; text-align: center; }
.dim { color: rgba(255, 255, 255, .7); }
.stage { flex: 1; min-height: 0; display: flex; align-items: center; justify-content: center; position: relative; margin: 16px 0; }
.art-wrap { width: 100%; max-height: 100%; aspect-ratio: 1; touch-action: none; display: grid; place-items: center; }
.art-box {
  width: 100%; height: 100%; max-width: min(100%, 52vh); max-height: min(100%, 52vh); aspect-ratio: 1;
  transition: transform .5s var(--spring); filter: drop-shadow(0 24px 48px rgba(0, 0, 0, .5));
}
.art-box.paused { transform: scale(.88); }
.art-box :deep(.art) { width: 100%; height: 100%; }
.mobile-lyrics { position: absolute; inset: -16px -24px; }
.meta { gap: 8px; margin-bottom: 12px; }
.name { font-size: 24px; font-weight: 800; letter-spacing: -.5px; margin: 0; }
.artist { font-size: 16px; color: rgba(255, 255, 255, .7); }
.like { color: #fff; }
.like.on { color: var(--accent); }
.like :deep(svg) { transition: transform .3s var(--spring); }
.like.on :deep(svg) { transform: scale(1.1); }
.times { color: rgba(255, 255, 255, .7); margin-top: -2px; font-variant-numeric: tabular-nums; }
.transport { justify-content: space-between; margin: 10px 0 14px; }
.toggle { position: relative; flex-direction: column; color: rgba(255, 255, 255, .85); }
.toggle i { position: absolute; bottom: 6px; width: 4px; height: 4px; border-radius: 50%; background: transparent; }
.toggle.active { color: var(--accent); }
.toggle.active i { background: var(--accent); }
.big { width: 60px; height: 60px; }
.pp {
  position: relative; width: 76px; height: 76px; border-radius: 50%; background: #fff; color: #000;
  display: grid; place-items: center; transition: transform .2s var(--spring); flex-shrink: 0;
}
.pp:active { transform: scale(.93); }
.ring {
  position: absolute; inset: -3px; border-radius: 50%; border: 3px solid transparent;
  border-top-color: color-mix(in srgb, var(--tint) 80%, #fff); animation: spin .9s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
.secondary { justify-content: space-between; color: #fff; }
.secondary .active { color: var(--accent); }
.mini-ring {
  width: 22px; height: 22px; border-radius: 50%;
  background: conic-gradient(var(--accent) calc(var(--p) * 1%), rgba(255, 255, 255, .2) 0);
  mask: radial-gradient(circle, transparent 7px, #000 8px);
}
.side { display: none; }

@media (min-width: 900px) {
  .main { max-width: 520px; padding-left: 40px; padding-right: 40px; }
  .only-mobile { display: none; }
  .side {
    display: flex; flex-direction: column; flex: 1; min-width: 0; max-width: 640px;
    padding: calc(var(--safe-t) + 24px) 32px 24px 8px;
  }
  .tabs { gap: 8px; margin-bottom: 8px; }
  .side .chip:not(.on) { background: rgba(255, 255, 255, .1); }
  .side-body { flex: 1; min-height: 0; background: rgba(0, 0, 0, .18); border-radius: 18px; overflow: hidden; }
  .side-queue { height: 100%; overflow-y: auto; padding: 8px 0; }
}

.np-enter-active, .np-leave-active { transition: transform .38s var(--ease); }
.np-enter-from, .np-leave-to { transform: translateY(100%); }
.art-enter-active { transition: opacity .3s, transform .3s var(--ease); }
.art-leave-active { transition: opacity .15s; }
.art-enter-from { opacity: 0; transform: scale(.92); }
.art-leave-to { opacity: 0; }
</style>
