/** Formatting + parsing helpers. Pure functions — unit tested. */

/**
 * archive.org stores `length` as either seconds ("421.12") or "mm:ss"/"hh:mm:ss".
 */
export function parseLength(raw: string | number | undefined | null): number | null {
  if (raw === undefined || raw === null || raw === '') return null
  if (typeof raw === 'number') return Number.isFinite(raw) && raw > 0 ? Math.round(raw) : null
  const s = String(raw).trim()
  if (!s) return null
  if (/^\d+(\.\d+)?$/.test(s)) {
    const n = parseFloat(s)
    return Number.isFinite(n) && n > 0 ? Math.round(n) : null
  }
  const parts = s.split(':').map((p) => parseFloat(p))
  if (parts.some((p) => !Number.isFinite(p))) return null
  let sec = 0
  for (const p of parts) sec = sec * 60 + p
  return sec > 0 ? Math.round(sec) : null
}

/** 421 -> "7:01", 3671 -> "1:01:11" */
export function formatDuration(totalSec: number | null | undefined): string {
  if (totalSec === undefined || totalSec === null || !Number.isFinite(totalSec) || totalSec < 0) return '--:--'
  const s = Math.floor(totalSec)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m)
  return h > 0 ? `${h}:${mm}:${String(sec).padStart(2, '0')}` : `${mm}:${String(sec).padStart(2, '0')}`
}

/** Average bitrate from size + duration. Returns null when unverifiable. */
export function computeBitrateKbps(sizeBytes: number | null, durationSec: number | null): number | null {
  if (!sizeBytes || !durationSec || durationSec <= 0) return null
  const kbps = Math.round((sizeBytes * 8) / 1000 / durationSec)
  if (!Number.isFinite(kbps) || kbps <= 0) return null
  return kbps
}

/** Pretty a raw filename stem into a human track title. */
export function prettifyFileName(name: string): string {
  let t = name.replace(/\.(mp3|flac|ogg|m4a|wav|opus|aac)$/i, '')
  t = t.replace(/_(64kb|96kb|128kb|vbr|sample|preview)$/i, '')
  // Strip leading track numbers only when a separator follows ("01 - ", "01.", "01_")
  t = t.replace(/^\d{1,3}\s*[-._]\s*/, '')
  t = t.replace(/[_]+/g, ' ')
  t = t.replace(/\s+/g, ' ').trim()
  t = t.replace(/^[-.\s]+/, '')
  if (!t) return name
  // Title-case words that are all-lowercase (2+ letters; keeps "a", "I" as-is)
  t = t.replace(/\b[a-z]+/g, (w) => (w.length >= 2 ? w[0].toUpperCase() + w.slice(1) : w))
  return t
}

/** Escape Lucene special characters in user free-text for advancedsearch queries. */
export function escapeLucene(input: string): string {
  return input.replace(/[+\-!(){}[\]^"~*?:\\/&&||]/g, ' ').replace(/\s+/g, ' ').trim()
}

/** Normalized dedupe key: title + artist lowercased, punctuation stripped. */
export function dedupeKey(title: string, artist: string): string {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9\u0900-\u097F\u0980-\u09FF]+/g, '')
  return `${norm(title)}|${norm(artist)}`
}

/** Map an archive.org licenseurl to a short human label. */
export function licenseLabel(url: string | null | undefined, collection?: string | null): string | null {
  if (url) {
    const m = url.match(/creativecommons\.org\/(?:licenses|publicdomain)\/([a-z\-./0-9]+)/i)
    if (m) {
      const code = m[1].replace(/\/$/, '').replace(/\//g, '-').toUpperCase()
      if (/^zero-?1/i.test(code)) return 'CC0 Public Domain'
      if (/^pd/i.test(code)) return 'Public Domain'
      return `CC ${code}`
    }
    if (/publicdomain/i.test(url)) return 'Public Domain'
    return 'See license'
  }
  if (collection === 'etree') return 'Band-approved live recording'
  return null
}

/** Clamp helper */
export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}

/** Safe display: trims and falls back. */
export function displayText(s: string | null | undefined, fallback = 'Unknown'): string {
  const t = (s ?? '').trim()
  return t.length > 0 ? t : fallback
}

/** Parse a 4-digit year out of misc date fields. */
export function parseYear(date: string | number | undefined | null): number | null {
  if (date === undefined || date === null) return null
  const m = String(date).match(/(1[89]\d{2}|20[0-2]\d)/)
  return m ? parseInt(m[1], 10) : null
}
