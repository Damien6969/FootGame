import { describe, it, expect } from 'vitest'
import {
  generateInitialPersonPool,
  advancePersonsSeason,
  replenishActivePersonsPool,
  computeStatAtAge,
  getCareerPhase,
} from './personGenerator'
import type { Commune } from '../geography/types'
import type { Club } from '../teams/types'
import { buildClubsFromCommunes } from '../teams/clubGenerator'
import type { Person } from './types'

function createFakeCommune(
  id: string,
  name: string,
  population: number,
  coordinates: [number, number] = [2.0, 48.0],
): Commune {
  return {
    id,
    name,
    population,
    departmentId: '75',
    regionId: '11',
    zoneId: 'ZONE_NORD',
    conferenceId: 'CONF_NORD',
    coordinates,
  }
}

function createFakeClub(
  id: string,
  name: string,
  commune: Commune,
  strength = 15,
): Club {
  return {
    id,
    name,
    shortName: name,
    communeId: commune.id,
    communeName: commune.name,
    communeIds: [commune.id],
    communeNames: [commune.name],
    departmentId: commune.departmentId,
    regionId: commune.regionId,
    zoneId: 'ZONE_NORD',
    conferenceId: 'CONF_NORD',
    population: commune.population,
    strength,
    coordinates: commune.coordinates,
  }
}

describe('personGenerator', () => {
  it('remembers the original club before loans and keeps it through retirement', () => {
    const original = generateInitialPersonPool({ count: 1, communes, clubs, seed: 'origin-club' })[0]
    const firstClub = clubs.find(c => c.id === original.currentClubId)!
    expect(original).toMatchObject({ originClubId: firstClub.id, originClubName: firstClub.name })
    const retired = advancePersonsSeason({ persons: [{ ...original, age: 37 }], communes, clubs,
      seasonYear: 2027, seed: 'origin-club', newRecruitsCount: 0 })[0]
    expect(retired.isRetired).toBe(true)
    expect(retired).toMatchObject({ originClubId: firstClub.id, originClubName: firstClub.name })
  })
  const paris = createFakeCommune('75056', 'Paris', 2100000, [2.35, 48.85])
  const melun = createFakeCommune('77288', 'Melun', 40000, [2.65, 48.54])
  const petitVillage = createFakeCommune('77001', 'Petit-Village', 500, [2.70, 48.55])

  const communes = [paris, melun, petitVillage]

  const clubParis1 = createFakeClub('75056-1', 'Paris Saint-Germain', paris, 28)
  const clubParis2 = createFakeClub('75056-2', 'FC Paris', paris, 22)
  const clubMelun = createFakeClub('77288-1', 'Melun FC', melun, 14)
  // Note : petitVillage n'a pas de club direct !

  const clubs = [clubParis1, clubParis2, clubMelun]

  it('keeps sporting draws independent from birth-cohort naming', () => {
    const options = { count: 300, communes, clubs, seed: 'independent-sporting-draws' }
    const older = generateInitialPersonPool({ ...options, startYear: 2000 })
    const recent = generateInitialPersonPool({ ...options, startYear: 2036 })
    const sporting = (p: Person) => [p.id, p.age, p.attack, p.defense, p.peakAttack, p.peakDefense, p.peakAge, p.position, p.assignedPosition, p.currentClubId, p.coachSkill, p.presidentSkill]
    expect(older.map(sporting)).toEqual(recent.map(sporting))
    expect(older.some((p, i) => p.firstName !== recent[i].firstName)).toBe(true)
  })

  it('preserves citizenship and names over ten seasons and generates diverse recruits', () => {
    let people = generateInitialPersonPool({ count: 300, communes, clubs, seed: 'identity-ten-years', startYear: 2026 })
    const identities = new Map(people.map(p => [p.id, [p.firstName, p.lastName, p.nationality, p.secondNationality]]))
    const originalCount = people.length
    for (let year = 2027; year <= 2036; year++) {
      people = advancePersonsSeason({ persons: people, communes, clubs, seed: 'identity-ten-years', seasonYear: year })
      for (const p of people) {
        if (identities.has(p.id)) expect([p.firstName, p.lastName, p.nationality, p.secondNationality]).toEqual(identities.get(p.id))
      }
    }
    const recruits = people.slice(originalCount)
    expect(recruits.length).toBeGreaterThan(100)
    expect(recruits.some(p => p.secondNationality)).toBe(true)
    expect(people.filter(p => p.nationality === 'FR').length / people.length).toBeGreaterThan(.95)
    expect(new Set(people.map(p => `${p.firstName} ${p.lastName}`)).size).toBe(people.length)
  })

  it('generates coherent identities during replenishment and leaves legacy persons untouched', () => {
    const original = generateInitialPersonPool({ count: 1, communes, clubs, seed: 'legacy-player' })[0]
    const legacy = { ...original, firstName: 'Ancien', lastName: 'Joueur', nationality: 'FR', secondNationality: undefined }
    const people = replenishActivePersonsPool({ persons: [legacy], communes, clubs, seed: 'identity-replenish', targetActiveCount: 300, seasonYear: 2036 })
    expect(people[0].firstName).toBe('Ancien')
    expect(people[0].lastName).toBe('Joueur')
    expect(people.slice(1).some(p => p.secondNationality)).toBe(true)
    expect(new Set(people.map(p => `${p.firstName} ${p.lastName}`)).size).toBe(people.length)
  })

  it('generates the default pool of 300 persons with valid properties', () => {
    const pool = generateInitialPersonPool({
      count: 300,
      communes,
      clubs,
      seed: 'test-seed-pool',
    })

    expect(pool).toHaveLength(300)

    for (const p of pool) {
      expect(p.id).toMatch(/^p-\d+$/)
      expect(p.firstName.length).toBeGreaterThan(1)
      expect(p.lastName.length).toBeGreaterThan(1)
      expect(p.nationality).toMatch(/^[A-Z]{2}$/)
      expect(p.primaryRole).toBe('PLAYER')
      expect(p.age).toBeGreaterThanOrEqual(16)
      expect(p.age).toBeLessThanOrEqual(35)
      expect(p.isRetired).toBe(false)
      expect(p.careerYears).toBe(0)
      expect(p.careerHistory).toEqual([])

      // Stats 0-30 bounds
      expect(p.attack).toBeGreaterThanOrEqual(1)
      expect(p.attack).toBeLessThanOrEqual(30)
      expect(p.defense).toBeGreaterThanOrEqual(1)
      expect(p.defense).toBeLessThanOrEqual(30)

      // Positions
      expect(['ATTACKER', 'DEFENDER']).toContain(p.position)

      // Position logic
      if (p.position === 'ATTACKER') {
        expect(p.attack).toBeGreaterThanOrEqual(p.defense)
      } else {
        expect(p.defense).toBeGreaterThanOrEqual(p.attack)
      }

      // Valid birth commune
      expect(['75056', '77288', '77001']).toContain(p.birthCommuneId)

      // Current club assigned
      expect(['75056-1', '75056-2', '77288-1']).toContain(p.currentClubId)
    }
  })

  it('reflects demographic weighting in birth places', () => {
    const pool = generateInitialPersonPool({
      count: 500,
      communes,
      clubs,
      seed: 'test-seed-demo',
    })

    const parisNatives = pool.filter((p) => p.birthCommuneId === '75056')
    const melunNatives = pool.filter((p) => p.birthCommuneId === '77288')
    const villageNatives = pool.filter((p) => p.birthCommuneId === '77001')

    // Paris has ~98% of the total population in this subset
    expect(parisNatives.length).toBeGreaterThan(melunNatives.length)
    expect(melunNatives.length).toBeGreaterThanOrEqual(villageNatives.length)
    expect(parisNatives.length).toBeGreaterThan(400)
  })

  it('assigns natives of club-less communes to the nearest geographic club', () => {
    const pool = generateInitialPersonPool({
      count: 200,
      communes: [petitVillage], // Only the village
      clubs, // Clubs exist in Paris and Melun
      seed: 'test-seed-village',
    })

    // Petit-Village is at [2.70, 48.55], much closer to Melun [2.65, 48.54] than Paris [2.35, 48.85]
    for (const p of pool) {
      expect(p.birthCommuneId).toBe('77001')
      expect(p.currentClubId).toBe('77288-1') // Assigned to Melun FC !
    }
  })

  it('respects stat rarity where values near 30 are exceptional', () => {
    const pool = generateInitialPersonPool({
      count: 1000,
      communes,
      clubs,
      seed: 'test-seed-stats',
    })

    const eliteAttackers = pool.filter((p) => p.attack >= 28)
    const eliteDefenders = pool.filter((p) => p.defense >= 28)

    // Scores >= 28 should represent a very small percentage (< 5%)
    expect(eliteAttackers.length).toBeLessThan(50)
    expect(eliteDefenders.length).toBeLessThan(50)
  })

  it('handles aging, progressive retirements, and new recruits during interseason transition', () => {
    const initialPool = generateInitialPersonPool({
      count: 100,
      communes,
      clubs,
      seed: 'test-season-advance',
    })

    const veteran = {
      ...initialPool[0],
      id: 'p-veteran-37',
      age: 37,
      careerYears: 20,
    }

    const testPool = [veteran, ...initialPool.slice(1)]

    const updated = advancePersonsSeason({
      persons: testPool,
      communes,
      clubs,
      seasonYear: 2027,
      seed: 'seed-intersaison-2027',
      newRecruitsCount: 20,
    })

    // 100 original + 20 new recruits = 120 persons
    expect(updated).toHaveLength(120)

    // Veteran aged from 37 to 38 -> mandatory retirement!
    const updatedVeteran = updated.find((p) => p.id === 'p-veteran-37')
    expect(updatedVeteran?.age).toBe(38)
    expect(updatedVeteran?.isRetired).toBe(true)
    expect(updatedVeteran?.retiredYear).toBe(2027)
    expect(updatedVeteran?.currentClubId).toBeNull()

    // New recruits are young (16-18)
    const newRecruits = updated.slice(100)
    expect(newRecruits).toHaveLength(20)
    for (const recruit of newRecruits) {
      expect(recruit.age).toBeGreaterThanOrEqual(16)
      expect(recruit.age).toBeLessThanOrEqual(18)
      expect(recruit.careerYears).toBe(0)
      expect(recruit.isRetired).toBe(false)
    }
  })

  it('reassigns players from absorbed clubs to the surviving merged club', () => {
    const initialPool = generateInitialPersonPool({
      count: 10,
      communes,
      clubs,
      seed: 'test-absorbed-reassign',
    })

    // Suppose player 0 was in clubParis2 ('75056-2')
    const playerInParis2 = {
      ...initialPool[0],
      currentClubId: '75056-2',
      age: 22,
    }

    // Now clubParis2 is absorbed into clubParis1 ('75056-1')
    const mergedClubParis: Club = {
      ...clubParis1,
      isFusion: true,
      fusedClubs: [
        {
          id: '75056-2',
          name: 'FC Paris',
          communeName: 'Paris',
        },
      ],
    }

    const nextClubs = [mergedClubParis, clubMelun]

    const updated = advancePersonsSeason({
      persons: [playerInParis2],
      communes,
      clubs: nextClubs,
      seasonYear: 2027,
      seed: 'seed-reassign',
      newRecruitsCount: 0,
    })

    expect(updated[0].currentClubId).toBe('75056-1')
  })

  it('computes progression, peak, and non-linear decline curves correctly', () => {
    const peakStat = 26
    const peakAge = 26

    // 1. Progression: starts lower at 16, monotonically climbs to peakStat at peakAge
    const stat16 = computeStatAtAge(peakStat, 16, peakAge)
    const stat20 = computeStatAtAge(peakStat, 20, peakAge)
    const stat23 = computeStatAtAge(peakStat, 23, peakAge)
    const statPeak = computeStatAtAge(peakStat, peakAge, peakAge)
    const statPeakPlus1 = computeStatAtAge(peakStat, peakAge + 1, peakAge)

    expect(stat16).toBeLessThan(stat20)
    expect(stat20).toBeLessThan(stat23)
    expect(stat23).toBeLessThanOrEqual(statPeak)
    expect(statPeak).toBe(peakStat)
    expect(statPeakPlus1).toBe(peakStat)

    // 2. Decline: starts after peakAge + 1 and decreases smoothly
    const stat29 = computeStatAtAge(peakStat, 29, peakAge)
    const stat33 = computeStatAtAge(peakStat, 33, peakAge)
    const stat37 = computeStatAtAge(peakStat, 37, peakAge)

    expect(stat29).toBeLessThan(statPeak)
    expect(stat33).toBeLessThan(stat29)
    expect(stat37).toBeLessThan(stat33)

    // Guaranteed floor retains experience (>= 40% of peakStat)
    expect(stat37).toBeGreaterThanOrEqual(Math.floor(peakStat * 0.4))
    expect(stat37).toBeGreaterThanOrEqual(2)
  })

  it('correctly determines career phases', () => {
    expect(getCareerPhase(20, 27)).toBe('GROWTH')
    expect(getCareerPhase(26, 27)).toBe('GROWTH')
    expect(getCareerPhase(27, 27)).toBe('PEAK')
    expect(getCareerPhase(28, 27)).toBe('PEAK')
    expect(getCareerPhase(29, 27)).toBe('DECLINE')
    expect(getCareerPhase(35, 27)).toBe('DECLINE')
  })

  it('progresses young players and declines veterans during interseason transition', () => {
    const youngPlayer: Person = {
      id: 'p-young',
      firstName: 'Jeune',
      lastName: 'Espoir',
      age: 18,
      nationality: 'FR',
      birthCommuneId: '75056',
      birthCommuneName: 'Paris',
      birthDepartmentId: '75',
      currentClubId: '75056-1',
      primaryRole: 'PLAYER',
      position: 'ATTACKER',
      peakAge: 27,
      peakAttack: 26,
      peakDefense: 14,
      attack: computeStatAtAge(26, 18, 27),
      defense: computeStatAtAge(14, 18, 27),
      careerYears: 1,
      isRetired: false,
    }

    const veteranPlayer: Person = {
      id: 'p-veteran',
      firstName: 'Ancien',
      lastName: 'Capitaine',
      age: 30,
      nationality: 'FR',
      birthCommuneId: '75056',
      birthCommuneName: 'Paris',
      birthDepartmentId: '75',
      currentClubId: '75056-1',
      primaryRole: 'PLAYER',
      position: 'ATTACKER',
      peakAge: 25,
      peakAttack: 28,
      peakDefense: 16,
      attack: computeStatAtAge(28, 30, 25),
      defense: computeStatAtAge(16, 30, 25),
      careerYears: 12,
      isRetired: false,
    }

    const updated = advancePersonsSeason({
      persons: [youngPlayer, veteranPlayer],
      communes,
      clubs,
      seasonYear: 2027,
      seed: 'seed-growth-decline',
      newRecruitsCount: 0,
    })

    const updatedYoung = updated.find((p) => p.id === 'p-young')!
    const updatedVeteran = updated.find((p) => p.id === 'p-veteran')!

    // Young player advances from 18 to 19 -> attack increases
    expect(updatedYoung.age).toBe(19)
    expect(updatedYoung.attack).toBeGreaterThanOrEqual(youngPlayer.attack)

    // Veteran advances from 30 to 31 (past peak 25) -> attack declines
    expect(updatedVeteran.age).toBe(31)
    expect(updatedVeteran.attack).toBeLessThan(veteranPlayer.attack)
  })

  it('records previous season performance and honors into careerHistory upon interseason transition', () => {
    const player: Person = {
      id: 'p-record-test',
      parentClubId: '75056-1',
      firstName: 'Champion',
      lastName: 'Test',
      age: 25,
      nationality: 'FR',
      birthCommuneId: '75056',
      birthCommuneName: 'Paris',
      birthDepartmentId: '75',
      currentClubId: '75056-1',
      primaryRole: 'PLAYER',
      position: 'ATTACKER',
      attack: 26,
      defense: 12,
      careerYears: 5,
      careerHistory: [],
    }

    const fakeArchive: any = {
      year: 2026,
      seed: 'test-seed-2026',
      completedAt: '2026-09-28T12:00:00Z',
      datasetVersion: '1.0',
      nationalChampionId: '75056-1',
      conferenceChampions: { CONF_NORD: '75056-1' },
      regionChampions: { '11': '75056-1' },
      departmentChampions: { '75': '75056-1' },
      finalFourTeamIds: ['75056-1'],
      totalMatches: 50,
      history: [],
      teamPerformances: {
        '75056-1': {
          teamId: '75056-1',
          clubName: 'Paris Saint-Germain',
          roundReached: 14,
          stageLabel: 'Champion de France 🏆',
          isNationalChampion: true,
          isConferenceChampion: true,
          isRegionChampion: true,
          isDepartmentChampion: true,
          conferenceId: 'CONF_NORD',
          regionId: '11',
          departmentId: '75',
          matchesWon: 14,
          matchesPlayed: 14,
        },
      },
    }

    const updated = advancePersonsSeason({
      persons: [player],
      communes,
      clubs: clubs.map(club => club.id === '75056-1' ? { ...club, name: 'Nouveau Paris' } : club),
      seasonYear: 2027,
      seed: 'seed-2027',
      previousSeasonArchive: fakeArchive,
      newRecruitsCount: 0,
    })

    expect(updated[0].careerHistory).toHaveLength(1)
    const historyEntry = updated[0].careerHistory![0]
    expect(historyEntry.year).toBe(2026)
    expect(historyEntry.clubId).toBe('75056-1')
    expect(historyEntry.clubName).toBe('Paris Saint-Germain')
    expect(historyEntry.parentClubName).toBe('Paris Saint-Germain')
    expect(historyEntry.isNationalChampion).toBe(true)
    expect(historyEntry.isConferenceChampion).toBe(true)
    expect(historyEntry.stageLabel).toBe('Champion de France 🏆')
    expect(historyEntry.age).toBe(25) // Age during that season
  })

  it('transfers players from absorbed club to merged club during interseason advance', () => {
    const leadClub: Club = {
      id: '75056-1',
      name: 'Alliance Paris-Saint Denis',
      shortName: 'Paris-SD',
      communeId: '75056',
      communeName: 'Paris',
      communeIds: ['75056', '93066'],
      communeNames: ['Paris', 'Saint-Denis'],
      departmentId: '75',
      regionId: '11',
      zoneId: 'ZONE_NORD',
      conferenceId: 'CONF_NORD',
      population: 2200000,
      strength: 28,
      isFusion: true,
      fusedClubs: [
        {
          id: '93066-1',
          name: 'Saint-Denis FC',
          communeName: 'Saint-Denis',
          communeIds: ['93066'],
          communeNames: ['Saint-Denis'],
        },
      ],
    }

    // Player who was at Saint-Denis FC (absorbed club)
    const saintDenisPlayer: Person = {
      id: 'p-sd',
      firstName: 'Kylian',
      lastName: 'Dion',
      age: 23,
      nationality: 'FR',
      birthCommuneId: '93066',
      birthCommuneName: 'Saint-Denis',
      birthDepartmentId: '93',
      currentClubId: '93066-1',
      parentClubId: '93066-1',
      primaryRole: 'PLAYER',
      position: 'ATTACKER',
      attack: 29,
      defense: 12,
      careerYears: 3,
      careerHistory: [],
      isRetired: false,
    }

    const updated = advancePersonsSeason({
      persons: [saintDenisPlayer],
      communes,
      clubs: [leadClub],
      seasonYear: 2027,
      seed: 'seed-fusion-test',
      newRecruitsCount: 0,
      fusions: [
        {
          mergedClubId: '75056-1',
          mergedClubName: 'Alliance Paris-Saint Denis',
          absorbedClubId: '93066-1',
          absorbedClubName: 'Saint-Denis FC',
          communeNames: ['Paris', 'Saint-Denis'],
          totalPopulation: 2200000,
          newStrength: 28,
          oldStrength: 26,
        },
      ],
    })

    expect(updated).toHaveLength(1)
    const migratedPlayer = updated[0]
    // The player's parent club and current club are now the merged club!
    expect(migratedPlayer.parentClubId).toBe('75056-1')
    expect(migratedPlayer.currentClubId).toBe('75056-1')
    // His past season in careerHistory recorded his former club
    expect(migratedPlayer.careerHistory).toHaveLength(1)
    expect(migratedPlayer.careerHistory![0].clubId).toBe('93066-1')
  })

  it('handles chained fusions transferring players across successive mergers', () => {
    // Club C absorbs Club A (which previously absorbed Club B)
    const clubC: Club = {
      id: '92050-1',
      name: 'Grand Paris Ouest',
      shortName: 'GPO',
      communeId: '92050',
      communeName: 'Nanterre',
      communeIds: ['92050', '75056', '93066'],
      communeNames: ['Nanterre', 'Paris', 'Saint-Denis'],
      departmentId: '92',
      regionId: '11',
      zoneId: 'ZONE_NORD',
      conferenceId: 'CONF_NORD',
      population: 3000000,
      strength: 29,
      isFusion: true,
      fusedClubs: [
        { id: '75056-1', name: 'Alliance Paris', communeName: 'Paris' },
        { id: '93066-1', name: 'Saint-Denis FC', communeName: 'Saint-Denis' },
      ],
    }

    const playerOriginB: Person = {
      id: 'p-chain',
      firstName: 'Jean',
      lastName: 'Dupont',
      age: 26,
      nationality: 'FR',
      birthCommuneId: '93066',
      birthCommuneName: 'Saint-Denis',
      birthDepartmentId: '93',
      currentClubId: '93066-1',
      parentClubId: '93066-1',
      primaryRole: 'PLAYER',
      position: 'DEFENDER',
      attack: 10,
      defense: 25,
      careerYears: 4,
      careerHistory: [],
      isRetired: false,
    }

    const updated = advancePersonsSeason({
      persons: [playerOriginB],
      communes,
      clubs: [clubC],
      seasonYear: 2028,
      seed: 'seed-chained-fusion',
      newRecruitsCount: 0,
    })

    expect(updated[0].parentClubId).toBe('92050-1')
    expect(updated[0].currentClubId).toBe('92050-1')
  })

  it('maintains a healthy active player pool over 6 consecutive years of retirements', () => {
    const clubs = buildClubsFromCommunes(communes)
    let currentPersons = generateInitialPersonPool({
      count: 300,
      communes,
      clubs,
      seed: 'test-multiyear-sustainability',
      assignRostersAndLoans: true,
    })

    expect(currentPersons.filter((p) => !p.isRetired)).toHaveLength(300)

    // Simuler 6 saisons consécutives d'inter-saison
    for (let season = 2027; season <= 2032; season++) {
      currentPersons = advancePersonsSeason({
        persons: currentPersons,
        communes,
        clubs,
        seasonYear: season,
        seed: `seed-season-${season}`,
        // newRecruitsCount non spécifié -> auto-maintien à 300 joueurs actifs
      })

      const activePlayers = currentPersons.filter((p) => !p.isRetired)
      // L'effectif actif ne doit JAMAIS s'effondrer au fil des années
      expect(activePlayers.length).toBeGreaterThanOrEqual(280)

      // Des attaquants et défenseurs sont assignés
      const activeAttackers = activePlayers.filter((p) => p.assignedPosition === 'ATTACKER')
      const activeDefenders = activePlayers.filter((p) => p.assignedPosition === 'DEFENDER')
      expect(activeAttackers.length).toBeGreaterThan(0)
      expect(activeDefenders.length).toBeGreaterThan(0)
    }

    // Des joueurs sont partis à la retraite, mais l'effectif actif est resté renouvelé
    const retiredCount = currentPersons.filter((p) => p.isRetired).length
    expect(retiredCount).toBeGreaterThan(50)
  })

  it('replenishActivePersonsPool restores depleted pools back to target count', () => {
    const clubs = buildClubsFromCommunes(communes)
    // Simuler une situation où presque tous les joueurs sont à la retraite (pool dégradé)
    const initial = generateInitialPersonPool({
      count: 300,
      communes,
      clubs,
      seed: 'test-depleted',
    })

    // Retraiter artificiellement 280 joueurs pour simuler l'ancienne anomalie
    const depleted = initial.map((p, idx) =>
      idx < 280
        ? { ...p, isRetired: true, currentClubId: null, parentClubId: null }
        : p,
    )

    expect(depleted.filter((p) => !p.isRetired)).toHaveLength(20)

    const replenished = replenishActivePersonsPool({
      persons: depleted,
      communes,
      clubs,
      seed: 'seed-recovery',
      targetActiveCount: 300,
    })

    const activeAfter = replenished.filter((p) => !p.isRetired)
    expect(activeAfter.length).toBeGreaterThanOrEqual(300)
    expect(activeAfter.some((p) => p.assignedPosition === 'ATTACKER')).toBe(true)
    expect(activeAfter.some((p) => p.assignedPosition === 'DEFENDER')).toBe(true)
  })
})
