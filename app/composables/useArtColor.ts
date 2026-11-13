import { ref, watch, type Ref } from 'vue'
import { art } from '~/utils/art'

const FALLBACK = '#3a3a44'
const cache = new Map<string, string>()

/**
 * The artwork's vibrant color, for the Now Playing gradient (like Palette on Android).
 * Downscales to 24×24 on a canvas; if the image host doesn't allow reading pixels we
 * simply keep the neutral fallback.
 */
function extract(url: string): Promise<string> {
  const hit = cache.get(url)
  if (hit) return Promise.resolve(hit)
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.decoding = 'async'
    img.onload = () => {
      try {
        const c = document.createElement('canvas')
        c.width = c.height = 24
        const ctx = c.getContext('2d', { willReadFrequently: true })!
        ctx.drawImage(img, 0, 0, 24, 24)
        const d = ctx.getImageData(0, 0, 24, 24).data
        let best = { score: -1, r: 58, g: 58, b: 68 }
        const buckets = new Map<number, { n: number, r: number, g: number, b: number }>()
        for (let i = 0; i < d.length; i += 4) {
          const r = d[i]!, g = d[i + 1]!, b = d[i + 2]!
          const key = ((r >> 5) << 6) | ((g >> 5) << 3) | (b >> 5)
          const e = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 }
          e.n++; e.r += r; e.g += g; e.b += b
          buckets.set(key, e)
        }
        for (const e of buckets.values()) {
          const r = e.r / e.n, g = e.g / e.n, b = e.b / e.n
          const max = Math.max(r, g, b), min = Math.min(r, g, b)
          const sat = max === 0 ? 0 : (max - min) / max
          const lum = max / 255
          // Prefer colorful, mid-bright, common colors.
          const score = e.n * (0.3 + sat) * (lum > 0.15 && lum < 0.95 ? 1 : 0.2)
          if (score > best.score) best = { score, r, g, b }
        }
        const hex = `#${[best.r, best.g, best.b].map(v => Math.round(v).toString(16).padStart(2, '0')).join('')}`
        cache.set(url, hex)
        resolve(hex)
      }
      catch { resolve(FALLBACK) }
    }
    img.onerror = () => resolve(FALLBACK)
    img.src = art(url, 64)
  })
}

export function useArtColor(url: Ref<string | undefined | null>) {
  const color = ref(FALLBACK)
  watch(url, async (u) => {
    if (!u) { color.value = FALLBACK; return }
    color.value = await extract(u)
  }, { immediate: true })
  return color
}
