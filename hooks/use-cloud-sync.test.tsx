import { Blob as NodeBlob } from 'node:buffer'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { useCloudSync } from '@/hooks/use-cloud-sync'
import { loadCloudKey } from '@/lib/local-db'
import type { CloudManifest, CloudTransport } from '@/lib/cloud'
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
}

function fakeCloud(manifest: CloudManifest | null = null): CloudTransport {
  return {
    readManifest: vi.fn().mockResolvedValue(manifest),
    uploadAudio: vi.fn(),
    writeManifest: vi.fn().mockResolvedValue(undefined),
    downloadAudio: vi.fn().mockResolvedValue(
      new NodeBlob(['mp3'], { type: 'audio/mpeg' }) as unknown as Blob,
    ),
  }
}

afterEach(cleanup)

describe('useCloudSync', () => {
  it('creates and persists a cloud code on first use', async () => {
    const { result } = renderHook(() => useCloudSync(vi.fn(), fakeCloud()))

    await waitFor(() => expect(result.current.ready).toBe(true))
    expect(result.current.cloudKey).toMatch(/^[0-9a-f-]{36}$/)
    expect(await loadCloudKey()).toBe(result.current.cloudKey)
  })

  it('backs up the current local snapshot and reports completion', async () => {
    const cloud = fakeCloud()
    const { result } = renderHook(() => useCloudSync(vi.fn(), cloud))
    await waitFor(() => expect(result.current.ready).toBe(true))

    await act(() => result.current.backup([song]))

    expect(cloud.writeManifest).toHaveBeenCalledTimes(1)
    expect(result.current.feedback).toEqual(expect.objectContaining({ tone: 'ok' }))
    expect(result.current.feedback?.message).toMatch(/salvo na nuvem/i)
  })

  it('downloads the full cloud snapshot before replacing local data', async () => {
    const manifest: CloudManifest = {
      app: 'prime',
      version: 1,
      updatedAt: '2026-08-21T10:00:00.000Z',
      songs: [song],
      audio: {},
    }
    const replaceAll = vi.fn()
    const { result } = renderHook(() => useCloudSync(replaceAll, fakeCloud(manifest)))
    await waitFor(() => expect(result.current.ready).toBe(true))

    await act(() => result.current.restore())

    expect(replaceAll).toHaveBeenCalledWith([expect.objectContaining({ id: 'entrada' })])
    expect(result.current.feedback?.message).toMatch(/restaurado/i)
  })

  it('does not switch profiles when the pasted code is invalid', async () => {
    const { result } = renderHook(() => useCloudSync(vi.fn(), fakeCloud()))
    await waitFor(() => expect(result.current.ready).toBe(true))
    const original = result.current.cloudKey

    let changed = true
    await act(async () => {
      changed = await result.current.useCloudKey('../invasor')
    })

    expect(changed).toBe(false)
    expect(result.current.cloudKey).toBe(original)
    expect(result.current.feedback).toEqual(expect.objectContaining({ tone: 'error' }))
  })
})
