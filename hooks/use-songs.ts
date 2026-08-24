'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import { revokeAudioUrls, toMetadata, withAudio } from '@/lib/audio'
import { releaseTrack, resetAudioEngine } from '@/lib/audio-engine'
import { normalizeSongs } from '@/lib/backup'
import { AUTOSAVE_DELAY_MS, LEGACY_STORAGE_KEY } from '@/lib/config'
import {
  deleteAudio,
  loadRepertoire,
  replaceRepertoire,
  saveAudio,
  saveMetadata,
} from '@/lib/local-db'
import { readMetaCache, writeMetaCache } from '@/lib/meta-cache'
import { createEmptySong } from '@/lib/seed'
import type { Song, SongMetadata } from '@/lib/types'

const STORAGE_ERROR_MESSAGE =
  'Não foi possível salvar o repertório neste dispositivo. Suas alterações continuam abertas nesta sessão.'

export type SongsController = {
  songs: Song[]
  /** `false` até a leitura do IndexedDB terminar. Evita autosave em cima do seed. */
  ready: boolean
  /** Falhas persistentes nunca descartam a edição que já está na memória. */
  storageError: string | null
  /** Retorna `null` enquanto o IndexedDB ainda está hidratando o estado definitivo. */
  addSong: () => Song | null
  updateSong: (id: string, patch: Partial<Song>) => void
  saveSong: (song: Song) => void
  removeSong: (id: string) => void
  moveSong: (fromIndex: number, toIndex: number) => void
  replaceAll: (songs: Song[]) => void
  restoreAll: (songs: Song[]) => void
}

/** Lê e normaliza o formato antigo salvo no `localStorage`. */
function readLegacySongs(): SongMetadata[] | null {
  try {
    const raw = localStorage.getItem(LEGACY_STORAGE_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed) || parsed.length === 0) return null
    return normalizeSongs(parsed)
  } catch {
    return null
  }
}

/** Estado do repertório com espelho síncrono, hidratação e persistência separada. */
export function useSongs(): SongsController {
  const [songs, setSongs] = useState<Song[]>(() => {
    const cached = readMetaCache()
    return cached?.map((metadata) => withAudio(metadata)) ?? []
  })
  const [ready, setReady] = useState(false)
  const [storageError, setStorageError] = useState<string | null>(null)
  const songsRef = useRef(songs)
  const readyRef = useRef(false)

  const remember = useCallback((next: Song[]) => {
    songsRef.current = next
    setSongs(next)
  }, [])

  const persistInBackground = useCallback((operation: Promise<unknown>) => {
    void operation.catch(() => setStorageError(STORAGE_ERROR_MESSAGE))
  }, [])

  useEffect(() => {
    songsRef.current = songs
  }, [songs])

  useEffect(() => {
    let active = true

    const hydrate = async () => {
      try {
        const stored = await loadRepertoire()
        if (!active) return

        if (stored) {
          remember(
            stored.songs.map((metadata) => withAudio(metadata, stored.audio.get(metadata.id))),
          )
          return
        }

        const legacy = readLegacySongs()
        if (!legacy) return

        // Primeiro preserva o que o usuário já tinha na memória e no novo espelho.
        remember(legacy.map((metadata) => withAudio(metadata)))
        writeMetaCache(legacy)

        // A chave antiga só sai depois que a nova fonte de verdade confirmou a escrita.
        await saveMetadata(legacy)
        if (active) localStorage.removeItem(LEGACY_STORAGE_KEY)
      } catch {
        if (active) setStorageError(STORAGE_ERROR_MESSAGE)
      } finally {
        if (active) {
          readyRef.current = true
          setReady(true)
        }
      }
    }

    void hydrate()
    return () => {
      active = false
    }
  }, [remember])

  useEffect(() => {
    if (!ready) return
    const timer = window.setTimeout(() => {
      const metadata = songs.map(toMetadata)
      writeMetaCache(metadata)
      persistInBackground(saveMetadata(metadata))
    }, AUTOSAVE_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [persistInBackground, ready, songs])

  const addSong = useCallback(() => {
    if (!readyRef.current) return null
    const song = createEmptySong()
    remember([...songsRef.current, song])
    return song
  }, [remember])

  const updateSong = useCallback(
    (id: string, patch: Partial<Song>) => {
      if (!readyRef.current) return
      remember(
        songsRef.current.map((song) => (song.id === id ? { ...song, ...patch } : song)),
      )
    },
    [remember],
  )

  const saveSong = useCallback(
    (updated: Song) => {
      if (!readyRef.current) return
      const previous = songsRef.current.find((song) => song.id === updated.id)
      remember(songsRef.current.map((song) => (song.id === updated.id ? updated : song)))

      if (previous?.audioBlob === updated.audioBlob) return

      releaseTrack(updated.id)
      if (updated.audioBlob) {
        persistInBackground(saveAudio(updated.id, updated.audioBlob))
      } else {
        persistInBackground(deleteAudio(updated.id))
      }
    },
    [persistInBackground, remember],
  )

  const removeSong = useCallback(
    (id: string) => {
      if (!readyRef.current) return
      const removed = songsRef.current.find((song) => song.id === id)
      if (removed) revokeAudioUrls([removed])
      releaseTrack(id)
      remember(songsRef.current.filter((song) => song.id !== id))
      persistInBackground(deleteAudio(id))
    },
    [persistInBackground, remember],
  )

  const moveSong = useCallback(
    (fromIndex: number, toIndex: number) => {
      if (!readyRef.current) return
      const current = songsRef.current
      const target = Math.min(Math.max(toIndex, 0), current.length - 1)
      if (fromIndex === target || fromIndex < 0 || fromIndex >= current.length) return
      const next = [...current]
      const [moved] = next.splice(fromIndex, 1)
      next.splice(target, 0, moved)
      remember(next)
    },
    [remember],
  )

  const replaceAll = useCallback(
    (incoming: Song[]) => {
      if (!readyRef.current) return
      const metadata = normalizeSongs(incoming.map(toMetadata))
      const next = metadata.map((song) => withAudio(song))

      revokeAudioUrls(songsRef.current)
      resetAudioEngine()
      remember(next)
      writeMetaCache(metadata)
      persistInBackground(replaceRepertoire(metadata))
    },
    [persistInBackground, remember],
  )

  const restoreAll = useCallback(
    (incoming: Song[]) => {
      if (!readyRef.current) return
      const metadata = normalizeSongs(incoming.map(toMetadata))
      const incomingAudio = new Map(
        incoming.flatMap((song) => song.audioBlob ? [[song.id, song.audioBlob] as const] : []),
      )
      const next = metadata.map((song) => withAudio(song, incomingAudio.get(song.id)))

      revokeAudioUrls(songsRef.current)
      revokeAudioUrls(incoming)
      resetAudioEngine()
      remember(next)
      writeMetaCache(metadata)
      persistInBackground(replaceRepertoire(metadata, incomingAudio))
    },
    [persistInBackground, remember],
  )

  return {
    songs,
    ready,
    storageError,
    addSong,
    updateSong,
    saveSong,
    removeSong,
    moveSong,
    replaceAll,
    restoreAll,
  }
}
