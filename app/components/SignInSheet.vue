<script setup lang="ts">
import type { DeviceLogin } from '~/composables/useAccount'

/**
 * "Sign in to YouTube Music". Main way: the TV-style Google flow (enter a code at google.com/device),
 * which works in any browser, phone or desktop. Alternative: paste a YouTube cookie (the Android app's method).
 */
const ui = useUi()
const acc = useAccount()
const toast = useToast()

const login = shallowRef<DeviceLogin | null>(null)
const showCookie = ref(false)
const cookie = ref('')
const cookieBusy = ref(false)
const cookieError = ref('')

watch(() => ui.signInOpen.value, (open) => {
  if (open && !acc.signedIn.value) start()
  if (!open) { acc.cancelDeviceLogin(); login.value = null; cookie.value = ''; cookieError.value = '' }
})
watch(() => acc.signedIn.value, (s) => { if (s && ui.signInOpen.value) ui.signInOpen.value = false })

function start() {
  login.value = acc.startDeviceLogin()
}

async function copyCode() {
  if (!login.value?.userCode) return
  try { await navigator.clipboard.writeText(login.value.userCode); toast.show('Code copied') } catch {}
}

function openGoogle() {
  copyCode()
  window.open(login.value?.url || 'https://www.google.com/device', '_blank', 'noopener')
}

async function useCookie() {
  cookieError.value = ''
  cookieBusy.value = true
  try { await acc.signInWithCookie(cookie.value) }
  catch (e: any) { cookieError.value = e?.data?.statusMessage ?? e?.statusMessage ?? 'That didn\'t work. Copy the cookie again.' }
  finally { cookieBusy.value = false }
}
</script>

<template>
  <Sheet :open="ui.signInOpen.value" title="Sign in to YouTube Music" @close="ui.signInOpen.value = false">
    <div class="body">
      <p class="muted lead">
        Get your mixes, Quick picks, liked music and playlists in Sonora. Your sign-in stays in this browser only.
      </p>

      <div v-if="!login || login.phase === 'starting'" class="center"><span class="spinner" /></div>

      <template v-else-if="login.phase === 'code'">
        <ol class="steps">
          <li>Open <b>google.com/device</b> (on this or any other device)</li>
          <li>Enter this code and choose your account</li>
          <li>Come back here, it finishes by itself</li>
        </ol>
        <button class="code" aria-label="Copy code" @click="copyCode">
          <span>{{ login.userCode }}</span><Icon name="copy" :size="20" />
        </button>
        <button class="btn btn-primary wide" @click="openGoogle"><Icon name="openNew" :size="18" />Open google.com/device</button>
        <p class="wait small muted row"><span class="spinner sm" />Waiting for you to approve…</p>
      </template>

      <template v-else-if="login.phase === 'done'">
        <p class="center accent title"><Icon name="check" />Signed in</p>
      </template>

      <template v-else>
        <p class="err">{{ login.error }}</p>
        <button class="btn btn-primary" @click="start">Get a new code</button>
      </template>

      <div class="alt">
        <button class="btn btn-text small" @click="showCookie = !showCookie">
          {{ showCookie ? 'Hide' : 'Other way: sign in with a YouTube cookie' }}
        </button>
        <div v-if="showCookie" class="cookie col gap-12">
          <p class="small muted">
            On a computer, open <b>music.youtube.com</b> signed in, press F12 → Network, reload, click any
            request to music.youtube.com and copy its <b>Cookie</b> request header. Paste it here.
          </p>
          <textarea v-model="cookie" rows="4" placeholder="SID=…; HSID=…; SAPISID=…" spellcheck="false" autocomplete="off" />
          <p v-if="cookieError" class="err small">{{ cookieError }}</p>
          <button class="btn btn-outline" :disabled="cookieBusy || cookie.length < 30" @click="useCookie">
            <span v-if="cookieBusy" class="spinner sm" />Sign in with cookie
          </button>
        </div>
      </div>
    </div>
  </Sheet>
</template>

<style scoped>
.body { padding: 0 24px 20px; display: flex; flex-direction: column; gap: 14px; }
.lead { margin: 0; font-size: 14px; line-height: 1.45; }
.center { display: flex; justify-content: center; align-items: center; gap: 8px; padding: 24px 0; }
.steps { margin: 4px 0 0; padding-left: 20px; font-size: 14px; line-height: 1.7; color: var(--on-bg); }
.code {
  display: flex; align-items: center; justify-content: center; gap: 12px; padding: 18px; border-radius: 16px;
  background: var(--surface-4); font: 800 30px/1 ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing: 4px;
}
.code:hover { background: #2e2e35; }
.code :deep(svg) { color: var(--muted); }
.wide { width: 100%; justify-content: center; }
.wait { gap: 10px; justify-content: center; margin: 0; }
.err { color: var(--error); margin: 0; }
.alt { border-top: 1px solid var(--outline); padding-top: 10px; margin-top: 4px; }
.cookie { margin-top: 8px; }
.cookie p { margin: 0; line-height: 1.5; }
textarea {
  width: 100%; resize: vertical; background: var(--surface-3); color: var(--on-bg); border: 1px solid var(--outline);
  border-radius: 12px; padding: 10px 12px; font: 12px/1.4 ui-monospace, Menlo, monospace;
}
.spinner.sm { width: 14px; height: 14px; border-width: 2px; }
</style>
