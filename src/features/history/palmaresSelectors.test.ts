import { describe, expect, it } from 'vitest'
import {
  parseSeasonYear,
  getStageLabel,
  buildSeasonArchive,
  computeTeamRecords,
  getRankedPalmares,
  computeRegionPalmares,
  computeDepartmentPalmares,
} from './palmaresSelectors'
import type { GeographyDataset, Commune } from '../geography/types'
import { toArchiveSummary, type CupSession } from '../storage/cupRepository'

const mockCommunes: Commune[] = [
  { id: 'PARIS', name: 'Paris', departmentId: '75', regionId: '11', zoneId: 'ZONE_NORD', conferenceId: 'CONF_NORD', population: 2100000 },
  { id: 'RENNES', name: 'Rennes', departmentId: '35', regionId: '53', zoneId: 'ZONE_OUEST', conferenceId: 'CONF_OUEST', population: 220000 },
  { id: 'BORDEAUX', name: 'Bordeaux', departmentId: '33', regionId: '75', zoneId: 'ZONE_SUD_OUEST', conferenceId: 'CONF_SUD_OUEST', population: 260000 },
  { id: 'MARSEILLE', name: 'Marseille', departmentId: '13', regionId: '93', zoneId: 'ZONE_SUD_EST', conferenceId: 'CONF_SUD_EST', population: 870000 },
]

const mockDataset: GeographyDataset = {
  version: '2026.1',
  sourceLabel: 'Insee 2026',
  sourceUrl: 'https://insee.fr',
  communes: mockCommunes,
}

describe('palmaresSelectors', () => {
  it('parses season year from seed string', () => {
    expect(parseSeasonYear('coupe-2026')).toBe(2026)
    expect(parseSeasonYear('seed-2030-final')).toBe(2030)
    expect(parseSeasonYear('no-year-seed', 2026)).toBe(2026)
  })

  it('generates correct stage labels', () => {
    expect(getStageLabel(14, { isWinner: true })).toBe('Champion de France 🏆')
    expect(getStageLabel(14, { isFinalist: true })).toBe('Finaliste National 🥈')
    expect(getStageLabel(13)).toBe('Demi-finaliste National 🥉')
    expect(getStageLabel(12, { isConferenceWinner: true })).toBe('Champion de Conférence 👑')
    expect(getStageLabel(10)).toBe('Quarts de Conférence')
    expect(getStageLabel(9)).toBe('8es de Conférence')
    expect(getStageLabel(8)).toBe('Tour 8 (Régional)')
    expect(getStageLabel(7)).toBe('Tour 7 (Régional)')
    expect(getStageLabel(6)).toBe('Tour 6 (Régional)')
    expect(getStageLabel(5)).toBe('Tour 5 (Régional)')
    expect(getStageLabel(4)).toBe('Tour 4 (Départemental)')
    expect(getStageLabel(1)).toBe('Tour 1 (Départemental)')
  })

  it('builds a complete season archive and aggregates team trophy records', () => {
    // Simulate a completed session for year 2026
    const session2026: CupSession = {
      id: 'active',
      seed: 'coupe-2026',
      seasonYear: 2026,
      datasetVersion: '2026.1',
      activeTeamIds: ['PARIS'],
      roundNumber: 14,
      round: { matches: [], byeTeamIds: [] },
      results: {},
      championId: 'PARIS',
      conferenceChampionIds: {
        CONF_NORD: 'PARIS',
        CONF_OUEST: 'RENNES',
        CONF_SUD_OUEST: 'BORDEAUX',
        CONF_SUD_EST: 'MARSEILLE',
      },
      history: [
        // Tour 13 Demis
        {
          roundNumber: 13,
          homeTeamId: 'RENNES',
          awayTeamId: 'PARIS',
          result: { matchId: '13:1', homeScore: 1, awayScore: 2, winnerId: 'PARIS', events: [] },
        },
        {
          roundNumber: 13,
          homeTeamId: 'BORDEAUX',
          awayTeamId: 'MARSEILLE',
          result: { matchId: '13:2', homeScore: 3, awayScore: 1, winnerId: 'BORDEAUX', events: [] },
        },
        // Tour 14 Grande Finale
        {
          roundNumber: 14,
          homeTeamId: 'PARIS',
          awayTeamId: 'BORDEAUX',
          result: { matchId: '14:1', homeScore: 2, awayScore: 0, winnerId: 'PARIS', events: [] },
        },
      ],
    }

    const archive2026 = buildSeasonArchive(session2026, mockDataset)
    expect(archive2026.year).toBe(2026)
    expect(archive2026.nationalChampionId).toBe('PARIS')
    expect(archive2026.finalistId).toBe('BORDEAUX')
    expect(archive2026.conferenceChampions['CONF_NORD']).toBe('PARIS')
    expect(archive2026.conferenceChampions['CONF_OUEST']).toBe('RENNES')
    expect(archive2026.regionChampions?.['11']).toBe('PARIS')
    expect(archive2026.departmentChampions?.['75']).toBe('PARIS')
    expect(archive2026.teamPerformances['PARIS'].isNationalChampion).toBe(true)
    expect(archive2026.teamPerformances['PARIS'].isConferenceChampion).toBe(true)
    expect(archive2026.teamPerformances['PARIS'].isRegionChampion).toBe(true)
    expect(archive2026.teamPerformances['PARIS'].isDepartmentChampion).toBe(true)
    expect(archive2026.teamPerformances['PARIS'].clubName).toBeDefined()
    expect(archive2026.teamPerformances['PARIS'].clubName).toContain('Paris')
    expect(archive2026.teamPerformances['BORDEAUX'].clubName).toBeDefined()
    expect(archive2026.teamPerformances['BORDEAUX'].clubName).toContain('Bordeaux')
    expect(archive2026.teamPerformances['BORDEAUX'].stageLabel).toBe('Finaliste National 🥈')

    // Simulate year 2027 where Rennes wins
    const session2027: CupSession = {
      id: 'active',
      seed: 'coupe-2027',
      seasonYear: 2027,
      datasetVersion: '2026.1',
      activeTeamIds: ['RENNES'],
      roundNumber: 14,
      round: { matches: [], byeTeamIds: [] },
      results: {},
      championId: 'RENNES',
      conferenceChampionIds: {
        CONF_NORD: 'PARIS',
        CONF_OUEST: 'RENNES',
        CONF_SUD_OUEST: 'BORDEAUX',
        CONF_SUD_EST: 'MARSEILLE',
      },
      history: [
        {
          roundNumber: 14,
          homeTeamId: 'RENNES',
          awayTeamId: 'MARSEILLE',
          result: { matchId: '14:1', homeScore: 1, awayScore: 0, winnerId: 'RENNES', events: [] },
        },
      ],
    }
    const archive2027 = buildSeasonArchive(session2027, mockDataset)

    // Aggregate records across both seasons
    const records = computeTeamRecords([archive2026, archive2027])
    const parisRecord = records.get('PARIS')!
    expect(parisRecord.nationalTitles).toBe(1)
    expect(parisRecord.nationalTitleYears).toEqual([2026])
    expect(parisRecord.conferenceTitles).toBe(2) // 2026 and 2027
    expect(parisRecord.regionTitles).toBeGreaterThanOrEqual(1)
    expect(parisRecord.departmentTitles).toBeGreaterThanOrEqual(1)
    expect(parisRecord.bestPerformance.stageLabel).toBe('Champion de France 🏆')
    expect(parisRecord.seasons).toHaveLength(2)

    const rennesRecord = records.get('RENNES')!
    expect(rennesRecord.nationalTitles).toBe(1)
    expect(rennesRecord.nationalTitleYears).toEqual([2027])
    expect(rennesRecord.conferenceTitles).toBe(2)
    expect(rennesRecord.regionTitles).toBeGreaterThanOrEqual(1)
    expect(rennesRecord.departmentTitles).toBeGreaterThanOrEqual(1)

    const bordeauxRecord = records.get('BORDEAUX')!
    expect(bordeauxRecord.nationalTitles).toBe(0)
    expect(bordeauxRecord.conferenceTitles).toBe(2)

    // Palmarès ranking
    const byId = new Map(mockCommunes.map((c) => [c.id, c]))
    const ranked = getRankedPalmares(records, byId)
    expect(ranked.length).toBeGreaterThanOrEqual(3)
    // Paris or Rennes on top
    expect(ranked[0].record.nationalTitles).toBe(1)

    // Regional Palmares
    const regPalmares = computeRegionPalmares([archive2026, archive2027], mockDataset, records)
    expect(regPalmares.length).toBeGreaterThan(0)
    const ileDeFrance = regPalmares.find((r) => r.regionId === '11')
    expect(ileDeFrance).toBeDefined()
    expect(ileDeFrance?.latestChampion?.id).toBe('PARIS')
    expect(ileDeFrance?.mostTitledClub?.team.id).toBe('PARIS')

    // Departmental Palmares
    const deptPalmares = computeDepartmentPalmares([archive2026, archive2027], mockDataset, records)
    expect(deptPalmares.length).toBeGreaterThan(0)
    const parisDept = deptPalmares.find((d) => d.departmentId === '75')
    expect(parisDept).toBeDefined()
    expect(parisDept?.latestChampion?.id).toBe('PARIS')

    // Test with lightweight summaries (teamPerformances is empty in summaries)
    const summary2026 = toArchiveSummary(archive2026)
    const summary2027 = toArchiveSummary(archive2027)

    expect(summary2026.teamPerformances).toEqual({})
    expect(summary2027.teamPerformances).toEqual({})

    const summaryRecords = computeTeamRecords([summary2026, summary2027])
    const parisSummaryRecord = summaryRecords.get('PARIS')!
    expect(parisSummaryRecord.nationalTitles).toBe(1)
    expect(parisSummaryRecord.nationalTitleYears).toEqual([2026])
    expect(parisSummaryRecord.conferenceTitles).toBe(2)
    expect(parisSummaryRecord.regionTitles).toBeGreaterThanOrEqual(1)
    expect(parisSummaryRecord.departmentTitles).toBeGreaterThanOrEqual(1)

    const rennesSummaryRecord = summaryRecords.get('RENNES')!
    expect(rennesSummaryRecord.nationalTitles).toBe(1)
    expect(rennesSummaryRecord.nationalTitleYears).toEqual([2027])
    expect(rennesSummaryRecord.conferenceTitles).toBe(2)

    const summaryRanked = getRankedPalmares(summaryRecords, byId)
    expect(summaryRanked.length).toBeGreaterThanOrEqual(3)
    expect(summaryRanked[0].record.nationalTitles).toBe(1)

    // Test extreme fallback: even when teamPerformances is completely empty {}, conference champions in final four retain round 13
    const fullyStrippedSummary2027 = { ...summary2027, teamPerformances: {} }
    const strippedRecords = computeTeamRecords([fullyStrippedSummary2027])
    // Marseille in 2027 was conference champion and played round 14 (or final four)
    const marseilleRecord = strippedRecords.get('MARSEILLE')
    if (marseilleRecord) {
      expect(marseilleRecord.bestPerformance.roundNumber).toBeGreaterThanOrEqual(13)
    }
  })
})

