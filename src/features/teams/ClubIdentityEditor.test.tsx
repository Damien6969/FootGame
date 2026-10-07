import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { expect, it } from 'vitest'
import { ClubIdentityEditor } from './ClubIdentityEditor'
import { buildClubsFromCommunes } from './clubGenerator'
import { parseGeography } from '../geography/loadGeography'
import fixture from '../../test/fixtures/communes.fixture.json'

const club = buildClubsFromCommunes(parseGeography(fixture).communes)[0]

it('previews colors and a sample crest, then saves only on explicit submit', async () => {
  let saved: unknown
  render(<ClubIdentityEditor club={club} onSave={async identity => { saved = identity }} />)
  fireEvent.click(screen.getByRole('button', { name: /Personnaliser/ }))
  fireEvent.change(screen.getByLabelText('Code couleur principale'), { target: { value: '#ffffff' } })
  fireEvent.click(screen.getByRole('button', { name: /Écusson Étoile/ }))
  expect(screen.getByAltText('Logo du club')).toHaveAttribute('src', '/club-logos/etoile.svg')
  expect(saved).toBeUndefined()
  fireEvent.click(screen.getByRole('button', { name: 'Enregistrer l’identité' }))
  await screen.findByRole('status')
  expect(saved).toMatchObject({ primaryColor: '#ffffff', logo: '/club-logos/etoile.svg' })
})

it('keeps edits after a save failure and rejects unsupported imports', async () => {
  render(<ClubIdentityEditor club={club} onSave={async () => { throw new Error('Stockage indisponible') }} />)
  fireEvent.click(screen.getByRole('button', { name: /Personnaliser/ }))
  fireEvent.change(screen.getByLabelText(/Importer un logo/), { target: { files: [new File(['<svg/>'], 'logo.svg', { type: 'image/svg+xml' })] } })
  expect(await screen.findByRole('alert')).toHaveTextContent(/PNG, JPG ou WebP/)
  fireEvent.click(screen.getByRole('button', { name: 'Enregistrer l’identité' }))
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Stockage indisponible'))
  expect(screen.getByRole('button', { name: 'Enregistrer l’identité' })).toBeEnabled()
})
