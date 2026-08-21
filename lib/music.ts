import { isMusicalKey, MUSICAL_KEYS, type MusicalKey } from '@/lib/types'

/** Bemóis aceitos na digitação, normalizados para sustenido. */
const FLAT_TO_SHARP: Record<string, MusicalKey> = {
  Cb: 'B',
  Db: 'C#',
  Eb: 'D#',
  Fb: 'E',
  Gb: 'F#',
  Ab: 'G#',
  Bb: 'A#',
}

/**
 * Sufixos de qualidade aceitos depois da fundamental. Serve de trava: se o que vem
 * depois da nota não parece cifra (ex.: "Bridge"), o token é devolvido intacto.
 */
const CHORD_SUFFIX = /^(?:maj|min|sus|add|dim|aug|alt|no|omit|[mMb#°ø+\-Δ()\d,.])*$/

/** Tokens de cifra: qualquer sequência que não seja espaço nem separador de compasso. */
const CHORD_TOKEN = /[^\s|]+/g

/** Fundamental (letra + acidente) seguida do resto do token. */
const CHORD_ROOT = /^([A-G])([#b]?)(.*)$/

function normalizeNote(note: string): string {
  return FLAT_TO_SHARP[note] ?? note
}

function noteIndex(note: string): number {
  return (MUSICAL_KEYS as readonly string[]).indexOf(normalizeNote(note))
}

/** Distância em semitons de `from` para `to`, sempre entre 0 e 11. */
export function semitoneDistance(from: MusicalKey, to: MusicalKey): number {
  const start = noteIndex(from)
  const end = noteIndex(to)
  if (start < 0 || end < 0) return 0
  return (end - start + 12) % 12
}

function transposeNote(note: string, semitones: number): string {
  const index = noteIndex(note)
  if (index < 0) return note
  return MUSICAL_KEYS[(index + semitones) % 12]
}

/**
 * Transpõe um acorde isolado, incluindo a nota do baixo depois da barra.
 * Ex.: `D/F#` com 2 semitons vira `E/G#`; `Em7` vira `F#m7`.
 */
export function transposeChord(chord: string, semitones: number): string {
  if (semitones === 0) return chord
  return chord
    .split('/')
    .map((part) => {
      const match = CHORD_ROOT.exec(part)
      if (!match) return part
      const [, letter, accidental, suffix] = match
      if (!CHORD_SUFFIX.test(suffix)) return part
      return transposeNote(letter + accidental, semitones) + suffix
    })
    .join('/')
}

/**
 * Transpõe uma linha inteira de cifra preservando espaços e separadores de compasso.
 * Palavras que não são acordes ficam como estão.
 */
export function transposeChordLine(line: string, from: MusicalKey, to: MusicalKey): string {
  const semitones = semitoneDistance(from, to)
  if (semitones === 0) return line
  return line.replace(CHORD_TOKEN, (token) => transposeChord(token, semitones))
}

/** Rótulo curto do intervalo aplicado, para mostrar ao lado do tom. */
export function transposeLabel(from: MusicalKey, to: MusicalKey): string | null {
  const semitones = semitoneDistance(from, to)
  if (semitones === 0) return null
  const signed = semitones > 6 ? semitones - 12 : semitones
  return `${signed > 0 ? '+' : ''}${signed} ${Math.abs(signed) === 1 ? 'semitom' : 'semitons'}`
}

/** Formata segundos como `mm:ss`, tolerando valores inválidos do elemento de áudio. */
export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '00:00'
  const minutes = Math.floor(seconds / 60)
  const rest = Math.floor(seconds % 60)
  return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`
}

/**
 * Converte um valor qualquer em tom válido, aceitando bemóis de backups antigos.
 * Cai no `fallback` quando não dá para interpretar.
 */
export function toMusicalKey(value: unknown, fallback: MusicalKey = 'C'): MusicalKey {
  if (isMusicalKey(value)) return value
  if (typeof value !== 'string') return fallback
  const normalized = FLAT_TO_SHARP[value.trim()]
  return normalized ?? fallback
}
