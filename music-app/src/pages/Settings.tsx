/** Settings: theme, quality, history, data controls, shortcuts, transparency. */

import { useState } from 'react'
import { Moon, Sun, Trash2, ShieldCheck, Keyboard, Sparkles } from 'lucide-react'
import { useSettings } from '../stores/settings'
import { useLibrary } from '../stores/library'
import { toast } from '../components/ui'
import type { QualityPreference } from '../types'
import { WEIGHTS } from '../lib/recommend'

const QUALITY_HELP: Record<QualityPreference, string> = {
  auto: 'Balanced default — best compatible MP3 up to ~192 kbps.',
  highest: 'Best available for the track (FLAC when the source truly has it).',
  'data-saver': 'Lowest available bitrate to save data.',
  standard: 'Targets ≤128 kbps files when present.',
  high: 'Targets ≥192 kbps files when present.',
  lossless: 'FLAC only when the archive item genuinely contains it.'
}

export function SettingsPage() {
  const theme = useSettings((s) => s.theme)
  const quality = useSettings((s) => s.quality)
  const historyEnabled = useSettings((s) => s.historyEnabled)
  const autoplayNext = useSettings((s) => s.autoplayNext)
  const [confirmWipe, setConfirmWipe] = useState(false)

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
          Anahad v1.0 — a zero-configuration player for open archives. No accounts, no API keys, no ads, no tracking.
          Audio and metadata come from archive.org under each item's license. See{' '}
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
