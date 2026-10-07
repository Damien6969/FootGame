import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import {
  buildPastHonorsMap,
  PlayerPastHonorsBadge,
  type PlayerPastHonorsSummary,
} from './PlayerPastHonors'
import type { Person } from '../persons/types'
import type { SeasonArchive } from '../storage/cupRepository'
import type { PlayerSeasonHonor } from '../history/playerPalmaresStorage'

describe('PlayerPastHonors', () => {
  describe('buildPastHonorsMap', () => {
    it('only includes honors from seasons strictly before ceremonyYear', () => {
      const archives: SeasonArchive[] = [
        {
          year: 2026,
          seed: 'seed-2026',
          completedAt: '2026-06-01',
          datasetVersion: '1',
          nationalChampionId: 'c1',
          conferenceChampions: {},
          finalFourTeamIds: [],
          totalMatches: 10,
          teamPerformances: {},
          history: [],
          individualAwards: {
            version: 1,
            year: 2026,
            minimumMatches: 3,
            awards: [
              {
                id: 'ballon-or',
                title: 'Ballon d’Or',
                stage: 'FINAL',
                metric: 'OVERALL',
                winners: [{ personId: 'player-1', firstName: 'Jean', lastName: 'Dupont', age: 24, clubId: 'c1', clubName: 'Club 1', conferenceId: 'nord', position: 'ATTACKER', matchesPlayed: 5, goals: 6, defensiveStops: 1, shots: 10, shotsMissed: 4, attackScore: 50, defenseScore: 20, overallScore: 85 }],
                nominees: [],
              },
            ],
          },
        },
        {
          year: 2027,
          seed: 'seed-2027',
          completedAt: '2027-06-01',
          datasetVersion: '1',
          nationalChampionId: 'c2',
          conferenceChampions: {},
          finalFourTeamIds: [],
          totalMatches: 10,
          teamPerformances: {},
          history: [],
          individualAwards: {
            version: 1,
            year: 2027,
            minimumMatches: 3,
            awards: [
              {
                id: 'ballon-or',
                title: 'Ballon d’Or',
                stage: 'FINAL',
                metric: 'OVERALL',
                winners: [{ personId: 'player-1', firstName: 'Jean', lastName: 'Dupont', age: 25, clubId: 'c1', clubName: 'Club 1', conferenceId: 'nord', position: 'ATTACKER', matchesPlayed: 5, goals: 7, defensiveStops: 0, shots: 12, shotsMissed: 5, attackScore: 60, defenseScore: 10, overallScore: 90 }],
                nominees: [],
              },
            ],
          },
        },
      ]

      // Pour la cérémonie 2027, seul 2026 doit être inclus
      const map2027 = buildPastHonorsMap({ ceremonyYear: 2027, archives })
      const summary1 = map2027.get('player-1')
      expect(summary1).toBeDefined()
      expect(summary1?.ballonOrCount).toBe(1)
      expect(summary1?.ballonOrYears).toEqual([2026])

      // Pour la cérémonie 2028, 2026 et 2027 doivent être inclus
      const map2028 = buildPastHonorsMap({ ceremonyYear: 2028, archives })
      const summary2 = map2028.get('player-1')
      expect(summary2?.ballonOrCount).toBe(2)
      expect(summary2?.ballonOrYears).toEqual([2026, 2027])
    })

    it('collects all major awards categories and conference awards', () => {
      const person: Person = {
        id: 'legend-1',
        firstName: 'Zinédine',
        lastName: 'Zidane',
        age: 30,
        nationality: 'FR',
        birthCommuneId: '13055',
        birthCommuneName: 'Marseille',
        birthDepartmentId: '13',
        currentClubId: 'c1',
        primaryRole: 'PLAYER',
        position: 'ATTACKER',
        attack: 28,
        defense: 15,
        careerYears: 5,
        careerHistory: [
          {
            year: 2024,
            clubId: 'c1',
            role: 'PLAYER',
            age: 26,
            attack: 25,
            defense: 12,
            individualHonors: [
              { awardId: 'ballon-or', title: 'Ballon d’Or' },
              { awardId: 'top-scorer', title: 'Soulier d’Or' },
              { awardId: 'conference-sud-player', title: 'Meilleur joueur · Sud', conferenceId: 'sud' },
            ],
          },
          {
            year: 2025,
            clubId: 'c1',
            role: 'PLAYER',
            age: 27,
            attack: 27,
            defense: 14,
            individualHonors: [
              { awardId: 'top-stops', title: 'Bouclier d’Or' },
              { awardId: 'best-defender', title: 'Meilleur défenseur' },
              { awardId: 'best-attacker', title: 'Meilleur attaquant' },
              { awardId: 'young-player', title: 'Meilleur espoir' },
            ],
          },
        ],
      }

      const map = buildPastHonorsMap({ ceremonyYear: 2026, persons: [person] })
      const summary = map.get('legend-1')
      expect(summary).toBeDefined()
      expect(summary?.ballonOrCount).toBe(1)
      expect(summary?.topScorerCount).toBe(1)
      expect(summary?.topStopsCount).toBe(1)
      expect(summary?.bestDefenderCount).toBe(1)
      expect(summary?.bestAttackerCount).toBe(1)
      expect(summary?.youthCount).toBe(1)
      expect(summary?.conferenceCount).toBe(1)
      expect(summary?.totalCount).toBe(7)
    })

    it('deduplicates identical awards across archives and person career history', () => {
      const archives: SeasonArchive[] = [
        {
          year: 2025,
          seed: 'seed-2025',
          completedAt: '2025-06-01',
          datasetVersion: '1',
          nationalChampionId: 'c1',
          conferenceChampions: {},
          finalFourTeamIds: [],
          totalMatches: 10,
          teamPerformances: {},
          history: [],
          individualAwards: {
            version: 1,
            year: 2025,
            minimumMatches: 3,
            awards: [
              {
                id: 'ballon-or',
                title: 'Ballon d’Or',
                stage: 'FINAL',
                metric: 'OVERALL',
                winners: [{ personId: 'dup-1', firstName: 'A', lastName: 'B', age: 25, clubId: 'c1', clubName: 'C', conferenceId: 'est', position: 'ATTACKER', matchesPlayed: 5, goals: 5, defensiveStops: 0, shots: 8, shotsMissed: 3, attackScore: 40, defenseScore: 10, overallScore: 80 }],
                nominees: [],
              },
            ],
          },
        },
      ]

      const person: Person = {
        id: 'dup-1',
        firstName: 'A',
        lastName: 'B',
        age: 26,
        nationality: 'FR',
        birthCommuneId: '75056',
        birthCommuneName: 'Paris',
        birthDepartmentId: '75',
        currentClubId: 'c1',
        primaryRole: 'PLAYER',
        position: 'ATTACKER',
        attack: 25,
        defense: 15,
        careerYears: 2,
        careerHistory: [
          {
            year: 2025,
            clubId: 'c1',
            role: 'PLAYER',
            age: 25,
            attack: 25,
            defense: 15,
            individualHonors: [{ awardId: 'ballon-or', title: 'Ballon d’Or' }],
          },
        ],
      }

      const honors: PlayerSeasonHonor[] = [
        {
          id: 'dup-1:2025',
          personId: 'dup-1',
          year: 2025,
          firstName: 'A',
          lastName: 'B',
          nationality: 'FR',
          role: 'PLAYER',
          isStarter: true,
          isLoan: false,
          matchesPlayed: 5,
          goals: 5,
          defensiveStops: 0,
          shots: 8,
          shotsMissed: 3,
          roundReached: 14,
          stageLabel: 'Champion',
          isNationalChampion: true,
          isConferenceChampion: false,
          isRegionChampion: false,
          isDepartmentChampion: false,
          individualHonors: [{ awardId: 'ballon-or', title: 'Ballon d’Or' }],
        },
      ]

      const map = buildPastHonorsMap({
        ceremonyYear: 2026,
        archives,
        persons: [person],
        playerSeasonHonors: honors,
      })

      const summary = map.get('dup-1')
      expect(summary?.ballonOrCount).toBe(1)
      expect(summary?.ballonOrYears).toEqual([2025])
    })
  })

  describe('PlayerPastHonorsBadge', () => {
    const mockSummary: PlayerPastHonorsSummary = {
      personId: 'p1',
      ballonOrCount: 2,
      ballonOrYears: [2024, 2025],
      topScorerCount: 1,
      topScorerYears: [2024],
      topStopsCount: 1,
      topStopsYears: [2025],
      bestDefenderCount: 0,
      bestDefenderYears: [],
      bestAttackerCount: 1,
      bestAttackerYears: [2025],
      youthCount: 1,
      youthYears: [2023],
      youthDetails: [{ year: 2023, title: 'Meilleur espoir' }],
      conferenceCount: 2,
      conferenceYears: [2024, 2025],
      conferenceDetails: [
        { year: 2024, title: 'Meilleur joueur · Ouest' },
        { year: 2025, title: 'Meilleur attaquant · Ouest' },
      ],
      totalCount: 8,
    }

    const pastMap = new Map<string, PlayerPastHonorsSummary>([['p1', mockSummary]])

    it('renders nothing when player has no past honors', () => {
      const { container } = render(<PlayerPastHonorsBadge personId="unknown" pastHonorsMap={pastMap} />)
      expect(container.firstChild).toBeNull()
    })

    it('renders national major badges with icons, counts and tooltips', () => {
      render(<PlayerPastHonorsBadge personId="p1" pastHonorsMap={pastMap} isConferenceStage={false} />)

      // Ballon d'Or : 2 titres -> icône ⚽ et count 2
      const ballon = screen.getByLabelText(/2 Ballon d’Or/)
      expect(ballon).toHaveAttribute('title', '2× Ballon d’Or (2024, 2025)')
      expect(ballon).toHaveTextContent('⚽2')

      // Soulier d'Or : 1 titre -> icône 👟 sans count
      const scorer = screen.getByLabelText(/1 Soulier d’Or/)
      expect(scorer).toHaveAttribute('title', '1× Soulier d’Or · Meilleur buteur (2024)')
      expect(scorer).toHaveTextContent('👟')
      expect(scorer.querySelector('.past-honor-count')).toBeNull()

      // Bouclier d'Or : 1 titre -> 🛡️
      const stops = screen.getByLabelText(/1 Bouclier d’Or/)
      expect(stops).toHaveAttribute('title', '1× Bouclier d’Or · Roi des interventions (2025)')

      // Meilleur attaquant : 1 titre -> ⚔️
      const attacker = screen.getByLabelText(/1 Meilleur attaquant/)
      expect(attacker).toHaveAttribute('title', '1× Meilleur attaquant de la saison (2025)')

      // Espoir : 1 titre -> 🌱
      const youth = screen.getByLabelText(/1 Trophée Espoir/)
      expect(youth).toHaveAttribute('title', '1× Trophée Espoir (Meilleur espoir 2023)')

      // Hors conférence : le badge de conférence ne doit PAS être affiché
      expect(screen.queryByLabelText(/Trophée de Conférence/)).not.toBeInTheDocument()
    })

    it('renders conference badge when isConferenceStage is true', () => {
      render(<PlayerPastHonorsBadge personId="p1" pastHonorsMap={pastMap} isConferenceStage={true} />)

      // Le badge de conférence doit être affiché
      const conf = screen.getByLabelText(/2 Trophée de Conférence/)
      expect(conf).toHaveAttribute('title', '2× Trophée de Conférence (Meilleur joueur · Ouest 2024, Meilleur attaquant · Ouest 2025)')
      expect(conf).toHaveTextContent('🏛️2')

      // Les titres majeurs restent également visibles
      expect(screen.getByLabelText(/2 Ballon d’Or/)).toBeInTheDocument()
    })

    it('hides conference badge if player only has conference awards and isConferenceStage is false', () => {
      const confOnly: PlayerPastHonorsSummary = {
        personId: 'conf-only',
        ballonOrCount: 0,
        ballonOrYears: [],
        topScorerCount: 0,
        topScorerYears: [],
        topStopsCount: 0,
        topStopsYears: [],
        bestDefenderCount: 0,
        bestDefenderYears: [],
        bestAttackerCount: 0,
        bestAttackerYears: [],
        youthCount: 0,
        youthYears: [],
        youthDetails: [],
        conferenceCount: 1,
        conferenceYears: [2025],
        conferenceDetails: [{ year: 2025, title: 'Meilleur joueur · Nord' }],
        totalCount: 1,
      }
      const map = new Map<string, PlayerPastHonorsSummary>([['conf-only', confOnly]])

      // Hors étape conférence -> rien
      const { container: c1 } = render(<PlayerPastHonorsBadge personId="conf-only" pastHonorsMap={map} isConferenceStage={false} />)
      expect(c1.firstChild).toBeNull()

      // En étape conférence -> badge 🏛️ visible
      const { container: c2 } = render(<PlayerPastHonorsBadge personId="conf-only" pastHonorsMap={map} isConferenceStage={true} />)
      expect(c2.querySelector('.past-honor-badge--conference')).toBeInTheDocument()
    })
  })
})
