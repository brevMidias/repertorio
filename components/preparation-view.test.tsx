import { StrictMode } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { PreparationView } from '@/components/preparation-view'
import { RepertoireApp } from '@/components/repertoire-app'
import type { CloudSyncController } from '@/hooks/use-cloud-sync'
import type { Song } from '@/lib/types'

const song: Song = {
  id: 'entrada',
  title: 'Entrada',
  artist: 'Artista',
  moment: 'Entrada',
  key: 'C',
  originalKey: 'C',
  bpm: 72,
  status: 'Pronta',
  entry: '',
  notes: '',
  structure: '',
  sections: [],
  previewStart: 0,
}

const originalStorage = Object.getOwnPropertyDescriptor(navigator, 'storage')

function cloudController(overrides: Partial<CloudSyncController> = {}): CloudSyncController {
  return {
    cloudKey: '0f91fd6b-c6f5-4f39-a340-f6387bce8bc8',
    ready: true,
    busy: null,
    feedback: null,
    backup: vi.fn().mockResolvedValue(undefined),
    restore: vi.fn().mockResolvedValue(undefined),
    useCloudKey: vi.fn().mockResolvedValue(true),
    ...overrides,
  }
}

function renderPreparation(
  storageStatus: Parameters<typeof PreparationView>[0]['storageStatus'],
  cloud = cloudController(),
) {
  return render(
    <PreparationView
      songs={[song]}
      storageStatus={storageStatus}
      onEdit={vi.fn()}
      onExport={vi.fn()}
      onImport={vi.fn()}
      mutationsEnabled
      cloud={cloud}
    />,
  )
}

afterEach(() => {
  cleanup()
  if (originalStorage) {
    Object.defineProperty(navigator, 'storage', originalStorage)
  } else {
    Reflect.deleteProperty(navigator, 'storage')
  }
})

describe('PreparationView storage protection', () => {
  it('shows a neutral loading state before the browser answers', () => {
    renderPreparation(null)

    expect(screen.getByText('Verificando proteção offline…')).toBeTruthy()
    expect(screen.queryByText('Proteção limitada')).toBeNull()
  })

  it('shows active protection and approximate usage after persistence is granted', () => {
    renderPreparation({ persisted: true, usageBytes: 1_572_864 })

    expect(screen.getByText('Proteção offline ativa')).toBeTruthy()
    expect(screen.getByText(/1\.5 MB usados/)).toBeTruthy()
  })

  it('explains how to reduce risk when persistence is denied', () => {
    renderPreparation({ persisted: false, usageBytes: 512 })

    expect(screen.getByText('Proteção limitada')).toBeTruthy()
    expect(screen.getByText(/mantenha a PWA instalada/i)).toBeTruthy()
    expect(screen.getByText(/512 B usados/)).toBeTruthy()
  })

  it('requests persistence once despite StrictMode effect replay', async () => {
    const persist = vi.fn().mockResolvedValue(false)
    Object.defineProperty(navigator, 'storage', {
      configurable: true,
      value: {
        persisted: vi.fn().mockResolvedValue(false),
        persist,
        estimate: vi.fn().mockResolvedValue({ usage: 1_572_864, quota: 8_388_608 }),
      },
    })

    render(
      <StrictMode>
        <RepertoireApp />
      </StrictMode>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Preparação' }))

    await waitFor(() => expect(screen.getByText('Proteção limitada')).toBeTruthy())
    expect(screen.getByText(/1\.5 MB usados/)).toBeTruthy()
    expect(persist).toHaveBeenCalledTimes(1)
  })
})

describe('PreparationView cloud copy', () => {
  it('allows retrying the automatic metadata and MP3 synchronization', () => {
    const cloud = cloudController()
    renderPreparation({ persisted: true }, cloud)

    fireEvent.click(screen.getByRole('button', { name: /sincronizar agora/i }))

    expect(cloud.backup).toHaveBeenCalledWith([song])
    expect(screen.getByText(/sincronização automática ativa/i)).toBeTruthy()
  })

  it('uses one shared repertoire without exposing a per-browser code', () => {
    const cloud = cloudController()
    renderPreparation({ persisted: true }, cloud)

    expect(screen.queryByLabelText(/código da nuvem/i)).toBeNull()
    expect(screen.getByText(/ao abrir em outro navegador/i)).toBeTruthy()
  })
})
