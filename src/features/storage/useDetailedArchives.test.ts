import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cupRepository, type SeasonArchive } from './cupRepository'
import { useDetailedArchives, invalidateDetailedArchivesCache } from './useDetailedArchives'

const mockSummaryArchive: SeasonArchive = {
  year: 2026,
  seed: 'seed-2026',
  completedAt: '2026-06-01T20:00:00.000Z',
  datasetVersion: '2026.1',
  nationalChampionId: 'PARIS',
  conferenceChampions: { CONF_NORD: 'PARIS' },
  finalFourTeamIds: ['PARIS'],
  teamPerformances: {},
  totalMatches: 10,
  summaryOnly: true,
  history: [],
}

const mockDetailedArchive: SeasonArchive = {
  ...mockSummaryArchive,
  summaryOnly: false,
  history: [
    {
      roundNumber: 14,
      homeTeamId: 'PARIS',
      awayTeamId: 'BORDEAUX',
      result: { matchId: '14:1', homeScore: 2, awayScore: 1, winnerId: 'PARIS', events: [] },
    },
  ],
}

describe('useDetailedArchives', () => {
  beforeEach(() => {
    invalidateDetailedArchivesCache()
    vi.restoreAllMocks()
  })

  it('returns summaries immediately when enabled is false, without calling loadArchives', () => {
    const loadSpy = vi.spyOn(cupRepository, 'loadArchives').mockResolvedValue([mockDetailedArchive])

    const { result } = renderHook(() => useDetailedArchives([mockSummaryArchive], false))

    expect(result.current.loading).toBe(false)
    expect(result.current.archives).toEqual([mockSummaryArchive])
    expect(loadSpy).not.toHaveBeenCalled()
  })

  it('returns summaries immediately when none have summaryOnly: true', () => {
    const loadSpy = vi.spyOn(cupRepository, 'loadArchives').mockResolvedValue([mockDetailedArchive])

    const { result } = renderHook(() => useDetailedArchives([mockDetailedArchive], true))

    expect(result.current.loading).toBe(false)
    expect(result.current.archives).toEqual([mockDetailedArchive])
    expect(loadSpy).not.toHaveBeenCalled()
  })

  it('loads detailed archives from repository when enabled and summaryOnly is true', async () => {
    const loadSpy = vi.spyOn(cupRepository, 'loadArchives').mockResolvedValue([mockDetailedArchive])

    const { result } = renderHook(() => useDetailedArchives([mockSummaryArchive], true))

    expect(result.current.loading).toBe(true)

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.archives).toEqual([mockDetailedArchive])
    expect(loadSpy).toHaveBeenCalledTimes(1)
  })

  it('reuses memory cache on repeated calls without refetching from repository', async () => {
    const loadSpy = vi.spyOn(cupRepository, 'loadArchives').mockResolvedValue([mockDetailedArchive])

    // First call: loads from repository
    const hook1 = renderHook(() => useDetailedArchives([mockSummaryArchive], true))
    await waitFor(() => expect(hook1.result.current.loading).toBe(false))
    expect(loadSpy).toHaveBeenCalledTimes(1)

    // Second call: must use memory cache immediately
    const hook2 = renderHook(() => useDetailedArchives([mockSummaryArchive], true))
    expect(hook2.result.current.loading).toBe(false)
    expect(hook2.result.current.archives).toEqual([mockDetailedArchive])
    expect(loadSpy).toHaveBeenCalledTimes(1)
  })

  it('invalidates cache when invalidateDetailedArchivesCache is called', async () => {
    const loadSpy = vi.spyOn(cupRepository, 'loadArchives').mockResolvedValue([mockDetailedArchive])

    const hook1 = renderHook(() => useDetailedArchives([mockSummaryArchive], true))
    await waitFor(() => expect(hook1.result.current.loading).toBe(false))
    expect(loadSpy).toHaveBeenCalledTimes(1)

    // Invalidate
    invalidateDetailedArchivesCache()

    // Next call must reload
    const hook2 = renderHook(() => useDetailedArchives([mockSummaryArchive], true))
    await waitFor(() => expect(hook2.result.current.loading).toBe(false))
    expect(loadSpy).toHaveBeenCalledTimes(2)
  })

  it('rejects stale in-flight results when invalidated while load is in progress', async () => {
    let resolveStaleLoad!: (val: SeasonArchive[]) => void
    const stalePromise = new Promise<SeasonArchive[]>((res) => {
      resolveStaleLoad = res
    })

    const loadSpy = vi.spyOn(cupRepository, 'loadArchives').mockReturnValue(stalePromise)

    // Render hook while load is pending
    const { result, unmount } = renderHook(() => useDetailedArchives([mockSummaryArchive], true))
    expect(result.current.loading).toBe(true)

    // Invalidate while in-flight
    invalidateDetailedArchivesCache()

    // Resolve the stale promise
    resolveStaleLoad([mockDetailedArchive])
    await Promise.resolve()

    // Unmount first hook
    unmount()

    // Next hook should NOT use the stale resolved data, but trigger fresh load
    const freshArchive: SeasonArchive = { ...mockDetailedArchive, year: 2027 }
    loadSpy.mockResolvedValue([freshArchive])

    const hook2 = renderHook(() => useDetailedArchives([mockSummaryArchive], true))
    await waitFor(() => expect(hook2.result.current.loading).toBe(false))

    expect(hook2.result.current.archives).toEqual([freshArchive])
  })
})
