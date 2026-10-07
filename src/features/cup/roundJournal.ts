import type { Commune } from '../geography/types'
import type { Club } from '../teams/types'
import type { DrawMatch } from '../competition/competition'
import type { RoundView } from './cupSelectors'
import type { MatchResult } from '../match/simulateMatch'

export type JournalUpset = Readonly<{
  match: DrawMatch
  result: MatchResult
  winner: Club | Commune
  loser: Club | Commune
  popRatio: number
  popDifference: number
  headline: string
}>

export type JournalClash = Readonly<{
  match: DrawMatch
  result?: MatchResult
  home: Club | Commune
  away: Club | Commune
  combinedPopulation: number
}>

export type JournalHighestScoring = Readonly<{
  match: DrawMatch
  result: MatchResult
  home: Club | Commune
  away: Club | Commune
  totalGoals: number
}>

export type JournalPetitPoucet = Readonly<{
  commune: Club | Commune
  status: 'QUALIFIED' | 'ELIMINATED' | 'PENDING' | 'BYE'
}>

export type RoundJournalSummary = Readonly<{
  roundNumber: number
  phase: string
  totalMatches: number
  completedMatches: number
  totalGoals: number
  averageGoals: number
  upsets: readonly JournalUpset[]
  topClashes: readonly JournalClash[]
  highestScoring?: JournalHighestScoring
  petitPoucet?: JournalPetitPoucet
}>

export function computeRoundJournal(
  round: RoundView,
  byId: Map<string, Club | Commune>,
): RoundJournalSummary {
  const completedMatchesList: Array<{ match: DrawMatch; result: MatchResult; home: Club | Commune; away: Club | Commune }> = []

  let totalGoals = 0
  const upsets: JournalUpset[] = []
  const clashes: JournalClash[] = []
  let highestScoring: JournalHighestScoring | undefined

  for (const match of round.matches) {
    const home = byId.get(match.homeTeamId)
    const away = byId.get(match.awayTeamId)
    if (!home || !away) continue

    const result = round.results[match.id]
    const combinedPop = home.population + away.population
    clashes.push({
      match,
      result,
      home,
      away,
      combinedPopulation: combinedPop,
    })

    if (result) {
      completedMatchesList.push({ match, result, home, away })
      const matchGoals = result.homeScore + result.awayScore
      totalGoals += matchGoals

      if (!highestScoring || matchGoals > highestScoring.totalGoals) {
        highestScoring = {
          match,
          result,
          home,
          away,
          totalGoals: matchGoals,
        }
      }

      const winner = result.winnerId === home.id ? home : away
      const loser = result.winnerId === home.id ? away : home

      if (winner.population < loser.population) {
        const diff = loser.population - winner.population
        const ratio = loser.population / Math.max(1, winner.population)

        if (ratio >= 1.5 || diff >= 3000) {
          let headline = `${winner.name} fait tomber ${loser.name}`
          if (ratio >= 4 || diff >= 25000) {
            headline = `Sensation : ${winner.name} terrasse ${loser.name} !`
          } else if (ratio >= 2.5 || diff >= 10000) {
            headline = `Gros coup : ${winner.name} élimine ${loser.name}`
          }

          upsets.push({
            match,
            result,
            winner,
            loser,
            popRatio: ratio,
            popDifference: diff,
            headline,
          })
        }
      }
    }
  }

  // Sort upsets by biggest population difference
  upsets.sort((a, b) => b.popDifference - a.popDifference || b.popRatio - a.popRatio)

  // Sort clashes by combined population
  clashes.sort((a, b) => b.combinedPopulation - a.combinedPopulation)

  // Determine Petit Poucet (lowest population among all teams participating in the current round)
  const currentRoundTeamIds = new Set<string>()
  for (const match of round.matches) {
    currentRoundTeamIds.add(match.homeTeamId)
    currentRoundTeamIds.add(match.awayTeamId)
  }
  for (const byeId of round.byeTeamIds ?? []) {
    currentRoundTeamIds.add(byeId)
  }

  let petitPoucet: JournalPetitPoucet | undefined
  for (const id of currentRoundTeamIds) {
    const commune = byId.get(id)
    if (!commune) continue
    if (!petitPoucet || commune.population < petitPoucet.commune.population) {
      let status: 'QUALIFIED' | 'ELIMINATED' | 'PENDING' | 'BYE' = 'PENDING'
      if ((round.byeTeamIds ?? []).includes(id)) {
        status = 'BYE'
      } else {
        const match = round.matches.find((m) => m.homeTeamId === id || m.awayTeamId === id)
        if (match) {
          const res = round.results[match.id]
          if (res) {
            status = res.winnerId === id ? 'QUALIFIED' : 'ELIMINATED'
          }
        }
      }
      petitPoucet = {
        commune,
        status,
      }
    }
  }

  const completedCount = completedMatchesList.length
  const avg = completedCount > 0 ? totalGoals / completedCount : 0

  return {
    roundNumber: round.number,
    phase: round.phase,
    totalMatches: round.matches.length,
    completedMatches: completedCount,
    totalGoals,
    averageGoals: Number(avg.toFixed(2)),
    upsets: upsets.slice(0, 5),
    topClashes: clashes.slice(0, 3),
    highestScoring,
    petitPoucet,
  }
}
