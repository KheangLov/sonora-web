<script setup lang="ts">
const route = useRoute()
const lib = useLibrary()
const ui = useUi()
const pwa = usePwaInstall()
const acc = useAccount()
const links = [
  { to: '/', label: 'Home', icon: 'home' },
  { to: '/search', label: 'Search', icon: 'search' },
  { to: '/library', label: 'Your Library', icon: 'library' },
]
function newPlaylist() {
  ui.nameDialog.value = {
    title: 'New playlist',
    confirm: 'Create',
    onConfirm: async (name) => { const id = await lib.createPlaylist(name); navigateTo(`/playlist/${id}`) },
  }
}
</script>

<template>
  <aside class="side">
    <NuxtLink to="/" class="brand row"><img src="/favicon.svg" width="32" height="32" alt="">Sonora</NuxtLink>
    <nav class="col">
      <NuxtLink v-for="l in links" :key="l.to" :to="l.to" class="link row" :class="{ on: l.to === '/' ? route.path === '/' : route.path.startsWith(l.to) }">
        <Icon :name="l.icon" />{{ l.label }}
      </NuxtLink>
    </nav>
    <div class="lib col">
      <NuxtLink to="/collection/liked" class="item row">
        <span class="tile liked"><Icon name="heart" :size="18" /></span>
        <span class="col grow"><span class="title ellipsis">Liked Songs</span><span class="small muted">{{ lib.liked.value.length }} songs</span></span>
      </NuxtLink>
      <NuxtLink to="/collection/downloads" class="item row">
        <span class="tile downloads"><Icon name="downloaded" :size="18" /></span>
        <span class="col grow"><span class="title ellipsis">Downloads</span><span class="small muted">{{ lib.downloads.value.length }} songs</span></span>
      </NuxtLink>
      <div class="row ph">
        <span class="label muted grow">Playlists</span>
        <button class="icon-btn sm" aria-label="New playlist" @click="newPlaylist"><Icon name="add" :size="20" /></button>
      </div>
      <NuxtLink v-for="p in lib.playlists.value" :key="p.id" :to="`/playlist/${p.id}`" class="item row">
        <Artwork :src="p.cover" :size="40" />
        <span class="col grow"><span class="title ellipsis">{{ p.name }}</span><span class="small muted">{{ p.count }} songs</span></span>
      </NuxtLink>
    </div>
    <NuxtLink v-if="acc.signedIn.value" to="/library" class="me row">
      <Artwork :src="acc.account.value?.photo" :size="32" radius="50%" />
      <span class="col grow min0"><span class="title ellipsis">{{ acc.account.value?.name ?? 'YouTube Music' }}</span><span class="small accent">Connected</span></span>
    </NuxtLink>
    <button v-else class="btn btn-outline install" @click="ui.signInOpen.value = true"><Icon name="account" :size="18" />Sign in</button>
    <button v-if="pwa.canInstall.value" class="btn btn-primary install" @click="pwa.install()"><Icon name="install" :size="18" />Install app</button>
  </aside>
</template>

<style scoped>
.side { width: 260px; height: 100%; display: flex; flex-direction: column; padding: 20px 12px 12px; background: var(--surface-0); border-right: 1px solid var(--outline-soft); }
.brand { gap: 10px; font-size: 22px; font-weight: 900; letter-spacing: -.8px; padding: 0 12px 20px; }
.link { gap: 16px; height: 44px; padding: 0 12px; border-radius: 10px; font-weight: 700; color: var(--muted); transition: color .15s, background .15s; }
.link:hover { color: var(--on-bg); }
.link.on { color: var(--on-bg); background: var(--surface-3); }
.lib { margin-top: 20px; padding-top: 16px; border-top: 1px solid var(--outline-soft); overflow-y: auto; flex: 1; gap: 2px; }
.item { gap: 12px; padding: 6px 12px; border-radius: 10px; }
.item:hover { background: var(--surface-2); }
.item.router-link-active { background: var(--surface-3); }
.tile { width: 40px; height: 40px; border-radius: 6px; display: grid; place-items: center; color: #fff; flex-shrink: 0; }
.liked { background: linear-gradient(135deg, #5b3fff, #9d8cff); }
.downloads { background: linear-gradient(135deg, #5d7a00, #c6f432); }
.ph { padding: 12px 4px 4px 12px; }
.sm { width: 32px; height: 32px; color: var(--muted); }
.install { margin-top: 12px; justify-content: center; }
.me { gap: 10px; margin-top: 12px; padding: 8px 12px; border-radius: 12px; background: var(--surface-2); }
.me .title { font-size: 14px; }
.min0 { min-width: 0; }
</style>
