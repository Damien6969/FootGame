import { useEffect, useState } from 'react'
import { cupRepository, onArchiveMutation, type SeasonArchive } from './cupRepository'

type DetailedArchivesCache = {
  key: string
  archives: readonly SeasonArchive[]
}

let memoryCache: DetailedArchivesCache | null = null
let inFlightPromise: Promise<readonly SeasonArchive[]> | null = null
let inFlightKey: string | null = null
let cacheGeneration = 0

function getSummariesKey(summaries: readonly SeasonArchive[]): string {
  if (summaries.length === 0) return `empty:gen-${cacheGeneration}`
  const seasons = summaries.map((s) => `${s.year}:${s.seed}`).join(',')
  return `${seasons}:gen-${cacheGeneration}`
}

export function invalidateDetailedArchivesCache(): void {
  cacheGeneration++
  memoryCache = null
  inFlightPromise = null
  inFlightKey = null
}

// Automatically purge memory cache whenever repository archives mutate
onArchiveMutation(() => {
  invalidateDetailedArchivesCache()
})

/**
 * Keeps heavy match histories out of the app shell until a detail view needs them.
 * Caches detailed archives in memory and deduplicates in-flight IndexedDB requests.
 */
export function useDetailedArchives(
  summaries: readonly SeasonArchive[],
  enabled: boolean = true,
) {
  const [mutationTick, setMutationTick] = useState(0)

  useEffect(() => {
    return onArchiveMutation(() => {
      setMutationTick((prev) => prev + 1)
    })
  }, [])

  const needsDetails = enabled && summaries.some((archive) => archive.summaryOnly)
  const summariesKey = getSummariesKey(summaries)

  const [state, setState] = useState<{
    key: string
    archives: readonly SeasonArchive[]
    loading: boolean
    error: string | null
  }>(() => {
    if (!needsDetails) {
      return { key: summariesKey, archives: summaries, loading: false, error: null }
    }
    if (memoryCache && memoryCache.key === summariesKey) {
      return { key: summariesKey, archives: memoryCache.archives, loading: false, error: null }
    }
    return { key: summariesKey, archives: [], loading: true, error: null }
  })

  useEffect(() => {
    if (!needsDetails) {
      setState((prev) => (prev.key === summariesKey && !prev.loading && prev.archives === summaries ? prev : { key: summariesKey, archives: summaries, loading: false, error: null }))
      return
    }

    if (memoryCache && memoryCache.key === summariesKey) {
      const cached = memoryCache.archives
      setState((prev) => (prev.key === summariesKey && !prev.loading && prev.archives === cached ? prev : { key: summariesKey, archives: cached, loading: false, error: null }))
      return
    }

    let active = true
    setState((prev) => (prev.loading && prev.key === summariesKey ? prev : { key: summariesKey, archives: [], loading: true, error: null }))

    const promisedGeneration = cacheGeneration

    if (!inFlightPromise || inFlightKey !== summariesKey) {
      inFlightKey = summariesKey
      inFlightPromise = cupRepository.loadArchives().then(
        (archives) => {
          if (promisedGeneration === cacheGeneration) {
            memoryCache = { key: summariesKey, archives }
          }
          if (inFlightKey === summariesKey) {
            inFlightPromise = null
            inFlightKey = null
          }
          return archives
        },
        (err) => {
          if (inFlightKey === summariesKey) {
            inFlightPromise = null
            inFlightKey = null
          }
          throw err
        },
      )
    }

    inFlightPromise.then(
      (archives) => {
        if (active && promisedGeneration === cacheGeneration) {
          setState((prev) => (prev.key === summariesKey && !prev.loading && prev.archives === archives ? prev : { key: summariesKey, archives, loading: false, error: null }))
        }
      },
      (reason: unknown) => {
        if (active && promisedGeneration === cacheGeneration) {
          setState({
            key: summariesKey,
            archives: [],
            loading: false,
            error: reason instanceof Error ? reason.message : 'Chargement des archives impossible.',
          })
        }
      },
    )

    return () => {
      active = false
    }
  }, [needsDetails, summariesKey, mutationTick])

  if (!needsDetails) {
    return { archives: summaries, loading: false, error: null }
  }

  if (memoryCache && memoryCache.key === summariesKey) {
    return { archives: memoryCache.archives, loading: false, error: null }
  }

  if (state.key !== summariesKey) {
    return { archives: [] as readonly SeasonArchive[], loading: true, error: null }
  }

  return { archives: state.archives, loading: state.loading, error: state.error }
}
