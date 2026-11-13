// Diagnostic: does a BotGuard PO token get past "confirm you're not a bot" on a flagged IP?
import { Innertube, Platform, UniversalCache, Constants } from 'youtubei.js'
import { BG } from 'bgutils-js'
import { JSDOM } from 'jsdom'
Platform.shim.eval = (data, env) => {
  const a = v => JSON.stringify(typeof v === 'string' ? v : '')
  return new Function(`${data.output}\nreturn process(${a(env.n)}, ${a(env.sp)}, ${a(env.sig)});`)()
}
const base = await Innertube.create({ retrieve_player: false })
const visitorData = base.session.context.client.visitorData
const dom = new JSDOM('<!DOCTYPE html><html><head></head><body></body></html>', { url: 'https://www.youtube.com/', referrer: 'https://www.youtube.com/' })
Object.assign(globalThis, { window: dom.window, document: dom.window.document, location: dom.window.location, origin: dom.window.origin })
if (!Reflect.has(globalThis, 'navigator')) Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator })
const bgConfig = { fetch: (i, init) => fetch(i, init), globalObj: globalThis, identifier: visitorData, requestKey: 'O43z0dpjhgX20SCx4KAo' }
const challenge = await BG.Challenge.create(bgConfig)
const js = challenge.interpreterJavascript.privateDoNotAccessOrElseSafeScriptWrappedValue
new Function(js)()
const po = await BG.PoToken.generate({ program: challenge.program, globalName: challenge.globalName, bgConfig })
console.log('poToken', po.poToken?.slice(0, 20), 'visitor', visitorData.slice(0, 12))
const yt = await Innertube.create({ retrieve_player: true, po_token: po.poToken, visitor_data: visitorData, cache: new UniversalCache(false) })
for (const id of ['JGwWNGJdvx8', 'kJQP7kiw5Fk', 'fJ9rUzIMcZQ', '60ItHLz5WEA']) for (const client of ['WEB', 'MWEB', 'WEB_EMBEDDED', 'TV', 'IOS', 'ANDROID_VR', 'VISIONOS']) {
  try {
    const info = await yt.getBasicInfo(id, { client })
    const st = info.playability_status?.status
    let extra = ''
    if (st === 'OK') {
      const f = (info.streaming_data?.adaptive_formats ?? []).find(f => f.has_audio && !f.has_video)
      if (f) {
        const url = await f.decipher(yt.session.player)
        const r = await fetch(url, { headers: { range: 'bytes=0-1023', 'user-agent': Constants.CLIENTS[client]?.USER_AGENT ?? 'Mozilla/5.0' } })
        extra = `probe=${r.status}`
      } else extra = 'no audio'
    }
    console.log('PO', id, client.padEnd(14), st, info.playability_status?.reason ?? '', extra)
  } catch (e) { console.log('PO', id, client.padEnd(14), 'ERR', String(e.message).slice(0, 100)) }
}
