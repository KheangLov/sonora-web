/**
 * App-like touches around the service worker:
 *  - counts visits (for the install banner),
 *  - says once when Sonora is ready to work offline,
 *  - checks for a new deployment whenever you come back to the app, and switches to it right away
 *    unless music is playing (then at the next pause), so you always get the latest version
 *    without your song being cut off.
 */
export default defineNuxtPlugin({
  name: 'sonora-pwa-ux',
  dependsOn: ['vite-pwa:nuxt:client:plugin'],
  setup(nuxtApp) {
    try { localStorage.setItem('sonora-visits', String(Number(localStorage.getItem('sonora-visits') ?? 0) + 1)) } catch {}
    const pwa = usePwaInstall()
    const player = usePlayer()

    watch(pwa.offlineReady, (ready) => {
      if (!ready || localStorage.getItem('sonora-offline-ready')) return
      localStorage.setItem('sonora-offline-ready', '1')
      useToast().show('Sonora is ready to work offline')
    }, { immediate: true })

    // ---- Look for a new deployment often: on launch, on every return to the app, and every few minutes.
    let registration: ServiceWorkerRegistration | null = null
    nuxtApp.hook('service-worker:registered', ({ registration: r }: { registration?: ServiceWorkerRegistration }) => {
      if (r) registration = r
      check(true)
    })
    let lastCheck = 0
    async function check(force = false) {
      if (!('serviceWorker' in navigator) || !navigator.onLine) return
      if (!force && Date.now() - lastCheck < 30_000) return
      lastCheck = Date.now()
      try {
        registration ??= (await navigator.serviceWorker.getRegistration()) ?? null
        await registration?.update()
      }
      catch {}
    }
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check() })
    window.addEventListener('focus', () => check())
    window.addEventListener('online', () => check(true))
    window.addEventListener('pageshow', e => { if ((e as PageTransitionEvent).persisted) check(true) })
    setInterval(() => { if (document.visibilityState === 'visible') check() }, 5 * 60_000)
    useRouter().afterEach(() => { check() })

    // ---- New version downloaded: switch now if nothing is playing, otherwise at the next pause.
    let applying = false
    let told = false
    async function apply() {
      if (!pwa.needRefresh.value || applying) return
      if (player.isPlaying.value) {
        if (!told) { told = true; useToast().show('A new version of Sonora is ready. It loads when you pause.') }
        return
      }
      applying = true
      // Feeds cached by the old version may not match the new one.
      try { await caches.delete('feeds') } catch {}
      pwa.applyUpdate() // activates the new service worker and reloads the page
    }
    watch([pwa.needRefresh, player.isPlaying], apply, { immediate: true })
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') apply() })

    // Installed: ask the browser to never evict downloads.
    if (pwa.installed.value) navigator.storage?.persist?.().catch(() => {})
  },
})
