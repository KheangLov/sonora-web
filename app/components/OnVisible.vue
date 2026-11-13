<script setup lang="ts">
/**
 * Mounts its content only when it scrolls near the viewport. The home feed has ~200 cards;
 * rendering just the first screens keeps startup work (and phone battery) low.
 */
const props = withDefaults(defineProps<{ eager?: boolean, minHeight?: number }>(), { eager: false, minHeight: 240 })
const el = ref<HTMLElement>()
const shown = ref(props.eager)
let io: IntersectionObserver | null = null

onMounted(() => {
  if (shown.value || !el.value) return
  if (!('IntersectionObserver' in window)) { shown.value = true; return }
  // On desktop the page scrolls inside <main>, so observe relative to that.
  const main = el.value.closest('main') as HTMLElement | null
  const root = main && getComputedStyle(main).overflowY === 'auto' ? main : null
  io = new IntersectionObserver((entries) => {
    if (entries.some(e => e.isIntersecting)) { shown.value = true; io?.disconnect(); io = null }
  }, { root, rootMargin: '900px 0px' })
  io.observe(el.value)
})
onBeforeUnmount(() => io?.disconnect())
</script>

<template>
  <div ref="el" :style="shown ? undefined : { minHeight: `${minHeight}px` }">
    <slot v-if="shown" />
  </div>
</template>
