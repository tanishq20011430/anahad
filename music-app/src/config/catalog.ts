/**
 * Curated discovery configuration.
 *
 * Each genre/mood maps to a real archive.org Lucene clause — no fabricated
 * tags. Categories are data here: add/edit entries without touching app code.
 *
 * Note: negation of collection:(radioprograms) keeps radio-show recordings
 * out of music genres where they dominate (verified against live results).
 */

export interface GenreDef {
  id: string
  label: string
  /** archive.org Lucene clause (verbatim, trusted — authored by this app). */
  clause: string
  /** Openverse-native tag used for track-first providers (only when the tag
   *  genuinely exists in Jamendo/Wikimedia/Freesound catalogs). */
  openverseTag?: string
  /** Tailwind gradient classes for the card artwork. */
  gradient: string
  description: string
}

export interface MoodDef {
  id: string
  label: string
  clause: string
  openverseTag?: string
  /** Keywords used to infer (estimate) a track's mood from title/subjects. */
  keywords: string[]
  gradient: string
  description: string
}

export interface LanguageDef {
  id: string
  label: string
  /** Native script name if any (display only, from data when available). */
  nativeLabel?: string
  /** Lucene clause matching both ISO codes and names. */
  clause: string
}

/* ---------------------------------- Genres ---------------------------------- */

export const GENRES: GenreDef[] = [
  {
    id: 'bollywood',
    label: 'Bollywood',
    clause: '((subject:(bollywood) OR title:("hindi film songs") OR title:("hindi songs")) AND NOT (subject:(quran OR islam OR naat OR sermon)))',
    gradient: 'from-rose-600 to-orange-500',
    description: 'Classic and vintage Hindi film music preserved in open archives.'
  },
  {
    id: 'hindi-indie',
    label: 'Hindi indie',
    clause: '(language:(hin OR hindi) AND (subject:(indie OR acoustic OR folk OR "singer songwriter") OR title:(unplugged)))',
    gradient: 'from-amber-500 to-pink-500',
    description: 'Independent and acoustic voices singing in Hindi.'
  },
  {
    id: 'indian-classical',
    label: 'Indian classical',
    clause: '(subject:("indian classical") OR subject:(raga) OR subject:(sitar) OR subject:(tabla))',
    openverseTag: 'indian classical',
    gradient: 'from-orange-600 to-amber-400',
    description: 'Raga-based traditions — sitar, tabla, sarod and more.'
  },
  {
    id: 'hindustani-classical',
    label: 'Hindustani classical',
    clause: '((subject:(hindustani) OR title:("hindustani classical")) AND NOT subject:(radio))',
    gradient: 'from-yellow-600 to-orange-500',
    description: 'North Indian classical tradition — khayal, thumri, raga.'
  },
  {
    id: 'carnatic',
    label: 'Carnatic',
    clause: 'subject:(carnatic)',
    openverseTag: 'carnatic',
    gradient: 'from-emerald-600 to-lime-500',
    description: 'South Indian classical music — kritis and ragams.'
  },
  {
    id: 'bhajans',
    label: 'Bhajans',
    clause: '(subject:(bhajan) OR title:(bhajan))',
    openverseTag: 'bhajan',
    gradient: 'from-amber-400 to-amber-600',
    description: 'Devotional songs of praise from many traditions.'
  },
  {
    id: 'devotional',
    label: 'Devotional',
    clause: '(subject:(devotional) OR subject:(aarti) OR subject:(kirtan) OR subject:(gurbani))',
    openverseTag: 'devotional',
    gradient: 'from-amber-600 to-yellow-500',
    description: 'Aartis, kirtans, gurbani and other devotional music.'
  },
  {
    id: 'ghazals',
    label: 'Ghazals',
    clause: '(subject:(ghazal) OR title:(ghazal))',
    gradient: 'from-purple-700 to-rose-500',
    description: 'Poetic Urdu/Hindi ghazals — vintage and classic recordings.'
  },
  {
    id: 'sufi',
    label: 'Sufi',
    clause: '(subject:(sufi) OR subject:(qawwali) OR title:(qawwali))',
    openverseTag: 'sufi',
    gradient: 'from-fuchsia-700 to-amber-500',
    description: 'Qawwalis and Sufi devotional music.'
  },
  {
    id: 'punjabi',
    label: 'Punjabi',
    clause: '(language:(pan OR panjabi OR punjabi) OR subject:(bhangra))',
    openverseTag: 'bhangra',
    gradient: 'from-lime-500 to-green-600',
    description: 'Bhangra, folk and contemporary Punjabi music.'
  },
  {
    id: 'folk',
    label: 'Folk',
    clause: '(collection:(netlabels) AND subject:(folk)) OR (subject:(indian folk) AND format:(MP3))',
    openverseTag: 'folk',
    gradient: 'from-teal-600 to-emerald-500',
    description: 'Traditional and contemporary folk from around the world.'
  },
  {
    id: 'pop',
    label: 'Pop',
    clause: 'collection:(netlabels) AND subject:(pop)',
    openverseTag: 'pop',
    gradient: 'from-pink-500 to-rose-600',
    description: 'Independent pop releases under Creative Commons.'
  },
  {
    id: 'rock',
    label: 'Rock',
    clause: '(collection:(netlabels) AND subject:(rock)) OR collection:(etree)',
    openverseTag: 'rock',
    gradient: 'from-red-600 to-zinc-600',
    description: 'Independent rock plus band-approved live concerts.'
  },
  {
    id: 'hip-hop',
    label: 'Hip-hop',
    clause: '(collection:(netlabels) AND (subject:(hip-hop) OR subject:(hip hop) OR subject:(rap)))',
    openverseTag: 'hiphop',
    gradient: 'from-zinc-600 to-zinc-800',
    description: 'CC-licensed rap and hip-hop from netlabels.'
  },
  {
    id: 'electronic',
    label: 'Electronic',
    clause: 'collection:(netlabels) AND subject:(electronic)',
    openverseTag: 'electronic',
    gradient: 'from-cyan-600 to-blue-600',
    description: 'Ambient techno, IDM, house and netlabel electronica.'
  },
  {
    id: 'jazz',
    label: 'Jazz',
    clause: '(collection:(netlabels) AND subject:(jazz)) OR (collection:(georgeblood) AND subject:(jazz))',
    openverseTag: 'jazz',
    gradient: 'from-amber-700 to-yellow-600',
    description: 'Netlabel jazz and vintage 78rpm sides.'
  },
  {
    id: 'blues',
    label: 'Blues',
    clause: '((collection:(netlabels) OR collection:(opensource_audio)) AND subject:(blues))',
    openverseTag: 'blues',
    gradient: 'from-indigo-800 to-slate-700',
    description: 'Blues recordings old and new.'
  },
  {
    id: 'classical',
    label: 'Classical (Western)',
    clause: '(collection:(musopen) OR (collection:(netlabels) AND subject:(classical)))',
    openverseTag: 'classical',
    gradient: 'from-stone-600 to-amber-700',
    description: 'Public-domain Western classical — symphonies, quartets, sonatas.'
  },
  {
    id: 'lo-fi',
    label: 'Lo-fi',
    clause: '((subject:(lo-fi) OR subject:(lofi) OR subject:(chillhop)) AND NOT collection:(radioprograms))',
    openverseTag: 'lofi',
    gradient: 'from-violet-700 to-purple-600',
    description: 'Chillhop and lo-fi beats for focus and study.'
  },
  {
    id: 'ambient',
    label: 'Ambient',
    clause: '(collection:(netlabels) AND subject:(ambient))',
    openverseTag: 'ambient',
    gradient: 'from-sky-700 to-cyan-500',
    description: 'Atmospheric soundscapes and drones.'
  },
  {
    id: 'instrumental',
    label: 'Instrumental',
    clause: '(collection:(netlabels) AND subject:(instrumental))',
    openverseTag: 'instrumental',
    gradient: 'from-slate-600 to-zinc-700',
    description: 'Wordless music across genres.'
  },
  {
    id: 'acoustic',
    label: 'Acoustic',
    clause: '(collection:(netlabels) AND subject:(acoustic))',
    openverseTag: 'acoustic',
    gradient: 'from-orange-500 to-amber-600',
    description: 'Stripped-down, unplugged performances.'
  },
  {
    id: 'regional-indian',
    label: 'Regional Indian',
    clause: '(language:(tam OR tamil OR tel OR telugu OR ben OR bengali OR mar OR marathi OR guj OR gujarati OR mal OR malayalam OR kan OR kannada))',
    gradient: 'from-green-600 to-teal-500',
    description: 'Music in Tamil, Telugu, Bengali, Marathi and more.'
  },
  {
    id: 'live',
    label: 'Live concerts',
    clause: 'collection:(etree) AND format:(MP3)',
    gradient: 'from-blue-800 to-indigo-700',
    description: 'Band-approved live recordings from the Live Music Archive.'
  }
]

export function genreById(id: string | undefined): GenreDef | undefined {
  return GENRES.find((g) => g.id === id)
}

/* ---------------------------------- Moods ----------------------------------- */

export const MOODS: MoodDef[] = [
  {
    id: 'sad',
    label: 'Sad',
    clause: '((subject:(sad) OR title:(sad OR lonely OR tears)) AND NOT collection:(radioprograms))',
    openverseTag: 'sad',
    keywords: ['sad', 'sorrow', 'lonely', 'loneliness', 'tears', 'crying', 'heartbreak', 'broken heart', 'dard', 'bewafa', 'judai', 'viraha'],
    gradient: 'from-slate-700 to-blue-900',
    description: 'Melancholy ballads and sorrowful songs.'
  },
  {
    id: 'happy',
    label: 'Happy',
    clause: '(subject:(happy) OR subject:(feel good) OR title:(happy)) AND format:(MP3)',
    openverseTag: 'happy',
    keywords: ['happy', 'joy', 'cheerful', 'feel good', 'sunny', 'smile', 'khushi'],
    gradient: 'from-yellow-400 to-amber-500',
    description: 'Uplifting, feel-good music.'
  },
  {
    id: 'romantic',
    label: 'Romantic',
    clause: '(subject:(romantic) OR subject:(love songs) OR title:(love)) AND format:(MP3) AND NOT collection:(radioprograms)',
    openverseTag: 'romantic',
    keywords: ['love', 'romantic', 'romance', 'pyar', 'ishq', 'mohabbat', 'valentine', 'beloved', 'dil'],
    gradient: 'from-rose-500 to-pink-600',
    description: 'Love songs and tender duets.'
  },
  {
    id: 'peaceful',
    label: 'Peaceful',
    clause: '(subject:(peaceful) OR subject:(meditation) OR subject:(relaxation)) AND format:(MP3)',
    openverseTag: 'calm',
    keywords: ['peaceful', 'calm', 'serene', 'meditation', 'relax', 'soothing', 'tranquil', 'shanti'],
    gradient: 'from-teal-500 to-emerald-600',
    description: 'Calm, meditative and restful soundscapes.'
  },
  {
    id: 'devotional',
    label: 'Devotional',
    clause: '(subject:(devotional) OR subject:(bhajan) OR subject:(aarti) OR subject:(kirtan) OR subject:(gospel))',
    openverseTag: 'devotional',
    keywords: ['bhajan', 'aarti', 'kirtan', 'devotional', 'prayer', 'gospel', 'hymn', 'stotra', 'mantra', 'gurbani'],
    gradient: 'from-amber-500 to-orange-600',
    description: 'Songs of devotion across traditions.'
  },
  {
    id: 'motivational',
    label: 'Motivational',
    clause: '(subject:(motivational) OR subject:(inspiring) OR title:(anthem)) AND format:(MP3)',
    openverseTag: 'motivational',
    keywords: ['motivational', 'inspiring', 'inspiration', 'anthem', 'triumphant', 'heroic', 'rise'],
    gradient: 'from-orange-500 to-red-600',
    description: 'Anthems to move you forward.'
  },
  {
    id: 'energetic',
    label: 'Energetic',
    clause: '(subject:(energetic) OR subject:(dance) OR subject:(edm) OR subject:(uptempo)) AND format:(MP3)',
    openverseTag: 'energetic',
    keywords: ['energetic', 'dance', 'edm', 'party', 'uptempo', 'banger', 'club', 'bhangra'],
    gradient: 'from-fuchsia-500 to-orange-500',
    description: 'High-tempo dance and party music.'
  },
  {
    id: 'relaxing',
    label: 'Relaxing',
    clause: '(subject:(relaxing) OR subject:(chillout) OR subject:(downtempo)) AND format:(MP3)',
    openverseTag: 'relaxing',
    keywords: ['relaxing', 'chill', 'chillout', 'downtempo', 'laid back', 'easy listening', 'smooth'],
    gradient: 'from-cyan-500 to-teal-600',
    description: 'Unwind with easy, unhurried music.'
  },
  {
    id: 'focus',
    label: 'Focus',
    clause: '(subject:(lo-fi) OR subject:(lofi) OR subject:(study music) OR subject:(instrumental)) AND format:(MP3) AND NOT collection:(radioprograms)',
    openverseTag: 'lofi',
    keywords: ['lo-fi', 'lofi', 'study', 'focus', 'concentration', 'instrumental', 'chillhop'],
    gradient: 'from-violet-600 to-indigo-700',
    description: 'Beats and instrumentals for deep work.'
  },
  {
    id: 'workout',
    label: 'Workout',
    clause: '(subject:(workout) OR subject:(high energy) OR subject:(house music)) AND format:(MP3)',
    openverseTag: 'workout',
    keywords: ['workout', 'gym', 'high energy', 'running', 'power', 'pump'],
    gradient: 'from-red-500 to-orange-600',
    description: 'Drive and adrenaline for training.'
  },
  {
    id: 'nostalgic',
    label: 'Nostalgic',
    clause: '(collection:(georgeblood) OR subject:(nostalgic) OR subject:(oldies) OR subject:(retro)) AND format:(MP3)',
    keywords: ['nostalgic', 'oldies', 'retro', 'vintage', '78rpm', 'classic', 'yaad'],
    gradient: 'from-amber-700 to-yellow-700',
    description: 'Vintage 78rpm sides and golden oldies.'
  },
  {
    id: 'melancholic',
    label: 'Melancholic',
    clause: '(subject:(melancholic) OR subject:(melancholy) OR subject:(blues)) AND format:(MP3)',
    openverseTag: 'melancholic',
    keywords: ['melancholic', 'melancholy', 'wistful', 'blues', 'bittersweet', 'gham'],
    gradient: 'from-gray-600 to-slate-800',
    description: 'Bittersweet and wistful moods.'
  },
  {
    id: 'sleep',
    label: 'Sleep',
    clause: '(subject:(sleep) OR subject:(lullaby) OR subject:(white noise) OR subject:(drones)) AND format:(MP3)',
    openverseTag: 'sleep',
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
  { id: 'hindi', label: 'Hindi', nativeLabel: 'हिन्दी', clause: 'language:(hin OR hindi)' },
  { id: 'english', label: 'English', clause: 'language:(eng OR english)' },
  { id: 'punjabi', label: 'Punjabi', nativeLabel: 'ਪੰਜਾਬੀ', clause: 'language:(pan OR punjabi OR panjabi)' },
  { id: 'sanskrit', label: 'Sanskrit', nativeLabel: 'संस्कृतम्', clause: 'language:(san OR sanskrit)' },
  { id: 'tamil', label: 'Tamil', nativeLabel: 'தமிழ்', clause: 'language:(tam OR tamil)' },
  { id: 'telugu', label: 'Telugu', nativeLabel: 'తెలుగు', clause: 'language:(tel OR telugu)' },
  { id: 'bengali', label: 'Bengali', nativeLabel: 'বাংলা', clause: 'language:(ben OR bengali OR bangla)' },
  { id: 'marathi', label: 'Marathi', nativeLabel: 'मराठी', clause: 'language:(mar OR marathi)' },
  { id: 'gujarati', label: 'Gujarati', nativeLabel: 'ગુજરાતી', clause: 'language:(guj OR gujarati)' },
  { id: 'malayalam', label: 'Malayalam', nativeLabel: 'മലയാളം', clause: 'language:(mal OR malayalam)' },
  { id: 'kannada', label: 'Kannada', nativeLabel: 'ಕನ್ನಡ', clause: 'language:(kan OR kannada)' }
]

export function languageById(id: string | undefined): LanguageDef | undefined {
  return LANGUAGES.find((l) => l.id === id)
}

/** Map an archive.org language code/name to our language id when known. */
export function normalizeLanguageCode(raw: string | null | undefined): string | null {
  if (!raw) return null
  const r = raw.toLowerCase().trim()
  for (const l of LANGUAGES) {
    const parts = l.clause.replace('language:(', '').replace(')', '').split(/\s+or\s+/i)
    if (parts.includes(r)) return l.id
  }
  return null
}
