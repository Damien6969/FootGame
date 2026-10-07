import { useMemo } from 'react'
import type { Person } from '../persons/types'
import type { SeasonArchive } from '../storage/cupRepository'
import type { PlayerSeasonHonor } from '../history/playerPalmaresStorage'
import { isTeamHonor } from './seasonAwards'
import './awards.css'

export type PlayerPastHonorsSummary = {
  personId: string
  // Distinctions majeures nationales
  ballonOrCount: number
  ballonOrYears: number[]
  topScorerCount: number
  topScorerYears: number[]
  topStopsCount: number // Bouclier d'Or / Roi des interventions
  topStopsYears: number[]
  bestDefenderCount: number
  bestDefenderYears: number[]
  bestAttackerCount: number
  bestAttackerYears: number[]
  youthCount: number
  youthYears: number[]
  youthDetails: Array<{ year: number; title: string }>
  // Distinctions de conférence
  conferenceCount: number
  conferenceYears: number[]
  conferenceDetails: Array<{ year: number; title: string; conferenceId?: string }>
  totalCount: number
}

export type BuildPastHonorsMapParams = {
  ceremonyYear: number
  archives?: readonly SeasonArchive[]
  persons?: readonly Person[]
  playerSeasonHonors?: readonly PlayerSeasonHonor[]
}

/**
 * Construit un dictionnaire optimisé de l'ancien palmarès des joueurs
 * strictement antérieur à l'année de la cérémonie actuelle (year < ceremonyYear).
 * Déduplique les doublons entre archives, personnes et IndexedDB.
 */
export function buildPastHonorsMap({
  ceremonyYear,
  archives = [],
  persons = [],
  playerSeasonHonors = [],
}: BuildPastHonorsMapParams): Map<string, PlayerPastHonorsSummary> {
  const map = new Map<string, PlayerPastHonorsSummary>()
  const seen = new Set<string>()

  function getSummary(personId: string): PlayerPastHonorsSummary {
    let existing = map.get(personId)
    if (!existing) {
      existing = {
        personId,
        ballonOrCount: 0,
        ballonOrYears: [],
        topScorerCount: 0,
        topScorerYears: [],
        topStopsCount: 0,
        topStopsYears: [],
        bestDefenderCount: 0,
        bestDefenderYears: [],
        bestAttackerCount: 0,
        bestAttackerYears: [],
        youthCount: 0,
        youthYears: [],
        youthDetails: [],
        conferenceCount: 0,
        conferenceYears: [],
        conferenceDetails: [],
        totalCount: 0,
      }
      map.set(personId, existing)
    }
    return existing
  }

  function addHonor(personId: string, year: number, awardId: string, title = '', conferenceId?: string) {
    if (!personId || year >= ceremonyYear) return
    if (isTeamHonor({ awardId, title })) return

    const key = `${personId}:${year}:${awardId}`
    if (seen.has(key)) return
    seen.add(key)

    const summary = getSummary(personId)
    if (awardId === 'ballon-or') {
      summary.ballonOrCount += 1
      summary.ballonOrYears.push(year)
      summary.totalCount += 1
    } else if (awardId === 'top-scorer') {
      summary.topScorerCount += 1
      summary.topScorerYears.push(year)
      summary.totalCount += 1
    } else if (awardId === 'top-stops') {
      summary.topStopsCount += 1
      summary.topStopsYears.push(year)
      summary.totalCount += 1
    } else if (awardId === 'best-defender') {
      summary.bestDefenderCount += 1
      summary.bestDefenderYears.push(year)
      summary.totalCount += 1
    } else if (awardId === 'best-attacker') {
      summary.bestAttackerCount += 1
      summary.bestAttackerYears.push(year)
      summary.totalCount += 1
    } else if (awardId.startsWith('young-')) {
      summary.youthCount += 1
      summary.youthYears.push(year)
      summary.youthDetails.push({ year, title: title || awardId })
      summary.totalCount += 1
    } else if (awardId.startsWith('conference-')) {
      summary.conferenceCount += 1
      summary.conferenceYears.push(year)
      summary.conferenceDetails.push({ year, title: title || awardId, conferenceId })
      summary.totalCount += 1
    }
  }

  // 1. Scanner les archives passées
  for (const arch of archives) {
    if (arch.year >= ceremonyYear) continue
    if (arch.individualAwards?.awards) {
      for (const award of arch.individualAwards.awards) {
        if (award.winners) {
          for (const winner of award.winners) {
            if (winner.personId) {
              addHonor(winner.personId, arch.year, award.id, award.title, award.conferenceId)
            }
          }
        }
      }
    }
    if (arch.persons) {
      for (const p of arch.persons) {
        if (p.careerHistory) {
          for (const s of p.careerHistory) {
            if (s.year < ceremonyYear && s.individualHonors) {
              for (const h of s.individualHonors) {
                addHonor(p.id, s.year, h.awardId, h.title, h.conferenceId)
              }
            }
          }
        }
      }
    }
  }

  // 2. Scanner les carrières des joueurs en mémoire
  for (const p of persons) {
    if (p.careerHistory) {
      for (const s of p.careerHistory) {
        if (s.year < ceremonyYear && s.individualHonors) {
          for (const h of s.individualHonors) {
            addHonor(p.id, s.year, h.awardId, h.title, h.conferenceId)
          }
        }
      }
    }
  }

  // 3. Scanner les données sauvegardées de playerSeasonHonors
  for (const record of playerSeasonHonors) {
    if (record.year < ceremonyYear && record.individualHonors) {
      for (const h of record.individualHonors) {
        addHonor(record.personId, record.year, h.awardId, h.title, h.conferenceId)
      }
    }
  }

  // 4. Trier les années par ordre chronologique
  for (const s of map.values()) {
    s.ballonOrYears.sort((a, b) => a - b)
    s.topScorerYears.sort((a, b) => a - b)
    s.topStopsYears.sort((a, b) => a - b)
    s.bestDefenderYears.sort((a, b) => a - b)
    s.bestAttackerYears.sort((a, b) => a - b)
    s.youthYears.sort((a, b) => a - b)
    s.youthDetails.sort((a, b) => a.year - b.year)
    s.conferenceYears.sort((a, b) => a - b)
    s.conferenceDetails.sort((a, b) => a.year - b.year)
  }

  return map
}

export type PlayerPastHonorsBadgeProps = {
  personId: string
  pastHonorsMap?: Map<string, PlayerPastHonorsSummary>
  isConferenceStage?: boolean
  size?: 'small' | 'medium' | 'large'
}

type BadgeItem = {
  key: string
  icon: string
  count: number
  className: string
  label: string
  title: string
}

export function PlayerPastHonorsBadge({
  personId,
  pastHonorsMap,
  isConferenceStage = false,
  size = 'medium',
}: PlayerPastHonorsBadgeProps) {
  const summary = pastHonorsMap?.get(personId)

  const badges = useMemo<BadgeItem[]>(() => {
    if (!summary || summary.totalCount === 0) return []
    const list: BadgeItem[] = []

    // 1. Ballon d'Or
    if (summary.ballonOrCount > 0) {
      list.push({
        key: 'ballon-or',
        icon: '⚽',
        count: summary.ballonOrCount,
        className: 'past-honor-badge--ballon',
        label: `${summary.ballonOrCount} Ballon d’Or`,
        title: `${summary.ballonOrCount}× Ballon d’Or (${summary.ballonOrYears.join(', ')})`,
      })
    }

    // 2. Soulier d'Or
    if (summary.topScorerCount > 0) {
      list.push({
        key: 'top-scorer',
        icon: '👟',
        count: summary.topScorerCount,
        className: 'past-honor-badge--scorer',
        label: `${summary.topScorerCount} Soulier d’Or`,
        title: `${summary.topScorerCount}× Soulier d’Or · Meilleur buteur (${summary.topScorerYears.join(', ')})`,
      })
    }

    // 3. Bouclier d'Or (Roi des interventions / Défenseur d'Or)
    if (summary.topStopsCount > 0) {
      list.push({
        key: 'top-stops',
        icon: '🛡️',
        count: summary.topStopsCount,
        className: 'past-honor-badge--stops',
        label: `${summary.topStopsCount} Bouclier d’Or`,
        title: `${summary.topStopsCount}× Bouclier d’Or · Roi des interventions (${summary.topStopsYears.join(', ')})`,
      })
    }

    // 4. Meilleur défenseur de la saison
    if (summary.bestDefenderCount > 0) {
      list.push({
        key: 'best-defender',
        icon: '🛡️',
        count: summary.bestDefenderCount,
        className: 'past-honor-badge--defender',
        label: `${summary.bestDefenderCount} Meilleur défenseur`,
        title: `${summary.bestDefenderCount}× Meilleur défenseur de la saison (${summary.bestDefenderYears.join(', ')})`,
      })
    }

    // 5. Meilleur attaquant de la saison
    if (summary.bestAttackerCount > 0) {
      list.push({
        key: 'best-attacker',
        icon: '⚔️',
        count: summary.bestAttackerCount,
        className: 'past-honor-badge--attacker',
        label: `${summary.bestAttackerCount} Meilleur attaquant`,
        title: `${summary.bestAttackerCount}× Meilleur attaquant de la saison (${summary.bestAttackerYears.join(', ')})`,
      })
    }

    // 6. Trophées Espoir
    if (summary.youthCount > 0) {
      list.push({
        key: 'youth',
        icon: '🌱',
        count: summary.youthCount,
        className: 'past-honor-badge--youth',
        label: `${summary.youthCount} Trophée Espoir`,
        title: `${summary.youthCount}× Trophée Espoir (${summary.youthDetails.map(d => `${d.title} ${d.year}`).join(', ')})`,
      })
    }

    // 7. Trophées de Conférence (visibles uniquement lors des remises de prix de conférence)
    if (isConferenceStage && summary.conferenceCount > 0) {
      list.push({
        key: 'conference',
        icon: '🏛️',
        count: summary.conferenceCount,
        className: 'past-honor-badge--conference',
        label: `${summary.conferenceCount} Trophée de Conférence`,
        title: `${summary.conferenceCount}× Trophée de Conférence (${summary.conferenceDetails.map(d => `${d.title} ${d.year}`).join(', ')})`,
      })
    }

    return list
  }, [summary, isConferenceStage])

  if (!badges.length) return null

  return (
    <span
      className={`award-past-honors award-past-honors--${size}`}
      role="group"
      aria-label="Ancien palmarès"
    >
      {badges.map(badge => (
        <span
          key={badge.key}
          className={`past-honor-badge ${badge.className}`}
          title={badge.title}
          aria-label={badge.label}
        >
          <span className="past-honor-icon" aria-hidden="true">{badge.icon}</span>
          {badge.count > 1 && <span className="past-honor-count">{badge.count}</span>}
        </span>
      ))}
    </span>
  )
}
