/** Privacy notice + provider attribution + honest limitations. */

import { ExternalLink, ShieldCheck, Music4, TriangleAlert } from 'lucide-react'

export function PrivacyPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header className="pt-2">
        <h1 className="text-2xl font-extrabold tracking-tight">Privacy & sources</h1>
        <p className="mt-1 text-sm text-zinc-500">What this app stores, what it sends, and where the music comes from.</p>
      </header>

      <section className="rounded-2xl bg-surface-raised/60 p-5 ring-1 ring-white/5" aria-label="Privacy notice">
        <h2 className="flex items-center gap-2 text-sm font-bold">
          <ShieldCheck className="h-4 w-4 text-accent" aria-hidden /> Privacy notice
        </h2>
        <ul className="mt-3 space-y-2.5 text-xs leading-relaxed text-zinc-400">
          <li>
            <strong className="text-zinc-200">No accounts, no server, no database.</strong> Everything personal — playlists,
            likes, history, settings — lives in your browser (IndexedDB/localStorage) and is never uploaded anywhere.
          </li>
          <li>
            <strong className="text-zinc-200">No ads, no trackers, no analytics.</strong> The app itself makes no
            advertising or telemetry requests. Period.
          </li>
          <li>
            <strong className="text-zinc-200">Requests to archive.org.</strong> Search and playback fetch public data from
            archive.org; like any web service, they see your requests and may log them under{' '}
            <a href="https://archive.org/about/privacy.php" target="_blank" rel="noopener noreferrer" className="text-accent-soft hover:underline">
              their privacy policy
            </a>
            . Anahad adds nothing to those requests.
          </li>
          <li>
            <strong className="text-zinc-200">History is optional.</strong> Disable it in Settings and plays stop being
            recorded. “Clear all local data” wipes every trace.
          </li>
          <li>
            <strong className="text-zinc-200">Local data caveats.</strong> Browser storage doesn't sync between devices and
            can be lost if you clear site data — export playlists to keep them.
          </li>
          <li>
            <strong className="text-zinc-200">Official embeds (optional).</strong> If you paste a YouTube or Spotify link,
            their official embedded player loads and is governed by their own privacy terms. Anahad never extracts or
            circumvents their streams or ads.
          </li>
        </ul>
      </section>

      <section className="rounded-2xl bg-surface-raised/60 p-5 ring-1 ring-white/5" aria-label="Source attribution">
        <h2 className="flex items-center gap-2 text-sm font-bold">
          <Music4 className="h-4 w-4 text-accent" aria-hidden /> Music sources & attribution
        </h2>
        <div className="mt-3 space-y-4 text-xs leading-relaxed text-zinc-400">
          <div>
            <p className="font-semibold text-zinc-200">Internet Archive (archive.org) — the only built-in catalog</p>
            <p className="mt-1">
              Search metadata and audio files are fetched from the public advancedsearch/metadata APIs and download
              endpoints. Licenses vary <em>per item</em>: some uploads are Creative Commons, some are public domain, some
              (like the Live Music Archive) are band-approved recordings with their own terms. Anahad shows each item's
              license when available and links to the source page so you can verify rights before any reuse. Being on
              archive.org does <strong className="text-zinc-300">not</strong> automatically mean public domain.
            </p>
            <a href="https://archive.org/details/etree" target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 text-accent-soft hover:underline">
              Live Music Archive <ExternalLink className="h-3 w-3" />
            </a>
          </div>
          <div>
            <p className="font-semibold text-zinc-200">Collections we lean on</p>
            <ul className="mt-1 list-inside list-disc space-y-0.5">
              <li>Netlabels — Creative Commons music from independent netlabels</li>
              <li>Live Music Archive (etree) — band-approved live concerts</li>
              <li>78rpm & George Blood collection — digitized historical discs</li>
              <li>Musopen — public-domain classical performances</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="rounded-2xl bg-surface-raised/60 p-5 ring-1 ring-white/5" aria-label="Limitations">
        <h2 className="flex items-center gap-2 text-sm font-bold">
          <TriangleAlert className="h-4 w-4 text-amber-400" aria-hidden /> Honest limitations
        </h2>
        <ul className="mt-3 space-y-2.5 text-xs leading-relaxed text-zinc-400">
          <li>
            <strong className="text-zinc-200">Jamendo, Free Music Archive:</strong> not integrated. Jamendo's API requires
            a client ID and FMA's catalog availability is unstable — including them would break the zero-configuration
            promise.
          </li>
          <li>
            <strong className="text-zinc-200">YouTube / Spotify:</strong> supported only via their official embedded
            players for links you paste. Keyless search APIs don't exist for them, so Anahad can't discover their content
            for you — and never scrapes or extracts.
          </li>
          <li>
            <strong className="text-zinc-200">Moods:</strong> archive metadata rarely tags moods, so Anahad estimates them
            from titles/subjects and labels them “estimated”. Genre/language tags come from the source as-is.
          </li>
          <li>
            <strong className="text-zinc-200">Quality:</strong> bitrates shown are computed from real file sizes. When a
            source doesn't expose quality data, the UI says so instead of inventing numbers.
          </li>
        </ul>
      </section>
    </div>
  )
}
