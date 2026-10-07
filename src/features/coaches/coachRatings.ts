import { COACH_BALANCE as B } from '../../config/coachBalance'
import type { Person, PersonCareerSeason } from '../persons/types'
import type { CoachSnapshot } from './types'

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))

export function competitionRating(phase: string): number {
  return B.competitionRatings[phase as keyof typeof B.competitionRatings] ?? 1
}

function seasonExperience(season: PersonCareerSeason): number {
  if (season.role !== 'PLAYER' || season.isStarter === false || !(season.matchesPlayed! > 0)) return 1
  if (season.competitionLevel !== undefined) return season.competitionLevel
  // Anciennes carrières : le parcours annuel est la seule trace disponible.
  const round = season.roundReached ?? 1
  return round >= 13 ? 30 : round >= 9 ? 24 : round >= 5 ? 16 : 8
}

export function computeCoachPeakSkill(person: Pick<Person, 'position' | 'attack' | 'defense' | 'peakAttack' | 'peakDefense' | 'careerHistory' | 'coachSkill'>): number {
  const seasons = (person.careerHistory ?? []).filter(s => s.role === 'PLAYER')
  const attack = person.peakAttack ?? Math.max(person.attack, ...seasons.map(s => s.attack))
  const defense = person.peakDefense ?? Math.max(person.defense, ...seasons.map(s => s.defense))
  const overall = Math.round(person.position === 'ATTACKER' ? attack * .7 + defense * .3 : defense * .7 + attack * .3)
  const experience = Math.max(1, ...seasons.map(seasonExperience))
  return clamp(Math.round(overall * B.peakPlayerWeight + experience * (1 - B.peakPlayerWeight)), 1, 30)
}

export function getCoachPeakAge(startAge: number): number {
  return Math.max(startAge + 1, clamp(startAge + B.yearsToPeak, B.earliestPeakAge, B.latestPeakAge))
}

export function computeCoachSkillAtAge(peak: number, age: number, startAge: number, peakAge: number): number {
  let ratio = 1
  if (age < peakAge) {
    const t = clamp((age - startAge) / Math.max(1, peakAge - startAge), 0, 1)
    ratio = B.startRatio + (1 - B.startRatio) * t * (2 - t)
  } else if (age > peakAge + 1) {
    const t = clamp((age - peakAge - 1) / Math.max(1, B.retirementAge - peakAge - 1), 0, 1)
    ratio = Math.max(B.declineFloor, 1 - (1 - B.declineFloor) * t * t)
  }
  return clamp(Math.round(peak * ratio), 1, peak)
}

export function isActiveCoach(person: Person): boolean {
  return person.primaryRole === 'COACH' && person.isRetired === true && !!person.currentClubId && !person.coachRetiredYear && person.age < B.retirementAge
}

export function computeCoachBonus(coachSkill: number | undefined | null, baseStrength: number): number {
  if (!coachSkill || coachSkill <= 0) return 0
  const diff = coachSkill - baseStrength
  if (diff >= 0) {
    return Math.round((B.coachBaseBonus + diff * B.coachUpsideWeight) * 10) / 10
  }
  const basePart = Math.max(0, B.coachBaseBonus - (-diff) * B.coachDeficitWeight)
  return Math.round(basePart * 10) / 10
}

export function coachSnapshot(person: Person, baseStrength?: number): CoachSnapshot {
  const skill = person.coachSkill ?? 1
  const bonus = baseStrength !== undefined
    ? computeCoachBonus(skill, baseStrength)
    : Math.round(skill * B.bonusWeight * 10) / 10
  return {
    personId: person.id,
    name: `${person.firstName} ${person.lastName}`,
    age: person.age,
    skill,
    peakSkill: person.coachPeakSkill ?? computeCoachPeakSkill(person),
    peakAge: person.coachPeakAge ?? getCoachPeakAge(person.coachStartAge ?? person.age),
    bonus,
  }
}

/** Tour attendu en Coupe selon le standing/force du club (14 tours au total). */
export function expectedRoundForStrength(strength: number): number {
  if (strength >= 25) return 11
  if (strength >= 20) return 9
  if (strength >= 15) return 7
  if (strength >= 10) return 4
  return 2
}
