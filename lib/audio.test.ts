import { describe, expect, it, vi } from 'vitest'
import { revokeAudioUrls, toMetadata, withAudio } from '@/lib/audio'
import type { Song } from '@/lib/types'

const song: Song = {
  id: 'entrada', title: 'Entrada', artist: '', moment: '', key: 'C', originalKey: 'C',
  status: 'Nova', entry: '', notes: '', structure: '', sections: [],
  previewStart: 12, audioName: 'entrada.mp3', audioUrl: 'blob:old',
  audioBlob: new Blob(['mp3'], { type: 'audio/mpeg' }),
}

describe('audio serialization', () => {
  it('keeps Blob and object URL out of persisted metadata', () => {
    const metadata = toMetadata(song)
    expect(metadata).not.toHaveProperty('audioBlob')
    expect(metadata).not.toHaveProperty('audioUrl')
  })

  it('rebuilds and revokes a session URL around a persisted Blob', () => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:new')
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
    const restored = withAudio(toMetadata(song), song.audioBlob)
    expect(restored.audioUrl).toBe('blob:new')
    revokeAudioUrls([restored])
    expect(revoke).toHaveBeenCalledWith('blob:new')
  })
})
