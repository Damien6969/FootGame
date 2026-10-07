import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { PersonTable } from './PersonTable'
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
    careerYears: 8,
    attack: 28,
    defense: 12,
    peakAge: 27,
    peakAttack: 29,
    peakDefense: 13,
  },
  {
    id: 'p-2',
    firstName: 'William',
    lastName: 'Saliba',
    age: 24,
    nationality: 'FR',
    birthCommuneId: '93005',
    birthCommuneName: 'Bondy',
    birthDepartmentId: '93',
    currentClubId: 'club-bondy',
    primaryRole: 'PLAYER',
    position: 'DEFENDER',
    careerYears: 6,
    attack: 10,
    defense: 27,
    peakAge: 28,
    peakAttack: 11,
    peakDefense: 28,
  },
]

describe('PersonTable', () => {
  it('renders a structured data table with player info', () => {
    render(
      <MemoryRouter>
        <PersonTable persons={mockPersons} showClub={true} showCommune={true} />
      </MemoryRouter>,
    )

    // Column headers
    expect(screen.getByRole('columnheader', { name: /Joueur/i })).toBeVisible()
    expect(screen.getByRole('columnheader', { name: /Poste/i })).toBeVisible()
    expect(screen.getByRole('columnheader', { name: /Âge & Phase/i })).toBeVisible()
    expect(screen.getByRole('columnheader', { name: /Club actuel/i })).toBeVisible()
    expect(screen.getByRole('columnheader', { name: /Ville natale/i })).toBeVisible()
    expect(screen.getByRole('columnheader', { name: /ATQ/i })).toBeVisible()
    expect(screen.getByRole('columnheader', { name: /DEF/i })).toBeVisible()
    expect(screen.getByRole('columnheader', { name: /GÉN/i })).toBeVisible()
    expect(screen.getByRole('columnheader', { name: /Palmarès/i })).toBeVisible()

    // Players rendered
    expect(screen.getByText('Kylian Mbappé')).toBeVisible()
    expect(screen.getByText('William Saliba')).toBeVisible()
    expect(screen.getByText('Attaquant')).toBeVisible()
    expect(screen.getByText('Défenseur')).toBeVisible()
    expect(screen.getByText('28')).toBeVisible() // Mbappé attack
    expect(screen.getByText('27')).toBeVisible() // Saliba defense
  })

  it('sorts columns when clicking headers', () => {
    render(
      <MemoryRouter>
        <PersonTable persons={mockPersons} showClub={true} showCommune={true} />
      </MemoryRouter>,
    )

    const ageHeader = screen.getByRole('columnheader', { name: /Âge & Phase/i })
    // First click sorts desc (26 then 24)
    fireEvent.click(ageHeader)
    let rows = screen.getAllByRole('row')
    expect(rows[1].textContent).toContain('Mbappé')
    expect(rows[2].textContent).toContain('Saliba')

    // Second click toggles to asc (24 then 26)
    fireEvent.click(ageHeader)
    rows = screen.getAllByRole('row')
    expect(rows[1].textContent).toContain('Saliba')
    expect(rows[2].textContent).toContain('Mbappé')
  })

  it('renders custom empty message when list is empty', () => {
    render(
      <MemoryRouter>
        <PersonTable persons={[]} emptyMessage="Aucun membre dans cet effectif." />
      </MemoryRouter>,
    )

    expect(screen.getByText('Aucun membre dans cet effectif.')).toBeVisible()
  })

  it('hides club or commune columns based on props', () => {
    render(
      <MemoryRouter>
        <PersonTable persons={mockPersons} showClub={false} showCommune={true} />
      </MemoryRouter>,
    )

    expect(screen.queryByRole('columnheader', { name: /Club actuel/i })).toBeNull()
    expect(screen.getByRole('columnheader', { name: /Ville natale/i })).toBeVisible()
  })

  it('displays loan indicator and assigned position badge', () => {
    const loanedPerson: Person = {
      ...mockPersons[0],
      id: 'p-loan',
      currentClubId: 'club-bondy',
      parentClubId: 'club-paris',
      loanedFromClubId: 'club-paris',
      position: 'ATTACKER',
      assignedPosition: 'DEFENDER',
    }

    render(
      <MemoryRouter>
        <PersonTable persons={[loanedPerson]} showClub={false} showCommune={true} />
      </MemoryRouter>,
    )

    // Should indicate prêt in player name column when showClub is false
    expect(screen.getByText(/Prêté par/i)).toBeVisible()
    // Should display the assigned defender position
    expect(screen.getByText(/Défenseur/i)).toBeVisible()
  })
})

