/** Chave do `localStorage` usada antes da migração para IndexedDB. */
export const LEGACY_STORAGE_KEY = 'prime-repertorio'

/** Chave do espelho síncrono de metadados. */
export const META_CACHE_KEY = 'prime-meta-v1'

/** Janela de espera antes de gravar, para não escrever a cada tecla digitada. */
export const AUTOSAVE_DELAY_MS = 250

/**
 * Quantas faixas ficam decodificadas em memória ao mesmo tempo.
 *
 * Um `AudioBuffer` é PCM sem compressão: três minutos em estéreo a 44,1 kHz
 * ocupam cerca de 63 MB. Manter só a música atual e a próxima deixa o toque
 * instantâneo sem transformar o app num consumidor de memória.
 */
export const MAX_DECODED_TRACKS = 2

/** Frequência de atualização do tempo decorrido no modo palco. */
export const PLAYBACK_TICK_MS = 200
