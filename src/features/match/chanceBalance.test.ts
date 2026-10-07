import { describe, expect, it } from 'vitest'
import { simulateMatch } from './simulateMatch'

function sample(attack: number | null, homeBase = 25, awayBase = 25, defense: number | null = null) {
  let shots = 0, goals = 0, chances = 0, misses = 0, stops = 0, homeWins = 0
  for (let i = 0; i < 2000; i++) {
    const result = simulateMatch({
      matchId: `balance-${i}`, rootSeed: 'chance-balance',
      home: { id: 'home', population: 10000, baseStrength: homeBase },
      away: { id: 'away', population: 10000, baseStrength: awayBase },
      homeStarters: attack === null ? undefined : { attacker: { id: 'shooter', attack, defense: 3 } },
      awayStarters: defense === null ? undefined : { defender: { id: 'stopper', attack: 3, defense } },
      populationBounds: { min: 1000, max: 100000 },
    })
    if (result.winnerId === 'home') homeWins++
    expect(result.homeScore).toBe(result.events.filter(e => e.teamId === 'home' && e.kind === 'GOAL').length)
    expect(result.awayScore).toBe(result.events.filter(e => e.teamId === 'away' && e.kind === 'GOAL').length)
    for (const event of result.events) {
      if (event.shotOutcome === 'OFF_TARGET') expect(event.defenderId).toBeUndefined()
      if (event.teamId !== 'home' || event.isExtraTime) continue
      chances++
      if (event.actorId === 'shooter') {
        shots++
        if (event.kind === 'GOAL') goals++
      }
      if (event.kind === 'CHANCE') {
        misses++
        if (event.defenderId) stops++
      }
    }
  }
  return { shots, goals, chances, misses, stops, homeWins, conversion: goals / shots }
}

describe('player and collective chance balance', () => {
  it('leaves most chances to the collective when the striker is much weaker than his club', () => {
    const weak = sample(8)
    const matched = sample(25)
    expect(weak.shots / weak.chances).toBeLessThan(0.3)
    expect(matched.shots / matched.chances).toBeGreaterThan(0.5)
    expect(matched.shots / matched.chances).toBeLessThan(0.9)
    expect(matched.conversion).toBeGreaterThan(weak.conversion * 1.5)
  })

  it('lets the same modest striker convert more shots against weaker opposition', () => {
    const strongOpposition = sample(8, 25, 25)
    const weakOpposition = sample(8, 25, 5)
    expect(weakOpposition.conversion).toBeGreaterThan(strongOpposition.conversion * 1.5)
  })

  it('makes the defending player affect shot success and distinguishes stops from misses', () => {
    const weak = sample(20, 20, 20, 5)
    const strong = sample(20, 20, 20, 30)
    expect(weak.conversion).toBeGreaterThan(strong.conversion * 1.2)
    expect(strong.stops / strong.misses).toBeGreaterThan(weak.stops / weak.misses)
    expect(strong.stops / strong.misses).toBeLessThan(0.8)
  })

  it('keeps clubs without named players competitive and unattributed', () => {
    const equal = sample(null, 20, 20)
    expect(equal.homeWins / 2000).toBeGreaterThan(0.45)
    expect(equal.homeWins / 2000).toBeLessThan(0.55)
    const stronger = sample(null, 25, 15)
    expect(stronger.homeWins).toBeGreaterThan(equal.homeWins)
    expect(equal.shots).toBe(0)
    expect(equal.chances).toBeGreaterThan(0)
  })

  it('gives an excellent striker in a small club a large but bounded share of chances', () => {
    const elite = sample(30, 10, 25)
    expect(elite.shots / elite.chances).toBeGreaterThan(0.7)
    expect(elite.shots / elite.chances).toBeLessThan(0.9)
    expect(elite.conversion).toBeGreaterThan(sample(8, 10, 25).conversion)
  })
})
