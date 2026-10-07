import { selectClubStarters } from './playerSelection'
import { getArchivedPlayerStatistics, getActivePlayerStatistics } from './playerStatistics'
import type { Person, PlayerPosition, PersonRoleType, PersonSortKey, SortDirection, PersonTrophyRecord, PersonCareerSeason } from './types'
import type { SeasonArchive, CupSession, TeamSeasonPerformance } from '../storage/cupRepository'
import type { Club } from '../teams/types'
import { getCompletedSessionTeamPerformances, getStageLabel, parseSeasonYear } from '../history/palmaresSelectors'
import { getPlayerHonors, getSeasonAwards, isTeamHonor } from '../awards/seasonAwards'
import { computeCoachPeakSkill, isActiveCoach } from '../coaches/coachRatings'
import { resolveCareerSeasonClub } from '../teams/clubResolution'

export function computeOverallRating(person: Person): number {
  if (person.primaryRole === 'COACH') return person.coachSkill ?? computeCoachPeakSkill(person)
  if (person.position === 'ATTACKER') {
    return Math.round(person.attack * 0.7 + person.defense * 0.3)
  }
  return Math.round(person.defense * 0.7 + person.attack * 0.3)
}

export function computePeakOverallRating(person: Person): number {
  if (person.primaryRole === 'COACH') return person.coachPeakSkill ?? computeCoachPeakSkill(person)
  const peakAtk = person.peakAttack ?? person.attack
  const peakDef = person.peakDefense ?? person.defense
  if (person.position === 'ATTACKER') {
    return Math.round(peakAtk * 0.7 + peakDef * 0.3)
  }
  return Math.round(peakDef * 0.7 + peakAtk * 0.3)
}

export function formatCareerPhase(phase: 'GROWTH' | 'PEAK' | 'DECLINE'): {
  label: string
  shortLabel: string
  badgeClass: string
  icon: string
  color: string
} {
  switch (phase) {
    case 'GROWTH':
      return {
        label: 'En progression',
        shortLabel: 'Progression',
        badgeClass: 'badge--blue',
        icon: '📈',
        color: '#38bdf8',
      }
    case 'PEAK':
      return {
        label: 'À son apogée',
        shortLabel: 'Apogée',
        badgeClass: 'badge--amber',
        icon: '👑',
        color: '#f59e0b',
      }
    case 'DECLINE':
      return {
        label: 'En déclin',
        shortLabel: 'Déclin',
        badgeClass: 'badge--neutral',
        icon: '📉',
        color: '#94a3b8',
      }
  }
}

export function formatPosition(pos?: PlayerPosition): string {
  if (pos === 'ATTACKER') return 'Attaquant'
  if (pos === 'DEFENDER') return 'Défenseur'
  return 'Joueur'
}

export function formatRole(role?: PersonRoleType): string {
  if (role === 'PLAYER') return 'Joueur'
  if (role === 'COACH') return 'Entraîneur'
  if (role === 'PRESIDENT') return 'Président'
  return 'Personnalité'
}

export function getClubRoster(persons: readonly Person[], clubId: string): Person[] {
  return persons
    .filter((p) => p.currentClubId === clubId && !p.isRetired && p.primaryRole === 'PLAYER')
    .sort((a, b) => {
      // Priorité à l'attaquant titulaire, puis au défenseur titulaire, puis par note globale
      if (a.assignedPosition === 'ATTACKER' && b.assignedPosition !== 'ATTACKER') return -1
      if (b.assignedPosition === 'ATTACKER' && a.assignedPosition !== 'ATTACKER') return 1
      if (a.assignedPosition === 'DEFENDER' && b.assignedPosition !== 'DEFENDER') return -1
      if (b.assignedPosition === 'DEFENDER' && a.assignedPosition !== 'DEFENDER') return 1
      return computeOverallRating(b) - computeOverallRating(a)
    })
}

/**
 * Renvoie les 2 titulaires actifs d'un club pour la saison en cours (1 Attaquant, 1 Défenseur).
 * Respecte fidèlement le profil du joueur lorsqu'un seul joueur est présent dans l'effectif.
 */
export function getClubActiveStarters(
  persons: readonly Person[],
  clubId: string,
): { attacker: Person | null; defender: Person | null } {
  const roster = persons.filter(p => p.currentClubId === clubId && !p.isRetired)
  const { attacker, defender } = selectClubStarters(roster, true)
  return { attacker, defender }
}

/**
 * Renvoie tous les joueurs sous contrat avec ce club (y compris ceux actuellement prêtés ailleurs).
 */
export function getClubContractedPlayers(persons: readonly Person[], clubId: string): Person[] {
  return persons
    .filter((p) => (p.parentClubId === clubId || (!p.parentClubId && p.currentClubId === clubId)) && !p.isRetired)
    .sort((a, b) => computeOverallRating(b) - computeOverallRating(a))
}

/**
 * Renvoie les joueurs appartenant au club qui ont été prêtés à un autre club cette saison.
 */
export function getClubLoanedOut(persons: readonly Person[], clubId: string): Person[] {
  return persons
    .filter(
      (p) =>
        (p.parentClubId === clubId || p.loanedFromClubId === clubId) &&
        p.currentClubId !== clubId &&
        !p.isRetired,
    )
    .sort((a, b) => computeOverallRating(b) - computeOverallRating(a))
}

/**
 * Renvoie les joueurs actuellement dans l'effectif du club qui sont en prêt depuis un autre club.
 */
export function getClubLoanedIn(persons: readonly Person[], clubId: string): Person[] {
  return persons
    .filter(
      (p) =>
        p.currentClubId === clubId &&
        Boolean(p.loanedFromClubId) &&
        p.loanedFromClubId !== clubId &&
        !p.isRetired,
    )
    .sort((a, b) => computeOverallRating(b) - computeOverallRating(a))
}

export function getCommuneNatives(persons: readonly Person[], communeId: string): Person[] {
  return persons
    .filter((p) => p.birthCommuneId === communeId)
    .sort((a, b) => computeOverallRating(b) - computeOverallRating(a))
}

const archivePersonsMapCache = new WeakMap<SeasonArchive, Map<string, Person>>()
function getArchivePersonsMap(archive: SeasonArchive): Map<string, Person> | undefined {
  if (!archive.persons) return undefined
  let map = archivePersonsMapCache.get(archive)
  if (!map) {
    map = new Map(archive.persons.map((p) => [p.id, p]))
    archivePersonsMapCache.set(archive, map)
  }
  return map
}

const sessionEliminationsCache = new WeakMap<CupSession, Map<string, { roundNumber: number }>>()
function getSessionEliminationsMap(session: CupSession): Map<string, { roundNumber: number }> {
  let map = sessionEliminationsCache.get(session)
  if (!map) {
    map = new Map()
    for (const m of session.history) {
      if (m.result?.winnerId) {
        const loserId = m.homeTeamId === m.result.winnerId ? m.awayTeamId : m.homeTeamId
        if (!map.has(loserId)) {
          map.set(loserId, { roundNumber: m.roundNumber })
        }
      }
    }
    sessionEliminationsCache.set(session, map)
  }
  return map
}

/**
 * Calcule l'historique complet de carrière et le palmarès de trophées d'un joueur,
 * en combinant son historique individuel, les archives officielles et la session active.
 */
export function computePersonTrophyRecord(
  person: Person,
  archives: readonly SeasonArchive[] = [],
  activeSession?: CupSession | null,
  clubsById?: Map<string, Club>,
  activeTeamPerformance?: TeamSeasonPerformance,
): PersonTrophyRecord {
  const seasonsMap = new Map<number, PersonCareerSeason>()

  // 1. Saisons enregistrées dans l'historique individuel du joueur
  if (person.careerHistory) {
    for (const s of person.careerHistory) {
      // Filtrer toute ancienne donnée factice générée avant la simulation
      if (
        s.stageLabel === 'Formation & débuts au club' ||
        s.stageLabel === 'Compétitions & championnats locaux'
      ) {
        continue
      }
      const resolved = resolveCareerSeasonClub(
        { year: s.year, clubId: s.clubId, clubName: s.clubName },
        { person, clubsById, session: activeSession, archives },
      )
      const parentClubId = s.parentClubId ?? (s.isLoan ? person.loanedFromClubId : person.parentClubId)
      const resolvedParent = parentClubId
        ? resolveCareerSeasonClub(
            { year: s.year, clubId: parentClubId, clubName: s.parentClubName },
            { clubsById, session: activeSession, archives },
          )
        : null
      const parentClubName = resolvedParent?.clubName ?? s.parentClubName ?? (parentClubId && clubsById ? clubsById.get(parentClubId)?.name : undefined)
      const cleanHonors = s.individualHonors ? s.individualHonors.filter(h => !isTeamHonor(h)) : undefined
      seasonsMap.set(s.year, {
        ...s,
        clubId: resolved.clubId ?? s.clubId,
        clubName: resolved.clubName,
        parentClubId: parentClubId ?? s.parentClubId,
        parentClubName: parentClubName ?? s.parentClubName,
        individualHonors: cleanHonors?.length ? cleanHonors : undefined,
      })
    }
  }

  // 2. Compléter ou enrichir depuis les archives des saisons terminées
  for (const archive of archives) {
    const existing = seasonsMap.get(archive.year)
    // Ne lier l'archive que si la personne y figurait avec un club ou possède déjà cette saison
    const personInArch = archive.persons ? getArchivePersonsMap(archive)?.get(person.id) : undefined
    const rawClubId = personInArch !== undefined ? personInArch.currentClubId : existing?.clubId

    if (rawClubId && archive.teamPerformances[rawClubId]) {
      const perf = archive.teamPerformances[rawClubId]
      const rawClubName = perf.clubName ?? existing?.clubName ?? clubsById?.get(rawClubId)?.name
      const resolved = resolveCareerSeasonClub(
        { year: archive.year, clubId: rawClubId, clubName: rawClubName },
        { person, clubsById, session: activeSession, archives },
      )
      const clubId = resolved.clubId ?? rawClubId
      const clubName = resolved.clubName
      const recordedRole = personInArch?.primaryRole ?? existing?.role ?? person.primaryRole

      const archivedStats = getArchivedPlayerStatistics(archive, {
        ...person,
        primaryRole: recordedRole,
        currentClubId: rawClubId,
        isRetired: false,
        assignedPosition: existing?.assignedPosition,
      })
      const isStarter = recordedRole === 'PLAYER' && (existing?.isStarter ?? archivedStats?.isStarter ?? true)
      const earnsTeamTitles = isStarter || (recordedRole === 'COACH' &&
        (perf.coach ? perf.coach.personId === person.id : personInArch ? isActiveCoach(personInArch) : true))
      const archMatchesPlayed = isStarter ? (existing?.matchesPlayed ?? archivedStats?.matchesPlayed ?? 0) : 0
      const archGoals = isStarter ? (existing?.goals ?? archivedStats?.goals ?? 0) : 0
      const archDefensiveStops = isStarter ? (existing?.defensiveStops ?? archivedStats?.defensiveStops ?? 0) : 0
      const archShots = isStarter ? (existing?.shots ?? archivedStats?.shots ?? 0) : 0
      const archShotsMissed = isStarter ? (existing?.shotsMissed ?? archivedStats?.shotsMissed ?? 0) : 0

      const isLoan =
        existing?.isLoan ??
        (personInArch
          ? Boolean(personInArch.loanedFromClubId && personInArch.loanedFromClubId !== rawClubId)
          : Boolean(person.loanedFromClubId && person.loanedFromClubId !== rawClubId))
      const parentClubId =
        existing?.parentClubId ??
        personInArch?.parentClubId ??
        (isLoan ? (personInArch?.loanedFromClubId ?? person.loanedFromClubId) : (person.parentClubId ?? undefined))
      const resolvedParent = parentClubId
        ? resolveCareerSeasonClub(
            { year: archive.year, clubId: parentClubId, clubName: existing?.parentClubName },
            { clubsById, session: activeSession, archives },
          )
        : null
      const parentClubName =
        resolvedParent?.clubName ??
        existing?.parentClubName ??
        (parentClubId
          ? (clubsById?.get(parentClubId)?.name ?? archive.teamPerformances[parentClubId]?.clubName)
          : undefined)

      seasonsMap.set(archive.year, {
        year: archive.year,
        clubId,
        clubName,
        role: personInArch?.primaryRole ?? existing?.role ?? person.primaryRole,
        age: personInArch?.age ?? existing?.age ?? person.age,
        attack: personInArch?.attack ?? existing?.attack ?? person.attack,
        defense: personInArch?.defense ?? existing?.defense ?? person.defense,
        coachSkill: recordedRole === 'COACH' ? (personInArch?.coachSkill ?? existing?.coachSkill ?? perf.coach?.skill) : undefined,
        coachPeakSkill: recordedRole === 'COACH' ? (personInArch?.coachPeakSkill ?? existing?.coachPeakSkill ?? perf.coach?.peakSkill) : undefined,
        competitionLevel: existing?.competitionLevel,
        assignedPosition: personInArch?.assignedPosition ?? existing?.assignedPosition,
        isStarter,
        isLoan,
        parentClubId,
        parentClubName,
        matchesPlayed: archMatchesPlayed,
        goals: archGoals,
        defensiveStops: archDefensiveStops,
        shots: archShots,
        shotsMissed: archShotsMissed,
        individualHonors: (() => {
          if (recordedRole !== 'PLAYER') return undefined
          const fromArch = getPlayerHonors(getSeasonAwards(archive), person.id)
          if (fromArch.length) return fromArch
          const existingHonors = existing?.individualHonors?.filter(h => !isTeamHonor(h))
          return existingHonors?.length ? existingHonors : undefined
        })(),
        roundReached: perf.roundReached,
        stageLabel: perf.stageLabel,
        isNationalChampion: earnsTeamTitles ? perf.isNationalChampion : false,
        isConferenceChampion: earnsTeamTitles ? perf.isConferenceChampion : false,
        isRegionChampion: earnsTeamTitles ? perf.isRegionChampion : false,
        isDepartmentChampion: earnsTeamTitles ? perf.isDepartmentChampion : false,
        conferenceId: perf.conferenceId,
        regionId: perf.regionId,
        departmentId: perf.departmentId,
      })
    }
  }

  // 3. Intégrer la saison active en cours si non encore archivée
  if (activeSession && (!person.isRetired || isActiveCoach(person)) && person.currentClubId) {
    const currentYear = activeSession.seasonYear ?? parseSeasonYear(activeSession.seed, 2026)
    const isAlreadyArchived = archives.some((a) => a.year === currentYear && a.nationalChampionId)

    if (!isAlreadyArchived) {
      const clubId = person.currentClubId
      const clubName = clubsById?.get(clubId)?.name

      const isNationalChampion = activeTeamPerformance?.isNationalChampion ?? activeSession.championId === clubId
      const isConferenceChampion = Boolean(
        activeTeamPerformance?.isConferenceChampion || (activeSession.conferenceChampionIds &&
        Object.values(activeSession.conferenceChampionIds).includes(clubId)
      ))

      let roundReached = activeSession.roundNumber
      let stageLabel = `Tour ${activeSession.roundNumber}`

      if (isNationalChampion) {
        roundReached = 14
        stageLabel = 'Champion de France 🏆'
      } else {
        const elimination = getSessionEliminationsMap(activeSession).get(clubId)
        if (elimination) {
          roundReached = elimination.roundNumber
          stageLabel = `${getStageLabel(elimination.roundNumber)} (Éliminé)`
        } else if (activeSession.championId) {
          stageLabel = `${getStageLabel(roundReached)} (Éliminé)`
        } else {
          stageLabel = `${getStageLabel(roundReached)} (En lice)`
        }
      }

      const activeStats = getActivePlayerStatistics(activeSession, person)
      const isStarter = activeStats?.isStarter ?? false
      const earnsTeamTitles = isStarter || isActiveCoach(person)

      const existing = seasonsMap.get(currentYear)
      const isLoan = existing?.isLoan ?? Boolean(person.loanedFromClubId && person.loanedFromClubId !== clubId)
      const parentClubId = existing?.parentClubId ?? person.parentClubId ?? (isLoan ? person.loanedFromClubId : clubId)
      const parentClubName = existing?.parentClubName ?? (parentClubId ? clubsById?.get(parentClubId)?.name : undefined)

      seasonsMap.set(currentYear, {
        year: currentYear,
        clubId,
        clubName,
        role: person.primaryRole,
        age: person.age,
        attack: person.attack,
        defense: person.defense,
        coachSkill: person.primaryRole === 'COACH' ? person.coachSkill : undefined,
        coachPeakSkill: person.primaryRole === 'COACH' ? person.coachPeakSkill : undefined,
        assignedPosition: person.assignedPosition,
        isStarter,
        isLoan,
        parentClubId,
        parentClubName,
        matchesPlayed: activeStats?.matchesPlayed ?? 0,
        goals: activeStats?.goals ?? 0,
        defensiveStops: activeStats?.defensiveStops ?? 0,
        shots: activeStats?.shots ?? 0,
        shotsMissed: activeStats?.shotsMissed ?? 0,
        individualHonors: person.primaryRole === 'PLAYER' ? getPlayerHonors(getSeasonAwards(activeSession), person.id) : undefined,
        roundReached,
        stageLabel,
        isNationalChampion: earnsTeamTitles && isNationalChampion,
        isConferenceChampion: earnsTeamTitles && isConferenceChampion,
        isRegionChampion: earnsTeamTitles && Boolean(activeTeamPerformance?.isRegionChampion),
        isDepartmentChampion: earnsTeamTitles && Boolean(activeTeamPerformance?.isDepartmentChampion),
        conferenceId: activeTeamPerformance?.conferenceId ?? clubsById?.get(clubId)?.conferenceId,
        regionId: activeTeamPerformance?.regionId ?? clubsById?.get(clubId)?.regionId,
        departmentId: activeTeamPerformance?.departmentId ?? clubsById?.get(clubId)?.departmentId,
      })
    }
  }

  // 4. Calcul du palmarès et des distinctions
  const allSeasons = Array.from(seasonsMap.values()).sort((a, b) => b.year - a.year)

  let nationalTitles = 0
  const nationalTitleYears: number[] = []
  let conferenceTitles = 0
  const conferenceTitleDetails: Array<{ year: number; conferenceId: string; clubName?: string }> = []
  let regionTitles = 0
  const regionTitleDetails: Array<{ year: number; regionId: string; clubName?: string }> = []
  let departmentTitles = 0
  const departmentTitleDetails: Array<{ year: number; departmentId: string; clubName?: string }> = []

  let bestRoundNumber = 0
  let bestPerformance: { year: number; roundNumber: number; stageLabel: string; clubName?: string } | undefined = undefined

  for (const s of allSeasons) {
    if (s.role !== 'COACH' && (s.role !== 'PLAYER' || s.isStarter === false)) continue
    if (s.isNationalChampion) {
      nationalTitles += 1
      nationalTitleYears.push(s.year)
    }
    if (s.isConferenceChampion && s.conferenceId) {
      conferenceTitles += 1
      conferenceTitleDetails.push({ year: s.year, conferenceId: s.conferenceId, clubName: s.clubName })
    }
    if (s.isRegionChampion && s.regionId) {
      regionTitles += 1
      regionTitleDetails.push({ year: s.year, regionId: s.regionId, clubName: s.clubName })
    }
    if (s.isDepartmentChampion && s.departmentId) {
      departmentTitles += 1
      departmentTitleDetails.push({ year: s.year, departmentId: s.departmentId, clubName: s.clubName })
    }

    // Le meilleur parcours ne retient que les résultats réels achevés ou avancés
    const isCompletedRun = Boolean(
      s.isNationalChampion ||
      s.isConferenceChampion ||
      s.isRegionChampion ||
      s.isDepartmentChampion ||
      (s.stageLabel && s.stageLabel.includes('Éliminé')) ||
      (s.roundReached !== undefined && s.roundReached > 1),
    )
    if (isCompletedRun) {
      const rNum = s.isNationalChampion ? 14 : (s.roundReached ?? 1)
      if (rNum > bestRoundNumber) {
        bestRoundNumber = rNum
        bestPerformance = {
          year: s.year,
          roundNumber: rNum,
          stageLabel: s.stageLabel ?? getStageLabel(rNum),
          clubName: s.clubName,
        }
      }
    }
  }

  return {
    personId: person.id,
    nationalTitles,
    nationalTitleYears,
    conferenceTitles,
    conferenceTitleDetails,
    regionTitles,
    regionTitleDetails,
    departmentTitles,
    departmentTitleDetails,
    bestPerformance,
    seasons: allSeasons,
  }
}

export type PersonTitleCounts = Pick<PersonTrophyRecord, 'nationalTitles' | 'conferenceTitles' | 'regionTitles' | 'departmentTitles'>

/** Directory counters need title flags and starter eligibility, never match events or awards. */
export function computePersonTitleCounts(
  persons: readonly Person[],
  archives: readonly SeasonArchive[] = [],
  activeSession?: CupSession | null,
  clubsById?: ReadonlyMap<string, Club>,
): Map<string, PersonTitleCounts> {
  const starterIds = (roster: readonly Person[]) => {
    const byClub = new Map<string, Person[]>()
    for (const person of roster) {
      if (person.isRetired || person.primaryRole !== 'PLAYER' || !person.currentClubId) continue
      const team = byClub.get(person.currentClubId) ?? []
      team.push(person)
      byClub.set(person.currentClubId, team)
    }
    const ids = new Set<string>()
    for (const team of byClub.values()) {
      const pair = selectClubStarters(team, true)
      if (pair.attacker) ids.add(pair.attacker.id)
      if (pair.defender) ids.add(pair.defender.id)
    }
    return ids
  }
  const indexedArchives = archives.map(archive => ({
    archive,
    byId: new Map(archive.persons?.map(person => [person.id, person])),
    starters: archive.persons ? starterIds(archive.persons) : null,
  }))
  const activeStarters = activeSession?.persons ? starterIds(activeSession.persons) : null
  const currentYear = activeSession ? parseSeasonYear(activeSession.seed) : undefined
  const currentYearArchived = archives.some(archive => archive.year === currentYear && archive.nationalChampionId)
  const activeClubs = clubsById ?? new Map(activeSession?.clubs?.map(club => [club.id, club]))
  const activePerformances = activeSession && !currentYearArchived ? getCompletedSessionTeamPerformances(activeSession, [...activeClubs.values()]) : {}
  const counts = new Map<string, PersonTitleCounts>()
  for (const person of persons) {
    const seasons = new Map<number, Pick<PersonCareerSeason,
      'clubId' | 'role' | 'isStarter' | 'isNationalChampion' | 'isConferenceChampion' |
      'isRegionChampion' | 'isDepartmentChampion' | 'conferenceId' | 'regionId' | 'departmentId'>>()
    for (const season of person.careerHistory ?? []) {
      if (season.stageLabel === 'Formation & débuts au club' || season.stageLabel === 'Compétitions & championnats locaux') continue
      seasons.set(season.year, season)
    }
    for (const { archive, byId, starters } of indexedArchives) {
      const existing = seasons.get(archive.year)
      const archivedPerson = byId.get(person.id)
      const clubId = archivedPerson !== undefined ? archivedPerson.currentClubId : existing?.clubId
      const performance = clubId ? archive.teamPerformances[clubId] : undefined
      if (!performance || !clubId) continue
      const role = archivedPerson?.primaryRole ?? existing?.role ?? person.primaryRole
      const coachedClub = role === 'COACH' &&
        (performance.coach ? performance.coach.personId === person.id : archivedPerson ? isActiveCoach(archivedPerson) : true)
      seasons.set(archive.year, {
        ...performance, clubId, role,
        isStarter: role === 'PLAYER' && (existing?.isStarter ?? (starters ? starters.has(person.id) : true)),
        ...(role === 'COACH' && !coachedClub ? {
          isNationalChampion: false, isConferenceChampion: false, isRegionChampion: false, isDepartmentChampion: false,
        } : {}),
      })
    }
    if (activeSession && currentYear !== undefined && !currentYearArchived &&
      (!person.isRetired || isActiveCoach(person)) && person.currentClubId) {
      const clubId = person.currentClubId
      seasons.set(currentYear, {
        clubId, role: person.primaryRole,
        isStarter: activeStarters ? activeStarters.has(person.id) : person.primaryRole === 'PLAYER' && !person.isRetired,
        isNationalChampion: activeSession.championId === clubId,
        isConferenceChampion: Object.values(activeSession.conferenceChampionIds ?? {}).includes(clubId),
        conferenceId: activeClubs.get(clubId)?.conferenceId,
        isRegionChampion: Boolean(activePerformances[clubId]?.isRegionChampion),
        isDepartmentChampion: Boolean(activePerformances[clubId]?.isDepartmentChampion),
        regionId: activeClubs.get(clubId)?.regionId,
        departmentId: activeClubs.get(clubId)?.departmentId,
      })
    }
    const record = { nationalTitles: 0, conferenceTitles: 0, regionTitles: 0, departmentTitles: 0 }
    for (const season of seasons.values()) {
      if (season.role !== 'COACH' && (season.role !== 'PLAYER' || season.isStarter === false)) continue
      if (season.isNationalChampion) record.nationalTitles++
      if (season.isConferenceChampion && season.conferenceId) record.conferenceTitles++
      if (season.isRegionChampion && season.regionId) record.regionTitles++
      if (season.isDepartmentChampion && season.departmentId) record.departmentTitles++
    }
    counts.set(person.id, record)
  }
  return counts
}

export function computePersonTotalTitles(trophyRecord: PersonTitleCounts): number {
  return (
    trophyRecord.nationalTitles +
    trophyRecord.conferenceTitles +
    trophyRecord.regionTitles +
    trophyRecord.departmentTitles
  )
}

export function sortPersons(
  persons: readonly Person[],
  sortKey: PersonSortKey,
  direction: SortDirection,
  clubNamesById: Map<string, string>,
  titleCounts?: ReadonlyMap<string, PersonTitleCounts>,
): Person[] {
  const titles = sortKey === 'titles' ? titleCounts ?? computePersonTitleCounts(persons) : undefined
  const sorted = [...persons].sort((a, b) => {
    let cmp = 0
    switch (sortKey) {
      case 'name':
        cmp = `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`, 'fr')
        break
      case 'age':
        cmp = a.age - b.age
        break
      case 'attack':
        cmp = a.attack - b.attack
        break
      case 'defense':
        cmp = a.defense - b.defense
        break
      case 'overall':
        cmp = computeOverallRating(a) - computeOverallRating(b)
        break
      case 'titles': {
        const recordA = titles!.get(a.id)!
        const recordB = titles!.get(b.id)!
        const scoreA =
          recordA.nationalTitles * 10 +
          recordA.conferenceTitles * 5 +
          recordA.regionTitles * 2 +
          recordA.departmentTitles
        const scoreB =
          recordB.nationalTitles * 10 +
          recordB.conferenceTitles * 5 +
          recordB.regionTitles * 2 +
          recordB.departmentTitles
        cmp = scoreA - scoreB
        break
      }
      case 'club': {
        const nameA = a.currentClubId ? (clubNamesById.get(a.currentClubId) ?? a.currentClubId) : 'Sans club'
        const nameB = b.currentClubId ? (clubNamesById.get(b.currentClubId) ?? b.currentClubId) : 'Sans club'
        cmp = nameA.localeCompare(nameB, 'fr')
        break
      }
      case 'birthCity':
        cmp = a.birthCommuneName.localeCompare(b.birthCommuneName, 'fr')
        break
      default:
        cmp = 0
    }
    return direction === 'asc' ? cmp : -cmp
  })

  return sorted
}

export type PersonsMetrics = {
  total: number
  activeCount: number
  retiredCount: number
  attackersCount: number
  defendersCount: number
  avgAge: number
  topAttacker: Person | null
  topDefender: Person | null
  mostDecorated: { person: Person; titleCount: number } | null
}

export function computePersonsMetrics(
  persons: readonly Person[],
  archives: readonly SeasonArchive[] = [],
  activeSession?: CupSession | null,
  titleCounts?: ReadonlyMap<string, PersonTitleCounts>,
): PersonsMetrics {
  const active = persons.filter((p) => !p.isRetired || isActiveCoach(p))
  const total = persons.length
  const activeCount = active.length
  const retiredCount = total - activeCount

  let attackersCount = 0
  let defendersCount = 0
  let totalAge = 0
  let topAttacker: Person | null = null
  let topDefender: Person | null = null
  let mostDecorated: { person: Person; titleCount: number } | null = null

  for (const p of active) {
    totalAge += p.age
    if (p.primaryRole !== 'PLAYER') continue
    if (p.position === 'ATTACKER') {
      attackersCount++
      if (!topAttacker || p.attack > topAttacker.attack) {
        topAttacker = p
      }
    } else if (p.position === 'DEFENDER') {
      defendersCount++
      if (!topDefender || p.defense > topDefender.defense) {
        topDefender = p
      }
    }
  }

  // Recherche de la personnalité la plus titrée
  let maxTitles = 0
  const titlesById = titleCounts ?? computePersonTitleCounts(persons, archives, activeSession)
  for (const p of persons) {
    const record = titlesById.get(p.id)!
    const titles = computePersonTotalTitles(record)
    if (titles > maxTitles) {
      maxTitles = titles
      mostDecorated = { person: p, titleCount: titles }
    }
  }

  const avgAge = activeCount > 0 ? Math.round((totalAge / activeCount) * 10) / 10 : 0

  return {
    total,
    activeCount,
    retiredCount,
    attackersCount,
    defendersCount,
    avgAge,
    topAttacker,
    topDefender,
    mostDecorated,
  }
}
