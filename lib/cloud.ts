import { toMetadata, withAudio } from '@/lib/audio'
import { normalizeSongs } from '@/lib/backup'
import type { Song, SongMetadata } from '@/lib/types'

const CLOUD_APP = 'prime'
const CLOUD_VERSION = 1
const CLOUD_KEY_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const SONG_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/

export type CloudAudioEntry = {
  pathname: string
  fingerprint: string
  contentType: string
  size: number
}

export type CloudManifest = {
  app: typeof CLOUD_APP
  version: typeof CLOUD_VERSION
  updatedAt: string
  songs: SongMetadata[]
  audio: Record<string, CloudAudioEntry>
}

export type CloudUploadResult = Pick<CloudAudioEntry, 'pathname' | 'contentType' | 'size'>

export type CloudTransport = {
  readManifest: (cloudKey: string) => Promise<CloudManifest | null>
  uploadAudio: (pathname: string, blob: Blob, cloudKey: string) => Promise<CloudUploadResult>
  writeManifest: (manifest: CloudManifest, cloudKey: string) => Promise<void>
  downloadAudio: (entry: CloudAudioEntry, cloudKey: string) => Promise<Blob>
}

export function createCloudKey(): string {
  return crypto.randomUUID()
}

export function normalizeCloudKey(value: string): string | null {
  const normalized = value.trim().toLowerCase()
  return CLOUD_KEY_PATTERN.test(normalized) ? normalized : null
}

export function cloudKeyFromRequest(request: Request): string | null {
  const authorization = request.headers.get('authorization')
  if (!authorization?.startsWith('Bearer ')) return null
  return normalizeCloudKey(authorization.slice('Bearer '.length))
}

export function cloudProfilePrefix(cloudKey: string): string {
  const normalized = normalizeCloudKey(cloudKey)
  if (!normalized) throw new Error('Código da nuvem inválido.')
  return `prime/${normalized}`
}

export function cloudManifestPath(cloudKey: string): string {
  return `${cloudProfilePrefix(cloudKey)}/manifest.json`
}

export function cloudAudioPath(cloudKey: string, songId: string): string {
  if (!SONG_ID_PATTERN.test(songId)) throw new Error('Identificador de música inválido.')
  return `${cloudProfilePrefix(cloudKey)}/audio/${songId}.mp3`
}

export function cloudPathBelongsToProfile(pathname: string, cloudKey: string): boolean {
  const prefix = `${cloudProfilePrefix(cloudKey)}/audio/`
  if (!pathname.startsWith(prefix)) return false
  const filename = pathname.slice(prefix.length)
  return /^[A-Za-z0-9_-]{1,128}\.mp3$/.test(filename)
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}

async function fingerprint(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())
  return bytesToBase64Url(new Uint8Array(digest))
}

function isReusableAudio(
  previous: CloudAudioEntry | undefined,
  expectedPath: string,
  expectedFingerprint: string,
): previous is CloudAudioEntry {
  return previous?.pathname === expectedPath && previous.fingerprint === expectedFingerprint
}

export async function backupToCloud(
  songs: readonly Song[],
  cloudKey: string,
  transport: CloudTransport,
): Promise<{ uploadedAudio: number; reusedAudio: number; songs: number }> {
  const normalizedKey = normalizeCloudKey(cloudKey)
  if (!normalizedKey) throw new Error('Código da nuvem inválido.')

  const previous = await transport.readManifest(normalizedKey)
  const audio: Record<string, CloudAudioEntry> = {}
  let uploadedAudio = 0
  let reusedAudio = 0

  for (const song of songs) {
    if (!song.audioBlob) continue

    const pathname = cloudAudioPath(normalizedKey, song.id)
    const nextFingerprint = await fingerprint(song.audioBlob)
    const previousEntry = previous?.audio[song.id]

    if (isReusableAudio(previousEntry, pathname, nextFingerprint)) {
      audio[song.id] = previousEntry
      reusedAudio += 1
      continue
    }

    const uploaded = await transport.uploadAudio(pathname, song.audioBlob, normalizedKey)
    audio[song.id] = { ...uploaded, fingerprint: nextFingerprint }
    uploadedAudio += 1
  }

  const manifest: CloudManifest = {
    app: CLOUD_APP,
    version: CLOUD_VERSION,
    updatedAt: new Date().toISOString(),
    songs: songs.map(toMetadata),
    audio,
  }
  await transport.writeManifest(manifest, normalizedKey)

  return { uploadedAudio, reusedAudio, songs: songs.length }
}

export function parseCloudManifest(value: unknown, cloudKey: string): CloudManifest {
  const record = typeof value === 'object' && value !== null ? value as Partial<CloudManifest> : null
  if (
    record?.app !== CLOUD_APP ||
    record.version !== CLOUD_VERSION ||
    !Array.isArray(record.songs) ||
    typeof record.audio !== 'object' ||
    record.audio === null
  ) {
    throw new Error('O backup da nuvem está corrompido ou é incompatível.')
  }

  const songs = normalizeSongs(record.songs)
  const audio: Record<string, CloudAudioEntry> = {}
  for (const song of songs) {
    const raw = record.audio[song.id]
    if (!raw || raw.pathname !== cloudAudioPath(cloudKey, song.id)) continue
    if (
      typeof raw.fingerprint !== 'string' ||
      typeof raw.contentType !== 'string' ||
      typeof raw.size !== 'number' ||
      raw.size < 0
    ) continue
    audio[song.id] = raw
  }

  return {
    app: CLOUD_APP,
    version: CLOUD_VERSION,
    updatedAt: typeof record.updatedAt === 'string' ? record.updatedAt : '',
    songs,
    audio,
  }
}

export async function restoreFromCloud(
  cloudKey: string,
  transport: CloudTransport,
): Promise<Song[]> {
  const normalizedKey = normalizeCloudKey(cloudKey)
  if (!normalizedKey) throw new Error('Código da nuvem inválido.')

  const raw = await transport.readManifest(normalizedKey)
  if (!raw) throw new Error('Nenhum backup foi encontrado para este código.')
  const manifest = parseCloudManifest(raw, normalizedKey)

  return Promise.all(manifest.songs.map(async (metadata) => {
    const entry = manifest.audio[metadata.id]
    if (!entry) return withAudio(metadata)
    return withAudio(metadata, await transport.downloadAudio(entry, normalizedKey))
  }))
}
