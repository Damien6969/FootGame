import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import fixture from '../../test/fixtures/communes.fixture.json'
import { parseGeography } from '../geography/loadGeography'
import { TeamsPage } from './TeamsPage'
import { MemoryRouter } from 'react-router-dom'

describe('TeamsPage', () => {
  it('lists loaded communes', async () => {
    render(<MemoryRouter><TeamsPage loadDataset={async () => parseGeography(fixture)} /></MemoryRouter>)
    expect(await screen.findByText('Ambérieu-en-Bugey')).toBeVisible()
    expect(screen.getByText('Ambérieux-en-Dombes')).toBeVisible()
  })

  it('honors statut query parameter from URL', async () => {
    render(
      <MemoryRouter initialEntries={['/equipes?statut=favorites']}>
        <TeamsPage loadDataset={async () => parseGeography(fixture)} />
      </MemoryRouter>
    )
    const favButton = await screen.findByRole('button', { name: /⭐ Favoris/ })
    expect(favButton).toHaveClass('is-active')
  })
})
