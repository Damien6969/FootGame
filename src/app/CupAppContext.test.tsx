import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import fixture from '../test/fixtures/communes.fixture.json'
import { parseGeography } from '../features/geography/loadGeography'
import { CupAppProvider, useCupApp } from './CupAppContext'
import type { CupRepository, CupSession, SeasonArchive } from '../features/storage/cupRepository'
import { buildClubsFromCommunes } from '../features/teams/clubGenerator'
import type { Person } from '../features/persons/types'
import { getClubActiveStarters } from '../features/persons/personSelectors'
import { simulateMatch } from '../features/match/simulateMatch'

it('starts a career from archive summaries without reading full histories', async () => {
  const summary: SeasonArchive = {
    year: 2026, seed: 'test', completedAt: '2026-06-01', datasetVersion: 'test',
    nationalChampionId: 'a', conferenceChampions: {}, finalFourTeamIds: ['a'],
    totalMatches: 10000, teamPerformances: {}, history: [], summaryOnly: true,
  }
  const loadArchives = vi.fn(async () => { throw new Error('Full archives loaded') })
  const repository: CupRepository = {
    load: async () => undefined,
    save: async () => {},
    clear: async () => {},
    loadArchives,
    loadArchiveSummaries: async () => [summary],
  }
  function Probe() {
    const { ready, error, archives } = useCupApp()
    return <div>{ready ? `${archives.length} archive résumée` : 'Chargement'}{error}</div>
  }

  render(<CupAppProvider loadDataset={async () => parseGeography(fixture)} repository={repository}><Probe /></CupAppProvider>)

  expect(await screen.findByText('1 archive résumée')).toBeVisible()
  expect(loadArchives).not.toHaveBeenCalled()
})

it('refreshes saved club strengths on load and reload without changing completed matches or archived clubs', async () => {
  const dataset = parseGeography(fixture)
  const baseClub = buildClubsFromCommunes(dataset.communes)[0]
  const clubs = ['complete', 'partial', 'empty'].map(id => ({ ...baseClub, id, baseStrength: 20, strength: 20 }))
  const persons: Person[] = Array.from({ length: 300 }, (_, i) => ({
    id: `p-${i}`, firstName: 'Alex', lastName: `Martin ${i}`, age: 25, nationality: 'FR',
    birthCommuneId: clubs[0].communeId, birthCommuneName: clubs[0].communeName,
    birthDepartmentId: clubs[0].departmentId, currentClubId: null, parentClubId: null,
    primaryRole: 'PLAYER', position: i === 1 ? 'DEFENDER' : 'ATTACKER', attack: 18, defense: 18, careerYears: 3,
  }))
  persons[0] = { ...persons[0], currentClubId: clubs[0].id, parentClubId: clubs[0].id }
  persons[1] = { ...persons[1], currentClubId: clubs[0].id, parentClubId: clubs[0].id }
  persons[2] = { ...persons[2], currentClubId: clubs[1].id, parentClubId: clubs[1].id }
  const result = { matchId: 'played', homeScore: 1, awayScore: 0, winnerId: clubs[0].id, events: [], homeEffectiveStrength: 20, awayEffectiveStrength: 20 }
  let saved: CupSession = {
    id: 'active', seed: 'test', seasonYear: 2026, datasetVersion: dataset.version,
    activeTeamIds: clubs.map(c => c.id), roundNumber: 1, round: { matches: [], byeTeamIds: [] },
    results: { played: result }, history: [{ homeTeamId: clubs[0].id, awayTeamId: clubs[1].id, roundNumber: 1, result }], clubs, persons,
  }
  const originalHistory = saved.history
  const summary: SeasonArchive = {
    year: 2025, seed: 'test', completedAt: '2025-06-01', datasetVersion: dataset.version,
    nationalChampionId: clubs[0].id, conferenceChampions: {}, finalFourTeamIds: [],
    totalMatches: 0, teamPerformances: {}, history: [], clubs, summaryOnly: true,
  }
  const repository: CupRepository = {
    load: async () => saved, save: async next => { saved = next }, clear: async () => {},
    loadArchiveSummaries: async () => [summary],
  }
  function Probe() {
    const app = useCupApp()
    if (!app.ready) return <div>Chargement</div>
    return <>
      <div>Forces : {app.clubs.map(c => c.strength).join(', ')}</div>
      <div>Archive : {app.archives[0].clubs!.map(c => c.strength).join(', ')}</div>
      <button onClick={() => void app.reloadSession()}>Recharger</button>
    </>
  }
  render(<CupAppProvider repository={repository} loadDataset={async () => dataset}><Probe /></CupAppProvider>)
  expect(await screen.findByText('Forces : 20.3, 19.7, 18.5')).toBeVisible()
  expect(screen.getByText('Archive : 20, 20, 20')).toBeVisible()
  expect(saved.clubs!.map(c => c.strength)).toEqual([20.3, 19.7, 18.5])
  expect(saved.history).toBe(originalHistory)
  expect(saved.results.played).toBe(result)

  // Reload also follows imports, which can restore club strengths from the old rules.
  saved = { ...saved, clubs }
  fireEvent.click(screen.getByRole('button', { name: 'Recharger' }))
  await waitFor(() => expect(saved.clubs!.map(c => c.strength)).toEqual([20.3, 19.7, 18.5]))
  expect(screen.getByText('Forces : 20.3, 19.7, 18.5')).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: 'Recharger' }))
  await waitFor(() => expect(saved.clubs!.map(c => c.strength)).toEqual([20.3, 19.7, 18.5]))
  expect(saved.history).toBe(originalHistory)
})

it.each([
  { label: 'empty', persons: [] as Person[] },
  { label: 'missing', persons: undefined },
])('persists generated rosters for a $label saved player pool so displayed and simulated strengths agree', async ({ persons }) => {
  const dataset = parseGeography(fixture)
  const clubs = buildClubsFromCommunes(dataset.communes).map(c => ({ ...c, strength: 20, baseStrength: 20 }))
  let saved: CupSession = {
    id: 'active', seed: 'legacy-roster', seasonYear: 2026, datasetVersion: dataset.version,
    activeTeamIds: clubs.map(c => c.id), roundNumber: 1, round: { matches: [], byeTeamIds: [] },
    results: {}, history: [], clubs, persons,
  }
  const repository: CupRepository = {
    load: async () => saved, save: async next => { saved = next }, clear: async () => {},
  }
  function Probe() {
    const app = useCupApp()
    return <div>{app.ready && app.session?.persons?.some(p => p.currentClubId) ? 'Effectif enregistré' : 'Chargement'}</div>
  }
  render(<CupAppProvider repository={repository} loadDataset={async () => dataset}><Probe /></CupAppProvider>)
  expect(await screen.findByText('Effectif enregistré')).toBeVisible()
  const [home, away] = saved.clubs!
  const bounds = { min: Math.min(...dataset.communes.map(c => c.population)), max: Math.max(...dataset.communes.map(c => c.population)) }
  const result = simulateMatch({
    matchId: 'legacy-test', rootSeed: saved.seed, home, away, populationBounds: bounds,
    homeStarters: getClubActiveStarters(saved.persons!, home.id),
    awayStarters: getClubActiveStarters(saved.persons!, away.id),
  })
  expect(result.homeEffectiveStrength).toBe(home.strength)
  expect(result.awayEffectiveStrength).toBe(away.strength)
  expect(saved.results).toEqual({})
  expect(saved.history).toEqual([])
})
