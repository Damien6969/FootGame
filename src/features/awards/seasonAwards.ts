import type { CupSession, SeasonArchive } from '../storage/cupRepository'
import { collectPlayerSeasonStatistics, type PlayerSeasonStatistics } from '../persons/playerStatistics'
import { selectClubStarters } from '../persons/playerSelection'
import type { Person, PlayerPosition } from '../persons/types'
import { createPrng } from '../random/prng'
import { conferenceLabel } from '../geography/territoryLabels'
import type { AwardPlayer, IndividualHonor, SeasonAward, SeasonAwards } from './types'

/** Contributions d'un match ; les statistiques brutes restent inchangées. */
export function scorePlayerPerformance(stats: PlayerSeasonStatistics, roundNumber = 1, phase?: string, isFinal = roundNumber >= 14) {
  const fallback = roundNumber >= 14 ? 4 : roundNumber >= 13 ? 3 : roundNumber >= 9 ? 2 : roundNumber >= 5 ? 0.75 : 0.25
  const coefficients: Record<string, number> = { DEPARTMENT: 0.25, REGION: 0.75, CONFERENCE: 2, NATIONAL: isFinal ? 4 : 3 }
  const coefficient = coefficients[phase ?? ''] ?? fallback
  const goals = Math.min(3, stats.goals) + Math.max(0, stats.goals - 3) * 0.25
  return {
    attack: coefficient * (2 + Math.max(0, 6 * goals - 0.25 * stats.shotsMissed + 10 * goals / (goals + stats.shotsMissed + 5))),
    defense: coefficient * (2 + 5 * stats.defensiveStops),
  }
}

export function isSeasonComplete(season: CupSession | SeasonArchive): boolean {
  if ('nationalChampionId' in season) return Boolean(season.nationalChampionId)
  return Boolean(season.championId || season.history.some(m => m.roundNumber === 14 && m.result.winnerId) ||
    (season.roundNumber === 14 && season.round.matches.length === 1 && season.results[season.round.matches[0].id]?.winnerId))
}

export function compareVolume(a: { matchesPlayed: number; personId: string }, b: { matchesPlayed: number; personId: string }, aTotal: number, bTotal: number): number {
  return bTotal - aTotal || b.matchesPlayed - a.matchesPlayed || a.personId.localeCompare(b.personId)
}

export function computeSeasonAwards(season: CupSession | SeasonArchive): SeasonAwards | null {
  if (!isSeasonComplete(season) || !season.persons?.length || ('summaryOnly' in season && season.summaryOnly)) return null
  const persons = season.persons
  const matches = 'round' in season
    ? [...season.history, ...season.round.matches.map(m => ({ ...m, roundNumber: season.roundNumber, result: season.results[m.id] }))]
    : season.history
  const contributions = new Map<string, { attack: number; defense: number }>()
  const finalRound = Math.max(0, ...matches.map(m => m.roundNumber ?? 0))
  const stats = collectPlayerSeasonStatistics(matches, persons, (id, local, match) => {
    const score = scorePlayerPerformance(local, match.roundNumber ?? 1, match.result?.matchId.split(':')[0], match.roundNumber === finalRound)
    const total = contributions.get(id) ?? { attack: 0, defense: 0 }
    total.attack += score.attack
    total.defense += score.defense
    contributions.set(id, total)
  })
  const clubs = new Map((season.clubs ?? []).map(c => [c.id, c]))
  const rosters = new Map<string, Person[]>()
  for (const p of persons) {
    if (!p.currentClubId || p.isRetired || p.primaryRole !== 'PLAYER') continue
    const roster = rosters.get(p.currentClubId) ?? []
    roster.push(p)
    rosters.set(p.currentClubId, roster)
  }
  const positions = new Map<string, PlayerPosition>()
  for (const roster of rosters.values()) {
    const pair = selectClubStarters(roster, true)
    if (pair.attacker) positions.set(pair.attacker.id, 'ATTACKER')
    if (pair.defender) positions.set(pair.defender.id, 'DEFENDER')
  }
  const nationalChampionId = ('nationalChampionId' in season ? season.nationalChampionId : season.championId)
    || matches.find(m => m.roundNumber === 14 && m.result?.winnerId)?.result.winnerId
    || ''
  const players: AwardPlayer[] = []
  for (const person of persons) {
    const s = stats.get(person.id)
    if (!s?.matchesPlayed || !person.currentClubId || !positions.has(person.id)) continue
    const club = clubs.get(person.currentClubId)
    const performance = 'teamPerformances' in season ? season.teamPerformances[person.currentClubId] : undefined
    const isChampion = Boolean(nationalChampionId && person.currentClubId === nationalChampionId) || Boolean(performance?.isNationalChampion)
    let eliminatedInRound = performance?.eliminatedInRound
    if (!isChampion && eliminatedInRound === undefined) {
      const loss = matches.find(m => (m.homeTeamId === person.currentClubId || m.awayTeamId === person.currentClubId) && m.result?.winnerId && m.result.winnerId !== person.currentClubId)
      if (loss) {
        eliminatedInRound = loss.roundNumber
      } else if (performance?.roundReached && !performance.isNationalChampion) {
        eliminatedInRound = performance.roundReached
      }
    }
    const eliminationStageLabel = isChampion
      ? 'Champion'
      : eliminatedInRound === 14
        ? 'Éliminé en finale'
        : eliminatedInRound === 13
          ? 'Éliminé au Tour 13'
          : eliminatedInRound
            ? `Éliminé au Tour ${eliminatedInRound}`
            : undefined
    const total = contributions.get(person.id)!
    // Accumulate performance over the full cup: late-round actions and sustained
    // runs matter, without imposing a minimum elimination round.
    const scores = total
    players.push({ personId: person.id, firstName: person.firstName, lastName: person.lastName,
      age: person.age, clubId: person.currentClubId, clubName: club?.name ?? performance?.clubName ?? person.birthCommuneName,
      conferenceId: club?.conferenceId ?? performance?.conferenceId ?? '', position: positions.get(person.id)!,
      matchesPlayed: s.matchesPlayed, goals: s.goals, defensiveStops: s.defensiveStops, shots: s.shots,
      shotsMissed: s.shotsMissed, attackScore: scores.attack, defenseScore: scores.defense, overallScore: 0,
      eliminatedInRound, eliminationStageLabel, isChampion })
  }
  const maximumMatches = players.reduce((n, p) => Math.max(n, p.matchesPlayed), 0)
  const minimumMatches = Math.max(3, Math.ceil(maximumMatches * 0.25))
  const eligible = players.filter(p => p.matchesPlayed >= minimumMatches)
  const maxAttack = Math.max(1, ...eligible.map(p => p.attackScore))
  const maxDefense = Math.max(1, ...eligible.map(p => p.defenseScore))
  for (const p of players) {
    // Ces objets sont de nouvelles projections ; aucune donnée de saison n'est mutée.
    const attackWeight = p.position === 'ATTACKER' ? 0.65 : 0.35
    ;(p as { overallScore: number }).overallScore = 100 * (attackWeight * p.attackScore / maxAttack + (1 - attackWeight) * p.defenseScore / maxDefense)
  }
  const awards: SeasonAward[] = []
  type Metric = Exclude<SeasonAward['metric'], 'TEAM'>
  function ranked(pool: readonly AwardPlayer[], id: string, metric: Metric): AwardPlayer[] {
    const performance = metric === 'ATTACK' || metric === 'DEFENSE' || metric === 'OVERALL'
    const key = metric === 'ATTACK' ? 'attackScore' : metric === 'DEFENSE' ? 'defenseScore' : metric === 'OVERALL' ? 'overallScore' : metric === 'GOALS' ? 'goals' : 'defensiveStops'
    return pool.map(p => {
      const juryAdjustment = performance ? (createPrng(`${season.seed}|awards-v1|${id}|${p.personId}`)() * 2 - 1) * 0.02 : 0
      return { ...p, juryAdjustment, awardScore: p[key] * (1 + juryAdjustment) }
    }).sort((a, b) => compareVolume(a, b, a.awardScore, b.awardScore))
  }
  function single(id: string, title: string, stage: SeasonAward['stage'], metric: Metric, pool: readonly AwardPlayer[], conferenceId?: string) {
    const sorted = ranked(pool, id, metric)
    awards.push({ id, title, stage, metric, conferenceId, winners: sorted.slice(0, 1),
      nominees: sorted.slice(0, 3).sort((a, b) => `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`, 'fr') || a.personId.localeCompare(b.personId)) })
  }
  const young = eligible.filter(p => p.age < 23)
  single('young-attacker', 'Meilleur attaquant espoir', 'YOUTH', 'ATTACK', young.filter(p => p.position === 'ATTACKER'))
  single('young-defender', 'Meilleur défenseur espoir', 'YOUTH', 'DEFENSE', young.filter(p => p.position === 'DEFENDER'))
  single('young-player', 'Meilleur espoir', 'YOUTH', 'OVERALL', young)
  const conferences = [...new Set([
    ...[...clubs.values()].map(c => c.conferenceId),
    ...('teamPerformances' in season ? Object.values(season.teamPerformances).map(p => p.conferenceId) : []),
    ...players.map(p => p.conferenceId),
  ].filter((id): id is string => Boolean(id)))].sort()
  for (const conferenceId of conferences) {
    const pool = eligible.filter(p => p.conferenceId === conferenceId)
    const prefix = `conference-${conferenceId}`
    const label = conferenceLabel(conferenceId)
    single(`${prefix}-defender`, `Meilleur défenseur · ${label}`, 'CONFERENCE', 'DEFENSE', pool.filter(p => p.position === 'DEFENDER'), conferenceId)
    single(`${prefix}-attacker`, `Meilleur attaquant · ${label}`, 'CONFERENCE', 'ATTACK', pool.filter(p => p.position === 'ATTACKER'), conferenceId)
    single(`${prefix}-player`, `Meilleur joueur · ${label}`, 'CONFERENCE', 'OVERALL', pool, conferenceId)
  }
  single('top-scorer', 'Soulier d’Or · Meilleur buteur', 'NATIONAL', 'GOALS', players.filter(p => p.goals > 0))
  single('top-stops', 'Bouclier d’Or · Roi des interventions', 'NATIONAL', 'STOPS', players.filter(p => p.defensiveStops > 0))
  single('best-defender', 'Meilleur défenseur de la saison', 'NATIONAL', 'DEFENSE', eligible.filter(p => p.position === 'DEFENDER'))
  single('best-attacker', 'Meilleur attaquant de la saison', 'NATIONAL', 'ATTACK', eligible.filter(p => p.position === 'ATTACKER'))
  single('ballon-or', 'Ballon d’Or', 'FINAL', 'OVERALL', eligible)
  const year = 'year' in season ? season.year : season.seasonYear ?? Number(season.seed.match(/\d{4}/)?.[0] ?? 2026)
  return { version: 1, scoringMethod: 'PHASE_TOTAL', year, minimumMatches, awards }
}

/**
 * Vérifie si une récompense ou distinction correspond à une ancienne « équipe-type ».
 */
export function isTeamAward(award: { metric?: string; id?: string; title?: string }): boolean {
  if (award.metric === 'TEAM') return true
  if (award.id && (award.id.endsWith('-team') || award.id.includes('team'))) return true
  if (award.title && /équipe[- ]type/i.test(award.title)) return true
  return false
}

/**
 * Vérifie si un honneur individuel correspond à une ancienne « équipe-type ».
 */
export function isTeamHonor(honor: { awardId?: string; title?: string }): boolean {
  if (honor.awardId && (honor.awardId.endsWith('-team') || honor.awardId.includes('team'))) return true
  if (honor.title && /équipe[- ]type/i.test(honor.title)) return true
  return false
}

/**
 * Nettoie un instantané de récompenses de toute ancienne récompense « équipe-type ».
 */
export function sanitizeSeasonAwards(snapshot: SeasonAwards | null | undefined): SeasonAwards | null {
  if (!snapshot) return null
  const hasTeam = snapshot.awards.some(isTeamAward)
  if (!hasTeam) return snapshot
  return {
    ...snapshot,
    awards: snapshot.awards.filter(a => !isTeamAward(a)),
  }
}

/**
 * Nettoie une personne de tout honneur individuel d'équipe-type dans son historique.
 */
export function sanitizePersonHonors(person: Person): Person {
  let changed = false
  const cleanedCareerHistory = person.careerHistory?.map(s => {
    if (!s.individualHonors || !s.individualHonors.length) return s
    const filtered = s.individualHonors.filter(h => !isTeamHonor(h))
    if (filtered.length !== s.individualHonors.length) {
      changed = true
      return { ...s, individualHonors: filtered.length ? filtered : undefined }
    }
    return s
  })
  if (!changed) return person
  return {
    ...person,
    careerHistory: cleanedCareerHistory,
  }
}

/**
 * Nettoie une session de Coupe de toute trace d'équipe-type (individualAwards et historique des personnes).
 */
export function sanitizeCupSession(session: CupSession): CupSession {
  let changed = false
  let individualAwards = session.individualAwards
  if (individualAwards) {
    const sanitizedAwards = sanitizeSeasonAwards(individualAwards)
    if (sanitizedAwards !== individualAwards) {
      individualAwards = sanitizedAwards ?? undefined
      changed = true
    }
  }

  let persons = session.persons
  if (persons) {
    let personsChanged = false
    const cleanedPersons = persons.map(p => {
      const cleaned = sanitizePersonHonors(p)
      if (cleaned !== p) personsChanged = true
      return cleaned
    })
    if (personsChanged) {
      persons = cleanedPersons
      changed = true
    }
  }

  if (!changed) return session
  return {
    ...session,
    ...(individualAwards ? { individualAwards } : {}),
    ...(persons ? { persons } : {}),
  }
}

/**
 * Nettoie une archive de toute trace d'équipe-type.
 */
export function sanitizeSeasonArchive(archive: SeasonArchive): SeasonArchive {
  let changed = false
  let individualAwards = archive.individualAwards
  if (individualAwards) {
    const sanitizedAwards = sanitizeSeasonAwards(individualAwards)
    if (sanitizedAwards !== individualAwards) {
      individualAwards = sanitizedAwards ?? undefined
      changed = true
    }
  }

  let persons = archive.persons
  if (persons) {
    let personsChanged = false
    const cleanedPersons = persons.map(p => {
      const cleaned = sanitizePersonHonors(p)
      if (cleaned !== p) personsChanged = true
      return cleaned
    })
    if (personsChanged) {
      persons = cleanedPersons
      changed = true
    }
  }

  if (!changed) return archive
  return {
    ...archive,
    ...(individualAwards ? { individualAwards } : {}),
    ...(persons ? { persons } : {}),
  }
}

const cache = new WeakMap<CupSession | SeasonArchive, SeasonAwards | null>()
/** Refresh only the active cup; historical awards remain the verdict of their edition. */
export function refreshActiveSeasonAwards(session: CupSession): CupSession {
  if (!session.individualAwards || session.individualAwards.scoringMethod === 'PHASE_TOTAL') return session
  const awards = computeSeasonAwards(session)
  return awards ? { ...session, individualAwards: awards } : session
}

export function getSeasonAwards(season: CupSession | SeasonArchive): SeasonAwards | null {
  if (season.individualAwards) {
    const sanitized = sanitizeSeasonAwards(season.individualAwards)!
    if (sanitized !== season.individualAwards) {
      (season as { individualAwards?: SeasonAwards }).individualAwards = sanitized
    }
    return sanitized
  }
  if (!cache.has(season)) cache.set(season, computeSeasonAwards(season))
  return cache.get(season) ?? null
}

export function getPlayerHonors(snapshot: SeasonAwards | null | undefined, personId: string): IndividualHonor[] {
  return snapshot?.awards
    .filter(a => !isTeamAward(a) && a.winners.some(p => p.personId === personId))
    .map(a => ({ awardId: a.id, title: a.title, ...(a.conferenceId ? { conferenceId: a.conferenceId } : {}) })) ?? []
}
