import { Blob as NodeBlob } from 'node:buffer'
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { RepertoireApp } from '@/components/repertoire-app'
import { SongEditor } from '@/components/song-editor'
import { useSongs } from '@/hooks/use-songs'
import { LEGACY_STORAGE_KEY } from '@/lib/config'
import { clearRepertoire, loadAudio, loadRepertoire, saveAudio, saveMetadata } from '@/lib/local-db'
import { readMetaCache, writeMetaCache } from '@/lib/meta-cache'
import type { Song, SongMetadata } from '@/lib/types'

const DB_NAME = 'prime-offline'
const META_STORE = 'songs'
const META_KEY = 'meta'

const metadata: SongMetadata = {
  id: 'song-1',
  title: 'Do IndexedDB',
  artist: 'Artista',
  moment: 'Entrada',
  key: 'C',
  originalKey: 'C',
  status: 'Pronta',
  entry: '',
  notes: '',
  structure: 'INTRO',
  sections: [],
  audioName: 'entrada.mp3',
  previewStart: 0,
}

function browserBlob(contents: string): Blob {
  return new NodeBlob([contents], { type: 'audio/mpeg' }) as unknown as Blob
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function seedCurrentMetadata(value: unknown): Promise<void> {
  const db = await requestResult(indexedDB.open(DB_NAME, 3))
  const transaction = db.transaction(META_STORE, 'readwrite')
  transaction.objectStore(META_STORE).put(value, META_KEY)
  await new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
    transaction.onabort = () => reject(transaction.error)
  })
  db.close()
}

function deferredRequest<T>() {
  let result: T
  const request = {
    get result() {
      return result
    },
    onerror: null,
    onsuccess: null as ((event: Event) => unknown) | null,
  }

  return {
    request: request as unknown as IDBRequest<T>,
    resolve(value: T) {
      result = value
      queueMicrotask(() => request.onsuccess?.(new Event('success')))
    },
  }
}

let objectUrlIndex = 0

beforeAll(() => {
  vi.stubGlobal('Blob', NodeBlob)
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    value: vi.fn(() => `blob:test-${++objectUrlIndex}`),
  })
  Object.defineProperty(URL, 'revokeObjectURL', {
    configurable: true,
    value: vi.fn(),
  })
})

afterAll(() => {
  vi.unstubAllGlobals()
})

beforeEach(async () => {
  localStorage.clear()
  await clearRepertoire()
})

afterEach(() => {
  cleanup()
})

describe('useSongs', () => {
  it('starts with an empty repertoire when this device has no saved data', async () => {
    const { result } = renderHook(() => useSongs())

    expect(result.current.songs).toEqual([])
    await waitFor(() => expect(result.current.ready).toBe(true))
    expect(result.current.songs).toEqual([])
  })

  it('paints from the synchronous cache before hydrating from IndexedDB', async () => {
    writeMetaCache([{ ...metadata, title: 'Do cache' }])
    await saveMetadata([metadata])

    const { result } = renderHook(() => useSongs())

    expect(result.current.songs[0].title).toBe('Do cache')
    await waitFor(() => expect(result.current.ready).toBe(true))
    expect(result.current.songs[0].title).toBe('Do IndexedDB')
  })

  it('blocks every mutation until IndexedDB hydration finishes, then enables them', async () => {
    const storedAudio = browserBlob('must survive hydration')
    await saveMetadata([metadata])
    await saveAudio(metadata.id, storedAudio)
    writeMetaCache([{ ...metadata, title: 'Do cache' }])

    const pendingMetadata = deferredRequest<unknown>()
    const originalGet = IDBObjectStore.prototype.get
    let hydrationReleased = false
    const get = vi
      .spyOn(IDBObjectStore.prototype, 'get')
      .mockImplementation(function (this: IDBObjectStore, query: IDBValidKey | IDBKeyRange) {
        if (this.name === META_STORE && query === META_KEY && !hydrationReleased) {
          return pendingMetadata.request
        }
        return originalGet.call(this, query)
      })

    try {
      const { result } = renderHook(() => useSongs())
      expect(result.current.ready).toBe(false)

      let blockedAdd: Song | null = null
      act(() => {
        blockedAdd = result.current.addSong()
        result.current.updateSong(metadata.id, { title: 'Edição prematura' })
        result.current.saveSong({ ...result.current.songs[0], title: 'Save prematuro' })
        result.current.removeSong(metadata.id)
        result.current.moveSong(0, 1)
        result.current.replaceAll([{ ...result.current.songs[0], title: 'Importação prematura' }])
      })

      expect(blockedAdd).toBeNull()
      expect(result.current.songs).toEqual([
        expect.objectContaining({ id: metadata.id, title: 'Do cache' }),
      ])
      expect(await (await loadAudio(metadata.id))?.text()).toBe('must survive hydration')

      hydrationReleased = true
      pendingMetadata.resolve([metadata])
      await waitFor(() => expect(result.current.ready).toBe(true))
      expect(result.current.songs[0].title).toBe('Do IndexedDB')
      expect(await result.current.songs[0].audioBlob?.text()).toBe('must survive hydration')

      let created: Song | null = null
      act(() => {
        created = result.current.addSong()
      })
      expect(created).not.toBeNull()
      act(() => {
        result.current.updateSong(created!.id, { title: 'Edição liberada' })
      })
      expect(result.current.songs.at(-1)?.title).toBe('Edição liberada')

      act(() => {
        result.current.replaceAll([{ ...metadata, title: 'Importação liberada' }])
      })
      expect(result.current.songs).toEqual([
        expect.objectContaining({ title: 'Importação liberada' }),
      ])
      await waitFor(async () => {
        expect((await loadRepertoire())?.songs[0].title).toBe('Importação liberada')
      })
    } finally {
      hydrationReleased = true
      pendingMetadata.resolve([metadata])
      get.mockRestore()
    }
  })

  it('edits text without rewriting an unchanged audio Blob', async () => {
    const originalAudio = browserBlob('original bytes')
    await saveMetadata([metadata])
    await saveAudio(metadata.id, originalAudio)
    const originalPut = IDBObjectStore.prototype.put
    let audioWrites = 0
    const put = vi
      .spyOn(IDBObjectStore.prototype, 'put')
      .mockImplementation(function (this: IDBObjectStore, value: unknown, key?: IDBValidKey) {
        if (this.name === 'audio') audioWrites += 1
        return originalPut.call(this, value, key)
      })

    try {
      const { result } = renderHook(() => useSongs())
      await waitFor(() => expect(result.current.ready).toBe(true))

      act(() => {
        result.current.saveSong({ ...result.current.songs[0], title: 'Texto editado' })
      })

      expect(result.current.songs[0].title).toBe('Texto editado')
      expect(await (await loadAudio(metadata.id))?.text()).toBe('original bytes')
      await waitFor(async () => {
        expect((await loadRepertoire())?.songs[0].title).toBe('Texto editado')
      })
      expect(audioWrites).toBe(0)
    } finally {
      put.mockRestore()
    }
  })

  it('stores a replacement audio Blob exactly once', async () => {
    await saveMetadata([metadata])
    await saveAudio(metadata.id, browserBlob('old bytes'))
    const originalPut = IDBObjectStore.prototype.put
    let audioWrites = 0
    const put = vi
      .spyOn(IDBObjectStore.prototype, 'put')
      .mockImplementation(function (this: IDBObjectStore, value: unknown, key?: IDBValidKey) {
        if (this.name === 'audio') audioWrites += 1
        return originalPut.call(this, value, key)
      })

    try {
      const { result } = renderHook(() => useSongs())
      await waitFor(() => expect(result.current.ready).toBe(true))
      const replacement = browserBlob('new bytes')

      act(() => {
        result.current.saveSong({
          ...result.current.songs[0],
          audioBlob: replacement,
          audioUrl: 'blob:replacement',
        })
      })

      await waitFor(async () => {
        expect(await (await loadAudio(metadata.id))?.text()).toBe('new bytes')
      })
      expect(audioWrites).toBe(1)
    } finally {
      put.mockRestore()
    }
  })

  it('keeps restored cloud audio when replacing the whole repertoire', async () => {
    await saveMetadata([metadata])
    const { result } = renderHook(() => useSongs())
    await waitFor(() => expect(result.current.ready).toBe(true))
    const restored = browserBlob('restored cloud bytes')

    act(() => {
      result.current.restoreAll([{
        ...result.current.songs[0],
        title: 'Da nuvem',
        audioBlob: restored,
        audioUrl: 'blob:restored',
      }])
    })

    await waitFor(async () => {
      expect(await (await loadAudio(metadata.id))?.text()).toBe('restored cloud bytes')
    })
    expect(result.current.songs[0]).toEqual(expect.objectContaining({
      title: 'Da nuvem',
      audioBlob: restored,
    }))
  })

  it('does not let an older autosave delete audio attached after it started', async () => {
    await saveMetadata([metadata])
    const originalGetAllKeys = IDBObjectStore.prototype.getAllKeys
    const cleanup = {
      pending: null as ReturnType<typeof deferredRequest<IDBValidKey[]>> | null,
    }
    const getAllKeys = vi
      .spyOn(IDBObjectStore.prototype, 'getAllKeys')
      .mockImplementation(function (this: IDBObjectStore, query?: IDBValidKey | IDBKeyRange | null) {
        if (this.name !== 'audio') return originalGetAllKeys.call(this, query)
        cleanup.pending ??= deferredRequest<IDBValidKey[]>()
        return cleanup.pending.request
      })

    try {
      const { result } = renderHook(() => useSongs())
      await waitFor(() => expect(result.current.ready).toBe(true))
      await waitFor(() => expect(readMetaCache()?.[0].id).toBe(metadata.id))
      await new Promise((resolve) => window.setTimeout(resolve, 50))

      let added!: Song | null
      act(() => {
        added = result.current.addSong()
      })
      expect(added).not.toBeNull()
      if (!added) throw new Error('A adição deveria estar liberada depois da hidratação.')
      const addedSong = added
      act(() => {
        result.current.saveSong({
          ...addedSong,
          audioBlob: browserBlob('new attachment'),
          audioUrl: 'blob:new-attachment',
        })
      })
      await waitFor(async () => {
        expect(await (await loadAudio(addedSong.id))?.text()).toBe('new attachment')
      })

      cleanup.pending?.resolve([addedSong.id])
      await new Promise((resolve) => window.setTimeout(resolve, 50))

      expect(await (await loadAudio(addedSong.id))?.text()).toBe('new attachment')
    } finally {
      cleanup.pending?.resolve([])
      getAllKeys.mockRestore()
    }
  })

  it('removes the stored audio when its song is deleted', async () => {
    await saveMetadata([metadata])
    await saveAudio(metadata.id, browserBlob('delete me'))
    const { result } = renderHook(() => useSongs())
    await waitFor(() => expect(result.current.ready).toBe(true))

    act(() => result.current.removeSong(metadata.id))

    expect(result.current.songs).toEqual([])
    await waitFor(async () => expect(await loadAudio(metadata.id)).toBeNull())
  })

  it('persists an empty repertoire and does not revive seed or legacy on reopen', async () => {
    await saveMetadata([metadata])
    const first = renderHook(() => useSongs())
    await waitFor(() => expect(first.result.current.ready).toBe(true))

    act(() => first.result.current.removeSong(metadata.id))
    await waitFor(async () => expect((await loadRepertoire())?.songs).toEqual([]))
    await waitFor(() => expect(readMetaCache()).toEqual([]))
    first.unmount()

    localStorage.setItem(
      LEGACY_STORAGE_KEY,
      JSON.stringify([{ ...metadata, id: 'legacy', title: 'Não deve voltar' }]),
    )
    const second = renderHook(() => useSongs())

    expect(second.result.current.songs).toEqual([])
    await waitFor(() => expect(second.result.current.ready).toBe(true))
    expect(second.result.current.songs).toEqual([])
    expect(localStorage.getItem(LEGACY_STORAGE_KEY)).not.toBeNull()
  })

  it('keeps legacy data and in-memory songs when migration persistence fails', async () => {
    localStorage.setItem(
      LEGACY_STORAGE_KEY,
      JSON.stringify([{ ...metadata, title: 'Do legado', bpm: -20 }]),
    )
    const originalPut = IDBObjectStore.prototype.put
    const put = vi
      .spyOn(IDBObjectStore.prototype, 'put')
      .mockImplementation(function (this: IDBObjectStore, value: unknown, key?: IDBValidKey) {
        const request = originalPut.call(this, value, key)
        if (this.name === 'songs' && key === 'meta') this.transaction.abort()
        return request
      })

    try {
      const { result } = renderHook(() => useSongs())
      await waitFor(() => expect(result.current.ready).toBe(true))

      expect(result.current.songs[0]).toEqual(
        expect.objectContaining({ title: 'Do legado' }),
      )
      expect(result.current.songs[0]).not.toHaveProperty('bpm')
      expect(localStorage.getItem(LEGACY_STORAGE_KEY)).not.toBeNull()
      expect(result.current.storageError).toMatch(/não foi possível/i)
    } finally {
      put.mockRestore()
    }
  })

  it('keeps cached state and local legacy when current IndexedDB metadata is corrupt', async () => {
    writeMetaCache([{ ...metadata, title: 'Cache preservado' }])
    localStorage.setItem(
      LEGACY_STORAGE_KEY,
      JSON.stringify([{ ...metadata, id: 'legacy', title: 'Legado não deve voltar' }]),
    )
    await seedCurrentMetadata({ corrupt: true })

    const { result } = renderHook(() => useSongs())

    expect(result.current.songs[0].title).toBe('Cache preservado')
    await waitFor(() => expect(result.current.ready).toBe(true))
    expect(result.current.songs[0].title).toBe('Cache preservado')
    expect(result.current.storageError).toMatch(/não foi possível/i)
    expect(localStorage.getItem(LEGACY_STORAGE_KEY)).not.toBeNull()
  })

  it('removes legacy localStorage only after normalized metadata is stored', async () => {
    localStorage.setItem(
      LEGACY_STORAGE_KEY,
      JSON.stringify([{ ...metadata, title: 'Migrada', previewStart: -3 }]),
    )
    const { result } = renderHook(() => useSongs())

    await waitFor(() => expect(result.current.ready).toBe(true))

    expect(localStorage.getItem(LEGACY_STORAGE_KEY)).toBeNull()
    expect(result.current.songs[0].previewStart).toBe(0)
    expect((await loadRepertoire())?.songs[0]).toEqual(
      expect.objectContaining({ title: 'Migrada', previewStart: 0 }),
    )
  })

  it('replaces metadata atomically so audio attached immediately afterward survives', async () => {
    await saveMetadata([metadata])
    await saveAudio(metadata.id, browserBlob('keep bytes'))
    await saveAudio('orphan', browserBlob('orphan bytes'))
    const { result } = renderHook(() => useSongs())
    await waitFor(() => expect(result.current.ready).toBe(true))

    act(() => {
      result.current.replaceAll([
        {
          ...result.current.songs[0],
          title: 'Importada',
          audioBlob: browserBlob('must not be imported'),
          audioUrl: 'blob:imported',
        },
      ])
    })
    const reattaching = saveAudio(metadata.id, browserBlob('reattached bytes'))
    await reattaching

    await waitFor(async () => {
      expect((await loadRepertoire())?.songs[0].title).toBe('Importada')
      expect(await loadAudio('orphan')).toBeNull()
      expect(await (await loadAudio(metadata.id))?.text()).toBe('reattached bytes')
    })
    expect(result.current.songs[0].audioBlob).toBeUndefined()
    expect(result.current.songs[0].audioUrl).toBeUndefined()
  })
})

describe('controller integration', () => {
  it('exposes loading feedback and disables add and edit until hydration completes', async () => {
    await saveMetadata([metadata])
    writeMetaCache([{ ...metadata, title: 'Do cache' }])

    const pendingMetadata = deferredRequest<unknown>()
    const originalGet = IDBObjectStore.prototype.get
    let hydrationReleased = false
    const get = vi
      .spyOn(IDBObjectStore.prototype, 'get')
      .mockImplementation(function (this: IDBObjectStore, query: IDBValidKey | IDBKeyRange) {
        if (this.name === META_STORE && query === META_KEY && !hydrationReleased) {
          return pendingMetadata.request
        }
        return originalGet.call(this, query)
      })

    try {
      render(<RepertoireApp />)
      const loading = screen.getByRole('status', { name: /carregando repertório/i })
      expect(loading.getAttribute('aria-live')).toBe('polite')

      const add = screen.getByRole('button', { name: 'Nova música' }) as HTMLButtonElement
      const edit = screen.getByRole('button', { name: /editar do cache/i }) as HTMLButtonElement
      expect(add.disabled).toBe(true)
      expect(edit.disabled).toBe(true)
      fireEvent.click(add)
      fireEvent.click(edit)
      expect(screen.queryByRole('dialog')).toBeNull()

      hydrationReleased = true
      pendingMetadata.resolve([metadata])
      await waitFor(() => expect(
        screen.queryByRole('status', { name: /carregando repertório/i }),
      ).toBeNull())

      const enabledAdd = screen.getByRole('button', { name: 'Nova música' }) as HTMLButtonElement
      expect(enabledAdd.disabled).toBe(false)
      fireEvent.click(enabledAdd)
      expect(screen.getByRole('dialog')).toBeTruthy()
    } finally {
      hydrationReleased = true
      pendingMetadata.resolve([metadata])
      get.mockRestore()
    }
  })

  it('rejects a non-audio attachment and keeps the editor open with clear feedback', () => {
    const onSave = vi.fn()
    render(
      <SongEditor
        song={metadata as Song}
        onClose={vi.fn()}
        onSave={onSave}
        onDelete={vi.fn()}
      />,
    )

    const input = screen.getByLabelText('Áudio de referência')
    fireEvent.change(input, {
      target: { files: [new File(['not audio'], 'notas.txt', { type: 'text/plain' })] },
    })

    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(screen.getByRole('status').textContent).toMatch(/selecione um arquivo de áudio/i)
    expect(onSave).not.toHaveBeenCalled()
  })

  it('warms up audio in the same click that opens the stage', async () => {
    await saveMetadata([metadata])
    const resume = vi.fn(async () => undefined)
    class AudioContextStub {
      state: AudioContextState = 'suspended'
      resume = resume
    }
    vi.stubGlobal('AudioContext', AudioContextStub)

    render(<RepertoireApp />)
    fireEvent.click(await screen.findByRole('button', { name: /abrir do indexeddb no modo palco/i }))

    expect(resume).toHaveBeenCalledTimes(1)
    expect(await screen.findByText('Do IndexedDB')).toBeTruthy()
  })

  it('shows persistence failures in a status region without discarding legacy state', async () => {
    localStorage.setItem(
      LEGACY_STORAGE_KEY,
      JSON.stringify([{ ...metadata, title: 'Visível após falha' }]),
    )
    const originalPut = IDBObjectStore.prototype.put
    const put = vi
      .spyOn(IDBObjectStore.prototype, 'put')
      .mockImplementation(function (this: IDBObjectStore, value: unknown, key?: IDBValidKey) {
        const request = originalPut.call(this, value, key)
        if (this.name === 'songs' && key === 'meta') this.transaction.abort()
        return request
      })

    try {
      render(<RepertoireApp />)

      expect(await screen.findByText('Visível após falha')).toBeTruthy()
      const errorStatus = await screen.findByText(/não foi possível salvar/i)
      expect(errorStatus.getAttribute('role')).toBe('status')
      expect(localStorage.getItem(LEGACY_STORAGE_KEY)).not.toBeNull()
    } finally {
      put.mockRestore()
    }
  })
})
