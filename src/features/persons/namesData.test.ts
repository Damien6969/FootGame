import { describe, it, expect } from 'vitest'
import { generatePersonName, getFirstNameDistribution } from './namesData'
import { createPrng } from '../random/prng'

const sample = (region: string, count = 10000) => {
  const rng = createPrng('identity-audit')
  return Array.from({ length: count }, () => generatePersonName({ rng, birthRegionId: region, birthYear: 2005 }))
}
describe('identités locales et reproductibles', () => {
  it('suit la cohorte de naissance, avec un repli stable pour les années futures', () => {
    const older = getFirstNameDistribution({ birthYear: 1995, birthRegionId: '11' })
    const recent = getFirstNameDistribution({ birthYear: 2024, birthRegionId: '11' })
    const weight = (pool: typeof older, name: string) => pool.find(n => n.name === name)?.weight ?? 0
    expect(weight(older, 'Kévin')).toBeGreaterThan(weight(recent, 'Kévin'))
    expect(weight(recent, 'Gabriel')).toBeGreaterThan(weight(older, 'Gabriel'))
    expect(getFirstNameDistribution({ birthYear: 2050, birthRegionId: '11' })).toEqual(recent)
    expect(getFirstNameDistribution({ birthYear: 2005, birthRegionId: 'inconnue' }).length).toBeGreaterThan(500)
  })
  it('utilise les fréquences régionales sans transformer le prénom en nationalité', () => {
    const breton = getFirstNameDistribution({ birthYear: 2005, birthDepartmentId: '29' })
    const paris = getFirstNameDistribution({ birthYear: 2005, birthRegionId: '11' })
    const share = (pool: typeof breton, name: string) => (pool.find(n => n.name === name)?.weight ?? 0) / pool.reduce((sum, n) => sum + n.weight, 0)
    expect(share(breton, 'Erwan')).toBeGreaterThan(share(paris, 'Erwan'))
    expect(paris.some(n => n.name === 'Mohamed')).toBe(true)
  })
  it('reste déterministe et majoritairement français, avec des doubles nationalités', () => {
    const people = sample('11')
    expect(sample('11', 100)).toEqual(people.slice(0, 100))
    expect(people.filter(p => p.nationality === 'FR').length / people.length).toBeGreaterThan(.95)
    expect(people.filter(p => p.secondNationality).length / people.length).toBeGreaterThan(.09)
    expect(people.filter(p => p.secondNationality).length / people.length).toBeLessThan(.15)
    expect(new Set(people.map(p => p.firstName)).size).toBeGreaterThan(300)
    for (const p of people) {
      expect(p.firstName.trim().length).toBeGreaterThan(1)
      expect(p.lastName.trim().length).toBeGreaterThan(1)
      expect(p.nationality).toMatch(/^[A-Z]{2}$/)
      if (p.secondNationality) expect(p.secondNationality).not.toBe(p.nationality)
    }
  })
  it('renforce les profils allemands dans l’Est et espagnols dans le Sud', () => {
    const east = sample('44'), south = sample('76'), centre = sample('24')
    const citizenshipCount = (people: typeof east, country: string) => people.filter(p => p.nationality === country || p.secondNationality === country).length
    expect(citizenshipCount(east, 'DE')).toBeGreaterThan(citizenshipCount(centre, 'DE') * 2)
    expect(citizenshipCount(south, 'ES')).toBeGreaterThan(citizenshipCount(centre, 'ES') * 2)
  })
})
