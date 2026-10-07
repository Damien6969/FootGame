import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { CupAppContext, type CupAppContextType } from '../../app/CupAppContext'
import type { CupSession, SeasonArchive } from '../storage/cupRepository'
import { TransfersPage } from './TransfersPage'
import type { TransferMovement } from './types'

function movement(overrides: Partial<TransferMovement> = {}): TransferMovement {
  return {
    id: 'm-1', seasonYear: 2030, kind: 'TRANSFER', personId: 'p-1', playerName: 'Émile Laurent',
    age: 25, position: 'ATTACKER', rating: 28, fromClubId: 'club-1', fromClubName: 'AS Évry',
    toClubId: 'club-2', toClubName: 'FC Lyon', distanceKm: 410, reason: 'AMBITION', ...overrides,
  }
}

function show(movements?: readonly TransferMovement[], archives: readonly SeasonArchive[] = []) {
  const session: CupSession = {
    id: 'active', seasonYear: 2030, seed: '2030', transferMovements: movements,
    datasetVersion: 'test', activeTeamIds: [], roundNumber: 1,
    round: { matches: [], byeTeamIds: [] }, results: {}, history: [],
  }
  const app: Partial<CupAppContextType> = { session, archives }
  return render(<MemoryRouter><CupAppContext.Provider value={app as CupAppContextType}><TransfersPage /></CupAppContext.Provider></MemoryRouter>)
}

function archive(year: number, movements?: readonly TransferMovement[]): SeasonArchive {
  return {
    year, seed: String(year), transferMovements: movements, completedAt: `${year}-12-01T00:00:00Z`,
    datasetVersion: 'test', nationalChampionId: 'club-2', conferenceChampions: {},
    finalFourTeamIds: [], totalMatches: 0, teamPerformances: {}, history: [],
  }
}

const market = [
  movement({ id: 'm-2', personId: 'p-2', playerName: 'Louis Petit', rating: 12, reason: 'VETERAN' }),
  movement(),
  movement({ id: 'm-3', personId: 'p-3', playerName: 'Léo Martin', rating: 30, kind: 'LOAN', reason: 'DEVELOPMENT', ownerClubId: 'club-1', ownerClubName: 'AS Évry' }),
]

describe('TransfersPage', () => {
  it('filters coach recruitments and does not link unemployed coaches to a fictitious club', () => {
    show([...market, movement({ id: 'coach', role: 'COACH', personId: 'coach', playerName: 'Paul Coach', age: 50,
      fromClubId: 'free-agent', fromClubName: 'Sans club', reason: 'FREE_AGENT' })])
    fireEvent.change(screen.getByRole('combobox', { name: /^Rôle$/ }), { target: { value: 'COACH' } })
    const table = screen.getByRole('table', { name: /mouvements du mercato/i })
    expect(within(table).getByRole('link', { name: 'Paul Coach' })).toBeInTheDocument()
    expect(within(table).queryByRole('link', { name: 'Émile Laurent' })).not.toBeInTheDocument()
    expect(within(table).getByText('Sans club')).toBeInTheDocument()
    expect(within(table).queryByRole('link', { name: 'Sans club' })).not.toBeInTheDocument()
    expect(within(table).getByText('Entraîneur · 50 ans')).toBeInTheDocument()
  })
  it('ranks all movements by playing strength and keeps loans out of the featured transfers', () => {
    show(market)
    const table = screen.getByRole('table', { name: /mouvements du mercato/i })
    const rows = within(table).getAllByRole('row').slice(1)
    expect(rows.map(row => within(row).getByRole('link', { name: /Léo Martin|Émile Laurent|Louis Petit/ }).textContent)).toEqual(['Léo Martin', 'Émile Laurent', 'Louis Petit'])
    const featured = screen.getByRole('region', { name: /transferts à la une/i })
    expect(within(featured).getByRole('link', { name: 'Émile Laurent' })).toBeInTheDocument()
    expect(within(featured).queryByRole('link', { name: 'Léo Martin' })).not.toBeInTheDocument()
    expect(within(table).getByRole('link', { name: 'Émile Laurent' })).toHaveAttribute('href', '/personnes/p-1')
    expect(within(rows[1]).getByRole('link', { name: 'FC Lyon' })).toHaveAttribute('href', '/equipes/club-2')
  })

  it('combines the loan filter with an accent-insensitive player or club search', () => {
    show(market)
    fireEvent.click(screen.getByRole('button', { name: /^prêts/i }))
    expect(screen.getByRole('button', { name: /^prêts/i })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.change(screen.getByRole('searchbox', { name: /rechercher/i }), { target: { value: 'evry' } })
    const table = screen.getByRole('table', { name: /mouvements du mercato/i })
    expect(within(table).getByRole('link', { name: 'Léo Martin' })).toBeInTheDocument()
    expect(within(table).queryByRole('link', { name: 'Émile Laurent' })).not.toBeInTheDocument()
    expect(within(table).getByText(/club propriétaire/i)).toBeInTheDocument()
    fireEvent.change(screen.getByRole('searchbox', { name: /rechercher/i }), { target: { value: 'leo' } })
    expect(within(table).getByRole('link', { name: 'Léo Martin' })).toBeInTheDocument()
    fireEvent.change(screen.getByRole('searchbox', { name: /rechercher/i }), { target: { value: 'introuvable' } })
    expect(screen.getByText(/aucun mouvement ne correspond/i)).toBeInTheDocument()
  })

  it('explains a former loan host as the distance origin while preserving the ownership route', () => {
    show([movement({ distanceFromClubName: 'FC Nice' })])
    const featured = screen.getByRole('region', { name: /transferts à la une/i })
    const table = screen.getByRole('table', { name: /mouvements du mercato/i })
    expect(within(featured).getByText('410 km · depuis FC Nice')).toBeInTheDocument()
    expect(within(table).getByText('410 km · depuis FC Nice')).toBeInTheDocument()
    expect(within(table).getByRole('link', { name: 'AS Évry' })).toHaveAttribute('href', '/equipes/club-1')
    expect(within(table).getByRole('link', { name: 'FC Lyon' })).toHaveAttribute('href', '/equipes/club-2')
  })

  it('lets the reader browse an archived season without mixing in the active market', () => {
    show(market, [archive(2029, [movement({ id: 'old', seasonYear: 2029, playerName: 'Paul Ancien' })])])
    fireEvent.change(screen.getByRole('combobox', { name: /saison/i }), { target: { value: '2029' } })
    const table = screen.getByRole('table', { name: /mouvements du mercato/i })
    expect(within(table).getByRole('link', { name: 'Paul Ancien' })).toBeInTheDocument()
    expect(within(table).queryByRole('link', { name: 'Léo Martin' })).not.toBeInTheDocument()
  })

  it('distinguishes an old unrecorded market from a recorded quiet market', () => {
    show(undefined, [archive(2029, [])])
    expect(screen.getByText(/mouvements non enregistrés/i)).toBeInTheDocument()
    fireEvent.change(screen.getByRole('combobox', { name: /saison/i }), { target: { value: '2029' } })
    expect(screen.getByText(/aucun mouvement cette saison/i)).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: /transferts à la une/i })).not.toBeInTheDocument()
  })

  it('provides a route back to the cup when no career is available', () => {
    render(<MemoryRouter><TransfersPage /></MemoryRouter>)
    expect(screen.getByRole('link', { name: /aller à la coupe/i })).toHaveAttribute('href', '/coupe')
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('limits the movement table to 50 rows and resets pagination after a filter change', () => {
    show(Array.from({ length: 51 }, (_, index) => movement({ id: `m-${index}`, personId: `p-${index}`, playerName: `Joueur ${index}`, rating: 20 - index / 100 })))
    const table = screen.getByRole('table', { name: /mouvements du mercato/i })
    expect(within(table).getAllByRole('row')).toHaveLength(51)
    expect(within(table).queryByRole('link', { name: 'Joueur 50' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /page suivante/i }))
    expect(within(table).getByRole('link', { name: 'Joueur 50' })).toBeInTheDocument()
    fireEvent.change(screen.getByRole('searchbox', { name: /rechercher/i }), { target: { value: 'Joueur 0' } })
    expect(within(table).getByRole('link', { name: 'Joueur 0' })).toBeInTheDocument()
  })

  it('renders LIMOGEAGE, DYNAMICS, and OPPORTUNITY motifs cleanly', () => {
    const movements = [
      movement({ id: 'm-lim', role: 'COACH', personId: 'c-1', playerName: 'Entraîneur Fired', toClubId: 'free-agent', toClubName: 'Sans club', reason: 'LIMOGEAGE', rating: 22 }),
      movement({ id: 'm-dyn', personId: 'p-dyn', playerName: 'Joueur Dynamique', reason: 'DYNAMICS', rating: 27 }),
      movement({ id: 'm-opp', role: 'COACH', personId: 'c-opp', playerName: 'Coach Opportuniste', reason: 'OPPORTUNITY', rating: 25 }),
    ]
    show(movements)
    const table = screen.getByRole('table', { name: /mouvements du mercato/i })
    expect(within(table).getByText('Limogeage')).toBeInTheDocument()
    expect(within(table).getByText('Remercié par le club')).toBeInTheDocument()
    expect(within(table).getByText('Dynamique sportive')).toBeInTheDocument()
    expect(within(table).getByText('Opportunité')).toBeInTheDocument()

    // Dismissal coach is excluded from "Transferts à la une"
    const featured = screen.getByRole('region', { name: /transferts à la une/i })
    expect(within(featured).queryByText('Entraîneur Fired')).not.toBeInTheDocument()
    expect(within(featured).getByText('Joueur Dynamique')).toBeInTheDocument()
  })
})

