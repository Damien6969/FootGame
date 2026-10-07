import { describe, expect, it } from 'vitest'
import { assignSeasonCoaches, collectCoachMovements } from './coachEngine'
import type { Club } from '../teams/types'
import type { Person, PersonCareerSeason } from '../persons/types'
import type { Commune } from '../geography/types'
import type { SeasonArchive } from '../storage/cupRepository'
import { advancePersonsSeason } from '../persons/personGenerator'

const home: Club = { id: 'home', name: 'Home', shortName: 'Home', communeId: 'town', communeName: 'Town',
  communeIds: ['town'], communeNames: ['Town'], departmentId: '75', regionId: '11', zoneId: 'N',
  conferenceId: 'N', population: 1000, strength: 16, coordinates: [2.35, 48.86] }
const season = (clubId: string, year: number): PersonCareerSeason => ({ clubId, year, role: 'PLAYER', age: 37,
  attack: 20, defense: 10 })
// Peak 20 yields a starting coach rating of 16.
const rookie: Person = { id: 'rookie', firstName: 'Paul', lastName: 'Test', age: 38, nationality: 'FR',
  birthCommuneId: 'birth', birthCommuneName: 'Birth', birthDepartmentId: '13', currentClubId: null,
  primaryRole: 'PLAYER', position: 'ATTACKER', attack: 20, defense: 10, coachPeakSkill: 20,
  careerYears: 20, isRetired: true, retiredYear: 2027, originClubId: 'origin', careerHistory: [season('home', 2026)] }
const incumbent = (skill: number): Person => ({ ...rookie, id: 'coach', primaryRole: 'COACH', age: 50,
  currentClubId: home.id, coachSkill: skill, coachPeakSkill: skill, coachStartedYear: 2015,
  coachStartAge: 38, coachPeakAge: 50 })
const assign = (persons: Person[], clubs: Club[], seed = 'rookies', communes: Commune[] = []) =>
  assignSeasonCoaches({ persons, clubs, communes, seasonYear: 2027, seed })

describe('first coaching appointment', () => {
  it.each([[11, true], [21, true], [10, false], [22, false]])('requires a level gap of at most five for club strength %i', (strength, allowed) => {
    expect(assign([rookie], [{ ...home, strength }])[0].currentClubId).toBe(allowed ? home.id : null)
  })

  it('replaces a weaker coach in the last player club and records the dismissal', () => {
    const previous = [rookie, incumbent(15)]
    const result = assign(previous, [home])
    expect(result[0]).toMatchObject({ primaryRole: 'COACH', currentClubId: 'home', coachSkill: 16 })
    expect(result[1]).toMatchObject({ currentClubId: null, coachDismissedYear: 2027 })
    expect(result[1].coachDismissedClubs?.home).toBeGreaterThanOrEqual(2032)
    expect(collectCoachMovements({ persons: result, previousPersons: previous, clubs: [home], seasonYear: 2027 }))
      .toEqual(expect.arrayContaining([expect.objectContaining({ personId: 'coach', reason: 'LIMOGEAGE' })]))
    expect(previous[1].currentClubId).toBe('home')
  })

  it.each([16, 17])('falls back to another category when the incumbent is rated %i', skill => {
    const other = { ...home, id: 'other' }
    const result = assign([rookie, incumbent(skill)], [home, other])
    expect(result[0].currentClubId).toBe('other')
    expect(result[1].currentClubId).toBe('home')
  })

  it('cannot replace a weaker coach when the club level is unsuitable', () => {
    const [result, coach] = assign([rookie, incumbent(10)], [{ ...home, strength: 22 }])
    expect(result.currentClubId).toBeNull()
    expect(coach.currentClubId).toBe('home')
  })

  it('preserves the 70/20/10 category draw when every category is accessible', () => {
    const clubs = [home, { ...home, id: 'origin' }, { ...home, id: 'other' }]
    const person = { ...rookie, careerHistory: [season('origin', 2025), season('home', 2026)] }
    const counts: Record<string, number> = { home: 0, origin: 0, other: 0 }
    for (let i = 0; i < 1000; i++) counts[assign([person], clubs, `categories-${i}`)[0].currentClubId!]++
    expect(counts.home).toBeGreaterThan(640)
    expect(counts.home).toBeLessThan(760)
    expect(counts.origin).toBeGreaterThan(150)
    expect(counts.origin).toBeLessThan(250)
    expect(counts.other).toBeGreaterThan(60)
    expect(counts.other).toBeLessThan(140)
  })

  it('does not bypass first-appointment level limits through champion recruitment', () => {
    const champion = { ...home, id: 'champion', strength: 22 }
    const previousSeasonArchive = { year: 2026, nationalChampionId: champion.id,
      conferenceChampions: {}, finalFourTeamIds: [], teamPerformances: {} } as unknown as SeasonArchive
    for (let i = 0; i < 50; i++) {
      const [result] = assignSeasonCoaches({ persons: [{ ...rookie, coachDismissedClubs: { home: 2030 } }],
        clubs: [home, champion], seasonYear: 2027, seed: `champion-${i}`, previousSeasonArchive })
      expect(result.currentClubId).toBeNull()
    }
  })

  it('weights former clubs by seasons played and doubles the origin club weight', () => {
    const clubs = ['short', 'long', 'origin'].map(id => ({ ...home, id }))
    const person = { ...rookie, careerHistory: [season('short', 2020), season('long', 2021),
      season('long', 2022), season('long', 2023), season('long', 2024), season('origin', 2025), season('home', 2026)] }
    // Exclude the last club explicitly so the 20% category is the only available one.
    const filteredCounts: Record<string, number> = { short: 0, long: 0, origin: 0 }
    for (let i = 0; i < 700; i++) {
      const [result] = assign([{ ...person, coachDismissedClubs: { home: 2030 } }], [home, ...clubs], `years-${i}`)
      filteredCounts[result.currentClubId!]++
    }
    expect(filteredCounts.long).toBeGreaterThan(filteredCounts.short * 3)
    expect(filteredCounts.origin).toBeGreaterThan(filteredCounts.short * 1.5)
    expect(filteredCounts.long).toBeGreaterThan(filteredCounts.origin * 1.5)
  })

  it('allows an unfamiliar club near the birth city as well as one near the last club', () => {
    const birth: Commune = { id: 'birth', name: 'Birth', departmentId: '13', regionId: '93', zoneId: 'S',
      conferenceId: 'S', population: 5000, coordinates: [5.37, 43.30] }
    const native = { ...home, id: 'native', communeId: birth.id, regionId: '93', conferenceId: 'S',
      coordinates: [5.38, 43.30] as const, strength: 8 }
    const local = { ...home, id: 'local', strength: 8 }
    const distant = { ...native, id: 'distant', coordinates: [6.37, 43.30] as const }
    const person = { ...rookie, coachPeakSkill: 10, coachDismissedClubs: { home: 2030 } }
    const found = new Set<string | null>()
    for (let i = 0; i < 50; i++) found.add(assign([person], [home, native, local, distant], `birth-${i}`, [birth])[0].currentClubId)
    expect(found).toEqual(new Set(['native', 'local']))
    const [transitioned] = advancePersonsSeason({ persons: [person], clubs: [home, native], communes: [birth],
      seasonYear: 2028, seed: 'birth-transition', newRecruitsCount: 0, assignRostersAndLoans: false })
    expect(transitioned.currentClubId).toBe('native')
    const established = { ...person, primaryRole: 'COACH' as const, age: 50, coachStartAge: 38, coachPeakAge: 50, coachPeakSkill: 8 }
    expect(assign([established], [home, native], 'established', [birth])[0].currentClubId).toBeNull()
  })
})
