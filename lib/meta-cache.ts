import { normalizeSongs } from '@/lib/backup'
import { META_CACHE_KEY } from '@/lib/config'
import type { SongMetadata } from '@/lib/types'

/**
 * Espelho dos metadados no `localStorage`.
 *
 * O IndexedDB é a fonte de verdade, mas ele é assíncrono: entre a montagem da
 * tela e a resposta do banco existe um intervalo em que a lista apareceria vazia
 * ou com o repertório de exemplo. O `localStorage` é síncrono, então serve bem
 * para uma primeira pintura correta.
 *
 * Só texto entra aqui. Áudio fica no IndexedDB porque a cota do `localStorage`
 * é de poucos megabytes e a escrita bloqueia a thread principal.
 */

/** Leitura síncrona. Devolve `null` quando não há espelho utilizável. */
export function readMetaCache(): SongMetadata[] | null {
  if (typeof window === 'undefined') return null

  try {
    const raw = window.localStorage.getItem(META_CACHE_KEY)
    if (!raw) return null

    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return null

    return normalizeSongs(parsed)
  } catch {
    return null
  }
}

/** Atualiza o espelho. Falhar aqui é aceitável: o IndexedDB continua correto. */
export function writeMetaCache(songs: readonly SongMetadata[]): void {
  if (typeof window === 'undefined') return

  try {
    window.localStorage.setItem(META_CACHE_KEY, JSON.stringify(normalizeSongs(songs)))
  } catch {
    // Cota estourada ou modo privado. O espelho é só um atalho de leitura.
  }
}

export function clearMetaCache(): void {
  if (typeof window === 'undefined') return

  try {
    window.localStorage.removeItem(META_CACHE_KEY)
  } catch {
    // Nada a fazer: o espelho é descartável.
  }
}
