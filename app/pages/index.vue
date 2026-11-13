<script setup lang="ts">
import type { HomeSection, Song } from '#shared/types/music'

const player = usePlayer()
const acc = useAccount()
const lib = useLibrary()
const ui = useUi()

const MOODS = [
  { label: 'Chill', q: 'chill lofi songs' },
  { label: 'Focus', q: 'focus deep work instrumental' },
  { label: 'Workout', q: 'workout gym hits' },
  { label: 'Party', q: 'party dance hits' },
  { label: 'Romance', q: 'romantic love songs' },
  { label: 'Sleep', q: 'sleep calm piano' },
  { label: 'Throwback', q: '2000s throwback hits' },
  { label: 'K-Pop', q: 'kpop hits' },
]

const sections = shallowRef<HomeSection[] | null>(peek(`home:${acc.key.value}`) ?? null)
const error = ref(false)
const refreshing = ref(false)
const mood = ref<typeof MOODS[number] | null>(null)
const moodSongs = shallowRef<Song[] | null>(null)
const quick = shallowRef<{ seed: Song, songs: Song[] } | null>(null)

async function load(force = false) {
  error.value = false
  refreshing.value = force
  try { sections.value = await api.home(force) }
  catch { if (!sections.value) error.value = true }
  refreshing.value = false
}

async function loadQuick() {
  const seed = lib.history.value[0]
  if (!seed || quick.value?.seed.id === seed.id) return
  try {
    const songs = await api.radio(seed.id)
    quick.value = { seed, songs: songs.filter(s => s.id !== seed.id) }
  }
  catch {}
}

async function pickMood(m: typeof MOODS[number] | null) {
  if (mood.value?.label === m?.label) m = null
  mood.value = m
  moodSongs.value = null
  if (!m) return
  try { moodSongs.value = (await api.search(m.q)).songs }
  catch { moodSongs.value = [] }
}

onMounted(() => { load() })
// Signing in or out swaps between the general and your personal YouTube Music home.
watch(() => acc.version.value, () => { sections.value = null; load(true) })
watch(() => lib.ready.value, (r) => { if (r) loadQuick() }, { immediate: true })

const visibleSections = computed(() => sections.value ? filterSections(sections.value, lib.dislikedIds.value) : null)
const visibleQuick = computed(() => quick.value ? lib.visible(quick.value.songs).slice(0, 20) : [])
const visibleMood = computed(() => moodSongs.value ? lib.visible(moodSongs.value) : null)
const recent = computed(() => lib.history.value.slice(0, 6))

const greeting = computed(() => {
  const h = new Date().getHours()
  const g = h >= 5 && h < 12 ? 'Good morning' : h >= 12 && h < 18 ? 'Good afternoon' : 'Good evening'
  const first = acc.signedIn.value ? acc.account.value?.name?.split(' ')[0] : null
  return first ? `${g}, ${first}` : g
})
</script>

<template>
  <div class="page home">
    <div class="glow" />
    <header class="pad row hdr">
      <div class="col grow">
        <h1 class="h1">{{ greeting }}</h1>
        <span class="body muted">What's the vibe today?</span>
      </div>
      <button class="icon-btn" aria-label="Refresh" :class="{ spin: refreshing }" @click="load(true)"><Icon name="refresh" /></button>
      <NuxtLink to="/collection/history" class="icon-btn" aria-label="History"><Icon name="history" /></NuxtLink>
    </header>

    <div class="hscroll pad chips">
      <button class="chip" :class="{ on: !mood }" @click="pickMood(null)">For you</button>
      <button v-for="m in MOODS" :key="m.label" class="chip" :class="{ on: mood?.label === m.label }" @click="pickMood(m)">{{ m.label }}</button>
    </div>

    <template v-if="mood">
      <SectionHeader :title="mood.label" subtitle="Mood" />
      <template v-if="!visibleMood"><SkeletonRow v-for="i in 8" :key="i" /></template>
      <EmptyState v-else-if="!visibleMood.length" title="Nothing here" message="Couldn't load this mood. Check your connection." />
      <SongRow v-for="(s, i) in visibleMood" v-else :key="s.id" :song="s" @play="player.play(visibleMood!, i)" @more="ui.openSongMenu(s)" />
    </template>

    <template v-else>
      <div v-if="recent.length" class="pad recent">
        <button v-for="s in recent" :key="s.id" class="tile row" @click="player.playRadio(s)" @contextmenu.prevent="ui.openSongMenu(s)">
          <Artwork :src="s.thumbnail" :size="56" :radius="0" />
          <span class="title clamp2 grow" :class="{ accent: player.current.value?.id === s.id }">{{ s.title }}</span>
          <EqBars v-if="player.current.value?.id === s.id" :playing="player.isPlaying.value" class="eq" />
        </button>
      </div>

      <template v-if="visibleQuick.length">
        <SectionHeader title="Quick picks" :subtitle="`Because you played ${quick!.seed.title}`" />
        <div class="quick hscroll pad">
          <div v-for="col in Math.ceil(visibleQuick.length / 4)" :key="col" class="qcol">
            <SongRow
              v-for="s in visibleQuick.slice((col - 1) * 4, col * 4)"
              :key="s.id"
              :song="s"
              class="qrow"
              @play="player.playRadio(s)"
              @more="ui.openSongMenu(s)"
            />
          </div>
        </div>
      </template>

      <template v-if="visibleSections">
        <OnVisible v-for="(sec, si) in visibleSections" :key="sec.title" :eager="si < 2" :min-height="262">
          <section>
            <SectionHeader :title="sec.title" :subtitle="sec.subtitle" />
            <div class="hscroll pad">
              <CollectionCard v-for="(c, ci) in sec.collections" :key="c.id" :c="c" :eager="si === 0 && ci < 3" />
              <SongCard
                v-for="(s, i) in sec.songs"
                :key="s.id"
                :song="s"
                :eager="si === 0 && i < 3"
                @play="player.play(sec.songs, i)"
                @more="ui.openSongMenu(s)"
              />
            </div>
          </section>
        </OnVisible>
      </template>
      <EmptyState v-else-if="error" title="Can't reach YouTube" message="Check your connection. Your downloads still play offline.">
        <button class="btn btn-primary" @click="load(true)">Retry</button>
        <NuxtLink to="/collection/downloads" class="btn btn-outline">Downloads</NuxtLink>
      </EmptyState>
      <div v-else class="sk">
        <div v-for="i in 3" :key="i">
          <div class="skeleton pad-sk" style="width: 160px; height: 22px; margin: 28px 16px 12px" />
          <div class="row gap-12 pad"><div v-for="j in 4" :key="j" class="skeleton" style="width: 156px; height: 156px; border-radius: 10px; flex-shrink: 0" /></div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.home { position: relative; }
.glow { position: absolute; inset: 0 0 auto; height: 340px; background: linear-gradient(180deg, rgba(198, 244, 50, .14), transparent); pointer-events: none; z-index: -1; }
.hdr { padding-top: calc(var(--safe-t) + 20px); padding-bottom: 8px; gap: 4px; }
.chips { gap: 8px; padding-top: 8px; padding-bottom: 8px; }
.spin :deep(svg) { animation: spin .8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.recent { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 12px; }
.tile { gap: 10px; height: 56px; background: var(--surface-3); border-radius: 6px; overflow: hidden; text-align: left; padding-right: 8px; transition: background .15s; }
.tile:hover { background: var(--surface-4); }
.tile .title { font-size: 13px; line-height: 1.25; }
.eq { margin-right: 4px; }
.quick { gap: 0; }
.qcol { width: min(86vw, 380px); }
.qrow { padding-left: 0; padding-right: 8px; }
@media (min-width: 900px) {
  .recent { grid-template-columns: repeat(3, 1fr); }
  .hdr { padding-top: 28px; }
}
</style>
