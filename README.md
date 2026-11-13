# Sonora Web

The web version of [Sonora](https://github.com/KheangLov/sonora): a fast, free, audio-only music player powered by YouTube Music. It's built with Nuxt 4 and is an installable PWA that works offline.

## Features
- Home feed with Quick picks, trending, Khmer hits and mood chips; search with live suggestions and recent searches
- Endless autoplay radio, a queue, shuffle and repeat, a sleep timer, sharing, and keyboard shortcuts (space, ←/→, n/p, l, s, r, m)
- Synced lyrics from LRCLIB, falling back to YouTube Music. They follow the song and you can tap a line to seek.
- Liked Songs, playlists and history, stored on your device in IndexedDB and synced across tabs
- **Dislike:** hides a song everywhere. Library → Disliked songs lets you undo one or restore all.
- **Content filter:** Thai / Thailand content is blocked in search, suggestions, the home feed, radio and collections (`shared/utils/contentFilter.ts`).
- **Offline:** the app shell is precached, so it opens without a connection. Downloaded songs, artwork, lyrics and recent feeds are cached.
- Lock-screen and headset controls through the Media Session API
- Phone layout with a mini player and bottom nav; desktop layout with a sidebar, player bar and lyrics side panel

## How audio plays
1. **Downloaded:** from IndexedDB, works offline.
2. **Server stream:** `/api/stream/[id]` resolves an audio-only format with youtubei.js and proxies it in 2 MB byte ranges, so playback is instant and seekable.
3. **Fallback:** YouTube's official embedded player, streaming from the listener's own connection. YouTube often bot-checks datacenter IPs (Vercel, GitHub Actions), and proof-of-origin tokens don't get past that (tested), so this fallback is a normal path rather than an edge case. If a YouTube Music art track can't be embedded, another upload of the same song with a matching length plays instead (`/api/alternatives/[id]`).

Optional: set `YT_COOKIE` (the cookie of a spare Google account) in Vercel. Signed-in requests pass the bot check more often, which makes server streaming and downloads more reliable.

## Deploy to Vercel
1. Go to vercel.com/new and import `KheangLov/sonora-web`. It detects Nuxt automatically, so no settings are needed.
2. Functions run in `sin1` (Singapore), which is closest to Cambodia (`vercel.json`).
3. API responses are cached at Vercel's edge: home 30 min, search 1 h, lyrics 7 days.

## Sign-in
- **Continue with Google (one tap):** the normal Google sign-in redirect. It needs a Google OAuth client, set up once:
  1. Go to [console.cloud.google.com](https://console.cloud.google.com) and create a project.
  2. APIs & Services → Library → enable **YouTube Data API v3**.
  3. Google Auth Platform → Branding: app name "Sonora". Then Audience: External, add your Gmail as a test user (or publish the app). Then Data access: add the scope `.../auth/youtube.readonly`.
  4. Clients → Create client → **Web application** → Authorized redirect URI: `https://YOUR-DOMAIN/api/auth/callback`
  5. In Vercel → Settings → Environment Variables, add `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`, then redeploy.
- **Other ways:** enter a code at google.com/device (works with no setup), or paste a YouTube cookie.
- Sign-ins stay in the browser. The server stores nothing, and signed-in responses are never cached at the CDN.

## Develop
```bash
npm install
npm run dev        # http://localhost:3000
npm run build && node .output/server/index.mjs
```

CI (`.github/workflows/ci.yml`) runs a type check, the build, a live API smoke test (`scripts/smoke.sh`), an end-to-end test in real Chrome on phone and desktop (`scripts/e2e.mjs`) and Lighthouse. It also runs daily to catch changes on YouTube's side. Screenshots are pushed to the `e2e-output` branch.
