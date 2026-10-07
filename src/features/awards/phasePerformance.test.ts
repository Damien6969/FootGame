import { describe, expect, it } from 'vitest'
import { computeSeasonAwards } from './seasonAwards'
import { player, match, finishedSession } from './awards.fixture'

const winner = (session: ReturnType<typeof finishedSession>, id: string) =>
  computeSeasonAwards(session)!.awards.find(a => a.id === id)!.winners[0]

describe('phase-aware performance awards', () => {
  it('values the same attacking and defensive actions more in advanced rounds', () => {
    const early = player('early', 'a'), late = player('late', 'b')
    const history = [early, late].flatMap(p => [0, 1, 2, 3].map(i => ({
      ...match(`${p.id}-${i}`, [p], 2, 2), roundNumber: p === early ? 1 : 9,
    })))
    const session = finishedSession([early, late], history)
    expect(winner(session, 'best-attacker').personId).toBe('late')
    const scores = computeSeasonAwards(session)!.awards.find(a => a.id === 'ballon-or')!.nominees
    expect(scores.find(p => p.personId === 'late')!.defenseScore).toBeGreaterThan(scores.find(p => p.personId === 'early')!.defenseScore)
  })

  it('attenuates a departmental ten-goal match while keeping all ten goals for the Soulier', () => {
    const flash = player('flash', 'a'), regular = player('regular', 'b')
    const history = [0, 1, 2, 3].flatMap(i => [
      match(`flash-${i}`, [flash], i === 0 ? 10 : 0, 0),
      { ...match(`regular-${i}`, [regular], 2, 0), roundNumber: 5 },
    ])
    const session = finishedSession([flash, regular], history)
    expect(winner(session, 'best-attacker').personId).toBe('regular')
    expect(winner(session, 'top-scorer').personId).toBe('flash')
    expect(winner(session, 'top-scorer').goals).toBe(10)
  })

  it('rewards a sustained final run over twice as many actions per match in a regional run', () => {
    for (const position of ['ATTACKER', 'DEFENDER'] as const) {
      const early = player('early', 'a', position), late = player('late', 'b', position)
      const history = [early, late].flatMap(p => Array.from({ length: p === early ? 6 : 14 }, (_, i) => ({
        ...match(`${p.id}-${i}`, [p], p === early ? 2 : 1, p === early ? 2 : 1), roundNumber: i + 1,
      })))
      const session = finishedSession([early, late], history)
      expect(winner(session, position === 'ATTACKER' ? 'best-attacker' : 'best-defender').personId).toBe('late')
      expect(winner(session, 'ballon-or').personId).toBe('late')
      expect(winner(session, 'top-stops').personId).toBe('late')
    }
  })

  it('keeps an exceptional short run eligible without a minimum elimination round', () => {
    const early = player('early', 'a', 'DEFENDER'), late = player('late', 'b', 'DEFENDER')
    const history = [early, late].flatMap(p => Array.from({ length: p === early ? 7 : 14 }, (_, i) => ({
      ...match(`${p.id}-${i}`, [p], 0, p === early ? 40 : 1), roundNumber: i + 1,
    })))
    expect(winner(finishedSession([early, late], history), 'best-defender').personId).toBe('early')
  })

  it('counts a duplicated final once in performance as well as raw statistics', () => {
    const p = player('p', 'a')
    const final = { ...match('final', [p], 8, 8), roundNumber: 14 }
    const session = finishedSession([p], [match('one', [p]), match('two', [p]), final])
    expect(computeSeasonAwards({ ...session, history: [...session.history, final] })).toEqual(computeSeasonAwards(session))
  })
  it('uses the actual phase when an evolved tournament shifts the usual round numbers', () => {
    const department = player('department', 'a'), region = player('region', 'b')
    const history = [department, region].flatMap(p => [0, 1, 2, 3].map(i => ({
      ...match(`${p === department ? 'DEPARTMENT' : 'REGION'}:5:${i}`, [p], 2, 2), roundNumber: 5,
    })))
    const session = finishedSession([department, region], history)
    const nominees = computeSeasonAwards(session)!.awards.find(a => a.id === 'ballon-or')!.nominees
    expect(nominees.find(p => p.personId === 'region')!.attackScore).toBeGreaterThan(nominees.find(p => p.personId === 'department')!.attackScore)
  })
  it('prefers a sustained record to a marginally better average over just four matches', () => {
    const short = player('short', 'a'), sustained = player('sustained', 'b')
    const history = [short, sustained].flatMap(p => Array.from({ length: p === short ? 4 : 8 }, (_, i) =>
      match(`${p.id}-${i}`, [p], p === short && i === 0 ? 2 : 1, 0)))
    expect(winner(finishedSession([short, sustained], history), 'best-attacker').personId).toBe('sustained')
  })
})
