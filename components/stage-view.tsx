'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, ChevronDown, Pause, Play, Settings2 } from 'lucide-react'

import {
  isAudioReady,
  playTrack,
  prepareTrack,
  stopTrack,
  trackPosition,
  warmUpAudio,
} from '@/lib/audio-engine'
import { PLAYBACK_TICK_MS } from '@/lib/config'
import { formatTime, transposeChordLine, transposeLabel } from '@/lib/music'
import { MUSICAL_KEYS, type FontSize, type MusicalKey, type Song } from '@/lib/types'

/** Distância mínima, em pixels, para um arrasto horizontal virar troca de música. */
const SWIPE_THRESHOLD = 60

const FONT_SIZE_LABEL: Record<FontSize, string> = {
  normal: 'normal',
  large: 'grande',
  xl: 'muito grande',
}

type StageViewProps = {
  song: Song
  nextSong?: Song
  index: number
  total: number
  fontSize: FontSize
  wakeLockActive: boolean
  onBack: () => void
  onSelectIndex: (index: number) => void
  onKeyChange: (key: MusicalKey) => void
  onCycleFontSize: () => void
}

export function StageView({
  song,
  nextSong,
  index,
  total,
  fontSize,
  wakeLockActive,
  onBack,
  onSelectIndex,
  onKeyChange,
  onCycleFontSize,
}: StageViewProps) {
  const keyControlRef = useRef<HTMLDivElement>(null)
  const touchStart = useRef<{ x: number; y: number } | null>(null)
  const playRequest = useRef(0)

  // O componente é remontado a cada música (via `key` no pai), então o estado de
  // reprodução e o seletor de tom já começam zerados na troca.
  const [playing, setPlaying] = useState(false)
  const [preparing, setPreparing] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [keyPickerOpen, setKeyPickerOpen] = useState(false)

  const hasAudio = Boolean(song.audioBlob)
  const interval = transposeLabel(song.originalKey, song.key)

  const transposedSections = useMemo(
    () =>
      song.sections.map((section) => ({
        ...section,
        chords: transposeChordLine(section.chords, song.originalKey, song.key),
      })),
    [song.sections, song.originalKey, song.key],
  )

  useEffect(() => {
    if (!keyPickerOpen) return

    const handlePointerDown = (event: PointerEvent) => {
      if (!keyControlRef.current?.contains(event.target as Node)) setKeyPickerOpen(false)
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setKeyPickerOpen(false)
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [keyPickerOpen])

  // Setas do teclado avançam o repertório, útil com pedal ou controle remoto.
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return
      if (event.key === 'ArrowRight') onSelectIndex(index + 1)
      else if (event.key === 'ArrowLeft') onSelectIndex(index - 1)
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [index, onSelectIndex])

  const handleEnded = useCallback(() => {
    setElapsed(song.previewStart)
    setPlaying(false)
  }, [song.previewStart])

  const markPlaying = useCallback((offset: number) => {
    setElapsed(offset)
    setPreparing(false)
    setPlaying(true)
  }, [])

  useEffect(() => {
    if (!playing) return
    const timer = window.setInterval(() => setElapsed(trackPosition()), PLAYBACK_TICK_MS)
    return () => window.clearInterval(timer)
  }, [playing])

  useEffect(() => {
    return () => {
      playRequest.current += 1
      stopTrack()
    }
  }, [song.id])

  const prepareAndPlay = useCallback(async () => {
    if (!song.audioBlob) return
    const request = ++playRequest.current
    // Todo play recomeça no ponto configurado: nunca retoma de onde pausou.
    const offset = song.previewStart
    setPreparing(true)

    const awake = await warmUpAudio()
    const buffer = awake ? await prepareTrack(song.id, song.audioBlob) : null
    if (request !== playRequest.current) return

    if (buffer && playTrack(song.id, offset, handleEnded)) markPlaying(offset)
    else setPreparing(false)
  }, [handleEnded, markPlaying, song.audioBlob, song.id, song.previewStart])

  const togglePlay = () => {
    if (!hasAudio || preparing) return

    if (playing) {
      playRequest.current += 1
      stopTrack()
      setElapsed(song.previewStart)
      setPlaying(false)
      return
    }

    const offset = song.previewStart
    if (isAudioReady(song.id) && playTrack(song.id, offset, handleEnded)) {
      markPlaying(offset)
      return
    }

    void prepareAndPlay()
  }

  return (
    <section
      className="stage content"
      onTouchStart={(event) => {
        const touch = event.touches[0]
        touchStart.current = { x: touch.clientX, y: touch.clientY }
      }}
      onTouchEnd={(event) => {
        const start = touchStart.current
        touchStart.current = null
        if (!start) return

        const touch = event.changedTouches[0]
        const deltaX = touch.clientX - start.x
        const deltaY = touch.clientY - start.y
        if (Math.abs(deltaX) < SWIPE_THRESHOLD || Math.abs(deltaX) < Math.abs(deltaY)) return

        onSelectIndex(index + (deltaX < 0 ? 1 : -1))
      }}
    >
      <div className="stage-header">
        <button type="button" className="back-button" onClick={onBack}>
          <ArrowLeft size={17} aria-hidden="true" />
          Repertório
        </button>
        <span className="counter">
          {String(index + 1).padStart(2, '0')} / {String(total).padStart(2, '0')}
        </span>
        <div className="stage-actions">
          <button
            type="button"
            className="icon-button"
            onClick={onCycleFontSize}
            aria-label={`Tamanho da cifra: ${FONT_SIZE_LABEL[fontSize]}. Toque para alternar.`}
          >
            <Settings2 size={18} />
          </button>
          <span className="wake-indicator">{wakeLockActive ? 'Tela ativa' : 'Modo palco'}</span>
        </div>
      </div>

      <div className="stage-title">
        <p className="eyebrow">{song.moment || 'Momento não definido'}</p>
        <h1>{song.title}</h1>
        <p className="artist">{song.artist || 'Artista não informado'}</p>
      </div>

      <div className="stage-meta">
        <div className="key-control" ref={keyControlRef}>
          <small id="stage-key-label">TOM</small>
          <button
            type="button"
            onClick={() => setKeyPickerOpen((open) => !open)}
            aria-expanded={keyPickerOpen}
            aria-labelledby="stage-key-label"
          >
            {song.key}
            <ChevronDown size={22} aria-hidden="true" />
          </button>
          {interval && <em className="key-interval">{interval}</em>}
          {keyPickerOpen && (
            <div className="key-picker" role="group" aria-label="Escolher tom">
              {MUSICAL_KEYS.map((key) => (
                <button
                  type="button"
                  key={key}
                  className={key === song.key ? 'chosen' : undefined}
                  aria-pressed={key === song.key}
                  onClick={() => {
                    onKeyChange(key)
                    setKeyPickerOpen(false)
                  }}
                >
                  {key}
                </button>
              ))}
            </div>
          )}
        </div>

        <div>
          <small>BPM</small>
          <strong>{song.bpm}</strong>
        </div>

        <button
          type="button"
          className={`audio-button${playing ? ' is-playing' : ''}`}
          onClick={togglePlay}
          disabled={!hasAudio}
        >
          {playing ? <Pause size={20} aria-hidden="true" /> : <Play size={20} aria-hidden="true" />}
          {!hasAudio
            ? 'Sem áudio de referência'
            : preparing
              ? 'Preparando áudio…'
            : playing
              ? `Pausar · ${formatTime(elapsed)}`
              : 'Ouvir referência'}
        </button>
      </div>

      {song.entry.trim() && (
        <div className="entry-card">
          <span>ENTRADA</span>
          <p>{song.entry}</p>
        </div>
      )}

      {song.structure && (
        <div className="structure">
          <span>ESTRUTURA</span>
          <p>{song.structure}</p>
        </div>
      )}

      <div className="chord-map">
        {transposedSections.map((section) => (
          <article className="chord-section" key={section.id}>
            <div className="section-label">
              <strong>{section.name}</strong>
              {section.bars && <small>{section.bars} compassos</small>}
            </div>
            {section.lyrics && <p className="lyrics">“{section.lyrics}”</p>}
            <p className="chords">{section.chords}</p>
          </article>
        ))}
      </div>

      {song.notes.trim() && (
        <div className="notes">
          <span>OBSERVAÇÃO</span>
          <p>{song.notes}</p>
        </div>
      )}

      <div className="next-card">
        <span>PRÓXIMA</span>
        <strong>{nextSong?.title ?? 'Fim do repertório'}</strong>
        <small>{nextSong?.moment ?? 'Você chegou ao final'}</small>
      </div>

      <div className="stage-nav">
        <button type="button" disabled={index === 0} onClick={() => onSelectIndex(index - 1)}>
          <ArrowLeft size={20} aria-hidden="true" />
          Anterior
        </button>
        <button
          type="button"
          disabled={index === total - 1}
          onClick={() => onSelectIndex(index + 1)}
        >
          Próxima
          <ArrowRight size={20} aria-hidden="true" />
        </button>
      </div>
    </section>
  )
}
