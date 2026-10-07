import type { CompetitionPhase } from './competition'

export type CompetitionEchelon = 'NATIONAL' | 'CONFERENCE' | 'REGIONAL' | 'DEPARTMENTAL'

export interface EchelonMeta {
  echelon: CompetitionEchelon
  label: string
  icon: string
  color: string
  bgColor: string
  borderColor: string
  badgeClass: string
  pillClass: string
  cardClass: string
}

export const ECHELON_META: Record<CompetitionEchelon, EchelonMeta> = {
  NATIONAL: {
    echelon: 'NATIONAL',
    label: 'National',
    icon: '🏆',
    color: '#facc15',
    bgColor: 'rgba(234, 179, 8, 0.18)',
    borderColor: 'rgba(234, 179, 8, 0.45)',
    badgeClass: 'badge badge--gold',
    pillClass: 'trophy-pill trophy-pill--national',
    cardClass: 'trophy-kpi-card--gold',
  },
  CONFERENCE: {
    echelon: 'CONFERENCE',
    label: 'Conférence',
    icon: '👑',
    color: '#c084fc',
    bgColor: 'rgba(168, 85, 247, 0.16)',
    borderColor: 'rgba(168, 85, 247, 0.4)',
    badgeClass: 'badge badge--purple',
    pillClass: 'trophy-pill trophy-pill--conference',
    cardClass: 'trophy-kpi-card--conf',
  },
  REGIONAL: {
    echelon: 'REGIONAL',
    label: 'Régional',
    icon: '🌟',
    color: '#34d399',
    bgColor: 'rgba(16, 185, 129, 0.16)',
    borderColor: 'rgba(16, 185, 129, 0.4)',
    badgeClass: 'badge badge--emerald',
    pillClass: 'trophy-pill trophy-pill--region',
    cardClass: 'trophy-kpi-card--region',
  },
  DEPARTMENTAL: {
    echelon: 'DEPARTMENTAL',
    label: 'Départemental',
    icon: '🏅',
    color: '#94a3b8',
    bgColor: 'rgba(148, 163, 184, 0.12)',
    borderColor: 'rgba(148, 163, 184, 0.28)',
    badgeClass: 'badge badge--neutral',
    pillClass: 'trophy-pill trophy-pill--dept',
    cardClass: 'trophy-kpi-card--dept',
  },
}

/**
 * Détermine l'échelon territorial à partir du numéro de tour (1 à 14).
 * - Tours 1 à 4 : Départemental
 * - Tours 5 à 8 : Régional
 * - Tours 9 à 12 : Conférence
 * - Tours 13 & 14 : National (Demi-finales Nationales & Grande Finale)
 */
export function getEchelonFromRound(roundNumber?: number): CompetitionEchelon {
  if (!roundNumber || roundNumber <= 0) return 'DEPARTMENTAL'
  if (roundNumber >= 13) return 'NATIONAL'
  if (roundNumber >= 9) return 'CONFERENCE'
  if (roundNumber >= 5) return 'REGIONAL'
  return 'DEPARTMENTAL'
}

/**
 * Détermine l'échelon territorial à partir de la phase de compétition.
 */
export function getEchelonFromPhase(phase: CompetitionPhase): CompetitionEchelon {
  switch (phase) {
    case 'NATIONAL':
      return 'NATIONAL'
    case 'CONFERENCE':
      return 'CONFERENCE'
    case 'REGION':
      return 'REGIONAL'
    case 'DEPARTMENT':
    default:
      return 'DEPARTMENTAL'
  }
}

/**
 * Détermine l'échelon territorial à partir du libellé de parcours ou de distinction.
 */
export function getEchelonFromStageLabel(stageLabel?: string, roundNumber?: number): CompetitionEchelon {
  if (!stageLabel) {
    return roundNumber ? getEchelonFromRound(roundNumber) : 'DEPARTMENTAL'
  }

  const s = stageLabel.toLowerCase()

  // 1. National
  if (
    s.includes('france') ||
    s.includes('national') ||
    s.includes('sacre') ||
    s.includes('1/2 national') ||
    s.includes('demi-finaliste national') ||
    s.includes('finaliste national') ||
    s.includes('grande finale') ||
    s.includes('tour 13') ||
    s.includes('tour 14')
  ) {
    return 'NATIONAL'
  }

  // 2. Conférence
  if (
    s.includes('conférence') ||
    s.includes('conference') ||
    s.includes('8es de conf') ||
    s.includes('quarts de conf') ||
    s.includes('demi-finales de conf') ||
    s.includes('finale de conf') ||
    s.includes('tour 9') ||
    s.includes('tour 10') ||
    s.includes('tour 11') ||
    s.includes('tour 12')
  ) {
    return 'CONFERENCE'
  }

  // 3. Régional
  if (
    s.includes('région') ||
    s.includes('region') ||
    s.includes('tour 5') ||
    s.includes('tour 6') ||
    s.includes('tour 7') ||
    s.includes('tour 8')
  ) {
    return 'REGIONAL'
  }

  // 4. Départemental
  if (
    s.includes('départ') ||
    s.includes('depart') ||
    s.includes('tour 1') ||
    s.includes('tour 2') ||
    s.includes('tour 3') ||
    s.includes('tour 4')
  ) {
    return 'DEPARTMENTAL'
  }

  // Repli sur le numéro de tour si disponible
  return roundNumber ? getEchelonFromRound(roundNumber) : 'DEPARTMENTAL'
}

/**
 * Retourne la classe CSS de badge normalisée ('badge badge--gold', etc.) pour un échelon.
 */
export function getEchelonBadgeClass(echelon: CompetitionEchelon): string {
  return ECHELON_META[echelon].badgeClass
}

/**
 * Retourne la classe CSS de badge pour un numéro de tour donné.
 */
export function getRoundBadgeClass(roundNumber?: number): string {
  return getEchelonBadgeClass(getEchelonFromRound(roundNumber))
}

/**
 * Retourne la classe CSS de badge pour une phase de compétition.
 */
export function getPhaseBadgeClass(phase: CompetitionPhase): string {
  return getEchelonBadgeClass(getEchelonFromPhase(phase))
}

/**
 * Retourne la classe CSS de badge pour un libellé de parcours (ex: 'Demi-finales de Conférence', 'Tour 6 (Régional)').
 */
export function getStageBadgeClass(stageLabel?: string, roundNumber?: number): string {
  return getEchelonBadgeClass(getEchelonFromStageLabel(stageLabel, roundNumber))
}

/**
 * Retourne la classe de pill pour un titre (trophy-pill--national, etc.)
 */
export function getTrophyPillClass(echelon: CompetitionEchelon): string {
  return ECHELON_META[echelon].pillClass
}

/**
 * Détermine la classe trophy-pill à partir d'un intitulé de titre ou d'échelon.
 */
export function getTrophyPillClassFromTitle(title: string): string {
  const echelon = getEchelonFromStageLabel(title)
  return ECHELON_META[echelon].pillClass
}
