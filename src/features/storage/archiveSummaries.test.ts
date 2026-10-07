import Dexie from 'dexie'
import { expect, it } from 'vitest'

it('adds lightweight summaries to an existing version 2 career without changing its archives', async () => {
  const legacy = new Dexie('coupe-des-communes')
  legacy.version(2).stores({ sessions: 'id', archives: 'year' })
  const archive = {
    year: 2026, seed: 'test-2026', completedAt: '2026-06-01', datasetVersion: 'test',
    nationalChampionId: 'a', conferenceChampions: {}, finalFourTeamIds: ['a'],
    totalMatches: 1, teamPerformances: {}, clubs: [{ id: 'a', name: 'A' }],
    history: [{ roundNumber: 14, homeTeamId: 'a', awayTeamId: 'b',
      result: { matchId: 'final', homeScore: 1, awayScore: 0, winnerId: 'a', events: [] } }],
  }
  await legacy.table('archives').put(archive)
  legacy.close()

  const { cupRepository } = await import('./cupRepository')
  const summaries = await cupRepository.loadArchiveSummaries()

  expect(summaries).toHaveLength(1)
  expect(summaries[0].summaryOnly).toBe(true)
  expect(summaries[0].history).toEqual([])
  expect(summaries[0].finalMatch?.result.matchId).toBe('final')
  expect(await cupRepository.loadArchive(2026)).toEqual(archive)
})

it('self-heals missing archiveSummaries when table is empty or missing seasons', async () => {
  const { cupRepository } = await import('./cupRepository')

  // Save 2 distinct season archives
  const arch2026 = {
    year: 2026, seed: 'test-2026', completedAt: '2026-06-01', datasetVersion: 'test',
    nationalChampionId: 'a', conferenceChampions: {}, finalFourTeamIds: ['a'],
    totalMatches: 1, teamPerformances: {}, clubs: [{ id: 'a', name: 'A' }],
    history: [{ roundNumber: 14, homeTeamId: 'a', awayTeamId: 'b',
      result: { matchId: 'final-2026', homeScore: 2, awayScore: 1, winnerId: 'a', events: [] } }],
  }
  const arch2027 = {
    year: 2027, seed: 'test-2027', completedAt: '2027-06-01', datasetVersion: 'test',
    nationalChampionId: 'b', conferenceChampions: {}, finalFourTeamIds: ['b'],
    totalMatches: 1, teamPerformances: {}, clubs: [{ id: 'b', name: 'B' }],
    history: [{ roundNumber: 14, homeTeamId: 'b', awayTeamId: 'a',
      result: { matchId: 'final-2027', homeScore: 3, awayScore: 0, winnerId: 'b', events: [] } }],
  }

  await cupRepository.saveArchive(arch2026 as any)
  await cupRepository.saveArchive(arch2027 as any)

  // Simulate archiveSummaries being deleted or out of sync (0 rows)
  // while archives table still contains both seasons
  const db = new Dexie('coupe-des-communes')
  db.version(5).stores({
    sessions: 'id',
    archives: 'year',
    archiveSummaries: 'year',
    playerSeasonHonors: 'id, personId, year, [personId+year]',
    playerPalmares: 'person.id, totalTitles, palmaresScore, rank',
    seasonAwardSummaries: 'year',
    teamSeasonPerformances: '[teamId+year], teamId, year',
  })
  await db.table('archiveSummaries').clear()
  expect(await db.table('archiveSummaries').count()).toBe(0)
  db.close()

  // loadArchiveSummaries must self-heal and return both seasons
  const summaries = await cupRepository.loadArchiveSummaries()
  expect(summaries).toHaveLength(2)
  expect(summaries.map(s => s.year)).toEqual([2027, 2026])
  expect(summaries[0].finalMatch?.result.matchId).toBe('final-2027')
  expect(summaries[1].finalMatch?.result.matchId).toBe('final-2026')
})

