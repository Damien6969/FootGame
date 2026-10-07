import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { saveBackupFile, formatBackupFilename, readBackupFile } from './backupService'
import type { CareerBackupData } from './cupRepository'
import { gzipSync } from 'node:zlib'
import { DecompressionStream } from 'node:stream/web'
import { File as NodeFile } from 'node:buffer'
import { generateInitialPersonPool } from '../persons/personGenerator'
import { validateCareerBackup } from './validateBackup'

describe('backupService', () => {
  const dummyBackup: CareerBackupData = {
    version: 1,
    exportedAt: '2026-09-24T09:00:00.000Z',
    archives: [],
    favoriteTeamIds: [],
  }

  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('formats backup filename with year and auto indicator', () => {
    const autoName = formatBackupFilename(2027, true)
    expect(autoName).toContain('coupe-des-communes-carriere-Saison-2027')
    expect(autoName).toMatch(/\.json\.gz$/)

    const manualName = formatBackupFilename(2026, false)
    expect(manualName).toContain('coupe-des-communes-carriere-2026')
  })

  it('reads a compressed backup and still accepts a legacy JSON backup', async () => {
    vi.stubGlobal('DecompressionStream', DecompressionStream)
    const json = JSON.stringify(dummyBackup)
    const zipped = new NodeFile([new Uint8Array(gzipSync(json))], 'career.json.gz') as unknown as File
    const legacy = new NodeFile([json], 'career.json') as unknown as File

    expect(await readBackupFile(zipped)).toEqual(dummyBackup)
    expect(await readBackupFile(legacy)).toEqual(dummyBackup)
  })

  it('round trips dual citizenship in a compressed career backup', async () => {
    vi.stubGlobal('DecompressionStream', DecompressionStream)
    const commune = { id: '75056', name: 'Paris', population: 2100000, departmentId: '75', regionId: '11', zoneId: 'ZONE_NORD', conferenceId: 'CONF_NORD' }
    const generated = generateInitialPersonPool({ count: 1, communes: [commune], clubs: [], seed: 'backup-identity' })[0]
    const person = { ...generated, nationality: 'FR', secondNationality: 'DZ' }
    const backup: CareerBackupData = { ...dummyBackup, session: {
      id: 'active', seed: 'identity-2026', datasetVersion: 'test', roundNumber: 1,
      activeTeamIds: [], round: { matches: [], byeTeamIds: [] }, results: {}, history: [], persons: [person],
    } }
    const file = new NodeFile([new Uint8Array(gzipSync(JSON.stringify(backup)))], 'identity.json.gz') as unknown as File
    const restored = await readBackupFile(file)
    validateCareerBackup(restored)
    expect(restored.session?.persons?.[0]).toEqual(person)
  })

  it('saves locally via fetch when server endpoint is available', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, filePath: 'sauvegardes/test.json', filename: 'test.json' }),
    })

    const result = await saveBackupFile(dummyBackup, {
      filename: 'test.json',
      isAuto: true,
      triggerDownload: false,
    })

    expect(result.success).toBe(true)
    expect(result.savedLocally).toBe(true)
    expect(result.localPath).toBe('sauvegardes/test.json')
  })

  it('falls back to download if fetch fails and download is allowed', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'))

    const result = await saveBackupFile(dummyBackup, {
      filename: 'fallback.json',
      triggerDownload: true,
    })

    expect(result.savedLocally).toBe(false)
    expect(result.filename).toBe('fallback.json')
  })
})
