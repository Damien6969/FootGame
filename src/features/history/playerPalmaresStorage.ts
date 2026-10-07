import { rankPlayerPalmares } from './playerPalmaresSelectors'
import { getCompletedSessionTeamPerformances } from './palmaresSelectors'
import type { Person, PlayerPosition } from '../persons/types'
import type { Club } from '../teams/types'
import type { CupSession, SeasonArchive } from '../storage/cupRepository'
import { getSeasonAwards, getPlayerHonors } from '../awards/seasonAwards'
import { getArchivedPlayerStatistics, getActivePlayerStatistics } from '../persons/playerStatistics'
import { isActiveCoach } from '../coaches/coachRatings'
import type { AwardPlayer, IndividualHonor } from '../awards/types'
import type {
  PlayerPalmaresRecord,
  BallonOrEditionRecord,
  TopScorerEditionRecord,
  TopDefenderEditionRecord,
  AllAwardsEditionRecord,
} from './playerPalmaresSelectors'

export type PlayerSeasonHonor = Readonly<{
  id: string // `${personId}:${year}`
  personId: string
  year: number
  firstName: string
  lastName: string
  nationality: string
  assignedPosition?: PlayerPosition
  clubId?: string
  clubName?: string
  role: 'PLAYER' | 'COACH'
  isStarter: boolean
  isLoan: boolean
  parentClubId?: string
  parentClubName?: string
  matchesPlayed: number
  goals: number
  defensiveStops: number
  shots: number
  shotsMissed: number
  roundReached: number
  stageLabel: string
  isNationalChampion: boolean
  isConferenceChampion: boolean
  isRegionChampion: boolean
  isDepartmentChampion: boolean
  conferenceId?: string
  regionId?: string
  departmentId?: string
  birthCommuneId?: string
  birthCommuneName?: string
  birthDepartmentId?: string
  age?: number
  attack?: number
  defense?: number
  isRetired?: boolean
  individualHonors?: readonly IndividualHonor[]
}>

export type SeasonAwardSummary = Readonly<{
  year: number
  minimumMatches: number
  ballonOr?: Readonly<{
    winner: AwardPlayer
    nominees: readonly AwardPlayer[]
  }>
  topScorer?: Readonly<{
    winner: AwardPlayer
    nominees: readonly AwardPlayer[]
    bestAttackerWinner?: AwardPlayer
    bestAttackerNominees?: readonly AwardPlayer[]
  }>
  topStops?: Readonly<{
    winner: AwardPlayer
    nominees: readonly AwardPlayer[]
  }>
  bestDefender?: Readonly<{
    winner: AwardPlayer
    nominees: readonly AwardPlayer[]
  }>
  bestAttacker?: AwardPlayer
  youngPlayer?: AwardPlayer
  youngAttacker?: AwardPlayer
  youngDefender?: AwardPlayer
  conferenceAwards?: ReadonlyArray<{
    awardId: string
    title: string
    conferenceId?: string
    winner: AwardPlayer
  }>
}>

/**
 * Extrait les lauréats et résumés d'une saison pour la table seasonAwardSummaries.
 */
export function extractSeasonAwardSummary(season: SeasonArchive | CupSession): SeasonAwardSummary | null {
  const snapshot = getSeasonAwards(season)
  if (!snapshot) return null

  const ballonOrAward = snapshot.awards.find((a) => a.id === 'ballon-or')
  const scorerAward = snapshot.awards.find((a) => a.id === 'top-scorer')
  const bestAtkAward = snapshot.awards.find((a) => a.id === 'best-attacker')
  const stopsAward = snapshot.awards.find((a) => a.id === 'top-stops')
  const bestDefAward = snapshot.awards.find((a) => a.id === 'best-defender')
  const youngAward = snapshot.awards.find((a) => a.id === 'young-player')
  const youngAtkAward = snapshot.awards.find((a) => a.id === 'young-attacker')
  const youngDefAward = snapshot.awards.find((a) => a.id === 'young-defender')

  const confAwards: Array<{ awardId: string; title: string; conferenceId?: string; winner: AwardPlayer }> = []
  for (const a of snapshot.awards) {
    if (a.stage === 'CONFERENCE' && a.winners.length > 0) {
      confAwards.push({
        awardId: a.id,
        title: a.title,
        conferenceId: a.conferenceId,
        winner: a.winners[0],
      })
    }
  }

  return {
    year: snapshot.year,
    minimumMatches: snapshot.minimumMatches,
    ballonOr:
      ballonOrAward && ballonOrAward.winners.length > 0
        ? { winner: ballonOrAward.winners[0], nominees: ballonOrAward.nominees }
        : undefined,
    topScorer:
      scorerAward && scorerAward.winners.length > 0
        ? {
            winner: scorerAward.winners[0],
            nominees: scorerAward.nominees,
            bestAttackerWinner: bestAtkAward?.winners[0],
            bestAttackerNominees: bestAtkAward?.nominees,
          }
        : undefined,
    topStops:
      stopsAward && stopsAward.winners.length > 0
        ? { winner: stopsAward.winners[0], nominees: stopsAward.nominees }
        : undefined,
    bestDefender:
      bestDefAward && bestDefAward.winners.length > 0
        ? { winner: bestDefAward.winners[0], nominees: bestDefAward.nominees }
        : undefined,
    bestAttacker: bestAtkAward?.winners[0],
    youngPlayer: youngAward?.winners[0],
    youngAttacker: youngAtkAward?.winners[0],
    youngDefender: youngDefAward?.winners[0],
    conferenceAwards: confAwards,
  }
}

/**
 * Extrait les honneurs individuels et titres collectifs des joueurs pour une saison donnée.
 */
export function extractSeasonPlayerHonors(
  season: SeasonArchive | CupSession,
  clubsById?: Map<string, Club>,
): PlayerSeasonHonor[] {
  const isArchive = 'nationalChampionId' in season
  const year = isArchive ? season.year : (season.seasonYear ?? 2026)
  const awards = getSeasonAwards(season)

  const nationalChampionId = isArchive ? season.nationalChampionId : (season.championId ?? '')
  const confChampions = isArchive ? (season.conferenceChampions ?? {}) : (season.conferenceChampionIds ?? {})
  const regionChampions: Record<string, string> = isArchive ? { ...(season.regionChampions ?? {}) } : {}
  const departmentChampions: Record<string, string> = isArchive ? { ...(season.departmentChampions ?? {}) } : {}
  const teamPerfs = isArchive ? (season.teamPerformances ?? {}) : {}

  if (!isArchive) {
    const performances = getCompletedSessionTeamPerformances(season, clubsById ? [...clubsById.values()] : undefined)
    for (const perf of Object.values(performances)) {
      if (perf.isDepartmentChampion && perf.departmentId) departmentChampions[perf.departmentId] = perf.teamId
      if (perf.isRegionChampion && perf.regionId) regionChampions[perf.regionId] = perf.teamId
    }
  }
  const confChampIds = new Set(Object.values(confChampions).filter(Boolean))
  const regionChampIds = new Set(Object.values(regionChampions).filter(Boolean))
  const deptChampIds = new Set(Object.values(departmentChampions).filter(Boolean))

  const honorsMap = new Map<string, PlayerSeasonHonor>()

  // 1. Scanner les joueurs de l'archive/session
  const roster: readonly Person[] = season.persons ?? []

  for (const person of roster) {
    if (person.primaryRole !== 'PLAYER' && person.primaryRole !== 'COACH') continue
    const clubId = person.currentClubId
    if (!clubId) continue

    const isNational = Boolean(nationalChampionId && clubId === nationalChampionId)
    const isConf = confChampIds.has(clubId)
    const isRegion = regionChampIds.has(clubId)
    const isDept = deptChampIds.has(clubId)

    const individualHonors = person.primaryRole === 'PLAYER' ? getPlayerHonors(awards, person.id) : []
    const perf = teamPerfs[clubId]
    const roundReached = perf?.roundReached ?? (isNational ? 14 : isConf ? 13 : 1)
    const stageLabel = perf?.stageLabel ?? (isNational ? 'Champion de France 🏆' : `Tour ${roundReached}`)

    if (!isNational && !isConf && !isRegion && !isDept && individualHonors.length === 0 && roundReached < 13) {
      continue
    }

    const playerStats = isArchive
      ? getArchivedPlayerStatistics(season, person)
      : getActivePlayerStatistics(season, person)
    const isStarter = person.primaryRole === 'PLAYER' && Boolean(playerStats?.isStarter)
    const earnsTeamTitles = isStarter || (person.primaryRole === 'COACH' &&
      (perf?.coach ? perf.coach.personId === person.id : isActiveCoach(person)))
    const club = clubsById?.get(clubId)
    const clubName = perf?.clubName ?? club?.name ?? `Club ${clubId}`

    const entry: PlayerSeasonHonor = {
      id: `${person.id}:${year}`,
      personId: person.id,
      year,
      firstName: person.firstName,
      lastName: person.lastName,
      nationality: person.nationality,
      assignedPosition: person.assignedPosition,
      clubId,
      clubName,
      role: person.primaryRole,
      isStarter,
      isLoan: Boolean(person.loanedFromClubId && person.loanedFromClubId !== clubId),
      parentClubId: (person.parentClubId ?? person.loanedFromClubId) || undefined,
      matchesPlayed: isStarter ? (playerStats?.matchesPlayed ?? 0) : 0,
      goals: isStarter ? (playerStats?.goals ?? 0) : 0,
      defensiveStops: isStarter ? (playerStats?.defensiveStops ?? 0) : 0,
      shots: isStarter ? (playerStats?.shots ?? 0) : 0,
      shotsMissed: isStarter ? (playerStats?.shotsMissed ?? 0) : 0,
      roundReached,
      stageLabel,
      isNationalChampion: earnsTeamTitles ? isNational : false,
      isConferenceChampion: earnsTeamTitles ? isConf : false,
      isRegionChampion: earnsTeamTitles ? isRegion : false,
      isDepartmentChampion: earnsTeamTitles ? isDept : false,
      conferenceId: perf?.conferenceId ?? club?.conferenceId,
      regionId: perf?.regionId ?? club?.regionId,
      departmentId: perf?.departmentId ?? club?.departmentId,
      birthCommuneId: person.birthCommuneId,
      birthCommuneName: person.birthCommuneName,
      birthDepartmentId: person.birthDepartmentId,
      age: person.age,
      attack: person.attack,
      defense: person.defense,
      isRetired: person.isRetired,
      individualHonors: individualHonors.length > 0 ? individualHonors : undefined,
    }

    honorsMap.set(person.id, entry)
  }

  // 2. S'assurer que tous les vainqueurs de distinctions individuelles figurent bien
  if (awards?.awards) {
    for (const award of awards.awards) {
      for (const winner of award.winners) {
        if (!honorsMap.has(winner.personId)) {
          const club = clubsById?.get(winner.clubId)
          honorsMap.set(winner.personId, {
            id: `${winner.personId}:${year}`,
            personId: winner.personId,
            year,
            firstName: winner.firstName,
            lastName: winner.lastName,
            nationality: 'FR',
            assignedPosition: winner.position,
            clubId: winner.clubId,
            clubName: winner.clubName || club?.name,
            role: 'PLAYER',
            isStarter: true,
            isLoan: false,
            matchesPlayed: winner.matchesPlayed ?? 0,
            goals: winner.goals ?? 0,
            defensiveStops: winner.defensiveStops ?? 0,
            shots: winner.shots ?? 0,
            shotsMissed: winner.shotsMissed ?? 0,
            roundReached: 14,
            stageLabel: 'Distinction individuelle',
            isNationalChampion: Boolean(winner.isChampion),
            isConferenceChampion: false,
            isRegionChampion: false,
            isDepartmentChampion: false,
            conferenceId: winner.conferenceId,
            individualHonors: [{ awardId: award.id, title: award.title }],
          })
        }
      }
    }
  }

  return Array.from(honorsMap.values())
}

/**
 * Construit et trie le classement cumulé playerPalmares à partir de l'ensemble des playerSeasonHonors.
 */
export function buildPlayerPalmaresFromHonors(
  honors: readonly PlayerSeasonHonor[],
  personsById?: Map<string, Person>,
  clubsById?: Map<string, Club>,
): PlayerPalmaresRecord[] {
  const byPerson = new Map<string, PlayerSeasonHonor[]>()

  for (const h of honors) {
    const list = byPerson.get(h.personId) ?? []
    list.push(h)
    byPerson.set(h.personId, list)
  }

  const candidates: PlayerPalmaresRecord[] = []

  for (const [personId, personHonors] of byPerson.entries()) {
    personHonors.sort((a, b) => b.year - a.year)
    const latest = personHonors[0]
    const personObj = personsById?.get(personId)

    const person: Person = personObj ?? {
      id: personId,
      firstName: latest.firstName,
      lastName: latest.lastName,
      nationality: latest.nationality,
      age: latest.age ?? (20 + (personHonors.length || 1)),
      careerYears: personHonors.length,
      attack: latest.attack ?? 15,
      defense: latest.defense ?? 15,
      primaryRole: latest.role,
      position: latest.assignedPosition ?? 'ATTACKER',
      assignedPosition: latest.assignedPosition ?? 'ATTACKER',
      birthCommuneId: latest.birthCommuneId ?? latest.clubId ?? '',
      birthCommuneName: latest.birthCommuneName ?? latest.clubName ?? '',
      birthDepartmentId: latest.birthDepartmentId ?? latest.departmentId ?? '75',
      currentClubId: latest.clubId ?? null,
      isRetired: latest.isRetired ?? true,
    }

    let ballonOrCount = 0
    const ballonOrYears: number[] = []
    let topScorerCount = 0
    const topScorerYears: number[] = []
    let topStopsCount = 0
    const topStopsYears: number[] = []
    let bestDefenderCount = 0
    const bestDefenderYears: number[] = []
    let bestAttackerCount = 0
    const bestAttackerYears: number[] = []
    let youthAwardCount = 0
    let conferenceAwardCount = 0
    const allIndividualHonors: Array<{ year: number; awardId: string; title: string }> = []

    let nationalTitles = 0
    const nationalTitleYears: number[] = []
    let conferenceTitles = 0
    const conferenceTitleDetails: Array<{ year: number; conferenceId: string; clubName?: string }> = []
    let regionTitles = 0
    const regionTitleDetails: Array<{ year: number; regionId: string; clubName?: string }> = []
    let departmentTitles = 0
    const departmentTitleDetails: Array<{ year: number; departmentId: string; clubName?: string }> = []

    let bestPerformance: { year: number; roundNumber: number; stageLabel: string; clubName?: string } | undefined

    for (const h of personHonors) {
      if (h.isNationalChampion) {
        nationalTitles += 1
        nationalTitleYears.push(h.year)
      }
      if (h.isConferenceChampion && h.conferenceId) {
        conferenceTitles += 1
        conferenceTitleDetails.push({ year: h.year, conferenceId: h.conferenceId, clubName: h.clubName })
      }
      if (h.isRegionChampion && h.regionId) {
        regionTitles += 1
        regionTitleDetails.push({ year: h.year, regionId: h.regionId, clubName: h.clubName })
      }
      if (h.isDepartmentChampion && h.departmentId) {
        departmentTitles += 1
        departmentTitleDetails.push({ year: h.year, departmentId: h.departmentId, clubName: h.clubName })
      }

      if (h.role !== 'COACH' && h.individualHonors) {
        for (const honor of h.individualHonors) {
          allIndividualHonors.push({ year: h.year, awardId: honor.awardId, title: honor.title })
          if (honor.awardId === 'ballon-or') {
            ballonOrCount += 1
            ballonOrYears.push(h.year)
          } else if (honor.awardId === 'top-scorer') {
            topScorerCount += 1
            topScorerYears.push(h.year)
          } else if (honor.awardId === 'top-stops') {
            topStopsCount += 1
            topStopsYears.push(h.year)
          } else if (honor.awardId === 'best-defender') {
            bestDefenderCount += 1
            bestDefenderYears.push(h.year)
          } else if (honor.awardId === 'best-attacker') {
            bestAttackerCount += 1
            bestAttackerYears.push(h.year)
          } else if (honor.awardId.includes('young')) {
            youthAwardCount += 1
          } else if (honor.awardId.startsWith('conf-') || honor.awardId.startsWith('conference-')) {
            conferenceAwardCount += 1
          }
        }
      }

      if (!bestPerformance || h.roundReached > bestPerformance.roundNumber) {
        bestPerformance = {
          year: h.year,
          roundNumber: h.roundReached,
          stageLabel: h.stageLabel,
          clubName: h.clubName,
        }
      }
    }

    const totalIndividualTitles = allIndividualHonors.length
    const totalTeamTitles = nationalTitles + conferenceTitles + regionTitles + departmentTitles
    const totalTitles = totalIndividualTitles + totalTeamTitles

    if (totalTitles === 0 && (!bestPerformance || bestPerformance.roundNumber < 13)) {
      continue
    }

    const palmaresScore =
      ballonOrCount * 15 +
      nationalTitles * 10 +
      topScorerCount * 7 +
      (topStopsCount + bestDefenderCount + bestAttackerCount) * 6 +
      conferenceTitles * 5 +
      (youthAwardCount + conferenceAwardCount) * 3 +
      regionTitles * 2 +
      departmentTitles * 1

    const currentOrLastClub =
      (person.currentClubId && clubsById ? clubsById.get(person.currentClubId) : undefined) ??
      (latest.clubId && clubsById ? clubsById.get(latest.clubId) : undefined)
    const effectivePerson: Person =
      currentOrLastClub && currentOrLastClub.id !== person.currentClubId
        ? { ...person, currentClubId: currentOrLastClub.id }
        : person

    candidates.push({
      person: effectivePerson,
      rank: 0,
      ballonOrCount,
      ballonOrYears,
      topScorerCount,
      topScorerYears,
      topStopsCount,
      topStopsYears,
      bestDefenderCount,
      bestDefenderYears,
      bestAttackerCount,
      bestAttackerYears,
      youthAwardCount,
      conferenceAwardCount,
      totalIndividualTitles,
      allIndividualHonors,
      nationalTitles,
      nationalTitleYears,
      conferenceTitles,
      conferenceTitleDetails,
      regionTitles,
      regionTitleDetails,
      departmentTitles,
      departmentTitleDetails,
      totalTeamTitles,
      totalTitles,
      palmaresScore,
      bestPerformance,
      trophyRecord: {
        personId,
        nationalTitles,
        nationalTitleYears,
        conferenceTitles,
        conferenceTitleDetails,
        regionTitles,
        regionTitleDetails,
        departmentTitles,
        departmentTitleDetails,
        bestPerformance,
        seasons: [],
      },
      currentOrLastClub,
      lastClubName: latest.clubName,
    })
  }

  return rankPlayerPalmares(candidates)
}

/**
 * Convertit un tableau de SeasonAwardSummary en enregistrements Ballon d'Or pour le tableau d'honneur.
 */
export function convertAwardSummariesToBallonOr(
  summaries: readonly SeasonAwardSummary[],
  personsById?: Map<string, Person>,
  clubsById?: Map<string, Club>,
): BallonOrEditionRecord[] {
  const records: BallonOrEditionRecord[] = []
  for (const s of summaries) {
    if (!s.ballonOr) continue
    const { winner, nominees } = s.ballonOr
    records.push({
      year: s.year,
      winner,
      winnerPerson: personsById?.get(winner.personId),
      winnerClub: clubsById?.get(winner.clubId),
      nominees: [...nominees].sort((a, b) => (b.awardScore ?? b.overallScore) - (a.awardScore ?? a.overallScore)),
      minimumMatches: s.minimumMatches,
    })
  }
  return records.sort((a, b) => b.year - a.year)
}

/**
 * Convertit un tableau de SeasonAwardSummary en enregistrements Meilleurs Buteurs (Soulier d'Or).
 */
export function convertAwardSummariesToTopScorers(
  summaries: readonly SeasonAwardSummary[],
  personsById?: Map<string, Person>,
  clubsById?: Map<string, Club>,
): TopScorerEditionRecord[] {
  const records: TopScorerEditionRecord[] = []
  for (const s of summaries) {
    if (!s.topScorer) continue
    const { winner, nominees, bestAttackerWinner, bestAttackerNominees } = s.topScorer
    const matches = winner.matchesPlayed ?? 0
    records.push({
      year: s.year,
      winner,
      winnerPerson: personsById?.get(winner.personId),
      winnerClub: clubsById?.get(winner.clubId),
      nominees: [...nominees].sort((a, b) => b.goals - a.goals || (a.matchesPlayed ?? 0) - (b.matchesPlayed ?? 0)),
      goals: winner.goals,
      matchesPlayed: matches,
      ratio: matches > 0 ? winner.goals / matches : 0,
      shots: winner.shots ?? 0,
      bestAttackerWinner,
      bestAttackerClub: bestAttackerWinner ? clubsById?.get(bestAttackerWinner.clubId) : undefined,
      bestAttackerNominees: bestAttackerNominees ? [...bestAttackerNominees] : [],
    })
  }
  return records.sort((a, b) => b.year - a.year)
}

/**
 * Convertit un tableau de SeasonAwardSummary en enregistrements Meilleurs Défenseurs / Bouclier d'Or.
 */
export function convertAwardSummariesToTopDefenders(
  summaries: readonly SeasonAwardSummary[],
  clubsById?: Map<string, Club>,
): TopDefenderEditionRecord[] {
  const records: TopDefenderEditionRecord[] = []
  for (const s of summaries) {
    if (!s.topStops && !s.bestDefender) continue
    records.push({
      year: s.year,
      stopsWinner: s.topStops?.winner,
      stopsWinnerClub: s.topStops ? clubsById?.get(s.topStops.winner.clubId) : undefined,
      stopsNominees: s.topStops?.nominees ? [...s.topStops.nominees] : [],
      stopsCount: s.topStops?.winner.defensiveStops ?? 0,
      bestDefenderWinner: s.bestDefender?.winner,
      bestDefenderClub: s.bestDefender ? clubsById?.get(s.bestDefender.winner.clubId) : undefined,
      bestDefenderNominees: s.bestDefender?.nominees ? [...s.bestDefender.nominees] : [],
    })
  }
  return records.sort((a, b) => b.year - a.year)
}

/**
 * Convertit un tableau de SeasonAwardSummary en enregistrements de toutes les distinctions par édition.
 */
export function convertAwardSummariesToAllAwards(
  summaries: readonly SeasonAwardSummary[],
): AllAwardsEditionRecord[] {
  const records: AllAwardsEditionRecord[] = []
  for (const s of summaries) {
    records.push({
      year: s.year,
      ballonOr: s.ballonOr?.winner,
      topScorer: s.topScorer?.winner,
      topStops: s.topStops?.winner,
      bestDefender: s.bestDefender?.winner,
      bestAttacker: s.bestAttacker,
      youngPlayer: s.youngPlayer,
      youngAttacker: s.youngAttacker,
      youngDefender: s.youngDefender,
      conferenceAwards: s.conferenceAwards ? [...s.conferenceAwards] : [],
    })
  }
  return records.sort((a, b) => b.year - a.year)
}
