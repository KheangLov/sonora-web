<script setup lang="ts">
const lib = useLibrary()
const ui = useUi()
const dl = useDownloads()
const pwa = usePwaInstall()
const usage = ref<{ used: number, quota: number } | null>(null)
const menuFor = ref<number | null>(null)

onMounted(async () => { usage.value = await dl.usage() })

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

    <div class="pad foot col gap-12">
      <p v-if="usage" class="small muted">Offline storage: {{ mb(usage.used) }} used of {{ mb(usage.quota) }}</p>
      <button v-if="pwa.canInstall.value" class="btn btn-outline" @click="pwa.install()"><Icon name="install" :size="18" />Install Sonora as an app</button>
    </div>
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
.foot { padding-top: 24px; align-items: flex-start; }
.foot p { margin: 0; }
@media (min-width: 900px) { .hdr { padding-top: 28px; } }
</style>
