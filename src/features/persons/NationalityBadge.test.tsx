import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { NationalityBadge } from './NationalityBadge'

describe('drapeaux des personnes', () => {
  it('affiche les deux vrais drapeaux et des libellés accessibles', () => {
    const { container } = render(<NationalityBadge person={{ nationality: 'FR', secondNationality: 'DZ' }} />)
    expect(screen.getByRole('img', { name: 'Nationalités : France et Algérie' })).toBeInTheDocument()
    expect([...container.querySelectorAll('img')].map(i => i.getAttribute('src'))).toEqual(['/flags/fr.svg', '/flags/dz.svg'])
  })
  it('préserve une nationalité ancienne sans afficher le drapeau français par défaut', () => {
    const { container } = render(<NationalityBadge compact person={{ nationality: 'AR' }} />)
    expect(screen.getByRole('img', { name: 'Nationalité : Argentine' })).toBeInTheDocument()
    expect(container.querySelector('img')).toBeNull()
    expect(screen.getByText('AR')).toBeInTheDocument()
  })
})
