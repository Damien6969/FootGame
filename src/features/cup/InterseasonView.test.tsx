import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { InterseasonView } from './InterseasonView'
import type { InterseasonReport } from '../storage/cupRepository'

const mockReport: InterseasonReport = {
  seasonYear: 2027,
  rivalCreated: {
    clubId: 'rival-01',
    clubName: 'Olympique Dissident',
    communeName: 'Saint-Étienne',
    strength: 22.4,
    parentChampionName: 'AS Saint-Étienne',
  },
  secessions: [
    {
      newClubId: 'sec-01',
      newClubName: 'SC Métropole',
      communeId: '69123',
      communeName: 'Lyon',
      parentEnteId: 'ente-01',
      parentEnteName: 'Grand Lyon Football',
      populationLost: 250000,
      newEnteStrength: 19.5,
    },
  ],
  fusions: [
    {
      mergedClubId: 'fuse-modest',
      mergedClubName: 'FC Petit Bourg',
      absorbedClubId: 'abs-01',
      absorbedClubName: 'AS Voisin',
      communeNames: ['Petit-Bourg', 'Voisin'],
      totalPopulation: 8500,
      newStrength: 14.2,
      oldStrength: 10.0,
    },
    {
      mergedClubId: 'fuse-strong',
      mergedClubName: 'Union Métropole Ouest',
      absorbedClubId: 'abs-02',
      absorbedClubName: 'Étoile Ouest',
      communeNames: ['Brest', 'Guipavas'],
      totalPopulation: 160000,
      newStrength: 24.8,
      oldStrength: 18.5,
    },
    {
      mergedClubId: 'fuse-medium',
      mergedClubName: 'Alliance Côtière',
      absorbedClubId: 'abs-03',
      absorbedClubName: 'FC Plage',
      communeNames: ['Saint-Malo', 'Dinard'],
      totalPopulation: 65000,
      newStrength: 19.1,
      oldStrength: 15.0,
    },
  ],
}

describe('InterseasonView', () => {
  it('renders informative guide when no interseason report exists', () => {
    render(
      <MemoryRouter>
        <InterseasonView
          currentReport={undefined}
          currentSeasonYear={2026}
          archives={[]}
        />
      </MemoryRouter>
    )

    expect(screen.getByRole('heading', { name: /Bilan de l'Intersaison/i })).toBeVisible()
    expect(screen.getByText(/Aucun rapport d'intersaison n'a encore été généré pour la Saison 2026/i)).toBeVisible()
    expect(screen.getByText(/Alliances intercommunales/i)).toBeVisible()
  })

  it('renders report with KPI cards, rival banner and secessions', () => {
    render(
      <MemoryRouter>
        <InterseasonView
          currentReport={mockReport}
          currentSeasonYear={2027}
          archives={[]}
        />
      </MemoryRouter>
    )

    expect(screen.getByRole('heading', { name: /Bilan Intersaison · Saison 2027/i })).toBeVisible()
    // KPI cards
    expect(screen.getAllByText('3').length).toBeGreaterThanOrEqual(1) // 3 fusions
    expect(screen.getByText('Nouvelles Alliances')).toBeVisible()
    // Rival banner
    expect(screen.getByText(/Olympique Dissident/i)).toBeVisible()
    expect(screen.getByText(/22.4\/30/i)).toBeVisible()
    // Secessions
    expect(screen.getByText(/SC Métropole/i)).toBeVisible()
  })

  it('sorts alliances table by highest new strength by default (strongest first)', () => {
    render(
      <MemoryRouter>
        <InterseasonView
          currentReport={mockReport}
          currentSeasonYear={2027}
          archives={[]}
        />
      </MemoryRouter>
    )

    const tableRows = screen.getAllByRole('row')
    // Header is row 0
    // Row 1 should be Union Métropole Ouest (strength 24.8)
    expect(tableRows[1]).toHaveTextContent('Union Métropole Ouest')
    expect(tableRows[1]).toHaveTextContent('24.8/30')
    // Row 2 should be Alliance Côtière (strength 19.1)
    expect(tableRows[2]).toHaveTextContent('Alliance Côtière')
    expect(tableRows[2]).toHaveTextContent('19.1/30')
    // Row 3 should be FC Petit Bourg (strength 14.2)
    expect(tableRows[3]).toHaveTextContent('FC Petit Bourg')
    expect(tableRows[3]).toHaveTextContent('14.2/30')
  })

  it('filters table rows when typing in the search input', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <InterseasonView
          currentReport={mockReport}
          currentSeasonYear={2027}
          archives={[]}
        />
      </MemoryRouter>
    )

    const searchInput = screen.getByPlaceholderText(/Rechercher un club ou une commune/i)
    await user.type(searchInput, 'Brest')

    expect(screen.getByText('Union Métropole Ouest')).toBeVisible()
    expect(screen.queryByText('FC Petit Bourg')).toBeNull()
    expect(screen.queryByText('Alliance Côtière')).toBeNull()
  })

  it('renders clickable links for clubs, absorbed clubs, and lead commune identification', () => {
    render(
      <MemoryRouter>
        <InterseasonView
          currentReport={mockReport}
          currentSeasonYear={2027}
          archives={[]}
        />
      </MemoryRouter>
    )

    // Merged club link
    const mergedLink = screen.getByRole('link', { name: 'Union Métropole Ouest' })
    expect(mergedLink).toHaveAttribute('href', '/equipes/fuse-strong')

    // Absorbed club link
    const absorbedLink = screen.getByRole('link', { name: 'Étoile Ouest' })
    expect(absorbedLink).toHaveAttribute('href', '/equipes/abs-02')

    // Lead commune in Ville Siège column or tag
    expect(screen.getByRole('columnheader', { name: /Ville Siège/i })).toBeVisible()
    expect(screen.getByText(/Brest \(siège\)/i)).toBeVisible()
  })

  it('applies distinct color tiers for major, medium and minor gains', () => {
    const tieredReport: InterseasonReport = {
      seasonYear: 2028,
      secessions: [],
      fusions: [
        {
          mergedClubId: 'fuse-huge',
          mergedClubName: 'Alliance Métropole',
          absorbedClubId: 'abs-1',
          absorbedClubName: 'Club Voisin 1',
          communeNames: ['Ville A', 'Ville B'],
          totalPopulation: 100000,
          newStrength: 22.0,
          oldStrength: 17.5, // gain = +4.5 (major >= 3.0)
        },
        {
          mergedClubId: 'fuse-mod',
          mergedClubName: 'Entente Moyenne',
          absorbedClubId: 'abs-2',
          absorbedClubName: 'Club Voisin 2',
          communeNames: ['Ville C', 'Ville D'],
          totalPopulation: 30000,
          newStrength: 15.5,
          oldStrength: 14.0, // gain = +1.5 (medium 1.0-2.9)
        },
        {
          mergedClubId: 'fuse-small',
          mergedClubName: 'Union Rurale',
          absorbedClubId: 'abs-3',
          absorbedClubName: 'Club Voisin 3',
          communeNames: ['Village E', 'Village F'],
          totalPopulation: 5000,
          newStrength: 8.5,
          oldStrength: 8.1, // gain = +0.4 (minor < 1.0)
        },
      ],
    }

    render(
      <MemoryRouter>
        <InterseasonView
          currentReport={tieredReport}
          currentSeasonYear={2028}
          archives={[]}
        />
      </MemoryRouter>
    )

    // Major gain badge (+4.5)
    const majorBadge = screen.getByText(/▲ \+4\.5/)
    expect(majorBadge).toHaveClass('gain-badge--major')

    // Medium gain badge (+1.5)
    const mediumBadge = screen.getByText(/▲ \+1\.5/)
    expect(mediumBadge).toHaveClass('gain-badge--medium')

    // Minor gain badge (+0.4)
    const minorBadge = screen.getByText(/▲ \+0\.4/)
    expect(minorBadge).toHaveClass('gain-badge--minor')
  })
})


