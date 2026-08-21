'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import { MainNav } from '@/components/main-nav'
import { PreparationView } from '@/components/preparation-view'
import { RepertoireList } from '@/components/repertoire-list'
import { SongEditor } from '@/components/song-editor'
import { StageView } from '@/components/stage-view'
import { TopBar } from '@/components/top-bar'
import { useAudioPrefetch } from '@/hooks/use-audio-prefetch'
import { useCloudSync } from '@/hooks/use-cloud-sync'
import { useSongs } from '@/hooks/use-songs'
import { useWakeLock } from '@/hooks/use-wake-lock'
import { warmUpAudio } from '@/lib/audio-engine'
import { downloadBackup } from '@/lib/backup'
import { registerServiceWorker } from '@/lib/pwa'
import {
  readStorageStatus,
  requestPersistentStorage,
  type StorageStatus,
} from '@/lib/storage-status'
import type { AppView, FontSize, MusicalKey, Song } from '@/lib/types'

const FONT_SIZE_CYCLE: Record<FontSize, FontSize> = {
  normal: 'large',
  large: 'xl',
  xl: 'normal',
}

export function RepertoireApp() {
  const {
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
  } = useSongs()
  const cloud = useCloudSync(restoreAll)

  const [view, setView] = useState<AppView>('repertoire')
  const [selectedId, setSelectedId] = useState('')
  const [editing, setEditing] = useState<Song | null>(null)
  const [fontSize, setFontSize] = useState<FontSize>('normal')
  const [menuOpen, setMenuOpen] = useState(false)
  const [storageStatus, setStorageStatus] = useState<StorageStatus | null>(null)
  const storageStatusRequest = useRef<Promise<StorageStatus> | null>(null)

  // A seleção cai na primeira música quando o id atual deixa de existir.
  const foundIndex = songs.findIndex((song) => song.id === selectedId)
  const selectedIndex = foundIndex >= 0 ? foundIndex : 0
  const selected = songs[selectedIndex]

  // Sem músicas não existe palco: a lista assume até haver o que tocar.
  const activeView: AppView = view === 'stage' && !selected ? 'repertoire' : view

  const wakeLockActive = useWakeLock(activeView === 'stage')
  useAudioPrefetch(songs, selectedIndex, activeView === 'stage')

  useEffect(() => {
    registerServiceWorker()

    storageStatusRequest.current ??= requestPersistentStorage().then(() => readStorageStatus())
    let active = true
    void storageStatusRequest.current.then((status) => {
      if (active) setStorageStatus(status)
    })

    return () => {
      active = false
    }
  }, [])

  const changeView = useCallback((next: AppView) => {
    setView(next)
    setMenuOpen(false)
  }, [])

  const selectByIndex = useCallback(
    (next: number) => {
      if (songs.length === 0) return
      const clamped = Math.min(Math.max(next, 0), songs.length - 1)
      setSelectedId(songs[clamped].id)
    },
    [songs],
  )

  const openStage = useCallback((id: string) => {
    void warmUpAudio()
    setSelectedId(id)
    setView('stage')
  }, [])

  const handleAdd = useCallback(() => {
    if (!ready) return
    const created = addSong()
    if (!created) return
    setSelectedId(created.id)
    setEditing(created)
  }, [addSong, ready])

  const handleKeyChange = useCallback(
    (key: MusicalKey) => {
      if (ready && selected) updateSong(selected.id, { key })
    },
    [ready, selected, updateSong],
  )

  const handleDelete = useCallback(() => {
    if (!ready || !editing) return

    const removedIndex = songs.findIndex((song) => song.id === editing.id)
    const remaining = songs.filter((song) => song.id !== editing.id)
    removeSong(editing.id)
    setEditing(null)

    if (editing.id !== selectedId) return
    const fallback = remaining[Math.min(Math.max(removedIndex, 0), remaining.length - 1)]
    setSelectedId(fallback?.id ?? '')
  }, [editing, ready, removeSong, selectedId, songs])

  const handleImport = useCallback(
    (imported: Song[]) => {
      if (!ready) return
      replaceAll(imported)
      setSelectedId(imported[0]?.id ?? '')
    },
    [ready, replaceAll],
  )

  const handleExport = useCallback(() => downloadBackup(songs), [songs])

  return (
    <main className={`app-shell font-sans size-${fontSize}`}>
      <TopBar menuOpen={menuOpen} onToggleMenu={() => setMenuOpen((open) => !open)} />
      <MainNav view={activeView} open={menuOpen} onChange={changeView} />
      {!ready && (
        <p role="status" aria-label="Carregando repertório" aria-live="polite">
          Carregando repertório salvo… As edições serão liberadas em instantes.
        </p>
      )}
      {storageError && <p role="status">{storageError}</p>}

      {activeView === 'repertoire' && (
        <RepertoireList
          songs={songs}
          selectedId={selected?.id ?? ''}
          onOpen={openStage}
          onEdit={setEditing}
          onMove={moveSong}
          onAdd={handleAdd}
          onExport={handleExport}
          mutationsEnabled={ready}
        />
      )}

      {activeView === 'stage' && selected && (
        <StageView
          key={selected.id}
          song={selected}
          nextSong={songs[selectedIndex + 1]}
          index={selectedIndex}
          total={songs.length}
          fontSize={fontSize}
          wakeLockActive={wakeLockActive}
          onBack={() => changeView('repertoire')}
          onSelectIndex={selectByIndex}
          onKeyChange={handleKeyChange}
          onCycleFontSize={() => setFontSize((current) => FONT_SIZE_CYCLE[current])}
        />
      )}

      {activeView === 'prep' && (
        <PreparationView
          songs={songs}
          storageStatus={storageStatus}
          onEdit={setEditing}
          onExport={handleExport}
          onImport={handleImport}
          mutationsEnabled={ready}
          cloud={cloud}
        />
      )}

      {editing && (
        <SongEditor
          key={editing.id}
          song={editing}
          onClose={() => setEditing(null)}
          onSave={(updated) => {
            saveSong(updated)
            setEditing(null)
          }}
          onDelete={handleDelete}
        />
      )}
    </main>
  )
}
