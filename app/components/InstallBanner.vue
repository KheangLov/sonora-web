<script setup lang="ts">
/**
 * A gentle "Install Sonora" banner: shows once you're actually using the app (second visit, or
 * after you play something), never when installed, and stays away for 2 weeks if dismissed.
 */
const pwa = usePwaInstall()
const player = usePlayer()
const KEY = 'sonora-install-dismissed'
const dismissedAt = ref(0)
const visits = ref(0)

onMounted(() => {
  dismissedAt.value = Number(localStorage.getItem(KEY) ?? 0)
  visits.value = Number(localStorage.getItem('sonora-visits') ?? 0)
})

const show = computed(() =>
  pwa.canInstall.value
  && Date.now() - dismissedAt.value > 14 * 86400_000
  && (visits.value >= 2 || !!player.current.value),
)

function dismiss() {
  dismissedAt.value = Date.now()
  localStorage.setItem(KEY, String(dismissedAt.value))
}
</script>

<template>
  <Transition name="pop">
    <div v-if="show" class="banner row" role="region" aria-label="Install Sonora">
      <img src="/pwa-192.png" width="40" height="40" alt="" class="ic">
      <div class="col grow min0">
        <b class="t">Install Sonora</b>
        <span class="small muted ellipsis">Works offline • opens instantly</span>
      </div>
      <button class="btn btn-primary sm" @click="pwa.install()">Install</button>
      <button class="icon-btn x" aria-label="Not now" @click="dismiss"><Icon name="close" :size="20" /></button>
    </div>
  </Transition>
</template>

<style scoped>
.banner {
  gap: 12px; margin: 0 8px 8px; padding: 10px 6px 10px 12px; border-radius: 16px;
  background: var(--surface-4); box-shadow: 0 10px 30px rgba(0, 0, 0, .45); border: 1px solid var(--outline-soft);
}
.ic { border-radius: 10px; flex-shrink: 0; }
.t { font-size: 15px; }
.min0 { min-width: 0; }
.sm { height: 34px; padding: 0 16px; }
.x { width: 36px; height: 36px; color: var(--muted); }
.pop-enter-active, .pop-leave-active { transition: opacity .25s, transform .25s var(--ease); }
.pop-enter-from, .pop-leave-to { opacity: 0; transform: translateY(12px); }
@media (min-width: 900px) {
  .banner { position: fixed; right: 24px; bottom: 104px; width: 380px; margin: 0; z-index: 45; }
}
</style>
