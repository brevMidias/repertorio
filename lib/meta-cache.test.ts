import { beforeEach, describe, expect, it } from 'vitest'

import { toMetadata } from '@/lib/audio'
import { META_CACHE_KEY } from '@/lib/config'
import { readMetaCache, writeMetaCache } from '@/lib/meta-cache'
import type { Song, SongMetadata } from '@/lib/types'

const song: Song = {
  id: 'song-1',
  title: 'Entrada',
  artist: 'Artista',
  moment: 'Cerimônia',
  key: 'C',
  originalKey: 'C',
  bpm: 72,
  status: 'Pronta',
  entry: '',
  notes: '',
  structure: 'INTRO',
  sections: [],
  audioName: 'entrada.mp3',
  audioBlob: new Blob(['mp3 bytes'], { type: 'audio/mpeg' }),
  audioUrl: 'blob:entrada',
  previewStart: 0,
}

beforeEach(() => {
  localStorage.clear()
})

describe('metadata cache', () => {
  it('writes only metadata to localStorage', () => {
    writeMetaCache([toMetadata(song)])

    const raw = localStorage.getItem(META_CACHE_KEY) ?? ''
    expect(raw).toContain('Entrada')
    expect(raw).not.toContain('blob:')
    expect(raw).not.toContain('mp3 bytes')
  })

  it('normalizes input and strips session-only fields before writing', () => {
    const unsafeSong = {
      ...song,
      bpm: -10,
      previewStart: -4,
    } as unknown as SongMetadata

    writeMetaCache([unsafeSong])

    expect(readMetaCache()).toEqual([
      expect.objectContaining({
        id: 'song-1',
        title: 'Entrada',
        bpm: 72,
        previewStart: 0,
      }),
    ])
    const raw = localStorage.getItem(META_CACHE_KEY) ?? ''
    expect(raw).not.toContain('audioBlob')
    expect(raw).not.toContain('audioUrl')
    expect(raw).not.toContain('blob:entrada')
  })

  it('keeps an empty repertoire distinct from a missing cache', () => {
    writeMetaCache([])

    expect(localStorage.getItem(META_CACHE_KEY)).toBe('[]')
    expect(readMetaCache()).toEqual([])
  })
})
