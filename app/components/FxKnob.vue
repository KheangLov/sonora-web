<script setup lang="ts">
/**
 * Rotary knob with a glowing arc. Turn it with a circular drag, the mouse wheel or arrow keys;
 * double-click / double-tap resets. `value` is 0..1; `bipolar` draws the arc from 12 o'clock.
 */
const props = withDefaults(defineProps<{
  value: number, size?: number, bipolar?: boolean, color?: string, disabled?: boolean, label: string, valueText?: string, resetTo?: number,
}>(), { size: 120, bipolar: false, disabled: false })
const emit = defineEmits<{ change: [value: number] }>()

const gid = `knob-${useId()}`
const START = 135
const SWEEP = 270
const el = ref<SVGSVGElement | null>(null)
let dragging = false
let acc = 0
let last = 0
let lastTap = 0

const arcColor = computed(() => props.color ?? heatColor(props.bipolar ? Math.abs(props.value - 0.5) * 2 : props.value))
const reset = computed(() => props.resetTo ?? (props.bipolar ? 0.5 : 0))

function pt(deg: number, r: number) {
  const a = (deg * Math.PI) / 180
  return `${(50 + r * Math.cos(a)).toFixed(2)} ${(50 + r * Math.sin(a)).toFixed(2)}`
}
function arc(from: number, to: number, r: number) {
  if (Math.abs(to - from) < 0.5) return ''
  const [a, b] = from < to ? [from, to] : [to, from]
  return `M ${pt(a, r)} A ${r} ${r} 0 ${b - a > 180 ? 1 : 0} 1 ${pt(b, r)}`
}
const track = arc(START, START + SWEEP, 44)
const valueArc = computed(() => props.bipolar
  ? arc(270, 270 + (props.value - 0.5) * SWEEP, 44)
  : arc(START, START + props.value * SWEEP, 44))
const notch = computed(() => {
  const a = START + props.value * SWEEP
  return { a: pt(a, 25), b: pt(a, 31) }
})

function set(v: number) {
  const c = Math.max(0, Math.min(1, v))
  if (props.bipolar && (props.value < 0.5) !== (c < 0.5)) navigator.vibrate?.(6)
  if (c !== props.value) emit('change', c)
}
function angle(e: PointerEvent) {
  const r = el.value!.getBoundingClientRect()
  return (Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2)) * 180) / Math.PI
}
function down(e: PointerEvent) {
  if (props.disabled || e.button > 0) return
  const now = Date.now()
  if (now - lastTap < 300) { set(reset.value); lastTap = 0; return }
  lastTap = now
  dragging = true
  acc = props.value
  last = angle(e)
  el.value?.setPointerCapture(e.pointerId)
}
function move(e: PointerEvent) {
  if (!dragging) return
  const a = angle(e)
  let d = a - last
  if (d > 180) d -= 360
  if (d < -180) d += 360
  last = a
  acc = Math.max(0, Math.min(1, acc + d / SWEEP))
  set(acc)
}
function up() { dragging = false }
function wheel(e: WheelEvent) { if (!props.disabled) set(props.value + (e.deltaY < 0 ? 0.02 : -0.02)) }
function key(e: KeyboardEvent) {
  const d = { ArrowUp: 0.02, ArrowRight: 0.02, ArrowDown: -0.02, ArrowLeft: -0.02, PageUp: 0.1, PageDown: -0.1 }[e.key]
  if (d) { e.preventDefault(); set(props.value + d) }
  else if (e.key === 'Home') { e.preventDefault(); set(reset.value) }
}
</script>

<template>
  <svg
    ref="el"
    class="knob"
    :class="{ off: disabled }"
    :width="size"
    :height="size"
    viewBox="0 0 100 100"
    role="slider"
    tabindex="0"
    :aria-label="label"
    aria-valuemin="0"
    aria-valuemax="100"
    :aria-valuenow="Math.round(value * 100)"
    :aria-valuetext="valueText"
    @pointerdown="down"
    @pointermove="move"
    @pointerup="up"
    @pointercancel="up"
    @wheel.prevent="wheel"
    @keydown="key"
  >
    <defs>
      <radialGradient :id="gid" cx="38%" cy="32%" r="80%">
        <stop offset="0" stop-color="#2c2c33" />
        <stop offset="1" stop-color="#18181c" />
      </radialGradient>
    </defs>
    <path :d="track" class="track" />
    <template v-if="valueArc">
      <path :d="valueArc" class="glow" :stroke="arcColor" />
      <path :d="valueArc" class="val" :stroke="arcColor" />
    </template>
    <circle cx="50" cy="52" r="37" fill="rgba(0,0,0,.55)" />
    <circle cx="50" cy="50" r="37" :fill="`url(#${gid})`" stroke="rgba(255,255,255,.07)" stroke-width=".8" />
    <path :d="`M ${notch.a} L ${notch.b}`" class="notch" />
  </svg>
</template>

<style scoped>
.knob { touch-action: none; cursor: grab; user-select: none; -webkit-user-select: none; outline: none; flex-shrink: 0; }
.knob:active { cursor: grabbing; }
.knob:focus-visible circle:last-of-type { stroke: var(--accent); stroke-width: 1.5; }
.knob.off { opacity: .45; cursor: default; }
.track { fill: none; stroke: rgba(255, 255, 255, .05); stroke-width: 3.5; stroke-linecap: round; }
.val { fill: none; stroke-width: 3.5; stroke-linecap: round; transition: stroke .2s; }
.glow { fill: none; stroke-width: 10; stroke-linecap: round; opacity: .22; filter: blur(1.5px); }
.notch { stroke: rgba(255, 255, 255, .92); stroke-width: 4.5; stroke-linecap: round; }
</style>
