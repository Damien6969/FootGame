import { describe, expect, it } from 'vitest'
import { replayState, visibleEventCount } from './matchReplay'

describe('match replay', () => {
  const events = [
    { sequence: 1, teamId: 'a', kind: 'CHANCE' as const },
    { sequence: 2, teamId: 'b', kind: 'GOAL' as const },
    { sequence: 3, teamId: 'a', kind: 'GOAL' as const },
  ]

  it('reveals score only as goals become visible', () => {
    expect(replayState(events, 1, 'a', 'b')).toEqual({ homeScore: 0, awayScore: 0, events: events.slice(0, 1) })
    expect(replayState(events, 2, 'a', 'b')).toEqual({ homeScore: 0, awayScore: 1, events: events.slice(0, 2) })
    expect(replayState(events, 3, 'a', 'b')).toEqual({ homeScore: 1, awayScore: 1, events })
  })

  it('distinguishes an unopened finished match from a replay at zero', () => {
    expect(visibleEventCount(true, -1, 18)).toBe(18)
    expect(visibleEventCount(true, 0, 18)).toBe(0)
    expect(visibleEventCount(false, -1, 18)).toBe(0)
  })
})
