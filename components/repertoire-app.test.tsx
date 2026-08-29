import { StrictMode } from 'react'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { RepertoireApp } from '@/components/repertoire-app'

const originalStorage = Object.getOwnPropertyDescriptor(navigator, 'storage')

afterEach(() => {
  cleanup()
  if (originalStorage) {
    Object.defineProperty(navigator, 'storage', originalStorage)
  } else {
    Reflect.deleteProperty(navigator, 'storage')
  }
})

describe('RepertoireApp offline storage', () => {
  it('requests persistence once despite StrictMode effect replay', async () => {
    const persist = vi.fn().mockResolvedValue(false)
    Object.defineProperty(navigator, 'storage', {
      configurable: true,
      value: {
        persisted: vi.fn().mockResolvedValue(false),
        persist,
      },
    })

    render(
      <StrictMode>
        <RepertoireApp />
      </StrictMode>,
    )

    await waitFor(() => expect(persist).toHaveBeenCalledTimes(1))
  })
})

describe('RepertoireApp chrome', () => {
  it('offers the repertoire and stage tabs only', () => {
    render(<RepertoireApp />)

    expect(screen.getByRole('button', { name: 'Repertório' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Modo palco' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Preparação' })).toBeNull()
  })

  it('keeps the header free of branding, ceremony data, and a menu toggle', () => {
    render(<RepertoireApp />)

    expect(screen.queryByText('PRIME')).toBeNull()
    expect(screen.queryByText('repertório de cerimônia')).toBeNull()
    expect(screen.queryByText('CASAMENTO')).toBeNull()
    expect(screen.queryByRole('button', { name: /menu/i })).toBeNull()
  })
})
