import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { SongEditor } from '@/components/song-editor'
import type { Song } from '@/lib/types'

const song: Song = {
  id: 'entrada',
  title: 'Entrada',
  artist: 'Artista',
  moment: 'Entrada',
  key: 'C',
  originalKey: 'C',
  status: 'Pronta',
  entry: '',
  notes: '',
  structure: '',
  sections: [],
  previewStart: 0,
  audioName: 'antiga.mp3',
  audioBlob: new Blob(['old'], { type: 'audio/mpeg' }),
  audioUrl: 'blob:old',
}

const createObjectURL = vi.fn<(blob: Blob | MediaSource) => string>()
const revokeObjectURL = vi.fn<(url: string) => void>()

function attach(name: string) {
  fireEvent.change(screen.getByLabelText('Áudio de referência'), {
    target: { files: [new File([name], name, { type: 'audio/mpeg' })] },
  })
}

function renderEditor(overrides: Partial<Parameters<typeof SongEditor>[0]> = {}) {
  const props = {
    song,
    onClose: vi.fn(),
    onSave: vi.fn(),
    onDelete: vi.fn(),
    ...overrides,
  }
  render(<SongEditor {...props} />)
  return props
}

beforeEach(() => {
  createObjectURL.mockReset()
  revokeObjectURL.mockReset()
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL })
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL })
})

afterEach(() => cleanup())

describe('SongEditor object URL ownership', () => {
  it('cancels a replacement by revoking only the URL created by this draft', () => {
    createObjectURL.mockReturnValueOnce('blob:new')
    const props = renderEditor()

    attach('nova.mp3')
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))

    expect(revokeObjectURL.mock.calls).toEqual([['blob:new']])
    expect(props.onClose).toHaveBeenCalledTimes(1)
    expect(props.onSave).not.toHaveBeenCalled()
  })

  it('saves the last replacement while revoking the old and intermediate URLs', () => {
    createObjectURL.mockReturnValueOnce('blob:first').mockReturnValueOnce('blob:chosen')
    const props = renderEditor()

    attach('primeira.mp3')
    attach('escolhida.mp3')
    fireEvent.click(screen.getByRole('button', { name: /salvar música/i }))

    expect(revokeObjectURL.mock.calls).toEqual([['blob:old'], ['blob:first']])
    expect(revokeObjectURL).not.toHaveBeenCalledWith('blob:chosen')
    expect(props.onSave).toHaveBeenCalledWith(
      expect.objectContaining({ audioName: 'escolhida.mp3', audioUrl: 'blob:chosen' }),
    )
  })

  it('revokes the original URL when audio removal is saved', () => {
    const props = renderEditor()

    fireEvent.click(screen.getByRole('button', { name: 'Remover áudio' }))
    fireEvent.click(screen.getByRole('button', { name: /salvar música/i }))

    expect(revokeObjectURL.mock.calls).toEqual([['blob:old']])
    expect(props.onSave).toHaveBeenCalledWith(
      expect.not.objectContaining({ audioBlob: expect.anything(), audioUrl: expect.anything() }),
    )
  })

  it('revokes the original and draft URLs when the song is deleted', () => {
    createObjectURL.mockReturnValueOnce('blob:new')
    const props = renderEditor()

    attach('nova.mp3')
    fireEvent.click(screen.getByRole('button', { name: /excluir música/i }))

    expect(revokeObjectURL.mock.calls).toEqual([['blob:old'], ['blob:new']])
    expect(props.onDelete).toHaveBeenCalledTimes(1)
  })
})
