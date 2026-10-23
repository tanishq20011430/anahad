/**
 * App settings — persisted to localStorage (small, synchronous, syncs at boot).
 * Listening history lives separately in IndexedDB and can be disabled.
 */

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { CacheMode, QualityPreference, SourceId } from '../types'

export interface SettingsState {
  theme: 'dark' | 'light'
  quality: QualityPreference
  historyEnabled: boolean
  autoplayNext: boolean
  /** Next-track preloading (metadata + small audio prebuffer). */
  preloadEnabled: boolean
  /** Bounded in-memory audio cache mode — never persisted to disk. */
  cacheMode: CacheMode
  /** Per-source participation in search/discovery. */
  sources: Record<'internet-archive' | 'openverse', boolean>
  setTheme: (t: 'dark' | 'light') => void
  setQuality: (q: QualityPreference) => void
  setHistoryEnabled: (v: boolean) => void
  setAutoplayNext: (v: boolean) => void
  setPreloadEnabled: (v: boolean) => void
  setCacheMode: (m: CacheMode) => void
  setSourceEnabled: (id: 'internet-archive' | 'openverse', v: boolean) => void
}

function applyTheme(theme: 'dark' | 'light') {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  root.classList.toggle('dark', theme === 'dark')
  root.style.colorScheme = theme
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      theme: 'dark',
      quality: 'auto',
      historyEnabled: true,
      autoplayNext: true,
      preloadEnabled: true,
      cacheMode: 'standard',
      sources: { 'internet-archive': true, openverse: true },
      setTheme: (t) => {
        applyTheme(t)
        set({ theme: t })
      },
      setQuality: (q) => set({ quality: q }),
      setHistoryEnabled: (v) => set({ historyEnabled: v }),
      setAutoplayNext: (v) => set({ autoplayNext: v }),
      setPreloadEnabled: (v) => {
        set({ preloadEnabled: v })
        if (!v) {
          // Policy: turning preloading off also drops primed-but-unplayed audio.
          void import('../lib/preload').then((m) => m.preload.cancelAll())
        }
      },
      setCacheMode: (m) => {
        set({ cacheMode: m })
        void import('../lib/audioCache').then(({ audioCache }) => {
          audioCache.configure(m)
        })
      },
      setSourceEnabled: (id, v) => set((s) => ({ sources: { ...s.sources, [id]: v } }))
    }),
    {
      name: 'anahad-settings',
      storage: createJSONStorage(() => localStorage),
      onRehydrateStorage: () => (state) => {
        if (state) applyTheme(state.theme)
      }
    }
  )
)

/** Apply theme once at boot before React rehydration completes. */
export function bootTheme() {
  applyTheme(useSettings.getState().theme)
}

export function useQuality(): QualityPreference {
  return useSettings((s) => s.quality)
}

export function isSourceEnabled(id: SourceId): boolean {
  const s = useSettings.getState()
  if (id === 'internet-archive') return s.sources['internet-archive']
  if (id === 'openverse') return s.sources.openverse
  // Embed-only sources are always "available" (they render official iframes).
  return true
}
