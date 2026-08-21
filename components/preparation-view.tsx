'use client'

import { useRef, useState } from 'react'
import {
  CircleCheck,
  Clock3,
  Cloud,
  CloudDownload,
  CloudUpload,
  Copy,
  Download,
  FileAudio,
  Link2,
  Pencil,
  ShieldCheck,
  Upload,
} from 'lucide-react'

import type { CloudSyncController } from '@/hooks/use-cloud-sync'
import { parseBackup } from '@/lib/backup'
import { formatBytes, type StorageStatus } from '@/lib/storage-status'
import type { Song } from '@/lib/types'

type Feedback = { tone: 'ok' | 'error'; message: string }

type PreparationViewProps = {
  songs: Song[]
  storageStatus: StorageStatus | null
  onEdit: (song: Song) => void
  onExport: () => void
  onImport: (songs: Song[]) => void
  mutationsEnabled: boolean
  cloud: CloudSyncController
}

export function PreparationView({
  songs,
  storageStatus,
  onEdit,
  onExport,
  onImport,
  mutationsEnabled,
  cloud,
}: PreparationViewProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const [cloudCodeOverride, setCloudCodeOverride] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const cloudCode = cloudCodeOverride ?? cloud.cloudKey

  const ready = songs.filter((song) => song.status === 'Pronta').length
  const withAudio = songs.filter((song) => song.audioUrl).length
  const storageUsage =
    storageStatus?.usageBytes === undefined
      ? 'Uso ainda indisponível.'
      : `${formatBytes(storageStatus.usageBytes)} usados neste dispositivo.`

  const handleFile = async (file: File) => {
    try {
      const imported = parseBackup(await file.text())
      onImport(imported)
      setFeedback({
        tone: 'ok',
        message: `Backup importado: ${imported.length} ${imported.length === 1 ? 'música' : 'músicas'}. Os áudios precisam ser anexados de novo.`,
      })
    } catch (error) {
      setFeedback({
        tone: 'error',
        message: error instanceof Error ? error.message : 'Não foi possível ler o arquivo.',
      })
    }
  }

  return (
    <section className="content">
      <div className="page-heading">
        <div>
          <p className="eyebrow">ANTES DE COMEÇAR</p>
          <h1>Preparação</h1>
          <p className="muted">Uma última conferida para tocar sem surpresas.</p>
        </div>
      </div>

      <div className="prep-grid">
        <div className="prep-card" aria-live="polite">
          <ShieldCheck size={22} aria-hidden="true" />
          <div>
            {storageStatus === null ? (
              <>
                <strong>Verificando proteção offline…</strong>
                <p>O navegador está consultando a proteção do armazenamento local.</p>
              </>
            ) : storageStatus.persisted ? (
              <>
                <strong>Proteção offline ativa</strong>
                <p>{storageUsage} O navegador protege os dados contra limpeza automática.</p>
              </>
            ) : (
              <>
                <strong>Proteção limitada</strong>
                <p>{storageUsage} Mantenha a PWA instalada e evite limpar os dados do Chrome.</p>
              </>
            )}
          </div>
        </div>
        <div className="prep-card">
          <ShieldCheck size={22} aria-hidden="true" />
          <div>
            <strong>Repertório revisado</strong>
            <p>
              {ready} de {songs.length} {songs.length === 1 ? 'música' : 'músicas'} marcadas como
              prontas.
            </p>
          </div>
        </div>
        <div className="prep-card" aria-live="polite">
          <Cloud size={22} aria-hidden="true" />
          <div>
            <strong>Cópia na Vercel</strong>
            <p>
              {cloud.busy === 'backup'
                ? 'Enviando repertório e áudios…'
                : cloud.busy === 'restore'
                  ? 'Baixando a cópia para este aparelho…'
                  : cloud.ready
                    ? 'Pronta para salvar. O repertório continua disponível offline.'
                    : 'Preparando o código seguro da nuvem…'}
            </p>
          </div>
        </div>
        <div className="prep-card">
          <FileAudio size={22} aria-hidden="true" />
          <div>
            <strong>Áudios de referência</strong>
            <p>
              {withAudio} {withAudio === 1 ? 'arquivo' : 'arquivos'} disponíveis offline.
            </p>
          </div>
        </div>
        <div className="prep-card">
          <CircleCheck size={22} aria-hidden="true" />
          <div>
            <strong>Teste rápido</strong>
            <p>Abra o Modo palco e confira a leitura dos acordes.</p>
          </div>
        </div>
      </div>

      <div className="prep-list">
        <div className="list-heading">
          <strong>Checklist do repertório</strong>
          <span>Toque para editar</span>
        </div>
        {songs.map((song) => (
          <button
            key={song.id}
            type="button"
            className="prep-row"
            disabled={!mutationsEnabled}
            onClick={() => onEdit(song)}
            aria-label={`Editar ${song.title}`}
          >
            <span className={`check${song.status === 'Pronta' ? ' done' : ''}`} aria-hidden="true">
              {song.status === 'Pronta' ? <CircleCheck size={17} /> : <Clock3 size={17} />}
            </span>
            <span>
              <b>{song.title}</b>
              <small>
                {song.moment || 'Momento não definido'} · Tom {song.key}
              </small>
            </span>
            <Pencil size={17} aria-hidden="true" />
          </button>
        ))}
      </div>

      <div className="backup-actions">
        <button type="button" className="secondary-button" onClick={onExport}>
          <Download size={17} aria-hidden="true" />
          Exportar backup
        </button>

        <button
          type="button"
          className="secondary-button"
          disabled={!mutationsEnabled}
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload size={17} aria-hidden="true" />
          Importar backup
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          hidden
          disabled={!mutationsEnabled}
          onChange={(event) => {
            if (!mutationsEnabled) return
            const file = event.target.files?.[0]
            // Limpa o valor para permitir reimportar o mesmo arquivo em seguida.
            event.target.value = ''
            if (file) void handleFile(file)
          }}
        />

        {feedback && (
          <span className={feedback.tone === 'ok' ? 'import-ok' : 'import-error'} role="status">
            {feedback.message}
          </span>
        )}
      </div>

      <p className="muted backup-note">
        O arquivo JSON guarda letras, cifras e anotações. A cópia na Vercel inclui também os
        áudios; depois de restaurados, eles voltam a ficar disponíveis offline.
      </p>

      <div className="cloud-panel">
        <div className="cloud-panel-heading">
          <div>
            <p className="eyebrow">CÓPIA COMPLETA</p>
            <h2>Vercel Blob</h2>
          </div>
          <div className="cloud-actions">
            <button
              type="button"
              className="primary-button"
              disabled={!mutationsEnabled || !cloud.ready || cloud.busy !== null}
              onClick={() => void cloud.backup(songs)}
            >
              <CloudUpload size={17} aria-hidden="true" />
              {cloud.busy === 'backup' ? 'Salvando…' : 'Salvar na Vercel'}
            </button>
            <button
              type="button"
              className="secondary-button"
              disabled={!mutationsEnabled || !cloud.ready || cloud.busy !== null}
              onClick={() => {
                if (window.confirm('Restaurar substitui o repertório deste aparelho pela cópia da Vercel. Continuar?')) {
                  void cloud.restore()
                }
              }}
            >
              <CloudDownload size={17} aria-hidden="true" />
              {cloud.busy === 'restore' ? 'Restaurando…' : 'Restaurar da Vercel'}
            </button>
          </div>
        </div>

        <p className="muted cloud-explanation">
          Guarde este código em local seguro. Ele conecta outro celular à mesma cópia privada.
        </p>
        <div className="cloud-code-row">
          <label>
            Código da nuvem
            <input
              value={cloudCode}
              spellCheck={false}
              autoCapitalize="none"
              autoComplete="off"
              onChange={(event) => {
                setCopied(false)
                setCloudCodeOverride(event.target.value)
              }}
            />
          </label>
          <button
            type="button"
            className="secondary-button"
            disabled={!cloud.cloudKey}
            onClick={() => {
              void navigator.clipboard?.writeText(cloud.cloudKey).then(() => setCopied(true))
            }}
          >
            <Copy size={16} aria-hidden="true" />
            {copied ? 'Copiado' : 'Copiar'}
          </button>
          <button
            type="button"
            className="secondary-button"
            disabled={!cloud.ready || cloud.busy !== null}
            onClick={() => {
              void cloud.useCloudKey(cloudCode).then((changed) => {
                if (changed) setCloudCodeOverride(null)
              })
            }}
          >
            <Link2 size={16} aria-hidden="true" />
            Usar código
          </button>
        </div>

        {cloud.feedback && (
          <p
            className={cloud.feedback.tone === 'ok' ? 'import-ok' : 'import-error'}
            role="status"
          >
            {cloud.feedback.message}
          </p>
        )}
      </div>
    </section>
  )
}
