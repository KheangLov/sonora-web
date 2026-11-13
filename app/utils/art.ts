/**
 * Artwork at the size it's shown: small rows never download big images.
 * googleusercontent art is resized server-side by YouTube; ytimg video thumbnails
 * use a 16:9 frame without letterboxing (cropped to a square with object-fit).
 */
export function art(url: string | undefined | null, px: number): string {
  if (!url) return ''
  const size = Math.min(1200, Math.round(px * Math.min(2, globalThis.devicePixelRatio || 1)))
  if (/googleusercontent\.com|ggpht\.com/.test(url)) {
    return url.replace(/=w\d+-h\d+[^&?]*$/, `=w${size}-h${size}-l90-rj`).replace(/=s\d+[^&?]*$/, `=s${size}`)
  }
  const m = /i\.ytimg\.com\/vi(?:_webp)?\/([\w-]{11})\//.exec(url)
  if (m) return `https://i.ytimg.com/vi/${m[1]}/${size <= 320 ? 'mqdefault' : 'hq720'}.jpg`
  return url
}

/** Fallback when hq720 doesn't exist for a video. */
export function artFallback(url: string): string | null {
  const m = /i\.ytimg\.com\/vi\/([\w-]{11})\/hq720\.jpg/.exec(url)
  return m ? `https://i.ytimg.com/vi/${m[1]}/hqdefault.jpg` : null
}
