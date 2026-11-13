<script setup lang="ts">
const t = useToast()
</script>

<template>
  <Transition name="toast">
    <div v-if="t.message.value" :key="t.key.value" class="toast" role="status" aria-live="polite">{{ t.message.value }}</div>
  </Transition>
</template>

<style scoped>
.toast {
  position: fixed; left: 50%; z-index: 200; max-width: min(92vw, 440px);
  bottom: calc(var(--bottom-nav-h) + var(--player-h) + var(--banner-h) + var(--safe-b) + 16px);
  transform: translateX(-50%); background: #f4f4f5; color: #09090b; font-weight: 600; font-size: 14px;
  padding: 12px 18px; border-radius: 12px; box-shadow: 0 10px 30px rgba(0, 0, 0, .5); text-align: center;
}
.toast-enter-active, .toast-leave-active { transition: opacity .2s, transform .25s var(--ease); }
.toast-enter-from, .toast-leave-to { opacity: 0; transform: translate(-50%, 12px); }
</style>
