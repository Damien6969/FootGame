import type { CupSession } from '../storage/cupRepository'
import type { Person } from '../persons/types'
import type { Club } from '../teams/types'
import { collectPlayerSeasonStatistics } from '../persons/playerStatistics'
import { compareVolume } from '../awards/seasonAwards'

export type ScorerStat = Readonly<{
  person: Person
  club?: Club
  clubName: string
  goals: number
  shots: number
  shotsMissed: number
  matchesPlayed: number
  conversionRate: number // pourcentage (ex: 45.2)
  goalsPerMatch: number
}>

export type DefenderStat = Readonly<{
  person: Person
  club?: Club
  clubName: string
  defensiveStops: number
  matchesPlayed: number
  stopsPerMatch: number
}>

export type CompetitionStatsSummary = Readonly<{
  topScorers: readonly ScorerStat[]
  topDefenders: readonly DefenderStat[]
  totalMatches: number
  totalGoals: number
  totalShots: number
  totalDefensiveStops: number
  personalityGoals: number
  collectiveGoals: number
}>

/** Même source de statistiques individuelles pour les classements et les trophées. */
export function computeCompetitionStats(
  session: CupSession,
  persons: readonly Person[],
  clubsById?: Map<string, Club>,
): CompetitionStatsSummary {
  const matches = [...new Map([
    ...session.history,
    ...session.round.matches.flatMap(m => session.results[m.id] ? [{ ...m, result: session.results[m.id] }] : []),
  ].map(m => [m.result.matchId, m])).values()]
  const statistics = collectPlayerSeasonStatistics(matches, persons)
  let totalGoals = 0, totalShots = 0, totalDefensiveStops = 0, personalityGoals = 0, collectiveGoals = 0
  for (const match of matches) for (const event of match.result.events) {
    if (event.kind === 'GOAL') {
      totalGoals++
      if (event.actorId) personalityGoals++
      else collectiveGoals++
    }
    if (event.actorId) totalShots++
    if (event.defenderId) totalDefensiveStops++
  }
  const topScorers: ScorerStat[] = []
  const topDefenders: DefenderStat[] = []
  for (const person of persons) {
    const s = statistics.get(person.id)
    if (!s?.matchesPlayed) continue
    const club = person.currentClubId ? clubsById?.get(person.currentClubId) : undefined
    const clubName = club?.name ?? person.birthCommuneName
    if (s.goals > 0) topScorers.push({ person, club, clubName, goals: s.goals, shots: s.shots,
      shotsMissed: s.shotsMissed, matchesPlayed: s.matchesPlayed,
      conversionRate: s.shots > 0 ? Math.round(s.goals / s.shots * 1000) / 10 : 0,
      goalsPerMatch: Math.round(s.goals / s.matchesPlayed * 100) / 100 })
    if (s.defensiveStops > 0) topDefenders.push({ person, club, clubName,
      defensiveStops: s.defensiveStops, matchesPlayed: s.matchesPlayed,
      stopsPerMatch: Math.round(s.defensiveStops / s.matchesPlayed * 100) / 100 })
  }
  topScorers.sort((a, b) => compareVolume({ ...a, personId: a.person.id }, { ...b, personId: b.person.id }, a.goals, b.goals))
  topDefenders.sort((a, b) => compareVolume({ ...a, personId: a.person.id }, { ...b, personId: b.person.id }, a.defensiveStops, b.defensiveStops))
  return { topScorers, topDefenders, totalMatches: matches.length, totalGoals, totalShots,
    totalDefensiveStops, personalityGoals, collectiveGoals }
}
