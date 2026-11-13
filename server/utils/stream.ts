/**
 * Resolves a playable audio-only URL for a video id using youtubei.js, trying several
 * InnerTube clients until one gives a URL that googlevideo actually serves. The URL is
 * bound to this server's IP, so audio is proxied by /api/stream/[id].
 */
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Constants, Innertube, Platform, UniversalCache } from 'youtubei.js'
import type { Types } from 'youtubei.js'

// youtubei.js needs a JS evaluator to run YouTube's player code (signature + "n" transforms).
Platform.shim.eval = (data: { output: string }, env: Record<string, unknown>) => {
  const arg = (v: unknown) => JSON.stringify(typeof v === 'string' ? v : '')
  // eslint-disable-next-line no-new-func
  return new Function(`${data.output}\nreturn process(${arg(env.n)}, ${arg(env.sp)}, ${arg(env.sig)});`)()
}

type Client = Types.InnerTubeClient

/**
 * Clients that return audio without PO tokens (verified live in CI).
 * Tested 2026-11: BotGuard PO tokens (bgutils-js) do NOT get a flagged datacenter IP past
 * "confirm you're not a bot" for any client, so we don't generate them. When this server's IP
 * gets YouTube's "confirm you're not a bot" check, all of them fail together, so we stop early
 * and let the browser fall back to the embedded player (see app/composables/usePlayer.ts).
 */
const CLIENTS: Client[] = ['ANDROID_VR', 'IOS', 'VISIONOS', 'YTMUSIC', 'YTKIDS', 'WEB_EMBEDDED']
/** With a signed-in cookie (YT_COOKIE env), these clients also pass the bot check. */
const COOKIE_CLIENTS: Client[] = ['TV', 'WEB_EMBEDDED']
const DESKTOP_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36'

export interface ResolvedAudio {
  url: string
  userAgent: string
  mime: string
  size: number
  bitrate: number
  client: Client
  expiresAt: number
}

const playerCache = () => new UniversalCache(true, join(tmpdir(), 'sonora-ytjs'))

let tube: Promise<Innertube> | null = null
function innertube(): Promise<Innertube> {
  tube ??= Innertube.create({
    retrieve_player: true,
    generate_session_locally: true,
    // The player script is cached in /tmp, which survives between warm serverless invocations.
    cache: playerCache(),
  }).catch((e) => { tube = null; throw e })
  return tube
}

/** Optional: a YouTube cookie (from a spare Google account) makes server streaming much more reliable. */
let authed: Promise<Innertube> | null = null
function innertubeAuthed(): Promise<Innertube> | null {
  const cookie = process.env.YT_COOKIE?.trim()
  if (!cookie) return null
  authed ??= Innertube.create({ cookie, retrieve_player: true, cache: playerCache() })
    .catch((e) => { authed = null; throw e })
  return authed
}

/**
 * Signed-in listeners (see server/utils/auth.ts): their YouTube sign-in is added to player
 * requests, which gets past the datacenter "not a bot" check far more often.
 */
const SIGNED_CLIENTS: Client[] = ['TV', 'WEB_EMBEDDED', 'ANDROID_VR', 'IOS']
let signedTube: Promise<Innertube> | null = null
function innertubeSigned(): Promise<Innertube> {
  signedTube ??= Innertube.create({
    retrieve_player: true,
    generate_session_locally: true,
    cache: playerCache(),
    fetch: (input: RequestInfo | URL, init?: RequestInit) => {
      const auth = authStore.getStore()
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      if (!auth || !/\/youtubei\/v1\/(player|next)/.test(url)) return fetch(input, init)
      const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined))
      for (const [k, v] of Object.entries(authHeaders(auth, 'https://www.youtube.com'))) headers.set(k, v)
      return fetch(input, { ...init, headers })
    },
  }).catch((e) => { signedTube = null; throw e })
  return signedTube
}

/** Set when YouTube bot-checks this server; the browser uses its fallback player meanwhile. */
let botCheckedUntil = 0
export const isBotChecked = () => Date.now() < botCheckedUntil

const cache = new Map<string, ResolvedAudio>()
const inflight = new Map<string, Promise<ResolvedAudio>>()
/** Remember which client worked last, and try it first next time. */
let preferred: Client | null = null

export function invalidateAudio(id: string) {
  cache.delete(id)
}

export function resolveAudio(id: string, fresh = false): Promise<ResolvedAudio> {
  if (!fresh) {
    const hit = cache.get(id)
    if (hit && hit.expiresAt - Date.now() > 5 * 60_000) return Promise.resolve(hit)
  }
  const running = inflight.get(id)
  if (running) return running
  const p = doResolve(id).finally(() => inflight.delete(id))
  inflight.set(id, p)
  return p
}

async function doResolve(id: string): Promise<ResolvedAudio> {
  const errors: string[] = []
  const attempts: [Promise<Innertube>, Client][] = []
  const a = authStore.getStore()
  const signed = a && a.via !== 'web' ? innertubeSigned() : null
  if (signed) for (const c of SIGNED_CLIENTS) attempts.push([signed, c])
  const withCookie = innertubeAuthed()
  if (withCookie) for (const c of COOKIE_CLIENTS) attempts.push([withCookie, c])
  if (!isBotChecked()) {
    const order = preferred ? [preferred, ...CLIENTS.filter(c => c !== preferred)] : CLIENTS
    for (const c of order) attempts.push([innertube(), c])
  }
  if (!attempts.length) throw createError({ statusCode: 503, statusMessage: 'bot-check' })
  let botChecks = 0

  for (const [ytP, client] of attempts) {
    // Once two clients say "confirm you're not a bot", the IP is flagged: fail fast.
    if (botChecks >= (signed ? 4 : 2)) break
    try {
      const yt = await ytP
      const info = await yt.getBasicInfo(id, { client })
      const status = info.playability_status?.status
      if (status !== 'OK') {
        const reason = info.playability_status?.reason ?? ''
        if (/not a bot/i.test(reason)) botChecks++
        errors.push(`${client}: ${status} ${reason}`.trim())
        continue
      }
      const formats = (info.streaming_data?.adaptive_formats ?? []).filter(f => f.has_audio && !f.has_video)
      if (!formats.length) { errors.push(`${client}: no audio formats`); continue }
      // AAC in MP4 plays everywhere (incl. iOS Safari); fall back to the best Opus/WebM.
      const mp4 = formats.filter(f => f.mime_type.startsWith('audio/mp4')).sort((a, b) => b.bitrate - a.bitrate)
      const any = [...formats].sort((a, b) => b.bitrate - a.bitrate)
      const format = mp4[0] ?? any[0]!

      const url = await format.decipher(yt.session.player)
      if (!url) { errors.push(`${client}: empty url`); continue }
      const userAgent = (Constants.CLIENTS as Record<string, { USER_AGENT?: string }>)[client]?.USER_AGENT ?? DESKTOP_UA

      // Make sure googlevideo really serves it before we commit to this client.
      const probe = await fetch(url, { headers: { 'range': 'bytes=0-1', 'user-agent': userAgent } })
      await probe.body?.cancel()
      if (probe.status !== 206 && probe.status !== 200) { errors.push(`${client}: probe ${probe.status}`); continue }

      const u = new URL(url)
      const total = Number(probe.headers.get('content-range')?.split('/')[1])
      const size = Number(format.content_length) || Number(u.searchParams.get('clen')) || total || 0
      const resolved: ResolvedAudio = {
        url,
        userAgent,
        mime: format.mime_type.split(';')[0] || 'audio/mp4',
        size,
        bitrate: format.bitrate,
        client,
        expiresAt: (Number(u.searchParams.get('expire')) || Date.now() / 1000 + 5 * 3600) * 1000,
      }
      if (ytP !== withCookie && ytP !== signed) preferred = client
      cache.set(id, resolved)
      if (cache.size > 500) cache.delete(cache.keys().next().value!)
      return resolved
    }
    catch (e: any) {
      errors.push(`${client}: ${e?.message ?? e}`)
    }
  }
  if (botChecks >= 2) botCheckedUntil = Date.now() + 10 * 60_000
  console.error(`[stream] ${id} failed`, errors)
  throw createError({
    statusCode: botChecks >= 2 ? 503 : 502,
    statusMessage: botChecks >= 2 ? 'bot-check' : 'No playable audio stream',
    data: errors,
  })
}
