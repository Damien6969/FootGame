import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { CupAppProvider, useOptionalCupApp } from '../../app/CupAppContext'
import type { GeographyDataset } from '../geography/types'
import type { CupSession } from '../storage/cupRepository'
import { player, club, match, finishedSession } from './awards.fixture'

it('freezes the awards when the final session is saved and preserves season club names on subsequent saves', async () => {
  const p = player('winner', 'a')
  const final = finishedSession([p], [0, 1, 2].map(i => match(`m${i}`, [p])))
  let saved: CupSession = { ...final, championId: undefined, history: [] }
  const dataset: GeographyDataset = { version: 'test', sourceLabel: 'Fixture', sourceUrl: 'https://example.com',
    communes: [{ id: 'a', name: 'A', population: 1000, departmentId: '01', regionId: '53', zoneId: 'OUEST', conferenceId: 'CONF_OUEST' }] }
  const repository = { load: async () => saved, save: vi.fn(async (session: CupSession) => { saved = session }), clear: async () => {} }
  function Probe() {
    const app = useOptionalCupApp()
    return <>
      <button disabled={!app?.ready} onClick={() => void app?.persistSession(final)}>Finale</button>
      <button onClick={() => void app?.persistSession({ ...saved, clubs: [{ ...club('a'), name: 'Nouveau nom' }] })}>Renommer</button>
      <output>{app?.session?.individualAwards ? 'Trophées archivables' : 'En cours'}</output>
    </>
  }
  render(<CupAppProvider repository={repository} loadDataset={async () => dataset}><Probe /></CupAppProvider>)
  await waitFor(() => expect(screen.getByRole('button', { name: 'Finale' })).toBeEnabled())
  fireEvent.click(screen.getByRole('button', { name: 'Finale' }))
  await screen.findByText('Trophées archivables', {}, { timeout: 10000 })
  const snapshot = saved.individualAwards!
  expect(snapshot.awards.at(-1)!.winners[0].personId).toBe(p.id)
  fireEvent.click(screen.getByRole('button', { name: 'Renommer' }))
  await waitFor(() => expect(saved.clubs?.[0].name).toBe('Nouveau nom'))
  expect(saved.individualAwards).toBe(snapshot)
  expect(snapshot.awards.at(-1)!.winners[0].clubName).toBe('Club a')
})
