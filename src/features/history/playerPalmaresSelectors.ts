import type { Person, PersonTrophyRecord } from '../persons/types'
import { computePersonTrophyRecord } from '../persons/personSelectors'
import type { CupSession, SeasonArchive } from '../storage/cupRepository'
import type { Club } from '../teams/types'
import { getSeasonAwards, isTeamHonor } from '../awards/seasonAwards'
import type { AwardPlayer } from '../awards/types'

export type PlayerPalmaresRecord = {
  person: Person
  rank: number
  // Individual honors
  ballonOrCount: number
  ballonOrYears: number[]
  topScorerCount: number
  topScorerYears: number[]
  topStopsCount: number
  topStopsYears: number[]
  bestDefenderCount: number
  bestDefenderYears: number[]
  bestAttackerCount: number
  bestAttackerYears: number[]
  youthAwardCount: number
  conferenceAwardCount: number
  totalIndividualTitles: number
  allIndividualHonors: Array<{ year: number; awardId: string; title: string }>

  // Team titles
  nationalTitles: number
  nationalTitleYears: number[]
  conferenceTitles: number
  conferenceTitleDetails: Array<{ year: number; conferenceId: string; clubName?: string }>
  regionTitles: number
  regionTitleDetails: Array<{ year: number; regionId: string; clubName?: string }>
  departmentTitles: number
  departmentTitleDetails: Array<{ year: number; departmentId: string; clubName?: string }>
  totalTeamTitles: number

  // Totals & scoring
  totalTitles: number
  palmaresScore: number

  // Career info
  bestPerformance?: {
    year: number
    roundNumber: number
    stageLabel: string
    clubName?: string
  }
  trophyRecord: PersonTrophyRecord
  currentOrLastClub?: Club
  lastClubName?: string
}

export function rankPlayerPalmares(records: readonly PlayerPalmaresRecord[]): PlayerPalmaresRecord[] {
  return [...records].sort((a, b) =>
    b.nationalTitles - a.nationalTitles ||
    b.ballonOrCount - a.ballonOrCount ||
    (b.topScorerCount + b.topStopsCount) - (a.topScorerCount + a.topStopsCount) ||
    b.conferenceTitles - a.conferenceTitles ||
    b.regionTitles - a.regionTitles ||
    b.departmentTitles - a.departmentTitles ||
    b.totalTitles - a.totalTitles ||
    `${a.person.lastName} ${a.person.firstName}`.localeCompare(`${b.person.lastName} ${b.person.firstName}`, 'fr') ||
    a.person.id.localeCompare(b.person.id),
  ).map((item, index) => ({ ...item, rank: index + 1 }))
}

export function getOtherIndividualHonors(record: PlayerPalmaresRecord) {
  return record.allIndividualHonors.filter(h => !['ballon-or', 'top-scorer', 'top-stops'].includes(h.awardId))
}

export type BallonOrEditionRecord = {
  year: number
  winner: AwardPlayer
  winnerPerson?: Person
  winnerClub?: Club
  nominees: AwardPlayer[]
  minimumMatches: number
}

export type TopScorerEditionRecord = {
  year: number
  winner: AwardPlayer
  winnerPerson?: Person
  winnerClub?: Club
  nominees: AwardPlayer[]
  goals: number
  matchesPlayed: number
  ratio: number
  shots: number
  // Meilleur attaquant de la saison (vote et note jury)
  bestAttackerWinner?: AwardPlayer
  bestAttackerClub?: Club
  bestAttackerNominees?: AwardPlayer[]
}

export type TopDefenderEditionRecord = {
  year: number
  // Bouclier d'Or (volume des arrêts/interventions)
  stopsWinner?: AwardPlayer
  stopsWinnerClub?: Club
  stopsNominees: AwardPlayer[]
  stopsCount: number
  // Meilleur défenseur de la saison (vote et note globale)
  bestDefenderWinner?: AwardPlayer
  bestDefenderClub?: Club
  bestDefenderNominees: AwardPlayer[]
}

export type AllAwardsEditionRecord = {
  year: number
  ballonOr?: AwardPlayer
  topScorer?: AwardPlayer
  topStops?: AwardPlayer
  bestDefender?: AwardPlayer
  bestAttacker?: AwardPlayer
  youngPlayer?: AwardPlayer
  youngAttacker?: AwardPlayer
  youngDefender?: AwardPlayer
  conferenceAwards: Array<{
    awardId: string
    title: string
    conferenceId?: string
    winner: AwardPlayer
  }>
}

/**
 * Calcule le classement historique complet des joueurs les plus titrés de la Coupe des communes.
 * Inclut à la fois les titres collectifs (Champion de France, Conférence, Région, Département)
 * et les distinctions individuelles officielles (Ballon d'Or, Soulier d'Or, Bouclier d'Or, etc.).
 */
export function getRankedPlayerPalmares(
  persons: readonly Person[],
  archives: readonly SeasonArchive[] = [],
  activeSession?: CupSession | null,
  clubsById?: Map<string, Club>,
): PlayerPalmaresRecord[] {
  // 1. Rassembler l'ensemble des personnes existantes (actives + archives passées)
  const allPersonsMap = new Map<string, Person>()
  for (const p of persons) {
    allPersonsMap.set(p.id, p)
  }
  for (const arch of archives) {
    if (arch.persons) {
      for (const p of arch.persons) {
        if (!allPersonsMap.has(p.id)) {
          allPersonsMap.set(p.id, p)
        }
      }
    }
  }

  // 2. Pré-filtrer les candidats susceptibles d'avoir des titres ou un parcours marquant (>= tour 13)
  const candidateIds = new Set<string>()
  const titledClubIds = new Set<string>()

  for (const arch of archives) {
    if (arch.nationalChampionId) titledClubIds.add(arch.nationalChampionId)
    if (arch.finalistId) titledClubIds.add(arch.finalistId)
    if (arch.conferenceChampions) {
      for (const id of Object.values(arch.conferenceChampions)) if (id) titledClubIds.add(id)
    }
    if (arch.regionChampions) {
      for (const id of Object.values(arch.regionChampions)) if (id) titledClubIds.add(id)
    }
    if (arch.departmentChampions) {
      for (const id of Object.values(arch.departmentChampions)) if (id) titledClubIds.add(id)
    }
    if (arch.finalFourTeamIds) {
      for (const id of arch.finalFourTeamIds) if (id) titledClubIds.add(id)
    }
    if (arch.teamPerformances) {
      for (const [id, perf] of Object.entries(arch.teamPerformances)) {
        if (
          perf.roundReached >= 13 ||
          perf.isNationalChampion ||
          perf.isConferenceChampion ||
          perf.isRegionChampion ||
          perf.isDepartmentChampion
        ) {
          titledClubIds.add(id)
        }
      }
    }

    if (arch.individualAwards?.awards) {
      for (const award of arch.individualAwards.awards) {
        if (award.winners) for (const w of award.winners) candidateIds.add(w.personId)
        if (award.nominees) for (const n of award.nominees) candidateIds.add(n.personId)
      }
    }
  }

  if (activeSession) {
    if (activeSession.championId) titledClubIds.add(activeSession.championId)
    if (activeSession.conferenceChampionIds) {
      for (const id of Object.values(activeSession.conferenceChampionIds)) if (id) titledClubIds.add(id)
    }
    if (activeSession.roundNumber >= 13 && activeSession.round?.matches) {
      for (const m of activeSession.round.matches) {
        titledClubIds.add(m.homeTeamId)
        titledClubIds.add(m.awayTeamId)
      }
    }
    if (activeSession.individualAwards?.awards) {
      for (const award of activeSession.individualAwards.awards) {
        if (award.winners) for (const w of award.winners) candidateIds.add(w.personId)
        if (award.nominees) for (const n of award.nominees) candidateIds.add(n.personId)
      }
    }
  }

  for (const arch of archives) {
    if (arch.persons) {
      for (const p of arch.persons) {
        if (p.currentClubId && titledClubIds.has(p.currentClubId)) {
          candidateIds.add(p.id)
        }
      }
    }
  }
  if (activeSession?.persons) {
    for (const p of activeSession.persons) {
      if (p.currentClubId && titledClubIds.has(p.currentClubId)) {
        candidateIds.add(p.id)
      }
    }
  }

  for (const person of allPersonsMap.values()) {
    if (candidateIds.has(person.id)) continue
    if (person.currentClubId && titledClubIds.has(person.currentClubId)) {
      candidateIds.add(person.id)
      continue
    }
    if (person.careerHistory && person.careerHistory.length > 0) {
      const hasClue = person.careerHistory.some(
        (s) =>
          (s.individualHonors && s.individualHonors.length > 0) ||
          s.isNationalChampion ||
          s.isConferenceChampion ||
          s.isRegionChampion ||
          s.isDepartmentChampion ||
          (s.roundReached && s.roundReached >= 13) ||
          (s.clubId && titledClubIds.has(s.clubId)),
      )
      if (hasClue) {
        candidateIds.add(person.id)
      }
    }
  }

  const personsToEvaluate =
    candidateIds.size > 0
      ? Array.from(candidateIds)
          .map((id) => allPersonsMap.get(id))
          .filter((p): p is Person => p !== undefined)
      : Array.from(allPersonsMap.values())

  const candidates: PlayerPalmaresRecord[] = []

  for (const person of personsToEvaluate) {
    const trophyRecord = computePersonTrophyRecord(person, archives, activeSession, clubsById)

    const allIndividualHonors: Array<{ year: number; awardId: string; title: string }> = []
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

    // Extraire les distinctions individuelles
    for (const s of trophyRecord.seasons) {
      if (s.role === 'COACH') continue
      if (s.individualHonors) {
        for (const h of s.individualHonors) {
          if (isTeamHonor(h)) continue
          allIndividualHonors.push({ year: s.year, awardId: h.awardId, title: h.title })
          if (h.awardId === 'ballon-or') {
            ballonOrCount += 1
            ballonOrYears.push(s.year)
          } else if (h.awardId === 'top-scorer') {
            topScorerCount += 1
            topScorerYears.push(s.year)
          } else if (h.awardId === 'top-stops') {
            topStopsCount += 1
            topStopsYears.push(s.year)
          } else if (h.awardId === 'best-defender') {
            bestDefenderCount += 1
            bestDefenderYears.push(s.year)
          } else if (h.awardId === 'best-attacker') {
            bestAttackerCount += 1
            bestAttackerYears.push(s.year)
          } else if (h.awardId.startsWith('young-')) {
            youthAwardCount += 1
          } else if (h.awardId.startsWith('conference-')) {
            conferenceAwardCount += 1
          }
        }
      }
    }

    const totalIndividualTitles = allIndividualHonors.length
    const totalTeamTitles =
      trophyRecord.nationalTitles +
      trophyRecord.conferenceTitles +
      trophyRecord.regionTitles +
      trophyRecord.departmentTitles
    const totalTitles = totalIndividualTitles + totalTeamTitles

    // Filtrer les joueurs sans titre
    if (totalTitles === 0 && (!trophyRecord.bestPerformance || trophyRecord.bestPerformance.roundNumber < 13)) {
      continue
    }

    // Calcul du score de prestige du palmarès
    const palmaresScore =
      ballonOrCount * 15 +
      trophyRecord.nationalTitles * 10 +
      topScorerCount * 7 +
      (topStopsCount + bestDefenderCount + bestAttackerCount) * 6 +
      trophyRecord.conferenceTitles * 5 +
      (youthAwardCount + conferenceAwardCount) * 3 +
      trophyRecord.regionTitles * 2 +
      trophyRecord.departmentTitles * 1

    // Trouver le club actuel ou le dernier club connu
    let currentOrLastClub: Club | undefined
    let lastClubName: string | undefined

    if (person.currentClubId && clubsById) {
      currentOrLastClub = clubsById.get(person.currentClubId)
    }
    if (!currentOrLastClub && trophyRecord.seasons.length > 0) {
      const recent = trophyRecord.seasons[0]
      if (recent.clubId && clubsById) {
        currentOrLastClub = clubsById.get(recent.clubId)
      }
      lastClubName = recent.clubName
    }

    candidates.push({
      person,
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
      nationalTitles: trophyRecord.nationalTitles,
      nationalTitleYears: [...trophyRecord.nationalTitleYears],
      conferenceTitles: trophyRecord.conferenceTitles,
      conferenceTitleDetails: [...trophyRecord.conferenceTitleDetails],
      regionTitles: trophyRecord.regionTitles,
      regionTitleDetails: [...trophyRecord.regionTitleDetails],
      departmentTitles: trophyRecord.departmentTitles,
      departmentTitleDetails: [...trophyRecord.departmentTitleDetails],
      totalTeamTitles,
      totalTitles,
      palmaresScore,
      bestPerformance: trophyRecord.bestPerformance,
      trophyRecord,
      currentOrLastClub,
      lastClubName,
    })
  }

  return rankPlayerPalmares(candidates)
}

/**
 * Extrait l'historique de chaque édition pour le tableau du Ballon d'Or avec vainqueur et nommés.
 */
export function extractBallonOrHistory(
  completedEditions: readonly SeasonArchive[],
  personsById?: Map<string, Person>,
  clubsById?: Map<string, Club>,
): BallonOrEditionRecord[] {
  const records: BallonOrEditionRecord[] = []

  for (const edition of completedEditions) {
    const snapshot = getSeasonAwards(edition)
    if (!snapshot) continue

    const award = snapshot.awards.find((a) => a.id === 'ballon-or')
    if (award && award.winners.length > 0) {
      const winner = award.winners[0]
      const nominees = award.nominees
        .filter((n) => n.personId !== winner.personId)
        .sort((a, b) => (b.awardScore ?? b.overallScore) - (a.awardScore ?? a.overallScore))

      records.push({
        year: snapshot.year,
        winner,
        winnerPerson: personsById?.get(winner.personId),
        winnerClub: clubsById?.get(winner.clubId),
        nominees,
        minimumMatches: snapshot.minimumMatches,
      })
    }
  }

  return records.sort((a, b) => b.year - a.year)
}

/**
 * Extrait l'historique des Meilleurs Buteurs (Soulier d'Or) pour chaque édition achevée.
 */
export function extractTopScorersHistory(
  completedEditions: readonly SeasonArchive[],
  personsById?: Map<string, Person>,
  clubsById?: Map<string, Club>,
): TopScorerEditionRecord[] {
  const records: TopScorerEditionRecord[] = []

  for (const edition of completedEditions) {
    const snapshot = getSeasonAwards(edition)
    if (!snapshot) continue

    const award = snapshot.awards.find((a) => a.id === 'top-scorer')
    const bestAtkAward = snapshot.awards.find((a) => a.id === 'best-attacker')

    if (award && award.winners.length > 0) {
      const winner = award.winners[0]
      const nominees = award.nominees
        .filter((n) => n.personId !== winner.personId)
        .sort((a, b) => b.goals - a.goals || a.matchesPlayed - b.matchesPlayed)

      const bestAttackerWinner = bestAtkAward?.winners[0]
      const bestAttackerNominees = bestAtkAward
        ? bestAtkAward.nominees
            .filter((n) => n.personId !== bestAttackerWinner?.personId)
            .sort((a, b) => (b.awardScore ?? b.attackScore) - (a.awardScore ?? a.attackScore))
        : []

      records.push({
        year: snapshot.year,
        winner,
        winnerPerson: personsById?.get(winner.personId),
        winnerClub: clubsById?.get(winner.clubId),
        nominees,
        goals: winner.goals,
        matchesPlayed: winner.matchesPlayed,
        ratio: winner.matchesPlayed > 0 ? winner.goals / winner.matchesPlayed : 0,
        shots: winner.shots,
        bestAttackerWinner,
        bestAttackerClub: bestAttackerWinner ? clubsById?.get(bestAttackerWinner.clubId) : undefined,
        bestAttackerNominees,
      })
    }
  }

  return records.sort((a, b) => b.year - a.year)
}

/**
 * Extrait l'historique des Meilleurs Défenseurs et du Bouclier d'Or pour chaque édition achevée.
 */
export function extractTopDefendersHistory(
  completedEditions: readonly SeasonArchive[],
  clubsById?: Map<string, Club>,
): TopDefenderEditionRecord[] {
  const records: TopDefenderEditionRecord[] = []

  for (const edition of completedEditions) {
    const snapshot = getSeasonAwards(edition)
    if (!snapshot) continue

    const stopsAward = snapshot.awards.find((a) => a.id === 'top-stops')
    const bestDefAward = snapshot.awards.find((a) => a.id === 'best-defender')

    if (stopsAward?.winners.length || bestDefAward?.winners.length) {
      const stopsWinner = stopsAward?.winners[0]
      const stopsNominees = stopsAward
        ? stopsAward.nominees
            .filter((n) => n.personId !== stopsWinner?.personId)
            .sort((a, b) => b.defensiveStops - a.defensiveStops || a.matchesPlayed - b.matchesPlayed)
        : []

      const bestDefenderWinner = bestDefAward?.winners[0]
      const bestDefenderNominees = bestDefAward
        ? bestDefAward.nominees
            .filter((n) => n.personId !== bestDefenderWinner?.personId)
            .sort((a, b) => (b.awardScore ?? b.defenseScore) - (a.awardScore ?? a.defenseScore))
        : []

      records.push({
        year: snapshot.year,
        stopsWinner,
        stopsWinnerClub: stopsWinner ? clubsById?.get(stopsWinner.clubId) : undefined,
        stopsNominees,
        stopsCount: stopsWinner?.defensiveStops ?? 0,
        bestDefenderWinner,
        bestDefenderClub: bestDefenderWinner ? clubsById?.get(bestDefenderWinner.clubId) : undefined,
        bestDefenderNominees,
      })
    }
  }

  return records.sort((a, b) => b.year - a.year)
}

/**
 * Extrait le récapitulatif complet de tous les trophées individuels par édition.
 */
export function extractAllAwardsHistory(
  completedEditions: readonly SeasonArchive[],
): AllAwardsEditionRecord[] {
  const records: AllAwardsEditionRecord[] = []

  for (const edition of completedEditions) {
    const snapshot = getSeasonAwards(edition)
    if (!snapshot) continue

    const findWinner = (id: string) => snapshot.awards.find((a) => a.id === id)?.winners[0]

    const conferenceAwards: AllAwardsEditionRecord['conferenceAwards'] = []
    for (const award of snapshot.awards) {
      if (award.stage === 'CONFERENCE' && award.winners.length > 0) {
        conferenceAwards.push({
          awardId: award.id,
          title: award.title,
          conferenceId: award.conferenceId,
          winner: award.winners[0],
        })
      }
    }

    records.push({
      year: snapshot.year,
      ballonOr: findWinner('ballon-or'),
      topScorer: findWinner('top-scorer'),
      topStops: findWinner('top-stops'),
      bestDefender: findWinner('best-defender'),
      bestAttacker: findWinner('best-attacker'),
      youngPlayer: findWinner('young-player'),
      youngAttacker: findWinner('young-attacker'),
      youngDefender: findWinner('young-defender'),
      conferenceAwards,
    })
  }

  return records.sort((a, b) => b.year - a.year)
}
