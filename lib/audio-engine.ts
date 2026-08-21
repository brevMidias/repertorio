/**
 * Motor de áudio da prévia.
 *
 * O objetivo é um só: o toque no play precisa soar imediatamente. Um
 * `<audio>` apontando para uma object URL parece local, mas ainda passa pelo
 * pipeline de mídia do navegador (abrir a fonte, decodificar, encher o buffer)
 * e, em iOS, nem começa a carregar antes do primeiro gesto. Por isso o arquivo é
 * decodificado para `AudioBuffer` **antes** do toque e disparado pela Web Audio
 * API, onde `start()` é sincrono e a latência fica na casa de poucos
 * milissegundos.
 *
 * Duas consequências que moldam o resto do código:
 *
 * 1. `AudioBuffer` é PCM cru e ocupa muita memória, então o cache é limitado.
 * 2. O `AudioContext` nasce suspenso pela política de autoplay, então precisa de
 *    um `resume()` dentro de um gesto do usuário — daí a existência de
 *    `warmUpAudio()`.
 */

/** Rampa curta aplicada ao parar, para não estalar no meio da onda. */
const FADE_SECONDS = 0.012

type ActiveTrack = {
  id: string
  source: AudioBufferSourceNode
  gain: GainNode
  /** Instante do contexto em que o disparo aconteceu. */
  startedAt: number
  /** Segundo do arquivo em que o disparo começou. */
  offset: number
}

let context: AudioContext | null = null
let active: ActiveTrack | null = null

const buffers = new Map<string, AudioBuffer>()
const decoding = new Map<string, Promise<AudioBuffer | null>>()
const decodeTokens = new Map<string, object>()

function isSupported(): boolean {
  return typeof window !== 'undefined' && typeof AudioContext !== 'undefined'
}

/** Cria o contexto sob demanda, pedindo a menor latência disponível. */
export function getAudioContext(): AudioContext | null {
  if (!isSupported()) return null
  if (!context) context = new AudioContext({ latencyHint: 'interactive' })
  return context
}

/**
 * Sai do estado suspenso. Precisa ser chamado durante um gesto do usuário,
 * senão o navegador ignora. Chamar mais de uma vez é inofensivo.
 */
export async function warmUpAudio(): Promise<boolean> {
  const ctx = getAudioContext()
  if (!ctx) return false

  if (ctx.state === 'suspended') {
    try {
      await ctx.resume()
    } catch {
      return false
    }
  }

  return ctx.state === 'running'
}

export function isAudioReady(id: string): boolean {
  return buffers.has(id)
}

export function decodedDuration(id: string): number | undefined {
  return buffers.get(id)?.duration
}

/**
 * Decodifica o áudio e guarda o resultado. Chamadas repetidas para o mesmo id
 * compartilham a mesma decodificação em andamento.
 */
export function prepareTrack(id: string, blob: Blob): Promise<AudioBuffer | null> {
  const cached = buffers.get(id)
  if (cached) return Promise.resolve(cached)

  const inFlight = decoding.get(id)
  if (inFlight) return inFlight

  const ctx = getAudioContext()
  if (!ctx) return Promise.resolve(null)

  const token = {}
  const task = blob
    .arrayBuffer()
    .then((data) => ctx.decodeAudioData(data))
    .then((buffer) => {
      if (decodeTokens.get(id) === token) buffers.set(id, buffer)
      return buffer
    })
    .catch(() => null)
    .finally(() => {
      if (decodeTokens.get(id) !== token) return
      decoding.delete(id)
      decodeTokens.delete(id)
    })

  decodeTokens.set(id, token)
  decoding.set(id, task)
  return task
}

/** Descarta o buffer de uma faixa, usado quando o arquivo de áudio muda. */
export function releaseTrack(id: string): void {
  if (active?.id === id) stopTrack()
  buffers.delete(id)
  decoding.delete(id)
  decodeTokens.delete(id)
}

/** Descarta buffers fora da lista e interrompe a faixa ativa se ela saiu da janela. */
export function releaseTracksExcept(keepIds: readonly string[]): void {
  if (active && !keepIds.includes(active.id)) stopTrack()

  const knownIds = new Set([...buffers.keys(), ...decoding.keys()])
  for (const id of knownIds) {
    if (keepIds.includes(id)) continue
    buffers.delete(id)
    decoding.delete(id)
    decodeTokens.delete(id)
  }
}

/**
 * Dispara a faixa já decodificada. Síncrono de propósito: nada de `await` entre
 * o toque do usuário e o som.
 *
 * @returns `false` quando o buffer ainda não existe ou o contexto está suspenso,
 *   caso em que o chamador deve preparar e tentar de novo.
 */
export function playTrack(id: string, offset: number, onEnded: () => void): boolean {
  const ctx = context
  const buffer = buffers.get(id)
  if (!ctx || !buffer || ctx.state !== 'running') return false

  stopTrack()

  const gain = ctx.createGain()
  gain.connect(ctx.destination)

  const source = ctx.createBufferSource()
  source.buffer = buffer
  source.connect(gain)

  const safeOffset = Math.min(Math.max(offset, 0), Math.max(buffer.duration - 0.05, 0))
  source.onended = () => {
    if (active?.source !== source) return
    active = null
    source.disconnect()
    gain.disconnect()
    onEnded()
  }

  source.start(0, safeOffset)
  active = { id, source, gain, startedAt: ctx.currentTime, offset: safeOffset }
  return true
}

/**
 * Interrompe a faixa atual com uma rampa curtíssima.
 *
 * @returns o segundo do arquivo em que a reprodução parou, para retomar depois.
 */
export function stopTrack(): number {
  const ctx = context
  if (!active || !ctx) return 0

  const { source, gain, startedAt, offset } = active
  const position = offset + (ctx.currentTime - startedAt)
  active = null
  source.onended = null

  const now = ctx.currentTime
  try {
    gain.gain.setValueAtTime(gain.gain.value, now)
    gain.gain.linearRampToValueAtTime(0, now + FADE_SECONDS)
    source.stop(now + FADE_SECONDS + 0.002)
  } catch {
    // A fonte já pode ter terminado sozinha; nesse caso não há o que parar.
  }

  window.setTimeout(() => {
    source.disconnect()
    gain.disconnect()
  }, 200)

  return position
}

/** Posição atual da faixa tocando, em segundos. */
export function trackPosition(): number {
  const ctx = context
  if (!active || !ctx) return 0
  return active.offset + (ctx.currentTime - active.startedAt)
}

export function activeTrackId(): string | null {
  return active?.id ?? null
}

/** Esquece tudo. Usado quando o repertório inteiro é substituído. */
export function resetAudioEngine(): void {
  stopTrack()
  buffers.clear()
  decoding.clear()
  decodeTokens.clear()
}
