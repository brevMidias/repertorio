'use client'

import { useEffect, useState } from 'react'

/**
 * Mantém a tela acesa enquanto `active` for verdadeiro. O navegador solta o lock
 * quando a aba sai de foco, então ele é pedido de novo ao voltar.
 *
 * @returns `true` quando o lock está de fato ativo.
 */
export function useWakeLock(active: boolean): boolean {
  const [locked, setLocked] = useState(false)

  useEffect(() => {
    // Quando o modo palco é desligado, a limpeza da execução anterior já zerou o estado.
    if (!active || typeof navigator === 'undefined' || !navigator.wakeLock) return

    let sentinel: WakeLockSentinel | null = null
    let cancelled = false

    const acquire = async () => {
      if (document.visibilityState !== 'visible') return
      if (sentinel && !sentinel.released) return

      try {
        const next = await navigator.wakeLock.request('screen')
        if (cancelled) {
          await next.release()
          return
        }
        sentinel = next
        setLocked(true)
        next.addEventListener('release', () => setLocked(false))
      } catch {
        setLocked(false)
      }
    }

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') void acquire()
      else setLocked(false)
    }

    void acquire()
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', handleVisibility)
      sentinel?.release().catch(() => undefined)
      setLocked(false)
    }
  }, [active])

  return locked
}
