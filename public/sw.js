/**
 * Service worker do Prime.
 *
 * Navegação usa rede primeiro, para que uma nova versão publicada chegue ao
 * músico na próxima vez que ele abrir o app com internet. Assets com hash no
 * nome usam cache primeiro, porque nunca mudam de conteúdo.
 */

const CACHE_PREFIX = 'prime-shell-'
const CACHE_NAME = `${CACHE_PREFIX}v5`
const CACHEABLE_DESTINATIONS = ['script', 'style', 'font', 'image']
const ROOT_PATH = '/'
const MANIFEST_PATH = '/manifest.webmanifest'
const COMPLETE_MARKER = '/__prime_shell_complete__'

function nextStaticAssets(html) {
  const assets = new Set()
  const attributePattern = /\b(?:src|href)\s*=\s*["']([^"']+)["']/gi
  let match

  while ((match = attributePattern.exec(html)) !== null) {
    try {
      const url = new URL(match[1], self.location.origin)
      if (url.origin === self.location.origin && url.pathname.startsWith('/_next/static/')) {
        assets.add(`${url.pathname}${url.search}`)
      }
    } catch {
      // Uma referência malformada não invalida as demais.
    }
  }

  return [...assets]
}

async function cacheInitialShell() {
  try {
    const cache = await caches.open(CACHE_NAME)
    const rootResponse = await fetch(ROOT_PATH)
    if (!rootResponse.ok) throw new Error(`shell returned ${rootResponse.status}`)

    const rootForCache = rootResponse.clone()
    const html = await rootResponse.text()
    const essentialAssets = nextStaticAssets(html)

    // O shell é uma unidade: qualquer falta mantém o worker anterior no controle.
    const results = await Promise.allSettled([
      cache.put(ROOT_PATH, rootForCache),
      cache.add(MANIFEST_PATH),
      ...essentialAssets.map((path) => cache.add(path)),
    ])
    const failure = results.find((result) => result.status === 'rejected')
    if (failure) throw failure.reason

    // O marcador só existe depois de raiz, manifest e todos os chunks essenciais.
    await cache.put(COMPLETE_MARKER, new Response('complete'))
  } catch (error) {
    await caches.delete(CACHE_NAME)
    throw error
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(cacheInitialShell().then(() => self.skipWaiting()))
})

async function activateCurrentShell() {
  const current = await caches.open(CACHE_NAME)
  const complete = await current.match(COMPLETE_MARKER)

  if (complete) {
    const keys = await caches.keys()
    await Promise.all(
      keys
        .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
        .map((key) => caches.delete(key)),
    )
  }

  await self.clients.claim()
}

self.addEventListener('activate', (event) => {
  event.waitUntil(activateCurrentShell())
})

async function putInCache(request, response) {
  if (!response.ok || response.type === 'opaque') return

  try {
    const cache = await caches.open(CACHE_NAME)
    await cache.put(request, response.clone())
  } catch {
    // Quota e falhas do Cache Storage não invalidam uma resposta de rede utilizável.
  }
}

/** Rede primeiro: a versão publicada ganha, o cache é o plano B offline. */
async function networkFirst(request) {
  try {
    const response = await fetch(request)
    await putInCache(request, response)
    return response
  } catch (error) {
    const cached = (await caches.match(request)) || (await caches.match(ROOT_PATH))
    if (cached) return cached
    throw error
  }
}

/** Cache primeiro: usado para assets versionados, que não mudam de conteúdo. */
async function cacheFirst(request) {
  const cached = await caches.match(request)
  if (cached) return cached

  const response = await fetch(request)
  await putInCache(request, response)
  return response
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  let url
  try {
    url = new URL(request.url)
  } catch {
    return
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') return
  if (url.origin !== self.location.origin) return
  if (url.pathname.toLowerCase().endsWith('.mp3')) return

  if (request.mode === 'navigate' || request.destination === 'document') {
    event.respondWith(networkFirst(request))
    return
  }

  if (CACHEABLE_DESTINATIONS.includes(request.destination)) {
    event.respondWith(cacheFirst(request))
    return
  }

  if (url.pathname === MANIFEST_PATH) {
    event.respondWith(networkFirst(request))
  }
})
