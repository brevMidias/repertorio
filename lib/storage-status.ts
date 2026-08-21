/**
 * Estado do armazenamento local.
 *
 * Sem `persist()`, o navegador pode descartar IndexedDB quando o disco aperta —
 * exatamente o que não pode acontecer com o repertório na véspera da cerimônia.
 */

export type StorageStatus = {
  /** `true` quando o navegador prometeu não descartar os dados. */
  persisted: boolean
  usageBytes?: number
  quotaBytes?: number
}

/** Pede armazenamento persistente. Alguns navegadores concedem sem perguntar. */
export async function requestPersistentStorage(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.storage?.persist) return false

  try {
    if (navigator.storage.persisted && (await navigator.storage.persisted())) return true
    return await navigator.storage.persist()
  } catch {
    return false
  }
}

export async function readStorageStatus(): Promise<StorageStatus> {
  if (typeof navigator === 'undefined' || !navigator.storage) return { persisted: false }

  let persisted = false
  try {
    persisted = navigator.storage.persisted ? await navigator.storage.persisted() : false
  } catch {
    // A estimativa ainda pode estar disponível mesmo sem `persisted()`.
  }

  if (!navigator.storage.estimate) return { persisted }

  try {
    const { usage, quota } = await navigator.storage.estimate()
    return { persisted, usageBytes: usage, quotaBytes: quota }
  } catch {
    return { persisted }
  }
}

export function formatBytes(bytes?: number): string {
  if (bytes === undefined || !Number.isFinite(bytes)) return '—'
  if (bytes < 1024) return `${bytes} B`

  const units = ['KB', 'MB', 'GB']
  let value = bytes / 1024
  let unit = 0

  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }

  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[unit]}`
}
