import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { StageView } from '@/components/stage-view'
import { PLAYBACK_TICK_MS } from '@/lib/config'
import { prepareTrack, resetAudioEngine, warmUpAudio } from '@/lib/audio-engine'
import type { Song } from '@/lib/types'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

const sources: Array<{
  buffer: AudioBuffer | null
  connect: ReturnType<typeof vi.fn>
  disconnect: ReturnType<typeof vi.fn>
  start: ReturnType<typeof vi.fn>
  stop: ReturnType<typeof vi.fn>
  onended: (() => void) | null
}> = []
const contexts: AudioContextFake[] = []
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
    return gain as unknown as GainNode
  })

  constructor() {
    contexts.push(this)
  }
}

function song(overrides: Partial<Song> = {}): Song {
  return {
    id: 'entrada',
    title: 'Entrada',
    artist: 'Artista',
    moment: 'Entrada',
    key: 'C',
    originalKey: 'C',
    status: 'Pronta',
    entry: '',
    notes: '',
    structure: '',
    sections: [],
    audioBlob: {
      arrayBuffer: vi.fn(async () => new Uint8Array([1]).buffer),
    } as unknown as Blob,
    previewStart: 12,
    ...overrides,
  }
}

function renderStage(currentSong = song()) {
  return render(
    <StageView
      song={currentSong}
      index={0}
      total={1}
      fontSize="normal"
      wakeLockActive={false}
      onBack={vi.fn()}
      onSelectIndex={vi.fn()}
      onKeyChange={vi.fn()}
      onCycleFontSize={vi.fn()}
    />,
  )
}

beforeAll(() => {
  vi.stubGlobal('AudioContext', AudioContextFake)
})

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.clearAllMocks()
  sources.length = 0
  decodeAudioData.mockImplementation(async () => decoded)
  if (contexts[0]) contexts[0].currentTime = 0
})

afterEach(() => {
  cleanup()
  resetAudioEngine()
  vi.runOnlyPendingTimers()
  vi.useRealTimers()
})

afterAll(() => {
  vi.unstubAllGlobals()
})

describe('StageView audio', () => {
  it('starts a warm track synchronously without rendering a media element', async () => {
    await warmUpAudio()
    await prepareTrack('entrada', song().audioBlob!)
    const { container } = renderStage()

    fireEvent.click(screen.getByRole('button', { name: 'Ouvir referência' }))

    expect(sources[0].start).toHaveBeenCalledWith(0, 12)
    expect(screen.getByRole('button', { name: 'Pausar · 00:12' })).toBeTruthy()
    expect(container.querySelector('audio')).toBeNull()
  })

  it('shows preparation on a cold track and plays it after decoding', async () => {
    const pending = deferred<AudioBuffer>()
    decodeAudioData.mockImplementationOnce(() => pending.promise)
    renderStage()

    fireEvent.click(screen.getByRole('button', { name: 'Ouvir referência' }))

    const preparing = screen.getByRole('button', { name: 'Preparando áudio…' })
    expect((preparing as HTMLButtonElement).disabled).toBe(false)
    pending.resolve(decoded)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Pausar · 00:12' })).toBeTruthy())
    expect(sources[0].start).toHaveBeenCalledWith(0, 12)
  })

  it('pauses with fade, updates the timer, and restarts at previewStart', async () => {
    await warmUpAudio()
    await prepareTrack('entrada', song().audioBlob!)
    renderStage()
    fireEvent.click(screen.getByRole('button', { name: 'Ouvir referência' }))

    act(() => {
      contexts[0].currentTime = 5
      vi.advanceTimersByTime(PLAYBACK_TICK_MS)
    })
    expect(screen.getByRole('button', { name: 'Pausar · 00:17' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Pausar · 00:17' }))

    expect(sources[0].stop).toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Ouvir referência' }))
    expect(sources[1].start).toHaveBeenCalledWith(0, 12)
    expect(screen.getByRole('button', { name: 'Pausar · 00:12' })).toBeTruthy()
  })

  it('restarts from the beginning when previewStart is zero', async () => {
    await warmUpAudio()
    await prepareTrack('entrada', song().audioBlob!)
    renderStage(song({ previewStart: 0 }))
    fireEvent.click(screen.getByRole('button', { name: 'Ouvir referência' }))

    act(() => {
      contexts[0].currentTime = 9
      vi.advanceTimersByTime(PLAYBACK_TICK_MS)
    })
    fireEvent.click(screen.getByRole('button', { name: 'Pausar · 00:09' }))
    fireEvent.click(screen.getByRole('button', { name: 'Ouvir referência' }))

    expect(sources[1].start).toHaveBeenCalledWith(0, 0)
  })

  it('disables playback only when the song has no audio blob', () => {
    renderStage(song({ audioBlob: undefined, audioUrl: 'blob:legacy' }))

    expect(
      (screen.getByRole('button', { name: 'Sem áudio de referência' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true)
  })
})

describe('StageView optional blocks', () => {
  it('omits entry and notes when they are empty or only whitespace', () => {
    renderStage(song({ entry: '', notes: '   ' }))

    expect(screen.queryByText('ENTRADA')).toBeNull()
    expect(screen.queryByText('OBSERVAÇÃO')).toBeNull()
  })

  it('shows entry and notes when they have content', () => {
    renderStage(song({ entry: 'Após a leitura', notes: 'Refrão dobrado' }))

    expect(screen.getByText('ENTRADA')).toBeTruthy()
    expect(screen.getByText('Após a leitura')).toBeTruthy()
    expect(screen.getByText('OBSERVAÇÃO')).toBeTruthy()
    expect(screen.getByText('Refrão dobrado')).toBeTruthy()
  })
})
