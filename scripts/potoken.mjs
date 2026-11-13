// Diagnostic: does a BotGuard PO token get past "confirm you're not a bot" on a flagged datacenter IP?
import { Innertube, Platform, UniversalCache, Constants } from 'youtubei.js'
import { BotGuardClient, WebPoMinter, buildURL, GOOG_API_KEY, USER_AGENT } from 'bgutils-js/botguard'
import { JSDOM } from 'jsdom'

Platform.shim.eval = (data, env) => {
  const a = v => JSON.stringify(typeof v === 'string' ? v : '')
  return new Function(`${data.output}\nreturn process(${a(env.n)}, ${a(env.sp)}, ${a(env.sig)});`)()
}

const t0 = Date.now()
const base = await Innertube.create({ retrieve_player: false })
const visitorData = base.session.context.client.visitorData

const dom = new JSDOM('<!DOCTYPE html><html><head></head><body></body></html>', { url: 'https://www.youtube.com/', referrer: 'https://www.youtube.com/' })
Object.assign(globalThis, { window: dom.window, document: dom.window.document, location: dom.window.location, origin: dom.window.origin })
if (!Reflect.has(globalThis, 'navigator')) Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator })

const ch = await base.getAttestationChallenge('ENGAGEMENT_TYPE_UNBOUND')
const bg = ch.bg_challenge
const interpUrl = bg.interpreter_url.private_do_not_access_or_else_trusted_resource_url_wrapped_value
const js = await (await fetch(`https:${interpUrl}`)).text()
new Function(js)()
const botguard = await BotGuardClient.create({ program: bg.program, globalName: bg.global_name, globalObject: globalThis })
const webPoSignalOutput = []
const bgResponse = await botguard.snapshot({ webPoSignalOutput })
const itRes = await fetch(buildURL('GenerateIT', true), {
  method: 'POST',
  headers: { 'content-type': 'application/json+protobuf', 'x-goog-api-key': GOOG_API_KEY, 'x-user-agent': 'grpc-web-javascript/0.1', 'user-agent': USER_AGENT },
  body: JSON.stringify(['O43z0dpjhgX20SCx4KAo', bgResponse]),
})
const it = await itRes.json()
const minter = await WebPoMinter.create({ integrityToken: it[0] }, webPoSignalOutput)
const sessionPot = await minter.mintAsWebsafeString(visitorData)
console.log('PO setup ok in', Date.now() - t0, 'ms; ttl', it[1], 'visitor', visitorData.slice(0, 10))

const yt = await Innertube.create({ retrieve_player: true, po_token: sessionPot, visitor_data: visitorData, cache: new UniversalCache(false) })
const ids = ['JGwWNGJdvx8', 'kJQP7kiw5Fk', 'fJ9rUzIMcZQ', '60ItHLz5WEA', 'OPf0YbXqDm0']
for (const id of ids) {
  const contentPot = await minter.mintAsWebsafeString(id)
  for (const client of ['WEB', 'MWEB', 'WEB_EMBEDDED', 'TV', 'YTMUSIC', 'IOS', 'ANDROID_VR']) {
    try {
      const info = await yt.getBasicInfo(id, { client, po_token: contentPot })
      const st = info.playability_status?.status
      let extra = ''
      if (st === 'OK') {
        const fs = (info.streaming_data?.adaptive_formats ?? []).filter(f => f.has_audio && !f.has_video)
        const f = fs.find(f => f.mime_type.startsWith('audio/mp4')) ?? fs[0]
        if (f) {
          const url = await f.decipher(yt.session.player)
          const ua = Constants.CLIENTS[client]?.USER_AGENT ?? USER_AGENT
          const r1 = await fetch(url, { headers: { range: 'bytes=0-1023', 'user-agent': ua } })
          const r2 = await fetch(url, { headers: { range: `bytes=1000000-1001023`, 'user-agent': ua } })
          extra = `probe=${r1.status}/${r2.status} sabr=${new URL(url).searchParams.get('sabr') ?? '-'} hasPot=${new URL(url).searchParams.has('pot')}`
        } else extra = `no audio (adaptive=${info.streaming_data?.adaptive_formats?.length ?? 0} sabrUrl=${!!info.streaming_data?.server_abr_streaming_url})`
      }
      console.log('PO', id, client.padEnd(13), st, info.playability_status?.reason ?? '', extra)
    } catch (e) { console.log('PO', id, client.padEnd(13), 'ERR', String(e.message).slice(0, 110)) }
  }
}
process.exit(0)
