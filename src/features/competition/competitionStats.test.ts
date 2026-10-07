import { describe, expect, it } from 'vitest'
import { computeCompetitionStats } from './competitionStats'
import type { CupSession } from '../storage/cupRepository'
import type { Person } from '../persons/types'

describe('computeCompetitionStats', () => {
  const p1: Person = {
    id: 'p-scorer',
    firstName: 'Kylian',
    lastName: 'Mbappé',
    age: 26,
    nationality: 'FR',
    birthCommuneId: '75056',
    birthCommuneName: 'Paris',
    birthDepartmentId: '75',
    currentClubId: 'club-paris',
    primaryRole: 'PLAYER',
    position: 'ATTACKER',
    attack: 30,
    defense: 12,
    careerYears: 8,
  }

  const p2: Person = {
    id: 'p-defender',
    firstName: 'William',
    lastName: 'Saliba',
    age: 24,
    nationality: 'FR',
    birthCommuneId: '93005',
    birthCommuneName: 'Bondy',
    birthDepartmentId: '93',
    currentClubId: 'club-marseille',
    primaryRole: 'PLAYER',
    position: 'DEFENDER',
    attack: 10,
    defense: 29,
    careerYears: 6,
  }

  const mockSession: CupSession = {
    id: 'active',
    seed: 'test-seed',
    seasonYear: 2026,
    datasetVersion: '1.0',
    activeTeamIds: ['club-paris', 'club-marseille'],
    roundNumber: 2,
    round: { matches: [], byeTeamIds: [] },
    results: {},
    history: [
      {
        roundNumber: 1,
        homeTeamId: 'club-paris',
        awayTeamId: 'club-marseille',
        result: {
          matchId: 'match-1',
          homeScore: 2,
          awayScore: 0,
          winnerId: 'club-paris',
          events: [
            { sequence: 1, teamId: 'club-paris', kind: 'GOAL', actorId: 'p-scorer', actorName: 'Kylian Mbappé', actorRole: 'ATTACKER' },
            { sequence: 2, teamId: 'club-paris', kind: 'CHANCE', actorId: 'p-scorer', defenderId: 'p-defender', defenderName: 'William Saliba' },
            { sequence: 3, teamId: 'club-paris', kind: 'GOAL', actorId: 'p-scorer', actorName: 'Kylian Mbappé', actorRole: 'ATTACKER' },
          ],
        },
      },
    ],
  }

  it('aggregates scorers, shots, and defensive interventions accurately', () => {
    const stats = computeCompetitionStats(mockSession, [p1, p2])

    expect(stats.totalMatches).toBe(1)
    expect(stats.totalGoals).toBe(2)
    expect(stats.personalityGoals).toBe(2)
    expect(stats.totalDefensiveStops).toBe(1)

    // Top scorer
    expect(stats.topScorers).toHaveLength(1)
    expect(stats.topScorers[0].person.id).toBe('p-scorer')
    expect(stats.topScorers[0].goals).toBe(2)
    expect(stats.topScorers[0].shots).toBe(3)
    expect(stats.topScorers[0].conversionRate).toBeCloseTo(66.7, 1)

    // Top defender
    expect(stats.topDefenders).toHaveLength(1)
    expect(stats.topDefenders[0].person.id).toBe('p-defender')
    expect(stats.topDefenders[0].defensiveStops).toBe(1)
  })

  it('handles empty session results cleanly', () => {
    const emptySession: CupSession = {
      ...mockSession,
      history: [],
      results: {},
    }
    const stats = computeCompetitionStats(emptySession, [p1, p2])
    expect(stats.totalMatches).toBe(0)
    expect(stats.topScorers).toHaveLength(0)
    expect(stats.topDefenders).toHaveLength(0)
  })
  it('ignores substitutes in individual leaderboards', () => {
    const substitute = { ...p1, id: 'reserve', attack: 1, defense: 1 }
    const defender = { ...p2, id: 'home-defender', currentClubId: p1.currentClubId }
    const unknownEvent = { sequence: 4, teamId: 'club-paris', kind: 'GOAL' as const, actorId: 'reserve' }
    const session = { ...mockSession, history: mockSession.history.map(m => ({ ...m, result: { ...m.result, events: [...m.result.events, unknownEvent] } })) }
    expect(computeCompetitionStats(session, [p1, p2, defender, substitute]).topScorers.map(p => p.person.id)).toEqual(['p-scorer'])
  })

  it('counts extra time defensive stops and golden goals', () => {
    const sessionWithExtraTime: CupSession = {
      ...mockSession,
      history: [
        {
          roundNumber: 1,
          homeTeamId: 'club-paris',
          awayTeamId: 'club-marseille',
          result: {
            matchId: 'match-ot',
            homeScore: 1,
            awayScore: 0,
            winnerId: 'club-paris',
            isExtraTime: true,
            events: [
              // Regular time stop
              { sequence: 1, teamId: 'club-paris', kind: 'CHANCE', actorId: 'p-scorer', defenderId: 'p-defender', defenderName: 'William Saliba' },
              // Extra time stop follows the same rule as regular time
              { sequence: 2, teamId: 'club-paris', kind: 'CHANCE', actorId: 'p-scorer', defenderId: 'p-defender', defenderName: 'William Saliba', isExtraTime: true },
              // Extra time golden goal (must still be counted)
              { sequence: 3, teamId: 'club-paris', kind: 'GOAL', actorId: 'p-scorer', actorName: 'Kylian Mbappé', actorRole: 'ATTACKER', isExtraTime: true },
            ],
          },
        },
      ],
    }
    const stats = computeCompetitionStats(sessionWithExtraTime, [p1, p2])
    expect(stats.totalGoals).toBe(1)
    expect(stats.personalityGoals).toBe(1)
    expect(stats.totalDefensiveStops).toBe(2)
    expect(stats.topDefenders[0].defensiveStops).toBe(2)
    // Golden goal is counted
    expect(stats.topScorers[0].goals).toBe(1)
  })
})
