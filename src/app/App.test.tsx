import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

describe('application shell', () => {
  it('shows the cup identity and primary navigation', async () => {
    document.body.innerHTML = '<div id="app"></div>'

    await import('../main')

    expect(await screen.findByRole('heading', { name: 'Coupe des communes' })).toBeVisible()
    expect(screen.getByRole('navigation', { name: 'Navigation principale' })).toBeVisible()
    expect(screen.getByRole('link', { name: 'Équipes' })).toHaveAttribute('href', '/equipes')
    expect(screen.getByRole('link', { name: 'Villes' })).toHaveAttribute('href', '/villes')
    expect(screen.getByRole('link', { name: 'Personnalités' })).toHaveAttribute('href', '/personnes')
    expect(screen.getByRole('link', { name: 'Transferts' })).toHaveAttribute('href', '/transferts')
    expect(screen.getByRole('button', { name: 'Réinitialiser la Coupe et l\'historique' })).toBeVisible()
  })
})
