/**
 * Equalizer settings, presets and filter math. Same values and curves as the Android app
 * (playback/fx/FxSettings.kt), so a preset sounds and looks the same on both.
 */

export const BAND_FREQS = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000] as const
export const MAX_DB = 15
export const TONE_MAX_DB = 12
export const BASS_HZ = 110
export const TREBLE_HZ = 9000
export const BAND_Q = 1.41
export const CUSTOM = 'Custom'
export const MIN_TEMPO = 0.5
export const MAX_TEMPO = 2
export const SPECTRUM_BARS = 28

export interface FxSettings {
  eqEnabled: boolean
  preamp: number // dB
  bands: number[] // dB per band
  presetName: string
  toneEnabled: boolean
  bass: number // 0..1
  treble: number // 0..1
  limiterEnabled: boolean
  balance: number // -1..1
  stereoExpand: number // 0..1
  mono: boolean
  tempo: number // 0.5..2
}

export const DEFAULT_FX: FxSettings = {
  eqEnabled: true,
  preamp: 0,
  bands: BAND_FREQS.map(() => 0),
  presetName: 'Flat',
  toneEnabled: true,
  bass: 0,
  treble: 0,
  limiterEnabled: true,
  balance: 0,
  stereoExpand: 0,
  mono: false,
  tempo: 1,
}

export interface EqPreset { name: string, preamp: number, bands: number[], builtIn?: boolean }

const p = (name: string, preamp: number, ...bands: number[]): EqPreset => ({ name, preamp, bands, builtIn: true })

export const BUILT_IN_PRESETS: EqPreset[] = [
  p('Flat', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0),
  p('Bass Boost', -3, 7, 6, 4.5, 2, 0, 0, 0, 0, 0, 0),
  p('Bass Reducer', 0, -6, -5, -3.5, -1.5, 0, 0, 0, 0, 0, 0),
  p('Treble Boost', -2, 0, 0, 0, 0, 0, 0, 1.5, 3.5, 5.5, 6.5),
  p('Vocal', -1, -2, -2, -1, 1, 3, 3.5, 3, 1.5, 0, -1),
  p('Pop', -1, -1, 0, 2, 3.5, 4, 2.5, 0.5, 0, 0.5, 1),
  p('Rock', -2, 5, 4, 2.5, 0, -1.5, -1, 1, 3, 4, 4.5),
  p('Electronic', -3, 5.5, 5, 2, 0, -2, 1.5, 0.5, 1.5, 4.5, 5),
  p('Hip-Hop', -3, 6, 5.5, 3, 1.5, -1, -1, 1, 0, 2, 3),
  p('Jazz', -1, 3.5, 2.5, 1, 2, -1.5, -1.5, 0, 1.5, 3, 3.5),
  p('Classical', -1, 4, 3, 2.5, 2, -1, -1, 0, 2, 3, 3.5),
  p('Acoustic', -1, 4, 3.5, 2.5, 1, 1.5, 1.5, 2.5, 3, 2.5, 1.5),
  p('Loudness', -4, 6, 4, 0, 0, -2, 0, -1, -4, 5, 1),
  p('Late Night', 0, 3, 2.5, 1.5, 0, -1, 0, 0.5, 1, 0, -1.5),
  p('Small Speakers', -3, 0, 0, 5, 4, 2.5, 1, 0, 1.5, 2.5, 0),
  p('Headphones', -2, 4.5, 6, 3, -1.5, -1, 1, 2.5, 5, 6.5, 7),
]

export const bandLabel = (hz: number) => (hz >= 1000 ? `${hz / 1000}K` : String(hz))

/** Anything audible changed? (Tints the entry-point icon; decides whether audio needs the effects graph.) */
export function fxActive(s: FxSettings): boolean {
  return (s.eqEnabled && (s.preamp !== 0 || s.bands.some(b => b !== 0)))
    || (s.toneEnabled && (s.bass > 0 || s.treble > 0))
    || s.balance !== 0 || s.stereoExpand > 0 || s.mono
}

// ------------------------------------------------------------------ response curve (RBJ cookbook)

interface Biquad { b0: number, b1: number, b2: number, a1: number, a2: number }

function norm(b0: number, b1: number, b2: number, a0: number, a1: number, a2: number): Biquad {
  return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0 }
}

function peaking(hz: number, q: number, db: number, fs: number): Biquad {
  const A = 10 ** (db / 40)
  const w = (2 * Math.PI * Math.min(hz, fs * 0.45)) / fs
  const c = Math.cos(w)
  const al = Math.sin(w) / (2 * q)
  return norm(1 + al * A, -2 * c, 1 - al * A, 1 + al / A, -2 * c, 1 - al / A)
}

function shelf(hz: number, db: number, fs: number, high: boolean): Biquad {
  const A = 10 ** (db / 40)
  const w = (2 * Math.PI * Math.min(hz, fs * 0.45)) / fs
  const c = Math.cos(w)
  const sa = 2 * Math.sqrt(A) * (Math.sin(w) / 2) * Math.SQRT2
  return high
    ? norm(A * ((A + 1) + (A - 1) * c + sa), -2 * A * ((A - 1) + (A + 1) * c), A * ((A + 1) + (A - 1) * c - sa),
        (A + 1) - (A - 1) * c + sa, 2 * ((A - 1) - (A + 1) * c), (A + 1) - (A - 1) * c - sa)
    : norm(A * ((A + 1) - (A - 1) * c + sa), 2 * A * ((A - 1) - (A + 1) * c), A * ((A + 1) - (A - 1) * c - sa),
        (A + 1) + (A - 1) * c + sa, -2 * ((A - 1) + (A + 1) * c), (A + 1) + (A - 1) * c - sa)
}

function magDb(f: Biquad, hz: number, fs: number): number {
  const w = (2 * Math.PI * hz) / fs
  const c1 = Math.cos(w), s1 = Math.sin(w), c2 = Math.cos(2 * w), s2 = Math.sin(2 * w)
  const nr = f.b0 + f.b1 * c1 + f.b2 * c2, ni = -(f.b1 * s1 + f.b2 * s2)
  const dr = 1 + f.a1 * c1 + f.a2 * c2, di = -(f.a1 * s1 + f.a2 * s2)
  return 10 * Math.log10(Math.max(1e-12, (nr * nr + ni * ni) / (dr * dr + di * di)))
}

/** Total response (dB) of EQ + tone at each frequency, for drawing the curve. */
export function fxResponse(s: FxSettings, freqs: number[], fs = 48000): number[] {
  const filters: Biquad[] = []
  if (s.eqEnabled) s.bands.forEach((db, i) => { if (Math.abs(db) >= 0.05) filters.push(peaking(BAND_FREQS[i]!, BAND_Q, db, fs)) })
  if (s.toneEnabled) {
    if (s.bass > 0.005) filters.push(shelf(BASS_HZ, s.bass * TONE_MAX_DB, fs, false))
    if (s.treble > 0.005) filters.push(shelf(TREBLE_HZ, s.treble * TONE_MAX_DB, fs, true))
  }
  const pre = s.eqEnabled ? s.preamp : 0
  return freqs.map(hz => filters.reduce((db, f) => db + magDb(f, hz, fs), pre))
}

/** Log-spaced frequencies 20 Hz – 20 kHz. */
export function logFreqs(n: number, min = 20, max = 20000): number[] {
  return Array.from({ length: n }, (_, i) => min * (max / min) ** (i / (n - 1)))
}

/** Analyzer band centres, 40 Hz – 16 kHz. */
export const spectrumFreq = (i: number) => 40 * (16000 / 40) ** (i / (SPECTRUM_BARS - 1))

/** Cool when subtle, lime in the middle, amber when pushed (like Poweramp's knobs). */
export function heatColor(t: number): string {
  const x = Math.max(0, Math.min(1, t))
  const mix = (a: number[], b: number[], k: number) => a.map((v, i) => Math.round(v + (b[i]! - v) * k))
  const teal = [94, 234, 212], lime = [198, 244, 50], amber = [255, 197, 61]
  const c = x < 0.5 ? mix(teal, lime, x / 0.5) : mix(lime, amber, (x - 0.5) / 0.5)
  return `rgb(${c.join(',')})`
}
