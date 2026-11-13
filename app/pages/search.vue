<script setup lang="ts">
import type { Song } from '#shared/types/music'

const route = useRoute()
const router = useRouter()
const player = usePlayer()
const lib = useLibrary()
const ui = useUi()
const online = useOnline()

const GENRES = [
  { label: 'Pop', q: 'pop hits', color: '#e8115b' },
  { label: 'Hip-Hop', q: 'hip hop hits', color: '#ba5d07' },
  { label: 'Lo-fi', q: 'lofi beats', color: '#477d95' },
  { label: 'K-Pop', q: 'kpop hits', color: '#8d67ab' },
  { label: 'R&B', q: 'r&b hits', color: '#dc148c' },
  { label: 'Rock', q: 'rock classics', color: '#7d4b32' },
  { label: 'EDM', q: 'edm festival hits', color: '#1e3264' },
  { label: 'Acoustic', q: 'acoustic covers', color: '#608108' },
  { label: 'Jazz', q: 'jazz classics', color: '#8c1932' },
  { label: 'Anime', q: 'anime openings', color: '#e91429' },
  { label: 'Latin', q: 'latin hits', color: '#0d73ec' },
  { label: 'Khmer', q: 'khmer songs', color: '#148a08' },
]

const input = ref<HTMLInputElement | null>(null)
const query = ref(String(route.query.q ?? ''))
const submitted = ref<string | null>(route.query.q ? String(route.query.q) : null)
const suggestions = ref<string[]>([])
const results = shallowRef<Song[] | null>(null)
const next = ref<string | null>(null)
const status = ref<'idle' | 'loading' | 'error' | 'blocked' | 'ok'>('idle')
const loadingMore = ref(false)
const moreFailed = ref(false)
const hint = ref<{ label: string, q: string, clickable: boolean } | null>(null)
const sentinel = ref<HTMLElement | null>(null)

let sugTimer: ReturnType<typeof setTimeout> | null = null
watch(query, (q) => {
  if (sugTimer) clearTimeout(sugTimer)
  if (!q.trim() || q === submitted.value) { suggestions.value = []; return }
  sugTimer = setTimeout(async () => {
    try { suggestions.value = await api.suggest(q.trim()) }
    catch { suggestions.value = [] }
  }, 180)
})

async function run(q: string) {
  const term = q.trim()
  if (!term) return
  query.value = term
  submitted.value = term
  suggestions.value = []
  input.value?.blur()
  if (route.query.q !== term) router.replace({ query: { q: term } })
  status.value = 'loading'
  results.value = null
  next.value = null
  hint.value = null
  moreFailed.value = false
  lib.addSearch(term)
  try {
    const r = await api.search(term)
    if (submitted.value !== term) return
    if (r.blocked) { status.value = 'blocked'; return }
    results.value = r.songs
    next.value = r.next
    hint.value = r.correctedTo ? { label: 'Showing results for', q: r.correctedTo, clickable: false }
      : r.didYouMean ? { label: 'Did you mean', q: r.didYouMean, clickable: true } : null
    status.value = 'ok'
  }
  catch { status.value = 'error' }
}

/** Offline (or YouTube unreachable): search what you already have — downloads first. */
const local = computed(() => {
  const term = (submitted.value ?? '').toLowerCase().normalize('NFKC').trim()
  if (!term) return []
  const words = term.split(/\s+/)
  return [...lib.songs.values()]
    .filter(s => !s.disliked && words.every(w => `${s.title} ${s.artist} ${s.album ?? ''}`.toLowerCase().includes(w)))
    .sort((a, b) => Number(!!b.downloaded) - Number(!!a.downloaded) || (b.lastPlayedAt ?? 0) - (a.lastPlayedAt ?? 0))
    .slice(0, 50)
})

async function loadMore() {
  if (!next.value || loadingMore.value || moreFailed.value) return
  loadingMore.value = true
  const term = submitted.value
  try {
    const r = await api.more(next.value)
    if (submitted.value !== term) return
    const seen = new Set(results.value?.map(s => s.id))
    results.value = [...(results.value ?? []), ...r.songs.filter(s => !seen.has(s.id))]
    next.value = r.next
  }
  catch { moreFailed.value = true }
  finally { loadingMore.value = false }
}

const visible = computed(() => results.value ? lib.visible(results.value) : null)
const showResults = computed(() => submitted.value != null && submitted.value === query.value)
const recent = computed(() => lib.searches.value.slice(0, 12))

// Infinite scroll
let io: IntersectionObserver | null = null
watch(sentinel, (el) => {
  io?.disconnect()
  if (!el) return
  io = new IntersectionObserver(e => e[0]?.isIntersecting && loadMore(), { rootMargin: '600px' })
  io.observe(el)
})
onBeforeUnmount(() => io?.disconnect())

onMounted(() => {
  if (submitted.value) run(submitted.value)
  else if (!('ontouchstart' in window)) input.value?.focus()
})
watch(() => route.query.q, (q) => { if (q && q !== submitted.value) run(String(q)) })
</script>

<template>
  <div class="page">
    <header class="pad hdr">
      <h1 class="h1">Search</h1>
      <form class="field row" role="search" @submit.prevent="run(query)">
        <Icon name="search" class="lead" />
        <input
          ref="input"
          v-model="query"
          type="search"
          enterkeyhint="search"
          autocomplete="off"
          placeholder="Songs, artists, albums"
          aria-label="Search"
        >
        <button v-if="query" type="button" class="icon-btn clr" aria-label="Clear" @click="query = ''; submitted = null; router.replace({ query: {} }); input?.focus()">
          <Icon name="close" :size="20" />
        </button>
      </form>
    </header>

    <!-- Results -->
    <template v-if="showResults">
      <template v-if="status === 'loading'"><SkeletonRow v-for="i in 10" :key="i" /></template>
      <template v-else-if="status === 'error'">
        <EmptyState
          :icon="online ? 'refresh' : 'offline'"
          :title="online ? 'Search failed' : 'You\'re offline'"
          :message="local.length ? 'Here\'s what matches in your library.' : 'Search needs a connection. Your downloads still play.'"
        >
          <button class="btn btn-primary" @click="run(query)">Retry</button>
          <NuxtLink v-if="!local.length" to="/collection/downloads" class="btn btn-outline">Downloads</NuxtLink>
        </EmptyState>
        <SongRow v-for="s in local" :key="s.id" :song="s" @play="player.play(local, local.indexOf(s))" @more="ui.openSongMenu(s)" />
      </template>
      <EmptyState v-else-if="status === 'blocked'" icon="block" title="This search is blocked" message="Thai / Thailand content is filtered out of Sonora." />
      <template v-else-if="visible">
        <button v-if="hint" class="pad hint body" :disabled="!hint.clickable" @click="run(hint.q)">
          <span class="muted">{{ hint.label }} </span><b class="accent">{{ hint.q }}{{ hint.clickable ? '?' : '' }}</b>
        </button>
        <EmptyState v-if="!visible.length && !next" icon="search" :title="`No results for &quot;${submitted}&quot;`" message="Try different keywords or check the spelling." />
        <SongRow v-for="s in visible" :key="s.id" :song="s" @play="player.playRadio(s)" @more="ui.openSongMenu(s)" />
        <div ref="sentinel" class="foot">
          <span v-if="loadingMore" class="spinner" />
          <button v-else-if="moreFailed" class="btn btn-outline" @click="moreFailed = false; loadMore()">Couldn't load more · Retry</button>
          <button v-else-if="next" class="btn btn-outline" @click="loadMore">Load more</button>
          <span v-else-if="visible.length" class="small muted">That's everything for "{{ submitted }}"</span>
        </div>
      </template>
    </template>

    <!-- Suggestions -->
    <template v-else-if="query.trim()">
      <div v-for="s in suggestions" :key="s" class="sug pad row" role="button" @click="run(s)">
        <Icon name="search" class="muted" />
        <span class="grow ellipsis body">{{ s }}</span>
        <button class="icon-btn fill" aria-label="Fill" @click.stop="query = `${s} `; input?.focus()"><Icon name="northWest" :size="20" /></button>
      </div>
    </template>

    <!-- Idle: recent searches + genres -->
    <template v-else>
      <template v-if="recent.length">
        <div class="pad row rh">
          <h3 class="h3 grow">Recent searches</h3>
          <button class="btn btn-text" @click="lib.clearSearches()">Clear</button>
        </div>
        <div v-for="t in recent" :key="t" class="sug pad row" role="button" @click="run(t)">
          <Icon name="history" class="muted" />
          <span class="grow ellipsis body">{{ t }}</span>
          <button class="icon-btn fill" aria-label="Remove" @click.stop="lib.removeSearch(t)"><Icon name="close" :size="20" /></button>
        </div>
      </template>
      <h3 class="h3 pad gh">Browse all</h3>
      <div class="pad genres">
        <button v-for="g in GENRES" :key="g.label" class="genre" :style="{ background: g.color }" @click="run(g.q)">
          <span>{{ g.label }}</span>
          <Icon name="note" :size="56" class="gi" />
        </button>
      </div>
    </template>
  </div>
</template>

<style scoped>
.hdr { padding-top: calc(var(--safe-t) + 20px); padding-bottom: 12px; position: sticky; top: 0; z-index: 5; background: var(--bg); }
.hdr .h1 { margin-bottom: 12px; }
.field { height: 50px; border-radius: 12px; background: #fff; color: #111; padding: 0 4px 0 14px; gap: 10px; }
.field input { flex: 1; border: 0; outline: none; background: transparent; color: #111; font-size: 16px; font-weight: 600; min-width: 0; }
.field input::-webkit-search-cancel-button { display: none; }
.lead { color: #333; }
.clr { color: #333; width: 40px; height: 40px; }
.hint { display: block; text-align: left; padding-top: 6px; padding-bottom: 10px; }
.sug { gap: 16px; min-height: 52px; cursor: pointer; }
.sug:hover { background: rgba(255, 255, 255, .04); }
.fill { color: var(--muted); margin-right: -10px; }
.rh { padding-top: 8px; }
.gh { padding-top: 24px; padding-bottom: 12px; }
.genres { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 12px; }
.genre {
  position: relative; height: 96px; border-radius: 10px; overflow: hidden; text-align: left; padding: 12px;
  font-weight: 800; font-size: 18px; letter-spacing: -.3px; transition: transform .2s var(--ease);
}
.genre:active { transform: scale(.97); }
.gi { position: absolute; right: -8px; bottom: -8px; transform: rotate(25deg); opacity: .35; }
.foot { display: grid; place-items: center; padding: 20px 0; min-height: 72px; }
.spinner { width: 28px; height: 28px; border: 3px solid var(--surface-4); border-top-color: var(--accent); border-radius: 50%; animation: spin .8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
@media (min-width: 900px) { .hdr { padding-top: 28px; } .field { max-width: 560px; } }
</style>
