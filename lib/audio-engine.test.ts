import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  activeTrackId,
  isAudioReady,
  playTrack,
  prepareTrack,
  releaseTrack,
  releaseTracksExcept,
  resetAudioEngine,
  stopTrack,
} from '@/lib/audio-engine'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

function audioBlob(byte = 1): Blob {
  return {
    arrayBuffer: vi.fn(async () => new Uint8Array([byte]).buffer),
  } as unknown as Blob
}

function createWebAudioFake() {
  const contexts: AudioContextFake[] = []
  const sources: Array<{
    buffer: AudioBuffer | null
    connect: ReturnType<typeof vi.fn>
    disconnect: ReturnType<typeof vi.fn>
    start: ReturnType<typeof vi.fn>
    stop: ReturnType<typeof vi.fn>
    onended: (() => void) | null
  }> = []
  const gains: Array<{
    connect: ReturnType<typeof vi.fn>
    disconnect: ReturnType<typeof vi.fn>
    gain: {
      value: number
      setValueAtTime: ReturnType<typeof vi.fn>
      linearRampToValueAtTime: ReturnType<typeof vi.fn>
    }
  }> = []
  const decoded = { duration: 180 } as AudioBuffer
  const decodeAudioData = vi.fn(async () => decoded)

  class AudioContextFake {
    state: AudioContextState = 'running'
    currentTime = 0
    destination = {} as AudioDestinationNode
    decodeAudioData = decodeAudioData
    resume = vi.fn(async () => undefined)
    createBufferSource = vi.fn(() => {
      const source = {
        buffer: null as AudioBuffer | null,
        connect: vi.fn(),
        disconnect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
        onended: null as (() => void) | null,
      }
      sources.push(source)
      return source as unknown as AudioBufferSourceNode
    })
    createGain = vi.fn(() => {
      const gain = {
        connect: vi.fn(),
        disconnect: vi.fn(),
        gain: {
          value: 1,
          setValueAtTime: vi.fn(),
          linearRampToValueAtTime: vi.fn(),
        },
      }
      gains.push(gain)
      return gain as unknown as GainNode
    })

    constructor() {
      contexts.push(this)
    }
  }

  return { AudioContextFake, contexts, decodeAudioData, decoded, gains, sources }
}

const webAudio = createWebAudioFake()

beforeAll(() => {
  vi.stubGlobal('AudioContext', webAudio.AudioContextFake)
})

beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
  webAudio.sources.length = 0
  webAudio.gains.length = 0
  webAudio.decodeAudioData.mockImplementation(async () => webAudio.decoded)
  if (webAudio.contexts[0]) webAudio.contexts[0].currentTime = 0
})

afterEach(() => {
  resetAudioEngine()
  vi.runOnlyPendingTimers()
  vi.useRealTimers()
})

afterAll(() => {
  vi.unstubAllGlobals()
})

describe('audio engine', () => {
  it('deduplicates concurrent decoding for the same track', async () => {
    const mp3 = audioBlob()

    const first = prepareTrack('entrada', mp3)
    const second = prepareTrack('entrada', mp3)

    expect(first).toBe(second)
    await first
    expect(webAudio.decodeAudioData).toHaveBeenCalledTimes(1)
  })

  it('starts an already decoded track synchronously at previewStart', async () => {
    await prepareTrack('entrada', audioBlob())
    const onEnded = vi.fn()

    expect(playTrack('entrada', 12, onEnded)).toBe(true)
    expect(webAudio.sources[0].start).toHaveBeenCalledWith(0, 12)
  })

  it('disconnects naturally ended nodes before notifying the caller', async () => {
    await prepareTrack('entrada', audioBlob())
    const observedCleanup = vi.fn(() => ({
      source: webAudio.sources[0].disconnect.mock.calls.length,
      gain: webAudio.gains[0].disconnect.mock.calls.length,
      active: activeTrackId(),
    }))
    playTrack('entrada', 0, observedCleanup)

    webAudio.sources[0].onended?.()

    expect(observedCleanup).toHaveReturnedWith({ source: 1, gain: 1, active: null })
    expect(webAudio.sources[0].disconnect).toHaveBeenCalledTimes(1)
    expect(webAudio.gains[0].disconnect).toHaveBeenCalledTimes(1)
  })

  it('refuses playback before context and buffer are ready', () => {
    expect(playTrack('missing', 0, vi.fn())).toBe(false)
  })

  it('limits an offset to the playable end of the decoded audio', async () => {
    await prepareTrack('entrada', audioBlob())

    playTrack('entrada', 999, vi.fn())

    expect(webAudio.sources[0].start).toHaveBeenCalledWith(0, 179.95)
  })

  it('resumes from the position returned when playback stops', async () => {
    await prepareTrack('entrada', audioBlob())
    playTrack('entrada', 12, vi.fn())
    const engineContext = webAudio.contexts[0]
    engineContext.currentTime = 8

    const resumeAt = stopTrack()
    expect(resumeAt).toBe(20)
    expect(playTrack('entrada', resumeAt, vi.fn())).toBe(true)
    expect(webAudio.sources[1].start).toHaveBeenCalledWith(0, 20)
  })

  it('invalidates the decoded buffer when the audio file changes', async () => {
    await prepareTrack('entrada', audioBlob(1))
    releaseTrack('entrada')

    expect(isAudioReady('entrada')).toBe(false)
    await prepareTrack('entrada', audioBlob(2))
    expect(webAudio.decodeAudioData).toHaveBeenCalledTimes(2)
  })

  it('does not resurrect an old buffer when a track is released during decoding', async () => {
    const pending = deferred<AudioBuffer>()
    webAudio.decodeAudioData.mockImplementationOnce(() => pending.promise)

    const oldDecode = prepareTrack('entrada', audioBlob(1))
    await vi.waitFor(() => expect(webAudio.decodeAudioData).toHaveBeenCalledTimes(1))
    releaseTrack('entrada')
    pending.resolve(webAudio.decoded)
    await oldDecode

    expect(isAudioReady('entrada')).toBe(false)
  })

  it('does not let an old decode completion remove a newer task for the same id', async () => {
    const oldPending = deferred<AudioBuffer>()
    const newPending = deferred<AudioBuffer>()
    webAudio.decodeAudioData
      .mockImplementationOnce(() => oldPending.promise)
      .mockImplementationOnce(() => newPending.promise)

    const oldDecode = prepareTrack('entrada', audioBlob(1))
    await vi.waitFor(() => expect(webAudio.decodeAudioData).toHaveBeenCalledTimes(1))
    releaseTrack('entrada')
    const newDecode = prepareTrack('entrada', audioBlob(2))
    await vi.waitFor(() => expect(webAudio.decodeAudioData).toHaveBeenCalledTimes(2))

    oldPending.resolve(webAudio.decoded)
    await oldDecode
    const duplicate = prepareTrack('entrada', audioBlob(2))

    expect(duplicate).toBe(newDecode)
    expect(webAudio.decodeAudioData).toHaveBeenCalledTimes(2)
    newPending.resolve(webAudio.decoded)
    await newDecode
  })

  it('stops and releases an active track outside the next two-track window', async () => {
    await prepareTrack('a', audioBlob(1))
    await prepareTrack('b', audioBlob(2))
    playTrack('a', 0, vi.fn())

    releaseTracksExcept(['b', 'c'])
    await prepareTrack('c', audioBlob(3))

    expect(activeTrackId()).toBeNull()
    expect(isAudioReady('a')).toBe(false)
    expect(isAudioReady('b')).toBe(true)
    expect(isAudioReady('c')).toBe(true)
    expect(webAudio.sources[0].stop).toHaveBeenCalled()
  })
})
