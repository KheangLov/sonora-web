/**
 * App-like touches around the service worker:
 *  - counts visits (for the install banner),
 *  - says once when Sonora is ready to work offline,
 *  - applies app updates only when nothing is playing, so music is never cut off.
 */
export default defineNuxtPlugin({
  name: 'sonora-pwa-ux',
  dependsOn: ['vite-pwa:nuxt:client:plugin'],
  setup() {
    try { localStorage.setItem('sonora-visits', String(Number(localStorage.getItem('sonora-visits') ?? 0) + 1)) } catch {}
    const pwa = usePwaInstall()
    const player = usePlayer()

    watch(pwa.offlineReady, (ready) => {
      if (!ready || localStorage.getItem('sonora-offline-ready')) return
      localStorage.setItem('sonora-offline-ready', '1')
      useToast().show('Sonora is ready to work offline')
    }, { immediate: true })

    // New version waiting: switch over at a quiet moment (paused, or between visits).
    const apply = () => { if (pwa.needRefresh.value && !player.isPlaying.value) pwa.applyUpdate() }
    watch([pwa.needRefresh, player.isPlaying], apply)
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') apply() })

    // Installed: ask the browser to never evict downloads.
    if (pwa.installed.value) navigator.storage?.persist?.().catch(() => {})
  },
})
