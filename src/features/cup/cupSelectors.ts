import type { CompetitionPhase, DrawMatch } from '../competition/competition'
import type { MatchResult } from '../match/simulateMatch'
import type { CupSession } from '../storage/cupRepository'

export type RoundView = Readonly<{ number: number; phase: CompetitionPhase; matches: readonly DrawMatch[]; byeTeamIds: readonly string[]; results: Readonly<Record<string, MatchResult>>; isCurrent: boolean }>
export type MatchContext = Readonly<{ round: RoundView; match: DrawMatch; result?: MatchResult }>

const phaseOfMatch = (id: string): CompetitionPhase => {
  const phase = id.split(':')[0]
  return phase === 'DEPARTMENT' || phase === 'REGION' || phase === 'CONFERENCE' || phase === 'NATIONAL' ? phase : 'DEPARTMENT'
}

export function getRoundViews(session: CupSession): readonly RoundView[] {
  const archived = new Map<number, {
    number: number
    phase: CompetitionPhase
    matches: DrawMatch[]
    byeTeamIds: readonly string[]
    results: Record<string, MatchResult>
  }>()

  for (const item of session.history) {
    let roundData = archived.get(item.roundNumber)
    if (!roundData) {
      const phase = phaseOfMatch(item.result.matchId)
      roundData = {
        number: item.roundNumber,
        phase,
        matches: [],
        byeTeamIds: session.roundByes?.[item.roundNumber] ?? [],
        results: {},
      }
      archived.set(item.roundNumber, roundData)
    }
    roundData.matches.push({
      id: item.result.matchId,
      homeTeamId: item.homeTeamId,
      awayTeamId: item.awayTeamId,
    })
    roundData.results[item.result.matchId] = item.result
  }

  const archivedViews: RoundView[] = Array.from(archived.values()).map((r) => ({
    number: r.number,
    phase: r.phase,
    matches: r.matches,
    byeTeamIds: r.byeTeamIds,
    results: r.results,
    isCurrent: false,
  }))

  const current: RoundView = {
    number: session.roundNumber,
    phase: session.round.matches[0] ? phaseOfMatch(session.round.matches[0].id) : 'NATIONAL',
    matches: session.round.matches,
    byeTeamIds: session.round.byeTeamIds,
    results: session.results,
    isCurrent: !session.championId,
  }
  const previous = archivedViews.find((round) => round.number === current.number)
  const merged = previous ? {
    ...current,
    matches: [...new Map([...previous.matches, ...current.matches].map((match) => [match.id, match])).values()],
    results: { ...previous.results, ...current.results },
  } : current
  return [...archivedViews.filter((round) => round.number !== current.number), merged].sort((a, b) => a.number - b.number)
}

export function findMatchContext(session: CupSession, matchId: string): MatchContext | undefined {
  for (const round of getRoundViews(session)) {
    const match = round.matches.find((candidate) => candidate.id === matchId)
    if (match) return { round, match, result: round.results[matchId] }
  }
}

export function getHeadToHead(session: CupSession, firstId: string, secondId: string): readonly MatchContext[] {
  return getRoundViews(session).flatMap((round) => round.matches
    .filter((match) => (match.homeTeamId === firstId && match.awayTeamId === secondId) || (match.homeTeamId === secondId && match.awayTeamId === firstId))
    .filter((match) => Boolean(round.results[match.id]))
    .map((match) => ({ round, match, result: round.results[match.id] })))
}
