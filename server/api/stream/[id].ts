/**
 * Audio proxy with HTTP Range support. Answers every request with at most CHUNK bytes,
 * so the <audio> element streams in small 206 pieces: playback starts instantly,
 * seeking is free, and googlevideo never throttles a huge open-ended range.
 */
const CHUNK = 2 * 1024 * 1024
const ID = /^[\w-]{11}$/

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') ?? ''
  if (!ID.test(id)) throw createError({ statusCode: 400, statusMessage: 'Bad id' })

  const range = parseRange(getRequestHeader(event, 'range'))
  let audio = await resolveAudio(id)
  let upstream = await fetchRange(audio, range)
  if (upstream.status === 403 || upstream.status === 410 || upstream.status >= 500) {
    // Expired or IP-rotated URL: resolve a fresh one once.
    await upstream.body?.cancel()
    invalidateAudio(id)
    audio = await resolveAudio(id, true)
    upstream = await fetchRange(audio, range)
  }
  if (!upstream.ok) {
    await upstream.body?.cancel()
    throw createError({ statusCode: 502, statusMessage: `Upstream ${upstream.status}` })
  }

  const contentRange = upstream.headers.get('content-range')
  const total = Number(contentRange?.split('/')[1]) || audio.size
  const headers: Record<string, string> = {
    'content-type': audio.mime,
    'accept-ranges': 'bytes',
    // The audio for a video id never changes: let the browser keep it.
    'cache-control': 'public, max-age=604800, immutable',
    'x-sonora-client': audio.client,
  }
  const len = upstream.headers.get('content-length')
  if (len) headers['content-length'] = len
  if (contentRange) headers['content-range'] = contentRange
  else if (total) headers['content-range'] = `bytes ${range.start}-${range.start + Number(len ?? 0) - 1}/${total}`

  if (event.method === 'HEAD') {
    await upstream.body?.cancel()
    return new Response(null, { status: 206, headers })
  }
  return new Response(upstream.body, { status: 206, headers })
})

function parseRange(h: string | undefined): { start: number, end: number | null } {
  const m = /^bytes=(\d*)-(\d*)$/.exec(h?.trim() ?? '')
  if (!m) return { start: 0, end: null }
  const start = m[1] ? Number(m[1]) : 0
  const end = m[2] ? Number(m[2]) : null
  return { start, end }
}

function fetchRange(audio: ResolvedAudio, r: { start: number, end: number | null }) {
  let end = r.end ?? r.start + CHUNK - 1
  end = Math.min(end, r.start + CHUNK - 1)
  if (audio.size) end = Math.min(end, audio.size - 1)
  return fetch(audio.url, {
    headers: { 'range': `bytes=${r.start}-${end}`, 'user-agent': audio.userAgent },
  })
}
