// End-to-end check in real Google Chrome against the built app (run in CI, where YouTube is reachable).
// Phone + desktop: home, search, play (server stream or embedded fallback), Now Playing, lyrics,
// dislike, library, offline shell. Screenshots go to ./e2e-shots.
import { mkdirSync, writeFileSync } from 'node:fs'
import { chromium, devices } from 'playwright'

const BASE = process.env.BASE ?? 'http://localhost:3000'
const OUT = 'e2e-shots'
mkdirSync(OUT, { recursive: true })
const results = []
let failed = false
const ok = (name, pass, info = '') => {
  results.push(`${pass ? '✅' : '❌'} ${name}${info ? ` — ${info}` : ''}`)
  console.log(results.at(-1))
  if (!pass) failed = true
}
const warn = (name, info = '') => { results.push(`⚠️  ${name}${info ? ` — ${info}` : ''}`); console.log(results.at(-1)) }
// GitHub's runners share datacenter IPs that YouTube bot-checks, so in CI even the embedded
// player can't play. That's an environment limit, not an app bug: report it, don't fail on it.
let ytWalled = false
const playCheck = (name, pass, info) => (!pass && ytWalled) ? warn(`${name} (skipped: CI IP is bot-checked by YouTube)`) : ok(name, pass, info)
const shot = (page, name) => page.screenshot({ path: `${OUT}/${name}.png` }).catch(() => {})
const state = page => page.evaluate(() => {
  const p = window.__sonora
  if (!p) return null
  return { playing: p.isPlaying.value, buffering: p.isBuffering.value, pos: p.position.value, dur: p.duration.value, engine: p.engine.value, title: p.current.value?.title ?? null, queue: p.queue.value.length }
})
async function waitFor(fn, ms, step = 500) {
  const end = Date.now() + ms
  while (Date.now() < end) {
    const v = await fn().catch(() => null)
    if (v) return v
    await new Promise(r => setTimeout(r, step))
  }
  return null
}

const browser = await chromium.launch({
  channel: 'chrome', // real Chrome: AAC/H.264 + the YouTube embed work like for users
  args: ['--autoplay-policy=no-user-gesture-required'],
})

// ------------------------------------------------------------------ phone
{
  const ctx = await browser.newContext({ ...devices['Pixel 7'], locale: 'en-US', timezoneId: 'Asia/Phnom_Penh' })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', e => errors.push(String(e)))
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })

  const t0 = Date.now()
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' })
  const homeOk = await page.locator('.card').first().waitFor({ timeout: 30_000 }).then(() => true).catch(() => false)
  ok('home feed renders', homeOk, `${Date.now() - t0} ms to first song card`)
  await page.waitForTimeout(1500)
  await shot(page, 'phone-1-home')

  await page.goto(BASE + '/search', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(800)
  await shot(page, 'phone-2-search-browse')
  const input = page.getByRole('searchbox').or(page.locator('input[aria-label="Search"]')).first()
  await input.fill('shape of you')
  await page.waitForTimeout(900)
  await shot(page, 'phone-3-suggestions')
  await input.press('Enter')
  const searchOk = await page.locator('.song-row').first().waitFor({ timeout: 30_000 }).then(() => true).catch(() => false)
  const n = await page.locator('.song-row').count()
  ok('search results', searchOk && n > 3, `${n} rows`)
  await page.waitForTimeout(1000)
  await shot(page, 'phone-4-results')

  // Thai filter
  await input.fill('thai songs')
  await input.press('Enter')
  await page.waitForTimeout(2500)
  const blockedText = await page.getByText(/blocked/i).first().waitFor({ timeout: 10_000 }).then(() => true).catch(() => false)
  ok('Thai search is blocked', blockedText)
  await shot(page, 'phone-5-thai-blocked')

  // Play
  await input.fill('ed sheeran perfect')
  await input.press('Enter')
  await page.locator('.song-row').first().waitFor({ timeout: 30_000 }).catch(() => {})
  const tPlay = Date.now()
  await page.locator('.song-row .title').first().click()
  const playing = await waitFor(async () => {
    const s = await state(page)
    return s && s.playing && s.pos > 1.5 ? s : null
  }, 45_000)
  const ytDebug = await page.evaluate(() => window.__sonoraYt ?? null)
  if (!playing) {
    // Show what the embedded player says (CI runners share YouTube-flagged datacenter IPs).
    await page.evaluate(() => { const el = document.getElementById('yt-fallback'); if (el) Object.assign(el.style, { opacity: '1', zIndex: '9999', width: '360px', height: '240px' }) })
    await page.waitForTimeout(1500)
    await shot(page, 'phone-6b-embed-debug')
  }
  ytWalled = !playing && !!process.env.CI && [150, 152].includes(ytDebug?.error)
  playCheck('playback starts', !!playing, playing ? `engine=${playing.engine}, ${((Date.now() - tPlay) / 1000).toFixed(1)} s to 1.5 s of audio, queue ${playing.queue}` : JSON.stringify({ ...(await state(page)), yt: ytDebug }))
  await shot(page, 'phone-6-mini-player')

  // Radio fills the queue
  const radio = await waitFor(async () => { const s = await state(page); return s && s.queue > 5 ? s : null }, 20_000)
  ok('autoplay radio queue', !!radio, radio ? `${radio.queue} songs` : '')

  // Now Playing
  await page.locator('.mini').first().click({ position: { x: 140, y: 24 } }).catch(() => page.evaluate(() => { window.__sonora.nowPlayingOpen.value = true }))
  await page.waitForTimeout(1500)
  await shot(page, 'phone-7-now-playing')
  const lyricsBtn = page.locator('[aria-label="Lyrics"]:visible').first()
  if (await lyricsBtn.isVisible().catch(() => false)) {
    await lyricsBtn.click()
    const hasLyrics = await waitFor(async () => (await page.locator('.lyr .line').count()) > 3, 15_000)
    ok('synced lyrics show', !!hasLyrics)
    await page.waitForTimeout(2500)
    await shot(page, 'phone-8-lyrics')
  }
  else ok('lyrics button visible', false, 'Now Playing did not open')

  // Seek
  const before = await state(page)
  await page.evaluate(() => window.__sonora.seek(60))
  const seeked = await waitFor(async () => { const s = await state(page); return s && s.pos > 59 && s.pos < 75 && s.playing ? s : null }, 15_000)
  playCheck('seek', !!seeked, seeked ? `${before?.pos.toFixed(1)} → ${seeked.pos.toFixed(1)} s` : JSON.stringify(await state(page)))

  // Next track
  const firstTitle = (await state(page))?.title
  await page.locator('[aria-label="Next"]:visible').first().click().catch(() => page.evaluate(() => window.__sonora.next()))
  const nextOk = await waitFor(async () => { const s = await state(page); return s && s.title !== firstTitle && s.playing && s.pos > 1 ? s : null }, 40_000)
  playCheck('next track plays', !!nextOk, nextOk ? `${nextOk.title} (${nextOk.engine})` : '')

  // Dislike current → skipped, listed in Library
  const dislikedTitle = (await state(page))?.title
  await page.locator('[aria-label="Dislike"]:visible').first().click().catch(() => {})
  const skipped = await waitFor(async () => { const s = await state(page); return s && s.title !== dislikedTitle ? s : null }, 15_000)
  ok('dislike skips the song', !!skipped)
  await page.keyboard.press('Escape')
  await page.locator('[aria-label="Close player"]:visible').first().click().catch(() => {})
  await page.goto(BASE + '/collection/disliked', { waitUntil: 'domcontentloaded' })
  const inList = await page.getByText(dislikedTitle ?? '___', { exact: false }).first().waitFor({ timeout: 10_000 }).then(() => true).catch(() => false)
  ok('disliked song listed in Library → Disliked', inList, dislikedTitle ?? '')
  await shot(page, 'phone-9-disliked')

  await page.goto(BASE + '/library', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1200)
  await shot(page, 'phone-10-library')

  // YouTube Music sign-in: the Google device code appears
  await page.getByRole('button', { name: /Sign in with Google/ }).first().click().catch(() => {})
  const code = await page.locator('.code span').first().waitFor({ timeout: 20_000 }).then(() => page.locator('.code span').first().textContent()).catch(() => null)
  ok('sign-in shows a Google device code', !!code && code.length >= 6, code ?? '')
  await page.waitForTimeout(500)
  await shot(page, 'phone-10b-sign-in')
  await page.keyboard.press('Escape')

  // Offline: the app shell + library still load from the service worker
  await page.goto(BASE + '/', { waitUntil: 'load' })
  await page.waitForTimeout(4000) // let the SW install + precache
  await ctx.setOffline(true)
  const swReady = await page.evaluate(() => navigator.serviceWorker?.controller ? 'controlled' : navigator.serviceWorker?.ready.then(() => 'ready').catch(e => String(e)))
  const offlineOk = await page.reload({ waitUntil: 'domcontentloaded' }).then(() => page.locator('h1').first().waitFor({ timeout: 10_000 })).then(() => true).catch(() => false)
  ok('opens offline (service worker)', offlineOk, `sw: ${swReady}`)
  await page.goto(BASE + '/library', { waitUntil: 'domcontentloaded' }).catch(() => {})
  await page.waitForTimeout(1500)
  await shot(page, 'phone-11-offline-library')
  await ctx.setOffline(false)

  const real = errors.filter(e => !/youtube|googlevideo|doubleclick|ERR_INTERNET_DISCONNECTED|Failed to load resource|net::ERR|play\(\) request was interrupted/i.test(e))
  ok('no page errors', real.length === 0, real.slice(0, 5).join(' | '))
  await ctx.close()
}

// ------------------------------------------------------------------ desktop
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, locale: 'en-US' })
  const page = await ctx.newPage()
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' })
  await page.locator('.card').first().waitFor({ timeout: 30_000 }).catch(() => {})
  await page.waitForTimeout(1500)
  await shot(page, 'desktop-1-home')
  await page.locator('.card').first().click()
  const playing = await waitFor(async () => { const s = await state(page); return s && s.playing && s.pos > 1 ? s : null }, 45_000)
  playCheck('desktop: play from home card', !!playing, playing?.engine ?? '')
  await page.waitForTimeout(1000)
  await shot(page, 'desktop-2-playing')
  await page.locator('.bar [aria-label="Open player"], .bar .art, .bar img').first().click().catch(() => page.evaluate(() => { window.__sonora.nowPlayingOpen.value = true }))
  await page.waitForTimeout(3000)
  await shot(page, 'desktop-3-now-playing')
  await page.keyboard.press('Escape')
  await page.goto(BASE + '/search?q=khmer%20songs', { waitUntil: 'domcontentloaded' })
  await page.locator('.song-row').first().waitFor({ timeout: 30_000 }).catch(() => {})
  await page.waitForTimeout(1200)
  await shot(page, 'desktop-4-search')
  await ctx.close()
}

await browser.close()
writeFileSync(`${OUT}/summary.txt`, results.join('\n') + '\n')
process.exit(failed ? 1 : 0)
