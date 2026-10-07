import type { Person } from './types'
import type { MatchResult } from '../match/simulateMatch'
import { selectClubStarters } from './playerSelection'
import type { CupSession, SeasonArchive } from '../storage/cupRepository'

type PlayedMatch = { homeTeamId: string; awayTeamId: string; roundNumber?: number; result?: MatchResult }
export type PlayerSeasonStatistics = {
  isStarter: boolean
  matchesPlayed: number
  goals: number
  defensiveStops: number
  shots: number
  shotsMissed: number
}

/** Même composition et même décompte pour l'écran, les archives et les carrières. */
export function collectPlayerSeasonStatistics(
  matches: readonly PlayedMatch[],
  persons: readonly Person[],
  onPlayerMatch?: (personId: string, stats: PlayerSeasonStatistics, match: PlayedMatch) => void,
): Map<string, PlayerSeasonStatistics> {
  const byClub = new Map<string, Person[]>()
  const statistics = new Map<string, PlayerSeasonStatistics>()
  for (const person of persons) {
    if (person.isRetired || person.primaryRole !== 'PLAYER') continue
    statistics.set(person.id, { isStarter: false, matchesPlayed: 0, goals: 0, defensiveStops: 0, shots: 0, shotsMissed: 0 })
    if (!person.currentClubId) continue
    const roster = byClub.get(person.currentClubId) ?? []
    roster.push(person)
    byClub.set(person.currentClubId, roster)
  }
  const starters = new Map<string, string[]>()
  for (const [clubId, roster] of byClub) {
    const pair = selectClubStarters(roster, true)
    const ids = [pair.attacker, pair.defender].filter((p): p is Person => p !== null).map(p => p.id)
    starters.set(clubId, ids)
    for (const id of ids) statistics.get(id)!.isStarter = true
  }
  const counted = new Set<string>()
  for (const match of matches) {
    const result = match.result
    if (!result || counted.has(result.matchId)) continue
    counted.add(result.matchId)
    const playingIds = new Set([...(starters.get(match.homeTeamId) ?? []), ...(starters.get(match.awayTeamId) ?? [])])
    const perMatch = onPlayerMatch ? new Map([...playingIds].map(id => [id, {
      isStarter: true, matchesPlayed: 1, goals: 0, defensiveStops: 0, shots: 0, shotsMissed: 0,
    }])) : undefined
    for (const id of playingIds) statistics.get(id)!.matchesPlayed++
    for (const event of result.events ?? []) {
      if (event.actorId && playingIds.has(event.actorId)) {
        for (const stats of [statistics.get(event.actorId)!, perMatch?.get(event.actorId)]) {
          if (!stats) continue
          stats.shots++
          if (event.kind === 'GOAL') stats.goals++
          else stats.shotsMissed++
        }
      }
      if (event.defenderId && playingIds.has(event.defenderId)) {
        statistics.get(event.defenderId)!.defensiveStops++
        const local = perMatch?.get(event.defenderId)
        if (local) local.defensiveStops++
      }
    }
    if (perMatch && onPlayerMatch) for (const [id, stats] of perMatch) onPlayerMatch(id, stats, match)
  }
  return statistics
}

// Les sessions et archives sont immuables : partager le calcul entre les fiches
// évite de reparcourir tous les matchs pour chaque joueur d'un tableau.
const archiveCache = new WeakMap<SeasonArchive, Map<string, PlayerSeasonStatistics>>()
const sessionCache = new WeakMap<CupSession, Map<string, PlayerSeasonStatistics>>()

export function getArchivedPlayerStatistics(archive: SeasonArchive, person: Person): PlayerSeasonStatistics | undefined {
  let stats = archiveCache.get(archive)
  if (!stats) {
    const personsList = archive.persons && archive.persons.length > 0 ? archive.persons : [person]
    stats = collectPlayerSeasonStatistics(archive.history ?? [], personsList)
    archiveCache.set(archive, stats)
  } else if (!stats.has(person.id) && (!archive.persons || archive.persons.length === 0)) {
    const singleStats = collectPlayerSeasonStatistics(archive.history ?? [], [person])
    const pStat = singleStats.get(person.id)
    if (pStat) stats.set(person.id, pStat)
  }
  return stats.get(person.id)
}

export function getActivePlayerStatistics(session: CupSession, person: Person): PlayerSeasonStatistics | undefined {
  let stats = session.persons ? sessionCache.get(session) : undefined
  if (!stats) {
    const matches = [
      ...session.history,
      ...(session.round?.matches ?? []).map(m => ({ ...m, result: session.results?.[m.id] })),
    ]
    stats = collectPlayerSeasonStatistics(matches, session.persons ?? [person])
    if (session.persons) sessionCache.set(session, stats)
  }
  return stats.get(person.id)
}
