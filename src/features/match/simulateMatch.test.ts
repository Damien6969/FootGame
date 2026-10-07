import { describe, expect, it } from 'vitest'
import { computeStrength, computeEffectiveStrength, simulateMatch, isMatchUpset } from './simulateMatch'

describe('simulateMatch', () => {
  const input = {
    matchId: '2026:D1:01:1', rootSeed: 'demo',
    home: { id: '75056', population: 2_100_000 },
    away: { id: '01001', population: 1_000 },
    populationBounds: { min: 1_000, max: 2_100_000 },
  }

  it('is deterministic and always returns a winner', () => {
    expect(simulateMatch(input)).toEqual(simulateMatch(input))
    expect(['75056', '01001']).toContain(simulateMatch(input).winnerId)
  })

  it('maps population to a strength between 1 and 30', () => {
    expect(computeStrength(1_000, 1_000, 2_100_000)).toBe(1)
    expect(computeStrength(2_100_000, 1_000, 2_100_000)).toBe(30)
  })

  it('tracks isExtraTime boolean property deterministically', () => {
    const res = simulateMatch(input)
    expect(typeof res.isExtraTime).toBe('boolean')
  })

  it('detects upsets when underdog defeats significantly stronger team', () => {
    const strong = { id: 'strong', population: 100_000, strength: 22.0 }
    const underdog = { id: 'underdog', population: 2_000, strength: 8.0 }

    // When underdog wins
    const upsetResult = {
      matchId: 'm1',
      homeScore: 1,
      awayScore: 2,
      winnerId: 'underdog',
      events: [],
    }
    expect(isMatchUpset(strong, underdog, upsetResult)).toBe(true)

    // When favorite wins
    const normalResult = {
      matchId: 'm2',
      homeScore: 3,
      awayScore: 0,
      winnerId: 'strong',
      events: [],
    }
    expect(isMatchUpset(strong, underdog, normalResult)).toBe(false)
  })

  describe('computeEffectiveStrength', () => {
    it('deducts 1.5 points when both positions are empty, including missing roster input', () => {
      expect(computeEffectiveStrength(20)).toBe(18.5)
      expect(computeEffectiveStrength(20, null)).toBe(18.5)
      expect(computeEffectiveStrength(20, {})).toBe(18.5)
      expect(computeEffectiveStrength(20, { attacker: null, defender: null })).toBe(18.5)
    })

    it('deducts 0.5 points for either missing position while tolerating a slightly weaker starter', () => {
      const player = { id: 'p1', attack: 18, defense: 18 }
      expect(computeEffectiveStrength(20, { attacker: player })).toBe(19.7)
      expect(computeEffectiveStrength(20, { defender: player })).toBe(19.7)
      expect(computeEffectiveStrength(20, { attacker: player, defender: { ...player, id: 'p2' } })).toBe(20.3)
    })

    it('disables all roster adjustments when player influence is explicitly zero', () => {
      const player = { id: 'p1', attack: 30, defense: 30 }
      expect(computeEffectiveStrength(20, undefined, 0)).toBe(20)
      expect(computeEffectiveStrength(20, { attacker: player }, 0)).toBe(20)
      expect(computeEffectiveStrength(20, { attacker: player, defender: { ...player, id: 'p2' } }, 0)).toBe(20)
    })

    it('combines an elite starter bonus with the missing defender penalty', () => {
      const starters = {
        attacker: { id: 'p1', attack: 30, defense: 30 },
        defender: null,
      }
      const eff = computeEffectiveStrength(5.3, starters)
      // 5.3 + 0.35 + (30 - 5.3) * 0.35 - 0.5 = 13.795 -> 13.8
      expect(eff).toBe(13.8)
    })

    it('applies independent additive contributions when both starters are present', () => {
      const starters = {
        attacker: { id: 'p1', attack: 28, defense: 16 }, // direct attack stat 28: 0.35 + (28 - 20) * 0.35 = 3.15
        defender: { id: 'p2', attack: 12, defense: 24 }, // direct defense stat 24: 0.35 + (24 - 20) * 0.35 = 1.75
      }
      const eff = computeEffectiveStrength(20, starters)
      // 20 + 3.15 + 1.75 = 24.9
      expect(eff).toBe(24.9)
    })

    it('is non-punitive when a player is slightly weaker than base strength (margin of 3 points)', () => {
      // Base strength = 20, player rating = 18 (diff: -2, within 3pt margin -> small positive basePart)
      const startersWithinMargin = {
        attacker: { id: 'p1', attack: 18, defense: 18 },
        defender: null,
      }
      expect(computeEffectiveStrength(20, startersWithinMargin)).toBe(19.7)

      // Base strength = 20, player rating = 12 (diff: -8, deficit beyond 3 is 5 -> malus = -5 * 0.20 * 0.20 = -0.2)
      const startersBeyondMargin = {
        attacker: { id: 'p1', attack: 12, defense: 12 },
        defender: null,
      }
      expect(computeEffectiveStrength(20, startersBeyondMargin)).toBe(18.8)
    })

    it('enforces minimum strength floor of 1 and allows exceeding 30 with starters or alliances', () => {
      expect(computeEffectiveStrength(1)).toBe(1)
      expect(computeEffectiveStrength(2)).toBe(1)
      expect(computeEffectiveStrength(30, { attacker: { id: 'p1', attack: 30, defense: 30 }, defender: { id: 'p2', attack: 30, defense: 30 } })).toBeGreaterThan(30)
      expect(computeStrength(3_000_000, 1_000, 2_100_000)).toBeGreaterThan(30)
      expect(computeEffectiveStrength(1, { attacker: { id: 'p1', attack: 1, defense: 1 } })).toBeGreaterThanOrEqual(1)
    })
  })

  describe('simulateMatch with starters and event attribution', () => {
    it('applies roster penalties once from the territorial base rather than the displayed strength', () => {
      const result = simulateMatch({
        ...input,
        home: { id: 'home', population: 10000, baseStrength: 20, strength: 19.5 },
        away: { id: 'away', population: 10000, baseStrength: 20, strength: 18.5 },
        homeStarters: { attacker: { id: 'p1', attack: 18, defense: 18 } },
      })
      expect(result.homeEffectiveStrength).toBe(19.7)
      expect(result.awayEffectiveStrength).toBe(18.5)
    })

    it('enriches match result and events with player names and details', () => {
      const matchWithStarters = {
        ...input,
        homeStarters: {
          attacker: { id: 'p-kylian', name: 'Kylian Mbappé', attack: 29, defense: 12 },
          defender: { id: 'p-marquinhos', name: 'Marquinhos', attack: 10, defense: 28 },
        },
        awayStarters: {
          attacker: { id: 'p-alex', name: 'Alexandre Lacazette', attack: 24, defense: 10 },
          defender: { id: 'p-anthony', name: 'Anthony Lopes', attack: 8, defense: 25 },
        },
      }

      const res = simulateMatch(matchWithStarters)
      expect(res.homeEffectiveStrength).toBeDefined()
      expect(res.awayEffectiveStrength).toBeDefined()
      expect(res.events.length).toBeGreaterThan(0)

      // Check event structure
      const firstEvent = res.events[0]
      expect(firstEvent.sequence).toBe(1)
      expect(firstEvent.detail).toBeDefined()

      // At least some events have actor or defender attribution
      const eventsWithActors = res.events.filter((e) => e.actorName !== undefined || e.defenderName !== undefined)
      expect(eventsWithActors.length).toBeGreaterThan(0)
    })

    it('accurately identifies player scorers and defensive stops', () => {
      // Run multiple simulations to verify occurrence of player goals and stops
      let foundPlayerGoal = false
      let foundDefenderStop = false

      for (let i = 0; i < 10; i++) {
        const res = simulateMatch({
          ...input,
          matchId: `test-seed-${i}`,
          homeStarters: {
            attacker: { id: 'p-att', name: 'Attaquant Star', attack: 30, defense: 10 },
            defender: { id: 'p-def', name: 'Défenseur Roc', attack: 8, defense: 30 },
          },
          awayStarters: {
            attacker: { id: 'p-away-att', name: 'Attaquant Adverse', attack: 28, defense: 10 },
            defender: { id: 'p-away-def', name: 'Défenseur Adverse', attack: 8, defense: 28 },
          },
        })

        for (const ev of res.events) {
          if (ev.kind === 'GOAL' && ev.actorName) foundPlayerGoal = true
          if (ev.kind === 'CHANCE' && ev.defenderName) foundDefenderStop = true
        }
      }

      expect(foundPlayerGoal).toBe(true)
      expect(foundDefenderStop).toBe(true)
    })
  })
})
