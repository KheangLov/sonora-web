import { ref, watch } from 'vue'

/** Small device-only settings. */
const KEY = 'sonora-prefs'
interface Prefs { autoDownloadLiked: boolean }
const prefs = ref<Prefs>({ autoDownloadLiked: false })
let loaded = false

export function usePrefs() {
  if (import.meta.client && !loaded) {
    loaded = true
    try { prefs.value = { ...prefs.value, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') } } catch {}
    watch(prefs, v => localStorage.setItem(KEY, JSON.stringify(v)), { deep: true })
  }
  return prefs
}
