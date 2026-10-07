import type { PlayerPosition } from '../persons/types'

export type AwardPlayer = Readonly<{
  personId: string
  firstName: string
  lastName: string
  age: number
  clubId: string
  clubName: string
  conferenceId: string
  position: PlayerPosition
  matchesPlayed: number
  goals: number
  defensiveStops: number
  shots: number
  shotsMissed: number
  attackScore: number
  defenseScore: number
  overallScore: number
  awardScore?: number
  juryAdjustment?: number
  eliminatedInRound?: number
  eliminationStageLabel?: string
  isChampion?: boolean
}>

export type SeasonAward = Readonly<{
  id: string
  title: string
  stage: 'YOUTH' | 'CONFERENCE' | 'NATIONAL' | 'FINAL'
  metric: 'ATTACK' | 'DEFENSE' | 'OVERALL' | 'GOALS' | 'STOPS' | 'TEAM'
  conferenceId?: string
  winners: readonly AwardPlayer[]
  nominees: readonly AwardPlayer[]
}>

export type SeasonAwards = Readonly<{
  version: 1
  scoringMethod?: 'PHASE_AVERAGE' | 'PHASE_TOTAL'
  year: number
  minimumMatches: number
  awards: readonly SeasonAward[]
}>

export type IndividualHonor = Readonly<{
  awardId: string
  title: string
  conferenceId?: string
}>
