import { describe, expect, it } from 'vitest'
import type { Commune } from '../geography/types'
import type { RoundView } from './cupSelectors'
import { computeRoundJournal } from './roundJournal'

describe('computeRoundJournal', () => {
  const smallVillage: Commune = {
    id: '01001',
    name: 'Petit Village',
    population: 1200,
    departmentId: '01',
    regionId: '84',
    zoneId: 'SUD_EST',
    conferenceId: 'CONF_SUD_EST',
  }

  const bigCity: Commune = {
    id: '01002',
    name: 'Grande Métropole',
    population: 85000,
    departmentId: '01',
    regionId: '84',
    zoneId: 'SUD_EST',
    conferenceId: 'CONF_SUD_EST',
  }

  const mediumTown: Commune = {
    id: '01003',
    name: 'Ville Moyenne',
    population: 25000,
    departmentId: '01',
    regionId: '84',
    zoneId: 'SUD_EST',
    conferenceId: 'CONF_SUD_EST',
  }

  const byId = new Map<string, Commune>([
    [smallVillage.id, smallVillage],
    [bigCity.id, bigCity],
    [mediumTown.id, mediumTown],
  ])

  it('detects an upset when a small village defeats a big city', () => {
    const round: RoundView = {
      number: 1,
      phase: 'DEPARTMENT',
      isCurrent: true,
      matches: [{ id: 'M1', homeTeamId: smallVillage.id, awayTeamId: bigCity.id }],
      byeTeamIds: [mediumTown.id],
      results: {
        M1: {
          matchId: 'M1',
          homeScore: 2,
          awayScore: 1,
          winnerId: smallVillage.id,
          events: [],
        },
      },
    }

    const journal = computeRoundJournal(round, byId)

    expect(journal.totalMatches).toBe(1)
    expect(journal.completedMatches).toBe(1)
    expect(journal.totalGoals).toBe(3)
    expect(journal.upsets).toHaveLength(1)
    expect(journal.upsets[0].winner.id).toBe(smallVillage.id)
    expect(journal.upsets[0].loser.id).toBe(bigCity.id)
    expect(journal.upsets[0].popDifference).toBe(83800)
    expect(journal.petitPoucet?.commune.id).toBe(smallVillage.id)
  })

  it('identifies top clashes and highest scoring match', () => {
    const round: RoundView = {
      number: 1,
      phase: 'DEPARTMENT',
      isCurrent: true,
      matches: [{ id: 'M1', homeTeamId: bigCity.id, awayTeamId: mediumTown.id }],
      byeTeamIds: [],
      results: {
        M1: {
          matchId: 'M1',
          homeScore: 4,
          awayScore: 3,
          winnerId: bigCity.id,
          events: [],
        },
      },
    }

    const journal = computeRoundJournal(round, byId)

    expect(journal.topClashes).toHaveLength(1)
    expect(journal.topClashes[0].combinedPopulation).toBe(110000)
    expect(journal.highestScoring?.totalGoals).toBe(7)
  })

  it('identifies the lowest population commune of the current round even if eliminated or pending', () => {
    // Small village loses to big city
    const roundFinished: RoundView = {
      number: 2,
      phase: 'DEPARTMENT',
      isCurrent: true,
      matches: [{ id: 'M2', homeTeamId: smallVillage.id, awayTeamId: bigCity.id }],
      byeTeamIds: [],
      results: {
        M2: {
          matchId: 'M2',
          homeScore: 0,
          awayScore: 3,
          winnerId: bigCity.id,
          events: [],
        },
      },
    }

    const journalFinished = computeRoundJournal(roundFinished, byId)
    expect(journalFinished.petitPoucet?.commune.id).toBe(smallVillage.id)
    expect(journalFinished.petitPoucet?.status).toBe('ELIMINATED')

    // Round with no match played yet
    const roundPending: RoundView = {
      number: 2,
      phase: 'DEPARTMENT',
      isCurrent: true,
      matches: [{ id: 'M3', homeTeamId: bigCity.id, awayTeamId: smallVillage.id }],
      byeTeamIds: [],
      results: {},
    }

    const journalPending = computeRoundJournal(roundPending, byId)
    expect(journalPending.petitPoucet?.commune.id).toBe(smallVillage.id)
    expect(journalPending.petitPoucet?.status).toBe('PENDING')
  })
})
