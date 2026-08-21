// @vitest-environment node

import { readFile } from 'node:fs/promises'
import vm from 'node:vm'

import { describe, expect, it, vi } from 'vitest'

type WorkerEvent = {
  request?: {
    method: string
    mode: string
    destination: string
    url: string
  }
  respondWith?: (response: Promise<Response> | Response) => void
  waitUntil?: (promise: Promise<unknown>) => void
}

async function createWorker(
  options: { failingAssets?: string[]; failingPuts?: string[]; cacheNames?: string[] } = {},
) {
  const source = await readFile(new URL('../public/sw.js', import.meta.url), 'utf8')
  const listeners = new Map<string, (event: WorkerEvent) => void>()
  const added: string[] = []
  const put: string[] = []
  const deleted: string[] = []
  const opened: string[] = []
  const matches = new Map<string, Response>()
  const cacheEntries = new Map<string, Response>()
  const rootHtml = `<!doctype html>
    <link rel="stylesheet" href="/_next/static/css/app.css">
    <script src="/_next/static/chunks/app.js"></script>
    <script src="https://cdn.example/_next/static/chunks/foreign.js"></script>`

  const cache = {
    add: vi.fn(async (request: string | Request) => {
      const key = typeof request === 'string' ? request : request.url
      added.push(key)
      if (options.failingAssets?.includes(key)) throw new Error(`failed ${key}`)
      cacheEntries.set(key, new Response(`cached ${key}`))
    }),
    put: vi.fn(async (request: string | Request, response?: Response) => {
      const key = typeof request === 'string' ? request : request.url
      put.push(key)
      if (options.failingPuts?.includes(key)) throw new Error(`failed put ${key}`)
      cacheEntries.set(key, response?.clone() ?? new Response(`cached ${key}`))
    }),
    match: vi.fn(async (request: string | Request) => {
      const key = typeof request === 'string' ? request : request.url
      return cacheEntries.get(key)
    }),
  }
  const fetch = vi.fn(async (request: string | Request) => {
    const key = typeof request === 'string' ? request : request.url
    if (key === '/' || key === 'https://prime.test/') {
      return new Response(rootHtml, { status: 200, headers: { 'content-type': 'text/html' } })
    }
    return new Response('asset', { status: 200 })
  })
  const caches = {
    open: vi.fn(async (name: string) => {
      opened.push(name)
      return cache
    }),
    keys: vi.fn(async () => options.cacheNames ?? []),
    delete: vi.fn(async (name: string) => {
      deleted.push(name)
      if (opened.at(-1) === name) cacheEntries.clear()
      return true
    }),
    match: vi.fn(async (request: string | Request) => {
      const key = typeof request === 'string' ? request : request.url
      return matches.get(key) ?? cacheEntries.get(key)
    }),
  }
  const self = {
    location: { origin: 'https://prime.test' },
    clients: { claim: vi.fn(async () => undefined) },
    skipWaiting: vi.fn(async () => undefined),
    addEventListener: vi.fn((type: string, listener: (event: WorkerEvent) => void) => {
      listeners.set(type, listener)
    }),
  }

  vm.runInNewContext(source, { URL, Request, Response, caches, fetch, self }, { filename: 'sw.js' })

  async function dispatch(type: string, event: WorkerEvent = {}): Promise<Response | undefined> {
    let pending: Promise<unknown> | undefined
    let response: Promise<Response> | Response | undefined
    listeners.get(type)?.({
      ...event,
      waitUntil: (promise) => {
        pending = promise
      },
      respondWith: (value) => {
        response = value
      },
    })
    await pending
    return response ? await response : undefined
  }

  return { added, cache, caches, deleted, dispatch, fetch, matches, opened, put, self }
}

describe('service worker shell', () => {
  it('pre-caches the root HTML and each same-origin Next asset it references', async () => {
    const worker = await createWorker()

    await worker.dispatch('install')

    const cached = [...worker.added, ...worker.put]
    expect(cached).toContain('/')
    expect(cached).toContain('/manifest.webmanifest')
    expect(cached).toContain('/_next/static/css/app.css')
    expect(cached).toContain('/_next/static/chunks/app.js')
    expect(cached).not.toContain('https://cdn.example/_next/static/chunks/foreign.js')
  })

  it('rejects an incomplete candidate shell and preserves the previous cache', async () => {
    const worker = await createWorker({
      failingAssets: ['/_next/static/chunks/app.js'],
      cacheNames: ['prime-shell-v3', 'unrelated-image-cache'],
    })

    await expect(worker.dispatch('install')).rejects.toThrow(/failed/i)
    expect(worker.self.skipWaiting).not.toHaveBeenCalled()
    expect(worker.deleted).toHaveLength(1)
    expect(worker.deleted).not.toContain('prime-shell-v3')
    expect(worker.deleted).not.toContain('unrelated-image-cache')
  })

  it('rejects installation when storing the essential root response fails', async () => {
    const worker = await createWorker({ failingPuts: ['/'] })

    await expect(worker.dispatch('install')).rejects.toThrow(/failed put/i)
    expect(worker.self.skipWaiting).not.toHaveBeenCalled()
    expect(worker.deleted).toHaveLength(1)
  })

  it('keeps old Prime shell caches when the current cache has no completion marker', async () => {
    const worker = await createWorker({
      cacheNames: ['prime-shell-v1', 'unrelated-image-cache'],
    })

    await worker.dispatch('activate')

    expect(worker.deleted).toEqual([])
    expect(worker.self.clients.claim).toHaveBeenCalledTimes(1)
  })

  it('deletes only old Prime shell caches after the current shell is complete', async () => {
    const worker = await createWorker({
      cacheNames: ['prime-shell-v1', 'unrelated-image-cache'],
    })
    await worker.dispatch('install')

    await worker.dispatch('activate')

    expect(worker.deleted).toEqual(['prime-shell-v1'])
    expect(worker.self.clients.claim).toHaveBeenCalledTimes(1)
  })

  it('uses a cached versioned asset without going to the network', async () => {
    const worker = await createWorker()
    const cached = new Response('cached script')
    const url = 'https://prime.test/_next/static/chunks/app.js'
    worker.matches.set(url, cached)

    const response = await worker.dispatch('fetch', {
      request: { method: 'GET', mode: 'cors', destination: 'script', url },
    })

    expect(await response?.text()).toBe('cached script')
    expect(worker.fetch).not.toHaveBeenCalled()
  })

  it('returns a valid navigation response when updating its cache fails', async () => {
    const url = 'https://prime.test/online-page'
    const worker = await createWorker({ failingPuts: [url] })

    const response = await worker.dispatch('fetch', {
      request: { method: 'GET', mode: 'navigate', destination: 'document', url },
    })

    expect(await response?.text()).toBe('asset')
    expect(worker.fetch).toHaveBeenCalledTimes(1)
  })

  it('returns a valid versioned asset when updating its cache fails', async () => {
    const url = 'https://prime.test/_next/static/chunks/fresh.js'
    const worker = await createWorker({ failingPuts: [url] })

    const response = await worker.dispatch('fetch', {
      request: { method: 'GET', mode: 'cors', destination: 'script', url },
    })

    expect(await response?.text()).toBe('asset')
    expect(worker.fetch).toHaveBeenCalledTimes(1)
  })

  it('does not intercept Blob URLs or MP3 requests', async () => {
    const worker = await createWorker()
    const respondWith = vi.fn()
    const listener = async (url: string, destination: string) =>
      worker.dispatch('fetch', {
        request: { method: 'GET', mode: 'cors', destination, url },
        respondWith,
      })

    await listener('blob:https://prime.test/session-audio', 'script')
    await listener('https://prime.test/reference/entrada.mp3', 'image')

    expect(worker.fetch).not.toHaveBeenCalled()
    expect(worker.cache.add).not.toHaveBeenCalled()
    expect(worker.cache.put).not.toHaveBeenCalled()
  })
})
