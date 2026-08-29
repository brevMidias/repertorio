import 'fake-indexeddb/auto'
import { vi } from 'vitest'

// O jsdom não implementa rolagem; sem o stub cada scrollTo vira ruído no log.
// A suíte do service worker roda sem DOM, então a checagem é obrigatória.
if (typeof window !== 'undefined') {
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo
}
