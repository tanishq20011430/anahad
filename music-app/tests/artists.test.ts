import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { baseTitle, continuationArtist, fetchArtistHits, hitsFromSongs, isCredited, resetArtistsCache, searchArtists } from '../src/lib/artists'
import { splitArtists } from '../src/lib/appleTracks'
import { usePlayer } from '../src/stores/player'
import { useSettings } from '../src/stores/settings'
import { makeTrack, makeYtTrack } from './helpers'

const song = (id: number, trackName: string, artistName: string) => ({
  trackId: id,
  trackName,
  artistName,
  collectionName: 'Aradhana (Original Motion Picture Soundtrack)',
  artworkUrl100: 'https://is1-ssl.mzstatic.com/image/thumb/x/100x100bb.jpg',
  releaseDate: '1969-01-01T08:00:00Z',
  trackTimeMillis: 240_000,
  primaryGenreName: 'Bollywood'
})

const kishoreSongs = [
  song(1, 'Pal Pal Dil Ke Paas', 'Kishore Kumar'),
  song(2, 'Yathe Yathe', 'G.V. Prakash Kumar'),
  song(3, 'Neele Neele Ambar Par (Male Version)', 'Kalyanji-Anandji & Kishore Kumar'),
  song(4, 'Pal Pal Dil Ke Paas (From "Blackmail")', 'Kishore Kumar'),
  song(5, 'Intaha Ho Gai Intezar Ki', 'Kishore Kumar & Asha Bhosle')
]

describe('artists — credit parsing', () => {
  it('splits credit lines into individual artists', () => {
    expect(splitArtists('Asha Bhosle, Kishore Kumar & R.D. Burman')).toEqual(['Asha Bhosle', 'Kishore Kumar', 'R.D. Burman'])
    expect(splitArtists('Zach Bryan feat. Lana Del Rey')).toEqual(['Zach Bryan', 'Lana Del Rey'])
    expect(splitArtists('Kishore Kumar - Topic')).toEqual(['Kishore Kumar'])
  })

  it('only counts exact artist credits', () => {
    expect(isCredited('Kishore Kumar', 'Kalyanji-Anandji & Kishore Kumar')).toBe(true)
    expect(isCredited('Kishore Kumar', 'G.V. Prakash Kumar')).toBe(false)
  })

  it('collapses re-releases to one base title', () => {
    expect(baseTitle('Pal Pal Dil Ke Paas (From "Blackmail")')).toBe(baseTitle('Pal Pal Dil Ke Paas'))
  })
})

describe('artists — top hits', () => {
  beforeEach(() => resetArtistsCache())
  afterEach(() => vi.unstubAllGlobals())

  it('keeps popularity order, drops other artists and duplicate versions', () => {
    const tracks = hitsFromSongs('Kishore Kumar', kishoreSongs)
    expect(tracks.map((t) => t.title)).toEqual(['Pal Pal Dil Ke Paas', 'Neele Neele Ambar Par (Male Version)', 'Intaha Ho Gai Intezar Ki'])
    expect(tracks[0].lookup?.query).toBe('Pal Pal Dil Ke Paas Kishore Kumar')
    expect(tracks[0].album).toBe('Aradhana')
    expect(tracks[0].durationSec).toBe(240)
  })

  it('fetches from iTunes with the artist term', async () => {
    const fetchMock = vi.fn(async (_url: string) => Response.json({ results: kishoreSongs }))
    vi.stubGlobal('fetch', fetchMock)
    const hits = await fetchArtistHits('kishore kumar')
    const url = String(fetchMock.mock.calls[0][0])
    expect(url).toContain('https://itunes.apple.com/search?')
    expect(url).toContain('attribute=artistTerm')
    expect(hits.name).toBe('Kishore Kumar')
    expect(hits.tracks).toHaveLength(3)
  })

  it('de-duplicates artist search results by name', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({
          results: [
            { artistId: 1, artistName: 'Kishore Kumar', primaryGenreName: 'Bollywood' },
            { artistId: 2, artistName: 'Kishore Kumar', primaryGenreName: 'Tamil' },
            { artistId: 3, artistName: 'Kishore Kumar & Lata Mangeshkar' }
          ]
        })
      )
    )
    const artists = await searchArtists('kishore')
    expect(artists.map((a) => a.id)).toEqual([1, 3])
  })

  it('picks the continuation artist from credits, never for radio', () => {
    expect(continuationArtist(makeYtTrack(1, { artist: 'Kishore Kumar & Asha Bhosle' }))).toBe('Kishore Kumar')
    expect(continuationArtist(makeTrack(1, { source: 'radio', artist: 'India' }))).toBeNull()
  })
})

describe('player — keeps playing the artist’s hits when the queue ends', () => {
  beforeEach(() => {
    resetArtistsCache()
    usePlayer.getState().reset()
    usePlayer.setState({ shuffledOrder: null, repeat: 'off', error: null })
    useSettings.setState({ artistAutoplay: true })
    usePlayer.getState().registerController({
      load: () => Promise.resolve(),
      play: async () => undefined,
      pause: () => undefined,
      seekTo: () => undefined,
      setVolume: () => undefined,
      setMuted: () => undefined,
      setSpeed: () => undefined
    })
  })
  afterEach(() => vi.unstubAllGlobals())

  it('appends new hits (skipping the song just played) and continues', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ results: kishoreSongs })))
    const seed = makeYtTrack(9, { title: 'Pal Pal Dil Ke Paas', artist: 'Kishore Kumar' })
    await usePlayer.getState().playTracks([seed], 0, null)
    await usePlayer.getState().next({ auto: true })
    const s = usePlayer.getState()
    expect(s.queue.map((t) => t.title)).toEqual(['Pal Pal Dil Ke Paas', 'Neele Neele Ambar Par (Male Version)', 'Intaha Ho Gai Intezar Ki'])
    expect(s.currentIndex).toBe(1)
    expect(s.contextLabel).toBe('Kishore Kumar · top hits')
  })

  it('stops as before when the setting is off', async () => {
    useSettings.setState({ artistAutoplay: false })
    const fetchMock = vi.fn(async () => Response.json({ results: kishoreSongs }))
    vi.stubGlobal('fetch', fetchMock)
    await usePlayer.getState().playTracks([makeYtTrack(9, { artist: 'Kishore Kumar' })], 0, null)
    await usePlayer.getState().next({ auto: true })
    expect(usePlayer.getState().queue).toHaveLength(1)
    expect(usePlayer.getState().isPlaying).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
