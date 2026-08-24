import type { Song } from '@/lib/types'

/** IDs usados apenas para descartar os exemplos das versões antigas na migração. */
export const LEGACY_EXAMPLE_SONG_IDS = new Set([
  'perfect',
  'reason',
  'thousand',
  'hallelujah',
])

/** Cria uma música vazia pronta para edição. */
export function createEmptySong(): Song {
  return {
    id: crypto.randomUUID(),
    title: 'Nova música',
    artist: '',
    moment: 'Momento da cerimônia',
    key: 'C',
    originalKey: 'C',
    bpm: 72,
    status: 'Nova',
    entry: '',
    notes: '',
    structure: 'INTRO → VERSO → REFRÃO',
    previewStart: 0,
    sections: [createEmptySection('INTRO')],
  }
}

/** Cria uma seção nova pronta para receber a cifra. */
export function createEmptySection(name = 'NOVA SEÇÃO') {
  return { id: crypto.randomUUID(), name, lyrics: '', chords: '', bars: '' }
}
