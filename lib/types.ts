/**
 * Domínio do repertório. Um único lugar para os tipos que atravessam a aplicação.
 */

/** Tons usados na interface, sempre grafados com sustenido. */
export const MUSICAL_KEYS = [
  'C',
  'C#',
  'D',
  'D#',
  'E',
  'F',
  'F#',
  'G',
  'G#',
  'A',
  'A#',
  'B',
] as const

export type MusicalKey = (typeof MUSICAL_KEYS)[number]

export const SONG_STATUSES = ['Pronta', 'Revisar', 'Nova'] as const

export type SongStatus = (typeof SONG_STATUSES)[number]

/** Bloco da música (intro, verso, refrão...) com a cifra escrita no tom original. */
export type SongSection = {
  id: string
  /** Rótulo exibido no modo palco. */
  name: string
  /** Trecho de letra usado como gatilho de memória. */
  lyrics: string
  /** Cifra no tom original da música, separada por `|`. */
  chords: string
  /** Quantidade de compassos, livre para anotações como "4" ou "2x4". */
  bars: string
}

export type Song = {
  id: string
  title: string
  artist: string
  /** Momento da cerimônia em que a música entra. */
  moment: string
  /** Tom em que a música vai ser tocada. */
  key: MusicalKey
  /** Tom em que as cifras das seções estão escritas. */
  originalKey: MusicalKey
  status: SongStatus
  /** Instrução de entrada (deixa, sinal do celebrante...). */
  entry: string
  notes: string
  structure: string
  sections: SongSection[]
  /** Nome do arquivo de referência, apenas informativo. */
  audioName?: string
  /** Object URL recriado a cada sessão a partir de `audioBlob`. Nunca persistido. */
  audioUrl?: string
  /** Áudio de referência guardado offline no IndexedDB. */
  audioBlob?: Blob
  /** Duração do áudio em segundos, preenchida na decodificação. */
  audioDuration?: number
  /** Segundo em que a prévia começa a tocar. */
  previewStart: number
}

/**
 * A parte da música que vira texto: é isso que vai para o registro de metadados
 * e para o espelho no `localStorage`. O áudio é guardado à parte, por id.
 */
export type SongMetadata = Omit<Song, 'audioBlob' | 'audioUrl'>

export type AppView = 'repertoire' | 'stage' | 'prep'

export type FontSize = 'normal' | 'large' | 'xl'

export function isMusicalKey(value: unknown): value is MusicalKey {
  return typeof value === 'string' && (MUSICAL_KEYS as readonly string[]).includes(value)
}

export function isSongStatus(value: unknown): value is SongStatus {
  return typeof value === 'string' && (SONG_STATUSES as readonly string[]).includes(value)
}
