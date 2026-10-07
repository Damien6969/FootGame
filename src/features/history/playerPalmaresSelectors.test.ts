import { describe, expect, it } from 'vitest'
import {
  getRankedPlayerPalmares,
  extractBallonOrHistory,
  extractTopScorersHistory,
  extractTopDefendersHistory,
  extractAllAwardsHistory,
} from './playerPalmaresSelectors'
import type { Person } from '../persons/types'
import type { SeasonArchive } from '../storage/cupRepository'
import type { SeasonAwards } from '../awards/types'

const mockPerson1: Person = {
  id: 'p1',
  firstName: 'Kylian',
  lastName: 'Mbappe',
  age: 26,
  nationality: 'FR',
  careerYears: 5,
  attack: 28,
  defense: 12,
  primaryRole: 'PLAYER',
  position: 'ATTACKER',
  assignedPosition: 'ATTACKER',
  birthCommuneId: 'PARIS',
  birthCommuneName: 'Paris',
  birthDepartmentId: '75',
  currentClubId: 'PARIS',
  isRetired: false,
  careerHistory: [
    {
      year: 2026,
      clubId: 'PARIS',
      clubName: 'Paris',
      role: 'PLAYER',
      age: 26,
      attack: 28,
      defense: 12,
      assignedPosition: 'ATTACKER',
      isStarter: true,
      matchesPlayed: 7,
      goals: 12,
      defensiveStops: 2,
      shots: 25,
      shotsMissed: 8,
      roundReached: 14,
      stageLabel: 'Champion de France 🏆',
      isNationalChampion: true,
      isConferenceChampion: true,
      isRegionChampion: true,
      isDepartmentChampion: true,
      conferenceId: 'CONF_NORD',
      regionId: '11',
      departmentId: '75',
      individualHonors: [
        { awardId: 'ballon-or', title: 'Ballon d’Or' },
        { awardId: 'top-scorer', title: 'Soulier d’Or · Meilleur buteur' },
      ],
    },
  ],
}

const mockPerson2: Person = {
  id: 'p2',
  firstName: 'William',
  lastName: 'Saliba',
  age: 25,
  nationality: 'FR',
  careerYears: 5,
  attack: 10,
  defense: 29,
  primaryRole: 'PLAYER',
  position: 'DEFENDER',
  assignedPosition: 'DEFENDER',
  birthCommuneId: 'RENNES',
  birthCommuneName: 'Rennes',
  birthDepartmentId: '35',
  currentClubId: 'RENNES',
  isRetired: false,
  careerHistory: [
    {
      year: 2026,
      clubId: 'RENNES',
      clubName: 'Rennes',
      role: 'PLAYER',
      age: 25,
      attack: 10,
      defense: 29,
      assignedPosition: 'DEFENDER',
      isStarter: true,
      matchesPlayed: 6,
      goals: 1,
      defensiveStops: 24,
      shots: 2,
      shotsMissed: 1,
      roundReached: 13,
      stageLabel: 'Demi-finaliste National 🥉',
      isNationalChampion: false,
      isConferenceChampion: true,
      isRegionChampion: true,
      isDepartmentChampion: true,
      conferenceId: 'CONF_OUEST',
      regionId: '53',
      departmentId: '35',
      individualHonors: [
        { awardId: 'best-defender', title: 'Meilleur défenseur de la saison' },
        { awardId: 'top-stops', title: 'Bouclier d’Or · Roi des interventions' },
      ],
    },
  ],
}

const mockAwards2026: SeasonAwards = {
  version: 1,
  year: 2026,
  minimumMatches: 3,
  awards: [
    {
      id: 'ballon-or',
      title: 'Ballon d’Or',
      stage: 'FINAL',
      metric: 'OVERALL',
      winners: [
        {
          personId: 'p1',
          firstName: 'Kylian',
          lastName: 'Mbappe',
          age: 26,
          clubId: 'PARIS',
          clubName: 'Paris',
          conferenceId: 'CONF_NORD',
          position: 'ATTACKER',
          matchesPlayed: 7,
          goals: 12,
          defensiveStops: 2,
          shots: 25,
          shotsMissed: 8,
          attackScore: 92,
          defenseScore: 20,
          overallScore: 95.5,
          awardScore: 97.2,
          juryAdjustment: 0.018,
          isChampion: true,
        },
      ],
      nominees: [
        {
          personId: 'p2',
          firstName: 'William',
          lastName: 'Saliba',
          age: 25,
          clubId: 'RENNES',
          clubName: 'Rennes',
          conferenceId: 'CONF_OUEST',
          position: 'DEFENDER',
          matchesPlayed: 6,
          goals: 1,
          defensiveStops: 24,
          shots: 2,
          shotsMissed: 1,
          attackScore: 15,
          defenseScore: 95,
          overallScore: 89.2,
          awardScore: 90.1,
          juryAdjustment: 0.01,
        },
      ],
    },
    {
      id: 'top-scorer',
      title: 'Soulier d’Or · Meilleur buteur',
      stage: 'NATIONAL',
      metric: 'GOALS',
      winners: [
        {
          personId: 'p1',
          firstName: 'Kylian',
          lastName: 'Mbappe',
          age: 26,
          clubId: 'PARIS',
          clubName: 'Paris',
          conferenceId: 'CONF_NORD',
          position: 'ATTACKER',
          matchesPlayed: 7,
          goals: 12,
          defensiveStops: 2,
          shots: 25,
          shotsMissed: 8,
          attackScore: 92,
          defenseScore: 20,
          overallScore: 95.5,
          awardScore: 12,
        },
      ],
      nominees: [],
    },
    {
      id: 'top-stops',
      title: 'Bouclier d’Or · Roi des interventions',
      stage: 'NATIONAL',
      metric: 'STOPS',
      winners: [
        {
          personId: 'p2',
          firstName: 'William',
          lastName: 'Saliba',
          age: 25,
          clubId: 'RENNES',
          clubName: 'Rennes',
          conferenceId: 'CONF_OUEST',
          position: 'DEFENDER',
          matchesPlayed: 6,
          goals: 1,
          defensiveStops: 24,
          shots: 2,
          shotsMissed: 1,
          attackScore: 15,
          defenseScore: 95,
          overallScore: 89.2,
          awardScore: 24,
        },
      ],
      nominees: [],
    },
    {
      id: 'best-defender',
      title: 'Meilleur défenseur de la saison',
      stage: 'NATIONAL',
      metric: 'DEFENSE',
      winners: [
        {
          personId: 'p2',
          firstName: 'William',
          lastName: 'Saliba',
          age: 25,
          clubId: 'RENNES',
          clubName: 'Rennes',
          conferenceId: 'CONF_OUEST',
          position: 'DEFENDER',
          matchesPlayed: 6,
          goals: 1,
          defensiveStops: 24,
          shots: 2,
          shotsMissed: 1,
          attackScore: 15,
          defenseScore: 95,
          overallScore: 89.2,
          awardScore: 95.8,
        },
      ],
      nominees: [],
    },
    {
      id: 'best-attacker',
      title: 'Meilleur attaquant de la saison',
      stage: 'NATIONAL',
      metric: 'ATTACK',
      winners: [
        {
          personId: 'p1',
          firstName: 'Kylian',
          lastName: 'Mbappe',
          age: 26,
          clubId: 'PARIS',
          clubName: 'Paris',
          conferenceId: 'CONF_NORD',
          position: 'ATTACKER',
          matchesPlayed: 7,
          goals: 12,
          defensiveStops: 2,
          shots: 25,
          shotsMissed: 8,
          attackScore: 92,
          defenseScore: 20,
          overallScore: 95.5,
          awardScore: 92.5,
        },
      ],
      nominees: [],
    },
  ],
}

const mockArchive: SeasonArchive = {
  year: 2026,
  seed: 'coupe-2026',
  completedAt: '2026-06-01T20:00:00.000Z',
  datasetVersion: '2026.1',
  nationalChampionId: 'PARIS',
  conferenceChampions: { CONF_NORD: 'PARIS', CONF_OUEST: 'RENNES' },
  finalFourTeamIds: ['PARIS', 'RENNES'],
  totalMatches: 3,
  teamPerformances: {
    PARIS: {
      teamId: 'PARIS',
      roundReached: 14,
      stageLabel: 'Champion de France 🏆',
      isNationalChampion: true,
      isConferenceChampion: true,
      isRegionChampion: true,
      isDepartmentChampion: true,
      matchesWon: 3,
      matchesPlayed: 3,
    },
    RENNES: {
      teamId: 'RENNES',
      roundReached: 13,
      stageLabel: 'Demi-finaliste National 🥉',
      isNationalChampion: false,
      isConferenceChampion: true,
      isRegionChampion: true,
      isDepartmentChampion: true,
      matchesWon: 2,
      matchesPlayed: 3,
    },
  },
  history: [],
  persons: [mockPerson1, mockPerson2],
  individualAwards: mockAwards2026,
}

describe('playerPalmaresSelectors', () => {
  it('ranks players by prestige: Ballon d’Or and titles', () => {
    const ranked = getRankedPlayerPalmares([mockPerson1, mockPerson2], [mockArchive])
    expect(ranked.length).toBe(2)

    // Player 1 (Mbappe) has Ballon d'Or + National Champion
    expect(ranked[0].person.id).toBe('p1')
    expect(ranked[0].rank).toBe(1)
    expect(ranked[0].ballonOrCount).toBe(1)
    expect(ranked[0].nationalTitles).toBe(1)
    expect(ranked[0].topScorerCount).toBe(1)
    expect(ranked[0].totalTitles).toBeGreaterThan(0)

    // Player 2 (Saliba) has Best Defender + Top Stops + Conference Champion
    expect(ranked[1].person.id).toBe('p2')
    expect(ranked[1].rank).toBe(2)
    expect(ranked[1].ballonOrCount).toBe(0)
    expect(ranked[1].bestDefenderCount).toBe(1)
    expect(ranked[1].topStopsCount).toBe(1)
  })

  it('extracts Ballon d’Or history per edition with winner and nominees', () => {
    const list = extractBallonOrHistory([mockArchive])
    expect(list.length).toBe(1)
    expect(list[0].year).toBe(2026)
    expect(list[0].winner.personId).toBe('p1')
    expect(list[0].nominees.length).toBe(1)
    expect(list[0].nominees[0].personId).toBe('p2')
  })

  it('extracts top scorers history per edition', () => {
    const list = extractTopScorersHistory([mockArchive])
    expect(list.length).toBe(1)
    expect(list[0].year).toBe(2026)
    expect(list[0].winner.personId).toBe('p1')
    expect(list[0].goals).toBe(12)
    expect(list[0].matchesPlayed).toBe(7)
    expect(list[0].bestAttackerWinner?.personId).toBe('p1')
  })

  it('extracts top defenders and Bouclier d’Or history per edition', () => {
    const list = extractTopDefendersHistory([mockArchive])
    expect(list.length).toBe(1)
    expect(list[0].year).toBe(2026)
    expect(list[0].stopsWinner?.personId).toBe('p2')
    expect(list[0].stopsCount).toBe(24)
    expect(list[0].bestDefenderWinner?.personId).toBe('p2')
  })

  it('extracts all individual awards history', () => {
    const list = extractAllAwardsHistory([mockArchive])
    expect(list.length).toBe(1)
    expect(list[0].year).toBe(2026)
    expect(list[0].ballonOr?.personId).toBe('p1')
    expect(list[0].topScorer?.personId).toBe('p1')
    expect(list[0].topStops?.personId).toBe('p2')
    expect(list[0].bestDefender?.personId).toBe('p2')
  })
})
