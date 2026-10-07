import { describe, expect, it } from 'vitest'
import type { CupSession } from '../storage/cupRepository'
import { getRoundViews, findMatchContext, getHeadToHead } from './cupSelectors'

const result = { matchId: 'DEPARTMENT:1:01:1', homeScore: 2, awayScore: 1, winnerId: 'a', events: [] }
const session: CupSession = {
  id: 'active', seed: 's', datasetVersion: 'v', activeTeamIds: ['a'], roundNumber: 2,
  round: { matches: [{ id: 'REGION:2:84:1', homeTeamId: 'a', awayTeamId: 'c' }], byeTeamIds: [] }, results: {},
  history: [{ roundNumber: 1, homeTeamId: 'a', awayTeamId: 'b', result }],
}

describe('cup selectors', () => {
  it('reconstructs previous rounds and keeps the current round', () => {
    const rounds = getRoundViews(session)
    expect(rounds.map((round) => [round.number, round.phase, round.isCurrent])).toEqual([
      [1, 'DEPARTMENT', false], [2, 'REGION', true],
    ])
  })

  it('finds archived and current match contexts', () => {
    expect(findMatchContext(session, 'DEPARTMENT:1:01:1')?.result?.homeScore).toBe(2)
    expect(findMatchContext(session, 'REGION:2:84:1')?.result).toBeUndefined()
  })

  it('finds previous head-to-head matches regardless of home side', () => {
    expect(getHeadToHead(session, 'b', 'a').map((match) => match.match.id)).toEqual(['DEPARTMENT:1:01:1'])
  })

  it('reconstructs previous round byes from session.roundByes', () => {
    const sessionWithByes: CupSession = {
      ...session,
      roundByes: { 1: ['exempt-1', 'exempt-2'] },
    }
    const rounds = getRoundViews(sessionWithByes)
    const round1 = rounds.find((r) => r.number === 1)
    expect(round1?.byeTeamIds).toEqual(['exempt-1', 'exempt-2'])
  })
})
