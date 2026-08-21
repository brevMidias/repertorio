'use client'

import { upload } from '@vercel/blob/client'

import {
  parseCloudManifest,
  type CloudManifest,
  type CloudTransport,
  type CloudUploadResult,
} from '@/lib/cloud'

const MULTIPART_THRESHOLD_BYTES = 4_500_000

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
type Uploader = (
  pathname: string,
  body: Blob,
  options: {
    access: 'private'
    handleUploadUrl: string
    headers: Record<string, string>
    contentType: string
    multipart: boolean
  },
) => Promise<Pick<CloudUploadResult, 'pathname' | 'contentType'>>

type CloudDependencies = {
  fetcher?: Fetcher
  uploader?: Uploader
}

function authorization(cloudKey: string): Record<string, string> {
  return { Authorization: `Bearer ${cloudKey}` }
}

async function responseError(response: Response): Promise<Error> {
  try {
    const payload = await response.json() as { error?: unknown }
    if (typeof payload.error === 'string') return new Error(payload.error)
  } catch {
    // Uma resposta sem JSON recebe a mensagem genérica abaixo.
  }
  return new Error('Não foi possível acessar a cópia na nuvem.')
}

export function createVercelCloudTransport(
  dependencies: CloudDependencies = {},
): CloudTransport {
  const fetcher = dependencies.fetcher ?? fetch
  const uploader = dependencies.uploader ?? upload

  return {
    async readManifest(cloudKey) {
      const response = await fetcher('/api/cloud/manifest', {
        headers: authorization(cloudKey),
        cache: 'no-store',
      })
      if (response.status === 404) return null
      if (!response.ok) throw await responseError(response)
      return parseCloudManifest(await response.json(), cloudKey)
    },

    async uploadAudio(pathname, blob, cloudKey) {
      const uploaded = await uploader(pathname, blob, {
        access: 'private',
        handleUploadUrl: '/api/cloud/upload',
        headers: authorization(cloudKey),
        contentType: blob.type || 'audio/mpeg',
        multipart: blob.size > MULTIPART_THRESHOLD_BYTES,
      })
      return {
        pathname: uploaded.pathname,
        contentType: uploaded.contentType,
        size: blob.size,
      }
    },

    async writeManifest(manifest: CloudManifest, cloudKey) {
      const response = await fetcher('/api/cloud/manifest', {
        method: 'PUT',
        headers: {
          ...authorization(cloudKey),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(manifest),
      })
      if (!response.ok) throw await responseError(response)
    },

    async downloadAudio(entry, cloudKey) {
      const response = await fetcher('/api/cloud/audio', {
        method: 'POST',
        headers: {
          ...authorization(cloudKey),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ pathname: entry.pathname }),
      })
      if (!response.ok) throw await responseError(response)
      return response.blob()
    },
  }
}

export const vercelCloudTransport = createVercelCloudTransport()
