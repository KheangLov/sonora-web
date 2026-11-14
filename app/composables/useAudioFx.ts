import { ref, watch } from 'vue'
import {
  BAND_FREQS, BAND_Q, BASS_HZ, CUSTOM, DEFAULT_FX, MAX_DB, MAX_TEMPO, MIN_TEMPO, SPECTRUM_BARS, TONE_MAX_DB, TREBLE_HZ,
  fxActive, spectrumFreq,
} from '~/utils/fx'
import type { EqPreset, FxSettings } from '~/utils/fx'

/**
 * Equalizer + effects for the web player, built on Web Audio:
 *
 *   <audio> → preamp → 10 peaking bands → bass/treble shelves → stereo matrix (width, mono, balance)
 *           → limiter → analyser → speakers
 *
 * The <audio> element is only routed through Web Audio once an effect is actually on (or the
 * equalizer screen is open), because some phones pause Web Audio in the background. Tempo uses the
 * element's own playbackRate (pitch preserved) and works with the YouTube fallback player too.
 * The fallback player is a cross-origin iframe, so EQ can't reach it.
 */

const KEY = 'sonora-fx'
const PRESETS_KEY = 'sonora-fx-presets'

const settings = ref<FxSettings>({ ...DEFAULT_FX, bands: [...DEFAULT_FX.bands] })
const customPresets = ref<EqPreset[]>([])
/** True while the equalizer screen is visible (feeds the spectrum). */
const panelOpen = ref(false)
/** Audio is going through the effects graph. */
const routed = ref(false)

let loaded = false
let el: HTMLAudioElement | null = null
let onRate: ((rate: number) => void) | null = null

interface Graph {
  ctx: AudioContext
  pre: GainNode
  bands: BiquadFilterNode[]
  bass: BiquadFilterNode
  treble: BiquadFilterNode
  ll: GainNode, rl: GainNode, lr: GainNode, rr: GainNode
  limiter: DynamicsCompressorNode
  analyser: AnalyserNode
}
let graph: Graph | null = null

function load() {
  if (loaded || !import.meta.client) return
  loaded = true
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? 'null')
    if (s) settings.value = { ...DEFAULT_FX, ...s, bands: Array.isArray(s.bands) && s.bands.length === BAND_FREQS.length ? s.bands : [...DEFAULT_FX.bands] }
  }
  catch {}
  try { customPresets.value = JSON.parse(localStorage.getItem(PRESETS_KEY) ?? '[]') } catch {}

  let saveTimer: ReturnType<typeof setTimeout> | null = null
  watch(settings, (s) => {
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => { try { localStorage.setItem(KEY, JSON.stringify(s)) } catch {} }, 300)
    apply()
  }, { deep: true })
  watch(customPresets, v => { try { localStorage.setItem(PRESETS_KEY, JSON.stringify(v)) } catch {} }, { deep: true })
  watch(panelOpen, () => apply())

  // Browsers start audio contexts suspended until the user interacts; resume on the next gesture.
  const resume = () => { if (graph && graph.ctx.state !== 'running') graph.ctx.resume().catch(() => {}) }
  window.addEventListener('pointerdown', resume, { capture: true, passive: true })
  window.addEventListener('keydown', resume, { capture: true })
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') resume() })
}

/** Called by the player when it creates its <audio> element. */
function attach(audio: HTMLAudioElement, setRate: (rate: number) => void) {
  load()
  el = audio
  onRate = setRate
  ;(audio as any).preservesPitch = true
  audio.addEventListener('play', () => {
    applyRate()
    if (graph && graph.ctx.state !== 'running') graph.ctx.resume().catch(() => {})
  })
  apply()
}

function buildGraph(): Graph | null {
  if (graph || !el) return graph
  const AC: typeof AudioContext | undefined = window.AudioContext ?? (window as any).webkitAudioContext
  if (!AC) return null
  try {
    const ctx = new AC({ latencyHint: 'playback' })
    const src = ctx.createMediaElementSource(el)
    const pre = ctx.createGain()
    // Force stereo so mono sources reach both speakers through the splitter.
    pre.channelCount = 2
    pre.channelCountMode = 'explicit'
    pre.channelInterpretation = 'speakers'
    const bands = BAND_FREQS.map((hz) => {
      const f = ctx.createBiquadFilter()
      f.type = 'peaking'
      f.frequency.value = hz
      f.Q.value = BAND_Q
      return f
    })
    const bass = ctx.createBiquadFilter()
    bass.type = 'lowshelf'
    bass.frequency.value = BASS_HZ
    const treble = ctx.createBiquadFilter()
    treble.type = 'highshelf'
    treble.frequency.value = TREBLE_HZ
    const split = ctx.createChannelSplitter(2)
    const merge = ctx.createChannelMerger(2)
    const ll = ctx.createGain(), rl = ctx.createGain(), lr = ctx.createGain(), rr = ctx.createGain()
    const limiter = ctx.createDynamicsCompressor()
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 4096
    analyser.smoothingTimeConstant = 0.6

    src.connect(pre)
    let node: AudioNode = pre
    for (const f of [...bands, bass, treble]) { node.connect(f); node = f }
    node.connect(split)
    // L' = ll·L + rl·R, R' = lr·L + rr·R
    split.connect(ll, 0); ll.connect(merge, 0, 0)
    split.connect(rl, 1); rl.connect(merge, 0, 0)
    split.connect(lr, 0); lr.connect(merge, 0, 1)
    split.connect(rr, 1); rr.connect(merge, 0, 1)
    merge.connect(limiter)
    limiter.connect(analyser)
    analyser.connect(ctx.destination)

    // If the phone suspends audio (call, lock screen) while music should play, pick it back up.
    ctx.addEventListener('statechange', () => {
      if (ctx.state !== 'running' && el && !el.paused && document.visibilityState === 'visible') ctx.resume().catch(() => {})
    })
    graph = { ctx, pre, bands, bass, treble, ll, rl, lr, rr, limiter, analyser }
    routed.value = true
    if (!el.paused) ctx.resume().catch(() => {})
    return graph
  }
  catch {
    return null
  }
}

function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

function applyRate() {
  const t = Math.min(MAX_TEMPO, Math.max(MIN_TEMPO, settings.value.tempo))
  if (el) {
    el.defaultPlaybackRate = t
    el.playbackRate = t
  }
  onRate?.(t)
}

function apply() {
  if (!import.meta.client) return
  const s = settings.value
  applyRate()
  // Routing can't be undone for an element, so only start once it's needed. On iPhone/iPad, Web Audio
  // can stop when the screen locks, so just opening the screen (for the spectrum) doesn't route there.
  if (!graph && (fxActive(s) || (panelOpen.value && !isIOS()))) buildGraph()
  const g = graph
  if (!g) return
  const now = g.ctx.currentTime
  const set = (p: AudioParam, v: number) => p.setTargetAtTime(v, now, 0.015)

  set(g.pre.gain, s.eqEnabled ? 10 ** (s.preamp / 20) : 1)
  g.bands.forEach((f, i) => set(f.gain, s.eqEnabled ? s.bands[i] ?? 0 : 0))
  set(g.bass.gain, s.toneEnabled ? s.bass * TONE_MAX_DB : 0)
  set(g.treble.gain, s.toneEnabled ? s.treble * TONE_MAX_DB : 0)

  const w = s.mono ? 0 : 1 + s.stereoExpand * 1.5
  const a = (1 + w) / 2, b = (1 - w) / 2
  const balL = s.balance > 0 ? 1 - s.balance : 1
  const balR = s.balance < 0 ? 1 + s.balance : 1
  set(g.ll.gain, a * balL); set(g.rl.gain, b * balL)
  set(g.lr.gain, b * balR); set(g.rr.gain, a * balR)

  // Limiter on: a brick-wall-ish compressor just under 0 dBFS. Off: transparent.
  if (s.limiterEnabled) {
    set(g.limiter.threshold, -1); set(g.limiter.knee, 0); set(g.limiter.ratio, 20)
    set(g.limiter.attack, 0.002); set(g.limiter.release, 0.12)
  }
  else {
    set(g.limiter.threshold, 0); set(g.limiter.knee, 0); set(g.limiter.ratio, 1)
  }
}

// ------------------------------------------------------------------ spectrum

let fft: Uint8Array<ArrayBuffer> | null = null
/** Fills `out` (length SPECTRUM_BARS, 0..1) with the current spectrum. Returns false if there's none. */
function readSpectrum(out: Float32Array): boolean {
  const g = graph
  if (!g || g.ctx.state !== 'running' || !el || el.paused) return false
  const an = g.analyser
  if (!fft || fft.length !== an.frequencyBinCount) fft = new Uint8Array(an.frequencyBinCount)
  an.getByteFrequencyData(fft)
  const binHz = g.ctx.sampleRate / an.fftSize
  for (let i = 0; i < SPECTRUM_BARS; i++) {
    const c = spectrumFreq(i)
    const lo = Math.max(1, Math.floor((c / 1.12) / binHz))
    const hi = Math.max(lo, Math.min(fft.length - 1, Math.ceil((c * 1.12) / binHz)))
    let sum = 0
    for (let k = lo; k <= hi; k++) sum += fft[k]!
    const v = sum / (hi - lo + 1) / 255
    out[i] = Math.max(0, Math.min(1, (v - 0.15) / 0.8))
  }
  return true
}

// ------------------------------------------------------------------ actions

function update(patch: Partial<FxSettings>) {
  settings.value = { ...settings.value, ...patch }
}

const clampDb = (v: number) => Math.max(-MAX_DB, Math.min(MAX_DB, v))

export function useAudioFx() {
  load()
  return {
    settings,
    customPresets,
    panelOpen,
    routed,
    attach,
    readSpectrum,
    update,
    setBand(i: number, db: number) {
      const bands = [...settings.value.bands]
      bands[i] = clampDb(db)
      update({ bands, eqEnabled: true, presetName: CUSTOM })
    },
    setPreamp: (db: number) => update({ preamp: clampDb(db), eqEnabled: true }),
    applyPreset: (p: EqPreset) => update({ preamp: p.preamp, bands: [...p.bands], presetName: p.name, eqEnabled: true }),
    resetEq: () => update({ preamp: 0, bands: BAND_FREQS.map(() => 0), presetName: 'Flat', bass: 0, treble: 0 }),
    resetEffects: () => update({ balance: 0, stereoExpand: 0, mono: false, tempo: 1 }),
    savePreset(name: string) {
      const clean = name.trim().slice(0, 32)
      if (!clean) return
      const s = settings.value
      customPresets.value = [
        ...customPresets.value.filter(p => p.name.toLowerCase() !== clean.toLowerCase()),
        { name: clean, preamp: s.preamp, bands: [...s.bands] },
      ]
      update({ presetName: clean })
    },
    deletePreset(name: string) {
      customPresets.value = customPresets.value.filter(p => p.name !== name)
    },
  }
}
