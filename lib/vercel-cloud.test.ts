import { Blob as NodeBlob } from 'node:buffer'
import { describe, expect, it, vi } from 'vitest'

import { cloudAudioPath, type CloudManifest } from '@/lib/cloud'
import { createVercelCloudTransport } from '@/lib/vercel-cloud'

const CLOUD_KEY = '0f91fd6b-c6f5-4f39-a340-f6387bce8bc8'
const PATHNAME = cloudAudioPath(CLOUD_KEY, 'entrada')

const manifest: CloudManifest = {
  app: 'prime',
  version: 1,
  updatedAt: '2026-08-21T10:00:00.000Z',
  songs: [],
  audio: {},
}

describe('browser transport for Vercel Blob', () => {
  it('treats a missing manifest as the first cloud backup', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 404 }))
    const cloud = createVercelCloudTransport({ fetcher, uploader: vi.fn() })

    expect(await cloud.readManifest(CLOUD_KEY)).toBeNull()
  })

  it('sends private MP3 directly to Blob with the profile capability', async () => {
    const uploader = vi.fn().mockResolvedValue({
      pathname: PATHNAME,
      contentType: 'audio/mpeg',
      size: 5_000_000,
      url: 'https://private.example/audio',
      downloadUrl: 'https://private.example/audio?download=1',
      contentDisposition: 'inline',
    })
    const cloud = createVercelCloudTransport({ fetcher: vi.fn(), uploader })
    const audio = new NodeBlob([new Uint8Array(5_000_000)], {
      type: 'audio/mpeg',
    }) as unknown as Blob

    const result = await cloud.uploadAudio(PATHNAME, audio, CLOUD_KEY)

    expect(result).toEqual({ pathname: PATHNAME, contentType: 'audio/mpeg', size: 5_000_000 })
    expect(uploader).toHaveBeenCalledWith(
      PATHNAME,
      audio,
      expect.objectContaining({
        access: 'private',
        handleUploadUrl: '/api/cloud/upload',
        headers: { Authorization: `Bearer ${CLOUD_KEY}` },
        multipart: true,
      }),
    )
  })

  it('writes and downloads through authenticated same-origin routes', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response('mp3', {
        status: 200,
        headers: { 'content-type': 'audio/mpeg' },
      }))
    const cloud = createVercelCloudTransport({ fetcher, uploader: vi.fn() })

    await cloud.writeManifest(manifest, CLOUD_KEY)
    const downloaded = await cloud.downloadAudio({
      pathname: PATHNAME,
      fingerprint: 'hash',
      contentType: 'audio/mpeg',
      size: 3,
    }, CLOUD_KEY)

    expect(fetcher).toHaveBeenNthCalledWith(1, '/api/cloud/manifest', expect.objectContaining({
      method: 'PUT',
      headers: expect.objectContaining({ Authorization: `Bearer ${CLOUD_KEY}` }),
    }))
    expect(fetcher).toHaveBeenNthCalledWith(2, '/api/cloud/audio', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ pathname: PATHNAME }),
    }))
    expect(await downloaded.text()).toBe('mp3')
  })

  it('surfaces a useful setup error when Blob is not connected', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ error: 'Vercel Blob ainda não está conectado.' }),
      { status: 503, headers: { 'content-type': 'application/json' } },
    ))
    const cloud = createVercelCloudTransport({ fetcher, uploader: vi.fn() })

    await expect(cloud.readManifest(CLOUD_KEY)).rejects.toThrow(/ainda não está conectado/i)
  })
})
