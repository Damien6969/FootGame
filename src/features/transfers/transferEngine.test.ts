import { describe, expect, it } from 'vitest'
import type { Club } from '../teams/types'
import type { Person, PersonCareerSeason } from '../persons/types'
import { applyTransferMarket, collectLoanMovements } from './transferEngine'
import { advancePersonsSeasonWithMarket } from '../persons/personGenerator'

const club = (id: string, strength = 15, overrides: Partial<Club> = {}): Club => ({
  id, name: id, shortName: id, communeId: id, communeName: id, communeIds: [id], communeNames: [id],
  departmentId: '75', regionId: 'R', zoneId: 'Z', conferenceId: 'C', population: 1000,
  strength, coordinates: [2, 48], ...overrides,
})
const player = (id: string, owner: string, attack = 15, overrides: Partial<Person> = {}): Person => ({
  id, firstName: id, lastName: 'Joueur', nationality: 'FR', age: 27, birthCommuneId: 'birth',
  birthCommuneName: 'Naissance', birthDepartmentId: '75', parentClubId: owner, currentClubId: owner,
  primaryRole: 'PLAYER', position: 'ATTACKER', attack, defense: 1, peakAttack: attack,
  peakDefense: 1, peakAge: 27, careerYears: 5, careerHistory: [], ...overrides,
})
const history = (isLoan = true): PersonCareerSeason[] => [2024, 2025, 2026].map(year => ({
  year, clubId: 'host', parentClubId: 'owner', age: 25, attack: 15, defense: 1, role: 'PLAYER', isLoan,
  isStarter: isLoan,
}))
const blocked = (overrides: Partial<Person> = {}) => [
  player('move', 'owner', 15, overrides), player('starter', 'owner', 23),
  player('defender', 'owner', 1, { position: 'DEFENDER', defense: 23, peakDefense: 23 }),
]
const run = (persons: Person[], clubs: Club[], rng = () => 0, previousPersons?: Person[]) =>
  applyTransferMarket({ persons, clubs, seasonYear: 2027, seed: 'market', rng, previousPersons })

describe('transfer market', () => {
  it('lets a standout leave while preserving identity and completed history', () => {
    const p = player('star', 'owner', 24, { careerHistory: history(), loanedFromClubId: 'owner' })
    const result = run([p], [club('owner', 15), club('destination', 26)])
    expect(result.movements).toHaveLength(1)
    expect(result.movements[0]).toMatchObject({ kind: 'TRANSFER', reason: 'AMBITION', rating: 24,
      fromClubId: 'owner', toClubId: 'destination', seasonYear: 2027 })
    expect(result.persons[0]).toMatchObject({ id: 'star', parentClubId: 'destination', currentClubId: 'destination' })
    expect(result.persons[0].loanedFromClubId).toBeUndefined()
    expect(result.persons[0]).toMatchObject({ originClubId: 'owner', originClubName: 'owner' })
    expect(result.persons[0].careerHistory).toEqual(p.careerHistory)
    expect(p.parentClubId).toBe('owner')
  })

  it('never makes a departure certain and does not add overlapping probabilities', () => {
    const persons = blocked({ careerHistory: history() })
    expect(run(persons, [club('owner', 10), club('destination', 10)], () => .46).movements).toEqual([])
    expect(run(persons, [club('owner', 10), club('destination', 10)], () => .44).movements[0]?.reason).toBe('LONG_LOAN')
    expect(run([player('star', 'owner', 24)], [club('owner'), club('destination', 26)], () => .99).movements).toEqual([])
  })

  it('protects a growing prospect despite three consecutive loans', () => {
    const persons = blocked({ age: 20, peakAge: 27, peakAttack: 28, careerHistory: history() })
    expect(run(persons, [club('owner', 20), club('destination', 16)], () => .11).movements).toEqual([])
    expect(run(persons, [club('owner', 20), club('destination', 16)], () => .09).movements[0]?.reason).toBe('DEVELOPMENT')
  })

  it('recognizes a young player who cannot overtake an equally young stronger starter', () => {
    const persons = blocked({ age: 20, attack: 18, peakAge: 27, peakAttack: 24, careerHistory: history() })
    persons[1] = player('starter', 'owner', 23, { age: 20, peakAge: 27, peakAttack: 30 })
    const result = run(persons, [club('owner', 23), club('destination', 18)], () => .20)
    expect(result.movements.find(m => m.personId === 'move')).toMatchObject({ reason: 'LONG_LOAN' })
  })

  it.each([
    { age: 32, attack: 25, peakAge: 27, peakAttack: 30 },
    { age: 37, attack: 30, peakAge: 37, peakAttack: 30 },
  ])('protects a prospect who can replace an aging or retiring starter: age $age', incumbent => {
    const persons = blocked({ age: 20, attack: 18, peakAge: 27, peakAttack: 24, careerHistory: history() })
    persons[1] = player('starter', 'owner', incumbent.attack, incumbent)
    expect(run(persons, [club('owner', 26), club('destination', 18)], () => .20).movements
      .some(m => m.personId === 'move')).toBe(false)
    expect(run(persons, [club('owner', 26), club('destination', 18)], () => .09).movements
      .find(m => m.personId === 'move')).toMatchObject({ reason: 'DEVELOPMENT' })
  })

  it('helps an older blocked player join a comparable club with a place', () => {
    const persons = blocked({ age: 32 })
    const result = run(persons, [club('owner', 20), club('destination', 18)], () => .59)
    expect(result.movements[0]).toMatchObject({ personId: 'move', reason: 'VETERAN' })
    expect(run(persons, [club('owner', 20), club('destination', 22)], () => .59).movements).toEqual([])
  })

  it('anchors a local search at the previous loan host, not ownership or birth', () => {
    const persons = blocked({ attack: 8, peakAttack: 8 })
    const previous = persons.map(p => p.id === 'move' ? { ...p, currentClubId: 'host', loanedFromClubId: 'owner' } : p)
    const clubs = [club('owner', 8, { coordinates: [2, 48] }),
      club('host', 8, { coordinates: [7, 48] }),
      club('near-owner', 8, { coordinates: [2.1, 48] }),
      club('near-host', 8, { coordinates: [7.1, 48] })]
    // The host is full, leaving only the nearby destination available.
    persons.push(player('host-att', 'host', 20), player('host-def', 'host', 1, { position: 'DEFENDER', defense: 20 }))
    const result = run(persons, clubs, () => 0, previous)
    expect(result.movements.find(m => m.personId === 'move')).toMatchObject({ toClubId: 'near-host' })
    expect(result.movements.find(m => m.personId === 'move')?.distanceKm).toBeLessThan(10)
    expect(result.movements.find(m => m.personId === 'move')).toMatchObject({ distanceFromClubName: 'host' })
  })

  it.each([
    [9, { coordinates: [3, 48] }, false],
    [9, { coordinates: undefined }, false],
    [17, { regionId: 'other' }, false],
    [18, { regionId: 'other' }, true],
    [23, { conferenceId: 'other' }, false],
    [24, { conferenceId: 'other', regionId: 'other', coordinates: [9, 43] }, true],
  ] as const)('enforces the geographic tier for rating %s', (rating, overrides, allowed) => {
    const persons = blocked({ attack: rating, peakAttack: rating })
    persons[1] = player('starter', 'owner', 30)
    const result = run(persons, [club('owner', rating), club('destination', rating, overrides)])
    expect(result.movements.some(m => m.personId === 'move')).toBe(allowed)
  })

  it('resolves a previous host absorbed by a fusion', () => {
    const persons = blocked({ attack: 8, peakAttack: 8 })
    const previous = persons.map(p => p.id === 'move' ? { ...p, currentClubId: 'absorbed' } : p)
    const result = run(persons, [club('owner', 8, { coordinates: [2, 48] }),
      club('merged', 8, { coordinates: [7, 48], fusedClubs: [{ id: 'absorbed', name: 'old', communeName: 'old' }] }),
    ], () => 0, previous)
    expect(result.movements[0]).toMatchObject({ personId: 'move', toClubId: 'merged', distanceKm: 0 })
  })

  it('limits departures and arrivals and skips fresh recruits', () => {
    const persons = [...blocked(), player('second', 'owner', 14), player('recruit', 'new', 26, { careerYears: 0 })]
    const result = run(persons, [club('owner'), club('destination'), club('second-destination'), club('new', 10)])
    expect(result.movements.filter(m => m.fromClubId === 'owner')).toHaveLength(1)
    expect(result.movements.some(m => m.personId === 'recruit')).toBe(false)
    expect(new Set(result.movements.map(m => m.toClubId)).size).toBe(result.movements.length)
  })

  it('rejects a stronger club beyond three rating points and a blocked destination', () => {
    const p = player('star', 'owner', 24)
    expect(run([p], [club('owner'), club('too-strong', 28)]).movements).toEqual([])
    const persons = [p, player('dest-att', 'destination', 29),
      player('dest-def', 'destination', 1, { defense: 29, position: 'DEFENDER' })]
    expect(run(persons, [club('owner'), club('destination', 26)]).movements.some(m => m.personId === 'star')).toBe(false)
  })

  it('only transfers into a real starter place, even at an ambitious destination', () => {
    const persons = [player('star', 'owner', 24), player('dest-att', 'destination', 25),
      player('dest-def', 'destination', 1, { defense: 29, position: 'DEFENDER' })]
    const result = run(persons, [club('owner', 15), club('destination', 26)])
    expect(result.movements.some(m => m.personId === 'star')).toBe(false)
  })

  it('reproduces moves from a seed without depending on input order', () => {
    const persons = [...blocked(), player('other', 'other-owner', 24)]
    const clubs = [club('owner'), club('other-owner', 15), club('dest-a'), club('dest-b')]
    const options = { persons, clubs, seasonYear: 2027, seed: 'reproducible' }
    const a = applyTransferMarket(options)
    const b = applyTransferMarket({ ...options, persons: [...persons].reverse(), clubs: [...clubs].reverse() })
    expect(b.movements).toEqual(a.movements)
  })
})

describe('annual market integration', () => {
  it('records new-season loans and uses the previous host for distance', () => {
    const persons = [...blocked({ age: 17, peakAttack: 28, currentClubId: 'previous-host', loanedFromClubId: 'owner' }),
      player('host-att', 'previous-host', 30),
      player('host-def', 'previous-host', 1, { defense: 30, peakDefense: 30, position: 'DEFENDER' })]
    const clubs = [club('owner', 22, { coordinates: [2, 48] }),
      club('previous-host', 28, { coordinates: [7, 48] }), club('new-host', 15, { coordinates: [7.1, 48] })]
    const result = advancePersonsSeasonWithMarket({ persons, clubs, communes: [], seasonYear: 2027,
      seed: 'integration-loans', newRecruitsCount: 0 })
    const loans = result.persons.filter(p => p.loanedFromClubId && p.currentClubId !== p.loanedFromClubId)
    expect(loans.length).toBeGreaterThan(0)
    for (const p of loans) {
      const movement = result.movements.find(m => m.personId === p.id)
      expect(movement).toMatchObject({ kind: 'LOAN', fromClubId: 'previous-host',
        toClubId: p.currentClubId, ownerClubId: 'owner', reason: 'DEVELOPMENT' })
      expect(movement?.distanceKm).toBeLessThan(10)
    }
    expect(result.persons.find(p => p.id === 'move')?.careerHistory?.at(-1)).toMatchObject({
      year: 2026, clubId: 'previous-host', isLoan: true,
    })
  })

  it('omits a renewed loan at the same host and records newly attributed recruit loans', () => {
    const renewed = player('renewed', 'owner', 15, { currentClubId: 'host', loanedFromClubId: 'owner' })
    const recruit = player('recruit', 'owner', 15, { careerYears: 0, currentClubId: 'host', loanedFromClubId: 'owner' })
    const result = collectLoanMovements({ persons: [renewed, recruit], previousPersons: [renewed],
      clubs: [club('owner'), club('host')], seasonYear: 2027, seed: 'loans' })
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ personId: 'recruit', kind: 'LOAN', fromClubId: 'owner', toClubId: 'host' })
  })

  it('changes ownership before rosters and keeps transfers at their recorded destination', () => {
    const persons = [player('star', 'owner', 24)]
    const clubs = [club('owner', 15), club('destination', 26)]
    const results = Array.from({ length: 30 }, (_, i) => advancePersonsSeasonWithMarket({ persons, clubs,
      communes: [], seasonYear: 2027, seed: `integration-${i}`, newRecruitsCount: 0 }))
    const changed = results.find(result => result.movements.some(m => m.kind === 'TRANSFER'))
    expect(changed).toBeDefined()
    expect(changed?.persons[0]).toMatchObject({ parentClubId: 'destination', currentClubId: 'destination',
      assignedPosition: 'ATTACKER' })
    expect(changed?.movements).toHaveLength(1)
    expect(changed?.persons[0].careerHistory?.at(-1)?.clubId).toBe('owner')
  })

  it('keeps final ownership and unique sorted movements across repeated seasonal markets', () => {
    const clubs = Array.from({ length: 12 }, (_, i) => club(`club-${i}`, i < 6 ? 15 : 26))
    const initial = Array.from({ length: 36 }, (_, i) => player(`player-${i}`, `club-${Math.floor(i / 6)}`,
      i % 2 ? 1 : 21 + i % 6, { age: 24, peakAge: 25,
        position: i % 2 ? 'DEFENDER' : 'ATTACKER', defense: i % 2 ? 21 + i % 6 : 1,
        peakAttack: i % 2 ? 1 : 21 + i % 6, peakDefense: i % 2 ? 21 + i % 6 : 1 }))
    let transferCount = 0
    for (let seed = 0; seed < 12; seed++) {
      let persons = initial
      for (let year = 2027; year < 2031; year++) {
        const result = advancePersonsSeasonWithMarket({ persons, clubs, communes: [],
          seasonYear: year, seed: `multi-season-${seed}`, newRecruitsCount: 0 })
        const playerById = new Map(result.persons.map(p => [p.id, p]))
        expect(new Set(result.movements.map(m => m.personId)).size).toBe(result.movements.length)
        expect(result.movements.map(m => m.rating)).toEqual(result.movements.map(m => m.rating).sort((a, b) => b - a))
        const transfers = result.movements.filter(m => m.kind === 'TRANSFER')
        expect(new Set(transfers.map(m => m.fromClubId)).size).toBe(transfers.length)
        expect(new Set(transfers.map(m => m.toClubId)).size).toBe(transfers.length)
        for (const move of transfers) {
          expect(playerById.get(move.personId)).toMatchObject({ parentClubId: move.toClubId, currentClubId: move.toClubId })
          expect(playerById.get(move.personId)?.loanedFromClubId).toBeUndefined()
        }
        transferCount += transfers.length
        persons = result.persons
      }
    }
    expect(transferCount).toBeGreaterThan(0)
  })

  it('allows the national champion to poach an active starter from another club when it represents a net upgrade', () => {
    // Champion has a weak attacker (12), rival club has a top attacker (25)
    const champAttacker = player('champ-att', 'champion-club', 12)
    const champDefender = player('champ-def', 'champion-club', 26, { position: 'DEFENDER', defense: 26 })
    const rivalStarter = player('rival-star', 'rival-club', 25)
    const rivalDefender = player('rival-def', 'rival-club', 20, { position: 'DEFENDER', defense: 20 })

    const clubs = [
      club('champion-club', 26),
      club('rival-club', 20),
    ]
    const archive = {
      year: 2026, seed: '2026', datasetVersion: 'v1', completedAt: '2026-12-01',
      nationalChampionId: 'champion-club', conferenceChampions: {},
      finalFourTeamIds: [], totalMatches: 0, history: [],
      teamPerformances: {
        'rival-club': { teamId: 'rival-club', roundReached: 2, stageLabel: 'R2', matchesPlayed: 2, matchesWon: 1, isNationalChampion: false, isConferenceChampion: false },
      },
    }

    const result = applyTransferMarket({
      persons: [champAttacker, champDefender, rivalStarter, rivalDefender],
      clubs,
      seasonYear: 2027,
      seed: 'test-poach',
      previousSeasonArchive: archive,
      rng: () => 0, // Force poach to succeed
    })

    const dynamicsMove = result.movements.find(m => m.personId === 'rival-star')
    expect(dynamicsMove).toBeDefined()
    expect(dynamicsMove).toMatchObject({
      kind: 'TRANSFER',
      toClubId: 'champion-club',
      reason: 'DYNAMICS',
    })
    const poachedPlayer = result.persons.find(p => p.id === 'rival-star')
    expect(poachedPlayer?.parentClubId).toBe('champion-club')
    expect(poachedPlayer?.currentClubId).toBe('champion-club')
  })

  it('increases departure chance for players in underperforming clubs', () => {
    const p1 = player('star1', 'underperf-club', 19)
    const clubs = [club('underperf-club', 16), club('destination', 20)]
    const underperfArchive = {
      year: 2026, seed: '2026', datasetVersion: 'v1', completedAt: '2026-12-01',
      nationalChampionId: 'other', conferenceChampions: {},
      finalFourTeamIds: [], totalMatches: 0, history: [],
      teamPerformances: {
        'underperf-club': { teamId: 'underperf-club', roundReached: 1, stageLabel: 'R1', matchesPlayed: 1, matchesWon: 0, isNationalChampion: false, isConferenceChampion: false },
      },
    }

    // With a gap of 3 (19 - 16 = 3), underperformance reduces standoutGap to 3, enabling qualification
    const result = applyTransferMarket({
      persons: [p1],
      clubs,
      seasonYear: 2027,
      seed: 'test-underperf',
      previousSeasonArchive: underperfArchive,
      rng: () => 0.01,
    })

    expect(result.movements).toHaveLength(1)
    expect(result.movements[0].personId).toBe('star1')
  })
})

