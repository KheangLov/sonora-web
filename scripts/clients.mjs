// Diagnostic: which InnerTube clients return playable audio from this IP?
import { Innertube, Platform, UniversalCache, Constants } from 'youtubei.js'
Platform.shim.eval = (data, env) => {
  const a = v => JSON.stringify(typeof v === 'string' ? v : '')
  return new Function(`${data.output}\nreturn process(${a(env.n)}, ${a(env.sp)}, ${a(env.sig)});`)()
}
const yt = await Innertube.create({ retrieve_player: true, generate_session_locally: false, cache: new UniversalCache(false) })
const ids = (process.argv[2] ?? 'dQw4w9WgXcQ,JGwWNGJdvx8,kJQP7kiw5Fk').split(',')
const clients = ['ANDROID_VR','IOS','ANDROID','YTMUSIC_ANDROID','YTSTUDIO_ANDROID','VISIONOS','TV','TV_SIMPLY','TV_EMBEDDED','WEB_EMBEDDED','WEB','MWEB','YTMUSIC','YTKIDS','WEB_CREATOR']
for (const id of ids) for (const client of clients) {
  try {
    const info = await yt.getBasicInfo(id, { client })
    const st = info.playability_status?.status
    let extra = ''
    if (st === 'OK') {
      const f = (info.streaming_data?.adaptive_formats ?? []).find(f => f.has_audio && !f.has_video)
      if (f) {
        const url = await f.decipher(yt.session.player)
        const ua = Constants.CLIENTS[client]?.USER_AGENT ?? 'Mozilla/5.0'
        const r = await fetch(url, { headers: { range: 'bytes=0-1023', 'user-agent': ua } })
        extra = `probe=${r.status}`
      } else extra = `formats=${info.streaming_data?.adaptive_formats?.length ?? 0} hls=${!!info.streaming_data?.hls_manifest_url}`
    }
    console.log(id, client.padEnd(18), st, info.playability_status?.reason ?? '', extra)
  } catch (e) { console.log(id, client.padEnd(18), 'ERR', String(e.message).slice(0, 120)) }
}
