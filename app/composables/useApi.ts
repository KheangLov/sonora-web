import type { Collection, HomeSection, SearchPage, Song } from '#shared/types/music'

/** Small in-memory cache so moving between tabs is instant (the service worker covers reloads). */
const memo = new Map<string, { at: number, data: unknown }>()

async function cached<T>(key: string, ttl: number, fn: () => Promise<T>): Promise<T> {
  const hit = memo.get(key)
  if (hit && Date.now() - hit.at < ttl) return hit.data as T
  const data = await fn()
  memo.set(key, { at: Date.now(), data })
  return data
}

export function peek<T>(key: string): T | undefined {
  return memo.get(key)?.data as T | undefined
}

/** Forget cached feeds (after signing in or out). */
export function clearApiMemo() {
  memo.clear()
}

/** For personal requests: a fresh sign-in token, and a cache key per account. */
async function who(): Promise<string> {
  const acc = useAccount()
  if (!acc.signedIn.value) return ''
  await acc.ensureFresh()
  return acc.key.value
}

export interface CollectionData { title: string, subtitle: string, thumbnail: string, songs: Song[], sections: HomeSection[] }

export const api = {
  async home(force = false) {
    const u = await who()
    const key = `home:${u}`
    if (force) memo.delete(key)
    return cached(key, 30 * 60_000, () => $fetch<HomeSection[]>('/api/home', { query: { gl: region(), ...(u ? { u } : {}) } }))
  },
  search: (q: string) => cached(`s:${q}`, 10 * 60_000, () => $fetch<SearchPage>('/api/search', { query: { q, gl: region() } })),
  more: (next: string) => $fetch<SearchPage>('/api/search', { query: { next, gl: region() } }),
  suggest: (q: string) => cached(`sg:${q}`, 60 * 60_000, () => $fetch<string[]>('/api/suggest', { query: { q, gl: region() } })),
  radio: (id: string) => cached(`r:${id}`, 30 * 60_000, () => $fetch<Song[]>(`/api/radio/${id}`, { query: { gl: region() } })),
  async collection(q: Record<string, string>) {
    const u = await who()
    return cached(`c:${q.id}:${q.queue ?? ''}:${u}`, 30 * 60_000, () => $fetch<CollectionData>('/api/collection', { query: { ...q, gl: region(), ...(u ? { u } : {}) } }))
  },
  async myPlaylists(force = false) {
    const u = await who()
    if (!u) return []
    if (force) memo.delete(`mypl:${u}`)
    return cached(`mypl:${u}`, 10 * 60_000, () => $fetch<Collection[]>('/api/me/playlists'))
  },
  async checkConnection() {
    await who()
    return $fetch<{ method: string, results: { name: string, ok: boolean, detail: string, ms: number }[] }>('/api/me/check')
  },
}
