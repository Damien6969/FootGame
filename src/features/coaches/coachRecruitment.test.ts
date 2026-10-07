import { describe, expect, it } from 'vitest'
import { assignSeasonCoaches } from './coachEngine'
import { isActiveCoach } from './coachRatings'
import type { Person } from '../persons/types'
import type { Club } from '../teams/types'
import type { SeasonArchive } from '../storage/cupRepository'

const home: Club = { id: 'home', name: 'Home', shortName: 'Home', communeId: 'town', communeName: 'Town',
  communeIds: ['town'], communeNames: ['Town'], departmentId: '75', regionId: '11', zoneId: 'N',
  conferenceId: 'N', population: 1000, strength: 10, coordinates: [2.35, 48.86] }
const far: Club = { ...home, id: 'far', name: 'Far', regionId: '93', conferenceId: 'S', strength: 15,
  coordinates: [5.37, 43.30] }
const player: Person = { id: 'player', firstName: 'Young', lastName: 'Player', age: 16, nationality: 'FR',
  birthCommuneId: 'town', birthCommuneName: 'Town', birthDepartmentId: '75', currentClubId: 'home',
  parentClubId: 'home', primaryRole: 'PLAYER', position: 'ATTACKER', attack: 8, defense: 5,
  peakAttack: 25, peakDefense: 15, coachSkill: 20, careerYears: 0, isRetired: false, careerHistory: [] }
const retired: Person = { ...player, age: 38, isRetired: true, retiredYear: 2027, currentClubId: null,
  parentClubId: null, coachPeakSkill: 20, careerHistory: [
    { year: 2026, role: 'PLAYER', clubId: home.id, age: 37, attack: 8, defense: 5 },
  ] }
const archive = { year: 2026, nationalChampionId: 'far', conferenceChampions: {}, finalFourTeamIds: [],
  teamPerformances: {} } as unknown as SeasonArchive
const assign = (persons: Person[], clubs: Club[], seed: string, dynamic = false) => assignSeasonCoaches({
  persons, clubs, seasonYear: 2027, seed, previousSeasonArchive: dynamic ? archive : undefined,
})

describe('coach recruitment safeguards', () => {
  it.each([16, 22, 33, 37])('never reconverts an active %i-year-old player through sporting dynamics', age => {
    for (let i = 0; i < 50; i++) {
      const [result] = assign([{ ...player, age }], [home, { ...far, conferenceId: home.conferenceId }], `young-${i}`, true)
      expect(result).toEqual({ ...player, age })
    }
  })

  it('does not classify a non-retired person as an active coach', () => {
    expect(isActiveCoach({ ...player, primaryRole: 'COACH' })).toBe(false)
  })

  it('finds the coach rather than a player when replacing a bench', () => {
    const residentPlayer = { ...player, id: 'resident', currentClubId: far.id, parentClubId: far.id, coachSkill: 5 }
    const residentCoach: Person = { ...retired, id: 'resident-coach', age: 50, primaryRole: 'COACH',
      currentClubId: far.id, coachSkill: 10, coachPeakSkill: 10 }
    const incoming: Person = { ...retired, id: 'incoming', primaryRole: 'COACH', age: 50,
      coachSkill: 25, coachPeakSkill: 25, coachStartAge: 38, coachPeakAge: 50,
      careerHistory: [{ year: 2026, role: 'COACH', clubId: far.id, age: 49, attack: 8, defense: 5 }] }
    let replacements = 0
    for (let i = 0; i < 50; i++) {
      const result = assign([residentPlayer, residentCoach, incoming], [far], `bench-${i}`, true)
      expect(result[0]).toEqual(residentPlayer)
      expect(result.filter(p => p.primaryRole === 'COACH' && p.currentClubId === far.id)).toHaveLength(1)
      if (result[2].currentClubId === far.id) replacements++
    }
    expect(replacements).toBeGreaterThan(0)
  })

  it.each([
    [9, { ...home, id: 'near', coordinates: [2.45, 48.86] }, true],
    [9, { ...home, id: 'distant', coordinates: [3.35, 48.86] }, false],
    [10, { ...home, id: 'regional', coordinates: [3.35, 48.86] }, true],
    [17, { ...far, conferenceId: 'N' }, false],
    [18, { ...far, conferenceId: 'N' }, true],
    [23, far, false],
    [24, far, true],
  ] as const)('applies player geography for a free coach rated %i', (skill, destination, allowed) => {
    const coach: Person = { ...retired, primaryRole: 'COACH', age: 50, coachSkill: skill,
      coachPeakSkill: skill, coachStartAge: 38, coachPeakAge: 50 }
    const [result] = assign([coach], [home, destination], `geography-${skill}`)
    // The last player club is still available; to isolate the destination, ban it.
    const [isolated] = assign([{ ...coach, coachDismissedClubs: { home: 2030 } }], [home, destination], `isolated-${skill}`)
    expect(isolated.currentClubId).toBe(allowed ? destination.id : null)
    expect(result.isRetired).toBe(true)
  })

  it('enforces geography for both dynamic and ordinary reconversions', () => {
    for (const dynamic of [false, true]) {
      for (let i = 0; i < 30; i++) {
        const [result] = assign([{ ...retired, coachPeakSkill: 10, coachDismissedClubs: { home: 2030 } }],
          [home, far], `retired-${i}`, dynamic)
        expect(result.primaryRole).toBe('PLAYER')
        expect(result.currentClubId).toBeNull()
      }
    }
  })

  it('uses the last coaching location rather than the former player club', () => {
    const nearFar = { ...far, id: 'near-far', coordinates: [5.40, 43.30] as const }
    const coach: Person = { ...retired, primaryRole: 'COACH', age: 50, coachPeakSkill: 9,
      coachStartAge: 38, coachPeakAge: 50, careerHistory: [...retired.careerHistory!,
        { year: 2026, role: 'COACH', clubId: far.id, age: 49, attack: 8, defense: 5 }],
      coachDismissedClubs: { far: 2030 } }
    for (let i = 0; i < 20; i++) {
      const [result] = assign([coach], [home, far, nearFar], `last-bench-${i}`)
      expect(result.currentClubId).toBe(nearFar.id)
    }
  })

  it('does not invent a geographical origin for a retiree with no known club', () => {
    const [result] = assign([{ ...retired, careerHistory: [] }], [home], 'unknown')
    expect(result.currentClubId).toBeNull()
  })

  it('does not substitute an older club when the last known club has disappeared', () => {
    const coach: Person = { ...retired, careerHistory: [...retired.careerHistory!,
      { year: 2027, role: 'COACH', clubId: 'disappeared', age: 38, attack: 8, defense: 5 }] }
    expect(assign([coach], [home], 'disappeared')[0].currentClubId).toBeNull()
  })

  it('rejects a local recruitment with unknown distance while regional coaches can still work in the region', () => {
    for (const [peak, expected] of [[10, null], [13, 'home']] as const) {
      const [result] = assign([{ ...retired, coachPeakSkill: peak }], [{ ...home, coordinates: undefined }], 'missing-distance')
      expect(result.currentClubId).toBe(expected)
    }
  })

  it('resolves a retired player club through a fusion for geography and destination preference', () => {
    const merged = { ...home, id: 'merged' }
    const [result] = assignSeasonCoaches({ persons: [{ ...retired, coachPeakSkill: 10 }],
      clubs: [merged, far], seasonYear: 2027, seed: 'fusion-origin', fusions: [{
        mergedClubId: merged.id, mergedClubName: merged.name, absorbedClubId: home.id,
        absorbedClubName: home.name, communeNames: ['Town'], totalPopulation: 2000, oldStrength: 10, newStrength: 10,
      }] })
    expect(result.currentClubId).toBe(merged.id)
    expect(result.primaryRole).toBe('COACH')
  })

  it('preserves the preference for the last player club among eligible clubs', () => {
    const eligibleHome = { ...home, strength: 16 }
    const nearby = { ...eligibleHome, id: 'nearby', coordinates: [2.45, 48.86] as const }
    let lastClubHires = 0
    for (let i = 0; i < 200; i++) {
      const [result] = assign([retired], [eligibleHome, nearby], `preference-${i}`)
      if (result.currentClubId === home.id) lastClubHires++
    }
    expect(lastClubHires).toBeGreaterThan(130)
    expect(lastClubHires).toBeLessThan(200)
  })

  it('never recruits a coach retired from coaching even if a club is still recorded', () => {
    const coach: Person = { ...retired, primaryRole: 'COACH', currentClubId: home.id,
      coachSkill: 20, coachRetiredYear: 2026 }
    for (let i = 0; i < 30; i++) {
      const [result] = assign([coach], [home, { ...far, conferenceId: 'N' }], `retired-coach-${i}`, true)
      expect(result.currentClubId).toBe(home.id)
    }
  })
})
