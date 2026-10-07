import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { MatchBoxScore } from './MatchBoxScore'
import type { Club } from '../teams/types'
import type { Person } from '../persons/types'
import type { MatchEvent } from './simulateMatch'

describe('MatchBoxScore', () => {
  const homeClub: Club = {
    id: 'club-home',
    name: 'FC Nantes',
    shortName: 'Nantes',
    communeId: '44109',
    communeName: 'Nantes',
    communeIds: ['44109'],
    communeNames: ['Nantes'],
    departmentId: '44',
    regionId: '52',
    zoneId: 'ZONE_OUEST',
    conferenceId: 'CONF_OUEST',
    population: 320000,
    strength: 18.5,
  }

  const awayClub: Club = {
    id: 'club-away',
    name: 'Stade Rennais',
    shortName: 'Rennes',
    communeId: '35238',
    communeName: 'Rennes',
    communeIds: ['35238'],
    communeNames: ['Rennes'],
    departmentId: '35',
    regionId: '53',
    zoneId: 'ZONE_OUEST',
    conferenceId: 'CONF_OUEST',
    population: 220000,
    strength: 19.2,
  }

  const pHomeAtt: Person = {
    id: 'p-home-att',
    firstName: 'Randal',
    lastName: 'Kolo Muani',
    age: 26,
    nationality: 'FR',
    birthCommuneId: '93005',
    birthCommuneName: 'Bondy',
    birthDepartmentId: '93',
    currentClubId: 'club-home',
    primaryRole: 'PLAYER',
    position: 'ATTACKER',
    attack: 28,
    defense: 10,
    careerYears: 7,
  }

  const pHomeDef: Person = {
    id: 'p-home-def',
    firstName: 'Nicolas',
    lastName: 'Pallois',
    age: 36,
    nationality: 'FR',
    birthCommuneId: '76217',
    birthCommuneName: 'Dieppe',
    birthDepartmentId: '76',
    currentClubId: 'club-home',
    primaryRole: 'PLAYER',
    position: 'DEFENDER',
    attack: 8,
    defense: 25,
    careerYears: 14,
  }

  const pAwayAtt: Person = {
    id: 'p-away-att',
    firstName: 'Martin',
    lastName: 'Terrier',
    age: 27,
    nationality: 'FR',
    birthCommuneId: '59039',
    birthCommuneName: 'Armentières',
    birthDepartmentId: '59',
    currentClubId: 'club-away',
    primaryRole: 'PLAYER',
    position: 'ATTACKER',
    attack: 26,
    defense: 12,
    careerYears: 8,
  }

  const pAwayDef: Person = {
    id: 'p-away-def',
    firstName: 'Arthur',
    lastName: 'Theate',
    age: 24,
    nationality: 'BE',
    birthCommuneId: '99131',
    birthCommuneName: 'Liège',
    birthDepartmentId: '99',
    currentClubId: 'club-away',
    primaryRole: 'PLAYER',
    position: 'DEFENDER',
    attack: 11,
    defense: 27,
    careerYears: 5,
  }

  const homeStarters = { attacker: pHomeAtt, defender: pHomeDef }
  const awayStarters = { attacker: pAwayAtt, defender: pAwayDef }
  const allPersons = [pHomeAtt, pHomeDef, pAwayAtt, pAwayDef]

  it('renders initial 0-0 stats when no events have occurred', () => {
    render(
      <MemoryRouter>
        <MatchBoxScore
          home={homeClub}
          away={awayClub}
          homeStarters={homeStarters}
          awayStarters={awayStarters}
          events={[]}
          allPersons={allPersons}
        />
      </MemoryRouter>
    )

    expect(screen.getByText(/Statistiques individuelles du match · Box Score/i)).toBeInTheDocument()
    expect(screen.getByText('Randal Kolo Muani')).toBeInTheDocument()
    expect(screen.getByText('Arthur Theate')).toBeInTheDocument()

    // 0 shots, 0 goals
    const zeros = screen.getAllByText('0')
    expect(zeros.length).toBeGreaterThan(0)
  })

  it('computes goals, shots, conversion %, and defensive stops accurately from match events', () => {
    const events: MatchEvent[] = [
      // Kolo Muani scores a goal
      {
        sequence: 1,
        teamId: homeClub.id,
        kind: 'GOAL',
        actorId: pHomeAtt.id,
        actorName: 'Randal Kolo Muani',
        actorRole: 'ATTACKER',
      },
      // Kolo Muani misses a shot, stopped by Theate
      {
        sequence: 2,
        teamId: homeClub.id,
        kind: 'CHANCE',
        actorId: pHomeAtt.id,
        actorName: 'Randal Kolo Muani',
        actorRole: 'ATTACKER',
        defenderId: pAwayDef.id,
        defenderName: 'Arthur Theate',
        defenderRole: 'DEFENDER',
      },
      // Terrier misses, stopped by Pallois
      {
        sequence: 3,
        teamId: awayClub.id,
        kind: 'CHANCE',
        actorId: pAwayAtt.id,
        actorName: 'Martin Terrier',
        actorRole: 'ATTACKER',
        defenderId: pHomeDef.id,
        defenderName: 'Nicolas Pallois',
        defenderRole: 'DEFENDER',
      },
      // Collective goal for Nantes
      {
        sequence: 4,
        teamId: homeClub.id,
        kind: 'GOAL',
      },
    ]

    render(
      <MemoryRouter>
        <MatchBoxScore
          home={homeClub}
          away={awayClub}
          homeStarters={homeStarters}
          awayStarters={awayStarters}
          events={events}
          allPersons={allPersons}
        />
      </MemoryRouter>
    )

    // Kolo Muani: 1 goal, 2 shots (1 goal + 1 chance) -> 50% conversion
    expect(screen.getByText('50%')).toBeInTheDocument()
    expect(screen.getAllByText(/1 raté/i).length).toBe(2)

    // Defensive stops
    expect(screen.getAllByText('🛡️ 1').length).toBe(4)

    // Collective actions row
    expect(screen.getByText(/Actions collectives/i)).toBeInTheDocument()

    // Team totals
    expect(screen.getAllByText('TOTAL ÉQUIPE')).toHaveLength(2)
  })

  it('switches between views: Both, Home, Away, and Comparison', () => {
    const events: MatchEvent[] = [
      {
        sequence: 1,
        teamId: homeClub.id,
        kind: 'GOAL',
        actorId: pHomeAtt.id,
        actorName: 'Randal Kolo Muani',
        actorRole: 'ATTACKER',
      },
    ]

    render(
      <MemoryRouter>
        <MatchBoxScore
          home={homeClub}
          away={awayClub}
          homeStarters={homeStarters}
          awayStarters={awayStarters}
          events={events}
          allPersons={allPersons}
        />
      </MemoryRouter>
    )

    // Click Home team only
    const homeBtn = screen.getByRole('button', { name: homeClub.name })
    fireEvent.click(homeBtn)
    expect(screen.getByText('Randal Kolo Muani')).toBeInTheDocument()
    expect(screen.queryByText('Arthur Theate')).not.toBeInTheDocument()

    // Click Away team only
    const awayBtn = screen.getByRole('button', { name: awayClub.name })
    fireEvent.click(awayBtn)
    expect(screen.getByText('Arthur Theate')).toBeInTheDocument()
    expect(screen.queryByText('Randal Kolo Muani')).not.toBeInTheDocument()

    // Click Comparison view
    const compBtn = screen.getByRole('button', { name: /Comparatif direct/i })
    fireEvent.click(compBtn)
    expect(screen.getByText('Comparatif de tous les joueurs sur la confrontation')).toBeInTheDocument()
    expect(screen.getByText('Randal Kolo Muani')).toBeInTheDocument()
    expect(screen.getByText('Arthur Theate')).toBeInTheDocument()
    expect(screen.getByText('⭐ MVP')).toBeInTheDocument()
  })

  it('does not credit an off-target shot as a collective defensive stop', () => {
    render(
      <MemoryRouter>
        <MatchBoxScore home={homeClub} away={awayClub}
          homeStarters={homeStarters} awayStarters={awayStarters} allPersons={allPersons}
          events={[
            { sequence: 1, teamId: homeClub.id, kind: 'CHANCE', shotOutcome: 'OFF_TARGET' },
            { sequence: 2, teamId: homeClub.id, kind: 'CHANCE', shotOutcome: 'STOPPED', isExtraTime: true },
          ]}
        />
      </MemoryRouter>,
    )
    expect(screen.queryByText('🛡️ 2')).not.toBeInTheDocument()
    expect(screen.getAllByText('🛡️ 1').length).toBeGreaterThanOrEqual(1)
  })

  it('counts extra time defensive stops in the match sheet', () => {
    const events: MatchEvent[] = [
      // Regular time defensive stop
      {
        sequence: 1,
        teamId: homeClub.id,
        kind: 'CHANCE',
        actorId: pHomeAtt.id,
        defenderId: pAwayDef.id,
        defenderName: 'Arthur Theate',
        defenderRole: 'DEFENDER',
      },
      // Extra time defensive stop
      {
        sequence: 2,
        teamId: homeClub.id,
        kind: 'CHANCE',
        actorId: pHomeAtt.id,
        defenderId: pAwayDef.id,
        defenderName: 'Arthur Theate',
        defenderRole: 'DEFENDER',
        isExtraTime: true,
      },
      // Extra time golden goal (must be counted)
      {
        sequence: 3,
        teamId: homeClub.id,
        kind: 'GOAL',
        actorId: pHomeAtt.id,
        actorName: 'Randal Kolo Muani',
        actorRole: 'ATTACKER',
        isExtraTime: true,
      },
    ]

    render(
      <MemoryRouter>
        <MatchBoxScore
          home={homeClub}
          away={awayClub}
          homeStarters={homeStarters}
          awayStarters={awayStarters}
          events={events}
          allPersons={allPersons}
        />
      </MemoryRouter>
    )

    expect(screen.getAllByText('🛡️ 2').length).toBeGreaterThanOrEqual(1)
  })
})
