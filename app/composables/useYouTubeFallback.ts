/**
 * Fallback playback through YouTube's official embedded player. It streams from the
 * listener's own connection, so it keeps working when YouTube bot-checks our server.
 * Audio-only feel: the iframe is kept out of the way; Sonora's own UI controls it.
 */
declare global {
  interface Window { YT?: any, onYouTubeIframeAPIReady?: () => void }
}

export interface YtEvents {
  onPlaying: () => void
  onPaused: () => void
  onBuffering: () => void
  onEnded: () => void
  onError: (code: number) => void
}

let apiPromise: Promise<any> | null = null
function loadApi(): Promise<any> {
  apiPromise ??= new Promise((resolve, reject) => {
    if (window.YT?.Player) return resolve(window.YT)
    const prev = window.onYouTubeIframeAPIReady
    window.onYouTubeIframeAPIReady = () => { prev?.(); resolve(window.YT) }
    const s = document.createElement('script')
    s.src = 'https://www.youtube.com/iframe_api'
    s.async = true
    s.onerror = () => { apiPromise = null; reject(new Error('YouTube player failed to load')) }
    document.head.appendChild(s)
  })
  return apiPromise
}

export class YouTubeFallback {
  private player: any = null
  private ready: Promise<void> | null = null
  private host: HTMLElement | null = null

  constructor(private events: YtEvents) {}

  private async ensure(): Promise<void> {
    if (this.ready) return this.ready
    this.ready = (async () => {
      const YT = await loadApi()
      this.host = document.getElementById('yt-fallback')
      if (!this.host) {
        this.host = document.createElement('div')
        this.host.id = 'yt-fallback'
        document.body.appendChild(this.host)
      }
      const mount = document.createElement('div')
      this.host.appendChild(mount)
      await new Promise<void>((resolve) => {
        this.player = new YT.Player(mount, {
          width: 200,
          height: 200,
          host: 'https://www.youtube-nocookie.com',
          playerVars: { autoplay: 0, controls: 0, disablekb: 1, fs: 0, playsinline: 1, rel: 0, iv_load_policy: 3 },
          events: {
            onReady: () => resolve(),
            onStateChange: (e: any) => {
              const S = YT.PlayerState
              if (e.data === S.PLAYING) this.events.onPlaying()
              else if (e.data === S.PAUSED) this.events.onPaused()
              else if (e.data === S.BUFFERING) this.events.onBuffering()
              else if (e.data === S.ENDED) this.events.onEnded()
            },
            onError: (e: any) => this.events.onError(e.data),
          },
        })
      })
    })().catch((e) => { this.ready = null; throw e })
    return this.ready
  }

  async load(id: string, startSec = 0, autoplay = true) {
    await this.ensure()
    if (autoplay) this.player.loadVideoById({ videoId: id, startSeconds: startSec })
    else this.player.cueVideoById({ videoId: id, startSeconds: startSec })
  }

  play() { this.player?.playVideo() }
  pause() { this.player?.pauseVideo() }
  stop() { try { this.player?.stopVideo() } catch {} }
  seek(sec: number) { this.player?.seekTo(sec, true) }
  setVolume(v: number) { this.player?.setVolume(Math.round(v * 100)) }
  get time(): number { try { return this.player?.getCurrentTime?.() ?? 0 } catch { return 0 } }
  get duration(): number { try { return this.player?.getDuration?.() ?? 0 } catch { return 0 } }
}
