import { describe, expect, it } from 'vitest'
import {
  getEchelonFromPhase,
  getEchelonFromRound,
  getEchelonFromStageLabel,
  getPhaseBadgeClass,
  getRoundBadgeClass,
  getStageBadgeClass,
  getTrophyPillClassFromTitle,
} from './echelonColors'

describe('echelonColors', () => {
  it('maps round numbers correctly to echelons', () => {
    // Départemental (Tours 1 à 4)
    expect(getEchelonFromRound(1)).toBe('DEPARTMENTAL')
    expect(getEchelonFromRound(4)).toBe('DEPARTMENTAL')
    expect(getRoundBadgeClass(1)).toBe('badge badge--neutral')
    expect(getRoundBadgeClass(4)).toBe('badge badge--neutral')

    // Régional (Tours 5 à 8)
    expect(getEchelonFromRound(5)).toBe('REGIONAL')
    expect(getEchelonFromRound(8)).toBe('REGIONAL')
    expect(getRoundBadgeClass(5)).toBe('badge badge--emerald')
    expect(getRoundBadgeClass(8)).toBe('badge badge--emerald')

    // Conférence (Tours 9 à 12)
    expect(getEchelonFromRound(9)).toBe('CONFERENCE')
    expect(getEchelonFromRound(12)).toBe('CONFERENCE')
    expect(getRoundBadgeClass(9)).toBe('badge badge--purple')
    expect(getRoundBadgeClass(12)).toBe('badge badge--purple')

    // National (Tours 13 & 14)
    expect(getEchelonFromRound(13)).toBe('NATIONAL')
    expect(getEchelonFromRound(14)).toBe('NATIONAL')
    expect(getRoundBadgeClass(13)).toBe('badge badge--gold')
    expect(getRoundBadgeClass(14)).toBe('badge badge--gold')
  })

  it('maps competition phases correctly to echelons and badge classes', () => {
    expect(getEchelonFromPhase('DEPARTMENT')).toBe('DEPARTMENTAL')
    expect(getPhaseBadgeClass('DEPARTMENT')).toBe('badge badge--neutral')

    expect(getEchelonFromPhase('REGION')).toBe('REGIONAL')
    expect(getPhaseBadgeClass('REGION')).toBe('badge badge--emerald')

    expect(getEchelonFromPhase('CONFERENCE')).toBe('CONFERENCE')
    expect(getPhaseBadgeClass('CONFERENCE')).toBe('badge badge--purple')

    expect(getEchelonFromPhase('NATIONAL')).toBe('NATIONAL')
    expect(getPhaseBadgeClass('NATIONAL')).toBe('badge badge--gold')
  })

  it('maps stage labels accurately to echelons and badge classes', () => {
    // National
    expect(getEchelonFromStageLabel('Champion de France 🏆')).toBe('NATIONAL')
    expect(getEchelonFromStageLabel('Demi-finaliste National 🥉')).toBe('NATIONAL')
    expect(getEchelonFromStageLabel('Finaliste National 🥈')).toBe('NATIONAL')
    expect(getEchelonFromStageLabel('Demi-finales Nationales')).toBe('NATIONAL')
    expect(getStageBadgeClass('Champion de France 🏆')).toBe('badge badge--gold')

    // Conférence
    expect(getEchelonFromStageLabel('Champion de Conférence 👑')).toBe('CONFERENCE')
    expect(getEchelonFromStageLabel('Finale de Conférence')).toBe('CONFERENCE')
    expect(getEchelonFromStageLabel('Demi-finales de Conférence')).toBe('CONFERENCE')
    expect(getEchelonFromStageLabel('Quarts de Conférence')).toBe('CONFERENCE')
    expect(getEchelonFromStageLabel('8es de Conférence')).toBe('CONFERENCE')
    expect(getStageBadgeClass('Demi-finales de Conférence')).toBe('badge badge--purple')

    // Régional
    expect(getEchelonFromStageLabel('Champion Régional 🌟')).toBe('REGIONAL')
    expect(getEchelonFromStageLabel('Tour 5 (Régional)')).toBe('REGIONAL')
    expect(getEchelonFromStageLabel('Tour 8 (Régional)')).toBe('REGIONAL')
    expect(getStageBadgeClass('Tour 6 (Régional)')).toBe('badge badge--emerald')

    // Départemental
    expect(getEchelonFromStageLabel('Champion Départemental 🏅')).toBe('DEPARTMENTAL')
    expect(getEchelonFromStageLabel('Tour 1 (Départemental)')).toBe('DEPARTMENTAL')
    expect(getEchelonFromStageLabel('Tour 3 (Départemental)')).toBe('DEPARTMENTAL')
    expect(getStageBadgeClass('Tour 2 (Départemental)')).toBe('badge badge--neutral')
  })

  it('determines trophy pill classes from title strings', () => {
    expect(getTrophyPillClassFromTitle('Champion de France')).toBe('trophy-pill trophy-pill--national')
    expect(getTrophyPillClassFromTitle('Champion de Conférence')).toBe('trophy-pill trophy-pill--conference')
    expect(getTrophyPillClassFromTitle('Champion Régional')).toBe('trophy-pill trophy-pill--region')
    expect(getTrophyPillClassFromTitle('Champion Départemental')).toBe('trophy-pill trophy-pill--dept')
  })
})
