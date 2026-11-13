export interface Song {
  id: string
  title: string
  artist: string
  /** Album or extra subtitle when known */
  album?: string
  thumbnail: string
  /** seconds, 0 when unknown */
  duration: number
}

export interface Collection {
  /** browseId (album MPRE…, playlist VL…, artist UC…) or a radio playlistId when isQueue */
  id: string
  isQueue: boolean
  title: string
  subtitle: string
  thumbnail: string
}

export interface HomeSection {
  title: string
  subtitle?: string
  songs: Song[]
  collections: Collection[]
}

export interface SearchPage {
  songs: Song[]
  /** opaque cursor for the next page, null when done */
  next: string | null
  correctedTo?: string | null
  didYouMean?: string | null
  blocked?: boolean
}

export interface LyricLine {
  time: number // ms
  text: string
}

export interface LyricsResult {
  synced: LyricLine[]
  plain: string | null
  source: string
}
