'use client'

import { useEffect, useRef } from 'react'

import { isAudioReady, prepareTrack, releaseTrack, releaseTracksExcept } from '@/lib/audio-engine'
import { MAX_DECODED_TRACKS } from '@/lib/config'
import type { Song } from '@/lib/types'

/**
 * Deixa a música atual e a próxima decodificadas, e descarta as outras.
 *
 * É o que faz o play parecer instantâneo: a decodificação, que é a parte cara
 * do processo, acontece enquanto o músico ainda está lendo a cifra.
 */
export function useAudioPrefetch(songs: readonly Song[], activeIndex: number, enabled: boolean) {
  const windowIds = useRef<string[]>([])

  useEffect(() => {
    if (!enabled) {
      windowIds.current = []
      releaseTracksExcept([])
      return
    }

    const targets = [songs[activeIndex], songs[activeIndex + 1]]
      .filter((song): song is Song => Boolean(song?.audioBlob))
      .slice(0, MAX_DECODED_TRACKS)

    windowIds.current = targets.map((song) => song.id)
    releaseTracksExcept(windowIds.current)

    let cancelled = false

    const run = async () => {
      for (const song of targets) {
        if (cancelled) return
        if (!song.audioBlob || isAudioReady(song.id)) continue
        await prepareTrack(song.id, song.audioBlob)
      }
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [songs, activeIndex, enabled])

  useEffect(
    () => () => {
      for (const id of windowIds.current) releaseTrack(id)
      windowIds.current = []
    },
    [],
  )
}
