import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseGeography } from '../geography/loadGeography'
import { simulateMatch } from '../match/simulateMatch'
import { createPhaseRound } from './competition'

describe('full edition', () => {
  it('reduces the official dataset to one deterministic champion', () => {
    const dataset = parseGeography(JSON.parse(readFileSync('public/data/communes.json', 'utf8')))
    const byId = new Map(dataset.communes.map((team) => [team.id, team]))
    const bounds = { min: Math.min(...dataset.communes.map((team) => team.population)), max: Math.max(...dataset.communes.map((team) => team.population)) }
    for (const testSeed of ['acceptance-2026', 'edition-2027', 'seed-xyz', 'random-alpha', 'coupe-france']) {
      let active = dataset.communes.map((team) => team.id)
      let roundNumber = 1
      while (active.length > 1 && roundNumber < 30) {
        const round = createPhaseRound(active.map((id) => byId.get(id)!), testSeed, roundNumber)
        if (roundNumber <= 4 && active.includes('75056')) {
          expect(round.matches.some((match) =>
            match.homeTeamId === '75056' || match.awayTeamId === '75056',
          )).toBe(true)
        }
        if (roundNumber === 5) expect(active).toHaveLength(1024)
        if (active.length <= 1024) {
          expect(round.byeTeamIds).toHaveLength(0)
        }
        if (roundNumber === 9) {
          const byConf: Record<string, number> = {}
          for (const id of active) {
            const t = byId.get(id)!
            byConf[t.conferenceId ?? 'unknown'] = (byConf[t.conferenceId ?? 'unknown'] || 0) + 1
          }
          expect(byConf['CONF_OUEST']).toBe(16)
          expect(byConf['CONF_NORD']).toBe(16)
          expect(byConf['CONF_SUD_OUEST']).toBe(16)
          expect(byConf['CONF_SUD_EST']).toBe(16)
        }
        const winners = round.matches.map((match) => simulateMatch({ matchId: match.id, rootSeed: testSeed, home: byId.get(match.homeTeamId)!, away: byId.get(match.awayTeamId)!, populationBounds: bounds }).winnerId)
        active = [...round.byeTeamIds, ...winners]
        roundNumber += 1
      }
      expect(active).toHaveLength(1)
    }
  })
})
