import { toMetadata } from '@/lib/audio'
import { toMusicalKey } from '@/lib/music'
import { isSongStatus, type Song, type SongMetadata, type SongSection } from '@/lib/types'

export const BACKUP_FILENAME = 'prime-repertorio.json'

const BACKUP_APP = 'prime'
const BACKUP_VERSION = 1

type BackupFile = {
  app: typeof BACKUP_APP
  version: typeof BACKUP_VERSION
  exportedAt: string
  songs: SongMetadata[]
}

/** Gera o arquivo de backup e dispara o download, liberando a URL em seguida. */
export function downloadBackup(songs: Song[]): void {
  const payload: BackupFile = {
    app: BACKUP_APP,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    songs: songs.map(toMetadata),
  }

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = BACKUP_FILENAME
  link.click()
  // O clique é sincrônico, mas o download só começa depois; um tick evita cancelar.
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000)
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}
}

function normalizeSection(raw: unknown, index: number): SongSection {
  const section = asRecord(raw)
  return {
    id: asString(section.id) || `secao-${index + 1}-${crypto.randomUUID()}`,
    name: asString(section.name, 'SEÇÃO'),
    lyrics: asString(section.lyrics),
    chords: asString(section.chords),
    bars: asString(section.bars),
  }
}

function normalizeSong(raw: unknown, index: number): SongMetadata {
  const song = asRecord(raw)
  const originalKey = toMusicalKey(song.originalKey)
  const sections = Array.isArray(song.sections) ? song.sections : []
  const duration = Number(song.audioDuration)

  return {
    id: asString(song.id) || crypto.randomUUID(),
    title: asString(song.title, `Música ${index + 1}`),
    artist: asString(song.artist),
    moment: asString(song.moment),
    originalKey,
    key: toMusicalKey(song.key, originalKey),
    status: isSongStatus(song.status) ? song.status : 'Nova',
    entry: asString(song.entry),
    notes: asString(song.notes),
    structure: asString(song.structure),
    sections: sections.map(normalizeSection),
    audioName: typeof song.audioName === 'string' ? song.audioName : undefined,
    audioDuration: Number.isFinite(duration) && duration > 0 ? duration : undefined,
    previewStart: Math.max(0, Number(song.previewStart) || 0),
  }
}

/**
 * Lê um backup exportado pelo app. Aceita o formato atual (`{ songs: [...] }`) e
 * o formato antigo (array puro). Lança erro com mensagem pronta para exibição.
 */
export function parseBackup(raw: string): SongMetadata[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error('Arquivo inválido: não é um JSON.')
  }

  const list = Array.isArray(parsed) ? parsed : asRecord(parsed).songs
  if (!Array.isArray(list)) throw new Error('Arquivo inválido: nenhuma música encontrada.')
  if (list.length === 0) throw new Error('O backup está vazio.')

  return list.map(normalizeSong)
}

/** Normaliza uma lista crua (backup ou dado legado) em metadados válidos. */
export function normalizeSongs(list: readonly unknown[]): SongMetadata[] {
  return list.map(normalizeSong)
}
