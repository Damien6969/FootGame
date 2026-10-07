import { describe, expect, it } from 'vitest'
import { computeSeasonAwards, scorePlayerPerformance, getSeasonAwards } from './seasonAwards'
import { player, match, finishedSession } from './awards.fixture'

describe('season awards', () => {
  it('scores specialists exclusively in their domain but rewards a complete player overall', () => {
    const base = { isStarter: true, matchesPlayed: 6, goals: 10, defensiveStops: 2, shots: 20, shotsMissed: 10 }
    const a = scorePlayerPerformance(base)
    expect(scorePlayerPerformance({ ...base, defensiveStops: 100 }).attack).toBe(a.attack)
    expect(scorePlayerPerformance({ ...base, goals: 0, shots: 0, shotsMissed: 0 }).defense).toBe(a.defense)
    expect(scorePlayerPerformance({ ...base, matchesPlayed: 10 })).toEqual(a)
  })
  it('excludes a one-match sensation from performance awards, but keeps the volume trophy', () => {
    const regular = player('regular', 'a'), flash = player('flash', 'b')
    const history = [...Array.from({ length: 6 }, (_, i) => match(`a${i}`, [regular], 2)), match('flash', [flash], 30)]
    const awards = computeSeasonAwards(finishedSession([regular, flash], history))!
    expect(awards.minimumMatches).toBe(3)
    expect(awards.awards.find(a => a.id === 'ballon-or')!.winners[0].personId).toBe('regular')
    expect(awards.awards.find(a => a.id === 'top-scorer')!.winners[0].personId).toBe('flash')
  })
  it('selects conference overall independently from its specialist team', () => {
    const pure = ['a', 'b', 'c'].map(id => player(`pure-${id}`, id))
    const complete = player('complete', 'd')
    const defense = player('defense', 'e', 'DEFENDER')
    const persons = [...pure, complete, defense]
    const history = persons.flatMap(p => Array.from({ length: 6 }, (_, i) => match(`${p.id}${i}`, [p], p === complete ? 8 : p === defense ? 0 : 10, p === complete || p === defense ? 10 : 0)))
    const snapshot = computeSeasonAwards(finishedSession(persons, history))!
    expect(snapshot.awards.find(a => a.id === 'conference-CONF_OUEST-player')!.winners[0].personId).toBe('complete')
    expect(snapshot.awards.find(a => a.id === 'conference-CONF_OUEST-defender')!.winners[0].personId).toBe('defense')
    expect(snapshot.awards.find(a => a.id === 'conference-CONF_OUEST-attacker')!.winners[0].personId).not.toBe('complete')
    expect(snapshot.awards.at(-1)!.id).toBe('ballon-or')
  })
  it('uses season age, effective position, clubs and deterministic ties without filling missing slots', () => {
    const young = { ...player('young', 'a', 'ATTACKER', 22), assignedPosition: 'DEFENDER' as const }
    const adult = player('adult', 'b', 'ATTACKER', 23)
    const senior = player('senior', 'a', 'ATTACKER', 28)
    const reserve = { ...player('reserve', 'a', 'DEFENDER', 21), defense: 1, attack: 1, assignedPosition: undefined }
    const session = finishedSession([young, adult, reserve, senior], [0, 1, 2].flatMap(i => [match(`y${i}`, [young]), match(`a${i}`, [adult])]))
    const snapshot = computeSeasonAwards(session)!
    expect(snapshot.awards.find(a => a.id === 'young-defender')!.winners[0].personId).toBe('young')
    expect(snapshot.awards.find(a => a.id === 'young-attacker')!.winners).toHaveLength(0)
    expect(computeSeasonAwards({ ...session, persons: [...session.persons!].reverse() })).toEqual(snapshot)
  })
  it('keeps jury variation small and stable and leaves volume awards factual', () => {
    const p = player('a', 'a'), q = player('b', 'b')
    const session = finishedSession([p, q], [0, 1, 2].flatMap(i => [match(`a${i}`, [p]), match(`b${i}`, [q])]))
    const snapshot = computeSeasonAwards(session)!
    for (const award of snapshot.awards) for (const winner of award.winners) {
      expect(Math.abs(winner.juryAdjustment!)).toBeLessThanOrEqual(0.02)
      if (award.metric === 'GOALS' || award.metric === 'STOPS') expect(winner.juryAdjustment).toBe(0)
    }
    expect(computeSeasonAwards(session)).toEqual(snapshot)
    expect(computeSeasonAwards({ ...session, seed: 'different-2026' })).not.toEqual(snapshot)
  })
  it('waits for completion, deduplicates final results and returns an existing immutable snapshot', () => {
    const p = player('winner', 'a')
    const final = { ...match('final', [p]), roundNumber: 14 }
    const session = { ...finishedSession([p], [match('m1', [p]), match('m2', [p]), final]),
      round: { matches: [{ id: 'final', homeTeamId: 'a', awayTeamId: 'opponent' }], byeTeamIds: [] }, results: { final: final.result } }
    expect(computeSeasonAwards({ ...session, championId: undefined, roundNumber: 2, history: [], results: {} })).toBeNull()
    const snapshot = computeSeasonAwards(session)!
    expect(snapshot.awards.find(a => a.id === 'ballon-or')!.winners[0].matchesPlayed).toBe(3)
    expect(getSeasonAwards({ ...session, individualAwards: snapshot, persons: [] })).toBe(snapshot)
    expect(computeSeasonAwards({ ...session, championId: undefined })).toEqual(snapshot)
  })
  it('isolates conferences and never invents eligible players for empty categories or old archives', () => {
    const p = player('west', 'a'), q = player('north', 'b', 'DEFENDER')
    const session = { ...finishedSession([p, q], [0, 1, 2].flatMap(i => [match(`a${i}`, [p]), match(`b${i}`, [q])])),
      clubs: [{ ...finishedSession([p], []).clubs![0], conferenceId: 'CONF_OUEST' }, { ...finishedSession([q], []).clubs![0], conferenceId: 'CONF_NORD' }] }
    const awards = computeSeasonAwards(session)!
    expect(awards.awards.find(a => a.id === 'conference-CONF_NORD-player')!.winners[0].personId).toBe('north')
    expect(awards.awards.find(a => a.id === 'conference-CONF_OUEST-attacker')!.winners.map(p => p.personId)).toEqual(['west'])
    expect(computeSeasonAwards({ ...session, history: [match('only', [p])] })!.awards.find(a => a.id === 'ballon-or')!.winners).toHaveLength(0)
    expect(computeSeasonAwards({ ...session, persons: undefined })).toBeNull()
    const absentConference = computeSeasonAwards({ ...session, history: [0, 1, 2].map(i => match(`west${i}`, [p])) })!
    expect(absentConference.awards.find(a => a.id === 'conference-CONF_NORD-player')?.winners).toEqual([])
  })
})
