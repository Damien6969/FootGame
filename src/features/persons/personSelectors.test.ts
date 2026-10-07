import { describe, it, expect } from 'vitest'
import type { Person } from './types'
import type { Club } from '../teams/types'
import type { SeasonArchive, CupSession } from '../storage/cupRepository'
import {
  computeOverallRating,
  computePeakOverallRating,
  computePersonTrophyRecord,
  computePersonTotalTitles,
  formatCareerPhase,
  formatPosition,
  formatRole,
  getClubActiveStarters,
  getClubRoster,
  getCommuneNatives,
  sortPersons,
  computePersonsMetrics,
  computePersonTitleCounts,
} from './personSelectors'

describe('personSelectors', () => {
  it('does not infer the historical lending club from the player birthplace after a merger', () => {
    const club: Club = {
      id: 'aubagne', name: 'Alliance Aubagne-Cassis', shortName: 'Alliance',
      communeId: 'aubagne', communeName: 'Aubagne', communeIds: ['aubagne', 'cassis'],
      communeNames: ['Aubagne', 'Cassis'], departmentId: '13', regionId: '93',
      conferenceId: 'sud', zoneId: 'sud', population: 60000, strength: 20, isFusion: true,
      fusedClubs: [{ id: 'cassis', name: 'Étoile de Cassis', communeId: 'cassis', communeName: 'Cassis', year: 2026 }],
    }
    const person: Person = {
      id: 'loan', firstName: 'Paul', lastName: 'Test', nationality: 'FR', age: 28,
      attack: 20, defense: 10, careerYears: 5, primaryRole: 'PLAYER', position: 'ATTACKER',
      birthCommuneId: 'cassis', birthCommuneName: 'Cassis', birthDepartmentId: '13', currentClubId: null,
      careerHistory: [{ year: 2024, clubId: 'loan-club', clubName: 'Club emprunteur', role: 'PLAYER',
        age: 26, attack: 20, defense: 10, isLoan: true, parentClubId: 'aubagne', parentClubName: 'Aubagne FC' }],
    }
    const record = computePersonTrophyRecord(person, [], null, new Map([[club.id, club]]))
    expect(record.seasons[0].parentClubId).toBe('aubagne')
    expect(record.seasons[0].parentClubName).toBe('Aubagne FC')
  })
  const p1: Person = {
    id: 'p-1',
    firstName: 'Antoine',
    lastName: 'Griezmann',
    age: 33,
    nationality: 'FR',
    birthCommuneId: '71270',
    birthCommuneName: 'Mâcon',
    birthDepartmentId: '71',
    currentClubId: 'club-1',
    primaryRole: 'PLAYER',
    position: 'ATTACKER',
    attack: 26,
    defense: 12,
    careerYears: 15,
    isRetired: false,
  }

  const p2: Person = {
    id: 'p-2',
    firstName: 'Raphaël',
    lastName: 'Varane',
    age: 31,
    nationality: 'FR',
    birthCommuneId: '59350',
    birthCommuneName: 'Lille',
    birthDepartmentId: '59',
    currentClubId: 'club-1',
    primaryRole: 'PLAYER',
    position: 'DEFENDER',
    attack: 10,
    defense: 25,
    careerYears: 13,
    isRetired: false,
  }

  const p3: Person = {
    id: 'p-3',
    firstName: 'Zinédine',
    lastName: 'Zidane',
    age: 50,
    nationality: 'FR',
    birthCommuneId: '13055',
    birthCommuneName: 'Marseille',
    birthDepartmentId: '13',
    currentClubId: null,
    primaryRole: 'COACH',
    position: 'ATTACKER',
    attack: 29,
    defense: 15,
    careerYears: 20,
    isRetired: true,
    retiredYear: 2006,
  }

  const p4: Person = {
    id: 'p-4',
    firstName: 'Lucas',
    lastName: 'Hernandez',
    age: 28,
    nationality: 'FR',
    birthCommuneId: '13055',
    birthCommuneName: 'Marseille',
    birthDepartmentId: '13',
    currentClubId: 'club-2',
    primaryRole: 'PLAYER',
    position: 'DEFENDER',
    attack: 8,
    defense: 22,
    careerYears: 10,
    isRetired: false,
  }

  const persons = [p1, p2, p3, p4]

  it('computes overall rating properly according to position weighting', () => {
    // Attacker: round(attack * 0.7 + defense * 0.3)
    // p1: round(26 * 0.7 + 12 * 0.3) = round(18.2 + 3.6) = 22
    expect(computeOverallRating(p1)).toBe(22)

    // Defender: round(defense * 0.7 + attack * 0.3)
    // p2: round(25 * 0.7 + 10 * 0.3) = round(17.5 + 3.0) = 21
    expect(computeOverallRating(p2)).toBe(21)
  })

  it('formats positions and roles into clean French labels', () => {
    expect(formatPosition('ATTACKER')).toBe('Attaquant')
    expect(formatPosition('DEFENDER')).toBe('Défenseur')
    expect(formatRole('PLAYER')).toBe('Joueur')
    expect(formatRole('COACH')).toBe('Entraîneur')
    expect(formatRole('PRESIDENT')).toBe('Président')
  })

  it('filters active club roster sorted by overall rating', () => {
    const roster = getClubRoster(persons, 'club-1')
    expect(roster).toHaveLength(2)
    expect(roster[0].id).toBe('p-1') // overall 22 > 21
    expect(roster[1].id).toBe('p-2')
  })

  it('filters commune natives including retired persons', () => {
    const marseillais = getCommuneNatives(persons, '13055')
    expect(marseillais).toHaveLength(2)
    // p3 (Zidane overall ~25) should be first, p4 (Hernandez overall 18) second
    expect(marseillais[0].id).toBe('p-3')
    expect(marseillais[1].id).toBe('p-4')
  })

  it('sorts persons by name, age, attack, and defense', () => {
    const clubNames = new Map([
      ['club-1', 'Club Alpha'],
      ['club-2', 'Club Bêta'],
    ])

    const byAttackDesc = sortPersons(persons, 'attack', 'desc', clubNames)
    expect(byAttackDesc[0].id).toBe('p-3') // 29
    expect(byAttackDesc[1].id).toBe('p-1') // 26

    const byAgeAsc = sortPersons(persons, 'age', 'asc', clubNames)
    expect(byAgeAsc[0].id).toBe('p-4') // 28
    expect(byAgeAsc[3].id).toBe('p-3') // 50
  })

  it('computes global metrics accurately', () => {
    const metrics = computePersonsMetrics(persons)
    expect(metrics.total).toBe(4)
    expect(metrics.activeCount).toBe(3) // p1, p2, p4
    expect(metrics.retiredCount).toBe(1) // p3
    expect(metrics.attackersCount).toBe(1) // p1 is active attacker
    expect(metrics.defendersCount).toBe(2) // p2, p4 are active defenders
    expect(metrics.topAttacker?.id).toBe('p-1')
    expect(metrics.topDefender?.id).toBe('p-2')
    // Avg age of active: (33 + 31 + 28) / 3 = 92 / 3 = 30.7
    expect(metrics.avgAge).toBe(30.7)
  })

  it('counts directory titles without reading archived matches or awards', () => {
    const player = { ...p1, careerHistory: [{ year: 2026, clubId: 'club-1', role: 'PLAYER',
      age: 32, attack: 26, defense: 12, isStarter: true, isNationalChampion: true }] } as Person
    const archive = {
      year: 2026, nationalChampionId: 'club-1',
      teamPerformances: { 'club-1': { isNationalChampion: true, isConferenceChampion: true, conferenceId: 'north' } },
      get history() { throw new Error('The directory must not read match histories') },
      get individualAwards() { throw new Error('The directory must not compute individual awards') },
    } as unknown as SeasonArchive
    expect(computePersonsMetrics([player], [archive]).mostDecorated?.titleCount).toBe(2)
  })

  it('keeps directory titles consistent with career details for starters, reserves and converted coaches', () => {
    const history = { year: 2026, clubId: 'club-1', role: 'PLAYER' as const, age: 30, attack: 20, defense: 10,
      isStarter: true, isNationalChampion: true, isConferenceChampion: true, conferenceId: 'north' }
    const roster: Person[] = [
      { ...p1, assignedPosition: 'ATTACKER', careerHistory: [history] },
      { ...p2, assignedPosition: 'DEFENDER', careerHistory: [{ ...history, isStarter: false }] },
      { ...p3, careerHistory: [history] },
    ]
    const archive = { year: 2026, seed: 'tournoi-2026', nationalChampionId: 'club-1', persons: [p1, p2], history: [],
      teamPerformances: { 'club-1': { isNationalChampion: true, isConferenceChampion: true, conferenceId: 'north' } },
    } as unknown as SeasonArchive
    const session = { seed: 'tournoi-2027', championId: 'club-1', conferenceChampionIds: { north: 'club-1' },
      roundNumber: 14, history: [], persons: roster,
    } as unknown as CupSession
    const clubs = new Map([['club-1', { id: 'club-1', name: 'Club Alpha', conferenceId: 'north' }]]) as any
    const counts = computePersonTitleCounts(roster, [archive], session, clubs)
    for (const person of roster) {
      const detail = computePersonTrophyRecord(person, [archive], session, clubs)
      expect(counts.get(person.id)).toEqual({ nationalTitles: detail.nationalTitles, conferenceTitles: detail.conferenceTitles,
        regionTitles: detail.regionTitles, departmentTitles: detail.departmentTitles })
    }
    expect(computePersonTotalTitles(counts.get(p1.id)!)).toBe(4)
    expect(computePersonTotalTitles(counts.get(p2.id)!)).toBe(2)
    expect(computePersonTotalTitles(counts.get(p3.id)!)).toBe(2)
  })

  it('computes peak overall rating and formats career trajectory phases', () => {
    const youngProspect: Person = {
      ...p1,
      id: 'p-young',
      age: 18,
      peakAge: 27,
      attack: 18,
      defense: 8,
      peakAttack: 27,
      peakDefense: 14,
    }

    // Peak overall rating computed from peakAttack and peakDefense
    // Attacker: round(27 * 0.7 + 14 * 0.3) = round(18.9 + 4.2) = 23
    expect(computePeakOverallRating(youngProspect)).toBe(23)

    const growth = formatCareerPhase('GROWTH')
    expect(growth.label).toBe('En progression')
    expect(growth.icon).toBe('📈')

    const peak = formatCareerPhase('PEAK')
    expect(peak.label).toBe('À son apogée')
    expect(peak.icon).toBe('👑')

    const decline = formatCareerPhase('DECLINE')
    expect(decline.label).toBe('En déclin')
    expect(decline.icon).toBe('📉')
  })

  it('computes person trophy record and aggregates titles across career seasons', () => {
    const decoratedPlayer: Person = {
      ...p1,
      id: 'p-champion',
      careerHistory: [
        {
          year: 2026,
          clubId: 'club-1',
          clubName: 'Club Alpha',
          role: 'PLAYER',
          age: 32,
          attack: 26,
          defense: 12,
          roundReached: 14,
          stageLabel: 'Champion de France 🏆',
          isNationalChampion: true,
          isConferenceChampion: true,
          isRegionChampion: true,
          isDepartmentChampion: true,
          conferenceId: 'CONF_EST',
          regionId: 'REG_BFC',
          departmentId: '71',
        },
        {
          year: 2027,
          clubId: 'club-1',
          clubName: 'Club Alpha',
          role: 'PLAYER',
          age: 33,
          attack: 25,
          defense: 11,
          roundReached: 12,
          stageLabel: 'Finale de Conférence',
          isNationalChampion: false,
          isConferenceChampion: false,
          isRegionChampion: true,
          isDepartmentChampion: true,
          conferenceId: 'CONF_EST',
          regionId: 'REG_BFC',
          departmentId: '71',
        },
      ],
    }

    const record = computePersonTrophyRecord(decoratedPlayer)

    expect(record.nationalTitles).toBe(1)
    expect(record.nationalTitleYears).toEqual([2026])
    expect(record.conferenceTitles).toBe(1)
    expect(record.regionTitles).toBe(2)
    expect(record.departmentTitles).toBe(2)
    expect(computePersonTotalTitles(record)).toBe(6)

    expect(record.bestPerformance?.roundNumber).toBe(14)
    expect(record.bestPerformance?.stageLabel).toBe('Champion de France 🏆')
    expect(record.bestPerformance?.year).toBe(2026)
    expect(record.seasons).toHaveLength(2)
    expect(record.seasons[0].year).toBe(2027) // Descending order
    expect(record.seasons[1].year).toBe(2026)
  })

  it('does not invent fictitious palmarès for a new player with empty history', () => {
    const freshPlayer: Person = {
      ...p1,
      id: 'p-fresh',
      careerYears: 0,
      careerHistory: [],
    }

    const record = computePersonTrophyRecord(freshPlayer)

    expect(record.nationalTitles).toBe(0)
    expect(record.conferenceTitles).toBe(0)
    expect(record.regionTitles).toBe(0)
    expect(record.departmentTitles).toBe(0)
    expect(computePersonTotalTitles(record)).toBe(0)
    expect(record.bestPerformance).toBeUndefined()
    expect(record.seasons).toHaveLength(0)
  })

  it('filters out legacy fake dummy training seasons if present', () => {
    const playerWithLegacyDummy: Person = {
      ...p1,
      id: 'p-legacy',
      careerHistory: [
        {
          year: 2025,
          clubId: 'club-1',
          clubName: 'Club Alpha',
          role: 'PLAYER',
          age: 32,
          attack: 26,
          defense: 12,
          roundReached: 1,
          stageLabel: 'Formation & débuts au club',
        },
        {
          year: 2024,
          clubId: 'club-1',
          clubName: 'Club Alpha',
          role: 'PLAYER',
          age: 31,
          attack: 25,
          defense: 11,
          roundReached: 1,
          stageLabel: 'Compétitions & championnats locaux',
        },
      ],
    }

    const record = computePersonTrophyRecord(playerWithLegacyDummy)

    // Dummy seasons are completely stripped out
    expect(record.seasons).toHaveLength(0)
    expect(record.bestPerformance).toBeUndefined()
    expect(computePersonTotalTitles(record)).toBe(0)
  })

  it('preserves and enriches isLoan, parentClubId and parentClubName in career seasons', () => {
    const clubsMap = new Map([
      ['club-1', { id: 'club-1', name: 'Club Alpha' } as any],
      ['club-2', { id: 'club-2', name: 'Club Beta' } as any],
    ])

    const loanedPerson: Person = {
      ...p1,
      id: 'p-loan-check',
      currentClubId: 'club-2',
      parentClubId: 'club-1',
      loanedFromClubId: 'club-1',
      careerHistory: [
        {
          year: 2024,
          clubId: 'club-1',
          clubName: 'Club Alpha',
          role: 'PLAYER',
          age: 22,
          attack: 24,
          defense: 12,
          isLoan: false,
          parentClubId: 'club-1',
          parentClubName: 'Club Alpha',
        },
      ],
    }

    const activeSession: any = {
      seasonYear: 2025,
      rounds: [],
      history: [],
      championId: undefined,
    }

    const record = computePersonTrophyRecord(loanedPerson, [], activeSession, clubsMap)
    expect(record.seasons).toHaveLength(2)

    // Active season 2025: on loan at club-2 from club-1
    const season2025 = record.seasons.find((s) => s.year === 2025)
    expect(season2025).toBeDefined()
    expect(season2025?.clubId).toBe('club-2')
    expect(season2025?.isLoan).toBe(true)
    expect(season2025?.parentClubId).toBe('club-1')
    expect(season2025?.parentClubName).toBe('Club Alpha')

    // Historical season 2024: at parent club
    const season2024 = record.seasons.find((s) => s.year === 2024)
    expect(season2024).toBeDefined()
    expect(season2024?.clubId).toBe('club-1')
    expect(season2024?.isLoan).toBe(false)
    expect(season2024?.parentClubId).toBe('club-1')
    expect(season2024?.parentClubName).toBe('Club Alpha')
  })

  describe('getClubActiveStarters', () => {
    it('returns empty starters when no player is in the club', () => {
      const starters = getClubActiveStarters([], 'club-empty')
      expect(starters.attacker).toBeNull()
      expect(starters.defender).toBeNull()
    })

    it('assigns a solo defender (29 DEF, 8 ATT) as DEFENDER and never as attacker', () => {
      const soloDef: Person = {
        id: 'p-def',
        firstName: 'Jean',
        lastName: 'Roc',
        age: 27,
        nationality: 'FR',
        birthCommuneId: '01001',
        birthCommuneName: 'Bourg',
        birthDepartmentId: '01',
        currentClubId: 'club-solo',
        primaryRole: 'PLAYER',
        position: 'DEFENDER',
        attack: 8,
        defense: 29,
        careerYears: 5,
        isRetired: false,
      }

      // Cas 1 : assignedPosition n'est pas défini (ou pas encore exécuté)
      const starters1 = getClubActiveStarters([soloDef], 'club-solo')
      expect(starters1.attacker).toBeNull()
      expect(starters1.defender?.id).toBe('p-def')

      // Cas 2 : assignedPosition est formellement 'DEFENDER'
      const soloDefAssigned = { ...soloDef, assignedPosition: 'DEFENDER' as const }
      const starters2 = getClubActiveStarters([soloDefAssigned], 'club-solo')
      expect(starters2.attacker).toBeNull()
      expect(starters2.defender?.id).toBe('p-def')
    })

    it('assigns a solo attacker as ATTACKER and not as defender', () => {
      const soloAtk: Person = {
        id: 'p-atk',
        firstName: 'Kylian',
        lastName: 'Flèche',
        age: 23,
        nationality: 'FR',
        birthCommuneId: '75056',
        birthCommuneName: 'Paris',
        birthDepartmentId: '75',
        currentClubId: 'club-atk',
        primaryRole: 'PLAYER',
        position: 'ATTACKER',
        attack: 28,
        defense: 9,
        careerYears: 3,
        isRetired: false,
      }

      const starters = getClubActiveStarters([soloAtk], 'club-atk')
      expect(starters.attacker?.id).toBe('p-atk')
      expect(starters.defender).toBeNull()
    })

    it('optimizes starter roles when 2 defenders are in the same club', () => {
      const d1: Person = {
        id: 'd-1',
        firstName: 'Polyvalent',
        lastName: 'Un',
        age: 25,
        nationality: 'FR',
        birthCommuneId: '01001',
        birthCommuneName: 'Bourg',
        birthDepartmentId: '01',
        currentClubId: 'club-duo',
        primaryRole: 'PLAYER',
        position: 'DEFENDER',
        attack: 19,
        defense: 23,
        careerYears: 4,
        isRetired: false,
      }
      const d2: Person = {
        id: 'd-2',
        firstName: 'Pur',
        lastName: 'Deux',
        age: 28,
        nationality: 'FR',
        birthCommuneId: '01001',
        birthCommuneName: 'Bourg',
        birthDepartmentId: '01',
        currentClubId: 'club-duo',
        primaryRole: 'PLAYER',
        position: 'DEFENDER',
        attack: 7,
        defense: 29,
        careerYears: 7,
        isRetired: false,
      }

      const starters = getClubActiveStarters([d1, d2], 'club-duo')
      // d1 a 19 en attaque -> joue attaquant, d2 a 29 en défense -> joue défenseur
      expect(starters.attacker?.id).toBe('d-1')
      expect(starters.defender?.id).toBe('d-2')
    })
  })
})
