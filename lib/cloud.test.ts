import { Blob as NodeBlob } from 'node:buffer'
import { describe, expect, it } from 'vitest'

import {
  backupToCloud,
  cloudAudioPath,
  cloudKeyFromRequest,
  cloudPathBelongsToProfile,
  createCloudKey,
  restoreFromCloud,
  type CloudManifest,
  type CloudTransport,
} from '@/lib/cloud'
import type { Song } from '@/lib/types'

const CLOUD_KEY = '0f91fd6b-c6f5-4f39-a340-f6387bce8bc8'

const song: Song = {
  id: 'entrada',
  title: 'Entrada',
  artist: 'Artista',
  moment: 'Entrada',
  key: 'C',
  originalKey: 'C',
  bpm: 72,
  status: 'Pronta',
  entry: '',
  notes: '',
  structure: '',
  sections: [],
  previewStart: 0,
  audioName: 'entrada.mp3',
  audioBlob: new NodeBlob(['audio novo'], { type: 'audio/mpeg' }) as unknown as Blob,
}

function transport(overrides: Partial<CloudTransport> = {}): CloudTransport {
  return {
    readManifest: async () => null,
    uploadAudio: async (pathname, blob) => ({
      pathname,
      contentType: blob.type || 'audio/mpeg',
      size: blob.size,
    }),
    writeManifest: async () => undefined,
    downloadAudio: async () =>
      new NodeBlob(['audio restaurado'], { type: 'audio/mpeg' }) as unknown as Blob,
    ...overrides,
  }
}

describe('Vercel Blob cloud backup', () => {
  it('creates an unguessable profile key and rejects unsafe audio paths', () => {
    expect(createCloudKey()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    expect(cloudAudioPath(CLOUD_KEY, 'entrada')).toBe(
      `prime/${CLOUD_KEY}/audio/entrada.mp3`,
    )
    expect(() => cloudAudioPath(CLOUD_KEY, '../fora')).toThrow(/identificador/i)
    expect(cloudPathBelongsToProfile(`prime/${CLOUD_KEY}/audio/entrada.mp3`, CLOUD_KEY)).toBe(true)
    expect(cloudPathBelongsToProfile('prime/outro/audio/entrada.mp3', CLOUD_KEY)).toBe(false)
  })

  it('accepts the profile capability only from a valid Bearer header', () => {
    expect(cloudKeyFromRequest(new Request('https://prime.test', {
      headers: { Authorization: `Bearer ${CLOUD_KEY}` },
    }))).toBe(CLOUD_KEY)
    expect(cloudKeyFromRequest(new Request('https://prime.test', {
      headers: { Authorization: 'Bearer ../outro' },
    }))).toBeNull()
    expect(cloudKeyFromRequest(new Request('https://prime.test'))).toBeNull()
  })

  it('uploads changed audio and writes metadata without Blob or object URL', async () => {
    const written: CloudManifest[] = []
    const result = await backupToCloud([song], CLOUD_KEY, transport({
      writeManifest: async (manifest) => {
        written.push(manifest)
      },
    }))

    expect(result).toEqual({ uploadedAudio: 1, reusedAudio: 0, songs: 1 })
    expect(written[0].songs[0]).toEqual(
      expect.objectContaining({ id: 'entrada', title: 'Entrada', audioName: 'entrada.mp3' }),
    )
    expect(written[0].songs[0]).not.toHaveProperty('audioBlob')
    expect(written[0].songs[0]).not.toHaveProperty('audioUrl')
    expect(written[0].audio.entrada).toEqual(
      expect.objectContaining({
        pathname: `prime/${CLOUD_KEY}/audio/entrada.mp3`,
        contentType: 'audio/mpeg',
        size: 10,
      }),
    )
  })

  it('reuses an unchanged cloud MP3 instead of uploading it again', async () => {
    const firstTransport = transport()
    let firstManifest: CloudManifest | null = null
    firstTransport.writeManifest = async (manifest) => {
      firstManifest = manifest
    }
    await backupToCloud([song], CLOUD_KEY, firstTransport)

    let uploads = 0
    const result = await backupToCloud(
      [song],
      CLOUD_KEY,
      transport({
        readManifest: async () => firstManifest,
        uploadAudio: async () => {
          uploads += 1
          throw new Error('não deveria reenviar')
        },
      }),
    )

    expect(result).toEqual({ uploadedAudio: 0, reusedAudio: 1, songs: 1 })
    expect(uploads).toBe(0)
  })

  it('restores metadata and downloads every MP3 before returning the local snapshot', async () => {
    let manifest: CloudManifest | null = null
    const cloud = transport({
      writeManifest: async (next) => {
        manifest = next
      },
    })
    await backupToCloud([song], CLOUD_KEY, cloud)

    const restored = await restoreFromCloud(
      CLOUD_KEY,
      transport({ readManifest: async () => manifest }),
    )

    expect(restored).toHaveLength(1)
    expect(restored[0]).toEqual(expect.objectContaining({ id: 'entrada', title: 'Entrada' }))
    expect(await restored[0].audioBlob?.text()).toBe('audio restaurado')
    expect(restored[0].audioUrl).toMatch(/^blob:/)
  })

  it('does not replace local data when no cloud backup exists', async () => {
    await expect(restoreFromCloud(CLOUD_KEY, transport())).rejects.toThrow(/nenhum backup/i)
  })
})
