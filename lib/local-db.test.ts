import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { Blob as NodeBlob } from 'node:buffer'

import {
  clearRepertoire,
  deleteOrphanAudio,
  loadCloudKey,
  loadAudio,
  loadRepertoire,
  replaceRepertoire,
  saveAudio,
  saveCloudKey,
  saveMetadata,
} from '@/lib/local-db'
import type { SongMetadata } from '@/lib/types'

const DB_NAME = 'prime-offline'
const META_STORE = 'songs'
const AUDIO_STORE = 'audio'
const META_KEY = 'meta'
const LEGACY_KEY = 'repertorio'

const metadata: SongMetadata = {
  id: 'song-1',
  title: 'Canção de teste',
  artist: 'Artista de teste',
  moment: 'Entrada',
  key: 'C',
  originalKey: 'C',
  bpm: 72,
  status: 'Pronta',
  entry: 'Violão',
  notes: 'Nota de teste',
  structure: 'Verso, refrão',
  sections: [],
  audioName: 'referencia.mp3',
  audioDuration: 12,
  previewStart: 3,
}

function asBrowserBlob(blob: NodeBlob): Blob {
  return blob as unknown as Blob
}

const mp3 = asBrowserBlob(new NodeBlob(['mp3 bytes'], { type: 'audio/mpeg' }))

beforeAll(() => {
  vi.stubGlobal('Blob', NodeBlob)
})

afterAll(() => {
  vi.unstubAllGlobals()
})

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
    transaction.onabort = () => reject(transaction.error)
  })
}

function successfulRequest<T>(value: T): IDBRequest<T> {
  const request = {
    result: value,
    onerror: null,
    onsuccess: null as ((event: Event) => unknown) | null,
  }

  queueMicrotask(() => request.onsuccess?.(new Event('success')))
  return request as unknown as IDBRequest<T>
}

async function seedLegacyRecord(legacy: unknown[]): Promise<void> {
  const db = await requestResult(indexedDB.open(DB_NAME, 3))
  const transaction = db.transaction(META_STORE, 'readwrite')
  transaction.objectStore(META_STORE).put(legacy, LEGACY_KEY)
  await transactionDone(transaction)
  db.close()
}

async function seedCurrentRecord(value: unknown): Promise<void> {
  const db = await requestResult(indexedDB.open(DB_NAME, 3))
  const transaction = db.transaction(META_STORE, 'readwrite')
  transaction.objectStore(META_STORE).put(value, META_KEY)
  await transactionDone(transaction)
  db.close()
}

async function countStoredKey(store: string, key: string): Promise<number> {
  const db = await requestResult(indexedDB.open(DB_NAME, 3))
  const transaction = db.transaction(store, 'readonly')
  const count = await requestResult(transaction.objectStore(store).count(key))
  await transactionDone(transaction)
  db.close()
  return count
}

async function readStoredValue<T>(store: string, key: string): Promise<T | undefined> {
  const db = await requestResult(indexedDB.open(DB_NAME, 3))
  const transaction = db.transaction(store, 'readonly')
  const value = await requestResult(transaction.objectStore(store).get(key))
  await transactionDone(transaction)
  db.close()
  return value as T | undefined
}

afterEach(async () => {
  await clearRepertoire()
})

describe('offline repertoire database', () => {
  it('loads metadata and the matching MP3 from separate stores', async () => {
    await saveMetadata([metadata])
    await saveAudio(metadata.id, mp3)

    const stored = await loadRepertoire()

    expect(stored?.songs).toEqual([metadata])
    expect(await stored?.audio.get(metadata.id)?.text()).toBe('mp3 bytes')
  })

  it('does not rewrite or remove audio when metadata changes', async () => {
    await saveAudio(metadata.id, mp3)
    await saveMetadata([{ ...metadata, title: 'Título editado' }])

    expect(await (await loadAudio(metadata.id))?.text()).toBe('mp3 bytes')
  })

  it('loads a stored empty repertoire instead of treating it as absent', async () => {
    await saveMetadata([])

    const stored = await loadRepertoire()

    expect(stored).not.toBeNull()
    expect(stored?.songs).toEqual([])
    expect(stored?.audio.size).toBe(0)
  })

  it('prefers current empty metadata over a residual legacy record', async () => {
    await saveMetadata([])
    await seedLegacyRecord([{ ...metadata, id: 'legacy-song', audioBlob: mp3 }])

    const stored = await loadRepertoire()

    expect(stored?.songs).toEqual([])
    expect(stored?.audio.size).toBe(0)
    const legacy = await readStoredValue<Array<{ id: string }>>(META_STORE, LEGACY_KEY)
    expect(legacy?.[0].id).toBe('legacy-song')
  })

  it('rejects a present undefined current record without migrating legacy', async () => {
    await seedCurrentRecord(undefined)
    await seedLegacyRecord([{ ...metadata, id: 'legacy-song', audioBlob: mp3 }])

    await expect(loadRepertoire()).rejects.toThrow(/corrompido/i)

    expect(await countStoredKey(META_STORE, META_KEY)).toBe(1)
    const legacy = await readStoredValue<Array<{ id: string }>>(META_STORE, LEGACY_KEY)
    expect(legacy?.[0].id).toBe('legacy-song')
    expect(await loadAudio('legacy-song')).toBeNull()
  })

  it('atomically replaces metadata before a later audio attachment', async () => {
    await saveMetadata([metadata])
    await saveAudio('old-only', asBrowserBlob(new NodeBlob(['old audio'])))

    const replacing = replaceRepertoire([{ ...metadata, title: 'Importada' }])
    const reattaching = saveAudio(metadata.id, asBrowserBlob(new NodeBlob(['new audio'])))
    await Promise.all([replacing, reattaching])

    expect((await loadRepertoire())?.songs[0].title).toBe('Importada')
    expect(await loadAudio('old-only')).toBeNull()
    expect(await (await loadAudio(metadata.id))?.text()).toBe('new audio')
  })

  it('atomically restores metadata and its matching cloud audio', async () => {
    const restored = asBrowserBlob(new NodeBlob(['restored audio'], { type: 'audio/mpeg' }))

    await replaceRepertoire([{ ...metadata, title: 'Da nuvem' }], new Map([[metadata.id, restored]]))

    const stored = await loadRepertoire()
    expect(stored?.songs[0].title).toBe('Da nuvem')
    expect(await stored?.audio.get(metadata.id)?.text()).toBe('restored audio')
  })

  it('stores the private cloud profile key outside localStorage', async () => {
    const key = '0f91fd6b-c6f5-4f39-a340-f6387bce8bc8'

    await saveCloudKey(key)

    expect(await loadCloudKey()).toBe(key)
    expect(localStorage.length).toBe(0)
  })

  it('rolls metadata and audio back together when atomic replacement aborts', async () => {
    await saveMetadata([metadata])
    await saveAudio(metadata.id, mp3)
    const originalClear = IDBObjectStore.prototype.clear
    const clear = vi
      .spyOn(IDBObjectStore.prototype, 'clear')
      .mockImplementation(function (this: IDBObjectStore) {
        const request = originalClear.call(this)
        if (this.name === AUDIO_STORE) this.transaction.abort()
        return request
      })

    try {
      await expect(
        replaceRepertoire([{ ...metadata, title: 'Não pode persistir' }]),
      ).rejects.toBeDefined()
    } finally {
      clear.mockRestore()
    }

    expect((await loadRepertoire())?.songs[0].title).toBe('Canção de teste')
    expect(await (await loadAudio(metadata.id))?.text()).toBe('mp3 bytes')
  })

  it('removes only audio whose song no longer exists', async () => {
    await saveAudio('keep', asBrowserBlob(new NodeBlob(['keep'])))
    await saveAudio('orphan', asBrowserBlob(new NodeBlob(['orphan'])))

    expect(await deleteOrphanAudio(['keep'])).toBe(1)
    expect(await loadAudio('keep')).toBeInstanceOf(NodeBlob)
    expect(await loadAudio('orphan')).toBeNull()
  })

  it('does not return a tag-spoofed Blob-like object from IndexedDB', async () => {
    const originalGet = IDBObjectStore.prototype.get
    const blobLike = {
      type: 'audio/mpeg',
      size: 0,
      [Symbol.toStringTag]: 'Blob',
      slice: () => ({ [Symbol.toStringTag]: 'Blob' }),
    }
    const get = vi
      .spyOn(IDBObjectStore.prototype, 'get')
      .mockImplementation(function (this: IDBObjectStore, query: IDBValidKey | IDBKeyRange) {
      return query === 'blob-like'
        ? successfulRequest(blobLike)
        : originalGet.call(this, query)
    })

    try {
      expect(await loadAudio('blob-like')).toBeNull()
    } finally {
      get.mockRestore()
    }
  })

  it('migrates a legacy record only after metadata and MP3 are stored separately', async () => {
    await seedLegacyRecord([{ ...metadata, audioBlob: mp3 }])

    const stored = await loadRepertoire()

    expect(stored?.songs).toEqual([metadata])
    expect(await stored?.audio.get(metadata.id)?.text()).toBe('mp3 bytes')
    expect(await readStoredValue<SongMetadata[]>(META_STORE, META_KEY)).toEqual([metadata])
    expect(await (await readStoredValue<Blob>(AUDIO_STORE, metadata.id))?.text()).toBe('mp3 bytes')
    expect(await readStoredValue(META_STORE, LEGACY_KEY)).toBeUndefined()
  })

  it('rolls back the whole legacy migration and succeeds on a later retry', async () => {
    await seedLegacyRecord([{ ...metadata, audioBlob: mp3 }])

    const originalPut = IDBObjectStore.prototype.put
    const put = vi
      .spyOn(IDBObjectStore.prototype, 'put')
      .mockImplementation(function (this: IDBObjectStore, value: unknown, key?: IDBValidKey) {
      const request = originalPut.call(this, value, key)
      if (this.name === AUDIO_STORE) this.transaction.abort()
      return request
    })

    try {
      await expect(loadRepertoire()).rejects.toBeDefined()
    } finally {
      put.mockRestore()
    }

    expect(await readStoredValue<SongMetadata[]>(META_STORE, META_KEY)).toBeUndefined()
    expect(await readStoredValue(AUDIO_STORE, metadata.id)).toBeUndefined()
    const legacy = await readStoredValue<Array<{ audioBlob: Blob }>>(META_STORE, LEGACY_KEY)
    expect(await legacy?.[0].audioBlob.text()).toBe('mp3 bytes')

    const retried = await loadRepertoire()

    expect(retried?.songs).toEqual([metadata])
    expect(await retried?.audio.get(metadata.id)?.text()).toBe('mp3 bytes')
    expect(await readStoredValue<SongMetadata[]>(META_STORE, META_KEY)).toEqual([metadata])
    expect(await (await readStoredValue<Blob>(AUDIO_STORE, metadata.id))?.text()).toBe('mp3 bytes')
    expect(await readStoredValue(META_STORE, LEGACY_KEY)).toBeUndefined()
  })
})
