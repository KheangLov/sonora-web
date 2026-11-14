<script setup lang="ts">
/**
 * Glowing vertical fader (Poweramp-style). Drag anywhere on it (relative, so it never jumps),
 * double-click / double-tap to zero, mouse wheel and arrow keys to nudge.
 */
const props = withDefaults(defineProps<{
  value: number, min?: number, max?: number, step?: number, disabled?: boolean, label: string,
}>(), { min: -15, max: 15, step: 0.1, disabled: false })
const emit = defineEmits<{ change: [value: number] }>()

const THUMB_H = 52
const el = ref<HTMLElement | null>(null)
let dragging = false
let startY = 0
let startV = 0
let lastTap = 0

const t = computed(() => Math.max(0, Math.min(1, (props.value - props.min) / (props.max - props.min))))
const color = computed(() => heatColor(t.value))

function set(v: number) {
  const snapped = Math.round(Math.max(props.min, Math.min(props.max, v)) / props.step) * props.step
  const fixed = Math.round(snapped * 100) / 100
  if (props.min < 0 && (props.value < 0) !== (fixed < 0)) navigator.vibrate?.(6)
  if (fixed !== props.value) emit('change', fixed)
}

function down(e: PointerEvent) {
  if (e.button > 0) return
  const now = Date.now()
  if (now - lastTap < 300) { set(0); lastTap = 0; return }
  lastTap = now
  dragging = true
  startY = e.clientY
  startV = props.value
  el.value?.setPointerCapture(e.pointerId)
}
function move(e: PointerEvent) {
  if (!dragging || !el.value) return
  const track = Math.max(1, el.value.clientHeight - THUMB_H)
  set(startV - ((e.clientY - startY) / track) * (props.max - props.min))
}
function up() { dragging = false }
function wheel(e: WheelEvent) { set(props.value + (e.deltaY < 0 ? 0.5 : -0.5)) }
function key(e: KeyboardEvent) {
  const d = { ArrowUp: 0.5, ArrowRight: 0.5, ArrowDown: -0.5, ArrowLeft: -0.5, PageUp: 3, PageDown: -3 }[e.key]
  if (d) { e.preventDefault(); set(props.value + d) }
  else if (e.key === 'Home' || e.key === '0') { e.preventDefault(); set(0) }
}
</script>

<template>
  <div
    ref="el"
    class="fader"
    :class="{ off: disabled }"
    :style="{ '--t': t, '--c': color }"
    role="slider"
    tabindex="0"
    :aria-label="label"
    :aria-valuemin="min"
    :aria-valuemax="max"
    :aria-valuenow="value"
    :aria-valuetext="`${value.toFixed(1)} dB`"
    @pointerdown="down"
    @pointermove="move"
    @pointerup="up"
    @pointercancel="up"
    @wheel.prevent="wheel"
    @keydown="key"
  >
    <span class="tick top" /><span class="tick mid" /><span class="tick bot" />
    <span class="track" />
    <span class="fill" />
    <span class="thumb"><i /></span>
  </div>
</template>

<style scoped>
.fader {
  --th: 52px; position: relative; width: 100%; height: 100%; touch-action: none; cursor: ns-resize;
  user-select: none; -webkit-user-select: none; outline: none;
}
.fader:focus-visible .thumb { box-shadow: 0 0 0 2px var(--accent); }
.fader.off { opacity: .45; }
.track, .fill { position: absolute; left: 50%; transform: translateX(-50%); border-radius: 4px; }
.track { top: calc(var(--th) / 2); bottom: calc(var(--th) / 2); width: 2px; background: rgba(255, 255, 255, .16); }
.fill {
  bottom: calc(var(--th) / 2); width: 3px; height: calc(var(--t) * (100% - var(--th)));
  background: linear-gradient(0deg, #5eead4, var(--c));
  box-shadow: 0 0 6px 1px color-mix(in srgb, var(--c) 55%, transparent), 0 0 14px 2px color-mix(in srgb, var(--c) 25%, transparent);
}
.thumb {
  position: absolute; left: 50%; width: min(26px, calc(100% - 2px)); height: var(--th); border-radius: 999px;
  top: calc((1 - var(--t)) * (100% - var(--th))); transform: translateX(-50%);
  background: #1b1b20; border: 1px solid rgba(255, 255, 255, .12); box-shadow: 0 3px 8px rgba(0, 0, 0, .55);
  display: grid; place-items: center;
}
.thumb i { width: 60%; height: 3px; border-radius: 3px; background: rgba(255, 255, 255, .9); }
.tick { position: absolute; left: 50%; width: 30px; height: 1px; transform: translateX(-50%);
  background: linear-gradient(90deg, #71717a 0 5px, transparent 5px 25px, #71717a 25px 30px); opacity: .6; }
.tick.top { top: calc(var(--th) / 2); }
.tick.mid { top: 50%; }
.tick.bot { bottom: calc(var(--th) / 2); }
</style>
