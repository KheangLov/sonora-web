import type { Collection } from '#shared/types/music'

/** Route for opening a YouTube Music album / playlist / artist / mix inside Sonora. */
export function browseLink(c: Pick<Collection, 'id' | 'isQueue' | 'title' | 'subtitle' | 'thumbnail'>) {
  return {
    path: `/browse/${encodeURIComponent(c.id)}`,
    query: { ...(c.isQueue ? { queue: '1' } : {}), title: c.title, subtitle: c.subtitle, thumbnail: c.thumbnail },
  }
}
