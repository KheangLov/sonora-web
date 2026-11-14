<script setup lang="ts">
import { MAX_DB, SPECTRUM_BARS, fxResponse, logFreqs, spectrumFreq } from '~/utils/fx'
import type { FxSettings } from '~/utils/fx'

/** Frequency-response curve of the current settings, over a live spectrum analyzer. */
const props = defineProps<{ settings: FxSettings }>()
const fx = useAudioFx()

const FREQS = logFreqs(120)
const canvas = ref<HTMLCanvasElement | null>(null)
const curve = computed(() => fxResponse(props.settings, FREQS))
const target = new Float32Array(SPECTRUM_BARS)
const bars = new Float32Array(SPECTRUM_BARS)
let raf = 0

const xOf = (hz: number, w: number) => (Math.log(hz / 20) / Math.log(1000)) * w

function draw() {
  raf = requestAnimationFrame(draw)
  const c = canvas.value
  if (!c) return
  const dpr = Math.min(2, window.devicePixelRatio || 1)
  const w = c.clientWidth, h = c.clientHeight
  if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr) }
  const g = c.getContext('2d')!
  g.setTransform(dpr, 0, 0, dpr, 0, 0)
  g.clearRect(0, 0, w, h)
  const mid = h / 2

  // Spectrum: rounded pills mirrored around the centre line.
  const live = fx.readSpectrum(target)
  const slot = w / SPECTRUM_BARS
  const pill = Math.min(slot * 0.62, 14)
  for (let i = 0; i < SPECTRUM_BARS; i++) {
    const tv = live ? target[i]! : 0
    bars[i] = tv > bars[i]! ? bars[i]! + (tv - bars[i]!) * 0.6 : bars[i]! * 0.9
    const x = Math.max(slot / 2, Math.min(w - slot / 2, xOf(spectrumFreq(i), w)))
    const half = pill / 2 + bars[i]! * h * 0.42
    g.fillStyle = `rgba(255,255,255,${0.1 + 0.55 * bars[i]!})`
    g.beginPath()
    g.roundRect(x - pill / 2, mid - half, pill, half * 2, pill / 2)
    g.fill()
  }

  g.strokeStyle = 'rgba(255,255,255,.12)'
  g.lineWidth = 1
  g.beginPath(); g.moveTo(0, mid); g.lineTo(w, mid); g.stroke()

  // Response curve: ±MAX_DB fills the height, growing if EQ + tone + preamp push past it.
  const peak = Math.max(MAX_DB, ...curve.value.map(Math.abs))
  const scale = (h / 2 - 4) / peak
  const pts = curve.value.map((db, i) => [xOf(FREQS[i]!, w), mid - db * scale] as const)
  const grad = g.createLinearGradient(0, 0, 0, h)
  grad.addColorStop(0, 'rgba(198,244,50,.28)'); grad.addColorStop(0.5, 'rgba(198,244,50,.02)'); grad.addColorStop(1, 'rgba(198,244,50,.28)')
  g.beginPath(); g.moveTo(pts[0]![0], mid)
  for (const [x, y] of pts) g.lineTo(x, y)
  g.lineTo(w, mid); g.closePath(); g.fillStyle = grad; g.fill()
  g.lineJoin = 'round'; g.lineCap = 'round'
  for (const [width, color] of [[6, 'rgba(198,244,50,.3)'], [2, '#c6f432']] as const) {
    g.beginPath()
    pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)))
    g.lineWidth = width; g.strokeStyle = color; g.stroke()
  }
}

onMounted(() => { fx.panelOpen.value = true; raf = requestAnimationFrame(draw) })
onBeforeUnmount(() => { fx.panelOpen.value = false; cancelAnimationFrame(raf) })
</script>

<template>
  <canvas ref="canvas" class="graph" aria-label="Frequency response and live spectrum" role="img" />
</template>

<style scoped>
.graph { display: block; width: 100%; height: 100%; }
</style>
