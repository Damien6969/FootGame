import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { expect, it } from 'vitest'
import { CupAppProvider, useCupApp } from './CupAppContext'
import { buildClubsFromCommunes } from '../features/teams/clubGenerator'
import type { GeographyDataset } from '../features/geography/types'
import type { Person } from '../features/persons/types'
import type { CupRepository, CupSession, SeasonArchive } from '../features/storage/cupRepository'
import fixture from '../test/fixtures/communes.fixture.json'
import { parseGeography } from '../features/geography/loadGeography'
import { CupPage } from '../features/cup/CupPage'
import { MemoryRouter } from 'react-router-dom'

it('records the opening loans when creating a new career', async () => {
  let saved: CupSession | undefined
  const repository: CupRepository = {
    load: async () => undefined, save: async next => { saved = next }, clear: async () => {},
  }
  render(<MemoryRouter><CupAppProvider repository={repository} loadDataset={async () => parseGeography(fixture)}><CupPage /></CupAppProvider></MemoryRouter>)
  fireEvent.click(await screen.findByRole('button', { name: 'Créer la Coupe' }))
  await waitFor(() => expect(saved?.transferMovements).toBeDefined())
  expect(saved!.transferMovements!.every(m => m.kind === 'LOAN' && m.seasonYear === 2026)).toBe(true)
})

it('runs and persists the opening market with the next season while preserving annual career records', async () => {
  const dataset: GeographyDataset = {
    version: 'market-test', sourceLabel: 'test', sourceUrl: 'https://example.com', communes: [
      { id: 'a', name: 'Ville A', population: 1000, departmentId: '01', regionId: '84', zoneId: 'SUD_EST', conferenceId: 'CONF_SUD_EST', coordinates: [5, 46] },
      { id: 'b', name: 'Ville B', population: 3000, departmentId: '01', regionId: '84', zoneId: 'SUD_EST', conferenceId: 'CONF_SUD_EST', coordinates: [5.1, 46] },
    ],
  }
  const clubs = buildClubsFromCommunes(dataset.communes).map((c, i) => ({ ...c, strength: i === 0 ? 10 : 16, baseStrength: i === 0 ? 10 : 16 }))
  const persons: Person[] = Array.from({ length: 300 }, (_, i) => ({
    id: `p${i}`, firstName: 'Alex', lastName: `Martin ${i}`, age: 24, nationality: 'FR',
    birthCommuneId: 'a', birthCommuneName: 'Ville A', birthDepartmentId: '01',
    currentClubId: clubs[0].id, parentClubId: clubs[0].id, primaryRole: 'PLAYER',
    position: 'ATTACKER', attack: 18, defense: 8, peakAttack: 22, peakDefense: 10,
    peakAge: 28, careerYears: 5, careerHistory: [],
  }))
  let saved: CupSession = {
    id: 'active', seed: 'tournoi-2026', seasonYear: 2026, datasetVersion: dataset.version,
    activeTeamIds: [clubs[0].id], roundNumber: 14, round: { matches: [], byeTeamIds: [] },
    results: {}, history: [], championId: clubs[0].id, clubs, persons,
  }
  let completed: SeasonArchive | undefined
  const repository: CupRepository = {
    load: async () => saved, save: async next => { saved = next }, clear: async () => {},
    loadArchives: async () => [],
    commitSeasonTransition: async (archive, next) => { completed = archive; saved = next },
  }
  function Probe() {
    const app = useCupApp()
    return <button disabled={!app.ready} onClick={() => void app.advanceToNextSeason()}>Saison {app.session?.seasonYear}</button>
  }
  render(<CupAppProvider repository={repository} loadDataset={async () => dataset}><Probe /></CupAppProvider>)
  await waitFor(() => expect(screen.getByRole('button', { name: 'Saison 2026' })).toBeEnabled())
  fireEvent.click(screen.getByRole('button', { name: 'Saison 2026' }))
  expect(await screen.findByRole('button', { name: 'Saison 2027' })).toBeEnabled()
  expect(saved.transferMovements).toBeDefined()
  expect(saved.transferMovements!.length).toBeGreaterThan(0)
  expect(saved.transferMovements!.some(m => m.kind === 'TRANSFER')).toBe(true)
  expect(saved.transferMovements!.every(m => m.seasonYear === 2027)).toBe(true)
  expect(completed?.year).toBe(2026)
  expect(completed?.transferMovements).toBeUndefined()
  for (const movement of saved.transferMovements!.filter(m => m.kind === 'TRANSFER')) {
    const player = saved.persons!.find(p => p.id === movement.personId)!
    expect(player.parentClubId).toBe(movement.toClubId)
    expect(player.currentClubId).toBe(movement.toClubId)
    expect(player.careerHistory?.at(-1)?.year).toBe(2026)
    expect(player.careerHistory?.at(-1)?.clubId).toBe(clubs[0].id)
  }
})
