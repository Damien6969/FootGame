import Dexie, { type EntityTable, type Table } from 'dexie'
import type { DrawRound } from '../competition/competition'
import type { MatchResult } from '../match/simulateMatch'
import type { Club } from '../teams/types'
import type { Person } from '../persons/types'
import type { CoachSnapshot } from '../coaches/types'
import type { SeasonAwards } from '../awards/types'
import type { TransferMovement } from '../transfers/types'
import { validateCareerBackup } from './validateBackup'
import { sanitizeCupSession, sanitizeSeasonArchive } from '../awards/seasonAwards'
import { loadPlayerFavorites, PLAYER_FAVORITES_STORAGE_KEY } from '../persons/playerFavoritesStorage'
import {
  type PlayerSeasonHonor,
  type SeasonAwardSummary,
  extractSeasonPlayerHonors,
  extractSeasonAwardSummary,
  buildPlayerPalmaresFromHonors,
} from '../history/playerPalmaresStorage'
import type { PlayerPalmaresRecord } from '../history/playerPalmaresSelectors'

export type ArchivedMatch = Readonly<{
  roundNumber: number
  homeTeamId: string
  awayTeamId: string
  result: MatchResult
}>

export type TeamSeasonPerformance = Readonly<{
  teamId: string
  clubName?: string
  coach?: CoachSnapshot | null
  roundReached: number
  stageLabel: string
  isNationalChampion: boolean
  isConferenceChampion: boolean
  isRegionChampion?: boolean
  isDepartmentChampion?: boolean
  conferenceId?: string
  regionId?: string
  departmentId?: string
  eliminatedInRound?: number
  eliminatedByTeamId?: string
  matchesWon: number
  matchesPlayed: number
  goalsScored?: number
  goalsConceded?: number
  goalDifference?: number
  isFusion?: boolean
  fusionCount?: number
  communeNames?: readonly string[]
  fusionPartnerNames?: readonly string[]
}>

export type SeasonArchive = Readonly<{
  /** Lightweight listing loaded for the cup and palmares; full details remain in IndexedDB. */
  summaryOnly?: boolean
  finalMatch?: ArchivedMatch
  /** Club identities and strengths at the time of this season. Optional for older backups. */
  clubs?: readonly Club[]
  year: number
  seed: string
  completedAt: string
  datasetVersion: string
  nationalChampionId: string
  finalistId?: string
  conferenceChampions: Readonly<Record<string, string>> // conferenceId -> communeId
  regionChampions?: Readonly<Record<string, string>> // regionId -> communeId
  departmentChampions?: Readonly<Record<string, string>> // departmentId -> communeId
  finalFourTeamIds: readonly string[]
  totalMatches: number
  teamPerformances: Readonly<Record<string, TeamSeasonPerformance>>
  history: readonly ArchivedMatch[]
  interseasonReport?: InterseasonReport
  fusions?: readonly FusionEvent[]
  secessions?: readonly SecessionEvent[]
  persons?: readonly Person[]
  individualAwards?: SeasonAwards
  /** Mercato d'ouverture de cette saison, conservé dans les résumés. */
  transferMovements?: readonly TransferMovement[]
}>

export type FusionEvent = Readonly<{
  mergedClubId: string
  mergedClubName: string
  leadClubName?: string
  leadCommuneId?: string
  leadCommuneName?: string
  absorbedClubId: string
  absorbedClubName: string
  absorbedCommuneIds?: readonly string[]
  absorbedCommuneNames?: readonly string[]
  communeNames: readonly string[]
  totalPopulation: number
  newStrength: number
  oldStrength: number
}>

export type RivalCreationEvent = Readonly<{
  clubId: string
  clubName: string
  communeName: string
  strength: number
  parentChampionName: string
}>

export type SecessionEvent = Readonly<{
  /** ID du nouveau club indépendant créé */
  newClubId: string
  /** Nom du nouveau club indépendant */
  newClubName: string
  /** ID de la commune qui recrée un club local (maintien dans l'entente) */
  communeId: string
  /** Nom de la commune */
  communeName: string
  /** ID du club en entente partenaire */
  parentEnteId: string
  /** Nom du club en entente (conservé) */
  parentEnteName: string
  /** Population déduite de l'entente (33 % de la grande commune par étape) */
  populationLost: number
  /** Nouvelle force recalculée de l'entente après déduction */
  newEnteStrength: number
  /** Étape de sécession (1, 2 ou 3) */
  step?: number
  /** Indique si cette étape marque le retrait complet et définitif de la commune de l'alliance (3e étape) */
  isCompleteWithdrawal?: boolean
}>

export type InterseasonReport = Readonly<{
  seasonYear: number
  fusions: readonly FusionEvent[]
  secessions: readonly SecessionEvent[]
  rivalCreated?: RivalCreationEvent
}>

export type CupSession = Readonly<{
  id: 'active'
  seed: string
  seasonYear?: number
  datasetVersion: string
  activeTeamIds: readonly string[]
  roundNumber: number
  round: DrawRound
  results: Readonly<Record<string, MatchResult>>
  history: readonly ArchivedMatch[]
  championId?: string
  conferenceChampionIds?: Readonly<Record<string, string>> // conferenceId -> communeId
  roundByes?: Readonly<Record<number, readonly string[]>>
  clubs?: readonly Club[]
  interseasonReport?: InterseasonReport
  /**
   * Prochain indice de club pour chaque commune (garantit des IDs uniques à vie).
   * Key = communeId, value = prochain suffixe numérique.
   * Ex: { '69123': 3 } => le prochain club de Lyon aura l'id '69123-3'.
   */
  communeNextIndex?: Readonly<Record<string, number>>
  /**
   * Registre de tous les noms de clubs ayant jamais existé (actifs ou absorbés).
   * Permet de garantir l'unicité des noms même pour les clubs disparus.
   * Noms stockés en minuscules.
   */
  retiredClubNames?: readonly string[]
  persons?: readonly Person[]
  individualAwards?: SeasonAwards
  /** Absent dans les anciennes sauvegardes ; vide si aucun mouvement enregistré. */
  transferMovements?: readonly TransferMovement[]
}>

export type CareerBackupData = Readonly<{
  version: 1
  exportedAt: string
  session?: CupSession
  archives: readonly SeasonArchive[]
  favoriteTeamIds?: readonly string[]
  favoritePersonIds?: readonly string[]
}>

export type TeamSeasonPerformanceRecord = TeamSeasonPerformance & Readonly<{
  year: number
}>

class CupDatabase extends Dexie {
  sessions!: EntityTable<CupSession, 'id'>
  archives!: EntityTable<SeasonArchive, 'year'>
  archiveSummaries!: EntityTable<SeasonArchive, 'year'>
  playerSeasonHonors!: EntityTable<PlayerSeasonHonor, 'id'>
  playerPalmares!: Table<PlayerPalmaresRecord, string>
  seasonAwardSummaries!: EntityTable<SeasonAwardSummary, 'year'>
  teamSeasonPerformances!: Table<TeamSeasonPerformanceRecord, [string, number]>

  constructor() {
    super('coupe-des-communes')
    this.version(1).stores({ sessions: 'id' })
    this.version(2).stores({ sessions: 'id', archives: 'year' })
    this.version(3).stores({ sessions: 'id', archives: 'year', archiveSummaries: 'year' }).upgrade(async (tx) => {
      const archives = await tx.table<SeasonArchive>('archives').toArray()
      await tx.table<SeasonArchive>('archiveSummaries').bulkPut(archives.map(toArchiveSummary))
    })
    this.version(4).stores({
      sessions: 'id',
      archives: 'year',
      archiveSummaries: 'year',
      playerSeasonHonors: 'id, personId, year, [personId+year]',
      playerPalmares: 'person.id, totalTitles, palmaresScore, rank',
      seasonAwardSummaries: 'year',
    })
    this.version(5).stores({
      sessions: 'id',
      archives: 'year',
      archiveSummaries: 'year',
      playerSeasonHonors: 'id, personId, year, [personId+year]',
      playerPalmares: 'person.id, totalTitles, palmaresScore, rank',
      seasonAwardSummaries: 'year',
      teamSeasonPerformances: '[teamId+year], teamId, year',
    }).upgrade(async (tx) => {
      // 1. Alléger archiveSummaries sans charger en bloc en mémoire
      await tx.table('archiveSummaries').toCollection().modify((summary: any) => {
        const light = toArchiveSummary(summary)
        summary.teamPerformances = light.teamPerformances
        summary.summaryOnly = true
      })
      // 2. Parcourir archives une par une pour peupler teamSeasonPerformances, honneurs et archiveSummaries
      await tx.table<SeasonArchive>('archives').each(async (arch) => {
        const hasSummary = await tx.table('archiveSummaries').where('year').equals(arch.year).count()
        if (hasSummary === 0) {
          await tx.table('archiveSummaries').put(toArchiveSummary(arch))
        }

        if (arch.teamPerformances) {
          const seasonPerfs = extractTeamSeasonPerformanceRecords(arch)
          if (seasonPerfs.length > 0) {
            await tx.table<TeamSeasonPerformanceRecord>('teamSeasonPerformances').bulkPut(seasonPerfs)
          }
        }
        // Couvrir les saisons manquantes dans playerSeasonHonors si absentes (Point 1)
        const honorsCount = await tx.table('playerSeasonHonors').where('year').equals(arch.year).count()
        if (honorsCount === 0) {
          const honors = extractSeasonPlayerHonors(arch)
          if (honors.length > 0) {
            await tx.table('playerSeasonHonors').bulkPut(honors)
          }
          const awards = extractSeasonAwardSummary(arch)
          if (awards) {
            await tx.table('seasonAwardSummaries').put(awards)
          }
        }
      })
      // 3. Reconstruire playerPalmares s'il est vide
      const palmaresCount = await tx.table('playerPalmares').count()
      if (palmaresCount === 0) {
        const allHonors = await tx.table<PlayerSeasonHonor>('playerSeasonHonors').toArray()
        if (allHonors.length > 0) {
          const ranked = buildPlayerPalmaresFromHonors(allHonors)
          await tx.table('playerPalmares').bulkPut(ranked)
        }
      }
    })
  }
}

export function toArchiveSummary(archive: SeasonArchive): SeasonArchive {
  const clean = sanitizeSeasonArchive(archive)
  const finalMatch = clean.finalMatch ?? clean.history.find(
    (match) => match.roundNumber === 14 &&
      (match.homeTeamId === clean.nationalChampionId || match.awayTeamId === clean.nationalChampionId),
  )
  const finalistId = clean.finalistId ?? (finalMatch ? (finalMatch.homeTeamId === clean.nationalChampionId ? finalMatch.awayTeamId : finalMatch.homeTeamId) : undefined)

  const { history: _history, clubs: _clubs, persons: _persons, ...summary } = clean
  return { ...summary, summaryOnly: true, finalMatch, finalistId, history: [], teamPerformances: {} }
}

export function extractTeamSeasonPerformanceRecords(archive: SeasonArchive): TeamSeasonPerformanceRecord[] {
  if (!archive.teamPerformances) return []
  return Object.values(archive.teamPerformances).map((perf) => ({
    ...perf,
    year: archive.year,
  }))
}

const database = new CupDatabase()

const archiveMutationListeners = new Set<() => void>()

export function onArchiveMutation(listener: () => void): () => void {
  archiveMutationListeners.add(listener)
  return () => {
    archiveMutationListeners.delete(listener)
  }
}

function notifyArchiveMutation(): void {
  for (const listener of archiveMutationListeners) {
    try {
      listener()
    } catch {
      // Ignore listener error
    }
  }
}

async function syncSeasonDerivedTablesInTx(cleanArchive: SeasonArchive): Promise<void> {
  const year = cleanArchive.year

  // 1. Nettoyer et insérer les performances de clubs pour cette saison
  await database.teamSeasonPerformances.where('year').equals(year).delete()
  if (cleanArchive.teamPerformances) {
    const teamPerfs = extractTeamSeasonPerformanceRecords(cleanArchive)
    if (teamPerfs.length > 0) {
      await database.teamSeasonPerformances.bulkPut(teamPerfs)
    }
  }

  // 2. Nettoyer et insérer les honneurs joueurs pour cette saison
  await database.playerSeasonHonors.where('year').equals(year).delete()
  const honors = extractSeasonPlayerHonors(cleanArchive)
  if (honors.length > 0) {
    await database.playerSeasonHonors.bulkPut(honors)
  }

  // 3. Mettre à jour seasonAwardSummaries
  const awards = extractSeasonAwardSummary(cleanArchive)
  if (awards) {
    await database.seasonAwardSummaries.put(awards)
  } else {
    await database.seasonAwardSummaries.delete(year)
  }

  // 4. Recalculer le palmarès global des joueurs
  const allHonors = await database.playerSeasonHonors.toArray()
  const ranked = buildPlayerPalmaresFromHonors(allHonors)
  await database.playerPalmares.clear()
  if (ranked.length > 0) {
    await database.playerPalmares.bulkPut(ranked)
  }
}

export const cupRepository = {
  load: async () => {
    const session = await database.sessions.get('active')
    return session ? sanitizeCupSession(session) : undefined
  },
  save: (session: CupSession) => database.sessions.put(sanitizeCupSession(session)),
  clear: () => database.sessions.delete('active'),
  loadArchives: async () => {
    const archives = await database.archives.toArray()
    return archives.map(sanitizeSeasonArchive)
  },
  loadArchiveSummaries: async () => {
    let summaries = await database.archiveSummaries.toArray()
    const fullArchivesCount = await database.archives.count()

    // Si archiveSummaries est vide ou s'il manque des saisons par rapport à la table archives (ex: carrières existantes)
    if (summaries.length < fullArchivesCount) {
      const fullArchives = await database.archives.toArray()
      const existingYears = new Set(summaries.map((s) => s.year))
      const missing = fullArchives
        .filter((a) => !existingYears.has(a.year))
        .map(toArchiveSummary)

      if (missing.length > 0) {
        await database.archiveSummaries.bulkPut(missing)
        summaries = [...summaries, ...missing]
      }
    }

    // Si certains résumés n'ont pas encore finalMatch, finalistId ou conferenceChampions renseigné,
    // on les enrichit depuis la table archives complète pour que le podium et la finale soient complets
    const needsEnrichment = summaries.some(
      (s) => !s.finalMatch || !s.finalistId || !s.conferenceChampions || Object.keys(s.conferenceChampions).length === 0,
    )
    if (needsEnrichment && fullArchivesCount > 0) {
      const fullArchives = await database.archives.toArray()
      const archivesByYear = new Map(fullArchives.map((a) => [a.year, a]))
      const updatedSummaries: SeasonArchive[] = []

      for (const summary of summaries) {
        const full = archivesByYear.get(summary.year)
        if (full) {
          const recomputed = toArchiveSummary(full)
          let changed = false
          let updated = summary
          if (!summary.finalMatch && recomputed.finalMatch) {
            updated = { ...updated, finalMatch: recomputed.finalMatch }
            changed = true
          }
          if (!summary.finalistId && recomputed.finalistId) {
            updated = { ...updated, finalistId: recomputed.finalistId }
            changed = true
          }
          if (
            (!summary.conferenceChampions || Object.keys(summary.conferenceChampions).length === 0) &&
            recomputed.conferenceChampions &&
            Object.keys(recomputed.conferenceChampions).length > 0
          ) {
            updated = { ...updated, conferenceChampions: recomputed.conferenceChampions }
            changed = true
          }
          if (changed) {
            updatedSummaries.push(updated)
          }
        }
      }

      if (updatedSummaries.length > 0) {
        await database.archiveSummaries.bulkPut(updatedSummaries)
        summaries = await database.archiveSummaries.toArray()
      }
    }

    return summaries.sort((a, b) => b.year - a.year).map(sanitizeSeasonArchive)
  },
  loadArchive: async (year: number) => {
    const archive = await database.archives.get(year)
    return archive ? sanitizeSeasonArchive(archive) : undefined
  },
  saveArchive: async (archive: SeasonArchive) => {
    const clean = sanitizeSeasonArchive(archive)
    await database.transaction(
      'rw',
      [
        database.archives,
        database.archiveSummaries,
        database.playerSeasonHonors,
        database.playerPalmares,
        database.seasonAwardSummaries,
        database.teamSeasonPerformances,
      ],
      async () => {
        await database.archives.put(clean)
        await database.archiveSummaries.put(toArchiveSummary(clean))
        await syncSeasonDerivedTablesInTx(clean)
      },
    )
    notifyArchiveMutation()
  },
  commitSeasonTransition: async (archive: SeasonArchive | undefined, session: CupSession): Promise<void> => {
    const cleanArchive = archive ? sanitizeSeasonArchive(archive) : undefined
    const cleanSession = sanitizeCupSession(session)
    await database.transaction(
      'rw',
      [
        database.sessions,
        database.archives,
        database.archiveSummaries,
        database.playerSeasonHonors,
        database.playerPalmares,
        database.seasonAwardSummaries,
        database.teamSeasonPerformances,
      ],
      async () => {
        if (cleanArchive) {
          await database.archives.put(cleanArchive)
          await database.archiveSummaries.put(toArchiveSummary(cleanArchive))
          await syncSeasonDerivedTablesInTx(cleanArchive)
        }
        await database.sessions.put(cleanSession)
      },
    )
    notifyArchiveMutation()
  },
  clearAll: async () => {
    await database.transaction(
      'rw',
      [
        database.sessions,
        database.archives,
        database.archiveSummaries,
        database.playerSeasonHonors,
        database.playerPalmares,
        database.seasonAwardSummaries,
        database.teamSeasonPerformances,
      ],
      async () => {
        await database.sessions.clear()
        await database.archives.clear()
        await database.archiveSummaries.clear()
        await database.playerSeasonHonors.clear()
        await database.playerPalmares.clear()
        await database.seasonAwardSummaries.clear()
        await database.teamSeasonPerformances.clear()
      },
    )
    notifyArchiveMutation()
  },
  exportBackup: async (): Promise<CareerBackupData> => {
    const session = await database.sessions.get('active')
    const rawArchives = await database.archives.toArray()
    const cleanSession = session ? sanitizeCupSession(session) : undefined
    const cleanArchives = rawArchives.map(sanitizeSeasonArchive)
    let favoriteTeamIds: string[] = []
    try {
      const raw = localStorage.getItem('coupe_favorite_team_ids')
      if (raw) favoriteTeamIds = JSON.parse(raw)
    } catch {
      // Ignore
    }
    return {
      version: 1,
      exportedAt: new Date().toISOString(),
      session: cleanSession,
      archives: cleanArchives,
      favoriteTeamIds,
      favoritePersonIds: loadPlayerFavorites(),
    }
  },
  importBackup: async (backup: CareerBackupData): Promise<void> => {
    validateCareerBackup(backup)
    const cleanSession = backup.session ? sanitizeCupSession(backup.session) : undefined
    const cleanArchives = backup.archives.map(sanitizeSeasonArchive)
    const previousFavorites = localStorage.getItem('coupe_favorite_team_ids')
    const previousPlayerFavorites = localStorage.getItem(PLAYER_FAVORITES_STORAGE_KEY)
    let favoritesChanged = false
    let playerFavoritesChanged = false
    try {
      await database.transaction(
        'rw',
        [
          database.sessions,
          database.archives,
          database.archiveSummaries,
          database.playerSeasonHonors,
          database.playerPalmares,
          database.seasonAwardSummaries,
          database.teamSeasonPerformances,
        ],
        async () => {
          await database.sessions.clear()
          await database.archives.clear()
          await database.archiveSummaries.clear()
          await database.playerSeasonHonors.clear()
          await database.playerPalmares.clear()
          await database.seasonAwardSummaries.clear()
          await database.teamSeasonPerformances.clear()
          if (cleanSession) {
            await database.sessions.put(cleanSession)
          }
          if (cleanArchives.length > 0) {
            await database.archives.bulkPut(cleanArchives as SeasonArchive[])
            await database.archiveSummaries.bulkPut(cleanArchives.map(toArchiveSummary))

            const allTeamPerfs: TeamSeasonPerformanceRecord[] = []
            const allHonors: PlayerSeasonHonor[] = []
            const allAwardSummaries: SeasonAwardSummary[] = []
            for (const arch of cleanArchives) {
              const perfs = extractTeamSeasonPerformanceRecords(arch)
              if (perfs.length > 0) allTeamPerfs.push(...perfs)
              const honors = extractSeasonPlayerHonors(arch)
              const awards = extractSeasonAwardSummary(arch)
              if (honors.length > 0) allHonors.push(...honors)
              if (awards) allAwardSummaries.push(awards)
            }
            if (allTeamPerfs.length > 0) await database.teamSeasonPerformances.bulkPut(allTeamPerfs)
            if (allHonors.length > 0) await database.playerSeasonHonors.bulkPut(allHonors)
            if (allAwardSummaries.length > 0) await database.seasonAwardSummaries.bulkPut(allAwardSummaries)
            const ranked = buildPlayerPalmaresFromHonors(allHonors)
            if (ranked.length > 0) await database.playerPalmares.bulkPut(ranked)
          }
          localStorage.setItem('coupe_favorite_team_ids', JSON.stringify(backup.favoriteTeamIds ?? []))
          favoritesChanged = true
          localStorage.setItem(PLAYER_FAVORITES_STORAGE_KEY, JSON.stringify(backup.favoritePersonIds ?? []))
          playerFavoritesChanged = true
        },
      )
      notifyArchiveMutation()
    } catch (error) {
      if (favoritesChanged) {
        if (previousFavorites === null) localStorage.removeItem('coupe_favorite_team_ids')
        else localStorage.setItem('coupe_favorite_team_ids', previousFavorites)
      }
      if (playerFavoritesChanged) {
        if (previousPlayerFavorites === null) localStorage.removeItem(PLAYER_FAVORITES_STORAGE_KEY)
        else localStorage.setItem(PLAYER_FAVORITES_STORAGE_KEY, previousPlayerFavorites)
      }
      throw error
    }
  },
  loadPlayerPalmares: async () => {
    return database.playerPalmares.orderBy('rank').toArray()
  },
  loadSeasonAwardSummaries: async () => {
    return database.seasonAwardSummaries.orderBy('year').reverse().toArray()
  },
  loadPlayerSeasonHonors: async (personId?: string) => {
    if (personId) {
      return database.playerSeasonHonors.where('personId').equals(personId).toArray()
    }
    return database.playerSeasonHonors.toArray()
  },
  savePlayerSeasonHonors: async (honors: PlayerSeasonHonor[]) => {
    await database.playerSeasonHonors.bulkPut(honors)
  },
  savePlayerPalmares: async (entries: PlayerPalmaresRecord[]) => {
    await database.transaction('rw', database.playerPalmares, async () => {
      await database.playerPalmares.clear()
      if (entries.length > 0) {
        await database.playerPalmares.bulkPut(entries)
      }
    })
  },
  saveSeasonAwardSummary: async (summary: SeasonAwardSummary) => {
    await database.seasonAwardSummaries.put(summary)
  },
  loadTeamSeasonPerformances: async (teamId: string): Promise<TeamSeasonPerformanceRecord[]> => {
    const records = await database.teamSeasonPerformances.where('teamId').equals(teamId).toArray()
    if (records.length > 0) {
      return records.sort((a, b) => b.year - a.year)
    }
    const teamRecords: TeamSeasonPerformanceRecord[] = []
    await database.archives.each((arch) => {
      const perf = arch.teamPerformances?.[teamId]
      if (perf) {
        teamRecords.push({ ...perf, year: arch.year })
      }
    })
    if (teamRecords.length > 0) {
      await database.teamSeasonPerformances.bulkPut(teamRecords)
      return teamRecords.sort((a, b) => b.year - a.year)
    }
    return []
  },
  saveTeamSeasonPerformances: async (records: TeamSeasonPerformanceRecord[]): Promise<void> => {
    if (records.length > 0) {
      await database.teamSeasonPerformances.bulkPut(records)
    }
  },
  rebuildPlayerPalmares: async (archives: readonly SeasonArchive[], clubsById?: Map<string, Club>) => {
    const allHonors: PlayerSeasonHonor[] = []
    const allAwardSummaries: SeasonAwardSummary[] = []

    for (const archive of archives) {
      let targetArchive = archive
      if (archive.summaryOnly && (!archive.persons || archive.persons.length === 0)) {
        const detailed = await database.archives.get(archive.year)
        if (detailed) targetArchive = detailed
      }
      const honors = extractSeasonPlayerHonors(targetArchive, clubsById)
      const awards = extractSeasonAwardSummary(targetArchive)
      if (honors.length > 0) allHonors.push(...honors)
      if (awards) allAwardSummaries.push(awards)
    }

    const ranked = buildPlayerPalmaresFromHonors(allHonors, undefined, clubsById)

    await database.transaction(
      'rw',
      [database.playerSeasonHonors, database.playerPalmares, database.seasonAwardSummaries],
      async () => {
        await database.playerSeasonHonors.clear()
        await database.playerPalmares.clear()
        await database.seasonAwardSummaries.clear()
        if (allHonors.length > 0) await database.playerSeasonHonors.bulkPut(allHonors)
        if (allAwardSummaries.length > 0) await database.seasonAwardSummaries.bulkPut(allAwardSummaries)
        if (ranked.length > 0) await database.playerPalmares.bulkPut(ranked)
      },
    )

    return ranked
  },
}

export type CupRepository = {
  load: () => Promise<CupSession | undefined>
  save: (session: CupSession) => Promise<unknown>
  clear: () => Promise<unknown>
  loadArchives?: () => Promise<SeasonArchive[]>
  loadArchiveSummaries?: () => Promise<SeasonArchive[]>
  loadArchive?: (year: number) => Promise<SeasonArchive | undefined>
  saveArchive?: (archive: SeasonArchive) => Promise<unknown>
  commitSeasonTransition?: (archive: SeasonArchive | undefined, session: CupSession) => Promise<void>
  clearAll?: () => Promise<unknown>
  exportBackup?: () => Promise<CareerBackupData>
  importBackup?: (backup: CareerBackupData) => Promise<void>
  loadPlayerPalmares?: () => Promise<PlayerPalmaresRecord[]>
  loadSeasonAwardSummaries?: () => Promise<SeasonAwardSummary[]>
  loadPlayerSeasonHonors?: (personId?: string) => Promise<PlayerSeasonHonor[]>
  savePlayerSeasonHonors?: (honors: PlayerSeasonHonor[]) => Promise<void>
  savePlayerPalmares?: (entries: PlayerPalmaresRecord[]) => Promise<void>
  saveSeasonAwardSummary?: (summary: SeasonAwardSummary) => Promise<void>
  rebuildPlayerPalmares?: (archives: readonly SeasonArchive[], clubsById?: Map<string, Club>) => Promise<PlayerPalmaresRecord[]>
  loadTeamSeasonPerformances?: (teamId: string) => Promise<TeamSeasonPerformanceRecord[]>
  saveTeamSeasonPerformances?: (records: TeamSeasonPerformanceRecord[]) => Promise<void>
}
