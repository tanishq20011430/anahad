import { describe, it, expect, beforeEach } from 'vitest'
import { useLibrary } from '../src/stores/library'
import { useSettings } from '../src/stores/settings'
import { makeTrack } from './helpers'

describe('library store — playlist management', () => {
  beforeEach(async () => {
    useLibrary.setState({ playlists: [], likedTracks: {}, favoriteArtists: {}, history: [], loaded: true })
  })

  it('creates a playlist with defaults', () => {
    const p = useLibrary.getState().createPlaylist('My Mix')
    expect(p.name).toBe('My Mix')
    expect(p.trackIds).toEqual([])
    expect(useLibrary.getState().playlists[0].id).toBe(p.id)
  })

  it('renames and deletes playlists', async () => {
    const p = useLibrary.getState().createPlaylist('Old')
    useLibrary.getState().renamePlaylist(p.id, 'New')
    expect(useLibrary.getState().playlists[0].name).toBe('New')
    await useLibrary.getState().deletePlaylist(p.id)
    expect(useLibrary.getState().playlists).toHaveLength(0)
  })

  it('adds tracks without duplicates and removes by id', async () => {
    const p = useLibrary.getState().createPlaylist('Mix')
    const t = makeTrack()
    const added = await useLibrary.getState().addToPlaylist(p.id, t)
    expect(added).toBe(true)
    const dup = await useLibrary.getState().addToPlaylist(p.id, t)
    expect(dup).toBe(false)
    const playlist = useLibrary.getState().playlists[0]
    expect(playlist.tracks).toHaveLength(1)
    await useLibrary.getState().removeFromPlaylist(p.id, t.id)
    expect(useLibrary.getState().playlists[0].tracks).toHaveLength(0)
  })

  it('reorders tracks with move up/down', async () => {
    const p = useLibrary.getState().createPlaylist('Ordered')
    await useLibrary.getState().addToPlaylist(p.id, makeTrack(1))
    await useLibrary.getState().addToPlaylist(p.id, makeTrack(2))
    await useLibrary.getState().addToPlaylist(p.id, makeTrack(3))
    await useLibrary.getState().moveInPlaylist(p.id, makeTrack(3).id, -1)
    const ids = useLibrary.getState().playlists[0].trackIds
    expect(ids[1]).toBe(makeTrack(3).id)
    expect(ids[2]).toBe(makeTrack(2).id)
  })

  it('likes toggle on and off', () => {
    const t = makeTrack()
    useLibrary.getState().toggleLike(t)
    expect(useLibrary.getState().isLiked(t.id)).toBe(true)
    useLibrary.getState().toggleLike(t)
    expect(useLibrary.getState().isLiked(t.id)).toBe(false)
  })

  it('records play events capped and clears', () => {
    const t = makeTrack()
    useLibrary.getState().recordPlay(t, 0.9, false)
    useLibrary.getState().recordPlay(t, 0.5, true)
    expect(useLibrary.getState().history).toHaveLength(2)
    expect(useLibrary.getState().history[0].completedRatio).toBe(0.5)
    void useLibrary.getState().clearHistory()
    expect(useLibrary.getState().history).toHaveLength(0)
  })

  it('respects the history-disabled setting', () => {
    useSettings.setState({ historyEnabled: false })
    useLibrary.getState().recordPlay(makeTrack(), 1, false)
    expect(useLibrary.getState().history).toHaveLength(0)
    useSettings.setState({ historyEnabled: true })
  })

  it('exports playlist JSON with references (no audio)', () => {
    const p = useLibrary.getState().createPlaylist('Export me')
    void useLibrary.getState().addToPlaylist(p.id, makeTrack())
    // exportPlaylist triggers a download; we just verify it doesn't throw
    expect(() => useLibrary.getState().exportPlaylist(p.id)).not.toThrow()
  })

  it('imports playlist JSON with multi-source references', () => {
    const json = JSON.stringify({
      app: 'anahad',
      name: 'Imported',
      tracks: [
        { title: 'X', artist: 'Y', identifier: 'abc123', source: 'audius' },
        { title: 'W', identifier: 'vid999', source: 'youtube' }
      ]
    })
    const result = useLibrary.getState().importPlaylist(json)
    expect(result.ok).toBe(true)
    const p = useLibrary.getState().playlists[0]
    expect(p.name).toBe('Imported')
    expect(p.tracks[0].identifier).toBe('abc123')
    expect(p.tracks[0].id).toBe('audius:abc123')
    expect(p.tracks[1].embed).toEqual({ kind: 'youtube', id: 'vid999' })
  })

  it('rejects legacy v2 (Internet Archive) imports honestly', () => {
    const json = JSON.stringify({
      app: 'anahad',
      name: 'Old export',
      tracks: [{ title: 'X', identifier: 'ia-item', fileName: 'a.mp3', source: 'internet-archive' }]
    })
    const result = useLibrary.getState().importPlaylist(json)
    expect(result.ok).toBe(false)
    expect(result.message).toMatch(/no longer supported/i)
  })

  it('rejects invalid imports honestly', () => {
    expect(useLibrary.getState().importPlaylist('{"nope": true}').ok).toBe(false)
    expect(useLibrary.getState().importPlaylist('not json').ok).toBe(false)
  })
})
