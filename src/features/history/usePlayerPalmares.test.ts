import { describe, expect, it, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { usePlayerPalmares } from './usePlayerPalmares'
import { cupRepository, type SeasonArchive, type CupSession } from '../storage/cupRepository'
import type { Person } from '../persons/types'
import type { Club } from '../teams/types'
import type { PlayerPalmaresRecord } from './playerPalmaresSelectors'
import type { PlayerSeasonHonor } from './playerPalmaresStorage'

const mockPerson: Person = {
  id: 'p1',
  firstName: 'Antoine',
  lastName: 'Griezmann',
  age: 33,
  nationality: 'FR',
  careerYears: 10,
  attack: 26,
  defense: 18,
  primaryRole: 'PLAYER',
  position: 'ATTACKER',
  assignedPosition: 'ATTACKER',
  birthCommuneId: 'MACON',
  birthCommuneName: 'Mâcon',
  birthDepartmentId: '71',
  currentClubId: 'MACON',
  isRetired: false,
}

const mockClub: Club = {
  id: 'MACON',
  name: 'UF Mâcon',
  shortName: 'UFM',
  communeId: 'MACON',
  communeName: 'Mâcon',
  communeIds: ['MACON'],
  communeNames: ['Mâcon'],
  departmentId: '71',
  regionId: '27',
  zoneId: 'ZONE_SUD_EST',
  conferenceId: 'CONF_SUD_EST',
  population: 34000,
  strength: 70,
}

const mockPalmaresRecord: PlayerPalmaresRecord = {
  person: mockPerson,
  rank: 1,
  ballonOrCount: 1,
  ballonOrYears: [2026],
  topScorerCount: 1,
  topScorerYears: [2026],
  topStopsCount: 0,
  topStopsYears: [],
  bestDefenderCount: 0,
  bestDefenderYears: [],
  bestAttackerCount: 0,
  bestAttackerYears: [],
  youthAwardCount: 0,
  conferenceAwardCount: 0,
  totalIndividualTitles: 2,
  allIndividualHonors: [],
  nationalTitles: 1,
  nationalTitleYears: [2026],
  conferenceTitles: 1,
  conferenceTitleDetails: [],
  regionTitles: 1,
  regionTitleDetails: [],
  departmentTitles: 1,
  departmentTitleDetails: [],
  totalTeamTitles: 4,
  totalTitles: 6,
  palmaresScore: 40,
  trophyRecord: {
    personId: 'p1',
    nationalTitles: 1,
    nationalTitleYears: [2026],
    conferenceTitles: 1,
    conferenceTitleDetails: [],
    regionTitles: 1,
    regionTitleDetails: [],
    departmentTitles: 1,
    departmentTitleDetails: [],
    seasons: [],
  },
}

function createMockHonor(overrides?: Partial<PlayerSeasonHonor>): PlayerSeasonHonor {
  return {
    id: 'p1:2026',
    personId: 'p1',
    year: 2026,
    firstName: 'Antoine',
    lastName: 'Griezmann',
    nationality: 'FR',
    role: 'PLAYER',
    clubId: 'MACON',
    isStarter: true,
    isLoan: false,
    matchesPlayed: 14,
    goals: 10,
    defensiveStops: 0,
    shots: 15,
    shotsMissed: 5,
    roundReached: 14,
    stageLabel: 'Champion de France',
    isNationalChampion: true,
    isConferenceChampion: false,
    isRegionChampion: false,
    isDepartmentChampion: false,
    ...overrides,
  }
}

describe('usePlayerPalmares', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
  })

  it('returns empty records immediately when there are no completed editions', async () => {
    const { result } = renderHook(() =>
      usePlayerPalmares({
        completedEditions: [],
        persons: [mockPerson],
        clubsById: new Map([['MACON', mockClub]]),
      }),
    )

    expect(result.current.loading).toBe(false)
    expect(result.current.rankedPlayers).toEqual([])
    expect(result.current.awardSummaries).toEqual([])
  })

  it('loads pre-computed palmares from IndexedDB without full archive scan when cache is valid and covers all seasons', async () => {
    localStorage.setItem('coupe_palmares_calc_version', '3')
    vi.spyOn(cupRepository, 'loadPlayerPalmares').mockResolvedValue([mockPalmaresRecord])
    vi.spyOn(cupRepository, 'loadSeasonAwardSummaries').mockResolvedValue([
      { year: 2026, minimumMatches: 3 },
    ])
    vi.spyOn(cupRepository, 'loadPlayerSeasonHonors').mockResolvedValue([createMockHonor()])
    const rebuildSpy = vi.spyOn(cupRepository, 'rebuildPlayerPalmares')

    const mockArchive: SeasonArchive = {
      year: 2026,
      seed: 'coupe-2026',
      completedAt: '2026-06-01',
      datasetVersion: '1',
      nationalChampionId: 'MACON',
      conferenceChampions: {},
      finalFourTeamIds: [],
      totalMatches: 0,
      teamPerformances: {},
      history: [],
      summaryOnly: true,
    }

    const { result } = renderHook(() =>
      usePlayerPalmares({
        completedEditions: [mockArchive],
        persons: [mockPerson],
        clubsById: new Map([['MACON', mockClub]]),
      }),
    )

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.rankedPlayers).toHaveLength(1)
    expect(result.current.rankedPlayers[0].person.id).toBe('p1')
    expect(result.current.awardSummaries).toHaveLength(1)
    // Rebuild should not be called when data is valid and covers all seasons
    expect(rebuildSpy).not.toHaveBeenCalled()
  })

  it('automatically triggers rebuildPlayerPalmares when table is empty', async () => {
    vi.spyOn(cupRepository, 'loadPlayerPalmares').mockResolvedValue([])
    vi.spyOn(cupRepository, 'loadSeasonAwardSummaries').mockResolvedValue([])
    vi.spyOn(cupRepository, 'loadPlayerSeasonHonors').mockResolvedValue([])
    const rebuildSpy = vi
      .spyOn(cupRepository, 'rebuildPlayerPalmares')
      .mockResolvedValue([mockPalmaresRecord])

    const mockArchive: SeasonArchive = {
      year: 2026,
      seed: 'coupe-2026',
      completedAt: '2026-06-01',
      datasetVersion: '1',
      nationalChampionId: 'MACON',
      conferenceChampions: {},
      finalFourTeamIds: [],
      totalMatches: 0,
      teamPerformances: {},
      history: [],
    }

    const { result } = renderHook(() =>
      usePlayerPalmares({
        completedEditions: [mockArchive],
        persons: [mockPerson],
        clubsById: new Map([['MACON', mockClub]]),
      }),
    )

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(rebuildSpy).toHaveBeenCalledTimes(1)
    expect(result.current.rankedPlayers).toHaveLength(1)
  })

  it('triggers rebuild when a season is missing from honors coverage', async () => {
    localStorage.setItem('coupe_palmares_calc_version', '2')
    // Honors only covers 2026, but completed editions includes 2026 and 2027
    vi.spyOn(cupRepository, 'loadPlayerPalmares').mockResolvedValue([mockPalmaresRecord])
    vi.spyOn(cupRepository, 'loadSeasonAwardSummaries').mockResolvedValue([
      { year: 2026, minimumMatches: 3 },
    ])
    vi.spyOn(cupRepository, 'loadPlayerSeasonHonors').mockResolvedValue([createMockHonor()])
    const rebuildSpy = vi
      .spyOn(cupRepository, 'rebuildPlayerPalmares')
      .mockResolvedValue([mockPalmaresRecord])

    const arch2026: SeasonArchive = {
      year: 2026,
      seed: 'coupe-2026',
      completedAt: '2026-06-01',
      datasetVersion: '1',
      nationalChampionId: 'MACON',
      conferenceChampions: {},
      finalFourTeamIds: [],
      totalMatches: 0,
      teamPerformances: {},
      history: [],
      summaryOnly: true,
    }
    const arch2027: SeasonArchive = {
      year: 2027,
      seed: 'coupe-2027',
      completedAt: '2027-06-01',
      datasetVersion: '1',
      nationalChampionId: 'MACON',
      conferenceChampions: {},
      finalFourTeamIds: [],
      totalMatches: 0,
      teamPerformances: {},
      history: [],
      summaryOnly: true,
    }

    const { result } = renderHook(() =>
      usePlayerPalmares({
        completedEditions: [arch2026, arch2027],
        persons: [mockPerson],
        clubsById: new Map([['MACON', mockClub]]),
      }),
    )

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(rebuildSpy).toHaveBeenCalledTimes(1)
  })

  it('triggers rebuild when calculation version is outdated', async () => {
    localStorage.setItem('coupe_palmares_calc_version', '2') // version preceding coach titles
    vi.spyOn(cupRepository, 'loadPlayerPalmares').mockResolvedValue([mockPalmaresRecord])
    vi.spyOn(cupRepository, 'loadSeasonAwardSummaries').mockResolvedValue([
      { year: 2026, minimumMatches: 3 },
    ])
    vi.spyOn(cupRepository, 'loadPlayerSeasonHonors').mockResolvedValue([createMockHonor()])
    const rebuildSpy = vi
      .spyOn(cupRepository, 'rebuildPlayerPalmares')
      .mockResolvedValue([mockPalmaresRecord])

    const arch2026: SeasonArchive = {
      year: 2026,
      seed: 'coupe-2026',
      completedAt: '2026-06-01',
      datasetVersion: '1',
      nationalChampionId: 'MACON',
      conferenceChampions: {},
      finalFourTeamIds: [],
      totalMatches: 0,
      teamPerformances: {},
      history: [],
      summaryOnly: true,
    }

    const { result } = renderHook(() =>
      usePlayerPalmares({
        completedEditions: [arch2026],
        persons: [mockPerson],
        clubsById: new Map([['MACON', mockClub]]),
      }),
    )

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(rebuildSpy).toHaveBeenCalledTimes(1)
    expect(localStorage.getItem('coupe_palmares_calc_version')).toBe('3')
  })

  it('enriches cached player palmares with live person properties', async () => {
    localStorage.setItem('coupe_palmares_calc_version', '3')
    vi.spyOn(cupRepository, 'loadPlayerPalmares').mockResolvedValue([mockPalmaresRecord])
    vi.spyOn(cupRepository, 'loadSeasonAwardSummaries').mockResolvedValue([
      { year: 2026, minimumMatches: 3 },
    ])
    vi.spyOn(cupRepository, 'loadPlayerSeasonHonors').mockResolvedValue([createMockHonor()])

    // Live person has updated age and attack
    const livePerson: Person = {
      ...mockPerson,
      age: 34,
      attack: 30,
    }

    const arch2026: SeasonArchive = {
      year: 2026,
      seed: 'coupe-2026',
      completedAt: '2026-06-01',
      datasetVersion: '1',
      nationalChampionId: 'MACON',
      conferenceChampions: {},
      finalFourTeamIds: [],
      totalMatches: 0,
      teamPerformances: {},
      history: [],
      summaryOnly: true,
    }

    const { result } = renderHook(() =>
      usePlayerPalmares({
        completedEditions: [arch2026],
        persons: [livePerson],
        clubsById: new Map([['MACON', mockClub]]),
      }),
    )

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.rankedPlayers[0].person.age).toBe(34)
    expect(result.current.rankedPlayers[0].person.attack).toBe(30)
  })

  it('does not overwrite official archive with active session if active year is already archived', async () => {
    localStorage.setItem('coupe_palmares_calc_version', '3')
    vi.spyOn(cupRepository, 'loadPlayerPalmares').mockResolvedValue([mockPalmaresRecord])
    vi.spyOn(cupRepository, 'loadSeasonAwardSummaries').mockResolvedValue([
      { year: 2026, minimumMatches: 3 },
    ])
    vi.spyOn(cupRepository, 'loadPlayerSeasonHonors').mockResolvedValue([createMockHonor()])

    const arch2026: SeasonArchive = {
      year: 2026,
      seed: 'coupe-2026',
      completedAt: '2026-06-01',
      datasetVersion: '1',
      nationalChampionId: 'MACON',
      conferenceChampions: {},
      finalFourTeamIds: [],
      totalMatches: 0,
      teamPerformances: {},
      history: [],
      summaryOnly: true,
    }

    const activeSession: CupSession = {
      id: 'active',
      seed: 'coupe-2026',
      seasonYear: 2026,
      datasetVersion: '1',
      roundNumber: 14,
      round: { matches: [], byeTeamIds: [] },
      results: {},
      activeTeamIds: ['MACON'],
      history: [],
      roundByes: {},
      championId: 'MACON',
    }

    const { result } = renderHook(() =>
      usePlayerPalmares({
        completedEditions: [arch2026],
        activeSession,
        persons: [mockPerson],
        clubsById: new Map([['MACON', mockClub]]),
      }),
    )

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    // Should retain the 1 loaded record without duplicate extractions
    expect(result.current.rankedPlayers).toHaveLength(1)
  })
})
