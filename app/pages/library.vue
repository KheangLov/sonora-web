<script setup lang="ts">
import type { Collection } from '#shared/types/music'

const lib = useLibrary()
const ui = useUi()
const dl = useDownloads()
const pwa = usePwaInstall()
const usage = ref<{ used: number, quota: number } | null>(null)
const menuFor = ref<number | null>(null)
const acc = useAccount()
const ytPlaylists = shallowRef<Collection[] | null>(null)
const checking = ref(false)
const check = shallowRef<{ method: string, results: { name: string, ok: boolean, detail: string, ms: number }[] } | null>(null)

async function loadYt(force = false) {
  if (!acc.signedIn.value) { ytPlaylists.value = null; return }
  try { ytPlaylists.value = await api.myPlaylists(force) }
  catch { ytPlaylists.value = [] }
}
watch(() => [acc.signedIn.value, acc.version.value], () => loadYt(), { immediate: true })

async function runCheck() {
  checking.value = true
  check.value = null
  try { check.value = await api.checkConnection() }
  catch (e: any) { check.value = { method: '', results: [{ name: 'Sign-in', ok: false, detail: e?.data?.statusMessage ?? 'Not signed in', ms: 0 }] } }
  finally { checking.value = false }
}
const liked = { id: 'VLLM', isQueue: false, title: 'Liked music', subtitle: 'From your YouTube account', thumbnail: '' }

const prefs = usePrefs()
const persisted = ref<boolean | null>(null)
onMounted(async () => {
  usage.value = await dl.usage()
  persisted.value = await navigator.storage?.persisted?.().catch(() => null) ?? null
})

function toggleAutoDownload() {
  prefs.value.autoDownloadLiked = !prefs.value.autoDownloadLiked
  if (prefs.value.autoDownloadLiked) {
    navigator.storage?.persist?.().then((p) => { persisted.value = p }).catch(() => {})
    const missing = lib.liked.value.filter(s => !s.downloaded)
    if (missing.length) dl.downloadAll(missing)
  }
}

const mb = (b: number) => b > 1e9 ? `${(b / 1e9).toFixed(1)} GB` : `${Math.round(b / 1e6)} MB`

function newPlaylist() {
  ui.nameDialog.value = {
    title: 'New playlist',
    confirm: 'Create',
    onConfirm: async (name) => { await lib.createPlaylist(name) },
  }
}
function rename(id: number, initial: string) {
  menuFor.value = null
  ui.nameDialog.value = { title: 'Rename playlist', initial, confirm: 'Save', onConfirm: name => lib.renamePlaylist(id, name) }
}
async function remove(id: number) {
  menuFor.value = null
  await lib.deletePlaylist(id)
  useToast().show('Playlist deleted')
}
</script>

<template>
  <div class="page">
    <header class="pad row hdr">
      <h1 class="h1 grow">Your Library</h1>
      <button class="icon-btn" aria-label="New playlist" @click="newPlaylist"><Icon name="add" /></button>
    </header>

    <div v-if="!acc.signedIn.value" class="pad">
      <div class="connect col">
        <h2 class="h3">{{ acc.account.value?.expired ? 'Sign in again' : 'Connect YouTube Music' }}</h2>
        <p class="body muted">
          {{ acc.account.value?.expired
            ? 'Your YouTube sign-in expired. Sign in again to get your mixes and playlists back.'
            : 'Get your personal mixes, Quick picks, liked music and playlists right here.' }}
        </p>
        <div class="row gap-12 wrap">
          <button class="btn btn-primary" @click="ui.signIn()"><Icon name="account" :size="18" />{{ acc.googleEnabled.value ? 'Continue with Google' : 'Sign in with Google' }}</button>
          <button v-if="acc.googleEnabled.value" class="btn btn-text small" @click="ui.signIn(true)">Other ways</button>
        </div>
      </div>
    </div>
    <div v-else class="pad row account">
      <Artwork :src="acc.account.value?.photo" :size="44" radius="50%" />
      <div class="col grow min0">
        <span class="title ellipsis">{{ acc.account.value?.name ?? 'YouTube Music' }}</span>
        <span class="small accent">Connected{{ acc.account.value?.handle ? ` • ${acc.account.value.handle}` : '' }}</span>
      </div>
      <button class="icon-btn" aria-label="Check connection" :class="{ spin: checking }" @click="runCheck"><Icon name="refresh" /></button>
      <button class="icon-btn" aria-label="Sign out" @click="acc.signOut()"><Icon name="logout" /></button>
    </div>
    <div v-if="check" class="pad check">
      <div v-for="r in check.results" :key="r.name" class="row small">
        <Icon :name="r.ok ? 'check' : 'close'" :size="18" :class="r.ok ? 'accent' : 'bad'" />
        <b>{{ r.name }}</b><span class="muted ellipsis grow">{{ r.detail }}</span>
      </div>
    </div>

    <NuxtLink to="/collection/liked" class="tile-row pad row">
      <span class="tile" style="background: linear-gradient(135deg, #5b3fff, #9d8cff)"><Icon name="heart" :size="28" /></span>
      <span class="col"><span class="title">Liked Songs</span><span class="body muted">{{ lib.liked.value.length }} songs</span></span>
    </NuxtLink>
    <NuxtLink to="/collection/downloads" class="tile-row pad row">
      <span class="tile" style="background: linear-gradient(135deg, #5d7a00, #c6f432)"><Icon name="downloaded" :size="28" /></span>
      <span class="col"><span class="title">Downloads</span><span class="body muted">{{ lib.downloads.value.length }} songs • available offline</span></span>
    </NuxtLink>
    <NuxtLink to="/collection/history" class="tile-row pad row">
      <span class="tile" style="background: linear-gradient(135deg, #b4410e, #ff9a5a)"><Icon name="history" :size="28" /></span>
      <span class="col"><span class="title">Recently played</span><span class="body muted">Your listening history</span></span>
    </NuxtLink>
    <NuxtLink to="/collection/disliked" class="tile-row pad row">
      <span class="tile" style="background: linear-gradient(135deg, #3a3a44, #7a7a88)"><Icon name="thumbDown" :size="28" /></span>
      <span class="col"><span class="title">Disliked songs</span><span class="body muted">{{ lib.disliked.value.length }} hidden • tap to undo</span></span>
    </NuxtLink>

    <template v-if="acc.signedIn.value">
      <h2 class="h3 pad sh">From YouTube Music</h2>
      <NuxtLink :to="browseLink(liked)" class="tile-row pad row">
        <span class="tile" style="background: linear-gradient(135deg, #9b0f0f, #ff4e45)"><Icon name="thumbUp" :size="28" /></span>
        <span class="col"><span class="title">Liked music</span><span class="body muted">Your YouTube likes</span></span>
      </NuxtLink>
      <template v-if="ytPlaylists === null"><SkeletonRow v-for="i in 3" :key="i" /></template>
      <NuxtLink v-for="c in ytPlaylists ?? []" :key="c.id" :to="browseLink(c)" class="tile-row pad row">
        <Artwork :src="c.thumbnail" :size="60" :radius="8" />
        <span class="col grow min0"><span class="title ellipsis">{{ c.title }}</span><span class="body muted ellipsis">{{ c.subtitle }}</span></span>
      </NuxtLink>
    </template>

    <h2 class="h3 pad sh">Playlists</h2>
    <EmptyState v-if="!lib.playlists.value.length" icon="library" title="Make your first playlist" message="Tap ⋮ on any song and choose “Add to playlist”.">
      <button class="btn btn-primary" @click="newPlaylist">Create playlist</button>
    </EmptyState>
    <div v-for="p in lib.playlists.value" :key="p.id" class="tile-row pad row pl">
      <NuxtLink :to="`/playlist/${p.id}`" class="row grow link">
        <Artwork :src="p.cover" :size="60" :radius="8" />
        <span class="col grow"><span class="title ellipsis">{{ p.name }}</span><span class="body muted">Playlist • {{ p.count }} songs</span></span>
      </NuxtLink>
      <div class="menu-wrap">
        <button class="icon-btn" aria-label="Playlist options" @click="menuFor = menuFor === p.id ? null : p.id"><Icon name="more" /></button>
        <div v-if="menuFor === p.id" class="menu" @click.stop>
          <button class="row" @click="rename(p.id, p.name)"><Icon name="edit" :size="20" />Rename</button>
          <button class="row danger" @click="remove(p.id)"><Icon name="delete" :size="20" />Delete</button>
        </div>
      </div>
    </div>

    <h2 class="h3 pad sh">App &amp; offline</h2>
    <div class="pad">
      <div class="app-card col">
        <div class="row gap-12">
          <img src="/pwa-192.png" width="48" height="48" alt="" class="app-ic">
          <div class="col grow min0">
            <span class="title">Sonora app</span>
            <span v-if="pwa.installed.value" class="small accent row ok"><Icon name="check" :size="16" />Installed</span>
            <span v-else class="small muted">Install for offline use, its own icon and window</span>
          </div>
          <button v-if="pwa.canInstall.value" class="btn btn-primary" @click="pwa.install()"><Icon name="install" :size="18" />Install</button>
        </div>
        <button v-if="pwa.needRefresh.value" class="btn btn-outline" @click="pwa.applyUpdate()"><Icon name="refresh" :size="18" />New version ready · Restart</button>

        <button class="opt row" role="switch" :aria-checked="prefs.autoDownloadLiked" @click="toggleAutoDownload">
          <span class="col grow">
            <span class="title">Download songs you like</span>
            <span class="small muted">Every song you ♥ is saved for offline, automatically</span>
          </span>
          <span class="switch" :class="{ on: prefs.autoDownloadLiked }"><span /></span>
        </button>

        <div class="col stats small muted">
          <span>{{ lib.downloads.value.length }} songs downloaded<template v-if="usage"> • {{ mb(usage.used) }} used of {{ mb(usage.quota) }}</template></span>
          <span v-if="persisted" class="row ok"><Icon name="check" :size="14" />Protected from automatic cleanup</span>
          <span v-else-if="persisted === false">The browser may clear downloads when space runs low. Installing the app prevents that.</span>
          <span v-if="pwa.offlineReady.value || pwa.installed.value" class="row ok"><Icon name="check" :size="14" />Opens offline</span>
        </div>
      </div>
    </div>
    <div class="pad foot" />
  </div>
</template>

<style scoped>
.hdr { padding-top: calc(var(--safe-t) + 20px); padding-bottom: 12px; }
.tile-row { gap: 14px; padding-top: 8px; padding-bottom: 8px; transition: background .12s; }
.tile-row:hover { background: rgba(255, 255, 255, .04); }
.tile { width: 60px; height: 60px; border-radius: 8px; display: grid; place-items: center; color: #fff; flex-shrink: 0; }
.sh { padding-top: 28px; padding-bottom: 8px; }
.link { gap: 14px; }
.menu-wrap { position: relative; }
.menu {
  position: absolute; right: 8px; top: 44px; z-index: 10; background: var(--surface-4); border-radius: 12px; padding: 6px;
  min-width: 160px; box-shadow: 0 12px 32px rgba(0, 0, 0, .5);
}
.menu button { gap: 12px; width: 100%; padding: 10px 12px; border-radius: 8px; font-size: 15px; }
.menu button:hover { background: rgba(255, 255, 255, .06); }
.danger { color: var(--error); }
.connect {
  gap: 8px; padding: 18px; border-radius: 16px; margin: 4px 0 8px; align-items: flex-start;
  background: linear-gradient(135deg, #3a0d0d, var(--surface-3));
}
.connect p { margin: 0 0 6px; }
.wrap { flex-wrap: wrap; }
.account { gap: 12px; padding-top: 4px; padding-bottom: 8px; }
.min0 { min-width: 0; }
.check { display: flex; flex-direction: column; gap: 6px; padding-bottom: 8px; }
.check .row { gap: 8px; }
.bad { color: var(--error); }
.spin :deep(svg) { animation: sonora-spin .8s linear infinite; }
.foot { padding-top: 24px; align-items: flex-start; }
.app-card { gap: 14px; padding: 16px; border-radius: 16px; background: var(--surface-2); border: 1px solid var(--outline-soft); }
.app-ic { border-radius: 12px; flex-shrink: 0; }
.ok { gap: 4px; color: var(--accent); }
.opt { gap: 12px; text-align: left; padding: 12px 0 4px; border-top: 1px solid var(--outline-soft); }
.switch { width: 46px; height: 28px; border-radius: 99px; background: var(--surface-4); position: relative; flex-shrink: 0; transition: background .2s; }
.switch span { position: absolute; top: 3px; left: 3px; width: 22px; height: 22px; border-radius: 50%; background: #fff; transition: transform .2s var(--ease); }
.switch.on { background: var(--accent); }
.switch.on span { transform: translateX(18px); background: var(--on-accent); }
.stats { gap: 4px; }
.foot p { margin: 0; }
@media (min-width: 900px) { .hdr { padding-top: 28px; } }
</style>
