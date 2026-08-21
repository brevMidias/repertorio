import { get } from '@vercel/blob'

import { cloudKeyFromRequest, cloudPathBelongsToProfile } from '@/lib/cloud'

export const runtime = 'nodejs'

function jsonError(message: string, status: number): Response {
  return Response.json({ error: message }, { status })
}

export async function POST(request: Request): Promise<Response> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return jsonError('Vercel Blob ainda não está conectado a este projeto.', 503)
  }

  const cloudKey = cloudKeyFromRequest(request)
  if (!cloudKey) return jsonError('Código da nuvem inválido.', 401)

  try {
    const body = await request.json() as { pathname?: unknown }
    if (typeof body.pathname !== 'string' || !cloudPathBelongsToProfile(body.pathname, cloudKey)) {
      return jsonError('Arquivo de áudio inválido.', 400)
    }

    const result = await get(body.pathname, { access: 'private' })
    if (!result || result.statusCode !== 200) return jsonError('Áudio não encontrado.', 404)

    return new Response(result.stream, {
      headers: {
        'Content-Type': result.blob.contentType || 'audio/mpeg',
        'Content-Length': String(result.blob.size),
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch {
    return jsonError('Não foi possível baixar o áudio da Vercel.', 502)
  }
}
