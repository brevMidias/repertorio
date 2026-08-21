import { normalizeSongs } from '@/lib/backup'
import type { SongMetadata } from '@/lib/types'

/**
 * Persistência offline no IndexedDB, dividida em dois registros:
 *
 * - `songs/meta`: os metadados do repertório inteiro (texto puro, poucos KB).
 * - `audio/<id>`: um `Blob` por música.
 *
 * A divisão existe por desempenho. O autosave dispara a cada digitação no editor,
 * e antes disso ele regravava os MP3 junto com o texto, o que custava megabytes
 * por tecla. Agora o áudio só é escrito quando o arquivo realmente muda.
 */

const DB_NAME = 'prime-offline'
const DB_VERSION = 3
const META_STORE = 'songs'
const AUDIO_STORE = 'audio'
const SETTINGS_STORE = 'settings'
const META_KEY = 'meta'
const CLOUD_KEY = 'cloud-profile-key'
/** Registro do formato antigo, que guardava tudo junto. */
const LEGACY_KEY = 'repertorio'

export type StoredRepertoire = {
  songs: SongMetadata[]
  audio: Map<string, Blob>
}

let connection: Promise<IDBDatabase> | null = null

function isAvailable(): boolean {
  return typeof window !== 'undefined' && 'indexedDB' in window
}

function isBlob(value: unknown): value is Blob {
  if (typeof value !== 'object' || value === null) return false

  try {
    // A chamada no protótipo nativo não executa um método fornecido pelo valor.
    Blob.prototype.slice.call(value, 0, 0)
    return true
  } catch {
    return false
  }
}

function openDatabase(): Promise<IDBDatabase> {
  if (connection) return connection

  connection = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(META_STORE)) db.createObjectStore(META_STORE)
      if (!db.objectStoreNames.contains(AUDIO_STORE)) db.createObjectStore(AUDIO_STORE)
      if (!db.objectStoreNames.contains(SETTINGS_STORE)) db.createObjectStore(SETTINGS_STORE)
    }
    request.onsuccess = () => {
      // Se outra aba pedir uma versão maior, soltamos a conexão para não travá-la.
      request.result.onversionchange = () => {
        request.result.close()
        connection = null
      }
      resolve(request.result)
    }
    request.onerror = () => reject(request.error)
    request.onblocked = () => reject(new Error('IndexedDB bloqueado por outra aba aberta.'))
  })

  // Uma falha de abertura não pode envenenar as chamadas seguintes.
  connection.catch(() => {
    connection = null
  })

  return connection
}

function toPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function whenDone(transaction: IDBTransaction): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
    transaction.onabort = () => reject(transaction.error)
  })
}

async function readValue<T>(store: string, key: string): Promise<T | undefined> {
  const db = await openDatabase()
  return toPromise<T | undefined>(db.transaction(store, 'readonly').objectStore(store).get(key))
}

/** `get()` sozinho não distingue chave ausente de valor `undefined` armazenado. */
async function readEntry<T>(store: string, key: string): Promise<{ exists: boolean; value?: T }> {
  const db = await openDatabase()
  const transaction = db.transaction(store, 'readonly')
  const objectStore = transaction.objectStore(store)
  const [count, value] = await Promise.all([
    toPromise(objectStore.count(key)),
    toPromise<T | undefined>(objectStore.get(key)),
  ])
  return { exists: count > 0, value }
}

/**
 * Converte o registro antigo, que trazia os blobs embutidos, para o formato novo.
 * Roda uma única vez por dispositivo.
 */
async function migrateLegacyRecord(legacy: readonly unknown[]): Promise<StoredRepertoire> {
  const audio = new Map<string, Blob>()

  for (const entry of legacy) {
    if (typeof entry !== 'object' || entry === null) continue
    const record = entry as { id?: unknown; audioBlob?: unknown }
    if (typeof record.id === 'string' && isBlob(record.audioBlob)) {
      audio.set(record.id, record.audioBlob)
    }
  }

  const songs = normalizeSongs(legacy)
  const db = await openDatabase()
  const transaction = db.transaction([META_STORE, AUDIO_STORE], 'readwrite')
  const completed = whenDone(transaction)

  try {
    const metadataStore = transaction.objectStore(META_STORE)
    const audioStore = transaction.objectStore(AUDIO_STORE)
    metadataStore.put(songs, META_KEY)
    for (const [id, blob] of audio) audioStore.put(blob, id)
    metadataStore.delete(LEGACY_KEY)
  } catch (error) {
    try {
      transaction.abort()
    } catch {
      // A transação pode já ter sido abortada pela operação que falhou.
    }
    await completed.catch(() => undefined)
    throw error
  }

  await completed

  return { songs, audio }
}

async function readAudioMap(ids: readonly string[]): Promise<Map<string, Blob>> {
  const audio = new Map<string, Blob>()
  if (ids.length === 0) return audio

  const db = await openDatabase()
  const store = db.transaction(AUDIO_STORE, 'readonly').objectStore(AUDIO_STORE)
  const entries = await Promise.all(
    ids.map(async (id) => [id, await toPromise<unknown>(store.get(id))] as const),
  )

  for (const [id, blob] of entries) {
    if (isBlob(blob)) audio.set(id, blob)
  }
  return audio
}

/** Lê o repertório salvo, já com os áudios correspondentes. */
export async function loadRepertoire(): Promise<StoredRepertoire | null> {
  if (!isAvailable()) return null

  const current = await readEntry<unknown>(META_STORE, META_KEY)
  if (current.exists) {
    if (!Array.isArray(current.value)) {
      throw new Error('Metadados atuais do repertório estão corrompidos.')
    }

    const metadata = current.value as SongMetadata[]
    return { songs: metadata, audio: await readAudioMap(metadata.map((song) => song.id)) }
  }

  const legacy = await readValue<unknown>(META_STORE, LEGACY_KEY)
  if (Array.isArray(legacy) && legacy.length > 0) return migrateLegacyRecord(legacy)
  return null
}

/** Grava apenas os metadados. É a escrita do autosave. */
export async function saveMetadata(songs: readonly SongMetadata[]): Promise<void> {
  if (!isAvailable()) return
  const db = await openDatabase()
  const transaction = db.transaction(META_STORE, 'readwrite')
  transaction.objectStore(META_STORE).put([...songs], META_KEY)
  return whenDone(transaction)
}

/**
 * Substitui o repertório importado e descarta todos os áudios anteriores como
 * uma única unidade. Uma gravação de áudio iniciada depois fica enfileirada pelo
 * IndexedDB e, portanto, sobrevive à limpeza da importação.
 */
export async function replaceRepertoire(
  songs: readonly SongMetadata[],
  audio: ReadonlyMap<string, Blob> = new Map(),
): Promise<void> {
  if (!isAvailable()) return
  const db = await openDatabase()
  const transaction = db.transaction([META_STORE, AUDIO_STORE], 'readwrite')
  transaction.objectStore(META_STORE).put([...songs], META_KEY)
  const audioStore = transaction.objectStore(AUDIO_STORE)
  audioStore.clear()
  for (const [id, blob] of audio) audioStore.put(blob, id)
  return whenDone(transaction)
}

export async function loadCloudKey(): Promise<string | null> {
  if (!isAvailable()) return null
  const value = await readValue<unknown>(SETTINGS_STORE, CLOUD_KEY)
  return typeof value === 'string' ? value : null
}

export async function saveCloudKey(cloudKey: string): Promise<void> {
  if (!isAvailable()) return
  const db = await openDatabase()
  const transaction = db.transaction(SETTINGS_STORE, 'readwrite')
  transaction.objectStore(SETTINGS_STORE).put(cloudKey, CLOUD_KEY)
  return whenDone(transaction)
}

/** Grava o áudio de uma música. Chamado só quando o arquivo muda. */
export async function saveAudio(id: string, blob: Blob): Promise<void> {
  if (!isAvailable()) return
  const db = await openDatabase()
  const transaction = db.transaction(AUDIO_STORE, 'readwrite')
  transaction.objectStore(AUDIO_STORE).put(blob, id)
  return whenDone(transaction)
}

export async function loadAudio(id: string): Promise<Blob | null> {
  if (!isAvailable()) return null
  const blob = await readValue<unknown>(AUDIO_STORE, id)
  return isBlob(blob) ? blob : null
}

export async function deleteAudio(id: string): Promise<void> {
  if (!isAvailable()) return
  const db = await openDatabase()
  const transaction = db.transaction(AUDIO_STORE, 'readwrite')
  transaction.objectStore(AUDIO_STORE).delete(id)
  return whenDone(transaction)
}

/** Remove áudios de músicas que não existem mais, liberando espaço. */
export async function deleteOrphanAudio(keepIds: readonly string[]): Promise<number> {
  if (!isAvailable()) return 0
  const db = await openDatabase()

  const keys = await toPromise<IDBValidKey[]>(
    db.transaction(AUDIO_STORE, 'readonly').objectStore(AUDIO_STORE).getAllKeys(),
  )
  const orphans = keys.filter((key) => typeof key === 'string' && !keepIds.includes(key))
  if (orphans.length === 0) return 0

  const transaction = db.transaction(AUDIO_STORE, 'readwrite')
  const store = transaction.objectStore(AUDIO_STORE)
  for (const key of orphans) store.delete(key)
  await whenDone(transaction)

  return orphans.length
}

/** Apaga tudo, voltando ao estado de primeira abertura. */
export async function clearRepertoire(): Promise<void> {
  if (!isAvailable()) return
  const db = await openDatabase()
  const transaction = db.transaction([META_STORE, AUDIO_STORE], 'readwrite')
  transaction.objectStore(META_STORE).clear()
  transaction.objectStore(AUDIO_STORE).clear()
  return whenDone(transaction)
}
