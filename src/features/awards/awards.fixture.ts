import type { Person } from '../persons/types'
import type { Club } from '../teams/types'
import type { ArchivedMatch, CupSession } from '../storage/cupRepository'

export function player(id: string, clubId: string, position: Person['position'] = 'ATTACKER', age = 22): Person {
  return { id, firstName: id, lastName: 'Lauréat', age, nationality: 'FR', birthCommuneId: clubId,
    birthCommuneName: clubId, birthDepartmentId: '01', currentClubId: clubId, primaryRole: 'PLAYER',
    position, assignedPosition: position, attack: 20, defense: 20, careerYears: 1 }
}
export function club(id: string, conferenceId = 'CONF_OUEST'): Club {
  return { id, name: `Club ${id}`, shortName: id, communeId: id, communeName: id, communeIds: [id],
    communeNames: [id], departmentId: '01', regionId: '53', zoneId: 'OUEST', conferenceId, population: 1000, strength: 20 }
}
export function match(id: string, players: readonly Person[], goals = 1, stops = 1): ArchivedMatch {
  return { roundNumber: 1, homeTeamId: players[0].currentClubId!, awayTeamId: 'opponent',
    result: { matchId: id, homeScore: goals, awayScore: 0, winnerId: players[0].currentClubId!,
      events: players.flatMap(p => [
        ...Array.from({ length: goals }, (_, i) => ({ sequence: i, teamId: p.currentClubId!, kind: 'GOAL' as const, actorId: p.id })),
        ...Array.from({ length: stops }, (_, i) => ({ sequence: i + goals, teamId: 'opponent', kind: 'CHANCE' as const, defenderId: p.id })),
      ]) } }
}
export function finishedSession(persons: readonly Person[], history: readonly ArchivedMatch[]): CupSession {
  return { id: 'active', seed: 'awards-2026', seasonYear: 2026, datasetVersion: 'test', championId: 'a',
    activeTeamIds: ['a'], roundNumber: 14, round: { matches: [], byeTeamIds: [] }, results: {}, history,
    persons, clubs: [...new Set(persons.map(p => p.currentClubId!))].map(id => club(id)) }
}


