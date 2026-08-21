import { handleUpload, type HandleUploadBody } from '@vercel/blob/client'

import { cloudKeyFromRequest, cloudPathBelongsToProfile } from '@/lib/cloud'

export const runtime = 'nodejs'

const MAX_AUDIO_BYTES = 100 * 1024 * 1024
const AUDIO_TYPES = [
  'audio/mpeg',
  'audio/mp3',
  'audio/mp4',
  'audio/aac',
  'audio/ogg',
  'audio/wav',
  'audio/x-wav',
  'audio/webm',
]

export async function POST(request: Request): Promise<Response> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return Response.json(
      { error: 'Vercel Blob ainda não está conectado a este projeto.' },
      { status: 503 },
    )
  }

  try {
    const body = await request.json() as HandleUploadBody
    const cloudKey = body.type === 'blob.generate-client-token'
      ? cloudKeyFromRequest(request)
      : null

    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        if (!cloudKey || !cloudPathBelongsToProfile(pathname, cloudKey)) {
          throw new Error('Código da nuvem ou caminho de áudio inválido.')
        }
        return {
          allowedContentTypes: AUDIO_TYPES,
          maximumSizeInBytes: MAX_AUDIO_BYTES,
          addRandomSuffix: false,
          allowOverwrite: true,
          cacheControlMaxAge: 31_536_000,
        }
      },
    })

    return Response.json(result)
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Não foi possível enviar o áudio.' },
      { status: 400 },
    )
  }
}
