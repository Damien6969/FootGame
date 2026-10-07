import { expect, it } from 'vitest'
import { collectPlayerSeasonStatistics } from './playerStatistics'
import type { Person } from './types'

it('counts an attributed defensive intervention in extra time just like a regulation intervention', () => {
  const person: Person = {
    id: 'def', firstName: 'Paul', lastName: 'Test', nationality: 'FR',
    age: 25, careerYears: 4, attack: 5, defense: 20, primaryRole: 'PLAYER',
    position: 'DEFENDER', assignedPosition: 'DEFENDER', currentClubId: 'away',
    birthCommuneId: 'away', birthCommuneName: 'Ville', birthDepartmentId: '75', isRetired: false,
  }
  const stats = collectPlayerSeasonStatistics([{
    homeTeamId: 'home', awayTeamId: 'away',
    result: {
      matchId: 'extra', homeScore: 1, awayScore: 0, winnerId: 'home',
      events: [
        { sequence: 1, teamId: 'home', kind: 'CHANCE', defenderId: 'def' },
        { sequence: 2, teamId: 'home', kind: 'CHANCE', defenderId: 'def', isExtraTime: true },
        { sequence: 3, teamId: 'home', kind: 'CHANCE', detail: 'Tir non cadré' },
      ],
    },
  }], [person]).get('def')!
  expect(stats.defensiveStops).toBe(2)
  expect(stats.matchesPlayed).toBe(1)
})
