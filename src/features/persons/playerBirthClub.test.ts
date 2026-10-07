import { describe, expect, it } from 'vitest'
import fixture from '../../test/fixtures/communes.fixture.json'
import { parseGeography } from '../geography/loadGeography'
import { buildClubsFromCommunes } from '../teams/clubGenerator'
import { advancePersonsSeason, assignClubForCommune, generateInitialPersonPool, replenishActivePersonsPool } from './personGenerator'

const communes = parseGeography(fixture).communes
const [city, neighbor] = communes
const [local, nearby] = buildClubsFromCommunes(communes)
const clubs = [
  { ...local, id: 'local-a' },
  { ...local, id: 'local-b' },
  { ...nearby, id: 'alliance', communeIds: [neighbor.id, city.id] },
  { ...nearby, id: 'unrelated', communeIds: [neighbor.id] },
]

describe('new player birth club', () => {
  it('draws fresh cities, clubs and positions even when every new player follows a retirement', () => {
    const veterans = generateInitialPersonPool({ communes: [city], clubs, count: 40,
      seed: 'retiring-cohort', assignRostersAndLoans: false,
    }).map(p => ({ ...p, age: 37, position: 'ATTACKER' as const,
      currentClubId: 'local-a', parentClubId: 'local-a' }))
    const people = advancePersonsSeason({ persons: veterans,
      communes: [{ ...city, population: 1 }, { ...neighbor, population: 1000000 }],
      clubs, seed: 'fresh-generation', seasonYear: 2038, newRecruitsCount: 40,
      assignRostersAndLoans: false,
    })
    const newPlayers = people.filter(p => p.careerYears === 0 && !p.isRetired)
    expect(newPlayers).toHaveLength(40)
    expect(people.filter(p => p.isRetired)).toHaveLength(40)
    expect(new Set(newPlayers.map(p => p.birthCommuneId))).toEqual(new Set([neighbor.id]))
    expect(new Set(newPlayers.map(p => p.originClubId))).toEqual(new Set(['alliance', 'unrelated']))
    expect(new Set(newPlayers.map(p => p.position))).toEqual(new Set(['ATTACKER', 'DEFENDER']))
  })
  it('gives each local club and affiliated alliance an equal interval in the club draw', () => {
    expect(assignClubForCommune(city, clubs, () => 0)).toBe('local-a')
    expect(assignClubForCommune(city, clubs, () => 0.34)).toBe('local-b')
    expect(assignClubForCommune(city, clubs, () => 0.99)).toBe('alliance')
  })

  it.each(['initial', 'interseason', 'replenishment'] as const)(
    'can generate players in every affiliated club through %s recruitment', mode => {
      const options = { communes: [city], clubs, seed: 'birth-club-verification', seasonYear: 2038 }
      const people = mode === 'initial'
        ? generateInitialPersonPool({ ...options, count: 120, assignRostersAndLoans: false })
        : mode === 'interseason'
          ? advancePersonsSeason({ ...options, persons: [], newRecruitsCount: 120, assignRostersAndLoans: false })
          : replenishActivePersonsPool({ ...options, persons: [], targetActiveCount: 120 })
      expect(people).toHaveLength(120)
      expect(new Set(people.map(p => p.birthCommuneId))).toEqual(new Set([city.id]))
      expect(new Set(people.map(p => p.originClubId))).toEqual(new Set(['local-a', 'local-b', 'alliance']))
      expect(people.some(p => p.originClubId === 'unrelated')).toBe(false)
    },
  )
})
