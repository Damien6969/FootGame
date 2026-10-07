import type { CareerBackupData } from './cupRepository'

export type BackupSaveResult = {
  success: boolean
  filename: string
  savedLocally: boolean
  localPath?: string
  downloaded: boolean
  error?: string
}

export function formatBackupFilename(year: number, isAuto = false): string {
  const dateStr = new Date().toISOString().slice(0, 10)
  const now = new Date()
  const hours = String(now.getHours()).padStart(2, '0')
  const minutes = String(now.getMinutes()).padStart(2, '0')
  const seconds = String(now.getSeconds()).padStart(2, '0')
  const timeStr = `${hours}h${minutes}m${seconds}`

  if (isAuto) {
    return `coupe-des-communes-carriere-Saison-${year}-${dateStr}_${timeStr}.json.gz`
  }
  return `coupe-des-communes-carriere-${year}-${dateStr}.json.gz`
}

export async function readBackupFile(file: File): Promise<unknown> {
  const text = file.name.toLowerCase().endsWith('.gz')
    ? await new Response(file.stream().pipeThrough(new DecompressionStream('gzip'))).text()
    : await file.text()
  return JSON.parse(text)
}

/**
 * Saves career backup data directly into the local `sauvegardes/` folder
 * via the local server endpoint, and optionally triggers a browser download.
 */
export async function saveBackupFile(
  data: CareerBackupData,
  options?: {
    filename?: string
    seasonYear?: number
    isAuto?: boolean
    triggerDownload?: boolean
  },
): Promise<BackupSaveResult> {
  const currentYear = options?.seasonYear ?? data.session?.seasonYear ?? 2026
  const filename = options?.filename ?? formatBackupFilename(currentYear, options?.isAuto)

  let savedLocally = false
  let localPath: string | undefined
  let errorMsg: string | undefined

  // 1. Try to save directly to local folder via dev server middleware
  try {
    const res = await fetch('/api/backup/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename, data }),
    })
    if (res.ok) {
      const json = await res.json()
      if (json.success) {
        savedLocally = true
        localPath = json.filePath
      }
    }
  } catch (err) {
    errorMsg = err instanceof Error ? err.message : String(err)
  }

  // 2. Trigger browser download if explicitly requested or if local save was not possible
  let downloaded = false
  const shouldDownload = options?.triggerDownload ?? (!savedLocally && typeof window !== 'undefined')
  if (shouldDownload && typeof document !== 'undefined') {
    try {
      const jsonStr = JSON.stringify(data)
      const compressed = filename.endsWith('.gz') && typeof CompressionStream !== 'undefined'
      const blob = compressed
        ? await new Response(new Blob([jsonStr]).stream().pipeThrough(new CompressionStream('gzip'))).blob()
        : new Blob([jsonStr], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = compressed ? filename : filename.replace(/\.gz$/, '')
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      downloaded = true
    } catch {
      // Ignore download errors
    }
  }

  return {
    success: savedLocally || downloaded,
    filename,
    savedLocally,
    localPath,
    downloaded,
    error: errorMsg,
  }
}
