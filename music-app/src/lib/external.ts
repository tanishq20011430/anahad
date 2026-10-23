/**
 * External official embeds (YouTube / Spotify).
 *
 * Only official embed players are used — no stream extraction, no ad
 * circumvention, no DRM bypass. Parsing happens client-side from a URL the
 * user pastes; no API keys or developer credentials are involved.
 *
 * If a source restricts embedding, its player will simply refuse to load —
 * we never fake a playing state for it.
 */

import type { ExternalEmbed } from '../types'

export function parseExternalUrl(raw: string): ExternalEmbed | null {
  const url = raw.trim()
  if (!url) return null

  let parsed: URL
  try {
    parsed = new URL(url.startsWith('http') ? url : `https://${url}`)
  } catch {
    return null
  }

  const host = parsed.hostname.replace(/^www\./, '')

  // YouTube — official embed via privacy-enhanced mode
  if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtube-nocookie.com' || host === 'youtu.be') {
    let id: string | null = null
    if (host === 'youtu.be') {
      id = parsed.pathname.slice(1).split('/')[0] || null
    } else if (parsed.pathname === '/watch') {
      id = parsed.searchParams.get('v')
    } else {
      const m = parsed.pathname.match(/^\/(embed|shorts|live)\/([\w-]{6,})/)
      if (m) id = m[2]
    }
    if (id && /^[\w-]{6,20}$/.test(id)) {
      return { source: 'youtube', embedId: id, originalUrl: `https://www.youtube.com/watch?v=${id}`, title: 'YouTube video' }
    }
    return null
  }

  // Spotify — official embed player
  if (host === 'open.spotify.com' || host === 'spotify.com') {
    const m = parsed.pathname.match(/\/(track|album|playlist|episode)\/([A-Za-z0-9]+)/)
    if (m) {
      return { source: 'spotify', embedId: `${m[1]}:${m[2]}`, originalUrl: `https://open.spotify.com/${m[1]}/${m[2]}`, title: 'Spotify item' }
    }
    return null
  }

  // Mixcloud — official widget embed player
  if (host === 'mixcloud.com') {
    const m = parsed.pathname.match(/^\/([^/]+)\/([^/]+)\/?$/)
    if (m) {
      const key = `/${m[1]}/${m[2]}/`
      return { source: 'mixcloud', embedId: key, originalUrl: `https://www.mixcloud.com${key}`, title: 'Mixcloud show' }
    }
    return null
  }

  return null
}

export function embedSrc(embed: ExternalEmbed, autoplay: boolean): string {
  if (embed.source === 'youtube') {
    const params = new URLSearchParams({ rel: '0', modestbranding: '1' })
    if (autoplay) params.set('autoplay', '1')
    return `https://www.youtube-nocookie.com/embed/${embed.embedId}?${params.toString()}`
  }
  if (embed.source === 'mixcloud') {
    const params = new URLSearchParams({ feed: embed.embedId, light: 'false', hide_cover: '0' })
    if (autoplay) params.set('autoplay', '1')
    return `https://player-widget.mixcloud.com/widget/iframe/?${params.toString()}`
  }
  const [kind, id] = embed.embedId.split(':')
  return `https://open.spotify.com/embed/${kind}/${id}?utm_source=anahad&theme=0`
}

/** Fake-proof display title: we don't guess more than the source tells us. */
export function embedDisplayName(embed: ExternalEmbed): string {
  if (embed.source === 'youtube') return 'YouTube (official embed)'
  if (embed.source === 'mixcloud') return 'Mixcloud (official widget)'
  return 'Spotify (official embed)'
}
