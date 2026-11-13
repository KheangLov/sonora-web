/**
 * Artwork at the size it's shown: small rows never download big images.
 * googleusercontent art is resized server-side by YouTube; ytimg video thumbnails
 * use a 16:9 frame without letterboxing (cropped to a square with object-fit).
 */
export function art(url: string | undefined | null, px: number): string {
  if (!url) return ''
  const size = Math.min(1200, Math.round(px * Math.min(2, globalThis.devicePixelRatio || 1)))
  if (/googleusercontent\.com|ggpht\.com/.test(url)) {
    // -rw = WebP (about a third smaller than the JPEG YouTube serves by default).
    return url.replace(/=w\d+-h\d+[^&?]*$/, `=w${size}-h${size}-l90-rw`).replace(/=s\d+[^&?]*$/, `=s${size}-rw`)
  }
  const m = /i\.ytimg\.com\/vi(?:_webp)?\/([\w-]{11})\//.exec(url)
  if (m) return `https://i.ytimg.com/vi_webp/${m[1]}/${size <= 320 ? 'mqdefault' : 'hq720'}.webp`
  return url
}

/** Next thing to try when an image fails: WebP → JPEG, hq720 → hqdefault. */
export function artFallback(url: string): string | null {
  const m = /i\.ytimg\.com\/vi(_webp)?\/([\w-]{11})\/(\w+)\.(webp|jpg)/.exec(url)
  if (!m) return null
  const [, webp, id, name] = m
  if (webp) return `https://i.ytimg.com/vi/${id}/${name}.jpg`
  if (name === 'hq720') return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`
  return null
}
