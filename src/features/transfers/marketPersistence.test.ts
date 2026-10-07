import { describe, expect, it } from 'vitest'
import { buildSeasonArchive } from '../history/palmaresSelectors'
import { cupRepository, toArchiveSummary, type CupSession, type CareerBackupData } from '../storage/cupRepository'
import { validateCareerBackup } from '../storage/validateBackup'
import type { GeographyDataset } from '../geography/types'

const movement = {
  id: '2027:TRANSFER:p1', seasonYear: 2027, kind: 'TRANSFER', personId: 'p1',
  playerName: 'Alex Martin', age: 28, position: 'ATTACKER', rating: 24,
  fromClubId: 'a', fromClubName: 'Club A', toClubId: 'b', toClubName: 'Club B',
  distanceKm: 120, distanceFromClubName: 'Club de prêt', reason: 'AMBITION',
} as const
const session: CupSession = {
  id: 'active', seed: 'tournoi-2027', seasonYear: 2027, datasetVersion: 'test',
  activeTeamIds: [], roundNumber: 14, round: { matches: [], byeTeamIds: [] },
  results: {}, history: [], championId: 'b', transferMovements: [movement],
}
const dataset: GeographyDataset = { version: 'test', sourceLabel: 'test', sourceUrl: 'https://example.com', communes: [] }
const backup: CareerBackupData = { version: 1, exportedAt: '2027-06-01T00:00:00Z', session, archives: [] }

describe('market persistence', () => {
  it.each(['DYNAMICS', 'LIMOGEAGE', 'OPPORTUNITY'] as const)(
    'imports and preserves the recorded market reason %s', async reason => {
      const recordedMovement = { ...movement, reason, role: 'COACH' as const }
      const career = { ...backup, session: { ...session, transferMovements: [recordedMovement] } }
      expect(() => validateCareerBackup(career)).not.toThrow()
      await cupRepository.importBackup(career)
      expect((await cupRepository.load())?.transferMovements).toEqual([recordedMovement])
    },
  )

  it('keeps the season market in archives, summaries and stored careers', async () => {
    const archive = buildSeasonArchive(session, dataset, [])
    expect(archive.transferMovements).toEqual([movement])
    const summary = toArchiveSummary(archive)
    expect(summary.transferMovements).toEqual([movement])
    await cupRepository.commitSeasonTransition(archive, { ...session, seasonYear: 2028, transferMovements: [] })
    expect((await cupRepository.loadArchive(2027))?.transferMovements).toEqual([movement])
    expect((await cupRepository.loadArchiveSummaries()).find(a => a.year === 2027)?.transferMovements).toEqual([movement])
    expect((await cupRepository.load())?.transferMovements).toEqual([])
  })

  it('accepts recorded markets and legacy careers without a market', () => {
    expect(() => validateCareerBackup(backup)).not.toThrow()
    expect(() => validateCareerBackup({ ...backup, session: { ...session, transferMovements: undefined } })).not.toThrow()
  })

  it.each([
    { rating: NaN }, { rating: 31 }, { kind: 'SALE' }, { reason: 'UNKNOWN' },
    { distanceKm: -1 }, { toClubId: 'a' }, { seasonYear: 2026 },
  ])('rejects malformed market records before replacing a career: %j', change => {
    expect(() => validateCareerBackup({ ...backup, session: { ...session, transferMovements: [{ ...movement, ...change }] } })).toThrow(/Sauvegarde invalide/)
  })
})
