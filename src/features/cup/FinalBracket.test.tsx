import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { FinalBracket, getTeamPalmaresRank } from './FinalBracket'
import { CupAppContext } from '../../app/CupAppContext'
import type { RoundView } from './cupSelectors'
import type { Commune } from '../geography/types'

describe('FinalBracket & getTeamPalmaresRank', () => {
  it('correctly determines the highest palmares rank for a club', () => {
    const mockRecords = new Map<string, any>([
      ['TEAM_NAT', { nationalTitles: 2, conferenceTitles: 1, regionTitles: 3, departmentTitles: 5 }],
      ['TEAM_CONF', { nationalTitles: 0, conferenceTitles: 1, regionTitles: 2, departmentTitles: 4 }],
      ['TEAM_REG', { nationalTitles: 0, conferenceTitles: 0, regionTitles: 1, departmentTitles: 2 }],
      ['TEAM_DEPT', { nationalTitles: 0, conferenceTitles: 0, regionTitles: 0, departmentTitles: 3 }],
      ['TEAM_NONE', { nationalTitles: 0, conferenceTitles: 0, regionTitles: 0, departmentTitles: 0 }],
    ])

    // National title takes precedence
    expect(getTeamPalmaresRank('TEAM_NAT', mockRecords, null)).toBe('national')
    // Conference title
    expect(getTeamPalmaresRank('TEAM_CONF', mockRecords, null)).toBe('conference')
    // Region title
    expect(getTeamPalmaresRank('TEAM_REG', mockRecords, null)).toBe('region')
    // Departmental only or none -> 'none' (user explicitly: "départemental on va pas mettre")
    expect(getTeamPalmaresRank('TEAM_DEPT', mockRecords, null)).toBe('none')
    expect(getTeamPalmaresRank('TEAM_NONE', mockRecords, null)).toBe('none')
    expect(getTeamPalmaresRank(undefined, mockRecords, null)).toBe('none')

    // Active session titles
    const sessionMock: any = {
      championId: 'TEAM_NEW_CHAMP',
      conferenceChampionIds: { CONF_NORD: 'TEAM_NEW_CONF' },
    }
    expect(getTeamPalmaresRank('TEAM_NEW_CHAMP', mockRecords, sessionMock)).toBe('national')
    expect(getTeamPalmaresRank('TEAM_NEW_CONF', mockRecords, sessionMock)).toBe('conference')
  })

  it('renders club names as links with color-coded palmares rank and stops propagation on click', () => {
    const dummyCommunes: Commune[] = [
      { id: 'TEAM_A', name: 'Club Alpha', departmentId: '01', regionId: '84', zoneId: 'Z1', conferenceId: 'CONF1', population: 10000 },
      { id: 'TEAM_B', name: 'Club Beta', departmentId: '01', regionId: '84', zoneId: 'Z1', conferenceId: 'CONF1', population: 20000 },
    ]
    const byId = new Map(dummyCommunes.map((c) => [c.id, c]))

    const singleRound: RoundView = {
      number: 14,
      phase: 'NATIONAL',
      matches: [
        { id: 'FINAL_M1', homeTeamId: 'TEAM_A', awayTeamId: 'TEAM_B' },
      ],
      results: {},
      byeTeamIds: [],
      isCurrent: true,
    }

    const mockRecords = new Map<string, any>([
      ['TEAM_A', { nationalTitles: 1, conferenceTitles: 0, regionTitles: 0, departmentTitles: 0 }],
      ['TEAM_B', { nationalTitles: 0, conferenceTitles: 1, regionTitles: 0, departmentTitles: 0 }],
    ])

    const appContextValue: any = {
      teamRecords: mockRecords,
      session: {
        id: 'active',
        seed: 'test',
        datasetVersion: 'v1',
        activeTeamIds: ['TEAM_A', 'TEAM_B'],
        roundNumber: 14,
      },
    }

    render(
      <MemoryRouter>
        <CupAppContext.Provider value={appContextValue}>
          <FinalBracket rounds={[singleRound]} byId={byId} />
        </CupAppContext.Provider>
      </MemoryRouter>
    )

    // Palmares legend is rendered
    expect(screen.getByText(/Coupe de France \(Doré\)/i)).toBeInTheDocument()
    expect(screen.getByText(/Conférence \(Violet\)/i)).toBeInTheDocument()
    expect(screen.getByText(/Régional \(Vert\)/i)).toBeInTheDocument()

    // Club Alpha has national title -> should have rank-national and link to /equipes/TEAM_A
    const linkAlpha = screen.getByRole('link', { name: 'Club Alpha' })
    expect(linkAlpha).toBeInTheDocument()
    expect(linkAlpha.getAttribute('href')).toBe('/equipes/TEAM_A')
    expect(linkAlpha.className).toContain('rank-national')

    // Club Beta has conference title -> should have rank-conference and link to /equipes/TEAM_B
    const linkBeta = screen.getByRole('link', { name: 'Club Beta' })
    expect(linkBeta).toBeInTheDocument()
    expect(linkBeta.getAttribute('href')).toBe('/equipes/TEAM_B')
    expect(linkBeta.className).toContain('rank-conference')

    // Clicking club link does not throw or trigger match navigation
    fireEvent.click(linkAlpha)
  })
})
