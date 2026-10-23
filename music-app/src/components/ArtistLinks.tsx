/** Renders a track's credit line with each artist linking to their Artist page. */

import { Fragment } from 'react'
import { Link } from 'react-router-dom'
import type { Track } from '../types'
import { splitArtists } from '../lib/appleTracks'

export function artistPath(name: string): string {
  return `/artist/${encodeURIComponent(name)}`
}

export function ArtistLinks({ track, className = '', onNavigate }: { track: Track; className?: string; onNavigate?: () => void }) {
  // Radio "artists" are station countries and Mixcloud ones are show hosts — not linkable.
  const linkable = track.source !== 'radio' && track.source !== 'mixcloud' && !/^unknown/i.test(track.artist)
  const names = linkable ? splitArtists(track.artist) : []
  if (names.length === 0) return <span className={className}>{track.artist}</span>
  return (
    <span className={className}>
      {names.map((name, i) => (
        <Fragment key={`${name}-${i}`}>
          {i > 0 ? ', ' : null}
          <Link to={artistPath(name)} onClick={onNavigate} className="hover:text-zinc-200 hover:underline">
            {name}
          </Link>
        </Fragment>
      ))}
    </span>
  )
}
