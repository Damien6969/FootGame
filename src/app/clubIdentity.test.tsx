import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { expect, it } from 'vitest'
import fixture from '../test/fixtures/communes.fixture.json'
import { CupAppProvider, useCupApp } from './CupAppContext'
import { ClubIdentityEditor } from '../features/teams/ClubIdentityEditor'
import { parseGeography } from '../features/geography/loadGeography'
import { buildClubsFromCommunes } from '../features/teams/clubGenerator'
import type { CupSession } from '../features/storage/cupRepository'

it.each([false, true])('persists identity with an existing career: %s and refreshes the displayed club', async existing => {
  const dataset = parseGeography(fixture)
  const clubs = buildClubsFromCommunes(dataset.communes)
  const history: CupSession['history'] = []
  let saved: CupSession | undefined = existing ? {
    id: 'active', seed: 'tournoi-2026', seasonYear: 2026, datasetVersion: dataset.version,
    clubs, history, results: {}, roundNumber: 1, activeTeamIds: clubs.map(c => c.id),
    round: { matches: [], byeTeamIds: clubs.map(c => c.id) },
  } : undefined
  function Probe() {
    const app = useCupApp()
    if (!app.ready) return <div>Chargement</div>
    return <><div>Logo courant : {app.clubs[0].identity?.logo ?? 'aucun'}</div>
      <ClubIdentityEditor club={app.clubs[0]} onSave={identity => app.updateClubIdentity!(app.clubs[0].id, identity)} /></>
  }
  render(<CupAppProvider loadDataset={async () => dataset} repository={{
    load: async () => saved, save: async session => { saved = session }, clear: async () => {},
  }}><Probe /></CupAppProvider>)
  fireEvent.click(await screen.findByRole('button', { name: 'Personnaliser le club' }))
  fireEvent.click(screen.getByRole('button', { name: 'Écusson Étoile' }))
  fireEvent.click(screen.getByRole('button', { name: 'Enregistrer l’identité' }))
  expect(await screen.findByText('Logo courant : /club-logos/etoile.svg')).toBeVisible()
  await waitFor(() => expect(saved?.clubs?.[0].identity?.logo).toBe('/club-logos/etoile.svg'))
  expect(saved?.clubs?.length).toBe(clubs.length)
  if (existing) expect(saved?.history).toBe(history)
})
