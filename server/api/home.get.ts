import type { HomeSection } from '#shared/types/music'

interface Spec { title: string, subtitle?: string, query?: string }

/**
 * Home feed: curated shelves (like the Android app) + YouTube Music's own home for your region.
 * Cached at the edge for 30 minutes, so it's instant for everyone after the first visit.
 * Your personal "Quick picks" is built in the browser from what you last played.
 */
export default defineEventHandler(event => withAuth(event, async (auth) => {
  const gl = regionOf(event)
  const year = new Date().getFullYear()
  const specs: Spec[] = [
    { title: 'Trending now', subtitle: 'What everyone\'s playing', query: `trending songs ${year}` },
    ...(gl === 'KH' ? [{ title: 'Khmer hits', subtitle: 'Fresh from Cambodia', query: `khmer new songs ${year}` }] : []),
    { title: 'Viral right now', query: `viral songs ${year}` },
    { title: 'Chill vibes', subtitle: 'Slow down for a bit', query: 'chill vibes songs' },
    { title: 'Feel-good pop', query: 'feel good pop hits' },
    { title: 'Hip-hop heat', query: `hip hop hits ${year}` },
    { title: 'Throwback', subtitle: 'Hits you still know every word to', query: '2010s throwback hits' },
  ]

  // Signed in: your own YouTube Music home (Quick picks, Listen again, Mixed for you…) comes first.
  const personal = auth ? await homeFeed(gl).catch(() => [] as HomeSection[]) : []
  if (personal.length) {
    const curatedOnly = await Promise.all(specs.slice(0, 3).map(async (s): Promise<HomeSection | null> => {
      const page = await authStore.run(null, () => startSearch(s.query!, gl)).catch(() => null)
      return page?.songs.length ? { title: s.title, subtitle: s.subtitle, songs: page.songs.slice(0, 20), collections: [] } : null
    }))
    const seen = new Set<string>()
    return filterSections([...personal, ...curatedOnly.filter((s): s is HomeSection => !!s)])
      .filter(s => !seen.has(s.title.toLowerCase()) && !!seen.add(s.title.toLowerCase()))
  }

  const [curated, ytHome] = await authStore.run(null, () => Promise.all([
    Promise.all(specs.map(async (s): Promise<HomeSection | null> => {
      const page = await startSearch(s.query!, gl).catch(() => null)
      if (!page?.songs.length) return null
      return { title: s.title, subtitle: s.subtitle, songs: page.songs.slice(0, 20), collections: [] }
    })),
    homeFeed(gl).catch(() => [] as HomeSection[]),
  ]))

  const sections = [...curated.filter((s): s is HomeSection => !!s), ...ytHome]
  const seen = new Set<string>()
  const result = filterSections(sections).filter(s => !seen.has(s.title.toLowerCase()) && !!seen.add(s.title.toLowerCase()))
  if (!result.length) throw createError({ statusCode: 502, statusMessage: 'Home feed unavailable' })
  edgeCache(event, 1800, 6 * 3600)
  return result
}))
