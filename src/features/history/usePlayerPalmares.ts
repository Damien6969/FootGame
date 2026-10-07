import { useState, useEffect, useRef } from 'react'
import type { Person } from '../persons/types'
import type { Club } from '../teams/types'
import type { CupSession, SeasonArchive } from '../storage/cupRepository'
import { cupRepository, onArchiveMutation } from '../storage/cupRepository'
import {
  type PlayerPalmaresRecord,
  getRankedPlayerPalmares,
  rankPlayerPalmares,
} from './playerPalmaresSelectors'
import {
  type SeasonAwardSummary,
  extractSeasonPlayerHonors,
  extractSeasonAwardSummary,
  buildPlayerPalmaresFromHonors,
} from './playerPalmaresStorage'

export type UsePlayerPalmaresParams = {
  completedEditions: readonly SeasonArchive[]
  persons: readonly Person[]
  clubsById: Map<string, Club>
  activeSession?: CupSession | null
  enabled?: boolean
}

export type UsePlayerPalmaresResult = {
  rankedPlayers: PlayerPalmaresRecord[]
  awardSummaries: SeasonAwardSummary[]
  loading: boolean
  error: string | null
}

export function usePlayerPalmares({
  completedEditions,
  persons,
  clubsById,
  activeSession,
  enabled = true,
}: UsePlayerPalmaresParams): UsePlayerPalmaresResult {
  const [rankedPlayers, setRankedPlayers] = useState<PlayerPalmaresRecord[]>([])
  const [awardSummaries, setAwardSummaries] = useState<SeasonAwardSummary[]>([])
  const [loading, setLoading] = useState(enabled && completedEditions.length > 0)
  const [error, setError] = useState<string | null>(null)

  // Version counter to trigger re-fetches on mutations
  const [mutationCount, setMutationCount] = useState(0)

  useEffect(() => {
    return onArchiveMutation(() => {
      setMutationCount((c) => c + 1)
    })
  }, [])

  // Keep references to inputs to avoid infinite re-render loops from unstable object references
  const personsRef = useRef(persons)
  personsRef.current = persons
  const clubsByIdRef = useRef(clubsById)
  clubsByIdRef.current = clubsById
  const activeSessionRef = useRef(activeSession)
  activeSessionRef.current = activeSession
  const completedEditionsRef = useRef(completedEditions)
  completedEditionsRef.current = completedEditions

  const yearsKey = completedEditions.map((e) => e.year).join(',')
  const editionsKey = `${completedEditions.length}:${yearsKey}:${activeSession?.seasonYear ?? ''}:${activeSession?.championId ?? ''}:${mutationCount}`

  const isMountedRef = useRef(true)
  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
    }
  }, [])

  useEffect(() => {
    if (!enabled) {
      setLoading(false)
      return
    }

    const currentEditions = completedEditionsRef.current
    const currentActiveSession = activeSessionRef.current

    if (currentEditions.length === 0 && !currentActiveSession?.championId) {
      setRankedPlayers([])
      setAwardSummaries([])
      setLoading(false)
      setError(null)
      return
    }

    let isCurrent = true
    setLoading(true)
    setError(null)

    async function loadData() {
      const editions = completedEditionsRef.current
      const clubsMap = clubsByIdRef.current
      const personsList = personsRef.current
      const sessionObj = activeSessionRef.current

      // Map persons by ID for enrichment
      const personsById = new Map<string, Person>()
      for (const p of personsList) personsById.set(p.id, p)
      for (const ed of editions) {
        if (ed.persons) {
          for (const p of ed.persons) {
            if (!personsById.has(p.id)) personsById.set(p.id, p)
          }
        }
      }

      try {
        if (!cupRepository.loadPlayerPalmares || !cupRepository.loadSeasonAwardSummaries) {
          const fallback = getRankedPlayerPalmares(personsList, editions, sessionObj, clubsMap)
          if (isCurrent && isMountedRef.current) {
            setRankedPlayers(fallback)
            setAwardSummaries([])
            setLoading(false)
          }
          return
        }

        let palmares = await cupRepository.loadPlayerPalmares()
        let summaries = await cupRepository.loadSeasonAwardSummaries()

        const storedVersion = localStorage.getItem('coupe_palmares_calc_version')
        const currentVersion = '3'

        let honors = cupRepository.loadPlayerSeasonHonors
          ? await cupRepository.loadPlayerSeasonHonors()
          : []
        const coveredYears = new Set(honors.map((h) => h.year))
        const hasMissingSeasons = editions.length > 0 && editions.some((ed) => !coveredYears.has(ed.year))
        const needsRebuild = palmares.length === 0 || hasMissingSeasons || storedVersion !== currentVersion

        // If palmares is empty or missing seasons or outdated version, rebuild from archives
        if (needsRebuild && editions.length > 0 && cupRepository.rebuildPlayerPalmares) {
          palmares = await cupRepository.rebuildPlayerPalmares(editions, clubsMap)
          summaries = await cupRepository.loadSeasonAwardSummaries()
          honors = cupRepository.loadPlayerSeasonHonors ? await cupRepository.loadPlayerSeasonHonors() : []
          localStorage.setItem('coupe_palmares_calc_version', currentVersion)
        }

        // If active session is completed and not yet archived, merge its honors in memory
        if (sessionObj?.championId) {
          const activeYear = sessionObj.seasonYear ?? 2026
          const isAlreadyArchived = editions.some((e) => e.year === activeYear)
          if (!isAlreadyArchived) {
            const activeHonors = extractSeasonPlayerHonors(sessionObj, clubsMap)
            const activeSummary = extractSeasonAwardSummary(sessionObj)

            if (activeHonors.length > 0) {
              const combinedHonors = [...honors.filter((h) => h.year !== activeYear), ...activeHonors]
              palmares = buildPlayerPalmaresFromHonors(combinedHonors, personsById, clubsMap)
            }

            if (activeSummary && !summaries.some((s) => s.year === activeYear)) {
              summaries = [activeSummary, ...summaries]
            }
          }
        }

        // Enrich loaded palmares with current person objects and club affiliations
        const enrichedPalmares = palmares.map((rec) => {
          const currentPerson = personsById.get(rec.person.id)
          if (currentPerson) {
            const currentClub = currentPerson.currentClubId && clubsMap ? clubsMap.get(currentPerson.currentClubId) : undefined
            return {
              ...rec,
              person: currentPerson,
              currentOrLastClub: currentClub ?? rec.currentOrLastClub,
              lastClubName: currentClub?.name ?? rec.lastClubName,
            }
          }
          return rec
        })

        if (isCurrent && isMountedRef.current) {
          setRankedPlayers(rankPlayerPalmares(enrichedPalmares))
          setAwardSummaries(summaries)
          setLoading(false)
          setError(null)
        }
      } catch (err) {
        if (isCurrent && isMountedRef.current) {
          console.warn('Erreur lors du chargement de playerPalmares depuis IndexedDB, repli en mémoire:', err)
          try {
            const fallback = getRankedPlayerPalmares(personsList, editions, sessionObj, clubsMap)
            setRankedPlayers(fallback)
            setAwardSummaries([])
            setError(null)
          } catch (fallbackErr) {
            setError(fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr))
          }
          setLoading(false)
        }
      }
    }

    void loadData()

    const unsubscribe = onArchiveMutation(() => {
      void loadData()
    })

    return () => {
      isCurrent = false
      unsubscribe()
    }
  }, [enabled, editionsKey])

  return {
    rankedPlayers,
    awardSummaries,
    loading,
    error,
  }
}
