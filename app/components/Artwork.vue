<script setup lang="ts">
import { art, artFallback } from '~/utils/art'

/** Artwork at the exact size it's shown, lazy-loaded and async-decoded. */
const props = withDefaults(defineProps<{
  src?: string | null
  size: number
  radius?: number | string
  eager?: boolean
  alt?: string
}>(), { radius: 6, eager: false, alt: '' })

const failed = ref(false)
const url = ref('')
watchEffect(() => { failed.value = false; url.value = art(props.src, props.size) })

function onError() {
  const fb = artFallback(url.value)
  if (fb && fb !== url.value) url.value = fb
  else failed.value = true
}
</script>

<template>
  <div class="art" :style="{ borderRadius: typeof radius === 'number' ? `${radius}px` : radius }">
    <img
      v-if="url && !failed"
      :src="url"
      :alt="alt"
      :width="size"
      :height="size"
      :loading="eager ? 'eager' : 'lazy'"
      :fetchpriority="eager ? 'high' : 'auto'"
      decoding="async"
      draggable="false"
      @error="onError"
    >
    <Icon v-else name="note" :size="Math.max(16, size / 3)" class="ph" />
  </div>
</template>

<style scoped>
.art {
  position: relative; overflow: hidden; background: var(--surface-3); flex-shrink: 0;
  display: grid; place-items: center; aspect-ratio: 1;
}
.art img { width: 100%; height: 100%; object-fit: cover; }
.ph { color: var(--muted); opacity: .6; }
</style>
