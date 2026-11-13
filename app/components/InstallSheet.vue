<script setup lang="ts">
/** "Install Sonora": the one-tap prompt where the browser has one, clear steps everywhere else. */
const pwa = usePwaInstall()

const benefits = [
  { icon: 'offline', title: 'Works offline', text: 'Downloads, your library, lyrics and artwork open with no connection.' },
  { icon: 'sparkle', title: 'Opens instantly', text: 'Its own icon and window, no browser bars, no waiting.' },
  { icon: 'note', title: 'Plays in the background', text: 'Lock-screen, headphone and keyboard media controls.' },
]
</script>

<template>
  <Sheet :open="pwa.sheetOpen.value" @close="pwa.sheetOpen.value = false">
    <template #header>
      <div class="row hd">
        <img src="/pwa-192.png" width="56" height="56" alt="" class="icon">
        <div class="col">
          <h3 class="h3">Install Sonora</h3>
          <span class="small muted">Free • no app store • about 0.5 MB</span>
        </div>
      </div>
    </template>
    <div class="body">
      <ul class="benefits">
        <li v-for="b in benefits" :key="b.title" class="row">
          <span class="bi"><Icon :name="b.icon" :size="20" /></span>
          <span class="col"><b>{{ b.title }}</b><span class="small muted">{{ b.text }}</span></span>
        </li>
      </ul>

      <button v-if="pwa.canPrompt.value" class="btn btn-primary wide" @click="pwa.install(); pwa.sheetOpen.value = false">
        <Icon name="install" :size="18" />Install
      </button>

      <ol v-else-if="pwa.platform === 'ios'" class="steps">
        <li>Tap <b>Share</b> <svg class="share" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2l4 4-1.4 1.4L13 5.8V15h-2V5.8L9.4 7.4 8 6l4-4zm-7 8h3v2H6v8h12v-8h-2v-2h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V11a1 1 0 0 1 1-1z" /></svg> in Safari's toolbar (in Chrome on iPhone, it's at the top right)</li>
        <li>Scroll down and tap <b>Add to Home Screen</b></li>
        <li>Tap <b>Add</b>. Sonora is now on your Home Screen</li>
      </ol>
      <ol v-else-if="pwa.platform === 'android'" class="steps">
        <li>Open your browser's menu <b>⋮</b></li>
        <li>Tap <b>Install app</b> (or <b>Add to Home screen</b>)</li>
        <li>Tap <b>Install</b></li>
      </ol>
      <ol v-else-if="pwa.platform === 'mac-safari'" class="steps">
        <li>In the menu bar choose <b>File → Add to Dock…</b></li>
        <li>Click <b>Add</b>. Sonora opens from your Dock and Launchpad</li>
      </ol>
      <p v-else-if="pwa.platform === 'firefox-desktop'" class="note small muted">
        Firefox on computers can't install web apps. Open Sonora in <b>Chrome</b>, <b>Edge</b> or <b>Safari</b> to install it, or keep using it here.
      </p>
      <ol v-else class="steps">
        <li>Click the <b>install icon</b> at the right end of the address bar</li>
        <li>Or open the browser menu and choose <b>Install Sonora…</b></li>
      </ol>
    </div>
  </Sheet>
</template>

<style scoped>
.hd { gap: 14px; padding-top: 4px; }
.icon { border-radius: 14px; flex-shrink: 0; }
.body { padding: 4px 24px 22px; display: flex; flex-direction: column; gap: 16px; }
.benefits { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 14px; }
.benefits li { gap: 14px; align-items: flex-start; }
.benefits b { font-size: 15px; }
.bi { width: 36px; height: 36px; border-radius: 10px; display: grid; place-items: center; background: var(--accent-soft); color: var(--accent); flex-shrink: 0; }
.wide { width: 100%; justify-content: center; height: 48px; font-size: 16px; }
.steps { margin: 0; padding: 14px 14px 14px 34px; background: var(--surface-3); border-radius: 14px; line-height: 1.8; font-size: 15px; }
.share { width: 18px; height: 18px; vertical-align: -3px; color: #3b82f6; }
.note { margin: 0; padding: 14px; background: var(--surface-3); border-radius: 14px; line-height: 1.5; }
</style>
