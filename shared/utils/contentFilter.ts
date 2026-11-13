/**
 * Sonora content filter, shared by server and browser.
 * Blocks anything Thai / Thailand-related: Thai script, Thai keywords, Thai labels and artists.
 * Khmer, Lao and every other script are separate Unicode blocks and are not affected.
 * Mirrors data/filter/ContentFilter.kt in the Android app.
 */
import type { Collection, HomeSection, Song } from '../types/music'

const THAI_SCRIPT = /[฀-๿]/

const THAI_WORDS = [
  'thai', 'thais', 'thailand', 'thailande', 'tailandia', 'thaïlande',
  'bangkok', 'pattaya', 'phuket', 'chiang mai', 'chiangmai', 'isaan', 'isan song',
  't-pop', 'tpop', 't pop', 'thai pop', 'thaipop', 'thai rap', 'thai song', 'thai songs',
  'luk thung', 'lukthung', 'luk thoong', 'luk krung', 'lukkrung', 'mor lam', 'morlam', 'molam',
  'lakorn', 'lakhon', 'thai bl', 'thai drama', 'thai series', 'thai ost',
  // labels, TV channels, idol groups
  'gmmtv', 'gmm tv', 'gmm grammy', 'gmmgrammy', 'grammy gold', 'gmm25', 'gmm 25',
  'genie records', 'genierock', 'genie rock', 'rsiam', 'rs music', 'spicy disc', 'smallroom',
  'what the duck', 'muzik move', 'kamikaze records', 'loveis entertainment', 'loveis',
  'boxx music', 'chandelier music', 'bakery music', 'wayfer records', 'high cloud entertainment',
  'workpoint', 'one31', 'ch3thailand', 'ch3 thailand', 'ch7hd', 'thairath', 'amarin tv',
  'bnk48', 'cgm48', '4eve', 'proxie', 'pixxie', 'lyra thailand', 'atlas thailand',
]

/** Thai artists who publish under Latin names (matched against artist / channel names and queries). */
const THAI_ARTISTS = [
  'bodyslam', 'tilly birds', 'three man down', 'jeff satur', 'billkin', 'pp krit', 'palmy',
  'polycat', 'silly fools', 'lipta', 'getsunova', 'labanoon', 'ink waruntorn', 'violette wautier',
  'sprite x guygeegee', 'guygeegee', 'f.hero', 'fhero', 'youngohm', 'young ohm', 'lazyloxy',
  'jaonaay', 'gena desouza', 'pchy', 'nont tanont', 'joey phuwasit', 'zom marie', 'atom chanakan',
  'bowkylion', 'da endorphine', 'stamp apiwat', 'bird thongchai', 'tata young',
  'safeplanet', 'ebola band', 'retrospect band', 'klear band',
  'potato band', 'cocktail band', 'big ass band', 'lula kanyarat', 'scrubb', 'the yers',
  'gemini norawit', 'fourth nattawat', 'bright vachirawit', 'win metawin', 'mew suppasit',
  'tay tawan', 'nanon korapat', 'ohm pawat', 'earth pirapat', 'mix sahaphap', 'zee pruk',
  'nunew', 'boun noppanut', 'prem warut', 'off jumpol', 'gun atthaphan',
  'milli thailand', '1mill', 'thaiboy digital', 'maiyarap', 'twopee southside', 'diamond mqt',
  'urboytj', 'ally pattarasorn', 'mean band', 'num kala', 'paowalee', 'takkatan chollada',
  'lamyai haithongkham', 'tai orathai', 'mike piromporn', 'got jakrapun', 'phai pongsathorn',
  'jintara poonlarp', 'pumpuang duangjan', 'siriporn ampaipong', 'yinglee srijumpol',
]

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
/** One alternation per list (whole words / phrases only): a single scan per string, not ~150. */
const anyWordRx = (list: string[]) => new RegExp(
  `(?<![\\p{L}\\p{N}\\p{M}])(?:${[...new Set(list)].sort((a, b) => b.length - a.length).map(escape).join('|')})(?![\\p{L}\\p{N}\\p{M}])`,
  'u',
)
const WORDS_RX = anyWordRx(THAI_WORDS)
const ARTISTS_RX = anyWordRx(THAI_ARTISTS)

const norm = (s: string) => s.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim()

export function isThaiText(text: string | undefined | null): boolean {
  if (!text) return false
  if (THAI_SCRIPT.test(text)) return true
  const t = norm(text)
  return WORDS_RX.test(t)
}

function isThaiArtist(text: string | undefined | null): boolean {
  if (!text) return false
  const t = norm(text)
  return ARTISTS_RX.test(t)
}

export function isBlockedQuery(q: string): boolean {
  return isThaiText(q) || isThaiArtist(q)
}

export function isBlockedSong(s: Pick<Song, 'title' | 'artist'> & { album?: string }): boolean {
  return isThaiText(s.title) || isThaiText(s.artist) || isThaiArtist(s.artist) || isThaiText(s.album)
}

export function isBlockedCollection(c: Pick<Collection, 'title' | 'subtitle'>): boolean {
  return isThaiText(c.title) || isThaiText(c.subtitle) || isThaiArtist(c.subtitle)
}

/** Filters songs by the Thai rules plus an optional set of disliked ids. */
export function filterSongs<T extends Song>(songs: T[], disliked?: Set<string>): T[] {
  return songs.filter(s => !isBlockedSong(s) && !(disliked?.has(s.id)))
}

export function filterSections(sections: HomeSection[], disliked?: Set<string>): HomeSection[] {
  const out: HomeSection[] = []
  for (const s of sections) {
    if (isThaiText(s.title) || isThaiText(s.subtitle)) continue
    const songs = filterSongs(s.songs, disliked)
    const collections = s.collections.filter(c => !isBlockedCollection(c))
    if (songs.length || collections.length) out.push({ ...s, songs, collections })
  }
  return out
}
