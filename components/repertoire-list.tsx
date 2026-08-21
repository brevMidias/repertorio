'use client'

import { useState } from 'react'
import {
  ChevronDown,
  ChevronUp,
  CircleCheck,
  Clock3,
  Download,
  GripVertical,
  Pencil,
  Plus,
} from 'lucide-react'

import type { Song } from '@/lib/types'

type RepertoireListProps = {
  songs: Song[]
  selectedId: string
  onOpen: (id: string) => void
  onEdit: (song: Song) => void
  onMove: (fromIndex: number, toIndex: number) => void
  onAdd: () => void
  onExport: () => void
  mutationsEnabled: boolean
}

export function RepertoireList({
  songs,
  selectedId,
  onOpen,
  onEdit,
  onMove,
  onAdd,
  onExport,
  mutationsEnabled,
}: RepertoireListProps) {
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const ready = songs.filter((song) => song.status === 'Pronta').length

  return (
    <section className="content">
      <div className="page-heading">
        <div>
          <p className="eyebrow">
            ORDEM DE EXECUÇÃO · {songs.length} {songs.length === 1 ? 'MÚSICA' : 'MÚSICAS'}
          </p>
          <h1>Repertório</h1>
          <p className="muted">Tudo que você precisa para tocar com tranquilidade.</p>
        </div>
        <button
          type="button"
          className="primary-button"
          disabled={!mutationsEnabled}
          onClick={onAdd}
        >
          <Plus size={18} aria-hidden="true" />
          Nova música
        </button>
      </div>

      {songs.length === 0 ? (
        <p className="empty-state">
          Nenhuma música ainda. Toque em <strong>Nova música</strong> para começar o repertório.
        </p>
      ) : (
        <ul className="song-list">
          {songs.map((song, index) => (
            <li
              key={song.id}
              className={`song-row${song.id === selectedId ? ' selected' : ''}${
                dragIndex === index ? ' dragging' : ''
              }`}
              draggable={mutationsEnabled}
              onDragStart={(event) => {
                if (!mutationsEnabled) return
                setDragIndex(index)
                event.dataTransfer.effectAllowed = 'move'
                event.dataTransfer.setData('text/plain', song.id)
              }}
              onDragOver={(event) => {
                if (dragIndex === null) return
                event.preventDefault()
                event.dataTransfer.dropEffect = 'move'
              }}
              onDrop={(event) => {
                event.preventDefault()
                if (mutationsEnabled && dragIndex !== null) onMove(dragIndex, index)
                setDragIndex(null)
              }}
              onDragEnd={() => setDragIndex(null)}
            >
              <span className="drag" aria-hidden="true">
                <GripVertical size={18} />
              </span>

              <button
                type="button"
                className="song-open"
                onClick={() => onOpen(song.id)}
                aria-label={`Abrir ${song.title} no modo palco`}
              >
                <span className="song-number">{String(index + 1).padStart(2, '0')}</span>
                <span className="song-info">
                  <b>{song.moment || 'Momento não definido'}</b>
                  <strong>{song.title}</strong>
                  <small>{song.artist || 'Artista não informado'}</small>
                </span>
                <span className="song-key">
                  <small>TOM</small>
                  <strong>{song.key}</strong>
                </span>
                <span className={`status status-${song.status.toLowerCase()}`}>
                  {song.status === 'Pronta' ? (
                    <CircleCheck size={15} aria-hidden="true" />
                  ) : (
                    <Clock3 size={15} aria-hidden="true" />
                  )}
                  {song.status}
                </span>
              </button>

              <span className="row-actions">
                <button
                  type="button"
                  className="icon-button"
                  disabled={!mutationsEnabled || index === 0}
                  onClick={() => onMove(index, index - 1)}
                  aria-label={`Mover ${song.title} para cima`}
                >
                  <ChevronUp size={16} />
                </button>
                <button
                  type="button"
                  className="icon-button"
                  disabled={!mutationsEnabled || index === songs.length - 1}
                  onClick={() => onMove(index, index + 1)}
                  aria-label={`Mover ${song.title} para baixo`}
                >
                  <ChevronDown size={16} />
                </button>
                <button
                  type="button"
                  className="icon-button"
                  disabled={!mutationsEnabled}
                  onClick={() => onEdit(song)}
                  aria-label={`Editar ${song.title}`}
                >
                  <Pencil size={16} />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="repertoire-footer">
        <span>
          <CircleCheck size={16} aria-hidden="true" />
          {ready} {ready === 1 ? 'pronta' : 'prontas'}
        </span>
        <span>
          <Clock3 size={16} aria-hidden="true" />
          {songs.length - ready} para revisar
        </span>
        <button type="button" className="text-button" onClick={onExport}>
          <Download size={15} aria-hidden="true" />
          Exportar backup
        </button>
      </div>
    </section>
  )
}
