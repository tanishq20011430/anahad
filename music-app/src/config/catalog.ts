/**
 * Curated discovery configuration.
 *
 * Each genre/mood/language maps to REAL source-native parameters — a YouTube
 * search phrase, an Audius genre/mood constant, a Radio Browser tag, an
 * Openverse tag — no fabricated tags and no Internet Archive Lucene anymore.
 * Categories are data: add/edit entries without touching app code.
 */

export interface GenreDef {
  id: string
  label: string
  /** YouTube search phrasing (played via the official embed). */
  ytQuery?: string
  /** Openverse-native tag (Jamendo/Wikimedia/Freesound — tags verified there). */
  openverseTag?: string
  /** Audius genre constant (exact casing required by the Audius API). */
  audiusGenre?: string
  /** Radio Browser tag (e.g. "jazz", "bhajan"). */
  radioTag?: string
  /** Radio Browser station-name search when tags are too sparse. */
  radioName?: string
  /** Tailwind gradient classes for the card artwork. */
  gradient: string
  description: string
}

export interface MoodDef {
  id: string
  label: string
  ytQuery?: string
  openverseTag?: string
  /** Audius mood constant (exact casing required by the Audius API). */
  audiusMood?: string
  /** Audius genre constant for moods that map to a genre catalog (e.g. Lo-Fi). */
  audiusGenre?: string
  /** Radio Browser tag. */
  radioTag?: string
  /** Keywords used to infer (estimate) a track's mood from title/subjects. */
  keywords: string[]
  gradient: string
  description: string
}

export interface LanguageDef {
  id: string
  label: string
  nativeLabel?: string
  /** Radio Browser language name (lowercase, as the directory stores it). */
  radioLanguage?: string
  /** YouTube search phrasing for this language's music. */
  ytQuery?: string
}

/* ---------------------------------- Genres ---------------------------------- */

export const GENRES: GenreDef[] = [
  {
    id: 'bollywood',
    label: 'Bollywood',
    ytQuery: 'bollywood songs',
    radioName: 'bollywood',
    gradient: 'from-rose-600 to-orange-500',
    description: 'Hindi film music — timeless classics and current hits.'
  },
  {
    id: 'bhajans',
    label: 'Bhajans',
    ytQuery: 'bhajan songs',
    openverseTag: 'bhajan',
    audiusGenre: 'Devotional',
    radioTag: 'bhajan',
    radioName: 'bhajan',
    gradient: 'from-amber-400 to-amber-600',
    description: 'Devotional songs of praise from many traditions, live and recorded.'
  },
  {
    id: 'devotional',
    label: 'Devotional',
    ytQuery: 'devotional songs aarti kirtan',
    openverseTag: 'devotional',
    audiusGenre: 'Devotional',
    radioTag: 'devotional',
    gradient: 'from-amber-600 to-yellow-500',
    description: 'Aartis, kirtans, gurbani and other devotional music.'
  },
  {
    id: 'indian-classical',
    label: 'Indian classical',
    ytQuery: 'indian classical raga sitar tabla',
    openverseTag: 'indian classical',
    radioTag: 'classical',
    radioName: 'classical india',
    gradient: 'from-orange-600 to-amber-400',
    description: 'Raga-based traditions — sitar, tabla, sarod and more.'
  },
  {
    id: 'sufi',
    label: 'Sufi & Qawwali',
    ytQuery: 'qawwali sufi songs',
    openverseTag: 'sufi',
    radioTag: 'sufi',
    gradient: 'from-fuchsia-700 to-amber-500',
    description: 'Qawwalis and Sufi devotional music.'
  },
  {
    id: 'punjabi',
    label: 'Punjabi & Bhangra',
    ytQuery: 'punjabi bhangra songs',
    openverseTag: 'bhangra',
    radioTag: 'bhangra',
    radioName: 'punjabi',
    gradient: 'from-lime-500 to-green-600',
    description: 'Bhangra, folk and contemporary Punjabi music.'
  },
  {
    id: 'lo-fi',
    label: 'Lo-fi',
    ytQuery: 'lofi hip hop beats',
    openverseTag: 'lofi',
    audiusGenre: 'Lo-Fi',
    radioTag: 'lounge',
    gradient: 'from-violet-700 to-purple-600',
    description: 'Chillhop and lo-fi beats for focus and study.'
  },
  {
    id: 'electronic',
    label: 'Electronic',
    openverseTag: 'electronic',
    audiusGenre: 'Electronic',
    radioTag: 'electronic',
    ytQuery: 'electronic music mix',
    gradient: 'from-cyan-600 to-blue-600',
    description: 'Ambient techno, house, IDM and netlabel electronica.'
  },
  {
    id: 'hip-hop',
    label: 'Hip-hop',
    ytQuery: 'hip hop instrumental rap',
    openverseTag: 'hiphop',
    audiusGenre: 'Hip-Hop/Rap',
    radioTag: 'hip hop',
    gradient: 'from-zinc-600 to-zinc-800',
    description: 'Rap and hip-hop — CC releases, indie artists, live shows.'
  },
  {
    id: 'rock',
    label: 'Rock',
    openverseTag: 'rock',
    audiusGenre: 'Rock',
    radioTag: 'rock',
    ytQuery: 'rock music mix',
    gradient: 'from-red-600 to-zinc-600',
    description: 'Indie rock and classics on the airwaves.'
  },
  {
    id: 'pop',
    label: 'Pop',
    openverseTag: 'pop',
    audiusGenre: 'Pop',
    radioTag: 'pop',
    ytQuery: 'pop hits',
    gradient: 'from-pink-500 to-rose-600',
    description: 'Independent pop releases and hit radio.'
  },
  {
    id: 'jazz',
    label: 'Jazz',
    openverseTag: 'jazz',
    audiusGenre: 'Jazz',
    radioTag: 'jazz',
    ytQuery: 'jazz music',
    gradient: 'from-amber-700 to-yellow-600',
    description: 'Netlabel jazz, indie artists and 24/7 jazz radio.'
  },
  {
    id: 'classical',
    label: 'Classical (Western)',
    openverseTag: 'classical',
    audiusGenre: 'Classical',
    radioTag: 'classical',
    ytQuery: 'classical music piano orchestra',
    gradient: 'from-stone-600 to-amber-700',
    description: 'Symphonies, quartets and sonatas — recordings and radio.'
  },
  {
    id: 'ambient',
    label: 'Ambient',
    openverseTag: 'ambient',
    audiusGenre: 'Ambient',
    radioTag: 'ambient',
    ytQuery: 'ambient soundscape music',
    gradient: 'from-sky-700 to-cyan-500',
    description: 'Atmospheric soundscapes and drones.'
  },
  {
    id: 'folk',
    label: 'Folk',
    openverseTag: 'folk',
    audiusGenre: 'Folk',
    radioTag: 'folk',
    ytQuery: 'folk music acoustic',
    gradient: 'from-teal-600 to-emerald-500',
    description: 'Traditional and contemporary folk from around the world.'
  },
  {
    id: 'acoustic',
    label: 'Acoustic',
    openverseTag: 'acoustic',
    audiusGenre: 'Acoustic',
    ytQuery: 'acoustic songs',
    gradient: 'from-orange-500 to-amber-600',
    description: 'Stripped-down, unplugged performances.'
  },
  {
    id: 'rnb',
    label: 'R&B / Soul',
    audiusGenre: 'R&B/Soul',
    openverseTag: 'rnb',
    radioTag: 'rnb',
    ytQuery: 'rnb soul music',
    gradient: 'from-purple-700 to-rose-500',
    description: 'Smooth grooves and soul voices.'
  },
  {
    id: 'reggae',
    label: 'Reggae',
    audiusGenre: 'Reggae',
    openverseTag: 'reggae',
    radioTag: 'reggae',
    ytQuery: 'reggae music',
    gradient: 'from-green-600 to-yellow-500',
    description: 'Roots, dub and island rhythms.'
  }
]

export function genreById(id: string | undefined): GenreDef | undefined {
  return GENRES.find((g) => g.id === id)
}

/* ---------------------------------- Moods ----------------------------------- */

export const MOODS: MoodDef[] = [
  {
    id: 'peaceful',
    label: 'Peaceful',
    ytQuery: 'peaceful calming music',
    openverseTag: 'calm',
    audiusMood: 'Peaceful',
    radioTag: 'meditation',
    keywords: ['peaceful', 'calm', 'serene', 'meditation', 'relax', 'soothing', 'tranquil', 'shanti'],
    gradient: 'from-teal-500 to-emerald-600',
    description: 'Calm, meditative and restful soundscapes.'
  },
  {
    id: 'devotional',
    label: 'Devotional',
    ytQuery: 'bhajan devotional songs',
    openverseTag: 'devotional',
    audiusMood: 'Peaceful',
    radioTag: 'bhajan',
    keywords: ['bhajan', 'aarti', 'kirtan', 'devotional', 'prayer', 'gospel', 'hymn', 'stotra', 'mantra', 'gurbani'],
    gradient: 'from-amber-500 to-orange-600',
    description: 'Songs of devotion across traditions.'
  },
  {
    id: 'romantic',
    label: 'Romantic',
    ytQuery: 'romantic love songs',
    openverseTag: 'romantic',
    audiusMood: 'Romantic',
    keywords: ['love', 'romantic', 'romance', 'pyar', 'ishq', 'mohabbat', 'valentine', 'beloved', 'dil'],
    gradient: 'from-rose-500 to-pink-600',
    description: 'Love songs and tender duets.'
  },
  {
    id: 'happy',
    label: 'Happy',
    ytQuery: 'happy feel good songs',
    openverseTag: 'happy',
    audiusMood: 'Upbeat',
    keywords: ['happy', 'joy', 'cheerful', 'feel good', 'sunny', 'smile', 'khushi'],
    gradient: 'from-yellow-400 to-amber-500',
    description: 'Uplifting, feel-good music.'
  },
  {
    id: 'sad',
    label: 'Sad',
    ytQuery: 'sad songs playlist',
    openverseTag: 'sad',
    audiusMood: 'Melancholy',
    keywords: ['sad', 'sorrow', 'lonely', 'loneliness', 'tears', 'crying', 'heartbreak', 'broken heart', 'dard', 'bewafa', 'judai', 'viraha'],
    gradient: 'from-slate-700 to-blue-900',
    description: 'Melancholy ballads and sorrowful songs.'
  },
  {
    id: 'energetic',
    label: 'Energetic',
    ytQuery: 'energetic party dance music',
    openverseTag: 'energetic',
    audiusMood: 'Energizing',
    radioTag: 'dance',
    keywords: ['energetic', 'dance', 'edm', 'party', 'uptempo', 'banger', 'club', 'bhangra'],
    gradient: 'from-fuchsia-500 to-orange-500',
    description: 'High-tempo dance and party music.'
  },
  {
    id: 'workout',
    label: 'Workout',
    ytQuery: 'workout gym music',
    openverseTag: 'energetic',
    audiusMood: 'Empowering',
    radioTag: 'dance',
    keywords: ['workout', 'gym', 'high energy', 'running', 'power', 'pump'],
    gradient: 'from-red-500 to-orange-600',
    description: 'Drive and adrenaline for training.'
  },
  {
    id: 'focus',
    label: 'Focus',
    ytQuery: 'lofi focus study beats',
    openverseTag: 'lofi',
    audiusGenre: 'Lo-Fi',
    keywords: ['lo-fi', 'lofi', 'study', 'focus', 'concentration', 'instrumental', 'chillhop'],
    gradient: 'from-violet-600 to-indigo-700',
    description: 'Beats and instrumentals for deep work.'
  },
  {
    id: 'relaxing',
    label: 'Relaxing',
    ytQuery: 'relaxing chill music',
    openverseTag: 'relaxing',
    audiusMood: 'Easygoing',
    radioTag: 'lounge',
    keywords: ['relaxing', 'chill', 'chillout', 'downtempo', 'laid back', 'easy listening', 'smooth'],
    gradient: 'from-cyan-500 to-teal-600',
    description: 'Unwind with easy, unhurried music.'
  },
  {
    id: 'motivational',
    label: 'Motivational',
    ytQuery: 'motivational inspiring music',
    openverseTag: 'motivational',
    audiusMood: 'Empowering',
    keywords: ['motivational', 'inspiring', 'inspiration', 'anthem', 'triumphant', 'heroic', 'rise'],
    gradient: 'from-orange-500 to-red-600',
    description: 'Anthems to move you forward.'
  },
  {
    id: 'nostalgic',
    label: 'Nostalgic',
    ytQuery: 'oldies retro classics',
    audiusMood: 'Sentimental',
    keywords: ['nostalgic', 'oldies', 'retro', 'vintage', 'classic', 'yaad'],
    gradient: 'from-amber-700 to-yellow-700',
    description: 'Golden oldies and retro favorites.'
  },
  {
    id: 'melancholic',
    label: 'Melancholic',
    ytQuery: 'melancholy sad indie songs',
    openverseTag: 'melancholic',
    audiusMood: 'Melancholy',
    keywords: ['melancholic', 'melancholy', 'wistful', 'blues', 'bittersweet', 'gham'],
    gradient: 'from-gray-600 to-slate-800',
    description: 'Bittersweet and wistful moods.'
  },
  {
    id: 'sleep',
    label: 'Sleep',
    ytQuery: 'sleep music lullaby',
    openverseTag: 'sleep',
    audiusMood: 'Peaceful',
    radioTag: 'lounge',
    keywords: ['sleep', 'lullaby', 'nocturne', 'drones', 'night', 'dream', 'insomnia'],
    gradient: 'from-indigo-900 to-slate-900',
    description: 'Slow, quiet music for drifting off.'
  }
]

export function moodById(id: string | undefined): MoodDef | undefined {
  return MOODS.find((m) => m.id === id)
}

/**
 * Infer moods from a track's title + subject keywords. These are ESTIMATES —
 * the UI must label them as such. Returns mood ids (lowercase, stable).
 */
export function inferMoods(title: string, subjects: string[]): string[] {
  const hay = `${title} ${subjects.join(' ')}`.toLowerCase()
  const found: string[] = []
  for (const mood of MOODS) {
    if (mood.keywords.some((k) => hay.includes(k))) found.push(mood.id)
  }
  return found
}

/* --------------------------------- Languages -------------------------------- */

export const LANGUAGES: LanguageDef[] = [
  { id: 'hindi', label: 'Hindi', nativeLabel: 'हिन्दी', radioLanguage: 'hindi', ytQuery: 'hindi songs' },
  { id: 'english', label: 'English', radioLanguage: 'english', ytQuery: 'english songs' },
  { id: 'punjabi', label: 'Punjabi', nativeLabel: 'ਪੰਜਾਬੀ', radioLanguage: 'punjabi', ytQuery: 'punjabi songs' },
  { id: 'sanskrit', label: 'Sanskrit', nativeLabel: 'संस्कृतम्', radioLanguage: 'sanskrit', ytQuery: 'sanskrit shloka chanting' },
  { id: 'tamil', label: 'Tamil', nativeLabel: 'தமிழ்', radioLanguage: 'tamil', ytQuery: 'tamil songs' },
  { id: 'telugu', label: 'Telugu', nativeLabel: 'తెలుగు', radioLanguage: 'telugu', ytQuery: 'telugu songs' },
  { id: 'bengali', label: 'Bengali', nativeLabel: 'বাংলা', radioLanguage: 'bengali', ytQuery: 'bengali songs' },
  { id: 'marathi', label: 'Marathi', nativeLabel: 'मराठी', radioLanguage: 'marathi', ytQuery: 'marathi songs' },
  { id: 'gujarati', label: 'Gujarati', nativeLabel: 'ગુજરાતી', radioLanguage: 'gujarati', ytQuery: 'gujarati songs' },
  { id: 'malayalam', label: 'Malayalam', nativeLabel: 'മലയാളം', radioLanguage: 'malayalam', ytQuery: 'malayalam songs' },
  { id: 'kannada', label: 'Kannada', nativeLabel: 'ಕನ್ನಡ', radioLanguage: 'kannada', ytQuery: 'kannada songs' }
]

export function languageById(id: string | undefined): LanguageDef | undefined {
  return LANGUAGES.find((l) => l.id === id)
}
