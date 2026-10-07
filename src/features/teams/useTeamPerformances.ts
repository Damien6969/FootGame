import { useState, useEffect } from 'react'
import {
  cupRepository,
  onArchiveMutation,
  type TeamSeasonPerformanceRecord,
} from '../storage/cupRepository'

export type UseTeamPerformancesResult = {
  teamSeasons: TeamSeasonPerformanceRecord[]
  loading: boolean
  error: string | null
}

/**
 * Hook ciblé pour charger uniquement l'historique des saisons d'un club donné
 * depuis la table indexée Dexie `teamSeasonPerformances`.
 * Évite de charger en mémoire les dizaines de mégaoctets de toutes les autres équipes.
 */
export function useTeamPerformances(teamId: string | undefined): UseTeamPerformancesResult {
  const [teamSeasons, setTeamSeasons] = useState<TeamSeasonPerformanceRecord[]>([])
  const [loading, setLoading] = useState<boolean>(Boolean(teamId))
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!teamId) {
      setTeamSeasons([])
      setLoading(false)
      setError(null)
      return
    }

    let active = true

    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        if (cupRepository.loadTeamSeasonPerformances) {
          const perfs = await cupRepository.loadTeamSeasonPerformances(teamId)
          if (active) {
            setTeamSeasons(perfs)
          }
        } else {
          if (active) {
            setTeamSeasons([])
          }
        }
      } catch (err) {
        console.warn('Erreur lors du chargement des performances du club:', err)
        if (active) {
          setError(err instanceof Error ? err.message : String(err))
          setTeamSeasons([])
        }
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }

    void load()

    const unsubscribe = onArchiveMutation(() => {
      void load()
    })

    return () => {
      active = false
      unsubscribe()
    }
  }, [teamId])

  return { teamSeasons, loading, error }
}
