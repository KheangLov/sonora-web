<script setup lang="ts">
/** Animated equalizer for the song that's playing. Transform-only animation (no layout). */
defineProps<{ playing: boolean, size?: number }>()
</script>

<template>
  <span class="eq" :class="{ on: playing }" :style="{ width: `${size ?? 14}px`, height: `${size ?? 14}px` }" aria-label="Now playing">
    <i /><i /><i />
  </span>
</template>

<style scoped>
.eq { display: inline-flex; align-items: flex-end; gap: 2px; flex-shrink: 0; }
.eq i {
  flex: 1; height: 100%; background: var(--accent); border-radius: 1px;
  transform-origin: bottom; transform: scaleY(.3);
}
.eq.on i { animation: eq 0.9s ease-in-out infinite alternate; }
.eq.on i:nth-child(2) { animation-duration: .7s; animation-delay: -.3s; }
.eq.on i:nth-child(3) { animation-duration: 1.1s; animation-delay: -.6s; }
@keyframes eq { 0% { transform: scaleY(.25); } 100% { transform: scaleY(1); } }
</style>
