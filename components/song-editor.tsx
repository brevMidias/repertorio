'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronUp, Plus, Save, Trash2, X } from 'lucide-react'

import { revokeUrl } from '@/lib/audio'
import { createEmptySection } from '@/lib/seed'
import {
  MUSICAL_KEYS,
  SONG_STATUSES,
  type MusicalKey,
  type Song,
  type SongSection,
  type SongStatus,
} from '@/lib/types'

type SongEditorProps = {
  song: Song
  onClose: () => void
  onSave: (song: Song) => void
  onDelete: () => void
}

export function SongEditor({ song, onClose, onSave, onDelete }: SongEditorProps) {
  const [draft, setDraft] = useState<Song>(song)
  const [audioError, setAudioError] = useState('')
  /** Object URLs criadas nesta edição; morrem se o usuário cancelar. */
  const createdUrls = useRef<string[]>([])

  /** Cancelar não pode mexer no áudio original, só descartar o que foi criado aqui. */
  const handleClose = useCallback(() => {
    createdUrls.current.forEach(revokeUrl)
    createdUrls.current = []
    onClose()
  }, [onClose])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') handleClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [handleClose])

  const set = <K extends keyof Song>(key: K, value: Song[K]) => {
    setDraft((current) => ({ ...current, [key]: value }))
  }

  const updateSection = <K extends keyof SongSection>(
    id: string,
    key: K,
    value: SongSection[K],
  ) => {
    setDraft((current) => ({
      ...current,
      sections: current.sections.map((section) =>
        section.id === id ? { ...section, [key]: value } : section,
      ),
    }))
  }

  const moveSection = (index: number, offset: number) => {
    setDraft((current) => {
      const target = index + offset
      if (target < 0 || target >= current.sections.length) return current
      const sections = [...current.sections]
      const [moved] = sections.splice(index, 1)
      sections.splice(target, 0, moved)
      return { ...current, sections }
    })
  }

  const removeSection = (id: string) => {
    setDraft((current) => ({
      ...current,
      sections: current.sections.filter((section) => section.id !== id),
    }))
  }

  const pickAudio = (file: File) => {
    if (!file.type.startsWith('audio/')) {
      setAudioError('Selecione um arquivo de áudio válido.')
      return
    }

    setAudioError('')
    const url = URL.createObjectURL(file)
    createdUrls.current.push(url)
    setDraft((current) => ({
      ...current,
      audioName: file.name,
      audioBlob: file,
      audioUrl: url,
    }))
  }

  const clearAudio = () => {
    setDraft((current) => ({
      ...current,
      audioName: undefined,
      audioBlob: undefined,
      audioUrl: undefined,
    }))
  }

  const handleSave = () => {
    const cleaned: Song = {
      ...draft,
      title: draft.title.trim() || 'Sem título',
      artist: draft.artist.trim(),
      moment: draft.moment.trim(),
      bpm: Number.isFinite(draft.bpm) && draft.bpm > 0 ? Math.round(draft.bpm) : 72,
      previewStart: Math.max(0, Number(draft.previewStart) || 0),
    }

    // A URL antiga só é liberada quando o áudio realmente mudou.
    if (song.audioUrl && song.audioUrl !== cleaned.audioUrl) revokeUrl(song.audioUrl)
    createdUrls.current.filter((url) => url !== cleaned.audioUrl).forEach(revokeUrl)
    createdUrls.current = []

    onSave(cleaned)
  }

  const handleDelete = () => {
    revokeUrl(song.audioUrl)
    createdUrls.current.forEach(revokeUrl)
    createdUrls.current = []
    onDelete()
  }

  return (
    // Clicar no fundo não fecha: um toque acidental não pode descartar a edição.
    // A saída é sempre explícita, por Cancelar, pelo X ou por Esc.
    <div className="modal-backdrop">
      <div className="editor" role="dialog" aria-modal="true" aria-labelledby="editor-title">
        <div className="editor-head">
          <div>
            <p className="eyebrow">EDITAR MÚSICA</p>
            <h2 id="editor-title">{draft.title || 'Sem título'}</h2>
          </div>
          <button
            type="button"
            className="icon-button"
            onClick={handleClose}
            aria-label="Fechar editor"
          >
            <X size={20} />
          </button>
        </div>

        <div className="form-grid">
          <label>
            Nome
            <input
              value={draft.title}
              autoFocus
              onChange={(event) => set('title', event.target.value)}
            />
          </label>
          <label>
            Artista
            <input value={draft.artist} onChange={(event) => set('artist', event.target.value)} />
          </label>
          <label>
            Momento da cerimônia
            <input value={draft.moment} onChange={(event) => set('moment', event.target.value)} />
          </label>
          <label>
            Tom original
            <select
              value={draft.originalKey}
              onChange={(event) => {
                const nextKey = event.target.value as MusicalKey
                setDraft((current) => ({
                  ...current,
                  originalKey: nextKey,
                  // Sem transposição ativa, o tom de execução acompanha o original.
                  key: current.key === current.originalKey ? nextKey : current.key,
                }))
              }}
            >
              {MUSICAL_KEYS.map((key) => (
                <option key={key} value={key}>
                  {key}
                </option>
              ))}
            </select>
          </label>
          <label>
            Tom de execução
            <select
              value={draft.key}
              onChange={(event) => set('key', event.target.value as MusicalKey)}
            >
              {MUSICAL_KEYS.map((key) => (
                <option key={key} value={key}>
                  {key}
                </option>
              ))}
            </select>
          </label>
          <label>
            BPM
            <input
              type="number"
              min={20}
              max={300}
              value={draft.bpm}
              onChange={(event) => set('bpm', Number(event.target.value))}
            />
          </label>
          <label>
            Status
            <select
              value={draft.status}
              onChange={(event) => set('status', event.target.value as SongStatus)}
            >
              {SONG_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </label>
          <label>
            Início da prévia (segundos)
            <input
              type="number"
              min={0}
              value={draft.previewStart}
              onChange={(event) => set('previewStart', Number(event.target.value))}
            />
          </label>
          <label className="wide">
            Áudio de referência
            <input
              type="file"
              accept="audio/*"
              onChange={(event) => {
                const file = event.target.files?.[0]
                event.target.value = ''
                if (file) pickAudio(file)
              }}
            />
          </label>
          {audioError && (
            <p className="muted wide" role="status">
              {audioError}
            </p>
          )}
          {draft.audioName && (
            <p className="audio-chip wide">
              <span>{draft.audioName}</span>
              <button type="button" className="text-button" onClick={clearAudio}>
                Remover áudio
              </button>
            </p>
          )}
          <label className="wide">
            Estrutura
            <input
              value={draft.structure}
              placeholder="INTRO → VERSO → REFRÃO"
              onChange={(event) => set('structure', event.target.value)}
            />
          </label>
          <label className="wide">
            Entrada
            <textarea value={draft.entry} onChange={(event) => set('entry', event.target.value)} />
          </label>
          <label className="wide">
            Observações
            <textarea value={draft.notes} onChange={(event) => set('notes', event.target.value)} />
          </label>
        </div>

        <div className="editor-sections">
          <div className="section-editor-heading">
            <strong>Seções e acordes</strong>
            <button
              type="button"
              className="text-button"
              onClick={() =>
                setDraft((current) => ({
                  ...current,
                  sections: [...current.sections, createEmptySection()],
                }))
              }
            >
              <Plus size={15} aria-hidden="true" />
              Adicionar seção
            </button>
          </div>

          <p className="muted section-hint">
            Escreva as cifras no tom original ({draft.originalKey}). A transposição para{' '}
            {draft.key} é feita na hora de tocar.
          </p>

          {draft.sections.map((section, index) => (
            <div className="section-form" key={section.id}>
              <input
                className="section-name"
                aria-label="Nome da seção"
                value={section.name}
                onChange={(event) => updateSection(section.id, 'name', event.target.value)}
              />
              <input
                aria-label="Cifra"
                value={section.chords}
                onChange={(event) => updateSection(section.id, 'chords', event.target.value)}
              />
              <input
                aria-label="Trecho de letra"
                placeholder="Trecho de letra"
                value={section.lyrics}
                onChange={(event) => updateSection(section.id, 'lyrics', event.target.value)}
              />
              <input
                aria-label="Compassos"
                placeholder="Compassos"
                value={section.bars}
                onChange={(event) => updateSection(section.id, 'bars', event.target.value)}
              />
              <span className="section-actions">
                <button
                  type="button"
                  className="icon-button"
                  disabled={index === 0}
                  onClick={() => moveSection(index, -1)}
                  aria-label={`Mover seção ${section.name} para cima`}
                >
                  <ChevronUp size={15} />
                </button>
                <button
                  type="button"
                  className="icon-button"
                  disabled={index === draft.sections.length - 1}
                  onClick={() => moveSection(index, 1)}
                  aria-label={`Mover seção ${section.name} para baixo`}
                >
                  <ChevronDown size={15} />
                </button>
                <button
                  type="button"
                  className="icon-button"
                  onClick={() => removeSection(section.id)}
                  aria-label={`Excluir seção ${section.name}`}
                >
                  <Trash2 size={15} />
                </button>
              </span>
            </div>
          ))}
        </div>

        <div className="editor-footer">
          <button type="button" className="danger-button" onClick={handleDelete}>
            <Trash2 size={16} aria-hidden="true" />
            Excluir música
          </button>
          <div>
            <button type="button" className="secondary-button" onClick={handleClose}>
              Cancelar
            </button>
            <button type="button" className="primary-button" onClick={handleSave}>
              <Save size={17} aria-hidden="true" />
              Salvar música
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
