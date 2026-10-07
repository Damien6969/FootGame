import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { cupRepository, type SeasonArchive } from '../storage/cupRepository'
import { MemoryRouter } from 'react-router-dom'
import { PersonsPage } from './PersonsPage'
import { CupAppContext, type CupAppContextType } from '../../app/CupAppContext'
import type { Person } from './types'

const mockPersons: Person[] = [
  {
    id: 'p-1',
    firstName: 'Kylian',
    lastName: 'Mbappé',
    age: 26,
    nationality: 'FR',
    birthCommuneId: '75056',
    birthCommuneName: 'Paris',
    birthDepartmentId: '75',
    currentClubId: 'club-paris',
    primaryRole: 'PLAYER',
    position: 'ATTACKER',
    attack: 29,
    defense: 12,
    careerYears: 8,
    isRetired: false,
  },
  {
    id: 'p-2',
    firstName: 'Dayot',
    lastName: 'Upamecano',
    age: 27,
    nationality: 'FR',
    birthCommuneId: '27229',
    birthCommuneName: 'Évreux',
    birthDepartmentId: '27',
    currentClubId: 'club-evreux',
    primaryRole: 'PLAYER',
    position: 'DEFENDER',
    attack: 9,
    defense: 26,
    careerYears: 9,
    isRetired: false,
  },
  {
    id: 'p-3',
    firstName: 'Michel',
    lastName: 'Platini',
    age: 70,
    nationality: 'FR',
    birthCommuneId: '54274',
    birthCommuneName: 'Jœuf',
    birthDepartmentId: '54',
    currentClubId: null,
    primaryRole: 'PLAYER',
    position: 'ATTACKER',
    attack: 30,
    defense: 14,
    careerYears: 18,
    isRetired: true,
    retiredYear: 1987,
  },
]

const mockClubsById = new Map([
  ['club-paris', { id: 'club-paris', name: 'Paris Saint-Germain', communeName: 'Paris', departmentId: '75', regionId: '11' } as any],
  ['club-evreux', { id: 'club-evreux', name: 'Évreux FC', communeName: 'Évreux', departmentId: '27', regionId: '28' } as any],
])

const mockContextValue: Partial<CupAppContextType> = {
  persons: mockPersons,
  clubsById: mockClubsById,
  dataset: {
    version: '1.0',
    sourceLabel: 'INSEE',
    sourceUrl: 'https://example.com',
    communes: [],
  } as any,
}

import { within } from '@testing-library/react'

describe('PersonsPage', () => {
  it('renders the directory from archive summaries without loading match histories', () => {
    const load = vi.spyOn(cupRepository, 'loadArchives').mockImplementation(() => new Promise(() => {}))
    try {
      render(
        <MemoryRouter>
          <CupAppContext.Provider value={{ ...mockContextValue, archives: [{
            year: 2026, summaryOnly: true, nationalChampionId: 'club-paris',
            teamPerformances: {}, history: [],
          } as unknown as SeasonArchive] } as CupAppContextType}>
            <PersonsPage />
          </CupAppContext.Provider>
        </MemoryRouter>,
      )
      expect(screen.getByRole('heading', { name: /Personnalités & Joueurs/i })).toBeInTheDocument()
      expect(load).not.toHaveBeenCalled()
    } finally {
      load.mockRestore()
    }
  })

  it('renders global metric cards and player table with flags beside player name', () => {
    const { container } = render(
      <MemoryRouter>
        <CupAppContext.Provider value={mockContextValue as CupAppContextType}>
          <PersonsPage />
        </CupAppContext.Provider>
      </MemoryRouter>,
    )

    // Heading and stats
    expect(screen.getByRole('heading', { name: /Personnalités & Joueurs/i })).toBeInTheDocument()
    expect(screen.getByText(/2 actifs • 1 retraités/i)).toBeInTheDocument()

    // Players in table
    const table = screen.getByRole('table')
    expect(within(table).getByText(/Mbappé/i)).toBeInTheDocument()
    expect(within(table).getByText(/Upamecano/i)).toBeInTheDocument()
    expect(within(table).getByText(/Platini/i)).toBeInTheDocument()

    // Check flag is inside player-directory-name container beside the player link
    const nameContainers = container.querySelectorAll('.player-directory-name')
    expect(nameContainers.length).toBe(3)
    nameContainers.forEach((el) => {
      expect(el.querySelector('.nationality-badge')).toBeInTheDocument()
      expect(el.querySelector('.person-link')).toBeInTheDocument()
    })
  })

  it('filters persons by search term', () => {
    render(
      <MemoryRouter>
        <CupAppContext.Provider value={mockContextValue as CupAppContextType}>
          <PersonsPage />
        </CupAppContext.Provider>
      </MemoryRouter>,
    )

    const searchInput = screen.getByPlaceholderText(/Rechercher par nom, ville ou club/i)
    fireEvent.change(searchInput, { target: { value: 'Évreux' } })

    const table = screen.getByRole('table')
    expect(within(table).getByText(/Upamecano/i)).toBeInTheDocument()
    expect(within(table).queryByText(/Mbappé/i)).not.toBeInTheDocument()
    expect(within(table).queryByText(/Platini/i)).not.toBeInTheDocument()
  })

  it('filters persons by department name or code for hometown or current club', () => {
    render(
      <MemoryRouter>
        <CupAppContext.Provider value={mockContextValue as CupAppContextType}>
          <PersonsPage />
        </CupAppContext.Provider>
      </MemoryRouter>,
    )

    const searchInput = screen.getByPlaceholderText(/Rechercher par nom, ville ou club/i)

    // Search by department name "Eure" (birthplace of Upamecano)
    fireEvent.change(searchInput, { target: { value: 'Eure' } })
    let table = screen.getByRole('table')
    expect(within(table).getByText(/Upamecano/i)).toBeInTheDocument()
    expect(within(table).queryByText(/Mbappé/i)).not.toBeInTheDocument()
    expect(within(table).queryByText(/Platini/i)).not.toBeInTheDocument()

    // Search by department code "54" (birthplace of Platini: Meurthe-et-Moselle)
    fireEvent.change(searchInput, { target: { value: '54' } })
    table = screen.getByRole('table')
    expect(within(table).getByText(/Platini/i)).toBeInTheDocument()
    expect(within(table).queryByText(/Mbappé/i)).not.toBeInTheDocument()
    expect(within(table).queryByText(/Upamecano/i)).not.toBeInTheDocument()
  })

  it('filters persons by region name for hometown or current club', () => {
    render(
      <MemoryRouter>
        <CupAppContext.Provider value={mockContextValue as CupAppContextType}>
          <PersonsPage />
        </CupAppContext.Provider>
      </MemoryRouter>,
    )

    const searchInput = screen.getByPlaceholderText(/Rechercher par nom, ville ou club/i)

    // Search by region name "Normandie" (Eure / Évreux)
    fireEvent.change(searchInput, { target: { value: 'Normandie' } })
    let table = screen.getByRole('table')
    expect(within(table).getByText(/Upamecano/i)).toBeInTheDocument()
    expect(within(table).queryByText(/Mbappé/i)).not.toBeInTheDocument()
    expect(within(table).queryByText(/Platini/i)).not.toBeInTheDocument()

    // Search by region name "Grand Est" (Meurthe-et-Moselle / Jœuf)
    fireEvent.change(searchInput, { target: { value: 'Grand Est' } })
    table = screen.getByRole('table')
    expect(within(table).getByText(/Platini/i)).toBeInTheDocument()
    expect(within(table).queryByText(/Mbappé/i)).not.toBeInTheDocument()
    expect(within(table).queryByText(/Upamecano/i)).not.toBeInTheDocument()

    // Search by region name with accent or without: "ile de france"
    fireEvent.change(searchInput, { target: { value: 'ile de france' } })
    table = screen.getByRole('table')
    expect(within(table).getByText(/Mbappé/i)).toBeInTheDocument()
    expect(within(table).queryByText(/Upamecano/i)).not.toBeInTheDocument()
    expect(within(table).queryByText(/Platini/i)).not.toBeInTheDocument()
  })

  it('filters persons by position', () => {
    render(
      <MemoryRouter>
        <CupAppContext.Provider value={mockContextValue as CupAppContextType}>
          <PersonsPage />
        </CupAppContext.Provider>
      </MemoryRouter>,
    )

    const selects = screen.getAllByRole('combobox')
    const positionSelect = selects[0]

    // Select Défenseurs
    fireEvent.change(positionSelect, { target: { value: 'DEFENDER' } })

    const table = screen.getByRole('table')
    expect(within(table).getByText(/Upamecano/i)).toBeInTheDocument()
    expect(within(table).queryByText(/Mbappé/i)).not.toBeInTheDocument()
  })

  it('filters persons by status (active vs retired)', () => {
    render(
      <MemoryRouter>
        <CupAppContext.Provider value={mockContextValue as CupAppContextType}>
          <PersonsPage />
        </CupAppContext.Provider>
      </MemoryRouter>,
    )

    const selects = screen.getAllByRole('combobox')
    const statusSelect = selects[1]

    // Select Retraités
    fireEvent.change(statusSelect, { target: { value: 'RETIRED' } })

    const table = screen.getByRole('table')
    expect(within(table).getByText(/Platini/i)).toBeInTheDocument()
    expect(within(table).queryByText(/Mbappé/i)).not.toBeInTheDocument()
    expect(within(table).queryByText(/Upamecano/i)).not.toBeInTheDocument()
  })
})
