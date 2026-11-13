import { ref } from 'vue'

let deferred: any = null
const canInstall = ref(false)
let listening = false

/** "Install app" button support (Chrome / Edge / Android). iOS uses Share → Add to Home Screen. */
export function usePwaInstall() {
  if (import.meta.client && !listening) {
    listening = true
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault()
      deferred = e
      canInstall.value = true
    })
    window.addEventListener('appinstalled', () => { canInstall.value = false; deferred = null })
  }
  return {
    canInstall,
    async install() {
      if (!deferred) return
      deferred.prompt()
      await deferred.userChoice.catch(() => null)
      deferred = null
      canInstall.value = false
    },
  }
}
