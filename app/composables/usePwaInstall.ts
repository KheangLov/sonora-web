import { computed, ref } from 'vue'

/**
 * Installing Sonora as an app, on every platform:
 *  - Chrome / Edge / Samsung Internet (Android, Windows, macOS, ChromeOS, Linux): the browser's own
 *    install prompt, captured early by @vite-pwa/nuxt.
 *  - iPhone / iPad (any browser), Safari on Mac, Firefox on Android: no prompt exists, so we show
 *    the steps (Share → Add to Home Screen, File → Add to Dock, ⋮ → Install).
 */
export type InstallPlatform = 'ios' | 'android' | 'mac-safari' | 'firefox-desktop' | 'chromium' | 'other'

const sheetOpen = ref(false)

function detectPlatform(): InstallPlatform {
  if (!import.meta.client) return 'other'
  const ua = navigator.userAgent
  const iOS = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  if (iOS) return 'ios'
  if (/Android/.test(ua)) return 'android'
  const chromium = /Chrome|Chromium|Edg\//.test(ua)
  if (/Firefox\//.test(ua)) return 'firefox-desktop'
  if (/Macintosh/.test(ua) && /Safari\//.test(ua) && !chromium) return 'mac-safari'
  return chromium ? 'chromium' : 'other'
}

function isStandalone(): boolean {
  if (!import.meta.client) return false
  return window.matchMedia('(display-mode: standalone)').matches
    || window.matchMedia('(display-mode: window-controls-overlay)').matches
    || (navigator as any).standalone === true
}

export function usePwaInstall() {
  const pwa = import.meta.client ? (useNuxtApp().$pwa as any) : null
  const platform = detectPlatform()
  const installed = computed(() => isStandalone() || !!pwa?.isPWAInstalled)
  /** The browser's one-tap install prompt is ready. */
  const canPrompt = computed(() => !installed.value && !!pwa?.showInstallPrompt)
  /** We can always help: a prompt where supported, steps everywhere else. */
  const canInstall = computed(() => !installed.value && (canPrompt.value || platform !== 'other'))

  return {
    platform,
    installed,
    canPrompt,
    canInstall,
    sheetOpen,
    /** Service worker finished caching the app: it now opens offline. */
    offlineReady: computed(() => !!pwa?.offlineReady),
    /** A new version is downloaded and waiting. */
    needRefresh: computed(() => !!pwa?.needRefresh),
    applyUpdate: () => pwa?.updateServiceWorker(true),
    async install() {
      if (canPrompt.value) {
        const choice = await pwa.install()
        if (choice?.outcome === 'accepted') {
          navigator.storage?.persist?.().catch(() => {})
          useToast().show('Sonora is installed 🎉')
        }
        return
      }
      sheetOpen.value = true
    },
  }
}
