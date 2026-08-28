import { cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { useAudioPrefetch } from '@/hooks/use-audio-prefetch'
import { isAudioReady, resetAudioEngine } from '@/lib/audio-engine'
import type { Song } from '@/lib/types'

const decodeAudioData = vi.fn(async () => ({ duration: 180 }) as AudioBuffer)

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

class AudioContextFake {
  state: AudioContextState = 'running'
  currentTime = 0
  destination = {} as AudioDestinationNode
  decodeAudioData = decodeAudioData
  resume = vi.fn(async () => undefined)
  createBufferSource = vi.fn()
  createGain = vi.fn()
}

function song(id: string): Song {
  return {
    id,
    title: id,
    artist: '',
    moment: '',
    key: 'C',
    originalKey: 'C',
    status: 'Pronta',
    entry: '',
    notes: '',
    structure: '',
    sections: [],
    audioBlob: {
      arrayBuffer: vi.fn(async () => new Uint8Array([id.length]).buffer),
    } as unknown as Blob,
    previewStart: 0,
  }
}

const songs = [song('entrada'), song('assinatura'), song('saída')]

beforeAll(() => {
  vi.stubGlobal('AudioContext', AudioContextFake)
})

afterEach(() => {
  cleanup()
  resetAudioEngine()
  vi.clearAllMocks()
})

afterAll(() => {
  vi.unstubAllGlobals()
})

describe('useAudioPrefetch', () => {
  it('prepares only the current and next songs', async () => {
    renderHook(() => useAudioPrefetch(songs, 0, true))

    await waitFor(() => {
      expect(isAudioReady('entrada')).toBe(true)
      expect(isAudioReady('assinatura')).toBe(true)
    })
    expect(isAudioReady('saída')).toBe(false)
    expect(decodeAudioData).toHaveBeenCalledTimes(2)
  })

  it('releases the song outside the two-track window when navigating', async () => {
    const { rerender } = renderHook(
      ({ index }) => useAudioPrefetch(songs, index, true),
      { initialProps: { index: 0 } },
    )
    await waitFor(() => expect(isAudioReady('assinatura')).toBe(true))

    rerender({ index: 1 })

    await waitFor(() => expect(isAudioReady('saída')).toBe(true))
    expect(isAudioReady('entrada')).toBe(false)
    expect(isAudioReady('assinatura')).toBe(true)
  })

  it('releases prefetched tracks after leaving the stage', async () => {
    const { rerender } = renderHook(
      ({ enabled }) => useAudioPrefetch(songs, 0, enabled),
      { initialProps: { enabled: true } },
    )
    await waitFor(() => expect(isAudioReady('entrada')).toBe(true))

    rerender({ enabled: false })

    expect(isAudioReady('entrada')).toBe(false)
    expect(isAudioReady('assinatura')).toBe(false)
  })

  it('does not publish a pending prefetch after leaving the stage', async () => {
    const pending = deferred<AudioBuffer>()
    decodeAudioData.mockImplementationOnce(() => pending.promise)
    const { rerender } = renderHook(
      ({ enabled }) => useAudioPrefetch(songs, 0, enabled),
      { initialProps: { enabled: true } },
    )
    await waitFor(() => expect(decodeAudioData).toHaveBeenCalledTimes(1))

    rerender({ enabled: false })
    pending.resolve({ duration: 180 } as AudioBuffer)
    await pending.promise
    await Promise.resolve()
    await Promise.resolve()

    expect(isAudioReady('entrada')).toBe(false)
  })

  it('invalidates a pending decode when the prefetch hook unmounts', async () => {
    const pending = deferred<AudioBuffer>()
    decodeAudioData.mockImplementationOnce(() => pending.promise)
    const { unmount } = renderHook(() => useAudioPrefetch(songs, 0, true))
    await waitFor(() => expect(decodeAudioData).toHaveBeenCalledTimes(1))

    unmount()
    pending.resolve({ duration: 180 } as AudioBuffer)
    await pending.promise
    await Promise.resolve()
    await Promise.resolve()

    expect(isAudioReady('entrada')).toBe(false)
  })
})
