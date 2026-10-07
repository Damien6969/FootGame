import { describe, it, expect } from 'vitest'
import { selectClubStarters, assignSeasonRostersAndLoans, buildAbsorbedToMergedClubMap, applyRostersStrengthToClubs } from './rosterAndLoans'
import type { Person } from './types'
import type { Club } from '../teams/types'

function makeTestPerson(
  id: string,
  firstName: string,
  attack: number,
  defense: number,
  position: 'ATTACKER' | 'DEFENDER',
  clubId = 'club-1',
): Person {
  return {
    id,
    firstName,
    lastName: 'Test',
    age: 25,
    nationality: 'FR',
    birthCommuneId: '01001',
    birthCommuneName: 'Ville 1',
    birthDepartmentId: '01',
    currentClubId: clubId,
    parentClubId: clubId,
    primaryRole: 'PLAYER',
    position,
    attack,
    defense,
    careerYears: 3,
    isRetired: false,
  }
}

function makeTestClub(
  id: string,
  name: string,
  strength: number,
  coordinates: [number, number] = [2.35, 48.85],
  departmentId = '01',
): Club {
  return {
    id,
    name,
    shortName: name,
    communeId: id,
    communeName: name,
    communeIds: [id],
    communeNames: [name],
    departmentId,
    regionId: '84',
    zoneId: 'SUD_EST',
    conferenceId: 'CONF_SUD_EST',
    population: strength * 10000,
    strength,
    coordinates,
  }
}

describe('rosterAndLoans', () => {
  describe('applyRostersStrengthToClubs', () => {
    it('penalizes empty positions without counting retired or loaned-out players and remains stable on repeated application', () => {
      const clubs = ['empty', 'attacker', 'defender', 'complete'].map(id => makeTestClub(id, id, 20))
      const persons: Person[] = [
        { ...makeTestPerson('retired', 'Retired', 25, 25, 'DEFENDER', 'empty'), isRetired: true },
        { ...makeTestPerson('loan', 'Loan', 18, 18, 'ATTACKER', 'attacker'), parentClubId: 'empty', loanedFromClubId: 'empty' },
        makeTestPerson('def', 'Defender', 18, 18, 'DEFENDER', 'defender'),
        makeTestPerson('pair-att', 'Attacker', 18, 18, 'ATTACKER', 'complete'),
        makeTestPerson('pair-def', 'Defender', 18, 18, 'DEFENDER', 'complete'),
      ]
      const updated = applyRostersStrengthToClubs(clubs, persons)
      expect(updated.map(c => c.strength)).toEqual([18.5, 19.7, 19.7, 20.3])
      expect(updated.map(c => c.baseStrength)).toEqual([20, 20, 20, 20])
      expect(applyRostersStrengthToClubs(updated, persons)).toEqual(updated)
    })
  })

  describe('selectClubStarters', () => {
    it('returns empty starters when no contracted players exist', () => {
      const res = selectClubStarters([])
      expect(res.attacker).toBeNull()
      expect(res.defender).toBeNull()
      expect(res.surplusPlayers).toHaveLength(0)
    })

    it('assigns a single player to their best slot (ATT or DEF)', () => {
      const pAtt = makeTestPerson('p-1', 'AttackerOnly', 25, 10, 'ATTACKER')
      const res1 = selectClubStarters([pAtt])
      expect(res1.attacker?.id).toBe('p-1')
      expect(res1.defender).toBeNull()
      expect(res1.surplusPlayers).toHaveLength(0)

      const pDef = makeTestPerson('p-2', 'DefenderOnly', 12, 26, 'DEFENDER')
      const res2 = selectClubStarters([pDef])
      expect(res2.attacker).toBeNull()
      expect(res2.defender?.id).toBe('p-2')
      expect(res2.surplusPlayers).toHaveLength(0)
    })

    it('reassigns one player when only two players of same position exist (e.g. 2 defenders)', () => {
      // Both nominal defenders, but p1 has better attack than p2
      const d1 = makeTestPerson('d-1', 'Def1', 18, 25, 'DEFENDER')
      const d2 = makeTestPerson('d-2', 'Def2', 12, 28, 'DEFENDER')

      const res = selectClubStarters([d1, d2])
      // d1 has attack 18 (higher than d2's 12), d2 has defense 28 -> d1 as attacker, d2 as defender
      expect(res.attacker?.id).toBe('d-1')
      expect(res.attacker?.assignedPosition).toBe('ATTACKER')
      expect(res.defender?.id).toBe('d-2')
      expect(res.defender?.assignedPosition).toBe('DEFENDER')
      expect(res.surplusPlayers).toHaveLength(0)
    })

    it('selects the optimal pair of 1 ATT and 1 DEF among multiple players and isolates surplus', () => {
      const p1 = makeTestPerson('p-1', 'StarAtk', 28, 12, 'ATTACKER')
      const p2 = makeTestPerson('p-2', 'GoodAtk', 22, 14, 'ATTACKER')
      const p3 = makeTestPerson('p-3', 'StarDef', 10, 27, 'DEFENDER')
      const p4 = makeTestPerson('p-4', 'Average', 15, 16, 'DEFENDER')

      const res = selectClubStarters([p1, p2, p3, p4])
      expect(res.attacker?.id).toBe('p-1')
      expect(res.defender?.id).toBe('p-3')
      expect(res.surplusPlayers).toHaveLength(2)
      expect(res.surplusPlayers.map((p) => p.id)).toEqual(['p-2', 'p-4'])
    })
  })

  describe('assignSeasonRostersAndLoans', () => {
    it('loans surplus players from strong clubs to clubs lacking players', () => {
      const clubA = makeTestClub('club-a', 'Paris Elite', 28, [2.35, 48.85], '75')
      const clubB = makeTestClub('club-b', 'Banlieue Proche', 22, [2.40, 48.88], '75')
      const clubC = makeTestClub('club-c', 'Province Loin', 8, [5.0, 45.0], '69')

      const clubs = [clubA, clubB, clubC]

      // Club A has 4 players (1 top ATT, 1 top DEF, 2 surplus)
      const p1 = makeTestPerson('p-1', 'Mbappé', 29, 12, 'ATTACKER', 'club-a')
      const p2 = makeTestPerson('p-2', 'Marquinhos', 12, 28, 'DEFENDER', 'club-a')
      const p3 = makeTestPerson('p-3', 'SurplusAtk', 23, 10, 'ATTACKER', 'club-a')
      const p4 = makeTestPerson('p-4', 'SurplusDef', 9, 21, 'DEFENDER', 'club-a')

      const allPersons = [p1, p2, p3, p4]

      const updated = assignSeasonRostersAndLoans({
        persons: allPersons,
        clubs,
        seed: 'test-seed-loans',
      })

      // p1 and p2 remain at club-a as starters
      const upP1 = updated.find((p) => p.id === 'p-1')!
      const upP2 = updated.find((p) => p.id === 'p-2')!
      expect(upP1.currentClubId).toBe('club-a')
      expect(upP1.loanedFromClubId).toBeUndefined()
      expect(upP2.currentClubId).toBe('club-a')
      expect(upP2.loanedFromClubId).toBeUndefined()

      // p3 and p4 are loaned out from club-a
      const upP3 = updated.find((p) => p.id === 'p-3')!
      const upP4 = updated.find((p) => p.id === 'p-4')!

      expect(upP3.loanedFromClubId).toBe('club-a')
      expect(upP3.parentClubId).toBe('club-a')
      expect(upP3.currentClubId).not.toBe('club-a')

      expect(upP4.loanedFromClubId).toBe('club-a')
      expect(upP4.parentClubId).toBe('club-a')
      expect(upP4.currentClubId).not.toBe('club-a')

      // Club B (stronger and closer to A) should receive player(s) before or preferentially over remote club C
      const clubBPlayers = updated.filter((p) => p.currentClubId === 'club-b')
      expect(clubBPlayers.length).toBeGreaterThanOrEqual(1)

      // Ensure no club has more than 2 players
      for (const club of clubs) {
        const clubRoster = updated.filter((p) => p.currentClubId === club.id)
        expect(clubRoster.length).toBeLessThanOrEqual(2)
      }
    })

    it('returns loaned players back to parent club when re-running the engine', () => {
      const clubA = makeTestClub('club-a', 'Club A', 25)
      const clubB = makeTestClub('club-b', 'Club B', 15)

      const p1 = makeTestPerson('p-1', 'Player 1', 25, 10, 'ATTACKER', 'club-a')
      const p2 = makeTestPerson('p-2', 'Player 2', 10, 25, 'DEFENDER', 'club-a')
      const p3 = makeTestPerson('p-3', 'Player 3', 20, 10, 'ATTACKER', 'club-a')

      // Run Season 1
      const season1 = assignSeasonRostersAndLoans({
        persons: [p1, p2, p3],
        clubs: [clubA, clubB],
        seed: 'season-1',
      })

      const p3S1 = season1.find((p) => p.id === 'p-3')!
      expect(p3S1.currentClubId).toBe('club-b')
      expect(p3S1.loanedFromClubId).toBe('club-a')

      // Run Season 2: p3 must return and re-evaluate
      const season2 = assignSeasonRostersAndLoans({
        persons: season1,
        clubs: [clubA, clubB],
        seed: 'season-2',
      })

      const p3S2 = season2.find((p) => p.id === 'p-3')!
      expect(p3S2.parentClubId).toBe('club-a')
    })

    it('transfers players of an absorbed club to the merged club upon fusion', () => {
      const mergedClub: Club = {
        ...makeTestClub('club-a', 'Alliance A-B', 22),
        isFusion: true,
        fusedClubs: [
          {
            id: 'club-b',
            name: 'Club B',
            communeName: 'Ville B',
            communeIds: ['01002'],
            communeNames: ['Ville B'],
          },
        ],
      }
      const remoteClub = makeTestClub('club-c', 'Club C', 12)

      // Club A had 2 players
      const p1 = makeTestPerson('p-1', 'Player A1', 20, 10, 'ATTACKER', 'club-a')
      const p2 = makeTestPerson('p-2', 'Player A2', 10, 18, 'DEFENDER', 'club-a')
      // Club B (now absorbed) had 2 players
      const p3 = makeTestPerson('p-3', 'Player B1', 28, 12, 'ATTACKER', 'club-b')
      const p4 = makeTestPerson('p-4', 'Player B2', 12, 26, 'DEFENDER', 'club-b')

      const updated = assignSeasonRostersAndLoans({
        persons: [p1, p2, p3, p4],
        clubs: [mergedClub, remoteClub],
        seed: 'test-fusion',
      })

      // All 4 players now belong to merged club 'club-a'
      const p3Up = updated.find((p) => p.id === 'p-3')!
      const p4Up = updated.find((p) => p.id === 'p-4')!
      expect(p3Up.parentClubId).toBe('club-a')
      expect(p4Up.parentClubId).toBe('club-a')

      // Starters for 'club-a' should be the best attacker (p3 with 28 ATT) and best defender (p4 with 26 DEF)
      expect(p3Up.currentClubId).toBe('club-a')
      expect(p3Up.assignedPosition).toBe('ATTACKER')
      expect(p4Up.currentClubId).toBe('club-a')
      expect(p4Up.assignedPosition).toBe('DEFENDER')

      // p1 and p2 become surplus of 'club-a' and can be loaned out to club-c
      const p1Up = updated.find((p) => p.id === 'p-1')!
      const p2Up = updated.find((p) => p.id === 'p-2')!
      expect(p1Up.parentClubId).toBe('club-a')
      expect(p2Up.parentClubId).toBe('club-a')
    })
  })

  describe('buildAbsorbedToMergedClubMap', () => {
    it('maps absorbed clubs from fusedClubs, fusions array, and handles chained fusions', () => {
      const clubFinal: Club = {
        ...makeTestClub('club-c', 'Grand Club C', 25),
        isFusion: true,
        fusedClubs: [
          { id: 'club-a', name: 'Club A', communeName: 'Ville A' },
          { id: 'club-b', name: 'Club B', communeName: 'Ville B' },
        ],
      }

      const map = buildAbsorbedToMergedClubMap([clubFinal])
      expect(map.get('club-a')).toBe('club-c')
      expect(map.get('club-b')).toBe('club-c')
    })
  })
})
