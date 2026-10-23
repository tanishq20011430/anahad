/**
 * Personal library — playlists, likes, saved albums, favorite artists,
 * listening history. Persisted to IndexedDB; never leaves the browser.
 * Storage layout: one aggregate document per concern (small and simple).
 */

import { create } from 'zustand'
import type { PlayEvent, Playlist, SourceId, Track } from '../types'
import { idbDelete, idbGet, idbPut, wipeLocalData } from '../lib/db'
import { useSettings } from './settings'

const HISTORY_CAP = 500

export interface FavoriteArtist {
  name: string
  artwork: string | null
}

export interface LibraryState {
  loaded: boolean
  playlists: Playlist[]
  likedTracks: Record<string, Track>
  favoriteArtists: Record<string, FavoriteArtist>
  history: PlayEvent[]

  init: () => Promise<void>

  createPlaylist: (name: string) => Playlist
  renamePlaylist: (id: string, name: string) => void
  deletePlaylist: (id: string) => Promise<void>
  addToPlaylist: (playlistId: string, track: Track) => Promise<boolean>
  removeFromPlaylist: (playlistId: string, trackId: string) => Promise<void>
  moveInPlaylist: (playlistId: string, trackId: string, direction: -1 | 1) => Promise<void>

  toggleLike: (track: Track) => void
  isLiked: (trackId: string) => boolean
  toggleFavoriteArtist: (name: string, artwork?: string | null) => void
  isArtistFavorite: (name: string) => boolean

  recordPlay: (track: Track, completedRatio: number, skipped: boolean) => void
  clearHistory: () => Promise<void>
  clearAllData: () => Promise<void>

  exportPlaylist: (id: string) => void
  importPlaylist: (json: string) => { ok: boolean; message: string }
}

function uid(): string {
  return `pl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

async function persistPlaylist(p: Playlist) {
  await idbPut('playlists', p).catch(() => undefined)
}

export const useLibrary = create<LibraryState>((set, get) => ({
  loaded: false,
  playlists: [],
  likedTracks: {},
  favoriteArtists: {},
  history: [],

  init: async () => {
    if (get().loaded) return
    try {
      const [playlists, likes, artists, history] = await Promise.all([
        idbGetAllPlaylists(),
        idbGet<Record<string, Track>>('kv', 'likes-all'),
        idbGet<Record<string, FavoriteArtist>>('kv', 'artists-all'),
        idbGet<PlayEvent[]>('kv', 'history')
      ])
      set({
        loaded: true,
        playlists,
        likedTracks: likes ?? {},
        favoriteArtists: artists ?? {},
        history: history ?? []
      })
    } catch {
      // Storage blocked (e.g. private mode) — degrade to in-memory only.
      set({ loaded: true })
    }
  },

  createPlaylist: (name) => {
    const p: Playlist = {
      id: uid(),
      name: name.trim() || 'New playlist',
      trackIds: [],
      tracks: [],
      createdAt: Date.now(),
      updatedAt: Date.now()
    }
    set((s) => ({ playlists: [p, ...s.playlists] }))
    void persistPlaylist(p)
    return p
  },

  renamePlaylist: (id, name) => {
    set((s) => {
      const playlists = s.playlists.map((p) => (p.id === id ? { ...p, name: name.trim() || p.name, updatedAt: Date.now() } : p))
      const changed = playlists.find((p) => p.id === id)
      if (changed) void persistPlaylist(changed)
      return { playlists }
    })
  },

  deletePlaylist: async (id) => {
    set((s) => ({ playlists: s.playlists.filter((p) => p.id !== id) }))
    await idbDelete('playlists', id).catch(() => undefined)
  },

  addToPlaylist: async (playlistId, track) => {
    let added = false
    set((s) => {
      const playlists = s.playlists.map((p) => {
        if (p.id !== playlistId) return p
        if (p.trackIds.includes(track.id)) return p
        added = true
        const updated = { ...p, trackIds: [...p.trackIds, track.id], tracks: [...p.tracks, track], updatedAt: Date.now() }
        void persistPlaylist(updated)
        return updated
      })
      return { playlists }
    })
    return added
  },

  removeFromPlaylist: async (playlistId, trackId) => {
    set((s) => {
      const playlists = s.playlists.map((p) => {
        if (p.id !== playlistId) return p
        if (!p.trackIds.includes(trackId)) return p
        const updated = {
          ...p,
          trackIds: p.trackIds.filter((t) => t !== trackId),
          tracks: p.tracks.filter((t) => t.id !== trackId),
          updatedAt: Date.now()
        }
        void persistPlaylist(updated)
        return updated
      })
      return { playlists }
    })
  },

  moveInPlaylist: async (playlistId, trackId, direction) => {
    set((s) => {
      const playlists = s.playlists.map((p) => {
        if (p.id !== playlistId) return p
        const idx = p.trackIds.indexOf(trackId)
        const target = idx + direction
        if (idx === -1 || target < 0 || target >= p.trackIds.length) return p
        const ids = [...p.trackIds]
        const trs = [...p.tracks]
        ;[ids[idx], ids[target]] = [ids[target], ids[idx]]
        ;[trs[idx], trs[target]] = [trs[target], trs[idx]]
        const updated = { ...p, trackIds: ids, tracks: trs, updatedAt: Date.now() }
        void persistPlaylist(updated)
        return updated
      })
      return { playlists }
    })
  },

  toggleLike: (track) => {
    set((s) => {
      const likedTracks = { ...s.likedTracks }
      if (likedTracks[track.id]) delete likedTracks[track.id]
      else likedTracks[track.id] = track
      void idbPut('kv', likedTracks, 'likes-all').catch(() => undefined)
      return { likedTracks }
    })
  },

  isLiked: (trackId) => Boolean(get().likedTracks[trackId]),

  toggleFavoriteArtist: (name, artwork) => {
    set((s) => {
      const favoriteArtists = { ...s.favoriteArtists }
      if (favoriteArtists[name]) delete favoriteArtists[name]
      else favoriteArtists[name] = { name, artwork: artwork ?? null }
      void idbPut('kv', favoriteArtists, 'artists-all').catch(() => undefined)
      return { favoriteArtists }
    })
  },

  isArtistFavorite: (name) => Boolean(get().favoriteArtists[name]),

  recordPlay: (track, completedRatio, skipped) => {
    if (!useSettings.getState().historyEnabled) return
    const ev: PlayEvent = {
      trackId: track.id,
      track,
      playedAt: Date.now(),
      completedRatio: Math.max(0, Math.min(1, completedRatio)),
      skipped
    }
    set((s) => {
      const history = [ev, ...s.history].slice(0, HISTORY_CAP)
      void idbPut('kv', history, 'history').catch(() => undefined)
      return { history }
    })
  },

  clearHistory: async () => {
    set({ history: [] })
    await idbPut('kv', [], 'history').catch(() => undefined)
  },

  clearAllData: async () => {
    await wipeLocalData()
    set({ playlists: [], likedTracks: {}, favoriteArtists: {}, history: [] })
  },

  exportPlaylist: (id) => {
    const p = get().playlists.find((x) => x.id === id)
    if (!p) return
    const payload = {
      app: 'anahad',
      type: 'playlist',
      version: 1,
      name: p.name,
      exportedAt: new Date().toISOString(),
      tracks: p.tracks.map((t) => ({
        title: t.title,
        artist: t.artist,
        album: t.album,
        identifier: t.identifier,
        fileName: t.fileName,
        source: t.source,
        itemPage: t.itemPage,
        licenseUrl: t.licenseUrl
      }))
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${p.name.replace(/[^\w- ]+/g, '').trim() || 'playlist'}.json`
    a.click()
    URL.revokeObjectURL(url)
  },

  importPlaylist: (json) => {
    try {
      const data = JSON.parse(json) as { app?: string; name?: string; tracks?: unknown[] }
      if (!data || !Array.isArray(data.tracks)) return { ok: false, message: 'Not a valid playlist file' }
      const p: Playlist = {
        id: uid(),
        name: (data.name ?? 'Imported playlist').slice(0, 80),
        trackIds: [],
        tracks: [],
        createdAt: Date.now(),
        updatedAt: Date.now()
      }
      let imported = 0
      const KNOWN_SOURCES: SourceId[] = ['youtube', 'audius', 'radio', 'openverse', 'mixcloud']
      for (const raw of data.tracks) {
        const t = raw as Partial<Track>
        const source = KNOWN_SOURCES.includes(t?.source as SourceId) ? (t!.source as SourceId) : null
        if (t && t.identifier && t.title && source) {
          // Imported entries carry references only — playable formats are
          // re-resolved from the source when the track is played.
          const track: Track = {
            id: `${source}:${t.identifier}`,
            source,
            identifier: t.identifier,
            fileName: t.fileName ?? '',
            title: t.title,
            artist: t.artist ?? 'Unknown artist',
            album: t.album ?? '',
            artwork: t.artwork ?? null,
            durationSec: t.durationSec ?? null,
            formats: [],
            embed: source === 'youtube' ? { kind: 'youtube', id: t.identifier } : source === 'mixcloud' ? { kind: 'mixcloud', id: t.identifier } : null,
            licenseUrl: t.licenseUrl ?? null,
            language: t.language ?? null,
            genres: t.genres ?? [],
            estimatedMoods: [],
            year: t.year ?? null,
            itemPage: t.itemPage ?? '',
            collection: t.collection ?? null
          }
          p.trackIds.push(track.id)
          p.tracks.push(track)
          imported++
        }
      }
      if (imported === 0)
        return { ok: false, message: 'No importable tracks found — exports from app v2 (Internet Archive) are no longer supported' }
      set((s) => ({ playlists: [p, ...s.playlists] }))
      void persistPlaylist(p)
      return { ok: true, message: `Imported ${imported} track${imported === 1 ? '' : 's'} into “${p.name}”` }
    } catch {
      return { ok: false, message: 'Could not read that file' }
    }
  }
}))

async function idbGetAllPlaylists(): Promise<Playlist[]> {
  const { idbGetAll } = await import('../lib/db')
  return idbGetAll<Playlist>('playlists')
}
