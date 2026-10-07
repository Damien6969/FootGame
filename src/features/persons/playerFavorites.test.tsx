import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, expect, it } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import fixture from '../../test/fixtures/communes.fixture.json'
import { parseGeography } from '../geography/loadGeography'
import { buildClubsFromCommunes } from '../teams/clubGenerator'
import { CupAppProvider, useCupApp } from '../../app/CupAppContext'
import { PersonsPage } from './PersonsPage'
import { PersonPage } from './PersonPage'
import { CupRightPanel } from '../cup/CupRightPanel'
import { getRoundViews } from '../cup/cupSelectors'
import type { CupSession } from '../storage/cupRepository'
import type { Person } from './types'

const dataset = parseGeography(fixture)
const clubs = buildClubsFromCommunes(dataset.communes)
const [home, away] = clubs
const base: Person = {
  id: 'starter', firstName: 'Alex', lastName: 'Martin', age: 25,
  nationality: 'FR', birthCommuneId: home.communeId, birthCommuneName: home.communeName,
  birthDepartmentId: home.departmentId, currentClubId: home.id,
  primaryRole: 'PLAYER', position: 'ATTACKER', assignedPosition: 'ATTACKER',
  attack: 28, defense: 12, careerYears: 5,
}
// Un pool complet évite le réapprovisionnement et sa réattribution des prêts au chargement.
const padding: Person[] = Array.from({ length: 250 }, (_, index) => ({ ...base,
  id: `other-${index}`, firstName: 'Autre', lastName: `Joueur ${index}`, currentClubId: null,
  assignedPosition: undefined, attack: 0, defense: 0,
}))
const persons: Person[] = [base,
  { ...base, id: 'defender', firstName: 'Hugo', position: 'DEFENDER', assignedPosition: 'DEFENDER', attack: 10, defense: 28 },
  { ...base, id: 'reserve', firstName: 'Louis', assignedPosition: undefined, attack: 5, defense: 4 },
  { ...base, id: 'loan', firstName: 'Lucas', currentClubId: away.id, parentClubId: home.id, loanedFromClubId: home.id },
  { ...base, id: 'retired', firstName: 'Paul', currentClubId: null, isRetired: true },
  ...padding,
]
const match = { id: 'DEPARTMENT:1:test:1', homeTeamId: home.id, awayTeamId: away.id }
const result = { matchId: match.id, homeScore: 1, awayScore: 0, winnerId: home.id,
  events: [{ sequence: 1, teamId: home.id, kind: 'GOAL' as const, actorId: 'starter' }] }
const session: CupSession = {
  id: 'active', seed: 'favorites-2026', seasonYear: 2026, datasetVersion: dataset.version,
  clubs, persons, activeTeamIds: [home.id], roundNumber: 1,
  round: { matches: [match], byeTeamIds: [] }, results: { [match.id]: result },
  history: [{ roundNumber: 1, ...match, result }],
}

function show(route = '/personnes', savedSession = session) {
  return render(<MemoryRouter initialEntries={[route]}>
    <CupAppProvider loadDataset={async () => dataset} repository={{
      load: async () => savedSession, save: async () => {}, clear: async () => {},
    }}>
      <Routes>
        <Route path="/personnes" element={<PersonsPage />} />
        <Route path="/personnes/:personId" element={<PersonPage />} />
      </Routes>
      <CupRightPanel round={getRoundViews(savedSession)[0]} byId={new Map(clubs.map(c => [c.id, c]))} />
      <ResetProbe />
    </CupAppProvider>
  </MemoryRouter>)
}

function ResetProbe() {
  const app = useCupApp()
  return <button onClick={() => void app.resetAllHistory('new-career-2026')}>Nouvelle carrière de test</button>
}

beforeEach(() => localStorage.clear())

it('follows a player from their profile, keeps the selection after reload and filters the directory', async () => {
  const view = show('/personnes/starter')
  fireEvent.click(await screen.findByRole('button', { name: /^Ajouter Alex Martin aux favoris/ }))
  expect(screen.getByRole('button', { name: /^Retirer Alex Martin des favoris/ })).toHaveAttribute('aria-pressed', 'true')
  expect(screen.getByRole('button', { name: /Joueur suivi/ })).toBeVisible()
  view.unmount()
  show('/personnes?statut=favorites')
  const directory = await screen.findByRole('table')
  expect(within(directory).getByText('Alex Martin')).toBeVisible()
  expect(within(directory).queryByText('Louis Martin')).not.toBeInTheDocument()
  fireEvent.click(within(directory).getByRole('button', { name: 'Retirer Alex Martin des favoris' }))
  expect(within(directory).queryByText('Alex Martin')).not.toBeInTheDocument()
})

it('counts only real participation, deduplicates matches and shows loans and retirement', async () => {
  localStorage.setItem('coupe_favorite_person_ids', JSON.stringify(['starter', 'reserve', 'loan', 'retired']))
  show()
  fireEvent.click(await screen.findByRole('button', { name: /Joueurs suivis/ }))
  const table = screen.getByRole('table', { name: 'Joueurs suivis' })
  const starterRow = within(table).getByText('Alex Martin').closest('tr')!
  expect(within(starterRow).getByText('1 match joué')).toBeVisible()
  expect(within(starterRow).getByText('1 but')).toBeVisible()
  expect(within(starterRow).getByRole('link', { name: /1–0/ })).toHaveAttribute('href', '/matchs/DEPARTMENT%3A1%3Atest%3A1')
  const reserveRow = within(table).getByText('Louis Martin').closest('tr')!
  expect(within(reserveRow).getByText(/Réserviste/)).toBeVisible()
  expect(within(reserveRow).getByText('0 match joué')).toBeVisible()
  expect(within(reserveRow).getByText(/Non aligné/)).toBeVisible()
  const loanRow = within(table).getByText('Lucas Martin').closest('tr')!
  expect(within(loanRow).getByRole('link', { name: away.name })).toBeVisible()
  expect(within(loanRow).getByText(/En prêt/)).toBeVisible()
  expect(within(table).getByText(/Retraité/)).toBeVisible()
})

it('follows the same person at their new club in the next season', async () => {
  localStorage.setItem('coupe_favorite_person_ids', '["starter"]')
  const next = { ...session, seasonYear: 2027, history: [], results: {}, activeTeamIds: [home.id, away.id],
    persons: [{ ...base, currentClubId: away.id }, ...padding] }
  show('/personnes', next)
  fireEvent.click(await screen.findByRole('button', { name: /Joueurs suivis/ }))
  const table = screen.getByRole('table', { name: 'Joueurs suivis' })
  expect(within(table).getByRole('link', { name: away.name })).toBeVisible()
  expect(within(table).getByText('0 match joué')).toBeVisible()
  expect(within(table).getByRole('link', { name: /Voir le match/ })).toHaveAttribute('href', '/matchs/DEPARTMENT%3A1%3Atest%3A1')
})

it('clears player favorites when a full reset creates new people with reused identifiers', async () => {
  localStorage.setItem('coupe_favorite_person_ids', '["starter"]')
  show()
  await screen.findByRole('button', { name: 'Retirer Alex Martin des favoris' })
  fireEvent.click(screen.getByRole('button', { name: 'Nouvelle carrière de test' }))
  await screen.findByRole('button', { name: 'Joueurs suivis (0)' })
  expect(localStorage.getItem('coupe_favorite_person_ids')).toBe('[]')
})
