<script setup lang="ts">
/** Thin seek bar that grows while you scrub. Position is painted with transforms only. */
const props = withDefaults(defineProps<{ position: number, duration: number, thin?: boolean }>(), { thin: false })
const emit = defineEmits<{ seek: [sec: number], scrub: [sec: number | null] }>()

const bar = ref<HTMLElement | null>(null)
const scrub = ref<number | null>(null)
const fraction = computed(() => {
  const p = scrub.value ?? props.position
  return props.duration > 0 ? Math.min(1, Math.max(0, p / props.duration)) : 0
})

function at(e: PointerEvent) {
  const r = bar.value!.getBoundingClientRect()
  return Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) * props.duration
}
function down(e: PointerEvent) {
  if (!props.duration) return
  bar.value!.setPointerCapture(e.pointerId)
  scrub.value = at(e)
  emit('scrub', scrub.value)
}
function move(e: PointerEvent) {
  if (scrub.value == null) return
  scrub.value = at(e)
  emit('scrub', scrub.value)
}
function up() {
  if (scrub.value == null) return
  emit('seek', scrub.value)
  scrub.value = null
  emit('scrub', null)
}
function key(e: KeyboardEvent) {
  if (e.key === 'ArrowRight') emit('seek', props.position + 5)
  if (e.key === 'ArrowLeft') emit('seek', props.position - 5)
}
</script>

<template>
  <div
    ref="bar"
    class="seek"
    :class="{ active: scrub != null, thin }"
    role="slider"
    tabindex="0"
    aria-label="Seek"
    :aria-valuemax="Math.round(duration)"
    :aria-valuenow="Math.round(position)"
    @pointerdown="down"
    @pointermove="move"
    @pointerup="up"
    @pointercancel="up"
    @keydown="key"
  >
    <div class="track">
      <div class="fill" :style="{ transform: `scaleX(${fraction})` }" />
    </div>
    <div class="knob" :style="{ left: `${fraction * 100}%` }" />
  </div>
</template>

<style scoped>
.seek { position: relative; height: 24px; display: flex; align-items: center; cursor: pointer; touch-action: none; }
.track { width: 100%; height: 4px; border-radius: 4px; background: rgba(255, 255, 255, .22); overflow: hidden; transition: height .15s; }
.fill { width: 100%; height: 100%; background: #fff; transform-origin: left; will-change: transform; }
.knob {
  position: absolute; top: 50%; width: 14px; height: 14px; margin: -7px 0 0 -7px; border-radius: 50%; background: #fff;
  transform: scale(.85); transition: transform .15s; box-shadow: 0 2px 6px rgba(0, 0, 0, .4);
}
.seek.active .track, .seek:hover .track { height: 6px; }
.seek.active .knob { transform: scale(1.15); }
.seek.thin .knob { transform: scale(0); }
.seek.thin:hover .knob, .seek.thin.active .knob { transform: scale(1); }
.seek.thin:hover .fill { background: var(--accent); }
</style>
