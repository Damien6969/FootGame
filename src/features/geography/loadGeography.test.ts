import fixture from '../../test/fixtures/communes.fixture.json'
import { describe, expect, it } from 'vitest'
import { GeographyLoadError, parseGeography } from './loadGeography'

describe('parseGeography', () => {
  it('accepts a valid dataset and sorts communes by identifier', () => {
    const reversed = { ...fixture, communes: [...fixture.communes].reverse() }

    const dataset = parseGeography(reversed)

    expect(dataset.communes.map((commune) => commune.id)).toEqual(['01004', '01005'])
    expect(dataset.communes[0].conferenceId).toBe('CONF_SUD_EST')
  })

  it('rejects a commune below the population threshold', () => {
    const invalid = {
      ...fixture,
      communes: [{ ...fixture.communes[0], population: 999 }],
    }

    expect(() => parseGeography(invalid)).toThrowError(
      new GeographyLoadError('INVALID_SCHEMA', 'Population invalide pour la commune 01004.'),
    )
  })

  it('rejects duplicate commune identifiers', () => {
    const duplicate = {
      ...fixture,
      communes: [fixture.communes[0], fixture.communes[0]],
    }

    expect(() => parseGeography(duplicate)).toThrowError(
      new GeographyLoadError('DUPLICATE_ID', 'Identifiant de commune dupliqué : 01004.'),
    )
  })

  it('rejects a commune without a known territory', () => {
    const invalid = {
      ...fixture,
      communes: [{ ...fixture.communes[0], zoneId: '' }],
    }

    expect(() => parseGeography(invalid)).toThrowError(
      new GeographyLoadError('UNKNOWN_TERRITORY', 'Territoire manquant pour la commune 01004.'),
    )
  })

  it('reuses the cached dataset promise on subsequent calls', async () => {
    let callCount = 0
    const originalFetch = globalThis.fetch
    globalThis.fetch = (async () => {
      callCount++
      return {
        ok: true,
        json: async () => fixture,
      } as unknown as Response
    }) as typeof fetch

    try {
      const { loadGeography, clearGeographyCache } = await import('./loadGeography')
      clearGeographyCache()
      const data1 = await loadGeography()
      const data2 = await loadGeography()
      expect(callCount).toBe(1)
      expect(data1).toBe(data2)
      clearGeographyCache()
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})

