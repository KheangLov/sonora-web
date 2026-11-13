import type { HomeSection, SearchPage, Song } from '#shared/types/music'

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

export const api = {
  home: (force = false) => {
    if (force) memo.delete('home')
    return cached('home', 30 * 60_000, () => $fetch<HomeSection[]>('/api/home', { query: { gl: region() } }))
  },
  search: (q: string) => cached(`s:${q}`, 10 * 60_000, () => $fetch<SearchPage>('/api/search', { query: { q, gl: region() } })),
  more: (next: string) => $fetch<SearchPage>('/api/search', { query: { next, gl: region() } }),
  suggest: (q: string) => cached(`sg:${q}`, 60 * 60_000, () => $fetch<string[]>('/api/suggest', { query: { q, gl: region() } })),
  radio: (id: string) => cached(`r:${id}`, 30 * 60_000, () => $fetch<Song[]>(`/api/radio/${id}`, { query: { gl: region() } })),
  collection: (q: Record<string, string>) =>
    cached(`c:${q.id}:${q.queue ?? ''}`, 30 * 60_000, () => $fetch<{ title: string, subtitle: string, thumbnail: string, songs: Song[], sections: HomeSection[] }>('/api/collection', { query: { ...q, gl: region() } })),
}
