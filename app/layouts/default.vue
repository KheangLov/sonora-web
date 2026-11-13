<script setup lang="ts">
const player = usePlayer()
const online = useOnline()
const hasSong = computed(() => !!player.current.value)

// Lock page scroll while the full-screen player is open.
watch(player.nowPlayingOpen, (open) => { document.documentElement.style.overflow = open ? 'hidden' : '' })
</script>

<template>
  <div class="shell" :class="{ 'has-song': hasSong }">
    <div class="desktop-only sidebar"><Sidebar /></div>
    <main class="content">
      <div v-if="!online" class="offline row small"><Icon name="offline" :size="16" />You're offline — downloads and your library still work</div>
      <slot />
    </main>
    <div class="dock mobile-only">
      <MiniPlayer />
      <BottomNav />
    </div>
    <div class="desktop-only bar"><PlayerBar /></div>

    <NowPlaying />
    <QueueSheet />
    <SongMenu />
    <AddToPlaylist />
    <NameDialog />
    <SleepTimer />
    <SignInSheet />
    <Toast />
  </div>
</template>

<style scoped>
.shell { --bottom-nav-h: 72px; min-height: 100dvh; }
.shell.has-song { --player-h: 68px; }
.dock {
  position: fixed; left: 0; right: 0; bottom: 0; z-index: 40; padding-bottom: calc(var(--safe-b) + 8px);
  background: linear-gradient(180deg, transparent, rgba(9, 9, 11, .85) 30%, var(--bg));
}
.offline {
  position: sticky; top: 0; z-index: 30; gap: 8px; justify-content: center; padding: calc(var(--safe-t) + 8px) 12px 8px;
  background: var(--surface-3); color: var(--muted);
}
.desktop-only { display: none; }
@media (min-width: 900px) {
  .shell {
    --bottom-nav-h: 0px; --player-h: 0px;
    display: grid; grid-template-columns: 260px 1fr; grid-template-rows: 1fr 88px; height: 100dvh;
  }
  .desktop-only { display: block; }
  .mobile-only { display: none; }
  .sidebar { grid-row: 1; grid-column: 1; min-height: 0; overflow: hidden; }
  .content { grid-row: 1; grid-column: 2; overflow-y: auto; min-height: 0; contain: strict; }
  .bar { grid-row: 2; grid-column: 1 / -1; }
}
</style>
