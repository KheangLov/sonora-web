/**
 * "Check connection": tries each thing your sign-in is used for and reports what works,
 * so problems are visible instead of silent.
 */
export default defineEventHandler(event => withAuth(event, async (auth) => {
  if (!auth) throw createError({ statusCode: 401, statusMessage: 'Not signed in' })
  const run = async (name: string, fn: () => Promise<string>) => {
    const t = Date.now()
    try { return { name, ok: true, detail: await fn(), ms: Date.now() - t } }
    catch (e: any) { return { name, ok: false, detail: String(e?.statusMessage ?? e?.message ?? e), ms: Date.now() - t } }
  }
  const results = []
  if (auth.via === 'web') {
    results.push(await run('Google account', async () => { const a = await dataProfile(); return a.name ?? a.handle ?? 'signed in' }))
    results.push(await run('Liked music', async () => `${(await dataLiked(1)).length}+ songs`))
    results.push(await run('Your playlists', async () => `${(await dataPlaylists()).length} playlists`))
    results.push(await run('Audio from Sonora\'s server', async () => `ok via ${(await resolveAudio('dQw4w9WgXcQ', true)).client}`))
    return { method: 'web', results }
  }
  results.push(await run('Account', async () => { const a = await accountInfo(); return a.name ?? 'signed in' }))
  results.push(await run('Your home feed', async () => { const h = await homeFeed(); if (!h.length) throw new Error('empty'); return `${h.length} shelves: ${h.slice(0, 3).map(s => s.title).join(', ')}` }))
  results.push(await run('Liked music', async () => { const c = await collection({ id: 'VLLM', isQueue: false }, undefined, 1); return `${c.songs.length} songs` }))
  results.push(await run('Your playlists', async () => `${(await libraryPlaylists()).length} playlists`))
  results.push(await run('Audio from Sonora\'s server', async () => {
    const a = await resolveAudio('dQw4w9WgXcQ', true)
    return `ok via ${a.client}`
  }))
  return { method: auth.via ?? 'cookie', results }
}))
