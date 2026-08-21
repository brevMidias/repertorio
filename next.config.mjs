import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Ancorar a raiz evita que o Turbopack suba até o diretório do usuário quando
 * encontra um lockfile lá fora.
 */
const projectRoot = dirname(fileURLToPath(import.meta.url))

/** @type {import('next').NextConfig} */
const nextConfig = {
  turbopack: {
    root: projectRoot,
  },
  images: {
    unoptimized: true,
  },
}

export default nextConfig
