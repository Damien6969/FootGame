import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseGeography } from '../geography/loadGeography'
import { simulateMatch } from '../match/simulateMatch'
import { createPhaseRound } from './competition'
import { buildClubsFromCommunes } from '../teams/clubGenerator'
import { generateInitialPersonPool, advancePersonsSeason } from '../persons/personGenerator'
import { getClubActiveStarters, computeOverallRating } from '../persons/personSelectors'
import { buildSeasonArchive } from '../history/palmaresSelectors'
import { applyRostersStrengthToClubs } from '../persons/rosterAndLoans'
import { executeInterseasonTransition } from '../teams/interseasonEngine'
import type { CupSession, SeasonArchive } from '../storage/cupRepository'
import type { Club } from '../teams/types'
import type { Person } from '../persons/types'

describe('long term simulation balance (10 seasons)', () => {
  it('runs 10 consecutive seasons cleanly with balanced player pool, stats, and competition integrity', () => {
    const rawData = JSON.parse(readFileSync('public/data/communes.json', 'utf8'))
    const dataset = parseGeography(rawData)
    const bounds = {
      min: Math.min(...dataset.communes.map((c) => c.population)),
      max: Math.max(...dataset.communes.map((c) => c.population)),
    }

    let clubs: readonly Club[] = buildClubsFromCommunes(dataset.communes)
    let persons: Person[] = generateInitialPersonPool({
      count: 300,
      communes: dataset.communes,
      clubs,
      seed: 'seed-season-2026',
      assignRostersAndLoans: true,
    })

    const archives: SeasonArchive[] = []
    const championsHistory: string[] = []
    let communeNextIndex: Record<string, number> = {}
    const usedClubNames = new Set<string>(clubs.map((c) => c.name.toLowerCase()))

    for (let seasonIndex = 0; seasonIndex < 10; seasonIndex += 1) {
      const year = 2026 + seasonIndex
      const seasonSeed = `edition-${year}`

      // Apply rosters
      clubs = applyRostersStrengthToClubs(clubs, persons)
      const clubsById = new Map<string, Club>(clubs.map((c) => [c.id, c]))
      const startersByClubId = new Map<string, { attacker?: Person | null; defender?: Person | null }>()
      for (const p of persons) {
        if (p.currentClubId && !p.isRetired && !startersByClubId.has(p.currentClubId)) {
          startersByClubId.set(p.currentClubId, getClubActiveStarters(persons, p.currentClubId))
        }
      }

      let activeIds = clubs.map((c) => c.id)
      let roundNumber = 1
      const sessionHistory: any[] = []
      const results: Record<string, any> = {}

      while (activeIds.length > 1 && roundNumber <= 14) {
        const round = createPhaseRound(
          activeIds.map((id) => clubsById.get(id)!),
          seasonSeed,
          roundNumber,
        )

        for (const match of round.matches) {
          const res = simulateMatch({
            matchId: match.id,
            rootSeed: seasonSeed,
            home: clubsById.get(match.homeTeamId)!,
            away: clubsById.get(match.awayTeamId)!,
            populationBounds: bounds,
            homeStarters: startersByClubId.get(match.homeTeamId),
            awayStarters: startersByClubId.get(match.awayTeamId),
          })
          results[match.id] = res
          sessionHistory.push({
            roundNumber,
            homeTeamId: match.homeTeamId,
            awayTeamId: match.awayTeamId,
            result: res,
          })
        }

        const winners = round.matches.map((m) => results[m.id].winnerId)
        activeIds = [...round.byeTeamIds, ...winners]
        roundNumber += 1
      }

      const championId = activeIds[0]
      expect(championId).toBeDefined()
      championsHistory.push(championId)

      // Create session & archive
      const session: CupSession = {
        id: 'active',
        seed: seasonSeed,
        seasonYear: year,
        datasetVersion: dataset.version,
        activeTeamIds: activeIds,
        roundNumber: 14,
        round: { matches: [], byeTeamIds: [] },
        results,
        history: sessionHistory,
        roundByes: {},
        clubs,
        persons,
        championId,
      }

      const archive = buildSeasonArchive(session, dataset, clubs)
      archives.push(archive)

      // Interseason transition
      const transition = executeInterseasonTransition(
        clubs,
        archive,
        dataset.communes,
        {
          seed: `edition-${year + 1}`,
          maxFusions: 10,
          usedClubNames,
          communeNextIndex,
        },
      )
      clubs = transition.nextClubs
      communeNextIndex = transition.nextCommuneNextIndex
      for (const f of transition.report.fusions) {
        usedClubNames.add(f.absorbedClubName.toLowerCase())
        usedClubNames.add(f.mergedClubName.toLowerCase())
      }
      for (const s of transition.report.secessions) {
        usedClubNames.add(s.newClubName.toLowerCase())
      }

      // Advance persons season
      persons = advancePersonsSeason({
        persons,
        communes: dataset.communes,
        clubs,
        seasonYear: year + 1,
        seed: `edition-${year + 1}`,
        previousSeasonArchive: archive,
        fusions: transition.report.fusions,
      })

      // Checks at end of each season
      const activePersons = persons.filter((p) => !p.isRetired)
      expect(activePersons.length).toBeGreaterThanOrEqual(280)
      expect(activePersons.length).toBeLessThanOrEqual(350)

      const attackers = activePersons.filter((p) => p.position === 'ATTACKER')
      const defenders = activePersons.filter((p) => p.position === 'DEFENDER')
      expect(attackers.length).toBeGreaterThan(90)
      expect(defenders.length).toBeGreaterThan(90)

      // Check average age remains realistic (e.g. between 22 and 29)
      const avgAge = activePersons.reduce((sum, p) => sum + p.age, 0) / activePersons.length
      expect(avgAge).toBeGreaterThanOrEqual(22)
      expect(avgAge).toBeLessThanOrEqual(29)

      // Check stats: ensure ratings don't NaN or explode
      for (const p of activePersons) {
        expect(p.attack).toBeGreaterThanOrEqual(1)
        expect(p.attack).toBeLessThanOrEqual(30)
        expect(p.defense).toBeGreaterThanOrEqual(1)
        expect(p.defense).toBeLessThanOrEqual(30)
        expect(Number.isNaN(computeOverallRating(p))).toBe(false)
      }
    }

    // After 10 seasons:
    // Check that goals were scored by players in the archives
    let totalAttackerGoalsAcross10Seasons = 0
    for (const arch of archives) {
      for (const m of arch.history) {
        for (const ev of m.result.events) {
          if (ev.kind === 'GOAL' && ev.actorId) {
            totalAttackerGoalsAcross10Seasons += 1
          }
        }
      }
    }
    // 10 seasons * 10030 matches per season = ~100,000 matches.
    // There must be many thousands of goals scored with actorId!
    expect(totalAttackerGoalsAcross10Seasons).toBeGreaterThan(1000)

    // Check that we have multiple champions (not 1 club winning 10 times in a row)
    const uniqueChampions = new Set(championsHistory)
    expect(uniqueChampions.size).toBeGreaterThan(1)
  }, 120000)
})
