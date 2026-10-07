import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { CompetitionStatsView } from './CompetitionStatsView'
import type { CupSession } from '../storage/cupRepository'
import type { Person } from '../persons/types'
import type { Club } from '../teams/types'

describe('CompetitionStatsView', () => {
  const p1: Person = {
    id: 'p-breton',
    firstName: 'Yoann',
    lastName: 'Gourcuff',
    age: 28,
    nationality: 'FR',
    birthCommuneId: '56178',
    birthCommuneName: 'Ploemeur',
    birthDepartmentId: '56',
    currentClubId: 'club-brest',
    primaryRole: 'PLAYER',
    position: 'ATTACKER',
    attack: 25,
    defense: 12,
    careerYears: 7,
  }

  const p2: Person = {
    id: 'p-normand',
    firstName: 'Ousmane',
    lastName: 'Dembélé',
    age: 27,
    nationality: 'FR',
    birthCommuneId: '27681',
    birthCommuneName: 'Vernon',
    birthDepartmentId: '27',
    currentClubId: 'club-lehavre',
    primaryRole: 'PLAYER',
    position: 'ATTACKER',
    attack: 28,
    defense: 8,
    careerYears: 8,
  }

  const p3: Person = {
    id: 'p-marseillais',
    firstName: 'Steve',
    lastName: 'Mandanda',
    age: 35,
    nationality: 'FR',
    birthCommuneId: '13055',
    birthCommuneName: 'Marseille',
    birthDepartmentId: '13',
    currentClubId: 'club-marseille',
    primaryRole: 'PLAYER',
    position: 'DEFENDER',
    attack: 5,
    defense: 28,
    careerYears: 12,
  }

  const clubBrest: Club = {
    id: 'club-brest',
    name: 'Stade Brestois',
    shortName: 'Brest',
    communeId: '29019',
    communeName: 'Brest',
    departmentId: '29', // Bretagne (53), CONF_OUEST
    regionId: '53',
    conferenceId: 'CONF_OUEST',
    communeIds: ['29019'], communeNames: ['Brest'], zoneId: 'ZONE_OUEST', population: 140000, strength: 21,
  }

  const clubLeHavre: Club = {
    id: 'club-lehavre',
    name: 'Le Havre AC',
    shortName: 'HAC',
    communeId: '76351',
    communeName: 'Le Havre',
    departmentId: '76', // Normandie (28), CONF_OUEST
    regionId: '28',
    conferenceId: 'CONF_OUEST',
    communeIds: ['76351'], communeNames: ['Le Havre'], zoneId: 'ZONE_OUEST', population: 170000, strength: 20,
  }

  const clubMarseille: Club = {
    id: 'club-marseille',
    name: 'Olympique de Marseille',
    shortName: 'OM',
    communeId: '13055',
    communeName: 'Marseille',
    departmentId: '13', // Provence-Alpes-Côte d'Azur (93), CONF_SUD_EST
    regionId: '93',
    conferenceId: 'CONF_SUD_EST',
    communeIds: ['13055'], communeNames: ['Marseille'], zoneId: 'ZONE_SUD_EST', population: 870000, strength: 25,
  }

  const clubsById = new Map<string, Club>([
    [clubBrest.id, clubBrest],
    [clubLeHavre.id, clubLeHavre],
    [clubMarseille.id, clubMarseille],
  ])

  const session: CupSession = {
    id: 'active',
    seed: 'seed-stats',
    seasonYear: 2026,
    datasetVersion: '1.0',
    activeTeamIds: ['club-brest', 'club-lehavre', 'club-marseille'],
    roundNumber: 2,
    round: { matches: [], byeTeamIds: [] },
    results: {},
    history: [
      {
        roundNumber: 1,
        homeTeamId: 'club-brest',
        awayTeamId: 'club-marseille',
        result: {
          matchId: 'm1',
          homeScore: 2,
          awayScore: 0,
          winnerId: 'club-brest',
          events: [
            { sequence: 1, teamId: 'club-brest', kind: 'GOAL', actorId: 'p-breton', actorName: 'Yoann Gourcuff', actorRole: 'ATTACKER' },
            { sequence: 2, teamId: 'club-brest', kind: 'GOAL', actorId: 'p-breton', actorName: 'Yoann Gourcuff', actorRole: 'ATTACKER' },
            { sequence: 3, teamId: 'club-brest', kind: 'CHANCE', actorId: 'p-breton', defenderId: 'p-marseillais', defenderName: 'Steve Mandanda' },
          ],
        },
      },
      {
        roundNumber: 1,
        homeTeamId: 'club-lehavre',
        awayTeamId: 'club-marseille',
        result: {
          matchId: 'm2',
          homeScore: 1,
          awayScore: 0,
          winnerId: 'club-lehavre',
          events: [
            { sequence: 1, teamId: 'club-lehavre', kind: 'GOAL', actorId: 'p-normand', actorName: 'Ousmane Dembélé', actorRole: 'ATTACKER' },
          ],
        },
      },
    ],
  }

  it('renders styled tab buttons in a view-switch container', () => {
    render(
      <MemoryRouter>
        <CompetitionStatsView session={session} persons={[p1, p2, p3]} clubsById={clubsById} />
      </MemoryRouter>
    )

    const scorersBtn = screen.getByRole('button', { name: /Meilleurs Buteurs/i })
    const defendersBtn = screen.getByRole('button', { name: /Meilleurs Défenseurs/i })

    expect(scorersBtn).toBeInTheDocument()
    expect(defendersBtn).toBeInTheDocument()
    expect(scorersBtn).toHaveClass('is-active')
    expect(defendersBtn).not.toHaveClass('is-active')

    // Switch to defenders
    fireEvent.click(defendersBtn)
    expect(defendersBtn).toHaveClass('is-active')
    expect(scorersBtn).not.toHaveClass('is-active')
  })

  it('renders geographic dropdown filters and cascades conference -> region -> department', () => {
    render(
      <MemoryRouter>
        <CompetitionStatsView session={session} persons={[p1, p2, p3]} clubsById={clubsById} />
      </MemoryRouter>
    )

    const confSelect = screen.getByLabelText('Filtrer par conférence') as HTMLSelectElement
    const regSelect = screen.getByLabelText('Filtrer par région') as HTMLSelectElement
    const deptSelect = screen.getByLabelText('Filtrer par département') as HTMLSelectElement

    expect(confSelect).toBeInTheDocument()
    expect(regSelect).toBeInTheDocument()
    expect(deptSelect).toBeInTheDocument()

    // Initially all scorers visible (Yoann Gourcuff 2 goals, Ousmane Dembélé 1 goal)
    expect(screen.getByText('Yoann Gourcuff')).toBeInTheDocument()
    expect(screen.getByText('Ousmane Dembélé')).toBeInTheDocument()
    expect(screen.getByText(/Classement National des Buteurs/i)).toBeInTheDocument()

    // Filter by Région Bretagne (53)
    fireEvent.change(regSelect, { target: { value: '53' } })

    // Conference should auto-sync to CONF_OUEST
    expect(confSelect.value).toBe('CONF_OUEST')
    expect(screen.getByText(/Classement des Buteurs · Région Bretagne/i)).toBeInTheDocument()

    // Gourcuff (Stade Brestois in 29/Bretagne) is shown, Dembélé (Le Havre in 76/Normandie) is filtered out
    expect(screen.getByText('Yoann Gourcuff')).toBeInTheDocument()
    expect(screen.queryByText('Ousmane Dembélé')).not.toBeInTheDocument()

    // Reset filters button appears
    const resetBtn = screen.getByRole('button', { name: /Réinitialiser filtres/i })
    expect(resetBtn).toBeInTheDocument()

    // Resetting filters restores both players
    fireEvent.click(resetBtn)
    expect(confSelect.value).toBe('ALL')
    expect(regSelect.value).toBe('ALL')
    expect(deptSelect.value).toBe('ALL')
    expect(screen.getByText('Yoann Gourcuff')).toBeInTheDocument()
    expect(screen.getByText('Ousmane Dembélé')).toBeInTheDocument()
  })

  it('filters defenders geographically and reflects title for defenders tab', () => {
    render(
      <MemoryRouter>
        <CompetitionStatsView session={session} persons={[p1, p2, p3]} clubsById={clubsById} />
      </MemoryRouter>
    )

    // Switch to defenders tab
    const defendersBtn = screen.getByRole('button', { name: /Meilleurs Défenseurs/i })
    fireEvent.click(defendersBtn)

    expect(screen.getByText(/Classement National des Défenseurs/i)).toBeInTheDocument()
    expect(screen.getByText('Steve Mandanda')).toBeInTheDocument()

    // Filter by Conference Ouest (Mandanda is in Marseille -> CONF_SUD_EST)
    const confSelect = screen.getByLabelText('Filtrer par conférence')
    fireEvent.change(confSelect, { target: { value: 'CONF_OUEST' } })

    expect(screen.getByText(/Classement des Défenseurs · Conférence Ouest/i)).toBeInTheDocument()
    expect(screen.queryByText('Steve Mandanda')).not.toBeInTheDocument()
    expect(screen.getByText(/Aucun défenseur ne correspond à vos critères de recherche/i)).toBeInTheDocument()

    // Switch conference to CONF_SUD_EST
    fireEvent.change(confSelect, { target: { value: 'CONF_SUD_EST' } })
    expect(screen.getByText(/Classement des Défenseurs · Conférence Sud-Est/i)).toBeInTheDocument()
    expect(screen.getByText('Steve Mandanda')).toBeInTheDocument()
  })

  it('filters by department directly and syncs region and conference', () => {
    render(
      <MemoryRouter>
        <CompetitionStatsView session={session} persons={[p1, p2, p3]} clubsById={clubsById} />
      </MemoryRouter>
    )

    const confSelect = screen.getByLabelText('Filtrer par conférence') as HTMLSelectElement
    const regSelect = screen.getByLabelText('Filtrer par région') as HTMLSelectElement
    const deptSelect = screen.getByLabelText('Filtrer par département') as HTMLSelectElement

    // Select Finistère (29)
    fireEvent.change(deptSelect, { target: { value: '29' } })

    expect(deptSelect.value).toBe('29')
    expect(regSelect.value).toBe('53') // Bretagne
    expect(confSelect.value).toBe('CONF_OUEST')
    expect(screen.getByText(/Classement des Buteurs · Dép. Finistère \(29\)/i)).toBeInTheDocument()
  })

  it('displays active/eliminated club status badges and allows filtering by status', () => {
    // Only Brest is active, Le Havre and Marseille are eliminated
    const customSession: CupSession = {
      ...session,
      activeTeamIds: ['club-brest'],
    }

    render(
      <MemoryRouter>
        <CompetitionStatsView session={customSession} persons={[p1, p2, p3]} clubsById={clubsById} />
      </MemoryRouter>
    )

    // Brest is active
    expect(screen.getByText('En lice')).toBeInTheDocument()
    // Le Havre is eliminated
    expect(screen.getByText('Éliminé')).toBeInTheDocument()

    const statusSelect = screen.getByLabelText('Filtrer par statut du club') as HTMLSelectElement
    expect(statusSelect).toBeInTheDocument()

    // Filter by ALIVE
    fireEvent.change(statusSelect, { target: { value: 'ALIVE' } })
    expect(screen.getByText('Yoann Gourcuff')).toBeInTheDocument()
    expect(screen.queryByText('Ousmane Dembélé')).not.toBeInTheDocument()
    expect(screen.getByText(/Classement des Buteurs · En lice/i)).toBeInTheDocument()

    // Filter by ELIMINATED
    fireEvent.change(statusSelect, { target: { value: 'ELIMINATED' } })
    expect(screen.queryByText('Yoann Gourcuff')).not.toBeInTheDocument()
    expect(screen.getByText('Ousmane Dembélé')).toBeInTheDocument()
    expect(screen.getByText(/Classement des Buteurs · Éliminés/i)).toBeInTheDocument()
  })
})
