import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import fixture from '../../test/fixtures/communes.fixture.json'
import { parseGeography } from './loadGeography'
import { CommunesPage } from './CommunesPage'
import { CupAppContext, type CupAppContextType } from '../../app/CupAppContext'
import type { Person } from '../persons/types'
import type { Club } from '../teams/types'

describe('CommunesPage - Sortable Columns & Personnalités', () => {
  const dataset = parseGeography(fixture)
  // Communes in fixture: 01004 (Ambérieu-en-Bugey, pop 15934), 01005 (Ambérieux-en-Dombes, pop 1906)
  const c1 = dataset.communes.find((c) => c.id === '01004')!
  const c2 = dataset.communes.find((c) => c.id === '01005')!

  const mockClub1: Club = {
    id: '01004-1',
    name: 'CS Ambérieu',
    shortName: 'CS Ambérieu',
    communeId: '01004',
    communeName: c1.name,
    communeIds: ['01004'],
    communeNames: [c1.name],
    departmentId: c1.departmentId,
    regionId: c1.regionId,
    zoneId: c1.zoneId,
    conferenceId: c1.conferenceId,
    population: 15934,
    strength: 15,
  }

  const mockClub2: Club = {
    id: '01005-1',
    name: 'FC Ambérieux-en-Dombes',
    shortName: 'FC Ambérieux',
    communeId: '01005',
    communeName: c2.name,
    communeIds: ['01005'],
    communeNames: [c2.name],
    departmentId: c2.departmentId,
    regionId: c2.regionId,
    zoneId: c2.zoneId,
    conferenceId: c2.conferenceId,
    population: 1906,
    strength: 10,
  }

  // Two personalities born in Ambérieu-en-Bugey (01004), none in Ambérieux-en-Dombes (01005)
  const mockPersons: Person[] = [
    {
      id: 'p-1',
      firstName: 'Alain',
      lastName: 'Giresse',
      age: 28,
      nationality: 'FR',
      birthCommuneId: '01004',
      birthCommuneName: 'Ambérieu-en-Bugey',
      birthDepartmentId: '01',
      currentClubId: '01004-1',
      primaryRole: 'PLAYER',
      position: 'ATTACKER',
      attack: 25,
      defense: 12,
      careerYears: 0,
      careerHistory: [],
      isRetired: false,
    },
    {
      id: 'p-2',
      firstName: 'Michel',
      lastName: 'Platini',
      age: 32,
      nationality: 'FR',
      birthCommuneId: '01004',
      birthCommuneName: 'Ambérieu-en-Bugey',
      birthDepartmentId: '01',
      currentClubId: '01004-1',
      primaryRole: 'PLAYER',
      position: 'ATTACKER',
      attack: 28,
      defense: 14,
      careerYears: 0,
      careerHistory: [],
      isRetired: false,
    },
  ]

  const mockContextValue: Partial<CupAppContextType> = {
    dataset,
    clubs: [mockClub1, mockClub2],
    persons: mockPersons,
    archives: [],
  }

  it('renders all 7 table columns including Personnalités and displays personality counts', () => {
    render(
      <MemoryRouter initialEntries={['/villes']}>
        <CupAppContext.Provider value={mockContextValue as CupAppContextType}>
          <Routes>
            <Route path="/villes" element={<CommunesPage />} />
          </Routes>
        </CupAppContext.Provider>
      </MemoryRouter>,
    )

    // Check table headers
    expect(screen.getByRole('columnheader', { name: /Commune/i })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: /Département/i })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: /Région/i })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: /Population/i })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: /Clubs Actifs/i })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: /Personnalités/i })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: /Statut Alliance/i })).toBeInTheDocument()

    // Ambérieu-en-Bugey has 2 personalities
    const amberieuPersonsBadge = screen.getByTitle(/2 personnalité\(s\) de la commune/i)
    expect(amberieuPersonsBadge).toBeInTheDocument()
    expect(amberieuPersonsBadge).toHaveTextContent('2')

    // Link should point to /personnes?q=Amb%C3%A9rieu-en-Bugey
    const link = amberieuPersonsBadge.closest('a')
    expect(link?.getAttribute('href')).toContain('/personnes?q=Amb%C3%A9rieu-en-Bugey')
  })

  it('allows sorting by all columns when clicking column headers', () => {
    render(
      <MemoryRouter initialEntries={['/villes']}>
        <CupAppContext.Provider value={mockContextValue as CupAppContextType}>
          <Routes>
            <Route path="/villes" element={<CommunesPage />} />
          </Routes>
        </CupAppContext.Provider>
      </MemoryRouter>,
    )

    const nameHeader = screen.getByRole('columnheader', { name: /Commune/i })
    const popHeader = screen.getByRole('columnheader', { name: /Population/i })
    const personsHeader = screen.getByRole('columnheader', { name: /Personnalités/i })
    const clubsHeader = screen.getByRole('columnheader', { name: /Clubs Actifs/i })
    const deptHeader = screen.getByRole('columnheader', { name: /Département/i })
    const regionHeader = screen.getByRole('columnheader', { name: /Région/i })
    const allianceHeader = screen.getByRole('columnheader', { name: /Statut Alliance/i })

    // Default sort is population desc -> Ambérieu-en-Bugey (15k) before Ambérieux-en-Dombes (1.9k)
    let rows = screen.getAllByRole('row')
    expect(rows[1]).toHaveTextContent('Ambérieu-en-Bugey')
    expect(rows[2]).toHaveTextContent('Ambérieux-en-Dombes')

    // Click population header -> toggles to asc
    fireEvent.click(popHeader)
    rows = screen.getAllByRole('row')
    expect(rows[1]).toHaveTextContent('Ambérieux-en-Dombes')
    expect(rows[2]).toHaveTextContent('Ambérieu-en-Bugey')

    // Click Commune name -> sorts asc (Ambérieu-en-Bugey before Ambérieux-en-Dombes)
    fireEvent.click(nameHeader)
    rows = screen.getAllByRole('row')
    expect(rows[1]).toHaveTextContent('Ambérieu-en-Bugey')
    expect(rows[2]).toHaveTextContent('Ambérieux-en-Dombes')

    // Click Commune name again -> toggles to desc (Ambérieux-en-Dombes before Ambérieu-en-Bugey)
    fireEvent.click(nameHeader)
    rows = screen.getAllByRole('row')
    expect(rows[1]).toHaveTextContent('Ambérieux-en-Dombes')
    expect(rows[2]).toHaveTextContent('Ambérieu-en-Bugey')

    // Click Personnalités -> sorts desc (Ambérieu has 2, Ambérieux has 0)
    fireEvent.click(personsHeader)
    rows = screen.getAllByRole('row')
    expect(rows[1]).toHaveTextContent('Ambérieu-en-Bugey')
    expect(rows[2]).toHaveTextContent('Ambérieux-en-Dombes')

    // Click Personnalités again -> sorts asc (Ambérieux 0 before Ambérieu 2)
    fireEvent.click(personsHeader)
    rows = screen.getAllByRole('row')
    expect(rows[1]).toHaveTextContent('Ambérieux-en-Dombes')
    expect(rows[2]).toHaveTextContent('Ambérieu-en-Bugey')

    // Click other headers without crashing
    fireEvent.click(clubsHeader)
    fireEvent.click(deptHeader)
    fireEvent.click(regionHeader)
    fireEvent.click(allianceHeader)
  })
})
