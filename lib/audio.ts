import type { Song, SongMetadata } from '@/lib/types'

/**
 * Object URLs de áudio só valem dentro da sessão que os criou. Por isso o `Blob`
 * é o que vai para o IndexedDB e a URL é sempre recriada na leitura.
 */

export function blobToUrl(blob?: Blob | null): string | undefined {
  return blob ? URL.createObjectURL(blob) : undefined
}

export function revokeUrl(url?: string): void {
  if (url?.startsWith('blob:')) URL.revokeObjectURL(url)
}

/** Separa a parte serializável da música, descartando blob e URL temporária. */
export function toMetadata(song: Song): SongMetadata {
  const { audioBlob: _audioBlob, audioUrl: _audioUrl, ...metadata } = song
  return metadata
}

/** Reconstrói a música juntando os metadados ao áudio guardado por id. */
export function withAudio(metadata: SongMetadata, blob?: Blob): Song {
  if (!blob) return metadata
  return { ...metadata, audioBlob: blob, audioUrl: blobToUrl(blob) }
}

/** Libera todas as URLs de áudio de uma lista, usado na troca de repertório. */
export function revokeAudioUrls(songs: readonly Song[]): void {
  for (const song of songs) revokeUrl(song.audioUrl)
}
