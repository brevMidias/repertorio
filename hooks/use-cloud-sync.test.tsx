import { Blob as NodeBlob } from 'node:buffer'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { useCloudSync } from '@/hooks/use-cloud-sync'
import type { CloudManifest, CloudTransport } from '@/lib/cloud'
import type { Song } from '@/lib/types'

const SHARED_CLOUD_KEY = '76e36c69-6dda-4c84-b3af-6870c0f5c9a9'

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
}

function manifest(songs: Song[]): CloudManifest {
  return {
    app: 'prime',
    version: 1,
    updatedAt: '2026-08-24T10:00:00.000Z',
    songs,
    audio: {},
  }
}

function fakeCloud(initial: CloudManifest | null = null): CloudTransport & {
  current: CloudManifest | null
} {
  const cloud = {
    current: initial,
    readManifest: vi.fn(async () => cloud.current),
    uploadAudio: vi.fn(async (pathname: string, blob: Blob) => ({
      pathname,
      contentType: blob.type || 'audio/mpeg',
      size: blob.size,
    })),
    writeManifest: vi.fn(async (next: CloudManifest) => {
      cloud.current = next
    }),
    downloadAudio: vi.fn(async () =>
      new NodeBlob(['mp3'], { type: 'audio/mpeg' }) as unknown as Blob),
  }
  return cloud
}

afterEach(cleanup)

describe('useCloudSync automatic shared repertoire', () => {
  it('loads the same Vercel repertoire automatically on a fresh browser', async () => {
    const cloud = fakeCloud(manifest([{ ...song, title: 'Da Vercel' }]))
    const replaceAll = vi.fn()

    const { result } = renderHook(() =>
      useCloudSync([], true, replaceAll, cloud, 5),
    )

    await waitFor(() => expect(result.current.ready).toBe(true))
    expect(replaceAll).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'entrada', title: 'Da Vercel' }),
    ])
    expect(cloud.readManifest).toHaveBeenCalledWith(SHARED_CLOUD_KEY)
  })

  it('initializes a missing shared repertoire without reviving example songs', async () => {
    const cloud = fakeCloud()
    const replaceAll = vi.fn()

    const { result } = renderHook(() =>
      useCloudSync([], true, replaceAll, cloud, 5),
    )

    await waitFor(() => expect(result.current.ready).toBe(true))
    expect(replaceAll).toHaveBeenCalledWith([])
    expect(cloud.current?.songs).toEqual([])
  })

  it('automatically saves edits and deletions after cloud hydration', async () => {
    const cloud = fakeCloud(manifest([song]))
    const replaceAll = vi.fn()
    const { result, rerender } = renderHook(
      ({ songs }) => useCloudSync(songs, true, replaceAll, cloud, 5),
      { initialProps: { songs: [song] } },
    )

    await waitFor(() => expect(result.current.ready).toBe(true))
    vi.mocked(cloud.writeManifest).mockClear()

    rerender({ songs: [{ ...song, title: 'Editada' }] })
    await waitFor(() => expect(cloud.current?.songs[0]?.title).toBe('Editada'))

    rerender({ songs: [] })
    await waitFor(() => expect(cloud.current?.songs).toEqual([]))
    expect(cloud.writeManifest).toHaveBeenCalledTimes(2)
  })

  it('automatically uploads an attached MP3', async () => {
    const cloud = fakeCloud(manifest([]))
    const replaceAll = vi.fn()
    const { result, rerender } = renderHook(
      ({ songs }) => useCloudSync(songs, true, replaceAll, cloud, 5),
      { initialProps: { songs: [] as Song[] } },
    )
    await waitFor(() => expect(result.current.ready).toBe(true))
    vi.mocked(cloud.uploadAudio).mockClear()

    const audio = new NodeBlob(['audio novo'], { type: 'audio/mpeg' }) as unknown as Blob
    rerender({ songs: [{ ...song, audioName: 'entrada.mp3', audioBlob: audio }] })

    await waitFor(() => expect(cloud.uploadAudio).toHaveBeenCalledTimes(1))
    expect(cloud.current?.audio.entrada).toEqual(expect.objectContaining({
      pathname: `prime/${SHARED_CLOUD_KEY}/audio/entrada.mp3`,
    }))
  })

  it('keeps manual synchronization available as an explicit retry', async () => {
    const cloud = fakeCloud(manifest([]))
    const replaceAll = vi.fn()
    const { result } = renderHook(() =>
      useCloudSync([song], true, replaceAll, cloud, 5),
    )
    await waitFor(() => expect(result.current.ready).toBe(true))
    vi.mocked(cloud.writeManifest).mockClear()

    await act(() => result.current.backup([song]))

    expect(cloud.writeManifest).toHaveBeenCalledTimes(1)
    expect(result.current.feedback?.message).toMatch(/salvo na nuvem/i)
  })
})
