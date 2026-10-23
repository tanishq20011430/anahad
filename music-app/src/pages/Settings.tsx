/** Settings: theme, quality, sources, playback engine, history, data controls, transparency. */

import { useEffect, useState } from 'react'
import { Moon, Sun, Trash2, ShieldCheck, Keyboard, Sparkles, Gauge, Globe } from 'lucide-react'
import { useSettings } from '../stores/settings'
import { useLibrary } from '../stores/library'
import { audioCache } from '../lib/audioCache'
import { preload } from '../lib/preload'
import { VERIFIED_SOURCES, EXCLUDED_SOURCES } from '../lib/sourceStatus'
import { toast } from '../components/ui'
import { CACHE_BUDGET_LABEL, type CacheMode, type QualityPreference } from '../types'
import { WEIGHTS } from '../lib/recommend'

const QUALITY_HELP: Record<QualityPreference, string> = {
  auto: 'Balanced default — best compatible MP3 up to ~192 kbps where the source lists bitrates.',
  highest: 'Best available for the track (lossless only when a source truly provides it).',
  'data-saver': 'Lowest available bitrate to save data. On YouTube this requests the smallest quality.',
  standard: 'Targets ≤128 kbps files when a source lists them.',
  high: 'Targets ≥192 kbps files when a source lists them.',
  lossless: 'Lossless only where a source genuinely provides it — never assumed, never faked.'
}

export function SettingsPage() {
  const theme = useSettings((s) => s.theme)
  const quality = useSettings((s) => s.quality)
  const historyEnabled = useSettings((s) => s.historyEnabled)
  const autoplayNext = useSettings((s) => s.autoplayNext)
  const artistAutoplay = useSettings((s) => s.artistAutoplay)
  const preloadEnabled = useSettings((s) => s.preloadEnabled)
  const cacheMode = useSettings((s) => s.cacheMode)
  const sources = useSettings((s) => s.sources)
  const [confirmWipe, setConfirmWipe] = useState(false)
  const [cacheStats, setCacheStats] = useState(audioCache.stats())
  const [preloadInfo, setPreloadInfo] = useState(preload.getInfo())

  // Live engine diagnostics (cheap; the underlying stats are plain counters).
  useEffect(() => {
    const t = setInterval(() => {
      setCacheStats(audioCache.stats())
      setPreloadInfo(preload.getInfo())
    }, 2000)
    return () => clearInterval(t)
  }, [])

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header className="pt-2">
        <h1 className="text-2xl font-extrabold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-zinc-500">Everything here is stored on this device only.</p>
      </header>

      <Section title="Appearance" icon={<Moon className="h-4 w-4" />}>
        <SettingRow label="Theme" hint="Dark is the designed default; light keeps the same layout.">
          <div className="flex gap-1 rounded-full bg-black/30 p-1 ring-1 ring-white/10">
            {(['dark', 'light'] as const).map((t) => (
              <button
                key={t}
                onClick={() => useSettings.getState().setTheme(t)}
                aria-pressed={theme === t}
                className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition ${theme === t ? 'bg-accent text-black' : 'text-zinc-400 hover:text-zinc-200'}`}
              >
                {t === 'dark' ? <Moon className="h-3.5 w-3.5" /> : <Sun className="h-3.5 w-3.5" />}
                {t[0].toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
        </SettingRow>
      </Section>

      <Section title="Playback" icon={<Sparkles className="h-4 w-4" />}>
        <SettingRow label="Audio quality" hint={QUALITY_HELP[quality]}>
          <select
            value={quality}
            onChange={(e) => useSettings.getState().setQuality(e.target.value as QualityPreference)}
            aria-label="Preferred audio quality"
            className="rounded-lg bg-black/30 px-3 py-2 text-xs text-zinc-200 ring-1 ring-white/10 focus:outline-none"
          >
            <option value="auto">Auto</option>
            <option value="highest">Highest available</option>
            <option value="high">High</option>
            <option value="standard">Standard</option>
            <option value="data-saver">Data saver</option>
            <option value="lossless">Lossless (if available)</option>
          </select>
        </SettingRow>
        <SettingRow label="Autoplay next track" hint="Continue through the queue when a track ends. Failed tracks are skipped automatically.">
          <Toggle checked={autoplayNext} onChange={(v) => useSettings.getState().setAutoplayNext(v)} label="Autoplay next" />
        </SettingRow>
        <SettingRow
          label="Keep playing the artist's hits"
          hint="When the queue runs out, continue with the top hits of the artist you were listening to (ranked by Apple's popularity data)."
        >
          <Toggle checked={artistAutoplay} onChange={(v) => useSettings.getState().setArtistAutoplay(v)} label="Keep playing the artist's hits" />
        </SettingRow>
      </Section>

      <Section title="Playback engine" icon={<Gauge className="h-4 w-4" />}>
        <SettingRow
          label="Next-track preloading"
          hint={
            preloadEnabled
              ? preloadInfo.state === 'primed'
                ? 'On — the next track’s opening seconds are already buffered in memory for a gapless handoff.'
                : preloadInfo.state === 'priming'
                  ? 'On — buffering the next track’s opening seconds now.'
                  : preloadInfo.state === 'skipped' && preloadInfo.reason?.includes('streams directly')
                    ? 'On — upcoming metadata is prefetched; this source’s host streams directly (no prebuffer possible).'
                    : preloadInfo.state === 'skipped'
                      ? `On — next track not prebuffered: ${preloadInfo.reason ?? 'unknown reason'}.`
                      : 'On — upcoming track metadata is fetched early and a small slice of audio (≈256 KB) is buffered in RAM.'
              : 'Off — tracks load only when they start.'
          }
        >
          <Toggle checked={preloadEnabled} onChange={(v) => useSettings.getState().setPreloadEnabled(v)} label="Preload next track" />
        </SettingRow>
        <SettingRow label="Temporary audio cache" hint="Bounded in-RAM slices of upcoming audio. Never written to disk, auto-deleted after the track ends, on queue changes, after 30 minutes, or when you clear it.">
          <select
            value={cacheMode}
            onChange={(e) => useSettings.getState().setCacheMode(e.target.value as CacheMode)}
            aria-label="Temporary audio cache size"
            className="rounded-lg bg-black/30 px-3 py-2 text-xs text-zinc-200 ring-1 ring-white/10 focus:outline-none"
          >
            {(Object.keys(CACHE_BUDGET_LABEL) as CacheMode[]).map((m) => (
              <option key={m} value={m}>
                {CACHE_BUDGET_LABEL[m]}
              </option>
            ))}
          </select>
        </SettingRow>
        <SettingRow
          label="Cache usage"
          hint={
            cacheStats.entries === 0
              ? 'Nothing buffered right now.'
              : `${(cacheStats.bytes / 1024 / 1024).toFixed(1)} MB in ${cacheStats.entries} slice${cacheStats.entries === 1 ? '' : 's'}${cacheStats.unavailableHosts.length > 0 ? ` · ${cacheStats.unavailableHosts.length} source host(s) stream natively (no prebuffer possible)` : ''}`
          }
        >
          <button
            onClick={() => {
              audioCache.clear()
              preload.cancelAll()
              setCacheStats(audioCache.stats())
              toast('Temporary audio cache cleared')
            }}
            className="rounded-lg bg-white/5 px-3 py-2 text-xs font-medium text-zinc-300 ring-1 ring-white/10 transition hover:bg-white/10"
          >
            Clear now
          </button>
        </SettingRow>
      </Section>

      <Section title="Sources" icon={<Globe className="h-4 w-4" />}>
        <p className="text-xs leading-relaxed text-zinc-500">
          Only verified-working sources are listed as connected. Each one was checked against the live API (CORS, direct
          audio, licenses) before being enabled.
        </p>
        {VERIFIED_SOURCES.map((s) => (
          <SettingRow
            key={s.id}
            label={s.label}
            hint={`${s.summary} Verified ${s.verifiedAt}.${s.limits.length ? ` Limits: ${s.limits.join(' ')}` : ''}`}
          >
            <Toggle
              checked={sources[s.id as keyof typeof sources]}
              onChange={(v) => useSettings.getState().setSourceEnabled(s.id as keyof typeof sources, v)}
              label={`Use ${s.label}`}
            />
          </SettingRow>
        ))}
        <div className="rounded-lg bg-black/20 p-3">
          <p className="text-xs font-semibold text-zinc-400">Evaluated but not integrated (access rules honored)</p>
          <ul className="mt-1.5 space-y-1.5 text-[11px] leading-relaxed text-zinc-500">
            {EXCLUDED_SOURCES.map((e) => (
              <li key={e.label}>
                <a href={e.homeUrl} target="_blank" rel="noopener noreferrer" className="font-medium text-zinc-400 underline decoration-zinc-700 hover:text-zinc-300">
                  {e.label}
                </a>{' '}
                — {e.reason}
              </li>
            ))}
          </ul>
        </div>
      </Section>

      <Section title="Privacy" icon={<ShieldCheck className="h-4 w-4" />}>
        <SettingRow label="Listening history" hint="When off, plays are not recorded and recommendations stop adapting. Nothing is ever uploaded either way.">
          <Toggle checked={historyEnabled} onChange={(v) => useSettings.getState().setHistoryEnabled(v)} label="Record history" />
        </SettingRow>
        <SettingRow label="Clear history" hint="Erases all recorded plays from this browser.">
          <button
            onClick={() => {
              void useLibrary.getState().clearHistory()
              toast('Listening history cleared')
            }}
            className="rounded-lg bg-white/5 px-3 py-2 text-xs font-medium text-zinc-300 ring-1 ring-white/10 transition hover:bg-red-500/10 hover:text-red-300"
          >
            Clear history
          </button>
        </SettingRow>
        <SettingRow label="Clear all local data" hint="Deletes playlists, likes, saved albums, artists, history and settings. Cannot be undone.">
          {confirmWipe ? (
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  void useLibrary.getState().clearAllData()
                  setConfirmWipe(false)
                  toast('All local data cleared')
                }}
                className="rounded-lg bg-red-500/20 px-3 py-2 text-xs font-bold text-red-300 ring-1 ring-red-500/40"
              >
                Yes, erase everything
              </button>
              <button onClick={() => setConfirmWipe(false)} className="text-xs text-zinc-500 hover:text-zinc-300">
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmWipe(true)}
              className="flex items-center gap-1.5 rounded-lg bg-white/5 px-3 py-2 text-xs font-medium text-zinc-300 ring-1 ring-white/10 transition hover:bg-red-500/10 hover:text-red-300"
            >
              <Trash2 className="h-3.5 w-3.5" /> Clear all data
            </button>
          )}
        </SettingRow>
      </Section>

      <Section title="Keyboard shortcuts" icon={<Keyboard className="h-4 w-4" />}>
        <div className="grid grid-cols-2 gap-2 text-xs text-zinc-400 sm:grid-cols-3">
          {[
            ['Space / K', 'Play / pause'],
            ['← / →', 'Seek ±5s (Shift: ±10s)'],
            ['J / L', 'Previous / next'],
            ['↑ / ↓', 'Volume'],
            ['M', 'Mute'],
            ['S', 'Shuffle'],
            ['R', 'Repeat mode']
          ].map(([k, v]) => (
            <div key={k} className="flex items-center gap-2 rounded-lg bg-black/20 px-2.5 py-2">
              <kbd className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[10px] text-zinc-200">{k}</kbd>
              <span>{v}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section title="How recommendations work" icon={<Sparkles className="h-4 w-4" />}>
        <p className="text-xs leading-relaxed text-zinc-500">
          A transparent weighted score runs in your browser — no server, no profile, no AI service. Signals and weights:
        </p>
        <ul className="mt-2 space-y-1 text-xs text-zinc-400">
          <li>• Genre similarity — {WEIGHTS.genre}</li>
          <li>• Mood similarity (keyword-estimated) — {WEIGHTS.mood}</li>
          <li>• Artist affinity — {WEIGHTS.artist}</li>
          <li>• Language match — {WEIGHTS.language}</li>
          <li>• Like affinity — {WEIGHTS.likeAffinity}</li>
          <li>• Community popularity (archive downloads) — {WEIGHTS.popularity}</li>
        </ul>
        <p className="mt-2 text-xs leading-relaxed text-zinc-500">
          Skipped tracks reduce related suggestions; recent plays are penalized to avoid repetition; per-artist caps keep
          lists diverse. Tracks without playable audio are demoted, never fabricated.
        </p>
      </Section>

      <Section title="About">
        <p className="text-xs leading-relaxed text-zinc-500">
          Anahad v2.0 — a zero-configuration, multi-source player for openly licensed music (Internet Archive + Openverse:
          Jamendo, Wikimedia, Freesound). No accounts, no API keys, no ads, no tracking. See{' '}
          <a href="#/privacy" className="text-accent-soft hover:underline">
            Privacy & sources
          </a>{' '}
          for details.
        </p>
      </Section>
    </div>
  )
}

function Section({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl bg-surface-raised/60 p-4 ring-1 ring-white/5" aria-label={title}>
      <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-zinc-100">
        <span className="text-accent">{icon}</span>
        {title}
      </h2>
      <div className="space-y-3">{children}</div>
    </section>
  )
}

function SettingRow({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0 max-w-md">
        <p className="text-sm font-medium text-zinc-200">{label}</p>
        {hint ? <p className="mt-0.5 text-xs leading-relaxed text-zinc-500">{hint}</p> : null}
      </div>
      {children}
    </div>
  )
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 flex-shrink-0 rounded-full transition ${checked ? 'bg-accent' : 'bg-zinc-700'}`}
    >
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${checked ? 'left-[22px]' : 'left-0.5'}`} aria-hidden />
    </button>
  )
}
