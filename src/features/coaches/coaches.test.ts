import { describe, expect, it } from 'vitest'
import { advancePersonsSeason, advancePersonsSeasonWithMarket } from '../persons/personGenerator'
import { assignSeasonCoaches, collectCoachMovements, identifyDynamicClubIds, isCoachBannedFromClub } from './coachEngine'
import { computeCoachPeakSkill, computeCoachSkillAtAge } from './coachRatings'
import { applyRostersStrengthToClubs } from '../persons/rosterAndLoans'
import { computeEffectiveStrength, simulateMatch } from '../match/simulateMatch'
import { computePersonTrophyRecord, getClubRoster } from '../persons/personSelectors'
import type { Person } from '../persons/types'
import type { Club } from '../teams/types'

const club: Club = { id: 'c', name: 'FC Test', shortName: 'Test', communeId: 'town', communeName: 'Test',
  communeIds: ['town'], communeNames: ['Test'], departmentId: '75', regionId: '11', zoneId: 'N', conferenceId: 'N', population: 1000, strength: 15 }
const veteran: Person = { id: 'p', firstName: 'Paul', lastName: 'Test', age: 37, nationality: 'FR', birthCommuneId: 'town',
  birthCommuneName: 'Test', birthDepartmentId: '75', currentClubId: 'c', parentClubId: 'c', primaryRole: 'PLAYER',
  position: 'ATTACKER', attack: 10, defense: 5, peakAttack: 28, peakDefense: 18, careerYears: 20, careerHistory: [] }
const advance = (persons: readonly Person[], year: number, clubs = [club]) => advancePersonsSeason({ persons, clubs, communes: [],
  seasonYear: year, seed: `test-${year}`, newRecruitsCount: 0, assignRostersAndLoans: true })

describe('coach careers', () => {
  it('reconverts a retiring player into the vacant coaching job and preserves his player season', () => {
    const [coach] = advance([veteran], 2027)
    expect(coach.primaryRole).toBe('COACH')
    expect(coach.currentClubId).toBe('c')
    expect(coach.isRetired).toBe(true)
    expect(coach.careerHistory?.[0].role).toBe('PLAYER')
    expect(getClubRoster([coach], 'c')).toEqual([])
    expect(coach.coachSkill).toBeGreaterThan(1)
  })

  it('grows to a peak, declines and leaves at 65 while recording coaching seasons without rewards', () => {
    let [coach] = advance([veteran], 2027)
    const firstRating = coach.coachSkill!
    let bestRating = firstRating
    for (let year = 2028; year <= 2053; year++) {
      ;[coach] = advance([coach], year)
      bestRating = Math.max(bestRating, coach.coachSkill!)
    }
    expect(bestRating).toBeGreaterThan(firstRating)
    expect(coach.age).toBe(64)
    expect(coach.coachSkill).toBeLessThan(bestRating)
    expect(coach.careerHistory?.at(-1)?.role).toBe('COACH')
    expect(coach.careerHistory?.at(-1)?.coachSkill).toBeDefined()
    expect(computePersonTrophyRecord(coach).nationalTitles).toBe(0)
    ;[coach] = advance([coach], 2054)
    expect(coach.currentClubId).toBeNull()
  })

  it('preserves the coach in place and keeps candidates out of occupied jobs', () => {
    const [incumbent] = advance([veteran], 2027)
    const persons = advance([incumbent, { ...veteran, id: 'other' }], 2028)
    expect(persons.filter(p => p.primaryRole === 'COACH' && p.currentClubId === 'c').map(p => p.id)).toEqual(['p'])
  })

  it('uses the current coach rating once in club strength and in matches', () => {
    const coach = { ...veteran, age: 50, primaryRole: 'COACH' as const, isRetired: true, coachSkill: 25 }
    const [boosted] = applyRostersStrengthToClubs([club], [coach])
    expect(boosted.strength).toBe(15.3) // 15 - 1.5 for two missing players + 1.8 coach (relative: 0.25 + 10 * 0.15)
    expect(applyRostersStrengthToClubs([boosted], [coach])[0].strength).toBe(15.3)
    expect(computeEffectiveStrength(29, null, 0, 30)).toBe(29.4)
    expect(simulateMatch({ matchId: 'NATIONAL:14:test', rootSeed: 'test', home: boosted, away: club,
      populationBounds: { min: 10, max: 10000 } }).homeEffectiveStrength).toBe(15.3)
  })

  it('gives stronger players with real high level experience a higher ceiling', () => {
    const national = { ...veteran, coachSkill: 1, careerHistory: [{ year: 2026, clubId: 'c', role: 'PLAYER' as const,
      age: 30, attack: 28, defense: 18, matchesPlayed: 14, isStarter: true, competitionLevel: 30 }] }
    expect(computeCoachPeakSkill(national)).toBe(26)
    expect(computeCoachPeakSkill({ ...national, coachSkill: 30 })).toBe(26)
    expect(computeCoachPeakSkill({ ...national, peakAttack: 12, peakDefense: 8 })).toBeLessThan(26)
    expect(computeCoachPeakSkill({ ...national, careerHistory: [{ ...national.careerHistory[0], isStarter: false }] })).toBeLessThan(26)
    expect([38, 44, 50, 51, 57, 64].map(age => computeCoachSkillAtAge(25, age, 38, 50))).toEqual([20, 24, 25, 25, 24, 19])
  })

  it('includes former retirees in the market without loans and restores their real age', () => {
    const oldRetiree = { ...veteran, age: 38, currentClubId: null, parentClubId: null, isRetired: true, retiredYear: 2020,
      careerHistory: [{ year: 2019, clubId: 'c', role: 'PLAYER' as const, age: 37, attack: 10, defense: 5 }] }
    const market = advancePersonsSeasonWithMarket({ persons: [oldRetiree], clubs: [club], communes: [],
      seasonYear: 2027, seed: 'free-coach', newRecruitsCount: 0 })
    expect(market.persons[0].age).toBe(45)
    expect(market.persons[0].primaryRole).toBe('COACH')
    expect(market.movements).toMatchObject([{ kind: 'TRANSFER', role: 'COACH', fromClubId: 'free-agent', toClubId: 'c' }])
    expect(market.persons[0].loanedFromClubId).toBeUndefined()
  })

  it('allows ambitious coaches to move to stronger vacant clubs with repeatable results', () => {
    const coach = { ...veteran, age: 50, primaryRole: 'COACH' as const, isRetired: true, coachSkill: 28,
      coachPeakSkill: 28, coachStartAge: 38, coachPeakAge: 50, lastAgedYear: 2027 }
    const clubs = [{ ...club, strength: 10 }, { ...club, id: 'strong', strength: 23 }]
    let transfers = 0
    for (let i = 0; i < 100; i++) {
      const options = { persons: [coach], clubs, seasonYear: 2027, seed: `coach-ambition-${i}` }
      const result = assignSeasonCoaches(options)
      expect(assignSeasonCoaches(options)).toEqual(result)
      if (result[0].currentClubId === 'strong') transfers++
    }
    expect(transfers).toBeGreaterThan(5)
    expect(transfers).toBeLessThan(50)
  })

  it('dismisses coaches with underperformance or high tenure and logs LIMOGEAGE to sans-club', () => {
    const coach1 = { ...veteran, id: 'coach-1', age: 48, primaryRole: 'COACH' as const, isRetired: true,
      currentClubId: 'c1', coachSkill: 20, careerHistory: [] }
    const coach2 = { ...veteran, id: 'coach-2', age: 52, primaryRole: 'COACH' as const, isRetired: true,
      currentClubId: 'c2', coachSkill: 20, careerHistory: [
        { year: 2026, clubId: 'c2', role: 'COACH' as const, age: 51, attack: 1, defense: 1 },
        { year: 2025, clubId: 'c2', role: 'COACH' as const, age: 50, attack: 1, defense: 1 },
        { year: 2024, clubId: 'c2', role: 'COACH' as const, age: 49, attack: 1, defense: 1 },
        { year: 2023, clubId: 'c2', role: 'COACH' as const, age: 48, attack: 1, defense: 1 },
      ] }
    const clubs = [
      { ...club, id: 'c1', strength: 28 },
      { ...club, id: 'c2', strength: 12 },
      { ...club, id: 'c3', strength: 15 },
    ]
    const archive = {
      year: 2026, seed: '2026', datasetVersion: 'v1', completedAt: '2026-12-01',
      nationalChampionId: 'c3', conferenceChampions: {},
      finalFourTeamIds: [], totalMatches: 0, history: [],
      teamPerformances: {
        c1: { teamId: 'c1', roundReached: 2, stageLabel: 'R2', matchesPlayed: 2, matchesWon: 1, isNationalChampion: false, isConferenceChampion: false },
      },
    }
    const result = assignSeasonCoaches({
      persons: [coach1, coach2], clubs, seasonYear: 2027, seed: 'test-dismissal', previousSeasonArchive: archive,
    })
    const dismissed = result.filter(p => p.currentClubId === null && p.coachDismissedYear === 2027)
    expect(dismissed.length).toBeGreaterThan(0)
    for (const d of dismissed) {
      expect(d.coachDismissedClubs).toBeDefined()
      const clubId = d.id === 'coach-1' ? 'c1' : 'c2'
      const bannedYear = d.coachDismissedClubs?.[clubId]
      expect(bannedYear).toBeGreaterThanOrEqual(2027 + 5)
      expect(bannedYear).toBeLessThanOrEqual(2027 + 10)
    }

    const movements = collectCoachMovements({
      persons: result, previousPersons: [coach1, coach2], clubs, seasonYear: 2027,
    })
    const limogeage = movements.filter(m => m.reason === 'LIMOGEAGE')
    expect(limogeage.length).toBeGreaterThan(0)
    expect(limogeage[0]).toMatchObject({
      kind: 'TRANSFER',
      role: 'COACH',
      toClubId: 'free-agent',
      toClubName: 'Sans club',
      reason: 'LIMOGEAGE',
    })
  })

  it('prevents dismissed coach from returning to the same club for 5 to 10 years', () => {
    const clubs = [
      { ...club, id: 'c1', strength: 20 },
      { ...club, id: 'c2', strength: 18 },
    ]
    // Coach dismissed from c1 in 2027, banned until 2033 (6 years)
    const sackedCoach: Person = {
      ...veteran,
      id: 'sacked-1',
      age: 49,
      primaryRole: 'COACH',
      isRetired: true,
      currentClubId: null,
      coachSkill: 22,
      coachPeakSkill: 22,
      lastAgedYear: 2027,
      coachDismissedYear: 2027,
      coachDismissedClubs: { c1: 2033 },
      careerHistory: [
        { year: 2026, clubId: 'c1', role: 'COACH', age: 48, attack: 1, defense: 1 },
      ],
    }

    // Season 2028: c1 is empty (only club in the test). The coach must NOT be hired by c1!
    const result2028 = assignSeasonCoaches({
      persons: [sackedCoach],
      clubs: [{ ...club, id: 'c1', strength: 20 }],
      seasonYear: 2028,
      seed: 'test-cooldown-2028',
    })
    const coachIn2028 = result2028.find(p => p.id === 'sacked-1')!
    expect(coachIn2028.currentClubId).toBeNull()

    // Season 2028 with c2 also available: the coach CAN be hired by c2 (non-sacking club)
    const resultWithC2 = assignSeasonCoaches({
      persons: [sackedCoach],
      clubs,
      seasonYear: 2028,
      seed: 'test-cooldown-c2',
    })
    const coachWithC2 = resultWithC2.find(p => p.id === 'sacked-1')!
    expect(coachWithC2.currentClubId).toBe('c2')

    // Season 2033: cooldown has expired (2033 >= 2033), coach can return to c1 if vacant
    const result2033 = assignSeasonCoaches({
      persons: [sackedCoach],
      clubs: [{ ...club, id: 'c1', strength: 20 }],
      seasonYear: 2033,
      seed: 'test-cooldown-2033',
    })
    const coachIn2033 = result2033.find(p => p.id === 'sacked-1')!
    expect(coachIn2033.currentClubId).toBe('c1')
  })

  it('prevents returning to a merged club that absorbed the dismissing club', () => {
    const mergedClubs = [
      { ...club, id: 'c-merged', strength: 24 },
    ]
    const fusions = [
      {
        seasonYear: 2028,
        mergedClubId: 'c-merged',
        mergedClubName: 'Union Test',
        absorbedClubId: 'c1',
        absorbedClubName: 'FC Test',
        communeNames: ['Test'],
        totalPopulation: 2000,
        oldStrength: 20,
        newStrength: 24,
      },
    ]
    const sackedCoach: Person = {
      ...veteran,
      id: 'sacked-2',
      age: 50,
      primaryRole: 'COACH',
      isRetired: true,
      currentClubId: null,
      coachSkill: 20,
      coachPeakSkill: 20,
      lastAgedYear: 2027,
      coachDismissedClubs: { c1: 2035 },
      careerHistory: [
        { year: 2027, clubId: 'c1', role: 'COACH', age: 50, attack: 1, defense: 1 },
      ],
    }

    const result = assignSeasonCoaches({
      persons: [sackedCoach],
      clubs: mergedClubs,
      seasonYear: 2029,
      seed: 'test-merged-ban',
      fusions,
    })
    const coachAfterMerge = result.find(p => p.id === 'sacked-2')!
    expect(coachAfterMerge.currentClubId).toBeNull()
  })
})

describe('isCoachBannedFromClub', () => {
  it('returns false when coach has no dismissal history', () => {
    expect(isCoachBannedFromClub(veteran, 'c1', 2028)).toBe(false)
  })

  it('returns true during cooldown period and false after expiry', () => {
    const coachWithBan: Person = {
      ...veteran,
      coachDismissedClubs: { c1: 2033 },
    }
    expect(isCoachBannedFromClub(coachWithBan, 'c1', 2027)).toBe(true)
    expect(isCoachBannedFromClub(coachWithBan, 'c1', 2032)).toBe(true)
    expect(isCoachBannedFromClub(coachWithBan, 'c1', 2033)).toBe(false)
    expect(isCoachBannedFromClub(coachWithBan, 'c1', 2034)).toBe(false)
    expect(isCoachBannedFromClub(coachWithBan, 'c2', 2028)).toBe(false)
  })

  it('correctly resolves merged club and banned club', () => {
    const coachWithBan: Person = {
      ...veteran,
      coachDismissedClubs: { 'c-absorbed': 2035 },
    }
    const resolve = (id: string | null) => id === 'c-absorbed' ? 'c-merged' : id
    expect(isCoachBannedFromClub(coachWithBan, 'c-merged', 2030, resolve)).toBe(true)
    expect(isCoachBannedFromClub(coachWithBan, 'c-other', 2030, resolve)).toBe(false)
  })
})

describe('coach opportunity balance', () => {
  it('allows an opportunity only towards a strictly stronger club matching coach caliber', () => {
    // Coach with high skill (25) at a club of strength 14
    const eliteCoach: Person = {
      ...veteran,
      id: 'coach-elite',
      primaryRole: 'COACH',
      isRetired: true,
      currentClubId: 'c-small',
      coachSkill: 25,
      coachPeakSkill: 25,
    }
    const currentClub = { ...club, id: 'c-small', strength: 14 }
    const weakerClub = { ...club, id: 'c-weak', strength: 12 }
    const sameStrengthClub = { ...club, id: 'c-same', strength: 14 }
    const mediocreClub = { ...club, id: 'c-med', strength: 16 } // Not strong enough for a 25-rated coach
    const topClub = { ...club, id: 'c-top', strength: 22 } // Strong club matching caliber (>= 18, >= 21)

    // With only weaker or mediocre clubs available: coach must NEVER leave for them
    for (let i = 0; i < 20; i++) {
      const resultNoStepUp = assignSeasonCoaches({
        persons: [eliteCoach],
        clubs: [currentClub, weakerClub, sameStrengthClub, mediocreClub],
        seasonYear: 2028,
        seed: `test-no-stepup-${i}`,
      })
      const coach = resultNoStepUp.find(p => p.id === 'coach-elite')!
      expect(coach.currentClubId).toBe('c-small')
    }

    // With a top club available: coach can take the opportunity when ambition roll triggers
    let transferredToTop = false
    for (let i = 0; i < 20; i++) {
      const resultWithTop = assignSeasonCoaches({
        persons: [eliteCoach],
        clubs: [currentClub, topClub],
        seasonYear: 2028,
        seed: `test-with-top-${i}`,
      })
      if (resultWithTop.find(p => p.id === 'coach-elite')!.currentClubId === 'c-top') {
        transferredToTop = true
        break
      }
    }
    expect(transferredToTop).toBe(true)
  })

  it('labels coach transfer as OPPORTUNITY only if destination is strictly stronger, otherwise FREE_AGENT', () => {
    const clubStrong = { ...club, id: 'c-strong', strength: 25 }
    const clubWeak = { ...club, id: 'c-weak', strength: 14 }

    const coachBefore: Person = {
      ...veteran,
      id: 'c-test',
      primaryRole: 'COACH',
      isRetired: true,
      currentClubId: 'c-weak',
      coachSkill: 24,
    }
    const coachAfterStepUp: Person = {
      ...coachBefore,
      currentClubId: 'c-strong',
    }

    // Weak -> Strong = OPPORTUNITY
    const stepUpMovements = collectCoachMovements({
      persons: [coachAfterStepUp],
      previousPersons: [coachBefore],
      clubs: [clubWeak, clubStrong],
      seasonYear: 2028,
    })
    expect(stepUpMovements).toHaveLength(1)
    expect(stepUpMovements[0].reason).toBe('OPPORTUNITY')

    // Strong -> Weak = FREE_AGENT (never OPPORTUNITY)
    const coachBeforeStrong: Person = {
      ...veteran,
      id: 'c-test-2',
      primaryRole: 'COACH',
      isRetired: true,
      currentClubId: 'c-strong',
      coachSkill: 24,
    }
    const coachAfterDown: Person = {
      ...coachBeforeStrong,
      currentClubId: 'c-weak',
    }
    const stepDownMovements = collectCoachMovements({
      persons: [coachAfterDown],
      previousPersons: [coachBeforeStrong],
      clubs: [clubWeak, clubStrong],
      seasonYear: 2028,
    })
    expect(stepDownMovements).toHaveLength(1)
    expect(stepDownMovements[0].reason).toBe('FREE_AGENT')
  })

  it('allows a club with a big performance (champion / final four) to attract a stronger coach with DYNAMICS reason', () => {
    // Club champion with strength 16, current coach skill 14
    const championClub = { ...club, id: 'c-champ', strength: 16 }
    const ordinaryClub = { ...club, id: 'c-ord', strength: 15 }

    const modestCoach: Person = {
      ...veteran,
      id: 'coach-modest',
      primaryRole: 'COACH',
      isRetired: true,
      currentClubId: 'c-champ',
      coachSkill: 14,
    }
    const eliteCoach: Person = {
      ...veteran,
      id: 'coach-elite',
      primaryRole: 'COACH',
      currentClubId: 'c-ord',
      isRetired: true,
      coachSkill: 23,
    }

    const archive = {
      year: 2027, seed: '2027', datasetVersion: 'v1', completedAt: '2027-12-01',
      nationalChampionId: 'c-champ', conferenceChampions: {},
      finalFourTeamIds: ['c-champ'], totalMatches: 0, history: [],
      teamPerformances: {
        'c-champ': { teamId: 'c-champ', roundReached: 7, stageLabel: 'Finale', matchesPlayed: 7, matchesWon: 7, isNationalChampion: true, isConferenceChampion: true },
        'c-ord': { teamId: 'c-ord', roundReached: 4, stageLabel: '1/8', matchesPlayed: 4, matchesWon: 3, isNationalChampion: false, isConferenceChampion: false },
      },
    }

    // Dynamic club identification
    const dynamicIds = identifyDynamicClubIds(archive, new Map([['c-champ', championClub], ['c-ord', ordinaryClub]]), id => id)
    expect(dynamicIds.has('c-champ')).toBe(true)
    expect(dynamicIds.has('c-ord')).toBe(false)

    // Run season assignment with archive: the champion club attracts the stronger coach
    let attracted = false
    for (let i = 0; i < 30; i++) {
      const result = assignSeasonCoaches({
        persons: [modestCoach, eliteCoach],
        clubs: [championClub, ordinaryClub],
        seasonYear: 2028,
        seed: `test-dyn-poach-${i}`,
        previousSeasonArchive: archive,
      })
      const coachAtChamp = result.find(p => p.currentClubId === 'c-champ')
      if (coachAtChamp?.id === 'coach-elite') {
        attracted = true
        break
      }
    }
    expect(attracted).toBe(true)

    // Verify movement is registered with reason 'DYNAMICS'
    const coachAfter: Person = {
      ...eliteCoach,
      currentClubId: 'c-champ',
    }
    const movements = collectCoachMovements({
      persons: [coachAfter],
      previousPersons: [eliteCoach],
      clubs: [championClub, ordinaryClub],
      seasonYear: 2028,
      previousSeasonArchive: archive,
    })
    expect(movements).toHaveLength(1)
    expect(movements[0]).toMatchObject({
      role: 'COACH',
      personId: 'coach-elite',
      fromClubId: 'c-ord',
      toClubId: 'c-champ',
      reason: 'DYNAMICS',
    })
  })
})



