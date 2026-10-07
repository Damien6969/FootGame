import type { MatchEvent } from './simulateMatch'

export function replayState(events: readonly MatchEvent[], revealed: number, homeId: string, awayId: string) {
  const visible = events.slice(0, revealed)
  return {
    homeScore: visible.filter((event) => event.kind === 'GOAL' && event.teamId === homeId).length,
    awayScore: visible.filter((event) => event.kind === 'GOAL' && event.teamId === awayId).length,
    events: visible,
  }
}

export function visibleEventCount(finished: boolean, revealed: number, total: number) {
  return finished && revealed < 0 ? total : Math.max(0, revealed)
}
