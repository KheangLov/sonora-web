// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2026-11-01',
  devtools: { enabled: false },

  // A music player is an app, not a document: render on the client, ship a tiny static shell,
  // and let the service worker serve it instantly (and offline) after the first visit.
  ssr: false,

  modules: ['@vite-pwa/nuxt'],

  css: ['~/assets/css/main.css'],

  app: {
    head: {
      htmlAttrs: { lang: 'en' },
      title: 'Sonora',
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
        { name: 'description', content: 'Fast, free music player. Search YouTube Music, play audio only, no ads, works offline.' },
        { name: 'theme-color', content: '#09090B' },
        { name: 'color-scheme', content: 'dark' },
        { name: 'apple-mobile-web-app-capable', content: 'yes' },
        { name: 'mobile-web-app-capable', content: 'yes' },
        { name: 'apple-mobile-web-app-status-bar-style', content: 'black-translucent' },
        { name: 'apple-mobile-web-app-title', content: 'Sonora' },
        { property: 'og:title', content: 'Sonora' },
        { property: 'og:description', content: 'Fast, free music player. No ads, works offline.' },
        { property: 'og:image', content: '/og.png' },
      ],
      link: [
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
        { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' },
        { rel: 'preconnect', href: 'https://i.ytimg.com', crossorigin: '' },
        { rel: 'preconnect', href: 'https://lh3.googleusercontent.com', crossorigin: '' },
      ],
    },
  },

  // Static, CDN-cached HTML shells for the main tabs (no function call for the first paint).
  routeRules: {
    '/': { prerender: true },
    '/search': { prerender: true },
    '/library': { prerender: true },
    '/api/**': { cors: false },
  },

  nitro: {
    // Singapore: closest Vercel region to Cambodia.
    vercel: {
      regions: ['sin1'],
      functions: { maxDuration: 60, memory: 1024, supportsResponseStreaming: true, regions: ['sin1'] },
    },
    compressPublicAssets: { brotli: true, gzip: true },
    minify: true,
  },

  experimental: {
    payloadExtraction: false,
    viewTransition: true,
  },

  vite: {
    build: {
      target: 'es2022',
      cssCodeSplit: true,
    },
  },

  typescript: { strict: true },

  pwa: {
    // 'prompt': updates wait for a quiet moment (see plugins/pwa-ux.client.ts) so music never cuts out.
    registerType: 'prompt',
    injectRegister: 'auto',
    manifest: {
      name: 'Sonora',
      short_name: 'Sonora',
      description: 'Fast, free music player. No ads, works offline.',
      id: '/',
      start_url: '/',
      scope: '/',
      display: 'standalone',
      display_override: ['standalone', 'minimal-ui'],
      launch_handler: { client_mode: ['focus-existing', 'auto'] },
      prefer_related_applications: false,
      lang: 'en',
      dir: 'ltr',
      orientation: 'any',
      background_color: '#09090B',
      theme_color: '#09090B',
      categories: ['music', 'entertainment'],
      icons: [
        { src: '/pwa-192.png', sizes: '192x192', type: 'image/png' },
        { src: '/pwa-512.png', sizes: '512x512', type: 'image/png' },
        { src: '/pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
      // Richer install dialog on Android / desktop Chrome
      screenshots: [
        { src: '/screenshots/phone-home.webp', sizes: '540x1100', type: 'image/webp', form_factor: 'narrow', label: 'Home: mixes, trending and Khmer hits' },
        { src: '/screenshots/phone-search.webp', sizes: '540x1100', type: 'image/webp', form_factor: 'narrow', label: 'Search with live suggestions' },
        { src: '/screenshots/desktop-home.webp', sizes: '1440x900', type: 'image/webp', form_factor: 'wide', label: 'Sonora on desktop' },
      ],
      shortcuts: [
        { name: 'Search', url: '/search', icons: [{ src: '/pwa-192.png', sizes: '192x192' }] },
        { name: 'Your Library', url: '/library', icons: [{ src: '/pwa-192.png', sizes: '192x192' }] },
      ],
    },
    generateSW: {
      navigateFallback: '/',
      navigateFallbackDenylist: [/^\/api\//],
      globPatterns: ['**/*.{js,css,html,svg,png,ico,webp,woff2}'],
      // (No 'json' here: the PWA module adds Nuxt's build-id JSON itself; listing it twice breaks SW install.)
      globIgnores: ['**/og.png', '**/screenshots/**'],
      cleanupOutdatedCaches: true,
      clientsClaim: true,
      skipWaiting: false,
      runtimeCaching: [
        {
          // Artwork: cache-first so your library looks right offline.
          urlPattern: /^https:\/\/([^/]+\.)?(ytimg\.com|googleusercontent\.com|ggpht\.com)\//,
          handler: 'CacheFirst',
          options: {
            cacheName: 'artwork',
            expiration: { maxEntries: 2000, maxAgeSeconds: 60 * 24 * 3600, purgeOnQuotaError: true },
            cacheableResponse: { statuses: [0, 200] },
          },
        },
        {
          urlPattern: /\/api\/lyrics\//,
          handler: 'CacheFirst',
          options: {
            cacheName: 'lyrics',
            expiration: { maxEntries: 1000, maxAgeSeconds: 90 * 24 * 3600 },
            cacheableResponse: { statuses: [200] },
          },
        },
        {
          // Feeds & lists: show the last copy instantly, refresh in the background.
          urlPattern: /\/api\/(home|collection|radio)/,
          handler: 'StaleWhileRevalidate',
          options: {
            cacheName: 'feeds',
            expiration: { maxEntries: 300, maxAgeSeconds: 7 * 24 * 3600 },
            cacheableResponse: { statuses: [200] },
          },
        },
        {
          urlPattern: /\/api\/(search|suggest)/,
          handler: 'NetworkFirst',
          options: {
            cacheName: 'search',
            networkTimeoutSeconds: 6,
            expiration: { maxEntries: 300, maxAgeSeconds: 3 * 24 * 3600 },
            cacheableResponse: { statuses: [200] },
          },
        },
      ],
    },
    client: { installPrompt: true, periodicSyncForUpdates: 3600 },
    devOptions: { enabled: false },
  },
})
