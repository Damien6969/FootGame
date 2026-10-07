import { describe, it, expect } from 'vitest'
import {
  isAllianceSyntheticName,
  resolveCommuneRealClubName,
  resolveAlliancePartners,
  resolvePartnerClubName,
  resolveCareerSeasonClub,
} from './clubResolution'
import type { Commune, GeographyDataset } from '../geography/types'
import type { Club } from './types'
import type { CupSession, SeasonArchive } from '../storage/cupRepository'

describe('clubResolution', () => {
  const djo: Commune = {
    id: '21231',
    name: 'Dijon',
    departmentId: '21',
    regionId: '27',
    population: 159346,
    conferenceId: 'BFC',
    zoneId: 'EST',
    coordinates: [47.32, 5.04],
  }

  const beaune: Commune = {
    id: '21054',
    name: 'Beaune',
    departmentId: '21',
    regionId: '27',
    population: 21000,
    conferenceId: 'BFC',
    zoneId: 'EST',
    coordinates: [47.02, 4.83],
  }

  const dataset: GeographyDataset = {
    version: '1',
    sourceLabel: 'Insee test',
    sourceUrl: 'https://example.com',
    communes: [djo, beaune],
  }

  it('detects synthetic alliance names', () => {
    expect(isAllianceSyntheticName('Entente Saint-Vit / Besançon')).toBe(true)
    expect(isAllianceSyntheticName('Grand Dijon FC')).toBe(true)
    expect(isAllianceSyntheticName('Union Saint-Vit-Besançon')).toBe(true)
    expect(isAllianceSyntheticName('Alliance Belley')).toBe(true)
    expect(isAllianceSyntheticName('FC Pays de Redon')).toBe(true)
    expect(isAllianceSyntheticName("FC Bassin d'Arcachon")).toBe(true)
    expect(isAllianceSyntheticName('FC Belley 01')).toBe(true)
    expect(isAllianceSyntheticName('FC Ain')).toBe(true)
    expect(isAllianceSyntheticName('FC Dijon')).toBe(false)
    expect(isAllianceSyntheticName('Olympique de Marseille')).toBe(false)
    expect(isAllianceSyntheticName('CS Beaune')).toBe(false)
  })

  it('resolves real club name for autonomous club', () => {
    const club: Club = {
      id: '21054',
      name: 'CS Beaune',
      shortName: 'CS Beaune',
      communeId: '21054',
      communeName: 'Beaune',
      communeIds: ['21054'],
      communeNames: ['Beaune'],
      departmentId: '21',
      regionId: '27',
      zoneId: 'EST',
      conferenceId: 'BFC',
      population: 21000,
      strength: 15,
    }

    expect(resolveCommuneRealClubName(beaune, club, { dataset })).toBe('CS Beaune')
  })

  it.each([
    'Olympique Ain', 'Racing Rhône', 'Sporting Finistère', 'Stade Loire-Atlantique',
    'Étoile Ain', 'Avenir Ain', 'Club olympique Ain', 'Ain FC', 'FC 2A',
  ])('detects the new department alliance name %s', (name) => {
    expect(isAllianceSyntheticName(name)).toBe(true)
  })

  it('resolves real club name for partner commune in an alliance', () => {
    const allianceClub: Club = {
      id: '21231',
      name: 'Grand Dijon FC',
      shortName: 'Grand Dijon',
      communeId: '21231',
      communeName: 'Dijon',
      communeIds: ['21231', '21054'],
      communeNames: ['Dijon', 'Beaune'],
      departmentId: '21',
      regionId: '27',
      zoneId: 'EST',
      conferenceId: 'BFC',
      population: 180346,
      strength: 24,
      isFusion: true,
      fusedClubs: [
        {
          id: '21054',
          name: 'CS Beaune',
          communeId: '21054',
          communeName: 'Beaune',
        },
      ],
    }

    // For Beaune:
    expect(resolveCommuneRealClubName(beaune, allianceClub, { dataset })).toBe('CS Beaune')
    // For Dijon:
    expect(resolveCommuneRealClubName(djo, allianceClub, { dataset })).toBe('Dijon FC')
  })

  it('resolves alliance partners with each genuine club name', () => {
    const allianceClub: Club = {
      id: '21231',
      name: 'Grand Dijon FC',
      shortName: 'Grand Dijon',
      communeId: '21231',
      communeName: 'Dijon',
      communeIds: ['21231', '21054'],
      communeNames: ['Dijon', 'Beaune'],
      departmentId: '21',
      regionId: '27',
      zoneId: 'EST',
      conferenceId: 'BFC',
      population: 180346,
      strength: 24,
      isFusion: true,
      fusedClubs: [
        {
          id: '21054',
          name: 'CS Beaune',
          communeId: '21054',
          communeName: 'Beaune',
        },
      ],
    }

    const partners = resolveAlliancePartners(allianceClub, dataset)
    expect(partners).toHaveLength(2)
    expect(partners[0].communeName).toBe('Dijon')
    expect(partners[0].clubName).toBe('Dijon FC')
    expect(partners[0].isHeadquarter).toBe(true)

    expect(partners[1].communeName).toBe('Beaune')
    expect(partners[1].clubName).toBe('CS Beaune')
    expect(partners[1].isHeadquarter).toBe(false)
  })

  it('resolves partner club name from partner commune name', () => {
    expect(resolvePartnerClubName('Beaune', { dataset })).toBe('Étoile de Beaune')
  })

  describe('resolveCareerSeasonClub', () => {
    const aubagneClub: Club = {
      id: '13005-1',
      name: 'Alliance Aubagne-Cassis',
      shortName: 'Aubagne-Cassis',
      communeId: '13005',
      communeName: 'Aubagne',
      communeIds: ['13005', '13022'],
      communeNames: ['Aubagne', 'Cassis'],
      departmentId: '13',
      regionId: '93',
      zoneId: 'SUD',
      conferenceId: 'MED',
      population: 60000,
      strength: 25,
      isFusion: true,
      fusedClubs: [
        {
          id: '13022-1',
          name: 'Étoile de Cassis',
          communeId: '13022',
          communeName: 'Cassis',
          year: 2026,
        },
      ],
    }

    const clubsMap = new Map([['13005-1', aubagneClub]])

    function archive(year: number, name: string): SeasonArchive {
      return {
        year, seed: `season-${year}`, completedAt: '', datasetVersion: '',
        nationalChampionId: aubagneClub.id, conferenceChampions: {}, finalFourTeamIds: [],
        totalMatches: 0, history: [], teamPerformances: {},
        clubs: [{ ...aubagneClub, name }],
      }
    }

    it('uses the name of each archived season across successive mergers and renames', () => {
      const archives = [archive(2026, 'Alliance Aubagne-Cassis'), archive(2027, 'Union de Provence')]
      const current = { ...aubagneClub, name: 'Provence Football' }
      const map = new Map([[current.id, current]])
      for (const [year, name] of [[2026, 'Alliance Aubagne-Cassis'], [2027, 'Union de Provence']] as const) {
        const result = resolveCareerSeasonClub({ year, clubId: current.id, clubName: 'Aubagne FC' }, { clubsById: map, archives })
        expect(result.clubName).toBe(name)
        expect(result.club?.name).toBe(name)
      }
    })

    it('keeps the recorded historical alliance name when no snapshot is available', () => {
      const result = resolveCareerSeasonClub(
        { year: 2024, clubId: aubagneClub.id, clubName: 'Alliance historique' },
        { clubsById: new Map([[aubagneClub.id, { ...aubagneClub, isFusion: false, fusedClubs: [] }]]) },
      )
      expect(result.clubName).toBe('Alliance historique')
    })

    it('uses the renamed active club for the current season instead of a stale career name', () => {
      const current = { ...aubagneClub, name: 'Provence Football' }
      const session = { seasonYear: 2028, clubs: [current] } as unknown as CupSession
      const result = resolveCareerSeasonClub(
        { year: 2028, clubId: current.id, clubName: 'Aubagne FC' },
        { session, clubsById: new Map([[current.id, current]]), archives: [archive(2027, 'Union de Provence')] },
      )
      expect(result.clubName).toBe('Provence Football')
    })

    it('uses a historical performance name when the archive has no club snapshot', () => {
      const season = archive(2026, 'Unused')
      const result = resolveCareerSeasonClub(
        { year: 2026, clubId: aubagneClub.id, clubName: 'Aubagne FC' },
        { clubsById: clubsMap, archives: [{ ...season, clubs: undefined, teamPerformances: {
          [aubagneClub.id]: { teamId: aubagneClub.id, clubName: 'Alliance 2026', roundReached: 14,
            stageLabel: 'Champion', isNationalChampion: true, isConferenceChampion: false, matchesWon: 1, matchesPlayed: 1 },
        } }] },
      )
      expect(result.clubName).toBe('Alliance 2026')
    })

    it('resolves former secondary club name when clubId is the absorbed club ID', () => {
      const result = resolveCareerSeasonClub(
        { year: 2024, clubId: '13022-1' },
        { clubsById: clubsMap, dataset },
      )
      expect(result.clubName).toBe('Étoile de Cassis')
      expect(result.clubId).toBe('13022-1')
      expect(result.isAbsorbedClub).toBe(true)
      expect(result.isHistoricalPreFusion).toBe(true)
      expect(result.club?.id).toBe('13022-1')
      expect(result.club?.name).toBe('Étoile de Cassis')
    })

    it('resolves former secondary club when player belongs to absorbed commune before fusion year', () => {
      const result = resolveCareerSeasonClub(
        { year: 2024, clubId: '13005-1' },
        {
          person: { birthCommuneId: '13022' },
          clubsById: clubsMap,
          dataset,
        },
      )
      expect(result.clubName).toBe('Étoile de Cassis')
      expect(result.clubId).toBe('13022-1')
      expect(result.isAbsorbedClub).toBe(true)
      expect(result.isHistoricalPreFusion).toBe(true)
      expect(result.club?.name).toBe('Étoile de Cassis')
    })

    it('resolves lead club pre-fusion name when player was at the lead club before fusion', () => {
      const result = resolveCareerSeasonClub(
        { year: 2024, clubId: '13005-1', clubName: 'Aubagne FC' },
        {
          person: { birthCommuneId: '13005' },
          clubsById: clubsMap,
          dataset,
        },
      )
      expect(result.clubName).toBe('Aubagne FC')
      expect(result.clubId).toBe('13005-1')
      expect(result.isAbsorbedClub).toBe(false)
      expect(result.isHistoricalPreFusion).toBe(true)
    })

    it('preserves post-fusion alliance name for seasons occurring during or after fusion', () => {
      const result = resolveCareerSeasonClub(
        { year: 2026, clubId: '13005-1' },
        {
          person: { birthCommuneId: '13022' },
          clubsById: clubsMap,
          dataset,
        },
      )
      expect(result.clubName).toBe('Alliance Aubagne-Cassis')
      expect(result.clubId).toBe('13005-1')
      expect(result.isHistoricalPreFusion).toBe(false)
    })
  })
})
