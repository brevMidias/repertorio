import { afterEach, describe, expect, it, vi } from 'vitest'

import { formatBytes, readStorageStatus, requestPersistentStorage } from '@/lib/storage-status'

const originalStorage = Object.getOwnPropertyDescriptor(navigator, 'storage')

function setStorage(storage: Partial<StorageManager>): void {
  Object.defineProperty(navigator, 'storage', { configurable: true, value: storage })
}

afterEach(() => {
  if (originalStorage) {
    Object.defineProperty(navigator, 'storage', originalStorage)
  } else {
    Reflect.deleteProperty(navigator, 'storage')
  }
})

describe('storage status', () => {
  it('requests persistence only when it has not already been granted', async () => {
    const persisted = vi.fn().mockResolvedValue(false)
    const persist = vi.fn().mockResolvedValue(true)
    setStorage({ persisted, persist })

    await expect(requestPersistentStorage()).resolves.toBe(true)
    expect(persist).toHaveBeenCalledTimes(1)
  })

  it('does not request persistence again after it has been granted', async () => {
    const persist = vi.fn().mockResolvedValue(false)
    setStorage({ persisted: vi.fn().mockResolvedValue(true), persist })

    await expect(requestPersistentStorage()).resolves.toBe(true)
    expect(persist).not.toHaveBeenCalled()
  })

  it('uses persist when the persisted check is unavailable', async () => {
    const persist = vi.fn().mockResolvedValue(true)
    setStorage({ persist })

    await expect(requestPersistentStorage()).resolves.toBe(true)
    expect(persist).toHaveBeenCalledTimes(1)
  })

  it('reads persistence and the browser storage estimate', async () => {
    setStorage({
      persisted: vi.fn().mockResolvedValue(true),
      estimate: vi.fn().mockResolvedValue({ usage: 1_572_864, quota: 8_388_608 }),
    })

    await expect(readStorageStatus()).resolves.toEqual({
      persisted: true,
      usageBytes: 1_572_864,
      quotaBytes: 8_388_608,
    })
  })

  it('keeps the granted state when only the estimate fails', async () => {
    setStorage({
      persisted: vi.fn().mockResolvedValue(true),
      estimate: vi.fn().mockRejectedValue(new Error('estimate unavailable')),
    })

    await expect(readStorageStatus()).resolves.toEqual({ persisted: true })
  })

  it('formats storage usage for the preparation screen', () => {
    expect(formatBytes(1_572_864)).toBe('1.5 MB')
  })
})
