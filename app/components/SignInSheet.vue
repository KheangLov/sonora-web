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
const showOther = ref(false)
const showCookie = ref(false)
const redirecting = ref(false)
const cookie = ref('')
const cookieBusy = ref(false)
const cookieError = ref('')

// With one-click Google available, the code flow only starts when you ask for it.
const codeVisible = computed(() => !acc.googleEnabled.value || showOther.value)
watch([() => ui.signInOpen.value, codeVisible], ([open, visible]) => {
  if (open && visible && !acc.signedIn.value && !login.value) start()
  if (!open) { acc.cancelDeviceLogin(); login.value = null; cookie.value = ''; cookieError.value = ''; showOther.value = false; redirecting.value = false; ui.signInOther.value = false }
})
watch(() => ui.signInOpen.value, (open) => { if (open && ui.signInOther.value) showOther.value = true }, { flush: 'sync' })

function google() {
  redirecting.value = true
  acc.startGoogleSignIn()
}
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

      <template v-if="acc.googleEnabled.value">
        <button class="gbtn" :disabled="redirecting" @click="google">
          <svg viewBox="0 0 48 48" width="22" height="22" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" /><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" /><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" /><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" /></svg>
          <span v-if="!redirecting">Continue with Google</span><span v-else>Opening Google…</span>
        </button>
        <button class="btn btn-text small other" @click="showOther = !showOther">
          {{ showOther ? 'Hide other ways' : 'Other ways to sign in' }}
        </button>
      </template>

      <template v-if="codeVisible">
      <p v-if="acc.googleEnabled.value" class="small muted sub">Sign in on another device: your phone, a computer, anything.</p>
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
      </template>
    </div>
  </Sheet>
</template>

<style scoped>
.body { padding: 0 24px 20px; display: flex; flex-direction: column; gap: 14px; }
.lead { margin: 0; font-size: 14px; line-height: 1.45; }
.gbtn {
  display: flex; align-items: center; justify-content: center; gap: 12px; height: 52px; border-radius: 999px;
  background: #fff; color: #1f1f1f; font-weight: 700; font-size: 16px; transition: transform .15s var(--ease), filter .15s;
}
.gbtn:hover { filter: brightness(.95); }
.gbtn:active { transform: scale(.98); }
.gbtn:disabled { opacity: .7; }
.other { align-self: center; }
.sub { margin: 0; }
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
