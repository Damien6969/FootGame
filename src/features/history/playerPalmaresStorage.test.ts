import { describe, expect, it } from 'vitest'
import {
  extractSeasonPlayerHonors,
  extractSeasonAwardSummary,
  buildPlayerPalmaresFromHonors,
  convertAwardSummariesToBallonOr,
  convertAwardSummariesToTopScorers,
  convertAwardSummariesToTopDefenders,
  convertAwardSummariesToAllAwards,
  type SeasonAwardSummary,
} from './playerPalmaresStorage'
import type { Person } from '../persons/types'
import type { SeasonArchive } from '../storage/cupRepository'
import type { Club } from '../teams/types'

const mockParisClub: Club = {
  id: 'PARIS',
  name: 'Paris FC',
  shortName: 'PFC',
  communeId: 'PARIS',
  communeName: 'Paris',
  communeIds: ['PARIS'],
  communeNames: ['Paris'],
  departmentId: '75',
  regionId: '11',
  zoneId: 'ZONE_NORD',
  conferenceId: 'CONF_NORD',
  population: 2100000,
  strength: 85,
}

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
}

const mockArchive: SeasonArchive = {
  year: 2026,
  seed: 'coupe-2026',
  completedAt: '2026-06-01T20:00:00.000Z',
  datasetVersion: '2026.1',
  nationalChampionId: 'PARIS',
  finalistId: 'RENNES',
  conferenceChampions: {
    CONF_NORD: 'PARIS',
    CONF_OUEST: 'RENNES',
  },
  regionChampions: {
    '11': 'PARIS',
    '53': 'RENNES',
  },
  departmentChampions: {
    '75': 'PARIS',
    '35': 'RENNES',
  },
  finalFourTeamIds: ['PARIS', 'RENNES'],
  totalMatches: 63,
  teamPerformances: {
    PARIS: {
      teamId: 'PARIS',
      clubName: 'Paris FC',
      roundReached: 14,
      stageLabel: 'Champion de France 🏆',
      isNationalChampion: true,
      isConferenceChampion: true,
      isRegionChampion: true,
      isDepartmentChampion: true,
      conferenceId: 'CONF_NORD',
      regionId: '11',
      departmentId: '75',
      matchesWon: 6,
      matchesPlayed: 6,
    },
    RENNES: {
      teamId: 'RENNES',
      clubName: 'Rennes',
      roundReached: 14,
      stageLabel: 'Finaliste National 🥈',
      isNationalChampion: false,
      isConferenceChampion: true,
      isRegionChampion: true,
      isDepartmentChampion: true,
      conferenceId: 'CONF_OUEST',
      regionId: '53',
      departmentId: '35',
      matchesWon: 5,
      matchesPlayed: 6,
    },
  },
  history: [],
  persons: [mockPerson1, mockPerson2],
  individualAwards: {
    version: 1,
    scoringMethod: 'PHASE_TOTAL',
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
            clubName: 'Paris FC',
            conferenceId: 'CONF_NORD',
            position: 'ATTACKER',
            attackScore: 28,
            defenseScore: 12,
            overallScore: 28.5,
            awardScore: 28.5,
            goals: 8,
            defensiveStops: 1,
            matchesPlayed: 6,
            shots: 20,
            shotsMissed: 5,
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
            attackScore: 10,
            defenseScore: 29,
            overallScore: 24.0,
            awardScore: 24.0,
            goals: 1,
            defensiveStops: 18,
            matchesPlayed: 6,
            shots: 2,
            shotsMissed: 1,
            isChampion: false,
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
            clubName: 'Paris FC',
            conferenceId: 'CONF_NORD',
            position: 'ATTACKER',
            attackScore: 28,
            defenseScore: 12,
            overallScore: 28.5,
            awardScore: 8,
            goals: 8,
            defensiveStops: 1,
            matchesPlayed: 6,
            shots: 20,
            shotsMissed: 5,
            isChampion: true,
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
            attackScore: 10,
            defenseScore: 29,
            overallScore: 24.0,
            awardScore: 18,
            goals: 1,
            defensiveStops: 18,
            matchesPlayed: 6,
            shots: 2,
            shotsMissed: 1,
            isChampion: false,
          },
        ],
        nominees: [],
      },
    ],
  },
}

describe('playerPalmaresStorage', () => {
  it('extractSeasonAwardSummary extracts winners and nominees accurately', () => {
    const summary = extractSeasonAwardSummary(mockArchive)
    expect(summary).not.toBeNull()
    expect(summary?.year).toBe(2026)
    expect(summary?.minimumMatches).toBe(3)
    expect(summary?.ballonOr?.winner.personId).toBe('p1')
    expect(summary?.ballonOr?.nominees).toHaveLength(1)
    expect(summary?.topScorer?.winner.personId).toBe('p1')
    expect(summary?.topStops?.winner.personId).toBe('p2')
  })

  it('extractSeasonPlayerHonors extracts individual and team titles', () => {
    const clubsById = new Map([['PARIS', mockParisClub]])
    const honors = extractSeasonPlayerHonors(mockArchive, clubsById)
    expect(honors.length).toBeGreaterThan(0)

    const mbappe = honors.find((h) => h.personId === 'p1')
    expect(mbappe).toBeDefined()
    expect(mbappe?.isNationalChampion).toBe(true)
    expect(mbappe?.isConferenceChampion).toBe(true)
    expect(mbappe?.individualHonors).toHaveLength(2)
  })

  it('buildPlayerPalmaresFromHonors ranks players following official hierarchy', () => {
    const clubsById = new Map([['PARIS', mockParisClub]])
    const honors = extractSeasonPlayerHonors(mockArchive, clubsById)
    const ranked = buildPlayerPalmaresFromHonors(honors, undefined, clubsById)

    expect(ranked.length).toBeGreaterThanOrEqual(2)
    // p1 has Ballon d'Or + National Champion, so ranks #1
    expect(ranked[0].person.id).toBe('p1')
    expect(ranked[0].rank).toBe(1)
    expect(ranked[0].ballonOrCount).toBe(1)
    expect(ranked[0].nationalTitles).toBe(1)
    expect(ranked[0].totalTitles).toBeGreaterThan(0)

    // p2 ranks #2
    expect(ranked[1].person.id).toBe('p2')
    expect(ranked[1].rank).toBe(2)
  })

  it('converts award summaries to Ballon dOr and Top Scorers records', () => {
    const summary = extractSeasonAwardSummary(mockArchive)
    expect(summary).not.toBeNull()
    const summaries: SeasonAwardSummary[] = [summary!]

    const ballonOrRecords = convertAwardSummariesToBallonOr(summaries)
    expect(ballonOrRecords).toHaveLength(1)
    expect(ballonOrRecords[0].year).toBe(2026)
    expect(ballonOrRecords[0].winner.personId).toBe('p1')
    expect(ballonOrRecords[0].nominees).toHaveLength(1)

    const scorerRecords = convertAwardSummariesToTopScorers(summaries)
    expect(scorerRecords).toHaveLength(1)
    expect(scorerRecords[0].goals).toBe(8)
    expect(scorerRecords[0].ratio).toBeCloseTo(8 / 6)

    const defRecords = convertAwardSummariesToTopDefenders(summaries)
    expect(defRecords).toHaveLength(1)
    expect(defRecords[0].stopsWinner?.personId).toBe('p2')
    expect(defRecords[0].stopsCount).toBe(18)

    const allAwards = convertAwardSummariesToAllAwards(summaries)
    expect(allAwards).toHaveLength(1)
    expect(allAwards[0].ballonOr?.personId).toBe('p1')
    expect(allAwards[0].topScorer?.personId).toBe('p1')
    expect(allAwards[0].topStops?.personId).toBe('p2')
  })
})
