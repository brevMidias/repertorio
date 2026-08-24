'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import {
  backupToCloud,
  normalizeCloudKey,
  readCloudSnapshot,
  SHARED_CLOUD_KEY,
  type CloudTransport,
} from '@/lib/cloud'
import { AUTOSAVE_DELAY_MS } from '@/lib/config'
import { LEGACY_EXAMPLE_SONG_IDS } from '@/lib/seed'
import type { Song } from '@/lib/types'
import { vercelCloudTransport } from '@/lib/vercel-cloud'

export type CloudFeedback = { tone: 'ok' | 'error'; message: string }

export type CloudSyncController = {
  cloudKey: string
  ready: boolean
  busy: 'backup' | 'restore' | null
  feedback: CloudFeedback | null
  backup: (songs: readonly Song[]) => Promise<void>
  restore: () => Promise<void>
  useCloudKey: (value: string) => Promise<boolean>
}

type PendingBackup = { songs: Song[]; announce: boolean }

function messageFrom(error: unknown): string {
  return error instanceof Error ? error.message : 'Não foi possível sincronizar com a nuvem.'
}

function withoutLegacyExamples(songs: readonly Song[]): Song[] {
  return songs.filter((song) => !LEGACY_EXAMPLE_SONG_IDS.has(song.id))
}

/**
 * Mantém a Vercel como fonte compartilhada e o IndexedDB como cache offline rápido.
 * A primeira carga baixa a nuvem; qualquer mudança posterior é enviada automaticamente.
 */
export function useCloudSync(
  songs: readonly Song[],
  localReady: boolean,
  replaceAll: (songs: Song[]) => void,
  transport: CloudTransport = vercelCloudTransport,
  syncDelayMs = AUTOSAVE_DELAY_MS,
): CloudSyncController {
  const [ready, setReady] = useState(false)
  const [busy, setBusy] = useState<'backup' | 'restore' | null>(null)
  const [feedback, setFeedback] = useState<CloudFeedback | null>(null)
  const songsRef = useRef<Song[]>([...songs])
  const initializedRef = useRef(false)
  const initializationStartedRef = useRef(false)
  const skipNextAutomaticBackupRef = useRef(false)
  const pendingBackupRef = useRef<PendingBackup | null>(null)
  const syncingRef = useRef<Promise<void> | null>(null)

  useEffect(() => {
    songsRef.current = [...songs]
  }, [songs])

  const flushBackups = useCallback((): Promise<void> => {
    if (syncingRef.current) return syncingRef.current

    const task = (async () => {
      setBusy('backup')
      try {
        while (pendingBackupRef.current) {
          const pending = pendingBackupRef.current
          pendingBackupRef.current = null

          if (typeof navigator !== 'undefined' && !navigator.onLine) {
            pendingBackupRef.current = pending
            setFeedback({
              tone: 'error',
              message: 'Sem internet. A alteração está salva neste aparelho e será enviada ao reconectar.',
            })
            return
          }

          const result = await backupToCloud(pending.songs, SHARED_CLOUD_KEY, transport)
          if (pending.announce) {
            const audio = result.uploadedAudio + result.reusedAudio
            setFeedback({
              tone: 'ok',
              message: `Repertório salvo na nuvem: ${result.songs} ${result.songs === 1 ? 'música' : 'músicas'} e ${audio} ${audio === 1 ? 'áudio' : 'áudios'}.`,
            })
          } else {
            setFeedback({ tone: 'ok', message: 'Alterações sincronizadas automaticamente.' })
          }
        }
      } catch (error) {
        setFeedback({ tone: 'error', message: messageFrom(error) })
      } finally {
        setBusy(null)
        syncingRef.current = null
      }
    })()

    syncingRef.current = task
    return task
  }, [transport])

  const requestBackup = useCallback((snapshot: readonly Song[], announce: boolean) => {
    pendingBackupRef.current = { songs: [...snapshot], announce }
    return flushBackups()
  }, [flushBackups])

  useEffect(() => {
    if (!localReady || initializationStartedRef.current) return
    initializationStartedRef.current = true
    let active = true

    const initialize = async () => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        if (!active) return
        initializedRef.current = true
        skipNextAutomaticBackupRef.current = true
        setFeedback({ tone: 'error', message: 'Modo offline: usando a cópia deste aparelho.' })
        setReady(true)
        return
      }

      try {
        const remote = await readCloudSnapshot(SHARED_CLOUD_KEY, transport)
        if (!active) return

        const initial = remote ?? withoutLegacyExamples(songsRef.current)
        if (!remote) await backupToCloud(initial, SHARED_CLOUD_KEY, transport)
        if (!active) return

        skipNextAutomaticBackupRef.current = true
        initializedRef.current = true
        replaceAll(initial)
        setFeedback({ tone: 'ok', message: 'Repertório sincronizado com a Vercel.' })
      } catch (error) {
        if (active) setFeedback({ tone: 'error', message: messageFrom(error) })
      } finally {
        if (active) setReady(true)
      }
    }

    void initialize()
    return () => {
      active = false
    }
  }, [localReady, replaceAll, transport])

  useEffect(() => {
    if (!localReady || !ready || !initializedRef.current) return
    if (skipNextAutomaticBackupRef.current) {
      skipNextAutomaticBackupRef.current = false
      return
    }

    const timer = window.setTimeout(() => {
      void requestBackup(songsRef.current, false)
    }, syncDelayMs)
    return () => window.clearTimeout(timer)
  }, [localReady, ready, requestBackup, songs, syncDelayMs])

  useEffect(() => {
    if (!ready) return
    const handleOnline = () => {
      if (pendingBackupRef.current) void flushBackups()
    }
    window.addEventListener('online', handleOnline)
    return () => window.removeEventListener('online', handleOnline)
  }, [flushBackups, ready])

  const backup = useCallback(async (snapshot: readonly Song[]) => {
    await requestBackup(snapshot, true)
  }, [requestBackup])

  const restore = useCallback(async () => {
    if (busy) return
    setBusy('restore')
    setFeedback(null)
    try {
      const restored = await readCloudSnapshot(SHARED_CLOUD_KEY, transport)
      if (!restored) throw new Error('Nenhum repertório foi encontrado na Vercel.')
      skipNextAutomaticBackupRef.current = true
      replaceAll(restored)
      setFeedback({
        tone: 'ok',
        message: `Repertório restaurado: ${restored.length} ${restored.length === 1 ? 'música' : 'músicas'}, disponível offline.`,
      })
    } catch (error) {
      setFeedback({ tone: 'error', message: messageFrom(error) })
    } finally {
      setBusy(null)
    }
  }, [busy, replaceAll, transport])

  const useCloudKey = useCallback(async (value: string) => {
    const normalized = normalizeCloudKey(value)
    const accepted = normalized === SHARED_CLOUD_KEY
    setFeedback(accepted
      ? { tone: 'ok', message: 'Este aparelho já usa o repertório compartilhado.' }
      : { tone: 'error', message: 'O repertório agora é sincronizado automaticamente.' })
    return accepted
  }, [])

  return {
    cloudKey: SHARED_CLOUD_KEY,
    ready,
    busy,
    feedback,
    backup,
    restore,
    useCloudKey,
  }
}
