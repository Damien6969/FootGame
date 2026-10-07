import type { Commune, GeographyDataset } from '../geography/types'
import type { ArchivedMatch, CupSession, SeasonArchive, TeamSeasonPerformance } from '../storage/cupRepository'
import { conferenceForRegion } from '../geography/loadGeography'
import { departmentLabel, regionLabel } from '../geography/territoryLabels'
import type { DrawMatch } from '../competition/competition'
import type { MatchResult } from '../match/simulateMatch'
import type { Club } from '../teams/types'
import { buildClubsFromCommunes } from '../teams/clubGenerator'
import { getSeasonAwards } from '../awards/seasonAwards'

export type TeamSeasonPerformanceWithYear = Readonly<
  TeamSeasonPerformance & {
    year: number
  }
>

export type TeamTrophyRecord = Readonly<{
  teamId: string
  nationalTitles: number
  nationalTitleYears: readonly number[]
  conferenceTitles: number
  conferenceTitleDetails: ReadonlyArray<{ year: number; conferenceId: string }>
  regionTitles: number
  regionTitleDetails: ReadonlyArray<{ year: number; regionId: string }>
  departmentTitles: number
  departmentTitleDetails: ReadonlyArray<{ year: number; departmentId: string }>
  bestPerformance: {
    year: number
    roundNumber: number
    stageLabel: string
  }
  seasons: ReadonlyArray<TeamSeasonPerformanceWithYear>
}>

export function parseSeasonYear(seed: string, defaultYear = 2026): number {
  const match = seed.match(/(\d{4})/)
  if (match) {
    const year = parseInt(match[1], 10)
    if (!Number.isNaN(year) && year >= 1900 && year <= 2200) {
      return year
    }
  }
  return defaultYear
}

export function getStageLabel(
  roundNumber: number,
  options?: {
    isWinner?: boolean
    isFinalist?: boolean
    isConferenceWinner?: boolean
  },
): string {
  if (options?.isWinner) return 'Champion de France 🏆'
  if (options?.isFinalist) return 'Finaliste National 🥈'
  if (roundNumber === 13) return 'Demi-finaliste National 🥉'
  if (options?.isConferenceWinner) return 'Champion de Conférence 👑'
  if (roundNumber === 12) return 'Finale de Conférence'
  if (roundNumber === 11) return 'Demi-finales de Conférence'
  if (roundNumber === 10) return 'Quarts de Conférence'
  if (roundNumber === 9) return '8es de Conférence'
  if (roundNumber >= 5 && roundNumber <= 8) return `Tour ${roundNumber} (Régional)`
  return `Tour ${roundNumber} (Départemental)`
}

export function detectConferenceChampions(
  sessionOrMatches: CupSession | readonly DrawMatch[],
  resultsOrById: Readonly<Record<string, MatchResult>> | Map<string, Commune>,
  maybeById?: Map<string, Commune>,
): Record<string, string> {
  const confChampions: Record<string, string> = {}

  if (Array.isArray(sessionOrMatches)) {
    const matches = sessionOrMatches
    const results = resultsOrById as Readonly<Record<string, MatchResult>>
    const byId = maybeById!
    for (const match of matches) {
      const res = results[match.id]
      if (res?.winnerId) {
        const winner = byId.get(res.winnerId)
        const confId = winner?.conferenceId ?? (winner?.regionId ? conferenceForRegion(winner.regionId) : undefined)
        if (confId && winner) {
          confChampions[confId] = winner.id
        }
      }
    }
  } else {
    const session = sessionOrMatches as CupSession
    const byId = resultsOrById as Map<string, Commune>

    if (session.roundNumber === 12) {
      for (const match of session.round.matches) {
        const res = session.results[match.id]
        if (res?.winnerId) {
          const winner = byId.get(res.winnerId)
          const confId = winner?.conferenceId ?? (winner?.regionId ? conferenceForRegion(winner.regionId) : undefined)
          if (confId && winner) {
            confChampions[confId] = winner.id
          }
        }
      }
    }

    for (const item of session.history) {
      if (item.roundNumber === 12 && item.result.winnerId) {
        const winner = byId.get(item.result.winnerId)
        const confId = winner?.conferenceId ?? (winner?.regionId ? conferenceForRegion(winner.regionId) : undefined)
        if (confId && winner && !confChampions[confId]) {
          confChampions[confId] = winner.id
        }
      }
    }
  }

  return confChampions
}

export function getCompletedSessionTeamPerformances(session: CupSession, clubs?: readonly Club[]): Record<string, TeamSeasonPerformance> {
  if (!session.championId) return {}
  return buildSeasonArchive(session, { version: session.datasetVersion, sourceLabel: '', sourceUrl: '', communes: [] }, clubs).teamPerformances
}

export function buildSeasonArchive(
  session: CupSession,
  dataset: GeographyDataset,
  clubs?: readonly Club[],
): SeasonArchive {
  const year = session.seasonYear ?? parseSeasonYear(session.seed, 2026)
  const teamList = clubs ?? session.clubs ?? dataset.communes
  const byId = new Map<string, { id: string; name?: string; departmentId: string; regionId: string; conferenceId?: string; population: number }>()
  for (const c of dataset.communes) {
    byId.set(c.id, c)
  }
  for (const cl of teamList) {
    byId.set(cl.id, cl)
  }

  // All matches including active round results
  const allMatches: ArchivedMatch[] = [...new Map([
    ...(session.history ?? []),
    ...(session.round?.matches ?? [])
      .filter((m) => Boolean(session.results?.[m.id]))
      .map((m) => ({
        roundNumber: session.roundNumber,
        homeTeamId: m.homeTeamId,
        awayTeamId: m.awayTeamId,
        result: session.results[m.id],
      })),
  ].map((match) => [match.result.matchId, match])).values()]

  // Track each team's progress and stats
  type Tracker = {
    matchesPlayed: number
    matchesWon: number
    maxRound: number
    goalsScored: number
    goalsConceded: number
    goalDifference: number
    eliminatedBy?: string
    eliminatedRound?: number
  }

  const teamTrackers = new Map<string, Tracker>()
  const getTracker = (id: string) => {
    let tr = teamTrackers.get(id)
    if (!tr) {
      tr = { matchesPlayed: 0, matchesWon: 0, maxRound: 1, goalsScored: 0, goalsConceded: 0, goalDifference: 0 }
      teamTrackers.set(id, tr)
    }
    return tr
  }

  for (const match of allMatches) {
    const homeTr = getTracker(match.homeTeamId)
    const awayTr = getTracker(match.awayTeamId)

    homeTr.matchesPlayed += 1
    awayTr.matchesPlayed += 1

    homeTr.goalsScored += match.result.homeScore
    homeTr.goalsConceded += match.result.awayScore
    homeTr.goalDifference = homeTr.goalsScored - homeTr.goalsConceded

    awayTr.goalsScored += match.result.awayScore
    awayTr.goalsConceded += match.result.homeScore
    awayTr.goalDifference = awayTr.goalsScored - awayTr.goalsConceded

    if (match.roundNumber > homeTr.maxRound) homeTr.maxRound = match.roundNumber
    if (match.roundNumber > awayTr.maxRound) awayTr.maxRound = match.roundNumber

    const winnerId = match.result.winnerId
    if (winnerId === match.homeTeamId) {
      homeTr.matchesWon += 1
      awayTr.eliminatedBy = match.homeTeamId
      awayTr.eliminatedRound = match.roundNumber
    } else if (winnerId === match.awayTeamId) {
      awayTr.matchesWon += 1
      homeTr.eliminatedBy = match.awayTeamId
      homeTr.eliminatedRound = match.roundNumber
    }
  }

  // Account for byes
  if (session.roundByes) {
    for (const [rNumStr, byeIds] of Object.entries(session.roundByes)) {
      const rNum = parseInt(rNumStr, 10)
      for (const id of byeIds) {
        const tr = getTracker(id)
        if (rNum + 1 > tr.maxRound) tr.maxRound = rNum + 1
      }
    }
  }

  // Identify Conference Champions
  const conferenceChampions: Record<string, string> = {
    ...(session.conferenceChampionIds ?? {}),
  }

  // If not yet explicitly set, detect from round 12 matches in history
  if (Object.keys(conferenceChampions).length < 4) {
    const r12Matches = allMatches.filter((m) => m.roundNumber === 12)
    for (const m of r12Matches) {
      const winner = byId.get(m.result.winnerId)
      const confId = winner?.conferenceId ?? (winner?.regionId ? conferenceForRegion(winner.regionId) : undefined)
      if (confId && winner && !conferenceChampions[confId]) {
        conferenceChampions[confId] = winner.id
      }
    }
  }

  const confWinnerIds = new Set(Object.values(conferenceChampions))

  // Identify National Champion & Finalist
  const nationalChampionId = session.championId ?? ''
  let finalistId: string | undefined

  if (nationalChampionId) {
    const finalMatch = allMatches.find(
      (m) => m.roundNumber === 14 && (m.homeTeamId === nationalChampionId || m.awayTeamId === nationalChampionId),
    )
    if (finalMatch) {
      finalistId = finalMatch.homeTeamId === nationalChampionId ? finalMatch.awayTeamId : finalMatch.homeTeamId
    }
  }

  // Final Four teams (Tour 13 participants)
  const finalFourTeamIds = Array.from(confWinnerIds)

  // Tiebreaker helper as requested:
  // 1. Tour atteint le plus loin
  // 2. Nombre de victoires totales
  // 3. Différence de buts (goal average)
  // 4. Buts marqués
  // 5. Population
  const compareClubPerfs = (aId: string, bId: string): number => {
    const trA = teamTrackers.get(aId) ?? { matchesPlayed: 0, matchesWon: 0, maxRound: 1, goalsScored: 0, goalsConceded: 0, goalDifference: 0 }
    const trB = teamTrackers.get(bId) ?? { matchesPlayed: 0, matchesWon: 0, maxRound: 1, goalsScored: 0, goalsConceded: 0, goalDifference: 0 }
    const rA = aId === nationalChampionId ? 14 : trA.maxRound
    const rB = bId === nationalChampionId ? 14 : trB.maxRound

    if (rB !== rA) return rB - rA
    if (trB.matchesWon !== trA.matchesWon) return trB.matchesWon - trA.matchesWon
    if (trB.goalDifference !== trA.goalDifference) return trB.goalDifference - trA.goalDifference
    if (trB.goalsScored !== trA.goalsScored) return trB.goalsScored - trA.goalsScored
    const popA = byId.get(aId)?.population ?? 0
    const popB = byId.get(bId)?.population ?? 0
    return popB - popA
  }

  // Group communes by department and by region
  const clubsByDept = new Map<string, string[]>()
  const clubsByRegion = new Map<string, string[]>()

  for (const team of teamList) {
    let dList = clubsByDept.get(team.departmentId)
    if (!dList) {
      dList = []
      clubsByDept.set(team.departmentId, dList)
    }
    dList.push(team.id)

    let rList = clubsByRegion.get(team.regionId)
    if (!rList) {
      rList = []
      clubsByRegion.set(team.regionId, rList)
    }
    rList.push(team.id)
  }

  // Determine Department Champions
  const departmentChampions: Record<string, string> = {}
  for (const [deptId, clubIds] of clubsByDept.entries()) {
    clubIds.sort(compareClubPerfs)
    if (clubIds[0]) {
      departmentChampions[deptId] = clubIds[0]
    }
  }

  // Determine Region Champions
  const regionChampions: Record<string, string> = {}
  for (const [regionId, clubIds] of clubsByRegion.entries()) {
    clubIds.sort(compareClubPerfs)
    if (clubIds[0]) {
      regionChampions[regionId] = clubIds[0]
    }
  }

  // Build team performances
  const teamPerformances: Record<string, TeamSeasonPerformance> = {}
  for (const team of teamList) {
    const tr = teamTrackers.get(team.id) ?? {
      matchesPlayed: 0,
      matchesWon: 0,
      maxRound: 1,
      goalsScored: 0,
      goalsConceded: 0,
      goalDifference: 0,
    }
    const isChamp = team.id === nationalChampionId
    const isFin = team.id === finalistId
    const isConfChamp = confWinnerIds.has(team.id)
    const isRegChamp = regionChampions[team.regionId] === team.id
    const isDeptChamp = departmentChampions[team.departmentId] === team.id
    const confId = team.conferenceId ?? (team.regionId ? conferenceForRegion(team.regionId) : undefined)

    const stageLabel = getStageLabel(tr.maxRound, {
      isWinner: isChamp,
      isFinalist: isFin,
      isConferenceWinner: isConfChamp,
    })

    const isFusionClub = 'isFusion' in team ? Boolean(team.isFusion) : false
    const clubCommuneNames = 'communeNames' in team && Array.isArray(team.communeNames) ? team.communeNames : undefined
    const partnerNames = isFusionClub && clubCommuneNames && clubCommuneNames.length > 1 ? clubCommuneNames.slice(1) : undefined

    teamPerformances[team.id] = {
      teamId: team.id,
      clubName: team.name,
      coach: 'coach' in team ? (team as Club).coach : undefined,
      roundReached: isChamp ? 14 : tr.maxRound,
      stageLabel,
      isNationalChampion: isChamp,
      isConferenceChampion: isConfChamp,
      isRegionChampion: isRegChamp,
      isDepartmentChampion: isDeptChamp,
      conferenceId: confId,
      regionId: team.regionId,
      departmentId: team.departmentId,
      eliminatedInRound: tr.eliminatedRound,
      eliminatedByTeamId: tr.eliminatedBy,
      matchesWon: tr.matchesWon,
      matchesPlayed: tr.matchesPlayed,
      goalsScored: tr.goalsScored,
      goalsConceded: tr.goalsConceded,
      goalDifference: tr.goalDifference,
      isFusion: isFusionClub,
      fusionCount: clubCommuneNames?.length,
      communeNames: clubCommuneNames,
      fusionPartnerNames: partnerNames,
    }
  }

  return {
    year,
    seed: session.seed,
    completedAt: new Date().toISOString(),
    datasetVersion: session.datasetVersion,
    nationalChampionId,
    finalistId,
    conferenceChampions,
    regionChampions,
    departmentChampions,
    finalFourTeamIds,
    totalMatches: allMatches.length,
    teamPerformances,
    history: allMatches,
    clubs: clubs ?? session.clubs ?? buildClubsFromCommunes(dataset.communes),
    interseasonReport: session.interseasonReport,
    fusions: session.interseasonReport?.fusions,
    secessions: session.interseasonReport?.secessions,
    persons: session.persons,
    transferMovements: session.transferMovements,
    individualAwards: session.individualAwards ?? getSeasonAwards({ ...session, clubs: clubs ?? session.clubs }) ?? undefined,
  }
}

export function computeTeamRecords(
  archives: readonly SeasonArchive[],
  activeSession?: CupSession | null,
  dataset?: GeographyDataset,
): Map<string, TeamTrophyRecord> {
  if (dataset && activeSession?.championId) {
    const year = activeSession.seasonYear ?? parseSeasonYear(activeSession.seed)
    if (!archives.some((archive) => archive.year === year)) {
      return computeTeamRecords([...archives, buildSeasonArchive(activeSession, dataset)])
    }
  }
  const records = new Map<string, {
    teamId: string
    nationalTitles: number
    nationalTitleYears: number[]
    conferenceTitles: number
    conferenceTitleDetails: Array<{ year: number; conferenceId: string }>
    regionTitles: number
    regionTitleDetails: Array<{ year: number; regionId: string }>
    departmentTitles: number
    departmentTitleDetails: Array<{ year: number; departmentId: string }>
    bestRoundNumber: number
    bestPerformance: { year: number; roundNumber: number; stageLabel: string }
    seasons: TeamSeasonPerformanceWithYear[]
  }>()

  const getRecord = (id: string) => {
    let r = records.get(id)
    if (!r) {
      r = {
        teamId: id,
        nationalTitles: 0,
        nationalTitleYears: [],
        conferenceTitles: 0,
        conferenceTitleDetails: [],
        regionTitles: 0,
        regionTitleDetails: [],
        departmentTitles: 0,
        departmentTitleDetails: [],
        bestRoundNumber: 0,
        bestPerformance: { year: 2026, roundNumber: 1, stageLabel: 'Tour 1' },
        seasons: [],
      }
      records.set(id, r)
    }
    return r
  }

  // 1. Process archived seasons in chronological order
  const sortedArchives = [...archives].sort((a, b) => a.year - b.year)
  for (const archive of sortedArchives) {
    const hasDetailedPerfs = archive.teamPerformances && Object.keys(archive.teamPerformances).length > 0
    if (hasDetailedPerfs) {
      for (const [teamId, perf] of Object.entries(archive.teamPerformances)) {
        const rec = getRecord(teamId)
        if (perf.isNationalChampion) {
          rec.nationalTitles += 1
          rec.nationalTitleYears.push(archive.year)
        }
        if (perf.isConferenceChampion && perf.conferenceId) {
          rec.conferenceTitles += 1
          rec.conferenceTitleDetails.push({ year: archive.year, conferenceId: perf.conferenceId })
        }
        if (perf.isRegionChampion && perf.regionId) {
          rec.regionTitles += 1
          rec.regionTitleDetails.push({ year: archive.year, regionId: perf.regionId })
        }
        if (perf.isDepartmentChampion && perf.departmentId) {
          rec.departmentTitles += 1
          rec.departmentTitleDetails.push({ year: archive.year, departmentId: perf.departmentId })
        }

        rec.seasons.push({
          ...perf,
          year: archive.year,
        })

        // Update best performance
        const perfRank = perf.isNationalChampion ? 999 : perf.isConferenceChampion ? 200 + perf.roundReached : perf.roundReached
        const currentBestRank = rec.bestPerformance.stageLabel.includes('Champion de France')
          ? 999
          : rec.bestPerformance.stageLabel.includes('Champion de Conférence')
            ? 200 + rec.bestRoundNumber
            : rec.bestRoundNumber

        if (perfRank > currentBestRank) {
          rec.bestRoundNumber = perf.roundReached
          rec.bestPerformance = {
            year: archive.year,
            roundNumber: perf.roundReached,
            stageLabel: perf.stageLabel,
          }
        }
      }
    } else {
      // Pour les archives résumées (archiveSummaries légers où teamPerformances est vide),
      // on agrège directement les titres et parcours à partir des métadonnées du résumé.
      if (archive.nationalChampionId) {
        const rec = getRecord(archive.nationalChampionId)
        rec.nationalTitles += 1
        rec.nationalTitleYears.push(archive.year)
        rec.bestRoundNumber = 14
        rec.bestPerformance = { year: archive.year, roundNumber: 14, stageLabel: 'Champion de France' }
      }
      if (archive.finalistId && archive.finalistId !== archive.nationalChampionId) {
        const rec = getRecord(archive.finalistId)
        const currentBestRank = rec.bestPerformance.stageLabel.includes('Champion de France') ? 999 : rec.bestRoundNumber
        if (currentBestRank < 14) {
          rec.bestRoundNumber = 14
          rec.bestPerformance = { year: archive.year, roundNumber: 14, stageLabel: 'Finale' }
        }
      }
      if (archive.conferenceChampions) {
        for (const [confId, teamId] of Object.entries(archive.conferenceChampions)) {
          if (!teamId) continue
          const rec = getRecord(teamId)
          rec.conferenceTitles += 1
          rec.conferenceTitleDetails.push({ year: archive.year, conferenceId: confId })
          const currentBestRank = rec.bestPerformance.stageLabel.includes('Champion de France')
            ? 999
            : rec.bestPerformance.stageLabel.includes('Champion de Conférence')
              ? 200 + rec.bestRoundNumber
              : rec.bestRoundNumber
          // Un champion de conférence dispute au moins la demi-finale nationale (Tour 13)
          if (currentBestRank < 213) {
            rec.bestRoundNumber = 13
            rec.bestPerformance = { year: archive.year, roundNumber: 13, stageLabel: 'Champion de Conférence 👑' }
          }
        }
      }
      if (archive.finalistId && archive.finalistId !== archive.nationalChampionId) {
        const rec = getRecord(archive.finalistId)
        const isConf = rec.conferenceTitles > 0 && rec.conferenceTitleDetails.some((d) => d.year === archive.year)
        const perfRank = isConf ? 214 : 14
        const currentBestRank = rec.bestPerformance.stageLabel.includes('Champion de France')
          ? 999
          : rec.bestPerformance.stageLabel.includes('Champion de Conférence')
            ? 200 + rec.bestRoundNumber
            : rec.bestRoundNumber
        if (perfRank > currentBestRank) {
          rec.bestRoundNumber = 14
          rec.bestPerformance = { year: archive.year, roundNumber: 14, stageLabel: 'Finaliste National 🥈' }
        }
      }
      if (archive.finalFourTeamIds) {
        for (const teamId of archive.finalFourTeamIds) {
          if (!teamId || teamId === archive.nationalChampionId || teamId === archive.finalistId) continue
          const rec = getRecord(teamId)
          const isConf = rec.conferenceTitles > 0 && rec.conferenceTitleDetails.some((d) => d.year === archive.year)
          const perfRank = isConf ? 213 : 13
          const currentBestRank = rec.bestPerformance.stageLabel.includes('Champion de France')
            ? 999
            : rec.bestPerformance.stageLabel.includes('Champion de Conférence')
              ? 200 + rec.bestRoundNumber
              : rec.bestRoundNumber
          if (perfRank > currentBestRank) {
            rec.bestRoundNumber = 13
            rec.bestPerformance = {
              year: archive.year,
              roundNumber: 13,
              stageLabel: isConf ? 'Champion de Conférence 👑' : 'Demi-finaliste National 🥉',
            }
          }
        }
      }
      if (archive.regionChampions) {
        for (const [regionId, teamId] of Object.entries(archive.regionChampions)) {
          if (!teamId) continue
          const rec = getRecord(teamId)
          rec.regionTitles += 1
          rec.regionTitleDetails.push({ year: archive.year, regionId })
          if (
            rec.bestRoundNumber < 10 &&
            !rec.bestPerformance.stageLabel.includes('Champion de France') &&
            !rec.bestPerformance.stageLabel.includes('Champion de Conférence')
          ) {
            rec.bestRoundNumber = 10
            rec.bestPerformance = { year: archive.year, roundNumber: 10, stageLabel: 'Champion Régional' }
          }
        }
      }
      if (archive.departmentChampions) {
        for (const [departmentId, teamId] of Object.entries(archive.departmentChampions)) {
          if (!teamId) continue
          const rec = getRecord(teamId)
          rec.departmentTitles += 1
          rec.departmentTitleDetails.push({ year: archive.year, departmentId })
          if (
            rec.bestRoundNumber < 8 &&
            !rec.bestPerformance.stageLabel.includes('Champion de France') &&
            !rec.bestPerformance.stageLabel.includes('Champion de Conférence') &&
            !rec.bestPerformance.stageLabel.includes('Champion Régional')
          ) {
            rec.bestRoundNumber = 8
            rec.bestPerformance = { year: archive.year, roundNumber: 8, stageLabel: 'Champion Départemental' }
          }
        }
      }
    }
  }

  // 2. Incorporate active session if present and not yet archived
  if (activeSession && activeSession.seasonYear) {
    const activeYear = activeSession.seasonYear
    const isAlreadyArchived = sortedArchives.some((a) => a.year === activeYear)
    if (!isAlreadyArchived && activeSession.championId) {
      const champId = activeSession.championId
      const rec = getRecord(champId)
      rec.nationalTitles += 1
      rec.nationalTitleYears.push(activeYear)
    }
  }

  // Freeze returned map
  const finalMap = new Map<string, TeamTrophyRecord>()
  for (const [teamId, rec] of records.entries()) {
    finalMap.set(teamId, {
      teamId,
      nationalTitles: rec.nationalTitles,
      nationalTitleYears: Object.freeze(rec.nationalTitleYears),
      conferenceTitles: rec.conferenceTitles,
      conferenceTitleDetails: Object.freeze(rec.conferenceTitleDetails),
      regionTitles: rec.regionTitles,
      regionTitleDetails: Object.freeze(rec.regionTitleDetails),
      departmentTitles: rec.departmentTitles,
      departmentTitleDetails: Object.freeze(rec.departmentTitleDetails),
      bestPerformance: Object.freeze(rec.bestPerformance),
      seasons: Object.freeze(rec.seasons),
    })
  }

  return finalMap
}

export function getRankedPalmares(
  teamRecords: Map<string, TeamTrophyRecord>,
  byId: Map<string, Commune>,
): Array<{
  team: Commune
  record: TeamTrophyRecord
  rank: number
}> {
  // Filter teams with at least 1 title of any tier (national, conf, region, dept) or deep run
  const candidates: Array<{ team: Commune; record: TeamTrophyRecord }> = []

  for (const [teamId, record] of teamRecords.entries()) {
    const team = byId.get(teamId)
    if (!team) continue
    if (
      record.nationalTitles > 0 ||
      record.conferenceTitles > 0 ||
      record.regionTitles > 0 ||
      record.departmentTitles > 0 ||
      record.bestPerformance.roundNumber >= 12
    ) {
      candidates.push({ team, record })
    }
  }

  // Sort by national titles (desc), conference titles (desc), region titles (desc), department titles (desc), best round (desc), team name (asc)
  candidates.sort((a, b) => {
    if (b.record.nationalTitles !== a.record.nationalTitles) {
      return b.record.nationalTitles - a.record.nationalTitles
    }
    if (b.record.conferenceTitles !== a.record.conferenceTitles) {
      return b.record.conferenceTitles - a.record.conferenceTitles
    }
    if (b.record.regionTitles !== a.record.regionTitles) {
      return b.record.regionTitles - a.record.regionTitles
    }
    if (b.record.departmentTitles !== a.record.departmentTitles) {
      return b.record.departmentTitles - a.record.departmentTitles
    }
    if (b.record.bestPerformance.roundNumber !== a.record.bestPerformance.roundNumber) {
      return b.record.bestPerformance.roundNumber - a.record.bestPerformance.roundNumber
    }
    return a.team.name.localeCompare(b.team.name, 'fr')
  })

  return candidates.map((item, index) => ({
    ...item,
    rank: index + 1,
  }))
}

export type RegionPalmaresRow = {
  regionId: string
  regionName: string
  conferenceId: string
  latestChampion?: Commune
  latestChampionYear?: number
  seasons: Array<{ year: number; champion: Commune }>
  mostTitledClub?: { team: Commune; count: number }
  totalCommunes: number
}

export type DepartmentPalmaresRow = {
  departmentId: string
  departmentName: string
  regionId: string
  regionName: string
  latestChampion?: Commune
  latestChampionYear?: number
  seasons: Array<{ year: number; champion: Commune }>
  mostTitledClub?: { team: Commune; count: number }
  totalCommunes: number
}

export function computeRegionPalmares(
  editions: readonly SeasonArchive[],
  dataset: GeographyDataset,
  teamRecords?: Map<string, TeamTrophyRecord>,
): RegionPalmaresRow[] {
  const byId = new Map(dataset.communes.map((c) => [c.id, c]))
  const regionCommunesCount = new Map<string, number>()
  for (const c of dataset.communes) {
    regionCommunesCount.set(c.regionId, (regionCommunesCount.get(c.regionId) ?? 0) + 1)
  }

  const sortedEditions = [...editions].sort((a, b) => b.year - a.year)

  const rows: RegionPalmaresRow[] = []
  for (const [regionId, totalCommunes] of regionCommunesCount.entries()) {
    const seasons: Array<{ year: number; champion: Commune }> = []
    const titlesCount = new Map<string, number>()

    for (const ed of sortedEditions) {
      const champId = ed.regionChampions?.[regionId]
      if (champId) {
        const team = byId.get(champId)
        if (team) {
          seasons.push({ year: ed.year, champion: team })
          titlesCount.set(champId, (titlesCount.get(champId) ?? 0) + 1)
        }
      }
    }

    let mostTitledClub: { team: Commune; count: number } | undefined
    if (teamRecords) {
      let maxTitles = 0
      for (const [teamId, rec] of teamRecords.entries()) {
        const team = byId.get(teamId)
        if (team?.regionId === regionId && rec.regionTitles > maxTitles) {
          maxTitles = rec.regionTitles
          mostTitledClub = { team, count: maxTitles }
        }
      }
    } else if (titlesCount.size > 0) {
      let maxTitles = 0
      for (const [teamId, count] of titlesCount.entries()) {
        const team = byId.get(teamId)
        if (team && count > maxTitles) {
          maxTitles = count
          mostTitledClub = { team, count }
        }
      }
    }

    const latest = seasons[0]
    const confId = conferenceForRegion(regionId)

    rows.push({
      regionId,
      regionName: regionLabel(regionId),
      conferenceId: confId,
      latestChampion: latest?.champion,
      latestChampionYear: latest?.year,
      seasons,
      mostTitledClub,
      totalCommunes,
    })
  }

  rows.sort((a, b) => a.regionName.localeCompare(b.regionName, 'fr'))
  return rows
}

export function computeDepartmentPalmares(
  editions: readonly SeasonArchive[],
  dataset: GeographyDataset,
  teamRecords?: Map<string, TeamTrophyRecord>,
): DepartmentPalmaresRow[] {
  const byId = new Map(dataset.communes.map((c) => [c.id, c]))
  const deptCommunesCount = new Map<string, { count: number; regionId: string }>()
  for (const c of dataset.communes) {
    const existing = deptCommunesCount.get(c.departmentId)
    if (existing) {
      existing.count += 1
    } else {
      deptCommunesCount.set(c.departmentId, { count: 1, regionId: c.regionId })
    }
  }

  const sortedEditions = [...editions].sort((a, b) => b.year - a.year)

  const rows: DepartmentPalmaresRow[] = []
  for (const [departmentId, { count: totalCommunes, regionId }] of deptCommunesCount.entries()) {
    const seasons: Array<{ year: number; champion: Commune }> = []
    const titlesCount = new Map<string, number>()

    for (const ed of sortedEditions) {
      const champId = ed.departmentChampions?.[departmentId]
      if (champId) {
        const team = byId.get(champId)
        if (team) {
          seasons.push({ year: ed.year, champion: team })
          titlesCount.set(champId, (titlesCount.get(champId) ?? 0) + 1)
        }
      }
    }

    let mostTitledClub: { team: Commune; count: number } | undefined
    if (teamRecords) {
      let maxTitles = 0
      for (const [teamId, rec] of teamRecords.entries()) {
        const team = byId.get(teamId)
        if (team?.departmentId === departmentId && rec.departmentTitles > maxTitles) {
          maxTitles = rec.departmentTitles
          mostTitledClub = { team, count: maxTitles }
        }
      }
    } else if (titlesCount.size > 0) {
      let maxTitles = 0
      for (const [teamId, count] of titlesCount.entries()) {
        const team = byId.get(teamId)
        if (team && count > maxTitles) {
          maxTitles = count
          mostTitledClub = { team, count }
        }
      }
    }

    const latest = seasons[0]

    rows.push({
      departmentId,
      departmentName: departmentLabel(departmentId),
      regionId,
      regionName: regionLabel(regionId),
      latestChampion: latest?.champion,
      latestChampionYear: latest?.year,
      seasons,
      mostTitledClub,
      totalCommunes,
    })
  }

  rows.sort((a, b) => a.departmentId.localeCompare(b.departmentId, 'fr', { numeric: true }))
  return rows
}
