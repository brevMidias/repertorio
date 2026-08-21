import { get, put } from '@vercel/blob'

import {
  cloudKeyFromRequest,
  cloudManifestPath,
  parseCloudManifest,
} from '@/lib/cloud'

export const runtime = 'nodejs'

function errorResponse(message: string, status: number): Response {
  return Response.json({ error: message }, { status })
}

function authorize(request: Request): string | Response {
  const cloudKey = cloudKeyFromRequest(request)
  return cloudKey ?? errorResponse('Código da nuvem inválido.', 401)
}

function ensureBlobConfigured(): Response | null {
  return process.env.BLOB_READ_WRITE_TOKEN
    ? null
    : errorResponse('Vercel Blob ainda não está conectado a este projeto.', 503)
}

export async function GET(request: Request): Promise<Response> {
  const unavailable = ensureBlobConfigured()
  if (unavailable) return unavailable
  const authorization = authorize(request)
  if (authorization instanceof Response) return authorization

  try {
    const result = await get(cloudManifestPath(authorization), {
      access: 'private',
      useCache: false,
    })
    if (!result || result.statusCode !== 200) return errorResponse('Backup não encontrado.', 404)

    return new Response(result.stream, {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch {
    return errorResponse('Não foi possível ler o backup na Vercel.', 502)
  }
}

export async function PUT(request: Request): Promise<Response> {
  const unavailable = ensureBlobConfigured()
  if (unavailable) return unavailable
  const authorization = authorize(request)
  if (authorization instanceof Response) return authorization

  try {
    const raw = await request.text()
    if (raw.length > 2_000_000) return errorResponse('O repertório excede o limite de metadados.', 413)
    const manifest = parseCloudManifest(JSON.parse(raw), authorization)

    await put(cloudManifestPath(authorization), JSON.stringify(manifest), {
      access: 'private',
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: 'application/json',
      cacheControlMaxAge: 60,
    })
    return new Response(null, { status: 204 })
  } catch (error) {
    const message = error instanceof SyntaxError || error instanceof TypeError
      ? 'Backup da nuvem inválido.'
      : error instanceof Error
        ? error.message
        : 'Não foi possível salvar o backup na Vercel.'
    return errorResponse(message, 400)
  }
}
