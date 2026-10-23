import { describe, it, expect, vi, afterEach } from 'vitest'
import { normalizeMixcloudShow, mixcloudProvider } from '../src/lib/providers/mixcloudProvider'

describe('mixcloudProvider — widget-transport honesty', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('maps a show to an embed track with no direct formats', () => {
    const t = normalizeMixcloudShow({
      key: '/TorranceSai/in-harmony-with-sai-02-sat-bhajans/',
      url: 'https://www.mixcloud.com/TorranceSai/in-harmony-with-sai-02-sat-bhajans/',
      name: 'In harmony with Sai - 02. Sat Bhajans',
      user: { username: 'TorranceSai', name: 'Torrance Sai' },
      tags: [{ key: '/genres/saibhajans/', name: 'SaiBhajans' }],
      pictures: { medium_mobile: 'https://thumbnailer.mixcloud.com/x' }
    })
    expect(t).not.toBeNull()
    expect(t!.source).toBe('mixcloud')
    expect(t!.embed).toEqual({ kind: 'mixcloud', id: '/TorranceSai/in-harmony-with-sai-02-sat-bhajans/' })
    expect(t!.formats).toEqual([]) // widget transport — never a direct stream
    expect(t!.genres).toContain('SaiBhajans')
    expect(t!.durationSec).toBeNull() // search payload has no duration — never guessed
  })

  it('rejects malformed keys', () => {
    expect(normalizeMixcloudShow({ key: 'not-a-key', name: 'X' })).toBeNull()
    expect(normalizeMixcloudShow({ key: '/user/', name: 'X' })).toBeNull()
  })

  it('enriches duration from the detail endpoint when resolving', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({
          key: '/user/show/',
          name: 'A Show',
          user: { username: 'user' },
          audio_length: 3723
        })
      )
    )
    const base = {
      id: 'mixcloud:/user/show/',
      source: 'mixcloud' as const,
      identifier: '/user/show/',
      fileName: '',
      title: '',
      artist: '',
      album: '',
      artwork: null,
      durationSec: null,
      formats: [],
      embed: { kind: 'mixcloud' as const, id: '/user/show/' },
      licenseUrl: null,
      language: null,
      genres: [],
      estimatedMoods: [],
      year: null,
      itemPage: '',
      collection: null
    }
    const resolved = await mixcloudProvider.resolveTrack!(base)
    expect(resolved.durationSec).toBe(3723) // real audio_length, not a guess
    vi.unstubAllGlobals()
  })

  it('declares widget playback + no direct audio', () => {
    expect(mixcloudProvider.capabilities.embeddedPlayback).toBe(true)
    expect(mixcloudProvider.capabilities.directAudio).toBe(false)
  })
})
