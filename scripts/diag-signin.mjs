// Temporary: which device-flow token request does Google accept, and what does production say?
const PROD = 'https://sonora-web-seven.vercel.app'
const j = async (r) => { const t = await r.text(); try { return JSON.parse(t) } catch { return t.slice(0, 300) } }
console.log('PROD config', await j(await fetch(PROD + '/api/auth/config')))
const dev = await j(await fetch(PROD + '/api/auth/device', { method: 'POST' }))
console.log('PROD device', { ...dev, deviceCode: dev.deviceCode ? 'present' : dev.deviceCode })
if (dev.deviceCode) {
  const r = await j(await fetch(PROD + '/api/auth/token', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ via: dev.via, deviceCode: dev.deviceCode }) }))
  console.log('PROD token poll', r)
}
// YouTube TV client, the way server/utils/auth.ts reads it
const headers = { 'user-agent': 'Mozilla/5.0 (ChromiumStylePlatform) Cobalt/Version', 'referer': 'https://www.youtube.com/tv', 'accept-language': 'en-US' }
const html = await (await fetch('https://www.youtube.com/tv', { headers })).text()
const src = /<script\s+id="base-js"\s+src="([^"]+)"[^>]*><\/script>/.exec(html)?.[1]
console.log('tv base-js', !!src)
const js = await (await fetch(new URL(src, 'https://www.youtube.com'), { headers })).text()
const m = /clientId:"(?<id>[^"]+)",[^"]*?:"(?<secret>[^"]+)"/.exec(js)
console.log('tv client', m?.groups?.id?.slice(0, 20))
const id = m.groups.id, secret = m.groups.secret
const codeRes = await j(await fetch('https://www.youtube.com/o/oauth2/device/code', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ client_id: id, scope: 'http://gdata.youtube.com https://www.googleapis.com/auth/youtube-paid-content', device_id: crypto.randomUUID(), device_model: 'ytlr::' }) }))
console.log('yt device/code', { ...codeRes, device_code: codeRes.device_code ? 'present' : undefined })
const dc = codeRes.device_code
const variants = [
  ['yt json code+device_code (current)', 'https://www.youtube.com/o/oauth2/token', false, { client_id: id, client_secret: secret, code: dc, device_code: dc, grant_type: 'http://oauth.net/grant_type/device/1.0' }],
  ['yt json code only', 'https://www.youtube.com/o/oauth2/token', false, { client_id: id, client_secret: secret, code: dc, grant_type: 'http://oauth.net/grant_type/device/1.0' }],
  ['yt json device_code + urn grant', 'https://www.youtube.com/o/oauth2/token', false, { client_id: id, client_secret: secret, device_code: dc, grant_type: 'urn:ietf:params:oauth:grant-type:device_code' }],
  ['googleapis form code only', 'https://oauth2.googleapis.com/token', true, { client_id: id, client_secret: secret, code: dc, grant_type: 'http://oauth.net/grant_type/device/1.0' }],
  ['googleapis form device_code + urn', 'https://oauth2.googleapis.com/token', true, { client_id: id, client_secret: secret, device_code: dc, grant_type: 'urn:ietf:params:oauth:grant-type:device_code' }],
]
for (const [name, url, form, body] of variants) {
  const r = await fetch(url, { method: 'POST', headers: { 'content-type': form ? 'application/x-www-form-urlencoded' : 'application/json' }, body: form ? new URLSearchParams(body).toString() : JSON.stringify(body) })
  console.log('VARIANT', name, r.status, JSON.stringify(await j(r)))
}
// Refresh grant with a junk token: what does each endpoint say? (expect invalid_grant)
for (const [url, form] of [['https://www.youtube.com/o/oauth2/token', false], ['https://oauth2.googleapis.com/token', true]]) {
  const body = { client_id: id, client_secret: secret, refresh_token: '1//junk', grant_type: 'refresh_token' }
  const r = await fetch(url, { method: 'POST', headers: { 'content-type': form ? 'application/x-www-form-urlencoded' : 'application/json' }, body: form ? new URLSearchParams(body).toString() : JSON.stringify(body) })
  console.log('REFRESH', url, r.status, JSON.stringify(await j(r)))
}
