import { describe, expect, it } from 'vitest'
import { allocateQuotas, createInitialRound, createPhaseRound } from './competition'
import round4Counts from '../../test/fixtures/department-round4-2038.json'

describe('competition', () => {
  it('qualifies exactly 256 clubs per conference after round 4 of the 2038 career', () => {
    const teams = round4Counts.flatMap(group => Array.from({ length: group.teamCount }, (_, i) => ({
      ...group, id: `${group.departmentId}-${i}`,
    })))
    const byId = new Map(teams.map(team => [team.id, team]))
    const round = createPhaseRound(teams, 'tournoi-2038', 4)
    const participants = [...round.byeTeamIds, ...round.matches.flatMap(m => [m.homeTeamId, m.awayTeamId])]
    expect(participants).toHaveLength(teams.length)
    expect(new Set(participants).size).toBe(teams.length)
    for (const side of ['homeTeamId', 'awayTeamId'] as const) {
      const winners = [...round.byeTeamIds, ...round.matches.map(m => m[side])]
      expect(winners).toHaveLength(1024)
      for (const conferenceId of new Set(teams.map(t => t.conferenceId))) {
        expect(winners.filter(id => byId.get(id)!.conferenceId === conferenceId)).toHaveLength(256)
      }
    }
  })
  it('makes a lone Paris club play an Ile-de-France opponent without changing the number of survivors', () => {
    const paris = { id: 'paris', departmentId: '75', regionId: '11' }
    const neighbors = Array.from({ length: 20 }, (_, i) => ({ id: `neighbor-${i}`, departmentId: '92', regionId: '11' }))
    const others = Array.from({ length: 1980 }, (_, i) => ({ id: `other-${i}`, departmentId: '01', regionId: '84' }))
    const teams = [paris, ...neighbors, ...others]
    const round = createPhaseRound(teams, 'paris-seed', 1)
    const parisMatch = round.matches.find((match) => match.homeTeamId === paris.id || match.awayTeamId === paris.id)
    expect(parisMatch).toBeDefined()
    expect([parisMatch!.homeTeamId, parisMatch!.awayTeamId].some((id) => id.startsWith('neighbor-'))).toBe(true)
    expect(round.byeTeamIds).not.toContain(paris.id)
    const participants = [...round.byeTeamIds, ...round.matches.flatMap((match) => [match.homeTeamId, match.awayTeamId])]
    expect(new Set(participants).size).toBe(teams.length)
    expect(participants).toHaveLength(teams.length)
    expect(round.byeTeamIds.length + round.matches.length).toBeGreaterThanOrEqual(1024)
    const hostDepartment = teams.find((team) => team.id === parisMatch!.awayTeamId)!.departmentId
    const otherWinners = round.matches.filter((match) => match !== parisMatch).map((match) => match.homeTeamId)
    const survivorsIfParisWins = [...round.byeTeamIds, ...otherWinners, paris.id]
    const survivorsIfParisLoses = [...round.byeTeamIds, ...otherWinners, parisMatch!.awayTeamId]
    expect(survivorsIfParisWins).toHaveLength(survivorsIfParisLoses.length)
    expect(survivorsIfParisLoses).not.toContain(paris.id)
    const hostCount = (ids: string[]) => ids.filter((id) => teams.find((team) => team.id === id)!.departmentId === hostDepartment).length
    expect(hostCount(survivorsIfParisLoses)).toBe(hostCount(survivorsIfParisWins) + 1)
  })

  it('prevents multiple Paris (75) clubs from playing each other in departmental rounds and pairs them with Ile-de-France opponents', () => {
    const paris1 = { id: 'paris-1', departmentId: '75', regionId: '11' }
    const paris2 = { id: 'paris-2', departmentId: '75', regionId: '11' }
    const paris3 = { id: 'paris-3', departmentId: '75', regionId: '11' }
    const neighbors92 = Array.from({ length: 30 }, (_, i) => ({ id: `neighbor-92-${i}`, departmentId: '92', regionId: '11' }))
    const neighbors93 = Array.from({ length: 30 }, (_, i) => ({ id: `neighbor-93-${i}`, departmentId: '93', regionId: '11' }))
    const others = Array.from({ length: 1937 }, (_, i) => ({ id: `other-${i}`, departmentId: '01', regionId: '84' }))
    const teams = [paris1, paris2, paris3, ...neighbors92, ...neighbors93, ...others]

    const round = createPhaseRound(teams, 'multi-paris-seed', 1)

    // No match should ever pit two 75 clubs against each other
    const teamById = new Map(teams.map((t) => [t.id, t]))
    const parisVsParisMatch = round.matches.find((m) => {
      const home = teamById.get(m.homeTeamId)
      const away = teamById.get(m.awayTeamId)
      return home?.departmentId === '75' && away?.departmentId === '75'
    })
    expect(parisVsParisMatch).toBeUndefined()

    // Each Paris club that plays must face an Ile-de-France opponent (regionId 11, dept != 75)
    const parisIds = ['paris-1', 'paris-2', 'paris-3']
    for (const pId of parisIds) {
      const match = round.matches.find((m) => m.homeTeamId === pId || m.awayTeamId === pId)
      if (match) {
        const opponentId = match.homeTeamId === pId ? match.awayTeamId : match.homeTeamId
        const opponent = teamById.get(opponentId)!
        expect(opponent.regionId).toBe('11')
        expect(opponent.departmentId).not.toBe('75')
      }
    }

    // Number of participants must cover all teams without duplication
    const participants = [...round.byeTeamIds, ...round.matches.flatMap((m) => [m.homeTeamId, m.awayTeamId])]
    expect(new Set(participants).size).toBe(teams.length)
    expect(participants).toHaveLength(teams.length)
  })

  it('allocates an exact proportional quota', () => {
    expect(allocateQuotas([{ territoryId: 'A', teamCount: 50 }, { territoryId: 'B', teamCount: 30 }, { territoryId: 'C', teamCount: 20 }], 10))
      .toEqual([{ territoryId: 'A', slots: 5 }, { territoryId: 'B', slots: 3 }, { territoryId: 'C', slots: 2 }])
  })

  it('creates deterministic departmental matches and byes', () => {
    const teams = Array.from({ length: 7 }, (_, index) => ({ id: String(index), departmentId: '01' }))
    const round = createInitialRound(teams, 'seed')
    expect(round.matches).toHaveLength(3)
    expect(round.byeTeamIds).toHaveLength(1)
    expect(createInitialRound(teams, 'seed')).toEqual(round)
  })

  it('preserves tournament tree bracket pairings across conference rounds 9 to 12 without reshuffling', () => {
    // 16 teams in CONF_NORD entering round 9
    const confTeams = Array.from({ length: 16 }, (_, i) => ({
      id: `nord-${i + 1}`,
      departmentId: '59',
      regionId: '32',
      conferenceId: 'CONF_NORD',
    }))
    // Round 9: Initial draw
    const round9 = createPhaseRound(confTeams, 'fixed-seed', 9)
    expect(round9.matches).toHaveLength(8)

    // Round 10: Winners of M1 and M2 must play in Q1, M3 and M4 in Q2, etc.
    const round9Winners = round9.matches.map((m) => confTeams.find((t) => t.id === m.homeTeamId)!)
    const round10 = createPhaseRound(round9Winners, 'another-seed', 10)
    expect(round10.matches).toHaveLength(4)
    expect(round10.matches[0].homeTeamId).toBe(round9Winners[0].id)
    expect(round10.matches[0].awayTeamId).toBe(round9Winners[1].id)
    expect(round10.matches[1].homeTeamId).toBe(round9Winners[2].id)
    expect(round10.matches[1].awayTeamId).toBe(round9Winners[3].id)
    expect(round10.matches[2].homeTeamId).toBe(round9Winners[4].id)
    expect(round10.matches[2].awayTeamId).toBe(round9Winners[5].id)
    expect(round10.matches[3].homeTeamId).toBe(round9Winners[6].id)
    expect(round10.matches[3].awayTeamId).toBe(round9Winners[7].id)

    // Round 11: Semi-finals
    const round10Winners = round10.matches.map((m) => round9Winners.find((t) => t.id === m.homeTeamId)!)
    const round11 = createPhaseRound(round10Winners, 'another-seed-2', 11)
    expect(round11.matches).toHaveLength(2)
    expect(round11.matches[0].homeTeamId).toBe(round10Winners[0].id)
    expect(round11.matches[0].awayTeamId).toBe(round10Winners[1].id)
    expect(round11.matches[1].homeTeamId).toBe(round10Winners[2].id)
    expect(round11.matches[1].awayTeamId).toBe(round10Winners[3].id)

    // Round 12: Conference Final
    const round11Winners = round11.matches.map((m) => round10Winners.find((t) => t.id === m.homeTeamId)!)
    const round12 = createPhaseRound(round11Winners, 'another-seed-3', 12)
    expect(round12.matches).toHaveLength(1)
    expect(round12.matches[0].homeTeamId).toBe(round11Winners[0].id)
    expect(round12.matches[0].awayTeamId).toBe(round11Winners[1].id)
  })

  it('allocates byes in preliminary round 1 so subsequent rounds divide evenly with zero byes', () => {
    // 200 teams in dept 01, target is proportional in a multi-department setup
    // In our official dataset, dept 01 has 200 communes, quota 41
    const deptTeams = Array.from({ length: 200 }, (_, i) => ({
      id: `team-${i + 1}`,
      departmentId: '01',
      regionId: '84',
      zoneId: 'SUD_EST',
    }))
    // Complement with teams in other departments to simulate Department phase with 10,031 teams
    const otherTeams = Array.from({ length: 9831 }, (_, i) => ({
      id: `other-${i + 1}`,
      departmentId: '02',
      regionId: '32',
      zoneId: 'NORD',
    }))
    const allTeams = [...deptTeams, ...otherTeams]

    // Round 1: Cadrage
    const round1 = createPhaseRound(allTeams, 'test-seed', 1)
    const dept1Matches = round1.matches.filter((m) => m.homeTeamId.startsWith('team-'))
    const dept1Byes = round1.byeTeamIds.filter((id) => id.startsWith('team-'))
    // 200 teams -> quota 20 (proportional for target 1024) -> targetRemaining = 20 * 8 = 160 -> 40 matches (80 playing) + 120 byes
    expect(dept1Matches).toHaveLength(40)
    expect(dept1Byes).toHaveLength(120)

    // Simulate Round 1 winners for dept 01
    const survivors1 = [
      ...dept1Byes.map((id) => allTeams.find((t) => t.id === id)!),
      ...dept1Matches.map((m) => allTeams.find((t) => t.id === m.homeTeamId)!),
    ]
    expect(survivors1).toHaveLength(160)

    // Round 2: Pure knockout halving with 0 byes (160 -> 80)
    const round2 = createPhaseRound(survivors1.concat(otherTeams.slice(0, 8000)), 'test-seed', 2)
    const dept2Matches = round2.matches.filter((m) => m.homeTeamId.startsWith('team-'))
    const dept2Byes = round2.byeTeamIds.filter((id) => id.startsWith('team-'))
    expect(dept2Matches).toHaveLength(80)
    expect(dept2Byes).toHaveLength(0)

    // Simulate Round 2 winners for dept 01
    const survivors2 = dept2Matches.map((m) => allTeams.find((t) => t.id === m.homeTeamId)!)
    expect(survivors2).toHaveLength(80)

    // Round 3: Pure knockout halving with 0 byes (80 -> 40)
    const round3 = createPhaseRound(survivors2.concat(otherTeams.slice(0, 4000)), 'test-seed', 3)
    const dept3Matches = round3.matches.filter((m) => m.homeTeamId.startsWith('team-'))
    const dept3Byes = round3.byeTeamIds.filter((id) => id.startsWith('team-'))
    expect(dept3Matches).toHaveLength(40)
    expect(dept3Byes).toHaveLength(0)

    // Simulate Round 3 winners for dept 01
    const survivors3 = dept3Matches.map((m) => allTeams.find((t) => t.id === m.homeTeamId)!)
    expect(survivors3).toHaveLength(40)

    // Round 4: Finales départementales, pure knockout halving with 0 byes (40 -> 20)
    const round4 = createPhaseRound(survivors3.concat(otherTeams.slice(0, 2000)), 'test-seed', 4)
    const dept4Matches = round4.matches.filter((m) => m.homeTeamId.startsWith('team-'))
    const dept4Byes = round4.byeTeamIds.filter((id) => id.startsWith('team-'))
    expect(dept4Matches).toHaveLength(20)
    expect(dept4Byes).toHaveLength(0)
  })
})
