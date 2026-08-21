import { StrictMode } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { PreparationView } from '@/components/preparation-view'
import { RepertoireApp } from '@/components/repertoire-app'
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

function renderPreparation(storageStatus: Parameters<typeof PreparationView>[0]['storageStatus']) {
  return render(
    <PreparationView
      songs={[song]}
      storageStatus={storageStatus}
      onEdit={vi.fn()}
      onExport={vi.fn()}
      onImport={vi.fn()}
      mutationsEnabled
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
