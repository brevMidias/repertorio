import type { Song } from '@/lib/types'

/**
 * Repertório inicial mostrado na primeira abertura, antes de existir dado salvo.
 * As cifras estão escritas no `originalKey` de cada música.
 */
export const SEED_SONGS: Song[] = [
  {
    id: 'perfect',
    title: 'Perfect',
    artist: 'Ed Sheeran',
    moment: 'Entrada dos padrinhos',
    key: 'G',
    originalKey: 'G',
    bpm: 65,
    status: 'Pronta',
    entry: 'Piano sozinho. Esperar o sinal do celebrante.',
    notes: 'Primeira parte suave. Crescer no refrão final.',
    structure: 'INTRO → V1 → REF → V2 → REF → PONTE → FINAL',
    previewStart: 0,
    sections: [
      { id: 'perfect-intro', name: 'INTRO', lyrics: '', chords: 'G | D/F# | Em | C', bars: '4' },
      {
        id: 'perfect-verso',
        name: 'VERSO',
        lyrics: 'I found a love...',
        chords: 'G | Em | C | D',
        bars: '8',
      },
      {
        id: 'perfect-refrao',
        name: 'REFRÃO',
        lyrics: 'Baby, I’m dancing in the dark...',
        chords: 'G | D | Em | C',
        bars: '8',
      },
      {
        id: 'perfect-ponte',
        name: 'PONTE',
        lyrics: 'And all along I believed...',
        chords: 'Em | C | G | D',
        bars: '8',
      },
    ],
  },
  {
    id: 'reason',
    title: 'You Are The Reason',
    artist: 'Calum Scott',
    moment: 'Entrada do noivo',
    key: 'C#',
    originalKey: 'C#',
    bpm: 72,
    status: 'Pronta',
    entry: 'Começar depois que o celebrante anunciar.',
    notes: 'Sem baixo no primeiro verso.',
    structure: 'INTRO → V1 → REF → V2 → REF → FINAL',
    previewStart: 0,
    sections: [
      { id: 'reason-intro', name: 'INTRO', lyrics: '', chords: 'C# | G# | A#m | F#', bars: '4' },
      {
        id: 'reason-verso',
        name: 'VERSO',
        lyrics: 'I’d climb every mountain...',
        chords: 'C# | A#m | F# | G#',
        bars: '8',
      },
      {
        id: 'reason-refrao',
        name: 'REFRÃO',
        lyrics: 'I’d swim every ocean...',
        chords: 'F# | C# | G# | A#m',
        bars: '8',
      },
    ],
  },
  {
    id: 'thousand',
    title: 'A Thousand Years',
    artist: 'Christina Perri',
    moment: 'Entrada da noiva',
    key: 'A#',
    originalKey: 'A#',
    bpm: 50,
    status: 'Revisar',
    entry: 'Piano suave. Esperar sinal. Intro de 4 compassos.',
    notes: 'Aumentar dinâmica no segundo refrão.',
    structure: 'INTRO → V1 → REF → V2 → REF → PONTE → REF 2X → FINAL',
    previewStart: 0,
    sections: [
      { id: 'thousand-intro', name: 'INTRO', lyrics: '', chords: 'A# | F/A | Gm | D#', bars: '4' },
      {
        id: 'thousand-verso',
        name: 'VERSO',
        lyrics: 'Heart beats fast...',
        chords: 'A# | F/A | Gm | D#',
        bars: '8',
      },
      {
        id: 'thousand-refrao',
        name: 'REFRÃO',
        lyrics: 'I have died every day...',
        chords: 'D# | A# | F | Gm',
        bars: '8',
      },
      {
        id: 'thousand-ponte',
        name: 'PONTE',
        lyrics: 'And all along I believed...',
        chords: 'Gm | D# | A# | F',
        bars: '8',
      },
    ],
  },
  {
    id: 'hallelujah',
    title: 'Hallelujah',
    artist: 'Leonard Cohen',
    moment: 'Assinaturas',
    key: 'E',
    originalKey: 'E',
    bpm: 66,
    status: 'Nova',
    entry: 'Começar após o primeiro documento.',
    notes: 'Repetir refrão duas vezes.',
    structure: 'INTRO → V1 → REF → V2 → REF → FINAL',
    previewStart: 0,
    sections: [
      { id: 'hallelujah-intro', name: 'INTRO', lyrics: '', chords: 'E | C#m | E | C#m', bars: '4' },
      {
        id: 'hallelujah-verso',
        name: 'VERSO',
        lyrics: 'Now I’ve heard there was a secret chord...',
        chords: 'E | A | E | A',
        bars: '8',
      },
      {
        id: 'hallelujah-refrao',
        name: 'REFRÃO',
        lyrics: 'Hallelujah...',
        chords: 'C#m | A | E | B',
        bars: '8',
      },
    ],
  },
]

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

/** Cria uma seção nova com cifra de exemplo. */
export function createEmptySection(name = 'NOVA SEÇÃO') {
  return { id: crypto.randomUUID(), name, lyrics: '', chords: 'C | G | Am | F', bars: '' }
}
