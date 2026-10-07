import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { expect, it, vi } from 'vitest'
import type { Person } from '../persons/types'
import type { CupSession } from '../storage/cupRepository'
import { buildPlayerPalmaresFromHonors, extractSeasonPlayerHonors } from '../history/playerPalmaresStorage'
import { usePlayerPalmares } from '../history/usePlayerPalmares'
import { PalmaresPlayersView } from './PalmaresPlayersView'

vi.mock('../history/usePlayerPalmares', () => ({ usePlayerPalmares: vi.fn() }))

it('shows the champion coach as a coach and retains his title under both filters', () => {
  const coach: Person = { id: 'coach', firstName: 'Paul', lastName: 'Champion', nationality: 'FR', age: 50,
    birthCommuneId: 'town', birthCommuneName: 'Town', birthDepartmentId: '75', currentClubId: 'c',
    primaryRole: 'COACH', isRetired: true, position: 'ATTACKER', attack: 10, defense: 5, careerYears: 30 }
  const session: CupSession = { id: 'active', seasonYear: 2026, seed: '2026', datasetVersion: 'test',
    activeTeamIds: ['c'], championId: 'c', roundNumber: 14, round: { matches: [], byeTeamIds: [] },
    results: {}, history: [], persons: [coach], clubs: [] }
  const rankedPlayers = buildPlayerPalmaresFromHonors(extractSeasonPlayerHonors(session), new Map([[coach.id, coach]]))
  Object.assign(rankedPlayers[0], {
    ballonOrCount: 1, ballonOrYears: [2020], topScorerCount: 1, topScorerYears: [2021],
    topStopsCount: 1, topStopsYears: [2022], totalIndividualTitles: 4, totalTitles: 5,
    allIndividualHonors: [
      { year: 2020, awardId: 'ballon-or', title: 'Ballon d’Or' },
      { year: 2021, awardId: 'top-scorer', title: 'Soulier d’Or' },
      { year: 2022, awardId: 'top-stops', title: 'Bouclier d’Or' },
      { year: 2023, awardId: 'best-defender', title: 'Meilleur défenseur' },
    ],
  })
  vi.mocked(usePlayerPalmares).mockReturnValue({ rankedPlayers, awardSummaries: [], loading: false, error: null })
  render(<MemoryRouter><PalmaresPlayersView completedEditions={[]} persons={[coach]} clubsById={new Map()} activeSession={session} /></MemoryRouter>)
  expect(screen.getByTitle("Trier par Souliers d'Or")).toBeInTheDocument()
  expect(screen.getByTitle("Trier par Boucliers d'Or")).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Entraîneurs' }))
  fireEvent.click(screen.getByRole('button', { name: /Champions de France/ }))
  const row = screen.getByTitle('Voir le profil de Paul Champion').closest('tr')!
  expect(within(row).getByText('Entraîneur')).toBeInTheDocument()
  expect(within(row).queryByText('Retraité')).not.toBeInTheDocument()
  expect(within(row).getByTitle('1 titre(s) de champion de France : 2026')).toBeInTheDocument()
  expect(within(row).getByTitle("1 Soulier(s) d'Or : 2021")).toHaveTextContent('👟 1')
  expect(within(row).getByTitle("1 Bouclier(s) d'Or : 2022")).toHaveTextContent('🛡️ 1')
  expect(within(row).getByTitle('Meilleur défenseur (2023)')).toHaveTextContent('🎖️ 1')
  fireEvent.click(screen.getByRole('button', { name: 'Attaquants' }))
  expect(screen.queryByTitle('Voir le profil de Paul Champion')).not.toBeInTheDocument()
})
