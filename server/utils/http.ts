import type { H3Event } from 'h3'

/** Cache at Vercel's edge (s-maxage) and serve stale while refreshing in the background. */
export function edgeCache(event: H3Event, seconds: number, swr = seconds * 4) {
  setResponseHeader(event, 'cache-control', `public, max-age=${Math.min(seconds, 300)}, s-maxage=${seconds}, stale-while-revalidate=${swr}`)
}

/** Two-letter region for YouTube's charts / home feed. Defaults to Cambodia. */
export function regionOf(event: H3Event): string {
  const gl = String(getQuery(event).gl ?? '').toUpperCase()
  return /^[A-Z]{2}$/.test(gl) ? gl : 'KH'
}
