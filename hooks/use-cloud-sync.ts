'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import {
  backupToCloud,
  createCloudKey,
  normalizeCloudKey,
  restoreFromCloud,
  type CloudTransport,
} from '@/lib/cloud'
import { loadCloudKey, saveCloudKey } from '@/lib/local-db'
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

let cloudKeyInitialization: Promise<string> | null = null

function initializeCloudKey(): Promise<string> {
  cloudKeyInitialization ??= (async () => {
    const stored = await loadCloudKey()
    const valid = stored ? normalizeCloudKey(stored) : null
    if (valid) return valid

    const created = createCloudKey()
    await saveCloudKey(created)
    return created
  })().catch((error) => {
    cloudKeyInitialization = null
    throw error
  })
  return cloudKeyInitialization
}

function messageFrom(error: unknown): string {
  return error instanceof Error ? error.message : 'Não foi possível sincronizar com a nuvem.'
}

export function useCloudSync(
  replaceAll: (songs: Song[]) => void,
  transport: CloudTransport = vercelCloudTransport,
): CloudSyncController {
  const [cloudKey, setCloudKey] = useState('')
  const [ready, setReady] = useState(false)
  const [busy, setBusy] = useState<'backup' | 'restore' | null>(null)
  const [feedback, setFeedback] = useState<CloudFeedback | null>(null)
  const keyRef = useRef('')
  const busyRef = useRef(false)

  useEffect(() => {
    let active = true
    void initializeCloudKey()
      .then((key) => {
        if (!active) return
        keyRef.current = key
        setCloudKey(key)
      })
      .catch((error) => {
        if (active) setFeedback({ tone: 'error', message: messageFrom(error) })
      })
      .finally(() => {
        if (active) setReady(true)
      })
    return () => {
      active = false
    }
  }, [])

  const run = useCallback(async (
    operation: 'backup' | 'restore',
    task: (key: string) => Promise<string>,
  ) => {
    if (!keyRef.current || busyRef.current) return
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setFeedback({ tone: 'error', message: 'Conecte-se à internet para usar a cópia na nuvem.' })
      return
    }

    busyRef.current = true
    setBusy(operation)
    setFeedback(null)
    try {
      setFeedback({ tone: 'ok', message: await task(keyRef.current) })
    } catch (error) {
      setFeedback({ tone: 'error', message: messageFrom(error) })
    } finally {
      busyRef.current = false
      setBusy(null)
    }
  }, [])

  const backup = useCallback(async (songs: readonly Song[]) => {
    await run('backup', async (key) => {
      const result = await backupToCloud(songs, key, transport)
      const audio = result.uploadedAudio + result.reusedAudio
      return `Repertório salvo na nuvem: ${result.songs} ${result.songs === 1 ? 'música' : 'músicas'} e ${audio} ${audio === 1 ? 'áudio' : 'áudios'}.`
    })
  }, [run, transport])

  const restore = useCallback(async () => {
    await run('restore', async (key) => {
      const restored = await restoreFromCloud(key, transport)
      replaceAll(restored)
      return `Repertório restaurado: ${restored.length} ${restored.length === 1 ? 'música' : 'músicas'}, disponível offline.`
    })
  }, [replaceAll, run, transport])

  const useCloudKey = useCallback(async (value: string) => {
    const normalized = normalizeCloudKey(value)
    if (!normalized) {
      setFeedback({ tone: 'error', message: 'Código da nuvem inválido.' })
      return false
    }

    try {
      await saveCloudKey(normalized)
      cloudKeyInitialization = Promise.resolve(normalized)
      keyRef.current = normalized
      setCloudKey(normalized)
      setFeedback({ tone: 'ok', message: 'Código conectado. Agora você pode restaurar o repertório.' })
      return true
    } catch (error) {
      setFeedback({ tone: 'error', message: messageFrom(error) })
      return false
    }
  }, [])

  return { cloudKey, ready, busy, feedback, backup, restore, useCloudKey }
}
