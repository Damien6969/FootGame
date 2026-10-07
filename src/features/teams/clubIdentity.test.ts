import { describe, expect, it } from 'vitest'
import { contrastRatio, getClubIdentity, identityStyle, isClubIdentity } from './clubIdentity'

describe('club identity contrast and compatibility', () => {
  it.each(['#ffffff', '#000000', '#ff0000', '#ffff00', '#777777', '#123456'])('keeps lettering readable on %s', color => {
    const style = identityStyle({ primaryColor: color, secondaryColor: color })
    expect(contrastRatio(color, style['--club-on-primary'])).toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio(color, style['--club-on-secondary'])).toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio('#131d33', style['--club-accent'])).toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio(style['--club-surface'], style['--club-accent'])).toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio(style['--club-surface'], '#94a3b8')).toBeGreaterThanOrEqual(4.5)
  })

  it('uses a stable fallback for old clubs and invalid stored colors', () => {
    const club = { id: '01001', name: 'Club test' }
    const renamed = { ...club, name: 'Renommé' }
    expect(getClubIdentity(club)).toEqual(getClubIdentity(renamed))
    expect(getClubIdentity({ ...club, identity: { primaryColor: 'red', secondaryColor: 'bad' } })).toEqual(getClubIdentity(club))
  })

  it('rejects remote URLs, SVG uploads and oversized logos in backups', () => {
    const colors = { primaryColor: '#123456', secondaryColor: '#ffffff' }
    expect(isClubIdentity(colors)).toBe(true)
    expect(isClubIdentity({ ...colors, logo: '/club-logos/etoile.svg' })).toBe(true)
    for (const logo of ['https://example.com/logo.png', 'data:image/svg+xml;base64,PHN2Zz4=', 'data:image/png;base64,' + 'A'.repeat(400_001)]) {
      expect(isClubIdentity({ ...colors, logo })).toBe(false)
    }
  })
})
