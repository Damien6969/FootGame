import { describe, it, expect } from 'vitest'
import type { Commune } from '../geography/types'
import type { Club } from './types'
import type { SeasonArchive } from '../storage/cupRepository'
import {
  computePerformanceWeight,
  executeInterseasonTransition,
  calculateDistanceKm,
  findBestFusionPartner,
} from './interseasonEngine'
import { createClubFromCommune } from './clubGenerator'
import { getClubIdentity, type ClubIdentity } from './clubIdentity'

describe('interseasonEngine', () => {
  const createFakeCommune = (
    id: string,
    name: string,
    population: number,
    departmentId = '01',
    regionId = '84',
    coordinates?: readonly [number, number],
  ): Commune => ({
    id,
    name,
    departmentId,
    regionId,
    zoneId: 'ZONE-A',
    conferenceId: 'EST',
    population,
    coordinates,
  })

  const bounds = { min: 1000, max: 2150000 }

  it('assigns weight 0 to national champion so it never fuses', () => {
    const commune = createFakeCommune('01001', 'Bourg-en-Bresse', 40000)
    const club = createClubFromCommune(commune, bounds)
    const archive: SeasonArchive = {
      year: 2026,
      seed: 'test-seed',
      completedAt: '2026-09-23T00:00:00.000Z',
      datasetVersion: '1.0',
      nationalChampionId: '01001',
      conferenceChampions: { EST: '01001' },
      finalFourTeamIds: ['01001'],
      totalMatches: 10,
      teamPerformances: {
        '01001': {
          teamId: '01001',
          roundReached: 14,
          stageLabel: 'Champion de France',
          isNationalChampion: true,
          isConferenceChampion: true,
          matchesWon: 14,
          matchesPlayed: 14,
        },
      },
      history: [],
    }

    const weight = computePerformanceWeight(club, archive)
    expect(weight).toBe(0)
  })

  it('gives much higher weight to conference champions and deep tournament runs', () => {
    const c1 = createClubFromCommune(createFakeCommune('1', 'TeamConf', 10000), bounds)
    const c2 = createClubFromCommune(createFakeCommune('2', 'TeamEarly', 10000), bounds)

    const archive: SeasonArchive = {
      year: 2026,
      seed: 'test-seed',
      completedAt: '2026-09-23T00:00:00.000Z',
      datasetVersion: '1.0',
      nationalChampionId: '999',
      conferenceChampions: { EST: '1' },
      finalFourTeamIds: ['1'],
      totalMatches: 10,
      teamPerformances: {
        '1': {
          teamId: '1',
          roundReached: 12,
          stageLabel: 'Champion de Conférence',
          isNationalChampion: false,
          isConferenceChampion: true,
          matchesWon: 12,
          matchesPlayed: 13,
        },
        '2': {
          teamId: '2',
          roundReached: 1,
          stageLabel: 'Tour 1',
          isNationalChampion: false,
          isConferenceChampion: false,
          matchesWon: 0,
          matchesPlayed: 1,
        },
      },
      history: [],
    }

    const weightConf = computePerformanceWeight(c1, archive)
    const weightEarly = computePerformanceWeight(c2, archive)

    expect(weightConf).toBeGreaterThan(1000)
    expect(weightEarly).toBe(0) // 0 wins / early exit is strictly excluded
  })

  it('correctly handles departmental/regional titles vs intermediate ranking exclusions', () => {
    const cDeptSemi = createClubFromCommune(createFakeCommune('101', 'SemiDept', 5000, '01', '84'), bounds, 0)
    const cDeptChamp = createClubFromCommune(createFakeCommune('102', 'ChampDept', 6000, '01', '84'), bounds, 0)
    const cRegChamp = createClubFromCommune(createFakeCommune('103', 'ChampReg', 8000, '01', '84'), bounds, 0)
    const cTour7NoTitle = createClubFromCommune(createFakeCommune('104', 'Tour7NoTitle', 7000, '01', '84'), bounds, 0)
    const cConf8e = createClubFromCommune(createFakeCommune('105', 'Conf8e', 15000, '01', '84'), bounds, 0)

    const archive: SeasonArchive = {
      year: 2026,
      seed: 'coupe-2026',
      completedAt: '2026-09-23T00:00:00.000Z',
      datasetVersion: '1.0',
      nationalChampionId: '999',
      conferenceChampions: {},
      finalFourTeamIds: [],
      totalMatches: 20,
      teamPerformances: {
        [cDeptSemi.id]: {
          teamId: cDeptSemi.id,
          roundReached: 4, // 1/2 finaliste départemental
          stageLabel: 'Tour 4',
          matchesWon: 3,
          matchesPlayed: 4,
          isNationalChampion: false,
          isConferenceChampion: false,
          isDepartmentChampion: false,
          isRegionChampion: false,
        },
        [cDeptChamp.id]: {
          teamId: cDeptChamp.id,
          roundReached: 4,
          stageLabel: 'Tour 4',
          matchesWon: 4,
          matchesPlayed: 5,
          isNationalChampion: false,
          isConferenceChampion: false,
          isDepartmentChampion: true,
          isRegionChampion: false,
        },
        [cRegChamp.id]: {
          teamId: cRegChamp.id,
          roundReached: 8,
          stageLabel: 'Tour 8',
          matchesWon: 7,
          matchesPlayed: 8,
          isNationalChampion: false,
          isConferenceChampion: false,
          isDepartmentChampion: true,
          isRegionChampion: true,
        },
        [cTour7NoTitle.id]: {
          teamId: cTour7NoTitle.id,
          roundReached: 7,
          stageLabel: 'Tour 7',
          matchesWon: 6,
          matchesPlayed: 7,
          isNationalChampion: false,
          isConferenceChampion: false,
          isDepartmentChampion: false,
          isRegionChampion: false,
        },
        [cConf8e.id]: {
          teamId: cConf8e.id,
          roundReached: 9, // 8es de Conférence
          stageLabel: 'Tour 9',
          matchesWon: 8,
          matchesPlayed: 9,
          isNationalChampion: false,
          isConferenceChampion: false,
          isDepartmentChampion: false,
          isRegionChampion: false,
        },
      },
      history: [],
    }

    // 1. Demi-finaliste départemental sans titre -> EXCLU (poids = 0)
    expect(computePerformanceWeight(cDeptSemi, archive)).toBe(0)

    // 2. Tour intermédiaire régional (Tour 7) sans titre -> EXCLU (poids = 0)
    expect(computePerformanceWeight(cTour7NoTitle, archive)).toBe(0)

    // 3. Champion départemental -> petit boost (50 + victoires = 90)
    const wDeptChamp = computePerformanceWeight(cDeptChamp, archive)
    expect(wDeptChamp).toBeGreaterThanOrEqual(50)
    expect(wDeptChamp).toBeLessThan(150)

    // 4. Champion régional -> boost significatif (250 + 50 + victoires = ~370)
    const wRegChamp = computePerformanceWeight(cRegChamp, archive)
    expect(wRegChamp).toBeGreaterThanOrEqual(250)

    // 5. Club de Conférence (Tour 9) -> classement compte (base 400 + victoires = 480)
    const wConf8e = computePerformanceWeight(cConf8e, archive)
    expect(wConf8e).toBeGreaterThanOrEqual(400)
    expect(wConf8e).toBeGreaterThan(wDeptChamp)
  })

  it('creates a rival club for national champion with ~20% lower strength', () => {
    const champCommune = createFakeCommune('75056', 'Paris', 2150000, '75', '11')
    const champClub = createClubFromCommune(champCommune, bounds, 0)
    const otherCommune = createFakeCommune('75001', 'Autre', 20000, '75', '11')
    const otherClub = createClubFromCommune(otherCommune, bounds, 0)

    const archive: SeasonArchive = {
      year: 2026,
      seed: 'coupe-2026',
      completedAt: '2026-09-23T00:00:00.000Z',
      datasetVersion: '1.0',
      nationalChampionId: champClub.id,
      conferenceChampions: { IDF: champClub.id },
      finalFourTeamIds: [champClub.id],
      totalMatches: 10,
      teamPerformances: {
        [champClub.id]: {
          teamId: champClub.id,
          roundReached: 14,
          stageLabel: 'Champion de France',
          isNationalChampion: true,
          isConferenceChampion: true,
          matchesWon: 14,
          matchesPlayed: 14,
        },
      },
      history: [],
    }

    const { nextClubs, report } = executeInterseasonTransition(
      [champClub, otherClub],
      archive,
      [champCommune, otherCommune],
      { maxFusions: 0, popBounds: bounds },
    )

    // Champion club should remain unfused
    const foundChamp = nextClubs.find((c) => c.id === champClub.id)
    expect(foundChamp).toBeDefined()
    expect(foundChamp?.isFusion).toBeFalsy()

    // Rival club should be created
    expect(report.rivalCreated).toBeDefined()
    expect(report.rivalCreated?.communeName).toBe('Paris')
    expect(report.rivalCreated?.parentChampionName).toBe(champClub.name)

    const rivalClub = nextClubs.find((c) => c.id === report.rivalCreated?.clubId)
    expect(rivalClub).toBeDefined()
    expect(rivalClub?.isRivalClub).toBe(true)
    expect(rivalClub?.parentChampionYear).toBe(2026)
    expect(rivalClub?.communeId).toBe('75056')

    // Strength should be ~20% lower than base champion club strength
    const expectedStrength = Number((champClub.strength * 0.8).toFixed(1))
    expect(rivalClub?.strength).toBeCloseTo(expectedStrength, 1)
  })

  it('limits fusions to maxFusions and combines commune populations', () => {
    // Create 30 clubs in the same department
    const communes: Commune[] = []
    const clubs: Club[] = []
    for (let i = 1; i <= 30; i++) {
      const c = createFakeCommune(`01${i.toString().padStart(3, '0')}`, `Ville${i}`, 2000 + i * 500, '01', '84')
      communes.push(c)
      clubs.push(createClubFromCommune(c, bounds))
    }

    const archive: SeasonArchive = {
      year: 2026,
      seed: 'coupe-2026',
      completedAt: '2026-09-23T00:00:00.000Z',
      datasetVersion: '1.0',
      nationalChampionId: '99999', // Not in this department
      conferenceChampions: {},
      finalFourTeamIds: [],
      totalMatches: 10,
      teamPerformances: {},
      history: [],
    }

    const maxFusions = 5
    const { nextClubs, report } = executeInterseasonTransition(clubs, archive, communes, {
      maxFusions,
      seed: 'test-fusions',
      popBounds: bounds,
    })

    expect(report.fusions).toHaveLength(maxFusions)
    // 30 clubs - 5 absorbed = 25 clubs
    expect(nextClubs).toHaveLength(25)

    // Verify first fusion properties
    const firstFusion = report.fusions[0]
    expect(firstFusion.communeNames).toHaveLength(2)
    expect(firstFusion.totalPopulation).toBeGreaterThan(firstFusion.oldStrength)
    expect(firstFusion.leadClubName).toBeDefined()
    expect(firstFusion.absorbedClubName).toBeDefined()

    const mergedClub = nextClubs.find((c) => c.id === firstFusion.mergedClubId)
    expect(mergedClub).toBeDefined()
    expect(mergedClub?.isFusion).toBe(true)
    expect(mergedClub?.fusionCount).toBe(2)
    expect(mergedClub?.communeIds).toHaveLength(2)
    expect(mergedClub?.name).toContain('Entente')
    expect(mergedClub?.fusedClubs).toBeDefined()
    expect(mergedClub?.fusedClubs?.length).toBeGreaterThanOrEqual(1)
    expect(mergedClub?.fusedClubs?.[0].name).toBe(firstFusion.absorbedClubName)
  })

  it('preserves the dominant alliance name when a third small commune joins', () => {
    // Start with a club that is already an Entente of 2 communes
    const c1 = createFakeCommune('01001', 'Belley', 9000, '01')
    const c2 = createFakeCommune('01002', 'Virieu', 3000, '01')
    const c3 = createFakeCommune('01003', 'Culoz', 3000, '01')

    const alreadyFusedClub: Club = {
      id: '01001',
      name: 'Entente Belley-Virieu',
      shortName: 'Entente Belley-Virieu',
      communeId: '01001',
      communeName: 'Belley',
      communeIds: ['01001', '01002'],
      communeNames: ['Belley', 'Virieu'],
      departmentId: '01',
      regionId: '84',
      zoneId: 'ZONE-A',
      conferenceId: 'EST',
      population: 12000,
      strength: 40.0,
      isFusion: true,
      fusionCount: 2,
    }

    const thirdClub = createClubFromCommune(c3, bounds)

    const archive: SeasonArchive = {
      year: 2027,
      seed: 'coupe-2027',
      completedAt: '2027-09-23T00:00:00.000Z',
      datasetVersion: '1.0',
      nationalChampionId: '99999',
      conferenceChampions: {},
      finalFourTeamIds: [],
      totalMatches: 10,
      teamPerformances: {
        '01001': {
          teamId: '01001',
          roundReached: 12,
          stageLabel: 'Finale de Conférence',
          isNationalChampion: false,
          isConferenceChampion: false,
          matchesWon: 11,
          matchesPlayed: 12,
        },
      },
      history: [],
    }

    const { nextClubs, report } = executeInterseasonTransition(
      [alreadyFusedClub, thirdClub],
      archive,
      [c1, c2, c3],
      { maxFusions: 1, seed: 'multi-test', popBounds: bounds },
    )

    expect(report.fusions).toHaveLength(1)
    const fused = nextClubs.find((c) => c.id === '01001')
    expect(fused).toBeDefined()
    expect(fused?.communeIds).toEqual(['01001', '01002', '01003'])
    expect(fused?.communeNames).toEqual(['Belley', 'Virieu', 'Culoz'])
    expect(fused?.fusionCount).toBe(3)
    expect(fused?.name).toBe('Entente Belley-Virieu')
    expect(fused?.shortName).toBe('Entente Belley-Virieu')
  })

  it('does NOT reset the name when a club already has 3 or more teams and merges again (4+ teams)', () => {
    // Club initiateur ayant DÉJÀ 3 communes
    const c1 = createFakeCommune('01001', 'Belley', 9000, '01')
    const c2 = createFakeCommune('01002', 'Virieu', 3000, '01')
    const c3 = createFakeCommune('01003', 'Culoz', 3000, '01')
    const c4 = createFakeCommune('01004', 'Seyssel', 2500, '01')

    const multiFusedClub: Club = {
      id: '01001',
      name: 'FC Ain',
      shortName: 'FC Ain',
      communeId: '01001',
      communeName: 'Belley',
      communeIds: ['01001', '01002', '01003'],
      communeNames: ['Belley', 'Virieu', 'Culoz'],
      departmentId: '01',
      regionId: '84',
      zoneId: 'ZONE-A',
      conferenceId: 'EST',
      population: 15000,
      strength: 42.0,
      isFusion: true,
      fusionCount: 3,
    }

    const fourthClub = createClubFromCommune(c4, bounds)

    const archive: SeasonArchive = {
      year: 2028,
      seed: 'coupe-2028',
      completedAt: '2028-09-23T00:00:00.000Z',
      datasetVersion: '1.0',
      nationalChampionId: '99999',
      conferenceChampions: {},
      finalFourTeamIds: [],
      totalMatches: 10,
      teamPerformances: {
        '01001': {
          teamId: '01001',
          roundReached: 12,
          stageLabel: 'Finale de Conférence',
          isNationalChampion: false,
          isConferenceChampion: false,
          matchesWon: 11,
          matchesPlayed: 12,
        },
      },
      history: [],
    }

    const { nextClubs, report } = executeInterseasonTransition(
      [multiFusedClub, fourthClub],
      archive,
      [c1, c2, c3, c4],
      { maxFusions: 1, seed: 'preserve-test', popBounds: bounds },
    )

    expect(report.fusions).toHaveLength(1)
    const fusedAgain = nextClubs.find((c) => c.id === '01001')
    expect(fusedAgain).toBeDefined()
    expect(fusedAgain?.communeNames).toHaveLength(4)
    // Le nom n'a PAS été réinitialisé ni écrasé : il conserve son nom établi
    expect(fusedAgain?.name).toBe('FC Ain')
    expect(fusedAgain?.shortName).toBe('FC Ain')
  })

  it('preserves user custom name when merging into 4+ communes or any fusion', () => {
    const c1 = createFakeCommune('01001', 'Belley', 9000, '01')
    const c2 = createFakeCommune('01002', 'Virieu', 3000, '01')
    const c3 = createFakeCommune('01003', 'Culoz', 3000, '01')

    const customNamedClub: Club = {
      id: '01001',
      name: 'Olympique du Bugey',
      shortName: 'O. Bugey',
      communeId: '01001',
      communeName: 'Belley',
      communeIds: ['01001', '01002'],
      communeNames: ['Belley', 'Virieu'],
      departmentId: '01',
      regionId: '84',
      zoneId: 'ZONE-A',
      conferenceId: 'EST',
      population: 12000,
      strength: 40.0,
      isFusion: true,
      fusionCount: 2,
      isCustomName: true,
    }

    const thirdClub = createClubFromCommune(c3, bounds)

    const archive: SeasonArchive = {
      year: 2027,
      seed: 'coupe-2027',
      completedAt: '2027-09-23T00:00:00.000Z',
      datasetVersion: '1.0',
      nationalChampionId: '99999',
      conferenceChampions: {},
      finalFourTeamIds: [],
      totalMatches: 10,
      teamPerformances: {
        '01001': {
          teamId: '01001',
          roundReached: 10,
          stageLabel: 'Huitièmes',
          isNationalChampion: false,
          isConferenceChampion: false,
          matchesWon: 9,
          matchesPlayed: 10,
        },
      },
      history: [],
    }

    const { nextClubs } = executeInterseasonTransition(
      [customNamedClub, thirdClub],
      archive,
      [c1, c2, c3],
      { maxFusions: 1, seed: 'custom-test', popBounds: bounds },
    )

    const fused = nextClubs.find((c) => c.id === '01001')
    expect(fused).toBeDefined()
    // Le nom personnalisé saisi par l'utilisateur est STRICTEMENT préservé
    expect(fused?.name).toBe('Olympique du Bugey')
    expect(fused?.shortName).toBe('O. Bugey')
    expect(fused?.isCustomName).toBe(true)
  })

  it('calculates geographic distance accurately between coordinates', () => {
    // Paris: [2.3522, 48.8566], Marseille: [5.3698, 43.2965] ~660 km
    const dist = calculateDistanceKm([2.3522, 48.8566], [5.3698, 43.2965])
    expect(dist).toBeGreaterThan(640)
    expect(dist).toBeLessThan(680)

    // Two close communes ~10km
    const localDist = calculateDistanceKm([5.2, 46.2], [5.3, 46.2])
    expect(localDist).toBeGreaterThan(6)
    expect(localDist).toBeLessThan(12)
  })

  it('favors nearby large towns over tiny 1,000-inhabitant villages in partner selection', () => {
    const mainCommune: Commune = {
      ...createFakeCommune('01001', 'Bourg-en-Bresse', 40000),
      coordinates: [5.228, 46.205],
    }
    const mainClub = createClubFromCommune(mainCommune, bounds)

    // Option 1: Large town 10km away (25,000 hab)
    const largeTown: Commune = {
      ...createFakeCommune('01002', 'Oyonnax', 25000),
      coordinates: [5.328, 46.245],
    }
    const largeClub = createClubFromCommune(largeTown, bounds)

    // Option 2: Tiny village 3km away (1,000 hab)
    const tinyVillage: Commune = {
      ...createFakeCommune('01003', 'Petit-Village', 1050),
      coordinates: [5.240, 46.210],
    }
    const tinyClub = createClubFromCommune(tinyVillage, bounds)

    // Option 3: Tiny village 30km away (1,100 hab)
    const distantVillage: Commune = {
      ...createFakeCommune('01004', 'Loin-Village', 1100),
      coordinates: [5.600, 46.400],
    }
    const distantClub = createClubFromCommune(distantVillage, bounds)

    const partner = findBestFusionPartner(mainClub, [tinyClub, largeClub, distantClub], () => 0.01)
    expect(partner?.id).toBe(largeClub.id)
    expect(partner?.name).toBe(largeClub.name)
  })

  it('strictly forbids two clubs from the same city from fusing together', () => {
    // Commune with 2 clubs (e.g. Paris original and Paris rival)
    const parisCommune: Commune = {
      ...createFakeCommune('75056', 'Paris', 2100000, '75', '11'),
      coordinates: [2.3522, 48.8566],
    }
    const parisClub1 = createClubFromCommune(parisCommune, bounds, 0)
    const parisClub2 = createClubFromCommune(parisCommune, bounds, 1)

    // A neighbor town
    const neighborCommune: Commune = {
      ...createFakeCommune('93048', 'Montreuil', 110000, '93', '11'),
      coordinates: [2.4419, 48.8624], // ~6km from Paris
    }
    const neighborClub = createClubFromCommune(neighborCommune, bounds)

    const archive: SeasonArchive = {
      year: 2026,
      seed: 'coupe-2026',
      completedAt: '2026-09-23T00:00:00.000Z',
      datasetVersion: '1.0',
      nationalChampionId: '99999',
      conferenceChampions: {},
      finalFourTeamIds: [],
      totalMatches: 10,
      teamPerformances: {
        [parisClub1.id]: {
          teamId: parisClub1.id,
          roundReached: 10,
          stageLabel: 'Quarts de Conférence',
          isNationalChampion: false,
          isConferenceChampion: false,
          matchesWon: 9,
          matchesPlayed: 10,
        },
      },
      history: [],
    }

    const { report } = executeInterseasonTransition(
      [parisClub1, parisClub2, neighborClub],
      archive,
      [parisCommune, neighborCommune],
      { maxFusions: 1, seed: 'rival-test', popBounds: bounds },
    )

    // Fusion must NOT be between parisClub1 and parisClub2!
    expect(report.fusions).toHaveLength(1)
    const fusion = report.fusions[0]
    expect(fusion.absorbedClubId).toBe(neighborClub.id) // Merged with neighbor, NOT rival
    expect(fusion.communeNames).toEqual(['Paris', 'Montreuil'])
  })

  it('allows cross-department fusions when cities are geographically close', () => {
    // City A in Dept 75 (Paris)
    const cityA: Commune = {
      ...createFakeCommune('75056', 'Paris', 2100000, '75', '11'),
      coordinates: [2.3522, 48.8566],
    }
    const clubA = createClubFromCommune(cityA, bounds)

    // City B in Dept 93 (Montreuil, ~6km away, different department!)
    const cityB: Commune = {
      ...createFakeCommune('93048', 'Montreuil', 110000, '93', '11'),
      coordinates: [2.4419, 48.8624],
    }
    const clubB = createClubFromCommune(cityB, bounds)

    const archive: SeasonArchive = {
      year: 2026,
      seed: 'coupe-2026',
      completedAt: '2026-09-23T00:00:00.000Z',
      datasetVersion: '1.0',
      nationalChampionId: '99999',
      conferenceChampions: {},
      finalFourTeamIds: [],
      totalMatches: 10,
      teamPerformances: {
        [clubA.id]: {
          teamId: clubA.id,
          roundReached: 11,
          stageLabel: 'Demi-finales de Conférence',
          isNationalChampion: false,
          isConferenceChampion: false,
          matchesWon: 10,
          matchesPlayed: 11,
        },
      },
      history: [],
    }

    const { report, nextClubs } = executeInterseasonTransition(
      [clubA, clubB],
      archive,
      [cityA, cityB],
      { maxFusions: 1, seed: 'cross-dept', popBounds: bounds },
    )

    expect(report.fusions).toHaveLength(1)
    expect(report.fusions[0].communeNames).toContain('Paris')
    expect(report.fusions[0].communeNames).toContain('Montreuil')

    // Since Montreuil (110k) is < 50% of Paris (2.1M), name preserves Paris name!
    const merged = nextClubs.find((c) => c.id === clubA.id)
    expect(merged?.name).toBe(clubA.name)
    expect(merged?.isFusion).toBe(true)
  })

  it('preserves small initiator town identity and orders its name before the larger neighbor', () => {
    const smallCity: Commune = {
      ...createFakeCommune('25527', 'Saint-Vit', 5000, '25', '27'),
      coordinates: [5.81, 47.18],
    }
    const smallClub = createClubFromCommune(smallCity, bounds)

    const largeCity: Commune = {
      ...createFakeCommune('25056', 'Besançon', 118000, '25', '27'),
      coordinates: [6.02, 47.24],
    }
    const largeClub = createClubFromCommune(largeCity, bounds)

    const archive: SeasonArchive = {
      year: 2026,
      seed: 'coupe-2026',
      completedAt: '2026-09-23T00:00:00.000Z',
      datasetVersion: '1.0',
      nationalChampionId: '99999',
      conferenceChampions: {},
      finalFourTeamIds: [],
      totalMatches: 10,
      teamPerformances: {
        [smallClub.id]: {
          teamId: smallClub.id,
          roundReached: 11,
          stageLabel: 'Demi-finales de Conférence',
          isNationalChampion: false,
          isConferenceChampion: false,
          isRegionChampion: true,
          matchesWon: 10,
          matchesPlayed: 11,
        },
      },
      history: [],
    }

    const { report, nextClubs } = executeInterseasonTransition(
      [smallClub, largeClub],
      archive,
      [smallCity, largeCity],
      { maxFusions: 1, seed: 'small-initiator', popBounds: bounds, maxPartnerPopulationRatio: 30 },
    )

    expect(report.fusions).toHaveLength(1)
    const fusion = report.fusions[0]

    // The small initiator remains the reference club
    expect(fusion.mergedClubId).toBe(smallClub.id)
    expect(fusion.absorbedClubId).toBe(largeClub.id)
    // Amélioration 1 : "Saint-Vit" contient un tiret → séparateur ' / '
    expect(fusion.mergedClubName).toContain('Saint-Vit / Besançon')
    expect(fusion.communeNames).toEqual(['Saint-Vit', 'Besançon'])

    const merged = nextClubs.find((c) => c.id === smallClub.id)
    expect(merged).toBeDefined()
    expect(merged?.communeName).toBe('Saint-Vit')
    expect(merged?.name).toBe(fusion.mergedClubName)
    expect(merged?.shortName).toContain('Saint-Vit / Besançon')
    expect(merged?.population).toBe(123000)
    expect(merged?.isFusion).toBe(true)

    // The absorbed larger city club is deleted from active clubs
    expect(nextClubs.find((c) => c.id === largeClub.id)).toBeUndefined()
  })

  // ─── Régénérations & Ententes ─────────────────────────────────────────────

  it('allows a large absorbed commune (>= 50 000) to regenerate a club while maintaining the entente with 50% pop loss', () => {
    // Setup: a pre-existing Entente entre Saint-Vit (5k, référent) et Besançon (118k, absorbé)
    const saintVitCommune = createFakeCommune('25556', 'Saint-Vit', 5000)
    const besanconCommune = createFakeCommune('25056', 'Besançon', 118000)

    // L'Entente est le club de Saint-Vit (référent), avec Besançon absorbé
    const enteClub: Club = Object.freeze({
      id: '25556',
      name: 'Entente Saint-Vit / Besançon',
      shortName: 'Entente Saint-Vit / Besançon',
      communeId: '25556',
      communeName: 'Saint-Vit',
      communeIds: ['25556', '25056'],
      communeNames: ['Saint-Vit', 'Besançon'],
      departmentId: '25',
      regionId: '27',
      zoneId: 'ZONE-A',
      conferenceId: 'EST',
      population: 123000,
      strength: 19.5,
      isFusion: true,
      fusionCount: 2,
    })

    // Un autre club pour fournir un champion
    const champ = createClubFromCommune(createFakeCommune('75056', 'Paris', 2000000, '75', '11'), bounds)

    const clubs = [enteClub, champ]
    const communes = [saintVitCommune, besanconCommune, createFakeCommune('75056', 'Paris', 2000000, '75', '11')]

    const archive: SeasonArchive = {
      year: 2027,
      seed: 'secession-test',
      completedAt: '2027-09-23T00:00:00.000Z',
      datasetVersion: '1.0',
      nationalChampionId: champ.id,
      conferenceChampions: { EST: champ.id },
      finalFourTeamIds: [champ.id],
      totalMatches: 1,
      teamPerformances: {
        [champ.id]: {
          teamId: champ.id,
          roundReached: 14,
          stageLabel: 'Champion',
          isNationalChampion: true,
          isConferenceChampion: true,
          matchesWon: 14,
          matchesPlayed: 14,
        },
        [enteClub.id]: {
          teamId: enteClub.id,
          roundReached: 1,
          stageLabel: 'Tour 1',
          isNationalChampion: false,
          isConferenceChampion: false,
          matchesWon: 0,
          matchesPlayed: 1,
        },
      },
      history: [],
    }

    // On teste plusieurs seeds pour en trouver un qui déclenche la régénération
    let secessionTriggered = false
    let result: ReturnType<typeof executeInterseasonTransition> | undefined

    for (let i = 0; i < 100; i++) {
      const r = executeInterseasonTransition(clubs, archive, communes, {
        seed: `secession-probe-${i}`,
        popBounds: bounds,
      })
      if (r.report.secessions.length > 0) {
        result = r
        secessionTriggered = true
        break
      }
    }

    expect(secessionTriggered).toBe(true)
    if (!result) return

    const { nextClubs, report } = result

    expect(report.secessions).toHaveLength(1)
    const sec = report.secessions[0]
    expect(sec.communeId).toBe('25056')
    expect(sec.communeName).toBe('Besançon')
    expect(sec.parentEnteId).toBe('25556')
    // Perte de 33 % de la population de la grande ville (118 000 * 0.33 = 38 940)
    expect(sec.populationLost).toBe(38940)

    // Le nouveau club de Besançon doit exister dans la liste avec sa population naturelle
    const newBesanconClub = nextClubs.find((c) => c.id === sec.newClubId)
    expect(newBesanconClub).toBeDefined()
    expect(newBesanconClub?.communeId).toBe('25056')
    expect(newBesanconClub?.communeName).toBe('Besançon')
    expect(newBesanconClub?.population).toBe(118000)

    // L'entente DOIT ENCORE EXISTER et MAINTENIR Besançon dans l'alliance !
    const updatedEnte = nextClubs.find((c) => c.id === '25556')
    expect(updatedEnte).toBeDefined()
    // Population réduite de 33 % de Besançon : 123 000 - 38 940 = 84 060
    expect(updatedEnte?.population).toBe(84060)
    // Besançon et Saint-Vit restent dans l'entente
    expect(updatedEnte?.communeIds).toEqual(['25556', '25056'])
    expect(updatedEnte?.communeNames).toEqual(['Saint-Vit', 'Besançon'])
    expect(updatedEnte?.name).toBe('Entente Saint-Vit / Besançon')
    expect(updatedEnte?.isFusion).toBe(true)
    expect(updatedEnte?.fusionCount).toBe(2)
  })

  it('deducts the quota on ALL alliances when a commune is involved in multiple alliances and regenerates', () => {
    // Commune A (partenaire, 80 000 hab.) est engagée dans deux alliances :
    // Alliance 1 avec Commune B (5 000 hab.) -> population totale 85 000
    // Alliance 2 avec Commune C (10 000 hab.) -> population totale 90 000
    const commA = createFakeCommune('25056', 'Besançon', 80000, '25', '27')
    const commB = createFakeCommune('25556', 'Saint-Vit', 5000, '25', '27')
    const commC = createFakeCommune('25001', 'Avanne', 10000, '25', '27')

    const alliance1: Club = Object.freeze({
      id: '25556',
      name: 'Entente Saint-Vit / Besançon',
      shortName: 'Entente Saint-Vit / Besançon',
      communeId: '25556',
      communeName: 'Saint-Vit',
      communeIds: ['25556', '25056'],
      communeNames: ['Saint-Vit', 'Besançon'],
      departmentId: '25',
      regionId: '27',
      zoneId: 'ZONE-A',
      conferenceId: 'EST',
      population: 85000,
      strength: 17.5,
      isFusion: true,
      fusionCount: 2,
    })

    const alliance2: Club = Object.freeze({
      id: '25001',
      name: 'Entente Avanne / Besançon',
      shortName: 'Entente Avanne / Besançon',
      communeId: '25001',
      communeName: 'Avanne',
      communeIds: ['25001', '25056'],
      communeNames: ['Avanne', 'Besançon'],
      departmentId: '25',
      regionId: '27',
      zoneId: 'ZONE-A',
      conferenceId: 'EST',
      population: 90000,
      strength: 17.8,
      isFusion: true,
      fusionCount: 2,
    })

    const champ = createClubFromCommune(createFakeCommune('75056', 'Paris', 2000000, '75', '11'), bounds)
    const clubs = [alliance1, alliance2, champ]
    const communes = [commA, commB, commC, createFakeCommune('75056', 'Paris', 2000000, '75', '11')]

    const archive: SeasonArchive = {
      year: 2027,
      seed: 'multi-alliance-test',
      completedAt: '2027-09-23T00:00:00.000Z',
      datasetVersion: '1.0',
      nationalChampionId: champ.id,
      conferenceChampions: { EST: champ.id },
      finalFourTeamIds: [champ.id],
      totalMatches: 1,
      teamPerformances: {
        [champ.id]: { teamId: champ.id, roundReached: 14, stageLabel: 'Champion', isNationalChampion: true, isConferenceChampion: true, matchesWon: 14, matchesPlayed: 14 },
        [alliance1.id]: { teamId: alliance1.id, roundReached: 1, stageLabel: 'Tour 1', isNationalChampion: false, isConferenceChampion: false, matchesWon: 0, matchesPlayed: 1 },
        [alliance2.id]: { teamId: alliance2.id, roundReached: 1, stageLabel: 'Tour 1', isNationalChampion: false, isConferenceChampion: false, matchesWon: 0, matchesPlayed: 1 },
      },
      history: [],
    }

    let result: ReturnType<typeof executeInterseasonTransition> | undefined
    for (let i = 0; i < 100; i++) {
      const r = executeInterseasonTransition(clubs, archive, communes, {
        seed: `multi-sec-probe-${i}`,
        popBounds: bounds,
      })
      if (r.report.secessions.length > 0) {
        result = r
        break
      }
    }

    expect(result).toBeDefined()
    if (!result) return

    // 1 seul club local autonome créé pour Besançon
    const besanconClubs = result.nextClubs.filter((c) => c.communeId === '25056' && !c.isFusion)
    expect(besanconClubs).toHaveLength(1)
    expect(besanconClubs[0].population).toBe(80000)

    // Les DEUX alliances doivent avoir déduit 33 % de la population de Besançon (26 400 hab.)
    const updatedAlliance1 = result.nextClubs.find((c) => c.id === alliance1.id)
    const updatedAlliance2 = result.nextClubs.find((c) => c.id === alliance2.id)

    expect(updatedAlliance1).toBeDefined()
    expect(updatedAlliance2).toBeDefined()
    // Alliance 1 : 85 000 - 26 400 = 58 600
    expect(updatedAlliance1?.population).toBe(58600)
    // Alliance 2 : 90 000 - 26 400 = 63 600
    expect(updatedAlliance2?.population).toBe(63600)

    // Le rapport de régénération inclut bien les deux alliances affectées
    expect(result.report.secessions).toHaveLength(2)
    expect(result.report.secessions.map((s) => s.parentEnteId).sort()).toEqual(['25001', '25556'])
  })

  it('never triggers regeneration for communes under 50 000 inhabitants', () => {
    // Commune moyenne absorbée (35 000 hab.) : inférieure au seuil de 50 000, ne doit jamais régénérer
    const mediumCommune = createFakeCommune('12345', 'Ville-Moyenne', 35000)
    const bigCommune = createFakeCommune('67890', 'Grande-Ville', 80000)

    const enteClub: Club = Object.freeze({
      id: '67890',
      name: 'Entente Grande-Ville-Ville-Moyenne',
      shortName: 'Entente Grande-Ville-Ville-Moyenne',
      communeId: '67890',
      communeName: 'Grande-Ville',
      communeIds: ['67890', '12345'],
      communeNames: ['Grande-Ville', 'Ville-Moyenne'],
      departmentId: '67',
      regionId: '44',
      zoneId: 'ZONE-B',
      conferenceId: 'NORD',
      population: 115000,
      strength: 18.0,
      isFusion: true,
      fusionCount: 2,
    })

    const champ = createClubFromCommune(createFakeCommune('75056', 'Paris', 2000000, '75', '11'), bounds)
    const clubs = [enteClub, champ]
    const communes = [mediumCommune, bigCommune, createFakeCommune('75056', 'Paris', 2000000, '75', '11')]

    const archive: SeasonArchive = {
      year: 2027,
      seed: 'no-secession-test',
      completedAt: '2027-09-23T00:00:00.000Z',
      datasetVersion: '1.0',
      nationalChampionId: champ.id,
      conferenceChampions: { NORD: champ.id },
      finalFourTeamIds: [champ.id],
      totalMatches: 1,
      teamPerformances: {
        [champ.id]: { teamId: champ.id, roundReached: 14, stageLabel: 'Champion', isNationalChampion: true, isConferenceChampion: true, matchesWon: 14, matchesPlayed: 14 },
        [enteClub.id]: { teamId: enteClub.id, roundReached: 1, stageLabel: 'Tour 1', isNationalChampion: false, isConferenceChampion: false, matchesWon: 0, matchesPlayed: 1 },
      },
      history: [],
    }

    // Tester sur 200 seeds : aucune régénération pour une commune de 35 000 hab.
    for (let i = 0; i < 200; i++) {
      const r = executeInterseasonTransition(clubs, archive, communes, {
        seed: `no-sec-${i}`,
        popBounds: bounds,
      })
      expect(r.report.secessions).toHaveLength(0)
    }
  })

  it('does not regenerate a club if the commune already has a club directly attached, even if that club is in an alliance or is a rival', () => {
    // Besançon (118 000 hab.) est partenaire dans une entente menée par Saint-Vit
    const saintVitCommune = createFakeCommune('25556', 'Saint-Vit', 5000)
    const besanconCommune = createFakeCommune('25056', 'Besançon', 118000)
    const avanneCommune = createFakeCommune('25001', 'Avanne', 3000)

    const enteSaintVitBesancon: Club = Object.freeze({
      id: '25556',
      name: 'Entente Saint-Vit / Besançon',
      shortName: 'Entente Saint-Vit / Besançon',
      communeId: '25556',
      communeName: 'Saint-Vit',
      communeIds: ['25556', '25056'],
      communeNames: ['Saint-Vit', 'Besançon'],
      departmentId: '25',
      regionId: '27',
      zoneId: 'ZONE-A',
      conferenceId: 'EST',
      population: 123000,
      strength: 19.5,
      isFusion: true,
      fusionCount: 2,
    })

    // Besançon a DÉJÀ un club directement rattaché (ex: une autre alliance menée par Besançon, ou un club rival)
    const besanconAllianceClub: Club = Object.freeze({
      id: '25056-2',
      name: 'Entente Besançon / Avanne',
      shortName: 'Entente Besançon / Avanne',
      communeId: '25056',
      communeName: 'Besançon',
      communeIds: ['25056', '25001'],
      communeNames: ['Besançon', 'Avanne'],
      departmentId: '25',
      regionId: '27',
      zoneId: 'ZONE-A',
      conferenceId: 'EST',
      population: 121000,
      strength: 19.4,
      isFusion: true,
      fusionCount: 2,
    })

    const champ = createClubFromCommune(createFakeCommune('75056', 'Paris', 2000000, '75', '11'), bounds)
    const clubs = [enteSaintVitBesancon, besanconAllianceClub, champ]
    const communes = [saintVitCommune, besanconCommune, avanneCommune, createFakeCommune('75056', 'Paris', 2000000, '75', '11')]

    const archive: SeasonArchive = {
      year: 2027,
      seed: 'already-attached-test',
      completedAt: '2027-09-23T00:00:00.000Z',
      datasetVersion: '1.0',
      nationalChampionId: champ.id,
      conferenceChampions: { EST: champ.id },
      finalFourTeamIds: [champ.id],
      totalMatches: 1,
      teamPerformances: {
        [champ.id]: { teamId: champ.id, roundReached: 14, stageLabel: 'Champion', isNationalChampion: true, isConferenceChampion: true, matchesWon: 14, matchesPlayed: 14 },
        [enteSaintVitBesancon.id]: { teamId: enteSaintVitBesancon.id, roundReached: 1, stageLabel: 'Tour 1', isNationalChampion: false, isConferenceChampion: false, matchesWon: 0, matchesPlayed: 1 },
        [besanconAllianceClub.id]: { teamId: besanconAllianceClub.id, roundReached: 1, stageLabel: 'Tour 1', isNationalChampion: false, isConferenceChampion: false, matchesWon: 0, matchesPlayed: 1 },
      },
      history: [],
    }

    // Sur 100 tirages différents, Besançon ne doit JAMAIS régénérer de club car elle en a déjà un directement rattaché
    for (let i = 0; i < 100; i++) {
      const r = executeInterseasonTransition(clubs, archive, communes, {
        seed: `already-attached-probe-${i}`,
        popBounds: bounds,
      })
      const besanconSecessions = r.report.secessions.filter((s) => s.communeId === '25056')
      expect(besanconSecessions).toHaveLength(0)
    }
  })

  it('progressively erodes 33% per step and completely withdraws at step 3, restoring the host town genuine name and never dropping below floor', () => {
    // Saint-Vit (5 000 hab.) est allié à Paris (2 100 000 hab.)
    const saintVitCommune = createFakeCommune('25556', 'Saint-Vit', 5000)
    const parisCommune = createFakeCommune('75056', 'Paris', 2100000)

    const initialEnte: Club = Object.freeze({
      id: '25556',
      name: 'Entente Saint-Vit / Paris',
      shortName: 'Entente Saint-Vit / Paris',
      communeId: '25556',
      communeName: 'Saint-Vit',
      communeIds: ['25556', '75056'],
      communeNames: ['Saint-Vit', 'Paris'],
      departmentId: '25',
      regionId: '27',
      zoneId: 'ZONE-A',
      conferenceId: 'EST',
      population: 2105000,
      strength: 30.0,
      isFusion: true,
      fusionCount: 2,
    })

    const champ = createClubFromCommune(createFakeCommune('13055', 'Marseille', 870000, '13', '93'), bounds)
    const communes = [saintVitCommune, parisCommune, createFakeCommune('13055', 'Marseille', 870000, '13', '93')]

    const makeArchive = (year: number): SeasonArchive => ({
      year,
      seed: `multi-step-${year}`,
      completedAt: `${year}-09-23T00:00:00.000Z`,
      datasetVersion: '1.0',
      nationalChampionId: champ.id,
      conferenceChampions: { EST: champ.id },
      finalFourTeamIds: [champ.id],
      totalMatches: 1,
      teamPerformances: {
        [champ.id]: { teamId: champ.id, roundReached: 14, stageLabel: 'Champion', isNationalChampion: true, isConferenceChampion: true, matchesWon: 14, matchesPlayed: 14 },
        ['25556']: { teamId: '25556', roundReached: 1, stageLabel: 'Tour 1', isNationalChampion: false, isConferenceChampion: false, matchesWon: 0, matchesPlayed: 1 },
      },
      history: [],
    })

    // ÉTAPE 1 : Première régénération -> perte de 33% de Paris (693 000 hab.), reste dans l'entente
    let r1: ReturnType<typeof executeInterseasonTransition> | undefined
    for (let i = 0; i < 100; i++) {
      const res = executeInterseasonTransition([initialEnte, champ], makeArchive(2027), communes, {
        seed: `step1-probe-${i}`,
        popBounds: bounds,
      })
      if (res.report.secessions.length > 0) {
        r1 = res
        break
      }
    }
    expect(r1).toBeDefined()
    if (!r1) return

    expect(r1.report.secessions[0].step).toBe(1)
    expect(r1.report.secessions[0].isCompleteWithdrawal).toBeFalsy()
    expect(r1.report.secessions[0].populationLost).toBe(693000)

    const enteAfterStep1 = r1.nextClubs.find((c) => c.id === '25556')!
    expect(enteAfterStep1.population).toBe(2105000 - 693000) // 1 412 000
    expect(enteAfterStep1.isFusion).toBe(true)
    expect(enteAfterStep1.communeIds).toContain('75056')
    expect(enteAfterStep1.secessionCounts?.['75056']).toBe(1)

    // ÉTAPE 2 : Deuxième régénération -> perte de 33% supplémentaire
    let r2: ReturnType<typeof executeInterseasonTransition> | undefined
    for (let i = 0; i < 100; i++) {
      const res = executeInterseasonTransition(r1.nextClubs, makeArchive(2028), communes, {
        seed: `step2-probe-${i}`,
        popBounds: bounds,
      })
      if (res.report.secessions.length > 0) {
        r2 = res
        break
      }
    }
    expect(r2).toBeDefined()
    if (!r2) return

    expect(r2.report.secessions[0].step).toBe(2)
    expect(r2.report.secessions[0].isCompleteWithdrawal).toBeFalsy()
    expect(r2.report.secessions[0].populationLost).toBe(693000)

    const enteAfterStep2 = r2.nextClubs.find((c) => c.id === '25556')!
    expect(enteAfterStep2.population).toBe(1412000 - 693000) // 719 000
    expect(enteAfterStep2.isFusion).toBe(true)
    expect(enteAfterStep2.communeIds).toContain('75056')
    expect(enteAfterStep2.secessionCounts?.['75056']).toBe(2)

    // ÉTAPE 3 : Troisième régénération -> RETRAIT TOTAL ET DÉFINITIF
    let r3: ReturnType<typeof executeInterseasonTransition> | undefined
    for (let i = 0; i < 100; i++) {
      const res = executeInterseasonTransition(r2.nextClubs, makeArchive(2029), communes, {
        seed: `step3-probe-${i}`,
        popBounds: bounds,
      })
      if (res.report.secessions.length > 0) {
        r3 = res
        break
      }
    }
    expect(r3).toBeDefined()
    if (!r3) return

    expect(r3.report.secessions[0].step).toBe(3)
    expect(r3.report.secessions[0].isCompleteWithdrawal).toBe(true)
    // Perte du solde restant : 719 000 - 5 000 = 714 000
    expect(r3.report.secessions[0].populationLost).toBe(714000)

    const clubAfterStep3 = r3.nextClubs.find((c) => c.id === '25556')!
    // La population retombe exactement sur le plancher de la commune hôte Saint-Vit (5 000 hab.)
    expect(clubAfterStep3.population).toBe(5000)
    // Elle ne descend JAMAIS en-dessous de Saint-Vit !
    expect(clubAfterStep3.population).toBeGreaterThanOrEqual(5000)
    // Paris a complètement quitté le club !
    expect(clubAfterStep3.communeIds).toEqual(['25556'])
    expect(clubAfterStep3.communeNames).toEqual(['Saint-Vit'])
    // Ce n'est plus une fusion
    expect(clubAfterStep3.isFusion).toBeFalsy()
    // Le nom d'origine de Saint-Vit est restauré
    expect(clubAfterStep3.name).not.toContain('Paris')
    expect(clubAfterStep3.name).toContain('Saint-Vit')
  })

  it('prevents a commune from being engaged in more than one entente', () => {
    // Commune X est déjà engagée dans Entente 1 avec Commune Y
    // Commune X a aussi un second club autonome (ex: club local après régénération ou rival)
    // Ce second club ne doit PAS pouvoir créer une Entente 2 avec Commune Z
    const commX = createFakeCommune('10001', 'Commune-X', 60000, '10', '44', [3.0, 48.0])
    const commY = createFakeCommune('10002', 'Commune-Y', 20000, '10', '44', [3.05, 48.02])
    const commZ = createFakeCommune('10003', 'Commune-Z', 15000, '10', '44', [3.02, 48.01])

    const ententeXY: Club = Object.freeze({
      id: '10002',
      name: 'Entente Commune-Y-Commune-X',
      shortName: 'Entente Commune-Y-Commune-X',
      communeId: '10002',
      communeName: 'Commune-Y',
      communeIds: ['10002', '10001'],
      communeNames: ['Commune-Y', 'Commune-X'],
      departmentId: '10',
      regionId: '44',
      zoneId: 'ZONE-B',
      conferenceId: 'NORD',
      population: 80000,
      strength: 16.5,
      coordinates: commY.coordinates,
      isFusion: true,
      fusionCount: 2,
    })

    // Second club autonome de Commune-X
    const clubXAutonome: Club = Object.freeze({
      id: '10001-2',
      name: 'RC Commune-X',
      shortName: 'RC Commune-X',
      communeId: '10001',
      communeName: 'Commune-X',
      communeIds: ['10001'],
      communeNames: ['Commune-X'],
      departmentId: '10',
      regionId: '44',
      zoneId: 'ZONE-B',
      conferenceId: 'NORD',
      population: 60000,
      strength: 15.0,
      coordinates: commX.coordinates,
    })

    // Club de Commune-Z
    const clubZ = createClubFromCommune(commZ, bounds)

    const champ = createClubFromCommune(createFakeCommune('75056', 'Paris', 2000000, '75', '11'), bounds)

    const clubs = [ententeXY, clubXAutonome, clubZ, champ]
    const communes = [commX, commY, commZ, createFakeCommune('75056', 'Paris', 2000000, '75', '11')]

    const archive: SeasonArchive = {
      year: 2027,
      seed: 'one-entente-test',
      completedAt: '2027-09-23T00:00:00.000Z',
      datasetVersion: '1.0',
      nationalChampionId: champ.id,
      conferenceChampions: { NORD: champ.id },
      finalFourTeamIds: [champ.id],
      totalMatches: 1,
      teamPerformances: {
        [champ.id]: { teamId: champ.id, roundReached: 14, stageLabel: 'Champion', isNationalChampion: true, isConferenceChampion: true, matchesWon: 14, matchesPlayed: 14 },
        [clubXAutonome.id]: { teamId: clubXAutonome.id, roundReached: 11, stageLabel: 'Tour 11', isNationalChampion: false, isConferenceChampion: false, matchesWon: 10, matchesPlayed: 11 },
        [clubZ.id]: { teamId: clubZ.id, roundReached: 1, stageLabel: 'Tour 1', isNationalChampion: false, isConferenceChampion: false, matchesWon: 0, matchesPlayed: 1 },
      },
      history: [],
    }

    const r = executeInterseasonTransition(clubs, archive, communes, {
      seed: 'one-entente-seed',
      popBounds: bounds,
      maxFusions: 10,
    })

    // clubXAutonome a les mêmes droits qu'un club classique : il peut s'allier à Commune-Z
    // En revanche, il ne peut PAS fusionner avec ententeXY car ils partagent Commune-X
    const mergedWithEntenteXY = r.report.fusions.find(
      (f) =>
        (f.mergedClubId === ententeXY.id && f.absorbedClubId === clubXAutonome.id) ||
        (f.mergedClubId === clubXAutonome.id && f.absorbedClubId === ententeXY.id),
    )
    expect(mergedWithEntenteXY).toBeUndefined()

    // Et l'alliance avec Commune-Z est autorisée car clubXAutonome est un club à part entière
    const fusionWithZ = r.report.fusions.find((f) => f.absorbedClubId === clubZ.id)
    expect(fusionWithZ).toBeDefined()
  })

  it('guarantees unique club IDs across multiple seasons using communeNextIndex', () => {
    const commune = createFakeCommune('42100', 'Saint-Étienne', 170000, '42', '84')
    const club = createClubFromCommune(commune, bounds)
    const communes = [commune]

    const archive: SeasonArchive = {
      year: 2027,
      seed: 'unique-id-test',
      completedAt: '2027-09-23T00:00:00.000Z',
      datasetVersion: '1.0',
      nationalChampionId: club.id,
      conferenceChampions: { EST: club.id },
      finalFourTeamIds: [club.id],
      totalMatches: 1,
      teamPerformances: {
        [club.id]: { teamId: club.id, roundReached: 14, stageLabel: 'Champion', isNationalChampion: true, isConferenceChampion: true, matchesWon: 14, matchesPlayed: 14 },
      },
      history: [],
    }

    // Saison 1 : crée un rival
    const r1 = executeInterseasonTransition([club], archive, communes, {
      seed: 'test-rival-1',
      popBounds: bounds,
    })
    const rival1 = r1.report.rivalCreated
    expect(rival1).toBeDefined()

    // L'ID du rival doit différer de l'ID original
    expect(rival1!.clubId).not.toBe(club.id)

    // Saison 2 : utiliser le nextCommuneNextIndex → le prochain rival doit avoir un ID encore différent
    const clubs2 = r1.nextClubs
    const archive2: SeasonArchive = { ...archive, year: 2028, seed: 'test-seed-2' }
    const r2 = executeInterseasonTransition(clubs2, archive2, communes, {
      seed: 'test-rival-2',
      popBounds: bounds,
      communeNextIndex: r1.nextCommuneNextIndex,
    })

    const rival2 = r2.report.rivalCreated
    if (rival2) {
      // L'ID du second rival doit être différent du premier ET du club original
      expect(rival2.clubId).not.toBe(club.id)
      expect(rival2.clubId).not.toBe(rival1!.clubId)
    }

    // Tous les IDs dans nextClubs doivent être uniques
    const ids = r2.nextClubs.map((c) => c.id)
    const uniqueIds = new Set(ids)
    expect(uniqueIds.size).toBe(ids.length)
  })

  describe('fusion balance rules (user directive)', () => {
    it('prevents a single non-fusion club from absorbing an existing fusion', () => {
      // Club A: single town, pop 30 000
      const cA = createFakeCommune('01001', 'Bourg-Sud', 30000, '01', '84', [5.22, 46.20])
      const clubA = createClubFromCommune(cA, bounds)

      // Club B: an existing fusion of 2 towns, total pop 40 000
      const cB1 = createFakeCommune('01002', 'Bourg-Nord', 25000, '01', '84', [5.24, 46.21])
      const cB2 = createFakeCommune('01003', 'Bourg-Est', 15000, '01', '84', [5.25, 46.22])
      const baseB = createClubFromCommune(cB1, bounds)
      const clubBFusion: Club = {
        ...baseB,
        name: 'Entente Bourg-Nord-Est',
        isFusion: true,
        fusionCount: 2,
        communeIds: [cB1.id, cB2.id],
        communeNames: [cB1.name, cB2.name],
        population: 40000,
      }

      const communes = [cA, cB1, cB2]
      const archive: SeasonArchive = {
        year: 2026,
        seed: 'test-seed-balance',
        completedAt: '2026-09-23T00:00:00.000Z',
        datasetVersion: '1.0',
        nationalChampionId: '99999',
        conferenceChampions: { EST: '99999' },
        finalFourTeamIds: ['99999'],
        totalMatches: 10,
        teamPerformances: {
          [clubA.id]: { teamId: clubA.id, roundReached: 10, stageLabel: 'Quart', isNationalChampion: false, isConferenceChampion: false, matchesWon: 10, matchesPlayed: 11 },
          [clubBFusion.id]: { teamId: clubBFusion.id, roundReached: 1, stageLabel: 'T1', isNationalChampion: false, isConferenceChampion: false, matchesWon: 0, matchesPlayed: 1 },
        },
        history: [],
      }

      // Run transition with clubA as lead candidate and clubBFusion nearby
      const res = executeInterseasonTransition([clubA, clubBFusion], archive, communes, {
        seed: 'fixed-seed-test',
        popBounds: bounds,
        maxFusions: 1,
      })

      // Since clubA is NOT a fusion, it cannot absorb clubBFusion (which is an existing fusion)
      const fusionWithB = res.report.fusions.find((f) => f.absorbedClubId === clubBFusion.id)
      expect(fusionWithB).toBeUndefined()
    })

    it('prevents an existing fusion from absorbing another fusion if the other exceeds 50% population', () => {
      // Fusion A: lead fusion, pop 100 000
      const cA1 = createFakeCommune('01010', 'Grand-A', 60000, '01', '84', [5.20, 46.20])
      const cA2 = createFakeCommune('01011', 'Grand-A-Sub', 40000, '01', '84', [5.21, 46.20])
      const baseA = createClubFromCommune(cA1, bounds)
      const fusionA: Club = {
        ...baseA,
        name: 'Grand-A FC',
        isFusion: true,
        fusionCount: 2,
        communeIds: [cA1.id, cA2.id],
        communeNames: [cA1.name, cA2.name],
        population: 100000,
      }

      // Fusion B: nearby fusion, pop 60 000 (> 50% of 100 000)
      const cB1 = createFakeCommune('01020', 'Fusion-B1', 35000, '01', '84', [5.22, 46.22])
      const cB2 = createFakeCommune('01021', 'Fusion-B2', 25000, '01', '84', [5.23, 46.22])
      const baseB = createClubFromCommune(cB1, bounds)
      const fusionB: Club = {
        ...baseB,
        name: 'Entente B1-B2',
        isFusion: true,
        fusionCount: 2,
        communeIds: [cB1.id, cB2.id],
        communeNames: [cB1.name, cB2.name],
        population: 60000,
      }

      const communes = [cA1, cA2, cB1, cB2]
      const archive: SeasonArchive = {
        year: 2026,
        seed: 'test-seed-balance-2',
        completedAt: '2026-09-23T00:00:00.000Z',
        datasetVersion: '1.0',
        nationalChampionId: '99999',
        conferenceChampions: { EST: '99999' },
        finalFourTeamIds: ['99999'],
        totalMatches: 10,
        teamPerformances: {
          [fusionA.id]: { teamId: fusionA.id, roundReached: 12, stageLabel: 'Demi', isNationalChampion: false, isConferenceChampion: false, matchesWon: 12, matchesPlayed: 13 },
          [fusionB.id]: { teamId: fusionB.id, roundReached: 1, stageLabel: 'T1', isNationalChampion: false, isConferenceChampion: false, matchesWon: 0, matchesPlayed: 1 },
        },
        history: [],
      }

      const res = executeInterseasonTransition([fusionA, fusionB], archive, communes, {
        seed: 'fixed-seed-test-2',
        popBounds: bounds,
        maxFusions: 1,
      })

      // 60 000 is > 50% of 100 000, so fusionA cannot absorb fusionB
      expect(res.report.fusions.length).toBe(0)
    })

    it('allows an existing fusion to absorb a small fusion of <= 50% population', () => {
      // Fusion A: lead fusion, pop 100 000
      const cA1 = createFakeCommune('01030', 'Mega-A1', 60000, '01', '84', [5.20, 46.20])
      const cA2 = createFakeCommune('01031', 'Mega-A2', 40000, '01', '84', [5.21, 46.20])
      const baseA = createClubFromCommune(cA1, bounds)
      const fusionA: Club = {
        ...baseA,
        name: 'Mega-A FC',
        isFusion: true,
        fusionCount: 2,
        communeIds: [cA1.id, cA2.id],
        communeNames: [cA1.name, cA2.name],
        population: 100000,
      }

      // Fusion B: nearby small fusion, pop 30 000 (<= 50% of 100 000)
      const cB1 = createFakeCommune('01040', 'Petite-B1', 20000, '01', '84', [5.22, 46.22])
      const cB2 = createFakeCommune('01041', 'Petite-B2', 10000, '01', '84', [5.23, 46.22])
      const baseB = createClubFromCommune(cB1, bounds)
      const fusionB: Club = {
        ...baseB,
        name: 'Entente B1-B2',
        isFusion: true,
        fusionCount: 2,
        communeIds: [cB1.id, cB2.id],
        communeNames: [cB1.name, cB2.name],
        population: 30000,
      }

      const communes = [cA1, cA2, cB1, cB2]
      const archive: SeasonArchive = {
        year: 2026,
        seed: 'test-seed-balance-3',
        completedAt: '2026-09-23T00:00:00.000Z',
        datasetVersion: '1.0',
        nationalChampionId: '99999',
        conferenceChampions: { EST: '99999' },
        finalFourTeamIds: ['99999'],
        totalMatches: 10,
        teamPerformances: {
          [fusionA.id]: { teamId: fusionA.id, roundReached: 12, stageLabel: 'Demi', isNationalChampion: false, isConferenceChampion: false, matchesWon: 12, matchesPlayed: 13 },
          [fusionB.id]: { teamId: fusionB.id, roundReached: 1, stageLabel: 'T1', isNationalChampion: false, isConferenceChampion: false, matchesWon: 0, matchesPlayed: 1 },
        },
        history: [],
      }

      const res = executeInterseasonTransition([fusionA, fusionB], archive, communes, {
        seed: 'fixed-seed-test-3',
        popBounds: bounds,
        maxFusions: 1,
      })

      // 30 000 <= 50% of 100 000: absorption is allowed!
      expect(res.report.fusions.length).toBe(1)
      expect(res.report.fusions[0].mergedClubId).toBe(fusionA.id)
      expect(res.report.fusions[0].absorbedClubId).toBe(fusionB.id)
      expect(res.report.fusions[0].totalPopulation).toBe(130000)
    })
  })

  describe('rival clubs equality of rights (user directive)', () => {
    it('allows a rival club to initiate a fusion, absorb a partner, and retain its rival status', () => {
      // Commune 1 : Paris (has a historic club AND a rival club)
      const cParis = createFakeCommune('75056', 'Paris', 2100000, '75', '11', [2.35, 48.85])
      const parisHistoric = createClubFromCommune(cParis, bounds)

      const parisRival: Club = {
        ...parisHistoric,
        id: '75056-2',
        name: 'FC Paris',
        shortName: 'FC Paris',
        identity: { primaryColor: '#123456', secondaryColor: '#ffffff', logo: '/club-logos/etoile.svg' },
        isRivalClub: true,
        parentChampionYear: 2026,
        strength: 22,
      }

      // Commune 2 : Nearby partner (e.g. Saint-Denis, 110 000)
      const cSaintDenis = createFakeCommune('93066', 'Saint-Denis', 110000, '93', '11', [2.36, 48.93])
      const saintDenisClub = createClubFromCommune(cSaintDenis, bounds)

      const communes = [cParis, cSaintDenis]
      const archive: SeasonArchive = {
        year: 2027,
        seed: 'test-seed-rival-fuse',
        completedAt: '2027-09-23T00:00:00.000Z',
        datasetVersion: '1.0',
        nationalChampionId: '99999',
        conferenceChampions: { IDF: '99999' },
        finalFourTeamIds: ['99999'],
        totalMatches: 10,
        teamPerformances: {
          [parisRival.id]: { teamId: parisRival.id, roundReached: 12, stageLabel: 'Demi', isNationalChampion: false, isConferenceChampion: false, matchesWon: 12, matchesPlayed: 13 },
          [saintDenisClub.id]: { teamId: saintDenisClub.id, roundReached: 1, stageLabel: 'T1', isNationalChampion: false, isConferenceChampion: false, matchesWon: 0, matchesPlayed: 1 },
        },
        history: [],
      }

      const res = executeInterseasonTransition([parisHistoric, parisRival, saintDenisClub], archive, communes, {
        seed: 'fixed-seed-rival',
        popBounds: bounds,
        maxFusions: 1,
      })

      // The rival club MUST be able to fuse and absorb Saint-Denis
      expect(res.report.fusions.length).toBe(1)
      const fusion = res.report.fusions[0]
      expect(fusion.mergedClubId).toBe(parisRival.id)
      expect(fusion.absorbedClubId).toBe(saintDenisClub.id)

      // The resulting merged club MUST retain isRivalClub = true and parentChampionYear = 2026
      const mergedClub = res.nextClubs.find((c) => c.id === parisRival.id)
      expect(mergedClub).toBeDefined()
      expect(mergedClub?.isRivalClub).toBe(true)
      expect(mergedClub?.parentChampionYear).toBe(2026)
      expect(mergedClub?.identity).toEqual(parisRival.identity)
      expect(mergedClub?.isFusion).toBe(true)
      expect(mergedClub?.communeIds).toContain('75056')
      expect(mergedClub?.communeIds).toContain('93066')
    })

    it('allows a rival club to be absorbed by another club', () => {
      // Commune 1 : Lyon (historic club + rival club)
      const cLyon = createFakeCommune('69123', 'Lyon', 520000, '69', '84', [4.83, 45.76])
      const lyonHistoric = createClubFromCommune(cLyon, bounds)
      const lyonRival: Club = {
        ...lyonHistoric,
        id: '69123-2',
        name: 'Olympique Lyonnais 1899',
        shortName: 'OL 1899',
        isRivalClub: true,
        parentChampionYear: 2026,
        population: 15000,
        strength: 8,
      }

      // Commune 2 : Nearby larger fusion or strong club (e.g. Villeurbanne)
      const cVilleurbanne = createFakeCommune('69266', 'Villeurbanne', 150000, '69', '84', [4.88, 45.77])
      const villeurbanneClub = createClubFromCommune(cVilleurbanne, bounds)

      const communes = [cLyon, cVilleurbanne]
      const archive: SeasonArchive = {
        year: 2027,
        seed: 'test-seed-rival-absorbed',
        completedAt: '2027-09-23T00:00:00.000Z',
        datasetVersion: '1.0',
        nationalChampionId: '99999',
        conferenceChampions: { EST: '99999' },
        finalFourTeamIds: ['99999'],
        totalMatches: 10,
        teamPerformances: {
          [villeurbanneClub.id]: { teamId: villeurbanneClub.id, roundReached: 12, stageLabel: 'Demi', isNationalChampion: false, isConferenceChampion: false, matchesWon: 12, matchesPlayed: 13 },
          [lyonRival.id]: { teamId: lyonRival.id, roundReached: 1, stageLabel: 'T1', isNationalChampion: false, isConferenceChampion: false, matchesWon: 0, matchesPlayed: 1 },
        },
        history: [],
      }

      const res = executeInterseasonTransition([lyonRival, villeurbanneClub], archive, communes, {
        seed: 'fixed-seed-absorbed',
        popBounds: bounds,
        maxFusions: 1,
      })

      // Villeurbanne can absorb lyonRival
      expect(res.report.fusions.length).toBe(1)
      expect(res.report.fusions[0].mergedClubId).toBe(villeurbanneClub.id)
      expect(res.report.fusions[0].absorbedClubId).toBe(lyonRival.id)
    })

    it('prevents a rival club from merging with another club from its own commune', () => {
      const cMarseille = createFakeCommune('13055', 'Marseille', 870000, '13', '93', [5.37, 43.30])
      const marseilleHistoric = createClubFromCommune(cMarseille, bounds)
      const marseilleRival: Club = {
        ...marseilleHistoric,
        id: '13055-2',
        name: 'AS Marseille',
        shortName: 'AS Marseille',
        isRivalClub: true,
        parentChampionYear: 2026,
        strength: 22,
      }

      const communes = [cMarseille]
      const archive: SeasonArchive = {
        year: 2027,
        seed: 'test-seed-derby-no-merge',
        completedAt: '2027-09-23T00:00:00.000Z',
        datasetVersion: '1.0',
        nationalChampionId: '99999',
        conferenceChampions: { SUD: '99999' },
        finalFourTeamIds: ['99999'],
        totalMatches: 10,
        teamPerformances: {
          [marseilleHistoric.id]: { teamId: marseilleHistoric.id, roundReached: 12, stageLabel: 'Demi', isNationalChampion: false, isConferenceChampion: false, matchesWon: 12, matchesPlayed: 13 },
          [marseilleRival.id]: { teamId: marseilleRival.id, roundReached: 1, stageLabel: 'T1', isNationalChampion: false, isConferenceChampion: false, matchesWon: 0, matchesPlayed: 1 },
        },
        history: [],
      }

      const res = executeInterseasonTransition([marseilleHistoric, marseilleRival], archive, communes, {
        seed: 'fixed-seed-derby',
        popBounds: bounds,
        maxFusions: 1,
      })

      // The two clubs from the same city cannot merge together into one
      expect(res.report.fusions.length).toBe(0)
    })

    it('strictly forbids two rival clubs from absorbing each other', () => {
      // Deux clubs rivaux de villes voisines (ex: Paris rival et Saint-Denis rival)
      const cParis = createFakeCommune('75056', 'Paris', 2100000, '75', '11', [2.35, 48.85])
      const cSaintDenis = createFakeCommune('93066', 'Saint-Denis', 110000, '93', '11', [2.36, 48.93])

      const parisRival: Club = {
        ...createClubFromCommune(cParis, bounds),
        id: '75056-2',
        name: 'FC Paris',
        isRivalClub: true,
        parentChampionYear: 2026,
        strength: 22,
      }

      const saintDenisRival: Club = {
        ...createClubFromCommune(cSaintDenis, bounds),
        id: '93066-2',
        name: 'Olympique Saint-Denis',
        isRivalClub: true,
        parentChampionYear: 2026,
        strength: 15,
      }

      const communes = [cParis, cSaintDenis]
      const archive: SeasonArchive = {
        year: 2027,
        seed: 'test-seed-two-rivals',
        completedAt: '2027-09-23T00:00:00.000Z',
        datasetVersion: '1.0',
        nationalChampionId: '99999',
        conferenceChampions: { IDF: '99999' },
        finalFourTeamIds: ['99999'],
        totalMatches: 10,
        teamPerformances: {
          [parisRival.id]: { teamId: parisRival.id, roundReached: 12, stageLabel: 'Demi', isNationalChampion: false, isConferenceChampion: false, matchesWon: 12, matchesPlayed: 13 },
          [saintDenisRival.id]: { teamId: saintDenisRival.id, roundReached: 1, stageLabel: 'T1', isNationalChampion: false, isConferenceChampion: false, matchesWon: 0, matchesPlayed: 1 },
        },
        history: [],
      }

      const res = executeInterseasonTransition([parisRival, saintDenisRival], archive, communes, {
        seed: 'fixed-seed-two-rivals',
        popBounds: bounds,
        maxFusions: 1,
      })

      // Deux clubs rivaux ne peuvent JAMAIS s'absorber entre eux
      expect(res.report.fusions.length).toBe(0)
    })

    it('strictly forbids a club created from a rival club from being absorbed by its rival parent', () => {
      // Un club rival de base (FC Paris) et un club créé à partir de lui (Paris Rive Gauche)
      const cParis = createFakeCommune('75056', 'Paris', 2100000, '75', '11', [2.35, 48.85])

      const rivalParent: Club = {
        ...createClubFromCommune(cParis, bounds),
        id: '75056-2',
        name: 'FC Paris',
        isRivalClub: true,
        parentChampionYear: 2026,
        strength: 24,
      }

      const rivalChild: Club = {
        ...createClubFromCommune(cParis, bounds),
        id: '75056-3',
        name: 'Paris Rive Gauche',
        isRivalClub: true,
        parentClubId: '75056-2',
        parentChampionYear: 2027,
        strength: 18,
      }

      const communes = [cParis]
      const archive: SeasonArchive = {
        year: 2028,
        seed: 'test-seed-rival-lineage',
        completedAt: '2028-09-23T00:00:00.000Z',
        datasetVersion: '1.0',
        nationalChampionId: '99999',
        conferenceChampions: { IDF: '99999' },
        finalFourTeamIds: ['99999'],
        totalMatches: 10,
        teamPerformances: {
          [rivalParent.id]: { teamId: rivalParent.id, roundReached: 12, stageLabel: 'Demi', isNationalChampion: false, isConferenceChampion: false, matchesWon: 12, matchesPlayed: 13 },
          [rivalChild.id]: { teamId: rivalChild.id, roundReached: 1, stageLabel: 'T1', isNationalChampion: false, isConferenceChampion: false, matchesWon: 0, matchesPlayed: 1 },
        },
        history: [],
      }

      const res = executeInterseasonTransition([rivalParent, rivalChild], archive, communes, {
        seed: 'fixed-seed-lineage',
        popBounds: bounds,
        maxFusions: 1,
      })

      // Le club créé à partir du club rival ne peut être absorbé par son rival parent (et inversement)
      expect(res.report.fusions.length).toBe(0)
    })

    it('prevents small clubs from absorbing massive cities beyond the 5x ratio under default settings', () => {
      const village = createFakeCommune('77001', 'Petit-Village', 3000, '77', '11', [2.40, 48.80])
      const megacity = createFakeCommune('75056', 'Paris', 2100000, '75', '11', [2.35, 48.85])
      const mediumTown = createFakeCommune('77002', 'Bourg-Moyen', 9000, '77', '11', [2.45, 48.82])

      const villageClub = createClubFromCommune(village, bounds)
      const megacityClub = createClubFromCommune(megacity, bounds)
      const mediumClub = createClubFromCommune(mediumTown, bounds)

      const archive: SeasonArchive = {
        year: 2026,
        seed: 'ratio-test',
        completedAt: '2026-09-23T00:00:00.000Z',
        datasetVersion: '1.0',
        nationalChampionId: '99999',
        conferenceChampions: {},
        finalFourTeamIds: [],
        totalMatches: 10,
        teamPerformances: {
          [villageClub.id]: { teamId: villageClub.id, roundReached: 10, stageLabel: 'T10', isNationalChampion: false, isConferenceChampion: false, matchesWon: 10, matchesPlayed: 11 },
        },
        history: [],
      }

      // With disproportionateFusionProb set to 0, Paris (ratio = 700x) is strictly filtered out
      const res = executeInterseasonTransition(
        [villageClub, megacityClub, mediumClub],
        archive,
        [village, megacity, mediumTown],
        {
          seed: 'seed-ratio-test',
          popBounds: bounds,
          maxFusions: 1,
          disproportionateFusionProb: 0,
        },
      )

      expect(res.report.fusions.length).toBe(1)
      const fusion = res.report.fusions[0]
      // It must partner with Bourg-Moyen (ratio = 3x <= 5x), NOT Paris
      expect(fusion.absorbedClubId).toBe(mediumClub.id)
      expect(fusion.absorbedClubId).not.toBe(megacityClub.id)
    })

    it('allows disproportionate fusion when rare disproportionate roll is triggered (disproportionateFusionProb: 1)', () => {
      const village = createFakeCommune('77001', 'Petit-Village', 3000, '77', '11', [2.40, 48.80])
      const megacity = createFakeCommune('75056', 'Paris', 2100000, '75', '11', [2.35, 48.85])

      const villageClub = createClubFromCommune(village, bounds)
      const megacityClub = createClubFromCommune(megacity, bounds)

      const archive: SeasonArchive = {
        year: 2026,
        seed: 'ratio-test-2',
        completedAt: '2026-09-23T00:00:00.000Z',
        datasetVersion: '1.0',
        nationalChampionId: '99999',
        conferenceChampions: {},
        finalFourTeamIds: [],
        totalMatches: 10,
        teamPerformances: {
          [villageClub.id]: { teamId: villageClub.id, roundReached: 10, stageLabel: 'T10', isNationalChampion: false, isConferenceChampion: false, matchesWon: 10, matchesPlayed: 11 },
        },
        history: [],
      }

      const res = executeInterseasonTransition(
        [villageClub, megacityClub],
        archive,
        [village, megacity],
        {
          seed: 'seed-ratio-test-2',
          popBounds: bounds,
          maxFusions: 1,
          disproportionateFusionProb: 1.0,
        },
      )

      expect(res.report.fusions.length).toBe(1)
      expect(res.report.fusions[0].absorbedClubId).toBe(megacityClub.id)
    })

    it('uses demographic base strength for oldStrength even if club had a boosted effective strength', () => {
      const bounds = { min: 1000, max: 2150000 }
      const c1 = createFakeCommune('01001', 'Bourg-en-Bresse', 40000, '01', '84', [5.22, 46.20])
      const c2 = createFakeCommune('01002', 'Péronnas', 6000, '01', '84', [5.20, 46.18])

      const club1 = createClubFromCommune(c1, bounds)
      const club2 = createClubFromCommune(c2, bounds)

      // Demographic base strength for 40,000 hab is around 14.9
      const expectedDemographicBase = club1.strength

      // Simulate an effective strength boosted to 22.0 by elite players and coach
      const boostedClub1: Club = {
        ...club1,
        strength: 22.0,
        baseStrength: expectedDemographicBase,
      }

      const archive: SeasonArchive = {
        year: 2026,
        seed: 'boost-test',
        completedAt: '2026-09-23T00:00:00.000Z',
        datasetVersion: '1.0',
        nationalChampionId: '99999',
        conferenceChampions: {},
        finalFourTeamIds: [],
        totalMatches: 10,
        teamPerformances: {
          [boostedClub1.id]: { teamId: boostedClub1.id, roundReached: 10, stageLabel: 'T10', isNationalChampion: false, isConferenceChampion: false, matchesWon: 10, matchesPlayed: 11 },
        },
        history: [],
      }

      const res = executeInterseasonTransition(
        [boostedClub1, club2],
        archive,
        [c1, c2],
        {
          seed: 'boost-interseason',
          popBounds: bounds,
          maxFusions: 1,
        },
      )

      expect(res.report.fusions).toHaveLength(1)
      const fusion = res.report.fusions[0]
      // oldStrength must be the demographic base, NOT the boosted 22.0
      expect(fusion.oldStrength).toBe(expectedDemographicBase)
      expect(fusion.newStrength).toBeGreaterThan(fusion.oldStrength)
      // Demographic gain is strictly positive
      const gain = fusion.newStrength - fusion.oldStrength
      expect(gain).toBeGreaterThan(0)
    })
  })

  describe('club visual identity preservation (colors and logo)', () => {
    it('preserves the color code and identity of the principal club when merging', () => {
      const c1 = createFakeCommune('01001', 'Belley', 10000, '01', '84', [5.69, 45.76])
      const c2 = createFakeCommune('01002', 'Virieu', 3000, '01', '84', [5.71, 45.78])

      const club1 = createClubFromCommune(c1, bounds)
      const club2 = createClubFromCommune(c2, bounds)

      const archive: SeasonArchive = {
        year: 2026,
        seed: 'identity-test-1',
        completedAt: '2026-09-23T00:00:00.000Z',
        datasetVersion: '1.0',
        nationalChampionId: '99999',
        conferenceChampions: { EST: club1.id },
        finalFourTeamIds: [club1.id],
        totalMatches: 10,
        teamPerformances: {
          [club1.id]: { teamId: club1.id, roundReached: 10, stageLabel: 'T10', isNationalChampion: false, isConferenceChampion: true, matchesWon: 10, matchesPlayed: 11 },
        },
        history: [],
      }

      const res = executeInterseasonTransition([club1, club2], archive, [c1, c2], {
        seed: 'interseason-id-1',
        popBounds: bounds,
        maxFusions: 1,
      })

      expect(res.report.fusions).toHaveLength(1)
      const merged = res.nextClubs.find((c) => c.id === club1.id)
      expect(merged).toBeDefined()
      expect(merged?.identity).toBeDefined()
      // Since club1 is larger (10,000 > 3,000), merged club retains club1's identity colors
      const club1Id = getClubIdentity(club1)
      expect(merged?.identity?.primaryColor).toBe(club1Id.primaryColor)
      expect(merged?.identity?.secondaryColor).toBe(club1Id.secondaryColor)

      // The absorbed club's identity is also preserved in fusedClubs
      expect(merged?.fusedClubs).toHaveLength(1)
      const absorbedInfo = merged?.fusedClubs?.[0]
      expect(absorbedInfo?.identity).toBeDefined()
      const club2Id = getClubIdentity(club2)
      expect(absorbedInfo?.identity?.primaryColor).toBe(club2Id.primaryColor)
      expect(absorbedInfo?.identity?.secondaryColor).toBe(club2Id.secondaryColor)
    })

    it('keeps the custom identity and logo of a user-customized club when merged', () => {
      const c1 = createFakeCommune('01001', 'Belley', 5000, '01', '84', [5.69, 45.76])
      const c2 = createFakeCommune('01002', 'Virieu', 4000, '01', '84', [5.71, 45.78])

      const customIdentity: ClubIdentity = {
        primaryColor: '#ff0055',
        secondaryColor: '#00ffee',
        logo: '/club-logos/etoile.svg',
      }

      const club1: Club = {
        ...createClubFromCommune(c1, bounds),
        identity: customIdentity,
      }
      const club2 = createClubFromCommune(c2, bounds)

      const archive: SeasonArchive = {
        year: 2026,
        seed: 'custom-id-test',
        completedAt: '2026-09-23T00:00:00.000Z',
        datasetVersion: '1.0',
        nationalChampionId: '99999',
        conferenceChampions: { EST: club1.id },
        finalFourTeamIds: [club1.id],
        totalMatches: 10,
        teamPerformances: {
          [club1.id]: { teamId: club1.id, roundReached: 10, stageLabel: 'T10', isNationalChampion: false, isConferenceChampion: true, matchesWon: 10, matchesPlayed: 11 },
        },
        history: [],
      }

      const res = executeInterseasonTransition([club1, club2], archive, [c1, c2], {
        seed: 'custom-interseason',
        popBounds: bounds,
        maxFusions: 1,
      })

      expect(res.report.fusions).toHaveLength(1)
      const merged = res.nextClubs.find((c) => c.id === club1.id)
      expect(merged?.identity).toEqual(customIdentity)
      expect(merged?.identity?.logo).toBe('/club-logos/etoile.svg')
    })

    it('preserves the custom identity if the absorbed partner is the one with custom logo/colors', () => {
      const c1 = createFakeCommune('01001', 'Belley', 5000, '01', '84', [5.69, 45.76])
      const c2 = createFakeCommune('01002', 'Virieu', 4000, '01', '84', [5.71, 45.78])

      const customIdentityPartner: ClubIdentity = {
        primaryColor: '#123456',
        secondaryColor: '#abcdef',
        logo: '/club-logos/montagne.svg',
      }

      const club1 = createClubFromCommune(c1, bounds)
      const club2: Club = {
        ...createClubFromCommune(c2, bounds),
        identity: customIdentityPartner,
      }

      const archive: SeasonArchive = {
        year: 2026,
        seed: 'partner-custom-test',
        completedAt: '2026-09-23T00:00:00.000Z',
        datasetVersion: '1.0',
        nationalChampionId: '99999',
        conferenceChampions: { EST: club1.id },
        finalFourTeamIds: [club1.id],
        totalMatches: 10,
        teamPerformances: {
          [club1.id]: { teamId: club1.id, roundReached: 10, stageLabel: 'T10', isNationalChampion: false, isConferenceChampion: true, matchesWon: 10, matchesPlayed: 11 },
        },
        history: [],
      }

      const res = executeInterseasonTransition([club1, club2], archive, [c1, c2], {
        seed: 'partner-custom-interseason',
        popBounds: bounds,
        maxFusions: 1,
      })

      expect(res.report.fusions).toHaveLength(1)
      const merged = res.nextClubs.find((c) => c.id === club1.id)
      expect(merged?.identity).toEqual(customIdentityPartner)
      expect(merged?.identity?.logo).toBe('/club-logos/montagne.svg')
    })

    it('preserves logo from secondary club if principal club has no logo', () => {
      const c1 = createFakeCommune('01001', 'Belley', 20000, '01', '84', [5.69, 45.76])
      const c2 = createFakeCommune('01002', 'Virieu', 5000, '01', '84', [5.71, 45.78])

      const club1: Club = {
        ...createClubFromCommune(c1, bounds),
        identity: { primaryColor: '#112233', secondaryColor: '#445566' },
      }
      const club2: Club = {
        ...createClubFromCommune(c2, bounds),
        identity: { primaryColor: '#778899', secondaryColor: '#aabbcc', logo: '/club-logos/vagues.svg' },
      }

      const archive: SeasonArchive = {
        year: 2026,
        seed: 'logo-preservation-test',
        completedAt: '2026-09-23T00:00:00.000Z',
        datasetVersion: '1.0',
        nationalChampionId: '99999',
        conferenceChampions: { EST: club1.id },
        finalFourTeamIds: [club1.id],
        totalMatches: 10,
        teamPerformances: {
          [club1.id]: { teamId: club1.id, roundReached: 10, stageLabel: 'T10', isNationalChampion: false, isConferenceChampion: true, matchesWon: 10, matchesPlayed: 11 },
        },
        history: [],
      }

      const res = executeInterseasonTransition([club1, club2], archive, [c1, c2], {
        seed: 'logo-preservation-interseason',
        popBounds: bounds,
        maxFusions: 1,
      })

      expect(res.report.fusions).toHaveLength(1)
      const merged = res.nextClubs.find((c) => c.id === club1.id)
      // Colors from principal club1
      expect(merged?.identity?.primaryColor).toBe('#112233')
      expect(merged?.identity?.secondaryColor).toBe('#445566')
      // Logo preserved from partner
      expect(merged?.identity?.logo).toBe('/club-logos/vagues.svg')
    })

    it('restores the original identity of an absorbed commune when it regenerates an independent club', () => {
      const c1 = createFakeCommune('01001', 'Belley', 10000, '01')
      const c2 = createFakeCommune('01002', 'Bourg-en-Bresse', 60000, '01')

      const originalIdentityC2: ClubIdentity = {
        primaryColor: '#047857',
        secondaryColor: '#f1f5f9',
        logo: '/club-logos/etoile.svg',
      }

      const alliedClub: Club = {
        id: '01001',
        name: 'Entente Belley / Bourg-en-Bresse',
        shortName: 'Entente Belley / Bourg-en-Bresse',
        communeId: '01001',
        communeName: 'Belley',
        communeIds: ['01001', '01002'],
        communeNames: ['Belley', 'Bourg-en-Bresse'],
        departmentId: '01',
        regionId: '84',
        zoneId: 'ZONE-A',
        conferenceId: 'EST',
        population: 70000,
        strength: 20,
        isFusion: true,
        fusionCount: 2,
        identity: { primaryColor: '#1d4ed8', secondaryColor: '#fbbf24' },
        fusedClubs: [
          {
            id: '01002',
            name: 'FC Bourg-en-Bresse',
            communeId: '01002',
            communeName: 'Bourg-en-Bresse',
            identity: originalIdentityC2,
          },
        ],
      }

      const archive: SeasonArchive = {
        year: 2026,
        seed: 'secession-identity-test',
        completedAt: '2026-09-23T00:00:00.000Z',
        datasetVersion: '1.0',
        nationalChampionId: '99999',
        conferenceChampions: {},
        finalFourTeamIds: [],
        totalMatches: 10,
        teamPerformances: {},
        history: [],
      }

      const res = executeInterseasonTransition([alliedClub], archive, [c1, c2], {
        seed: 'secession-test',
        popBounds: bounds,
        maxFusions: 0,
      })

      const regeneratedClub = res.nextClubs.find((c) => c.communeId === '01002')
      if (regeneratedClub) {
        expect(regeneratedClub.identity).toEqual(originalIdentityC2)
      }
      const updatedAlliance = res.nextClubs.find((c) => c.id === '01001')
      expect(updatedAlliance?.identity?.primaryColor).toBe('#1d4ed8')
    })
  })
})

