import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useMemo,
  type ReactNode,
} from 'react'
import { loadGeography } from '../features/geography/loadGeography'
import type { GeographyDataset } from '../features/geography/types'
import {
  cupRepository,
  type CupRepository,
  type CupSession,
  type SeasonArchive,
  toArchiveSummary,
} from '../features/storage/cupRepository'
import { createPhaseRound, isFinalRound } from '../features/competition/competition'
import {
  loadStoredFavorites,
  saveStoredFavorites,
  getFavoriteColorForIndex,
} from '../features/teams/favoritesStorage'
import {
  type TeamTrophyRecord,
  computeTeamRecords,
  buildSeasonArchive,
  parseSeasonYear,
} from '../features/history/palmaresSelectors'
import type { Club } from '../features/teams/types'
import { isClubIdentity, type ClubIdentity } from '../features/teams/clubIdentity'
import { buildClubsFromCommunes } from '../features/teams/clubGenerator'
import { executeInterseasonTransition } from '../features/teams/interseasonEngine'
import type { InterseasonReport } from '../features/storage/cupRepository'
import { saveBackupFile, readBackupFile, type BackupSaveResult } from '../features/storage/backupService'
import { CUP_CONFIG } from '../config/cupConfig'
import { validateCareerBackup } from '../features/storage/validateBackup'
import type { Person } from '../features/persons/types'
import {
  generateInitialPersonPool,
  advancePersonsSeasonWithMarket,
  replenishActivePersonsPool,
} from '../features/persons/personGenerator'
import { applyRostersStrengthToClubs } from '../features/persons/rosterAndLoans'
import { collectLoanMovements } from '../features/transfers/transferEngine'
import { getSeasonAwards, refreshActiveSeasonAwards, sanitizeCupSession, sanitizeSeasonArchive } from '../features/awards/seasonAwards'
import { loadPlayerFavorites, savePlayerFavorites } from '../features/persons/playerFavoritesStorage'

export type CupAppContextType = {
  dataset: GeographyDataset | null
  clubs: readonly Club[]
  clubsById: Map<string, Club>
  clubsByCommuneId: Map<string, Club[]>
  persons: readonly Person[]
  session: CupSession | null
  archives: readonly SeasonArchive[]
  teamRecords: Map<string, TeamTrophyRecord>
  ready: boolean
  error: string | null
  persistSession: (next: CupSession) => Promise<void>
  resetSession: () => Promise<void>
  resetAllHistory: (initialSeed?: string) => Promise<void>
  createCup: (seed: string, year?: number) => void
  advanceToNextSeason: (overrideChampionId?: string) => Promise<void>
  reloadSession: () => Promise<void>
  renameClub: (clubId: string, newName: string) => Promise<void>
  updateClubIdentity?: (clubId: string, identity: ClubIdentity) => Promise<void>
  exportBackup: () => Promise<void>
  importBackup: (file: File) => Promise<boolean>
  favoriteTeamIds: readonly string[]
  favoritePersonIds: readonly string[]
  togglePlayerFavorite: (personId: string) => void
  toggleFavorite: (teamId: string) => void
  isFavorite: (teamId: string) => boolean
  getFavoriteColor: (teamId: string) => string
  lastAutoBackupResult: BackupSaveResult | null
  dismissAutoBackupNotification: () => void
  isResetModalOpen: boolean
  openResetModal: () => void
  closeResetModal: () => void
}

export const CupAppContext = createContext<CupAppContextType | null>(null)

/** Met les notes courantes d'une sauvegarde à jour selon les règles d'effectif actuelles. */
function refreshSessionClubStrengths(session: CupSession): CupSession {
  const savedClubs = session.clubs
  // Un pool absent ou vide sera généré puis enregistré avec ses notes par la synchronisation.
  if (!savedClubs?.length || !session.persons?.length) return session
  const clubs = applyRostersStrengthToClubs(savedClubs, session.persons)
  const changed = clubs.some((club, index) =>
    club.strength !== savedClubs[index].strength || club.baseStrength !== savedClubs[index].baseStrength ||
    JSON.stringify(club.coach) !== JSON.stringify(savedClubs[index].coach),
  )
  return changed ? { ...session, clubs } : session
}

export function CupAppProvider({
  children,
  loadDataset = loadGeography,
  repository = cupRepository,
}: {
  children: ReactNode
  loadDataset?: () => Promise<GeographyDataset>
  repository?: CupRepository
}) {
  const [dataset, setDataset] = useState<GeographyDataset | null>(null)
  const [session, setSession] = useState<CupSession | null>(null)
  const [archives, setArchives] = useState<readonly SeasonArchive[]>([])
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastAutoBackupResult, setLastAutoBackupResult] = useState<BackupSaveResult | null>(null)
  const [isResetModalOpen, setIsResetModalOpen] = useState(false)

  const openResetModal = useCallback(() => setIsResetModalOpen(true), [])
  const closeResetModal = useCallback(() => setIsResetModalOpen(false), [])

  const dismissAutoBackupNotification = useCallback(() => {
    setLastAutoBackupResult(null)
  }, [])

  useEffect(() => {
    if (!lastAutoBackupResult) return
    const timer = setTimeout(() => {
      setLastAutoBackupResult(null)
    }, 8000)
    return () => clearTimeout(timer)
  }, [lastAutoBackupResult])

  useEffect(() => {
    let active = true
    const archiveLoader = repository.loadArchiveSummaries?.() ?? repository.loadArchives?.() ?? Promise.resolve([])

    Promise.all([loadDataset(), repository.load(), archiveLoader])
      .then(([data, saved, loadedArchives]) => {
        if (!active) return
        setDataset(data)
        const cleanSession = saved ? refreshActiveSeasonAwards(refreshSessionClubStrengths(sanitizeCupSession(saved))) : null
        if (cleanSession && cleanSession.datasetVersion === data.version) {
          setSession(cleanSession)
          if (cleanSession !== saved) {
            void repository.save(cleanSession)
          }
        } else {
          setSession(null)
        }
        const rawArchives = loadedArchives ?? []
        const cleanArchives = rawArchives.map(sanitizeSeasonArchive)
        setArchives(cleanArchives)
        cleanArchives.forEach((arch, idx) => {
          if (arch !== rawArchives[idx] && repository.saveArchive) {
            void repository.saveArchive(arch)
          }
        })
        setReady(true)
      })
      .catch((reason: unknown) => {
        if (!active) return
        setError(reason instanceof Error ? reason.message : 'Chargement impossible.')
        setReady(true)
      })

    return () => {
      active = false
    }
  }, [loadDataset, repository])

  const persistSession = useCallback(
    async (next: CupSession) => {
      const cleanNext = refreshActiveSeasonAwards(sanitizeCupSession(next))
      const awards = getSeasonAwards(cleanNext)
      const saved = awards && !cleanNext.individualAwards ? { ...cleanNext, individualAwards: awards } : cleanNext
      await repository.save(saved)
      setSession(saved)
    },
    [repository],
  )

  const resetSession = useCallback(async () => {
    await repository.clear()
    setSession(null)
  }, [repository])

  const defaultClubs = useMemo(() => {
    if (!dataset) return []
    return buildClubsFromCommunes(dataset.communes)
  }, [dataset])

  const clubs = useMemo(() => {
    if (session?.clubs && session.clubs.length > 0) {
      return session.clubs
    }
    return defaultClubs
  }, [session?.clubs, defaultClubs])

  const persons = useMemo(() => {
    if (session?.persons && session.persons.length > 0) {
      const activeCount = session.persons.filter((p) => !p.isRetired).length
      if (activeCount < 250 && dataset && clubs.length > 0) {
        return replenishActivePersonsPool({
          persons: session.persons,
          communes: dataset.communes,
          clubs,
          seed: session.seed,
          seasonYear: session.seasonYear ?? parseSeasonYear(session.seed, CUP_CONFIG.defaultStartYear),
          targetActiveCount: 300,
          fusions: session.interseasonReport?.fusions,
        })
      }
      return session.persons
    }
    if (dataset && clubs.length > 0) {
      return generateInitialPersonPool({
        count: 300,
        communes: dataset.communes,
        clubs,
        seed: session?.seed ?? CUP_CONFIG.defaultSeed,
        startYear: session?.seasonYear ?? parseSeasonYear(session?.seed ?? CUP_CONFIG.defaultSeed, CUP_CONFIG.defaultStartYear),
        assignRostersAndLoans: true,
      })
    }
    return []
  }, [session?.persons, session?.seed, session?.seasonYear, session?.interseasonReport?.fusions, dataset, clubs])

  // Synchronisation automatique des effectifs générés ou renfloués et de leurs notes.
  useEffect(() => {
    if (!session || !dataset || clubs.length === 0) return
    if (session.persons && session.persons.length > 0) {
      const activeCount = session.persons.filter((p) => !p.isRetired).length
      if (activeCount < 250) {
        const replenished = replenishActivePersonsPool({
          persons: session.persons,
          communes: dataset.communes,
          clubs,
          seed: session.seed,
          seasonYear: session.seasonYear ?? parseSeasonYear(session.seed, CUP_CONFIG.defaultStartYear),
          targetActiveCount: 300,
          fusions: session.interseasonReport?.fusions,
        })
        const updatedClubs = applyRostersStrengthToClubs(clubs, replenished)
        void persistSession({
          ...session,
          persons: replenished,
          clubs: updatedClubs,
        })
      }
    } else if (persons.length > 0) {
      void persistSession({
        ...session,
        persons,
        clubs: applyRostersStrengthToClubs(clubs, persons),
      })
    }
  }, [session, dataset, clubs, persons, persistSession])

  const resetAllHistory = useCallback(async (initialSeed?: string) => {
    if (repository.clearAll) {
      await repository.clearAll()
    } else {
      await repository.clear()
    }
    setArchives([])
    if (dataset) {
      const initialClubs = buildClubsFromCommunes(dataset.communes)
      const ids = initialClubs.map((team) => team.id)
      const seed = (initialSeed && initialSeed.trim()) ? initialSeed.trim() : CUP_CONFIG.defaultSeed
      const seasonYear = parseSeasonYear(seed, CUP_CONFIG.defaultStartYear)
      const initialPersons = generateInitialPersonPool({
        count: 300,
        communes: dataset.communes,
        clubs: initialClubs,
        seed,
        startYear: seasonYear,
        assignRostersAndLoans: true,
      })
      const clubsWithStrength = applyRostersStrengthToClubs(initialClubs, initialPersons)
      const newSession: CupSession = {
        id: 'active',
        seed,
        seasonYear,
        datasetVersion: dataset.version,
        activeTeamIds: ids,
        roundNumber: 1,
        round: createPhaseRound(clubsWithStrength, seed, 1),
        results: {},
        history: [],
        roundByes: {},
        clubs: clubsWithStrength,
        persons: initialPersons,
        transferMovements: collectLoanMovements({ persons: initialPersons, clubs: initialClubs, seasonYear, seed }),
      }
      await persistSession(newSession)
    } else {
      setSession(null)
    }
    // Une nouvelle carrière peut réutiliser les mêmes IDs pour d'autres personnes.
    setFavoritePersonIds([])
    savePlayerFavorites([])
  }, [repository, dataset, persistSession])

  const reloadSession = useCallback(async () => {
    const saved = await repository.load()
    const refreshed = saved ? refreshActiveSeasonAwards(refreshSessionClubStrengths(sanitizeCupSession(saved))) : null
    if (refreshed && refreshed !== saved) await repository.save(refreshed)
    setSession(refreshed)
    if (repository.loadArchiveSummaries || repository.loadArchives) {
      const loaded = await (repository.loadArchiveSummaries?.() ?? repository.loadArchives?.() ?? Promise.resolve([]))
      setArchives(loaded ?? [])
    }
  }, [repository])

  const createCup = useCallback(
    (seed: string, year?: number) => {
      if (!dataset || !seed.trim()) return
      const baseClubs = session?.clubs && session.clubs.length > 0 ? session.clubs : buildClubsFromCommunes(dataset.communes)
      const ids = baseClubs.map((team) => team.id)
      const normalized = seed.trim()
      const seasonYear = year ?? parseSeasonYear(normalized, 2026)
      const initialPersons = session?.persons && session.persons.length > 0
        ? session.persons
        : generateInitialPersonPool({
            count: 300,
            communes: dataset.communes,
            clubs: baseClubs,
            seed: normalized,
            startYear: seasonYear,
            assignRostersAndLoans: true,
          })
      const clubsWithStrength = applyRostersStrengthToClubs(baseClubs, initialPersons)
      const newSession: CupSession = {
        id: 'active',
        seed: normalized,
        seasonYear,
        datasetVersion: dataset.version,
        activeTeamIds: ids,
        roundNumber: 1,
        round: createPhaseRound(clubsWithStrength, normalized, 1),
        results: {},
        history: [],
        roundByes: {},
        clubs: clubsWithStrength,
        persons: initialPersons,
        transferMovements: session?.seasonYear === seasonYear && session.transferMovements !== undefined
          ? session.transferMovements
          : collectLoanMovements({ persons: initialPersons, clubs: baseClubs, seasonYear, seed: normalized }),
      }
      void persistSession(newSession)
    },
    [dataset, session?.clubs, session?.persons, session?.seasonYear, session?.transferMovements, persistSession],
  )

  const advanceToNextSeason = useCallback(async (overrideChampionId?: string) => {
    if (!dataset || !session) return

    const currentClubs = session.clubs && session.clubs.length > 0 ? session.clubs : buildClubsFromCommunes(dataset.communes)
    const currentPersons = session.persons && session.persons.length > 0
      ? session.persons
      : generateInitialPersonPool({
          count: 300,
          communes: dataset.communes,
          clubs: currentClubs,
          seed: session.seed,
        })

    // Determine effective championId even if not yet saved on session
    let effectiveChampionId = overrideChampionId ?? session.championId
    if (!effectiveChampionId) {
      if (isFinalRound(session.round)) {
        const m = session.round.matches[0]
        if (session.results[m.id]?.winnerId) {
          effectiveChampionId = session.results[m.id].winnerId
        }
      }
      if (!effectiveChampionId) {
        const r14 = session.history.find((m) => m.roundNumber === 14)
        if (r14?.result?.winnerId) {
          effectiveChampionId = r14.result.winnerId
        }
      }
      if (!effectiveChampionId && session.history.length > 0) {
        const last = session.history[session.history.length - 1]
        if (last?.result?.winnerId && (last.roundNumber === 14 || session.activeTeamIds.length <= 2)) {
          effectiveChampionId = last.result.winnerId
        }
      }
    }

    const effectiveSession: CupSession = {
      ...session,
      championId: effectiveChampionId,
      persons: currentPersons,
    }

    // Archive current session if it produced a champion
    let nextArchives = [...archives]
    let currentArchive: SeasonArchive | undefined
    if (effectiveChampionId) {
      const archive = buildSeasonArchive(effectiveSession, dataset, currentClubs)
      currentArchive = archive
      nextArchives = [...nextArchives.filter((a) => a.year !== archive.year),
        repository.loadArchiveSummaries ? toArchiveSummary(archive) : archive]
    }

    // Determine next season year
    const currentYear = session.seasonYear ?? parseSeasonYear(session.seed, CUP_CONFIG.defaultStartYear)
    const nextYear = currentYear + 1
    const nextSeed = `tournoi-${nextYear}`

    // --- Registres d'unicité ---
    // Noms retraités cumulés depuis les saisons précédentes
    const usedClubNamesSet = new Set<string>(session.retiredClubNames ?? [])
    // On ajoute les noms de tous les clubs actifs actuels
    for (const club of currentClubs) {
      usedClubNamesSet.add(club.name.toLowerCase())
    }
    // Registre des indices de club par commune (pour IDs uniques à vie)
    const communeNextIndex = { ...(session.communeNextIndex ?? {}) }

    // Interseason transition: Fusions, Sécessions & Champion Rival creation
    let nextClubs = currentClubs
    let report: InterseasonReport | undefined
    let nextCommuneNextIndex = communeNextIndex

    if (currentArchive) {
      const transition = executeInterseasonTransition(
        currentClubs,
        currentArchive,
        dataset.communes,
        {
          seed: nextSeed,
          maxFusions: CUP_CONFIG.maxFusionsPerSeason ?? 30,
          usedClubNames: usedClubNamesSet,
          communeNextIndex,
        },
      )
      nextClubs = transition.nextClubs
      report = transition.report
      nextCommuneNextIndex = transition.nextCommuneNextIndex

      // Enrichir le registre des noms retraités avec les clubs absorbés par les nouvelles fusions
      for (const fusion of transition.report.fusions) {
        usedClubNamesSet.add(fusion.absorbedClubName.toLowerCase())
        usedClubNamesSet.add(fusion.mergedClubName.toLowerCase())
      }
      for (const secession of transition.report.secessions) {
        usedClubNamesSet.add(secession.newClubName.toLowerCase())
      }
    }

    const ids = nextClubs.map((team) => team.id)

    const market = advancePersonsSeasonWithMarket({
      persons: currentPersons,
      communes: dataset.communes,
      clubs: nextClubs,
      seasonYear: nextYear,
      seed: nextSeed,
      previousSeasonArchive: currentArchive,
      fusions: report?.fusions,
    })
    const nextPersons = market.persons

    const clubsWithStrength = applyRostersStrengthToClubs(nextClubs, nextPersons)
    const newSession: CupSession = {
      id: 'active',
      seed: nextSeed,
      seasonYear: nextYear,
      datasetVersion: dataset.version,
      activeTeamIds: ids,
      roundNumber: 1,
      round: createPhaseRound(clubsWithStrength, nextSeed, 1),
      results: {},
      history: [],
      roundByes: {},
      clubs: clubsWithStrength,
      interseasonReport: report,
      communeNextIndex: nextCommuneNextIndex,
      retiredClubNames: Array.from(usedClubNamesSet),
      persons: nextPersons,
      transferMovements: market.movements,
    }

    if (repository.commitSeasonTransition) {
      await repository.commitSeasonTransition(currentArchive, newSession)
      setSession(newSession)
    } else {
      if (currentArchive && repository.saveArchive) await repository.saveArchive(currentArchive)
      await persistSession(newSession)
    }
    setArchives(nextArchives)

    // Export automatique de la sauvegarde de fin de saison dans le dossier local sauvegardes/
    if (repository.exportBackup) {
      try {
        const backupData = await repository.exportBackup()
        const result = await saveBackupFile(backupData, {
          seasonYear: currentYear,
          isAuto: true,
          triggerDownload: false,
        })
        setLastAutoBackupResult(result)
      } catch (err) {
        console.error('Erreur lors de la sauvegarde automatique de fin de saison :', err)
      }
    }
  }, [dataset, session, archives, repository, persistSession])

  const renameClub = useCallback(
    async (clubId: string, newName: string) => {
      const trimmed = newName.trim()
      if (!trimmed) return

      const currentClubs =
        session?.clubs && session.clubs.length > 0
          ? session.clubs
          : dataset
            ? buildClubsFromCommunes(dataset.communes)
            : []

      if (currentClubs.length === 0) return

      const updatedClubs = currentClubs.map((club) => {
        if (club.id === clubId) {
          return {
            ...club,
            name: trimmed,
            shortName: trimmed.length > 40 ? `${trimmed.slice(0, 37)}...` : trimmed,
            isCustomName: true,
          }
        }
        return club
      })

      const usedClubNames = new Set(session?.retiredClubNames ?? [])
      usedClubNames.add(trimmed.toLowerCase())

      let updatedReport = session?.interseasonReport
      if (updatedReport) {
        const updatedFusions = updatedReport.fusions.map((f) =>
          f.mergedClubId === clubId ? { ...f, mergedClubName: trimmed } : f,
        )
        const updatedSecessions = updatedReport.secessions.map((s) =>
          s.newClubId === clubId ? { ...s, newClubName: trimmed } : s,
        )
        const updatedRival =
          updatedReport.rivalCreated?.clubId === clubId
            ? { ...updatedReport.rivalCreated, clubName: trimmed }
            : updatedReport.rivalCreated

        updatedReport = {
          ...updatedReport,
          fusions: updatedFusions,
          secessions: updatedSecessions,
          rivalCreated: updatedRival,
        }
      }

      if (session) {
        const updatedSession: CupSession = {
          ...session,
          clubs: updatedClubs,
          retiredClubNames: Array.from(usedClubNames),
          ...(updatedReport ? { interseasonReport: updatedReport } : {}),
        }
        await persistSession(updatedSession)
      } else if (dataset) {
        const ids = updatedClubs.map((team) => team.id)
        const seed = 'tournoi-2026'
        const newSession: CupSession = {
          id: 'active',
          seed,
          seasonYear: 2026,
          datasetVersion: dataset.version,
          activeTeamIds: ids,
          roundNumber: 1,
          round: createPhaseRound(updatedClubs, seed, 1),
          results: {},
          history: [],
          roundByes: {},
          clubs: updatedClubs,
          retiredClubNames: Array.from(usedClubNames),
        }
        await persistSession(newSession)
      }
    },
    [session, dataset, persistSession],
  )

  const updateClubIdentity = useCallback(async (clubId: string, identity: ClubIdentity) => {
    if (!isClubIdentity(identity)) throw new Error('Logo ou couleurs invalides.')
    if (!dataset || !clubs.some(club => club.id === clubId)) throw new Error('Club indisponible.')
    const updatedClubs = clubs.map(club => club.id === clubId ? { ...club, identity } : club)
    if (session) {
      await persistSession({ ...session, clubs: updatedClubs })
    } else {
      const seed = CUP_CONFIG.defaultSeed
      await persistSession({
        id: 'active', seed, seasonYear: parseSeasonYear(seed, CUP_CONFIG.defaultStartYear),
        datasetVersion: dataset.version, clubs: updatedClubs, persons,
        activeTeamIds: updatedClubs.map(club => club.id), roundNumber: 1,
        round: createPhaseRound(updatedClubs, seed, 1), results: {}, history: [], roundByes: {},
      })
    }
  }, [dataset, clubs, persons, session, persistSession])

  // Computed team records across all archived seasons + active session
  const teamRecords = useMemo(() => {
    return computeTeamRecords(archives, session, dataset ?? undefined)
  }, [archives, session, dataset])

  const clubsById = useMemo(() => {
    return new Map(clubs.map((club) => [club.id, club]))
  }, [clubs])

  const clubsByCommuneId = useMemo(() => {
    const map = new Map<string, Club[]>()
    for (const club of clubs) {
      const list = map.get(club.communeId) ?? []
      list.push(club)
      map.set(club.communeId, list)
    }
    return map
  }, [clubs])

  const [favoriteTeamIds, setFavoriteTeamIds] = useState<readonly string[]>(() => loadStoredFavorites())
  const [favoritePersonIds, setFavoritePersonIds] = useState<readonly string[]>(loadPlayerFavorites)
  const togglePlayerFavorite = useCallback((personId: string) => {
    setFavoritePersonIds(previous => {
      const next = previous.includes(personId) ? previous.filter(id => id !== personId) : [...previous, personId]
      savePlayerFavorites(next)
      return next
    })
  }, [])

  const toggleFavorite = useCallback((teamId: string) => {
    setFavoriteTeamIds((prev) => {
      const next = prev.includes(teamId) ? prev.filter((id) => id !== teamId) : [...prev, teamId]
      saveStoredFavorites(next)
      return next
    })
  }, [])

  const isFavorite = useCallback(
    (teamId: string) => favoriteTeamIds.includes(teamId),
    [favoriteTeamIds],
  )

  const getFavoriteColor = useCallback(
    (teamId: string) => {
      const index = favoriteTeamIds.indexOf(teamId)
      return getFavoriteColorForIndex(index)
    },
    [favoriteTeamIds],
  )

  const exportBackup = useCallback(async () => {
    if (!repository.exportBackup) return
    const data = await repository.exportBackup()
    const currentYear = session?.seasonYear ?? 2026
    const result = await saveBackupFile(data, {
      seasonYear: currentYear,
      isAuto: false,
      triggerDownload: true,
    })
    setLastAutoBackupResult(result)
  }, [repository, session?.seasonYear])

  const importBackup = useCallback(
    async (file: File): Promise<boolean> => {
      if (!repository.importBackup) return false
      try {
        const parsed = await readBackupFile(file)
        validateCareerBackup(parsed)
        const season = parsed.session?.seasonYear ?? 'aucune saison active'
        const count = parsed.session?.clubs?.length ?? parsed.session?.activeTeamIds.length ?? 0
        if (!window.confirm(`Importer cette carrière ?\nSaison : ${season}\nClubs : ${count}\nSaisons archivées : ${parsed.archives.length}\n\nElle remplacera la carrière actuellement ouverte.`)) return false
        await repository.importBackup(parsed)
        await reloadSession()
        setFavoriteTeamIds(loadStoredFavorites())
        setFavoritePersonIds(loadPlayerFavorites())
        return true
      } catch (err) {
        console.error('Erreur lors de l\'importation de la sauvegarde :', err)
        throw err
      }
    },
    [repository, reloadSession],
  )

  const value: CupAppContextType = useMemo(
    () => ({
      dataset,
      clubs,
      clubsById,
      clubsByCommuneId,
      persons,
      session,
      archives,
      teamRecords,
      ready,
      error,
      persistSession,
      resetSession,
      resetAllHistory,
      createCup,
      advanceToNextSeason,
      reloadSession,
      renameClub,
      updateClubIdentity,
      exportBackup,
      importBackup,
      favoriteTeamIds,
      favoritePersonIds,
      togglePlayerFavorite,
      toggleFavorite,
      isFavorite,
      getFavoriteColor,
      lastAutoBackupResult,
      dismissAutoBackupNotification,
      isResetModalOpen,
      openResetModal,
      closeResetModal,
    }),
    [
      dataset,
      clubs,
      clubsById,
      clubsByCommuneId,
      persons,
      session,
      archives,
      teamRecords,
      ready,
      error,
      persistSession,
      resetSession,
      resetAllHistory,
      createCup,
      advanceToNextSeason,
      reloadSession,
      renameClub,
      updateClubIdentity,
      exportBackup,
      importBackup,
      favoriteTeamIds,
      favoritePersonIds,
      togglePlayerFavorite,
      toggleFavorite,
      isFavorite,
      getFavoriteColor,
      lastAutoBackupResult,
      dismissAutoBackupNotification,
      isResetModalOpen,
      openResetModal,
      closeResetModal,
    ],
  )

  return <CupAppContext.Provider value={value}>{children}</CupAppContext.Provider>
}

export function useCupApp(): CupAppContextType {
  const context = useContext(CupAppContext)
  if (!context) {
    throw new Error('useCupApp must be used within a CupAppProvider')
  }
  return context
}

export function useOptionalCupApp(): CupAppContextType | null {
  return useContext(CupAppContext)
}
