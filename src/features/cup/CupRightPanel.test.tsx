import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { CupRightPanel } from './CupRightPanel'
import { CupAppContext } from '../../app/CupAppContext'
import type { RoundView } from './cupSelectors'
import type { Commune } from '../geography/types'

describe('CupRightPanel', () => {
  const dummyCommunes: Commune[] = [
    {
      id: '01001',
      name: 'L’Abergement-Clémenciat',
      departmentId: '01',
      regionId: '84',
      zoneId: '01-1',
      conferenceId: 'CONF_SUD_EST',
      population: 800,
    },
    {
      id: '01002',
      name: 'L’Abergement-de-Varey',
      departmentId: '01',
      regionId: '84',
      zoneId: '01-1',
      conferenceId: 'CONF_SUD_EST',
      population: 250,
    },
    {
      id: '01004',
      name: 'Ambérieu-en-Bugey',
      departmentId: '01',
      regionId: '84',
      zoneId: '01-1',
      conferenceId: 'CONF_SUD_EST',
      population: 14000,
    },
  ]

  const byId = new Map(dummyCommunes.map((c) => [c.id, c]))

  const baseRound: RoundView = {
    number: 1,
    phase: 'DEPARTMENT',
    matches: [
      {
        id: 'R1:M1',
        homeTeamId: '01001',
        awayTeamId: '01004',
      },
    ],
    results: {},
    byeTeamIds: [],
    isCurrent: true,
  }

  it('renders favorites and puts eliminated clubs at the bottom', () => {
    // 01002 is eliminated, 01001 is alive
    const sessionMock: any = {
      activeTeamIds: ['01001', '01004'], // 01002 is eliminated!
      championId: null,
      seed: 12345,
    }

    const appContextValue: any = {
      favoriteTeamIds: ['01002', '01001'], // 01002 was added first
      session: sessionMock,
      teamRecords: new Map(),
      getFavoriteColor: () => '#38bdf8',
      toggleFavorite: vi.fn(),
      isFavorite: () => true,
    }

    render(
      <MemoryRouter>
        <CupAppContext.Provider value={appContextValue}>
          <CupRightPanel round={baseRound} byId={byId} />
        </CupAppContext.Provider>
      </MemoryRouter>
    )

    // Should render En lice header and Éliminés header
    expect(screen.getByText(/🟢 En lice/)).toBeInTheDocument()
    expect(screen.getByText(/⚪ Clubs éliminés/)).toBeInTheDocument()

    // Both club cards should be present (names appear in header and scoreboard)
    expect(screen.getAllByText('L’Abergement-Clémenciat').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('L’Abergement-de-Varey').length).toBeGreaterThanOrEqual(1)

    // Full names of both teams in match should be visible
    expect(screen.getAllByText('Ambérieu-en-Bugey').length).toBeGreaterThanOrEqual(1)
  })

  it('allows simulating match directly from favorite card', () => {
    const onRunMatch = vi.fn()
    const sessionMock: any = {
      activeTeamIds: ['01001', '01004'],
      championId: null,
      seed: 12345,
    }

    const appContextValue: any = {
      favoriteTeamIds: ['01001'],
      session: sessionMock,
      getFavoriteColor: () => '#38bdf8',
      toggleFavorite: vi.fn(),
      isFavorite: () => true,
    }

    render(
      <MemoryRouter>
        <CupAppContext.Provider value={appContextValue}>
          <CupRightPanel round={baseRound} byId={byId} onRunMatch={onRunMatch} />
        </CupAppContext.Provider>
      </MemoryRouter>
    )

    const playBtn = screen.getByRole('button', { name: /⚡ Jouer/ })
    expect(playBtn).toBeInTheDocument()
    fireEvent.click(playBtn)
    expect(onRunMatch).toHaveBeenCalledWith('R1:M1')
  })

  it('displays opponent population and strength in compact format and preserves order during round simulation', () => {
    // Both 01001 and 01004 have matches. Opponents have strength.
    const clubsWithStrength: any[] = [
      {
        id: '01001',
        name: 'Club Alpha',
        departmentId: '01',
        population: 1000,
        strength: 55.4,
      },
      {
        id: '01002',
        name: 'Club Beta',
        departmentId: '01',
        population: 2500,
        strength: 62.8,
      },
      {
        id: '01003',
        name: 'Club Gamma',
        departmentId: '01',
        population: 3200,
        strength: 48.1,
      },
    ]

    const clubsMap = new Map(clubsWithStrength.map((c) => [c.id, c]))

    const roundWithTwoMatches: RoundView = {
      number: 2,
      phase: 'DEPARTMENT',
      matches: [
        { id: 'M1', homeTeamId: '01001', awayTeamId: '01002' },
        { id: 'M2', homeTeamId: '01003', awayTeamId: '99999' },
      ],
      // M1 has a result (simulated), M2 has not yet
      results: {
        M1: {
          matchId: 'M1',
          homeScore: 2,
          awayScore: 1,
          winnerId: '01001',
          isExtraTime: false,
          events: [],
        },
      },
      byeTeamIds: [],
      isCurrent: true,
    }

    const sessionMock: any = {
      activeTeamIds: ['01001', '01003'], // Both still active in this round
      championId: null,
      seed: 123,
    }

    const appContextValue: any = {
      favoriteTeamIds: ['01001', '01003'], // 01001 is first, 01003 is second
      session: sessionMock,
      getFavoriteColor: () => '#38bdf8',
      toggleFavorite: vi.fn(),
      isFavorite: () => true,
    }

    const { container } = render(
      <MemoryRouter>
        <CupAppContext.Provider value={appContextValue}>
          <CupRightPanel round={roundWithTwoMatches} byId={clubsMap} />
        </CupAppContext.Provider>
      </MemoryRouter>
    )

    // Should display opponent strength for Club Beta: "Force 62.8"
    expect(screen.getByText(/Force 62\.8/)).toBeInTheDocument()
    expect(screen.getByText(/2 500 hab\./)).toBeInTheDocument()

    // Verify order stability: Club Alpha was first in favoriteIds, so it MUST stay first despite having played its match
    const favCards = container.querySelectorAll('.favorite-card')
    expect(favCards.length).toBe(2)
    expect(favCards[0].textContent).toContain('Club Alpha')
    expect(favCards[1].textContent).toContain('Club Gamma')
  })
})

