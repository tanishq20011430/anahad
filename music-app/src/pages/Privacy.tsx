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
            <strong className="text-zinc-200">Requests to music sources.</strong> Search and playback talk directly to the
            connected sources' public endpoints: the Piped community relays and YouTube's player (for YouTube), the
            official Audius API, the radio-browser.info directory, the Openverse API (Jamendo, Wikimedia Commons,
            Freesound) and Mixcloud's public API. Like any web service, they see your requests and may log them under
            their own privacy policies. Anahad adds nothing to those requests — no identifiers, no profiles.
          </li>
          <li>
            <strong className="text-zinc-200">Temporary audio cache is RAM-only.</strong> To reduce gaps between songs,
            the player keeps small opening slices (≈256 KB) of upcoming tracks in memory, inside a hard budget you set in
            Settings (Off / 32 MB / 96 MB). Slices are deleted when the track ends, when the queue changes, after 30
            minutes, or via “Clear now”. Nothing audio-related is ever written to IndexedDB, Cache Storage, or disk, and
            closing the tab releases everything. YouTube audio is never cached by the app — it streams inside YouTube's
            official player, under YouTube's own delivery.
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
            <strong className="text-zinc-200">Embedded & provider-controlled players.</strong> YouTube playback always
            runs inside YouTube's official embedded player, and Mixcloud/Spotify items render their official widgets when
            you play or paste them. Those players are governed by their own privacy terms. Anahad never extracts streams
            or circumvents ads.
          </li>
        </ul>
      </section>

      <section className="rounded-2xl bg-surface-raised/60 p-5 ring-1 ring-white/5" aria-label="Source attribution">
        <h2 className="flex items-center gap-2 text-sm font-bold">
          <Music4 className="h-4 w-4 text-accent" aria-hidden /> Music sources & attribution
        </h2>
        <div className="mt-3 space-y-4 text-xs leading-relaxed text-zinc-400">
          <div>
            <p className="font-semibold text-zinc-200">YouTube — official player, community search relays</p>
            <p className="mt-1">
              Search results come from community-run{' '}
              <a href="https://github.com/TeamPiped/Piped" target="_blank" rel="noopener noreferrer" className="text-accent-soft hover:underline">
                Piped
              </a>{' '}
              relays — open-source servers that expose YouTube search as JSON with permissive CORS. Playback always
              happens inside the <strong className="text-zinc-300">official YouTube IFrame Player</strong> (hidden,
              audio-first): YouTube controls delivery, counts plays, and enforces its own rules. Anahad never extracts
              media URLs, never bypasses ads, and needs no API keys. If both configured relays are down, the source
              degrades with a notice while other sources keep working.
            </p>
            <a href="https://www.youtube.com/t/terms" target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 text-accent-soft hover:underline">
              YouTube Terms of Service <ExternalLink className="h-3 w-3" />
            </a>
          </div>
          <div>
            <p className="font-semibold text-zinc-200">Audius — official open API</p>
            <p className="mt-1">
              Full-length tracks from{' '}
              <a href="https://audius.co" target="_blank" rel="noopener noreferrer" className="text-accent-soft hover:underline">
                audius.co
              </a>{' '}
              artists, fetched from Audius' official keyless API (only a free-form app name is sent). The official stream
              endpoint serves the audio with CORS + Range support, which is what makes seamless pre-buffering possible.
              Each track remains the property of its uploader; Anahad links to it for verification.
            </p>
          </div>
          <div>
            <p className="font-semibold text-zinc-200">Radio Browser — the open radio directory</p>
            <p className="mt-1">
              Live stations come from{' '}
              <a href="https://www.radio-browser.info/" target="_blank" rel="noopener noreferrer" className="text-accent-soft hover:underline">
                radio-browser.info
              </a>
              , a community-maintained directory used by many open-source players. Streams belong to their broadcasters;
              codec and bitrate metadata comes from the directory verbatim. Only HTTPS streams are listed, and HLS-only
              stations are excluded rather than half-supported.
            </p>
          </div>
          <div>
            <p className="font-semibold text-zinc-200">Mixcloud — official widget</p>
            <p className="mt-1">
              Shows, sets and long-form mixes (including large devotional catalogs) are discovered through Mixcloud's
              keyless public API and played through the{' '}
              <a href="https://www.mixcloud.com" target="_blank" rel="noopener noreferrer" className="text-accent-soft hover:underline">
                official Mixcloud widget
              </a>
              . Mixcloud doesn't expose direct audio URLs, so their player stays in control.
            </p>
          </div>
          <div>
            <p className="font-semibold text-zinc-200">Openverse — keyless CC aggregation</p>
            <p className="mt-1">
              Track search runs through the Openverse API (built by Creative Commons / WordPress), which indexes
              full-length Creative Commons music from{' '}
              <a href="https://www.jamendo.com" target="_blank" rel="noopener noreferrer" className="text-accent-soft hover:underline">
                Jamendo
              </a>
              ,{' '}
              <a href="https://commons.wikimedia.org" target="_blank" rel="noopener noreferrer" className="text-accent-soft hover:underline">
                Wikimedia Commons
              </a>{' '}
              and{' '}
              <a href="https://freesound.org" target="_blank" rel="noopener noreferrer" className="text-accent-soft hover:underline">
                Freesound
              </a>{' '}
              under their respective CC licenses — each track links to its source page for verification. Anonymous API
              quota applies (≈200 searches/day); Anahad caches results locally to stay well inside it and shows a notice
              when a source is temporarily unavailable.
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-2xl bg-surface-raised/60 p-5 ring-1 ring-white/5" aria-label="Limitations">
        <h2 className="flex items-center gap-2 text-sm font-bold">
          <TriangleAlert className="h-4 w-4 text-amber-400" aria-hidden /> Honest limitations
        </h2>
        <ul className="mt-3 space-y-2.5 text-xs leading-relaxed text-zinc-400">
          <li>
            <strong className="text-zinc-200">Internet Archive was removed on purpose (v3):</strong> the app now focuses
            on music-first catalogs. Its APIs remain open and keyless — nothing about this removal reflects an access
            problem. Existing v2 playlist exports (archive.org references) can no longer be imported.
          </li>
          <li>
            <strong className="text-zinc-200">Piped relays are community infrastructure.</strong> YouTube search depends
            on volunteer-run instances; they can be slow or occasionally down. Anahad tries both configured relays,
            remembers the healthy one, and degrades honestly — it never falls back to unauthorized stream extraction.
          </li>
          <li>
            <strong className="text-zinc-200">Invidious:</strong> probed as a YouTube relay fallback — every reachable
            public instance blocks anonymous/datacenter access or locks CORS to its own web app, so it can't be used from
            a third-party browser app. We don't spoof origins.
          </li>
          <li>
            <strong className="text-zinc-200">Free Music Archive / FreePD:</strong> not integrated — FMA shut down its
            public API and FreePD closed its site. There is nothing legitimate left to connect to.
          </li>
          <li>
            <strong className="text-zinc-200">ccMixter:</strong> not integrated for playback — its query API is open,
            but audio files are hotlink-protected to ccmixter.org domains. Playing them here would require spoofing a
            Referer, i.e. circumventing access rules, which Anahad will not do.
          </li>
          <li>
            <strong className="text-zinc-200">Free To Use (freetouse.com):</strong> not integrated — its public API is
            origin-locked to freetouse.com, so third-party web apps cannot call it. We don't proxy around that.
          </li>
          <li>
            <strong className="text-zinc-200">Jamendo direct:</strong> their API needs a registered client ID, which
            would break the zero-configuration promise. Jamendo music remains available in-app through Openverse.
          </li>
          <li>
            <strong className="text-zinc-200">Spotify:</strong> supported only via its official embedded player for links
            you paste. Keyless search APIs don't exist for it, so Anahad can't discover Spotify content for you — and
            never scrapes or extracts.
          </li>
          <li>
            <strong className="text-zinc-200">Live radio:</strong> streams are live — no duration, no seeking, and
            broadcaster uptime varies. HTTP-only stations are intentionally invisible on HTTPS deployments.
          </li>
          <li>
            <strong className="text-zinc-200">Moods:</strong> sources rarely tag moods (Audius does), so Anahad estimates
            them from titles/subjects and labels them “estimated”. Genre/language tags come from the source as-is.
          </li>
          <li>
            <strong className="text-zinc-200">Quality:</strong> bitrates shown come verbatim from the source (Radio
            Browser publishes them; Audius/Openverse usually don't). For YouTube, the picker sends a quality request but
            YouTube's adaptive streaming decides — the UI says so instead of pretending.
          </li>
          <li>
            <strong className="text-zinc-200">Prebuffering coverage:</strong> audio pre-buffering works where a source's
            host is verified CORS + Range capable (Audius streams, Jamendo storage, Freesound CDN, Wikimedia). YouTube
            uses a cued hidden official player instead; radio and Mixcloud stream directly / via widget, and still get
            metadata prefetching.
          </li>
        </ul>
      </section>
    </div>
  )
}
