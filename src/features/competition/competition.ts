import { conferenceForRegion } from '../geography/loadGeography'
import { shuffle } from '../random/prng'

export type DrawMatch = Readonly<{ id: string; homeTeamId: string; awayTeamId: string }>
export type DrawRound = Readonly<{ matches: readonly DrawMatch[]; byeTeamIds: readonly string[] }>
export type CompetitionPhase = 'DEPARTMENT' | 'REGION' | 'CONFERENCE' | 'NATIONAL'

export function isFinalRound(round: DrawRound): boolean {
  return round.matches.length === 1 && round.byeTeamIds.length === 0
}

export type GeographyTeam = Readonly<{
  id: string
  departmentId: string
  regionId: string
  zoneId?: string
  conferenceId?: string
}>

export const phaseTarget: Record<CompetitionPhase, number> = {
  DEPARTMENT: 1024,
  REGION: 64,
  CONFERENCE: 4,
  NATIONAL: 1,
}

function groupTeams<T>(teams: readonly T[], key: (team: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>()
  for (const team of teams) {
    const id = key(team)
    groups.set(id, [...(groups.get(id) ?? []), team])
  }
  return groups
}

export function phaseForCount(count: number): CompetitionPhase {
  if (count > 1024) return 'DEPARTMENT'
  if (count > 64) return 'REGION'
  if (count > 4) return 'CONFERENCE'
  return 'NATIONAL'
}

export function allocateQuotas(
  inputs: readonly Readonly<{ territoryId: string; teamCount: number; maxSlots?: number }>[],
  target: number,
) {
  const total = inputs.reduce((sum, input) => sum + input.teamCount, 0)
  const calculated = inputs.map((input) => {
    const minSlots = input.teamCount > 0 && target >= inputs.length ? 1 : 0
    const exact = total > 0 ? (input.teamCount * target) / total : 0
    let slots = Math.max(minSlots, Math.floor(exact))
    if (input.maxSlots !== undefined) {
      slots = Math.min(slots, input.maxSlots)
    }
    return { ...input, slots, remainder: exact - slots }
  })
  let remaining = target - calculated.reduce((sum, item) => sum + item.slots, 0)
  if (remaining < 0) {
    for (const item of [...calculated].sort((a, b) => a.remainder - b.remainder)) {
      if (remaining >= 0) break
      if (item.slots > 1) {
        item.slots -= 1
        remaining += 1
      }
    }
  } else {
    while (remaining > 0) {
      let allocatedAny = false
      for (const item of [...calculated].sort((a, b) => b.remainder - a.remainder || a.territoryId.localeCompare(b.territoryId))) {
        if (remaining <= 0) break
        if (item.maxSlots === undefined || item.slots < item.maxSlots) {
          item.slots += 1
          remaining -= 1
          allocatedAny = true
        }
      }
      if (!allocatedAny) break
    }
  }
  return calculated.map(({ territoryId, slots }) => ({ territoryId, slots }))
}

export function createInitialRound(teams: readonly Readonly<{ id: string; departmentId: string }>[], seed: string): DrawRound {
  const matches: DrawMatch[] = []
  const byeTeamIds: string[] = []
  const departments = groupTeams(teams, (team) => team.departmentId)
  for (const [departmentId, departmentTeams] of [...departments].sort(([a], [b]) => a.localeCompare(b))) {
    const drawn = shuffle(departmentTeams, `${seed}|department|${departmentId}|round-1`)
    if (drawn.length % 2 === 1) byeTeamIds.push(drawn.pop()!.id)
    for (let index = 0; index < drawn.length; index += 2) {
      matches.push({ id: `D1:${departmentId}:${index / 2 + 1}`, homeTeamId: drawn[index].id, awayTeamId: drawn[index + 1].id })
    }
  }
  return Object.freeze({ matches: Object.freeze(matches), byeTeamIds: Object.freeze(byeTeamIds) })
}

export type CreatePhaseRoundOptions = Readonly<{
  preserveOrder?: boolean
}>

export function createPhaseRound(
  teams: readonly GeographyTeam[],
  seed: string,
  roundNumber: number,
  options?: CreatePhaseRoundOptions,
): DrawRound {
  const phase = phaseForCount(teams.length)
  const matches: DrawMatch[] = []
  const byeTeamIds: string[] = []
  const shouldPreserveOrder =
    options?.preserveOrder !== undefined
      ? options.preserveOrder
      : (phase === 'CONFERENCE' && roundNumber > 9) ||
        (phase === 'NATIONAL') ||
        (teams.length <= 16 && roundNumber > 1)

  if (phase === 'DEPARTMENT') {
    const deptGroups = groupTeams(teams, (t) => t.departmentId)
    const confGroups = groupTeams(teams, (t) => t.conferenceId ?? conferenceForRegion(t.regionId))
    const quotas = new Map<string, number>()

    if (confGroups.size === 4 && teams.length >= 1024) {
      for (const [, cTeams] of confGroups) {
        const cDeptGroups = groupTeams(cTeams, (t) => t.departmentId)
        const cQuotas = allocateQuotas(
          [...cDeptGroups].map(([deptId, members]) => ({ territoryId: deptId, teamCount: members.length })),
          256,
        )
        for (const q of cQuotas) quotas.set(q.territoryId, q.slots)
      }
    } else {
      const allQuotas = allocateQuotas(
        [...deptGroups].map(([deptId, members]) => ({ territoryId: deptId, teamCount: members.length })),
        phaseTarget.DEPARTMENT,
      )
      for (const q of allQuotas) quotas.set(q.territoryId, q.slots)
    }

    const isStart = roundNumber === 1

    for (const [deptId, members] of [...deptGroups].sort(([a], [b]) => a.localeCompare(b))) {
      const targetCount = quotas.get(deptId) ?? 1
      let matchCount = 0
      if (members.length <= targetCount) {
        matchCount = 0
      } else if (isStart) {
        const ratio = members.length / targetCount
        const roundsNeeded = Math.ceil(Math.log2(ratio))
        const targetRemaining = targetCount * Math.pow(2, roundsNeeded - 1)
        matchCount = members.length - targetRemaining
      } else {
        matchCount = Math.min(Math.floor(members.length / 2), members.length - targetCount)
      }

      const drawn = shuffle(members, `${seed}|${phase}|${roundNumber}|${deptId}`)
      const playing = drawn.slice(0, matchCount * 2)
      byeTeamIds.push(...drawn.slice(matchCount * 2).map((team) => team.id))
      for (let index = 0; index < playing.length; index += 2) {
        matches.push({ id: `${phase}:${roundNumber}:${deptId}:${index / 2 + 1}`, homeTeamId: playing[index].id, awayTeamId: playing[index + 1].id })
      }
    }

    // Paris may have too few clubs to produce a departmental match, or multiple
    // clubs that should not confront each other in the departmental phase.
    // 1) When a match is between two clubs from Paris (75), cross it with an eligible
    // Ile-de-France match (77, 78, 91, 92, 93, 94, 95): Paris 1 vs Paris 2 and IDF 1 vs IDF 2
    // become Paris 1 vs IDF 1 and Paris 2 vs IDF 2, without changing matches or survivors.
    // 2) When Paris clubs have byes, exchange each Paris bye for a participant in an
    // Ile-de-France match: the displaced club receives the bye, so the total number of
    // matches and survivors stays unchanged. If Paris loses, that department gains its place naturally.
    const ileDeFranceDepartments = new Set(['77', '78', '91', '92', '93', '94', '95'])
    const teamById = new Map(teams.map((team) => [team.id, team]))

    let pMatchIndex = matches.findIndex((m) => {
      const home = teamById.get(m.homeTeamId)
      const away = teamById.get(m.awayTeamId)
      return home?.departmentId === '75' && away?.departmentId === '75'
    })
    while (pMatchIndex !== -1) {
      const eligibleMatches = matches
        .map((match, index) => ({ match, index }))
        .filter(({ match, index }) => {
          if (index === pMatchIndex) return false
          const home = teamById.get(match.homeTeamId)
          const away = teamById.get(match.awayTeamId)
          return home && away && home.departmentId === away.departmentId && ileDeFranceDepartments.has(home.departmentId)
        })
      if (eligibleMatches.length === 0) break
      const [{ match: idfMatch, index: idfIndex }] = shuffle(eligibleMatches, `${seed}|${phase}|${roundNumber}|paris-cross|${pMatchIndex}`)
      const parisMatch = matches[pMatchIndex]
      matches[pMatchIndex] = { ...parisMatch, awayTeamId: idfMatch.homeTeamId }
      matches[idfIndex] = { ...idfMatch, homeTeamId: parisMatch.awayTeamId }

      pMatchIndex = matches.findIndex((m) => {
        const home = teamById.get(m.homeTeamId)
        const away = teamById.get(m.awayTeamId)
        return home?.departmentId === '75' && away?.departmentId === '75'
      })
    }

    const parisByes = byeTeamIds.filter((id) => deptGroups.get('75')?.some((team) => team.id === id))
    for (const parisId of parisByes) {
      const eligibleMatches = matches
        .map((match, index) => ({ match, index }))
        .filter(({ match }) => {
          const home = teamById.get(match.homeTeamId)
          const away = teamById.get(match.awayTeamId)
          return home && away && home.departmentId === away.departmentId && ileDeFranceDepartments.has(home.departmentId)
        })
      if (eligibleMatches.length === 0) break
      const [{ match, index }] = shuffle(eligibleMatches, `${seed}|${phase}|${roundNumber}|paris|${parisId}`)
      matches[index] = { ...match, homeTeamId: parisId }
      byeTeamIds.splice(byeTeamIds.indexOf(parisId), 1, match.homeTeamId)
    }
    // Recomputed department quotas can fall below the number of survivors
    // attainable with local pairings (e.g. an odd department count). Finish
    // the departmental phase by pairing surplus byes inside their conference,
    // preferring opponents from the same department. Never discard a qualifier.
    if (roundNumber === 4 && confGroups.size === 4) {
      for (const [confId, cTeams] of [...confGroups].sort(([a], [b]) => a.localeCompare(b))) {
        const conferenceMatches = matches.filter(match => {
          const home = teamById.get(match.homeTeamId)!
          return (home.conferenceId ?? conferenceForRegion(home.regionId)) === confId
        }).length
        let surplus = cTeams.length - conferenceMatches - 256
        if (surplus <= 0) continue
        const conferenceByes = byeTeamIds.map(id => teamById.get(id)!).filter(team =>
          (team.conferenceId ?? conferenceForRegion(team.regionId)) === confId)
        const byeGroups = groupTeams(conferenceByes, team => team.departmentId)
        const pairs: GeographyTeam[][] = []
        const leftovers: GeographyTeam[] = []
        for (const [, members] of [...byeGroups].sort(([a], [b]) => a.localeCompare(b))) {
          const drawn = shuffle(members, `${seed}|${phase}|${roundNumber}|quota|${members[0].departmentId}`)
          for (let i = 0; i + 1 < drawn.length; i += 2) pairs.push([drawn[i], drawn[i + 1]])
          if (drawn.length % 2) leftovers.push(drawn[drawn.length - 1])
        }
        for (let i = 0; i + 1 < leftovers.length; i += 2) pairs.push([leftovers[i], leftovers[i + 1]])
        for (const [home, away] of pairs) {
          if (surplus <= 0) break
          matches.push({ id: `${phase}:${roundNumber}:${home.departmentId}:quota_${surplus}`, homeTeamId: home.id, awayTeamId: away.id })
          byeTeamIds.splice(byeTeamIds.indexOf(home.id), 1)
          byeTeamIds.splice(byeTeamIds.indexOf(away.id), 1)
          surplus -= 1
        }
      }
    }
    return Object.freeze({ matches: Object.freeze(matches), byeTeamIds: Object.freeze(byeTeamIds) })
  }

  if (phase === 'REGION') {
    // 4 regional rounds grouped by region within each conference (Tours 5 to 8)
    const confGroups = groupTeams(teams, (t) => t.conferenceId ?? conferenceForRegion(t.regionId))
    const globalLeftovers: GeographyTeam[] = []

    for (const [, confTeams] of [...confGroups].sort(([a], [b]) => a.localeCompare(b))) {
      const regGroups = groupTeams(confTeams, (t) => t.regionId)
      const confLeftovers: GeographyTeam[] = []

      for (const [regId, regTeams] of [...regGroups].sort(([a], [b]) => a.localeCompare(b))) {
        const drawn = shuffle(regTeams, `${seed}|${phase}|${roundNumber}|${regId}`)
        const matchCount = Math.floor(drawn.length / 2)
        const playing = drawn.slice(0, matchCount * 2)
        if (drawn.length % 2 === 1) confLeftovers.push(drawn[drawn.length - 1])
        for (let index = 0; index < playing.length; index += 2) {
          matches.push({ id: `${phase}:${roundNumber}:${regId}:${index / 2 + 1}`, homeTeamId: playing[index].id, awayTeamId: playing[index + 1].id })
        }
      }

      // Pair leftover teams within the same conference so conference team counts remain equal powers of 2
      for (let index = 0; index < confLeftovers.length; index += 2) {
        if (index + 1 < confLeftovers.length) {
          const home = confLeftovers[index]
          const away = confLeftovers[index + 1]
          matches.push({ id: `${phase}:${roundNumber}:${home.regionId}:inter_${index / 2 + 1}`, homeTeamId: home.id, awayTeamId: away.id })
        } else {
          globalLeftovers.push(confLeftovers[index])
        }
      }
    }

    // Fallback for any leftovers across conferences if a conference had an odd number of teams
    for (let index = 0; index < globalLeftovers.length; index += 2) {
      if (index + 1 < globalLeftovers.length) {
        const home = globalLeftovers[index]
        const away = globalLeftovers[index + 1]
        matches.push({ id: `${phase}:${roundNumber}:${home.regionId}:cross_${index / 2 + 1}`, homeTeamId: home.id, awayTeamId: away.id })
      } else {
        byeTeamIds.push(globalLeftovers[index].id)
      }
    }

    return Object.freeze({ matches: Object.freeze(matches), byeTeamIds: Object.freeze(byeTeamIds) })
  }

  if (phase === 'CONFERENCE') {
    // 4 conference rounds within each conference (Tours 9 to 12)
    const confGroups = groupTeams(teams, (t) => t.conferenceId ?? conferenceForRegion(t.regionId))
    const leftovers: GeographyTeam[] = []

    for (const [confId, confTeams] of [...confGroups].sort(([a], [b]) => a.localeCompare(b))) {
      const drawn = shouldPreserveOrder ? confTeams : shuffle(confTeams, `${seed}|${phase}|${roundNumber}|${confId}`)
      const matchCount = Math.floor(drawn.length / 2)
      const playing = drawn.slice(0, matchCount * 2)
      if (drawn.length % 2 === 1) leftovers.push(drawn[drawn.length - 1])
      for (let index = 0; index < playing.length; index += 2) {
        matches.push({ id: `${phase}:${roundNumber}:${confId}:${index / 2 + 1}`, homeTeamId: playing[index].id, awayTeamId: playing[index + 1].id })
      }
    }

    for (let index = 0; index < leftovers.length; index += 2) {
      if (index + 1 < leftovers.length) {
        matches.push({ id: `${phase}:${roundNumber}:CROSS:${index / 2 + 1}`, homeTeamId: leftovers[index].id, awayTeamId: leftovers[index + 1].id })
      } else {
        byeTeamIds.push(leftovers[index].id)
      }
    }

    return Object.freeze({ matches: Object.freeze(matches), byeTeamIds: Object.freeze(byeTeamIds) })
  }

  // Phase NATIONAL (Final Four: Tours 13 & 14)
  const matchCount = Math.floor(teams.length / 2)
  let orderedTeams = [...teams]
  if (teams.length === 4) {
    // Standard Final Four bracket pairing:
    // Demi-finale 1: Champion Ouest vs Champion Nord
    // Demi-finale 2: Champion Sud-Ouest vs Champion Sud-Est
    const west = teams.find((t) => (t.conferenceId ?? conferenceForRegion(t.regionId)) === 'CONF_OUEST')
    const north = teams.find((t) => (t.conferenceId ?? conferenceForRegion(t.regionId)) === 'CONF_NORD')
    const southWest = teams.find((t) => (t.conferenceId ?? conferenceForRegion(t.regionId)) === 'CONF_SUD_OUEST')
    const southEast = teams.find((t) => (t.conferenceId ?? conferenceForRegion(t.regionId)) === 'CONF_SUD_EST')
    if (west && north && southWest && southEast) {
      orderedTeams = [west, north, southWest, southEast]
    }
  }

  const playing = orderedTeams.slice(0, matchCount * 2)
  if (orderedTeams.length % 2 === 1) byeTeamIds.push(orderedTeams[orderedTeams.length - 1].id)
  for (let index = 0; index < playing.length; index += 2) {
    matches.push({ id: `${phase}:${roundNumber}:FRANCE:${index / 2 + 1}`, homeTeamId: playing[index].id, awayTeamId: playing[index + 1].id })
  }

  return Object.freeze({ matches: Object.freeze(matches), byeTeamIds: Object.freeze(byeTeamIds) })
}
