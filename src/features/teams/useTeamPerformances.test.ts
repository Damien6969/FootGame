import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { useTeamPerformances } from './useTeamPerformances'
import * as cupRepositoryModule from '../storage/cupRepository'
import { cupRepository, type TeamSeasonPerformanceRecord } from '../storage/cupRepository'

describe('useTeamPerformances', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('returns empty list and loading false if teamId is not provided', () => {
    const { result } = renderHook(() => useTeamPerformances(undefined))
    expect(result.current.teamSeasons).toEqual([])
    expect(result.current.loading).toBe(false)
  })

  it('loads performances for the specified club from cupRepository', async () => {
    const mockPerfs: TeamSeasonPerformanceRecord[] = [
      {
        year: 2027,
        teamId: 'club-1',
        roundReached: 14,
        stageLabel: 'Champion',
        isNationalChampion: true,
        isConferenceChampion: true,
        matchesWon: 14,
        matchesPlayed: 14,
      },
      {
        year: 2026,
        teamId: 'club-1',
        roundReached: 12,
        stageLabel: 'Champion de Conférence',
        isNationalChampion: false,
        isConferenceChampion: true,
        matchesWon: 12,
        matchesPlayed: 13,
      },
    ]

    vi.spyOn(cupRepository, 'loadTeamSeasonPerformances').mockResolvedValue(mockPerfs)

    const { result } = renderHook(() => useTeamPerformances('club-1'))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.teamSeasons).toEqual(mockPerfs)
    expect(cupRepository.loadTeamSeasonPerformances).toHaveBeenCalledWith('club-1')
  })

  it('reloads when an archive mutation is triggered', async () => {
    let callCount = 0
    vi.spyOn(cupRepository, 'loadTeamSeasonPerformances').mockImplementation(async () => {
      callCount++
      return [
        {
          year: 2026,
          teamId: 'club-1',
          roundReached: callCount,
          stageLabel: `Tour ${callCount}`,
          isNationalChampion: false,
          isConferenceChampion: false,
          matchesWon: 1,
          matchesPlayed: 2,
        },
      ]
    })

    let triggerMutation: (() => void) | undefined
    vi.spyOn(cupRepositoryModule, 'onArchiveMutation').mockImplementation((cb: () => void) => {
      triggerMutation = cb
      return () => {}
    })

    const { result } = renderHook(() => useTeamPerformances('club-1'))

    await waitFor(() => {
      expect(result.current.teamSeasons[0]?.roundReached).toBe(1)
    })

    // Now trigger an archive mutation (e.g. season ended)
    if (triggerMutation) {
      act(() => {
        triggerMutation!()
      })
    }

    await waitFor(() => {
      expect(result.current.teamSeasons[0]?.roundReached).toBe(2)
    })
  })

  it('handles repository errors gracefully and exposes error state', async () => {
    vi.spyOn(cupRepository, 'loadTeamSeasonPerformances').mockRejectedValue(new Error('IndexedDB failure'))

    const { result } = renderHook(() => useTeamPerformances('club-1'))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.teamSeasons).toEqual([])
    expect(result.current.error).toBe('IndexedDB failure')
  })
})
