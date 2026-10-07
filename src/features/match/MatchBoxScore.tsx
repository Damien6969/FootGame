import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import type { Club } from '../teams/types'
import type { Person } from '../persons/types'
import type { MatchEvent } from './simulateMatch'
import { NationalityBadge } from '../persons/NationalityBadge'

type Starters = { attacker: Person | null; defender: Person | null } | undefined

export type PlayerMatchStat = Readonly<{
  id: string
  name: string
  firstName?: string
  lastName?: string
  person?: Person
  role: 'ATTACKER' | 'DEFENDER'
  isStarter: boolean
  attack: number
  defense: number
  teamId: string
  teamName: string
  side: 'home' | 'away'
  goals: number
  shots: number
  shotsMissed: number
  conversionRate: number
  defensiveStops: number
  gameScore: number
}>

export type TeamMatchStat = Readonly<{
  team: Club
  side: 'home' | 'away'
  players: readonly PlayerMatchStat[]
  collectiveGoals: number
  collectiveShots: number
  collectiveMissed: number
  collectiveConversionRate: number
  collectiveStops: number
  totalGoals: number
  totalShots: number
  totalMissed: number
  totalConversionRate: number
  totalStops: number
  totalGameScore: number
}>

type Props = Readonly<{
  home: Club
  away: Club
  homeStarters?: Starters
  awayStarters?: Starters
  events: readonly MatchEvent[]
  allPersons?: readonly Person[]
  homeEffectiveStrength?: number
  awayEffectiveStrength?: number
}>

function computePlayerInitials(firstName?: string, lastName?: string, fallbackName?: string): string {
  if (firstName && lastName) {
    return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase()
  }
  if (fallbackName) {
    const parts = fallbackName.trim().split(/\s+/)
    if (parts.length >= 2) {
      return `${parts[0].charAt(0)}${parts[1].charAt(0)}`.toUpperCase()
    }
    return fallbackName.slice(0, 2).toUpperCase()
  }
  return '??'
}

function calculateTeamBoxScore(
  team: Club,
  side: 'home' | 'away',
  starters: Starters,
  opponent: Club,
  events: readonly MatchEvent[],
  personsById: Map<string, Person>,
): TeamMatchStat {
  const playersMap = new Map<string, {
    id: string
    name: string
    firstName?: string
    lastName?: string
    person?: Person
    role: 'ATTACKER' | 'DEFENDER'
    isStarter: boolean
    attack: number
    defense: number
    teamId: string
    teamName: string
    side: 'home' | 'away'
    goals: number
    shots: number
    shotsMissed: number
    conversionRate: number
    defensiveStops: number
    gameScore: number
  }>()

  // 1. Initialiser avec les titulaires officiels du club
  if (starters?.attacker) {
    const att = starters.attacker
    playersMap.set(att.id, {
      id: att.id,
      name: `${att.firstName} ${att.lastName}`,
      firstName: att.firstName,
      lastName: att.lastName,
      person: att,
      role: att.assignedPosition === 'DEFENDER' ? 'DEFENDER' : 'ATTACKER',
      isStarter: true,
      attack: att.attack,
      defense: att.defense,
      teamId: team.id,
      teamName: team.name,
      side,
      goals: 0,
      shots: 0,
      shotsMissed: 0,
      conversionRate: 0,
      defensiveStops: 0,
      gameScore: 0,
    })
  }

  if (starters?.defender) {
    const def = starters.defender
    playersMap.set(def.id, {
      id: def.id,
      name: `${def.firstName} ${def.lastName}`,
      firstName: def.firstName,
      lastName: def.lastName,
      person: def,
      role: def.assignedPosition === 'ATTACKER' ? 'ATTACKER' : 'DEFENDER',
      isStarter: true,
      attack: def.attack,
      defense: def.defense,
      teamId: team.id,
      teamName: team.name,
      side,
      goals: 0,
      shots: 0,
      shotsMissed: 0,
      conversionRate: 0,
      defensiveStops: 0,
      gameScore: 0,
    })
  }

  let collectiveGoals = 0
  let collectiveShots = 0
  let collectiveMissed = 0
  let collectiveStops = 0

  // 2. Parcourir les événements de match
  for (const event of events) {
    // Actions offensives de cette équipe
    if (event.teamId === team.id) {
      if (event.actorId) {
        let p = playersMap.get(event.actorId)
        if (!p) {
          const person = personsById.get(event.actorId)
          p = {
            id: event.actorId,
            name: event.actorName || (person ? `${person.firstName} ${person.lastName}` : event.actorId),
            firstName: person?.firstName,
            lastName: person?.lastName,
            person,
            role: event.actorRole || (person?.position === 'DEFENDER' ? 'DEFENDER' : 'ATTACKER'),
            isStarter: false,
            attack: person?.attack ?? 10,
            defense: person?.defense ?? 10,
            teamId: team.id,
            teamName: team.name,
            side,
            goals: 0,
            shots: 0,
            shotsMissed: 0,
            conversionRate: 0,
            defensiveStops: 0,
            gameScore: 0,
          }
          playersMap.set(event.actorId, p)
        }
        p.shots += 1
        if (event.kind === 'GOAL') {
          p.goals += 1
        } else {
          p.shotsMissed += 1
        }
      } else {
        collectiveShots += 1
        if (event.kind === 'GOAL') {
          collectiveGoals += 1
        } else {
          collectiveMissed += 1
        }
      }
    }

    // Actions défensives de cette équipe (quand l'adversaire attaque)
    if (event.teamId === opponent.id) {
      if (event.defenderId) {
        let p = playersMap.get(event.defenderId)
        if (!p) {
          const person = personsById.get(event.defenderId)
          p = {
            id: event.defenderId,
            name: event.defenderName || (person ? `${person.firstName} ${person.lastName}` : event.defenderId),
            firstName: person?.firstName,
            lastName: person?.lastName,
            person,
            role: event.defenderRole || (person?.position === 'ATTACKER' ? 'ATTACKER' : 'DEFENDER'),
            isStarter: false,
            attack: person?.attack ?? 10,
            defense: person?.defense ?? 10,
            teamId: team.id,
            teamName: team.name,
            side,
            goals: 0,
            shots: 0,
            shotsMissed: 0,
            conversionRate: 0,
            defensiveStops: 0,
            gameScore: 0,
          }
          playersMap.set(event.defenderId, p)
        }
        p.defensiveStops += 1
      } else if (event.kind === 'CHANCE' && event.shotOutcome !== 'OFF_TARGET') {
        // Occasion adverse neutralisée sans défenseur star identifié
        collectiveStops += 1
      }
    }
  }

  // 3. Calculer les pourcentages et scores d'évaluation pour chaque joueur
  const playersList = Array.from(playersMap.values()).map((p) => {
    const conversionRate = p.shots > 0 ? Math.round((p.goals / p.shots) * 1000) / 10 : 0
    // Score d'impact façon NBA PER/GameScore : Buts (+10), Arrêts (+6), Tirs cadrés (+2), Tirs manqués (-2)
    const gameScore = (p.goals * 10) + (p.defensiveStops * 6) + (p.shots * 2) - (p.shotsMissed * 2)
    return {
      ...p,
      conversionRate,
      gameScore,
    }
  })

  // Tri des joueurs : Titulaires d'abord, puis par score d'impact / buts
  playersList.sort((a, b) => {
    if (a.isStarter !== b.isStarter) return a.isStarter ? -1 : 1
    if (b.goals !== a.goals) return b.goals - a.goals
    if (b.defensiveStops !== a.defensiveStops) return b.defensiveStops - a.defensiveStops
    return b.gameScore - a.gameScore
  })

  const collectiveConversionRate =
    collectiveShots > 0 ? Math.round((collectiveGoals / collectiveShots) * 1000) / 10 : 0

  const totalGoals = playersList.reduce((sum, p) => sum + p.goals, 0) + collectiveGoals
  const totalShots = playersList.reduce((sum, p) => sum + p.shots, 0) + collectiveShots
  const totalMissed = playersList.reduce((sum, p) => sum + p.shotsMissed, 0) + collectiveMissed
  const totalStops = playersList.reduce((sum, p) => sum + p.defensiveStops, 0) + collectiveStops
  const totalConversionRate = totalShots > 0 ? Math.round((totalGoals / totalShots) * 1000) / 10 : 0
  const totalGameScore = playersList.reduce((sum, p) => sum + p.gameScore, 0)

  return {
    team,
    side,
    players: playersList,
    collectiveGoals,
    collectiveShots,
    collectiveMissed,
    collectiveConversionRate,
    collectiveStops,
    totalGoals,
    totalShots,
    totalMissed,
    totalConversionRate,
    totalStops,
    totalGameScore,
  }
}

export function MatchBoxScore({
  home,
  away,
  homeStarters,
  awayStarters,
  events,
  allPersons = [],
  homeEffectiveStrength,
  awayEffectiveStrength,
}: Props) {
  const [viewMode, setViewMode] = useState<'both' | 'home' | 'away' | 'comparison'>('both')
  const [sortKey, setSortKey] = useState<'goals' | 'shots' | 'stops' | 'rate' | 'eval'>('eval')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  const personsById = useMemo(() => {
    return new Map(allPersons.map((p) => [p.id, p]))
  }, [allPersons])

  const homeBox = useMemo(() => {
    return calculateTeamBoxScore(home, 'home', homeStarters, away, events, personsById)
  }, [home, homeStarters, away, events, personsById])

  const awayBox = useMemo(() => {
    return calculateTeamBoxScore(away, 'away', awayStarters, home, events, personsById)
  }, [away, awayStarters, home, events, personsById])

  // Déterminer le joueur MVP / Homme du match (si des buts ou arrêts ont été réalisés)
  const allPlayers = useMemo(() => {
    return [...homeBox.players, ...awayBox.players]
  }, [homeBox.players, awayBox.players])

  const mvpPlayerId = useMemo(() => {
    if (allPlayers.length === 0) return null
    const eligible = allPlayers.filter((p) => p.goals > 0 || p.defensiveStops > 0)
    if (eligible.length === 0) return null
    eligible.sort((a, b) => {
      if (b.goals !== a.goals) return b.goals - a.goals
      if (b.defensiveStops !== a.defensiveStops) return b.defensiveStops - a.defensiveStops
      return b.gameScore - a.gameScore
    })
    return eligible[0]?.id ?? null
  }, [allPlayers])

  // Comparatif trié de tous les joueurs de la confrontation
  const sortedComparisonPlayers = useMemo(() => {
    const list = [...allPlayers]
    list.sort((a, b) => {
      let cmp = 0
      switch (sortKey) {
        case 'goals':
          cmp = a.goals - b.goals
          break
        case 'shots':
          cmp = a.shots - b.shots
          break
        case 'stops':
          cmp = a.defensiveStops - b.defensiveStops
          break
        case 'rate':
          cmp = a.conversionRate - b.conversionRate
          break
        case 'eval':
        default:
          cmp = a.gameScore - b.gameScore
          if (cmp === 0) cmp = a.goals - b.goals
          if (cmp === 0) cmp = a.defensiveStops - b.defensiveStops
          break
      }
      return sortDir === 'asc' ? cmp : -cmp
    })
    return list
  }, [allPlayers, sortKey, sortDir])

  const handleSort = (key: 'goals' | 'shots' | 'stops' | 'rate' | 'eval') => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('desc')
    }
  }

  const renderSortArrow = (target: string) => {
    if (sortKey !== target) return <span style={{ opacity: 0.35, fontSize: '0.75rem', marginLeft: '3px' }}>↕</span>
    return (
      <span style={{ color: 'var(--color-primary-light, #38bdf8)', fontSize: '0.8rem', marginLeft: '3px' }}>
        {sortDir === 'asc' ? '▲' : '▼'}
      </span>
    )
  }

  const renderTeamTable = (box: TeamMatchStat, effectiveStrength?: number) => {
    const isHome = box.side === 'home'
    const teamColorVar = isHome ? 'var(--color-match-home)' : 'var(--color-match-away)'
    const teamBgVar = isHome ? 'var(--color-match-home-bg)' : 'var(--color-match-away-bg)'
    const hasCollective = box.collectiveGoals > 0 || box.collectiveShots > 0 || box.collectiveStops > 0

    return (
      <div
        className="match-boxscore-team"
        style={{
          borderTopColor: teamColorVar,
        }}
      >
        <div
          className="match-boxscore-team-head"
          style={{
            background: teamBgVar,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span
              className="match-team-label"
              style={{
                margin: 0,
                color: teamColorVar,
                fontWeight: 700,
                fontSize: '0.75rem',
              }}
            >
              Équipe {isHome ? '1' : '2'}
            </span>
            <strong style={{ color: '#f8fafc', fontSize: '1rem' }}>{box.team.name}</strong>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.85rem' }}>
            <span style={{ color: 'var(--color-text-dim)' }}>
              Force {box.team.strength !== undefined ? box.team.strength.toFixed(1) : (box.team.baseStrength?.toFixed(1) ?? '—')}
              {effectiveStrength && (box.team.strength === undefined || effectiveStrength !== Math.round(box.team.strength * 10) / 10) && (
                <span title="Force effective de l'équipe"> (Eff. {effectiveStrength.toFixed(1)})</span>
              )}
            </span>
            <span
              style={{
                background: 'rgba(0,0,0,0.3)',
                padding: '2px 8px',
                borderRadius: '4px',
                fontWeight: 800,
                color: '#f8fafc',
              }}
            >
              ⚽ {box.totalGoals}
            </span>
          </div>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table className="match-boxscore-table">
            <thead>
              <tr>
                <th style={{ minWidth: '150px' }}>Joueur</th>
                <th style={{ width: '70px', textAlign: 'center' }}>Poste</th>
                <th style={{ width: '80px', textAlign: 'center' }}>Notes</th>
                <th style={{ width: '60px', textAlign: 'center' }} title="Buts marqués (Tirs réussis)">⚽ Buts</th>
                <th style={{ width: '80px', textAlign: 'center' }} title="Tirs cadrés / Tentés (Format NBA FGM/FGA)">Tirs (M/T)</th>
                <th style={{ width: '70px', textAlign: 'center' }} title="Pourcentage d'efficacité au tir">% Tir</th>
                <th style={{ width: '65px', textAlign: 'center' }} title="Interventions défensives décisives / Arrêts">🛡️ Arrêts</th>
                <th style={{ width: '65px', textAlign: 'center' }} title="Score d'évaluation / Impact">Éval</th>
              </tr>
            </thead>
            <tbody>
              {box.players.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: '16px', color: 'var(--color-text-dim)' }}>
                    Effectif local (aucun joueur individuel assigné)
                  </td>
                </tr>
              ) : (
                box.players.map((p) => {
                  const initials = computePlayerInitials(p.firstName, p.lastName, p.name)
                  const isMvp = p.id === mvpPlayerId

                  return (
                    <tr key={p.id}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <div
                            style={{
                              width: '28px',
                              height: '28px',
                              borderRadius: '50%',
                              background:
                                p.role === 'ATTACKER'
                                  ? 'linear-gradient(135deg, #f59e0b, #ef4444)'
                                  : 'linear-gradient(135deg, #3b82f6, #10b981)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              color: '#ffffff',
                              fontWeight: 700,
                              fontSize: '0.75rem',
                              flexShrink: 0,
                            }}
                          >
                            {initials}
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                              <Link
                                to={`/personnes/${p.id}`}
                                style={{
                                  color: teamColorVar,
                                  fontWeight: 700,
                                  textDecoration: 'none',
                                  fontSize: '0.85rem',
                                }}
                              >
                                {p.name}
                              </Link>
                              {p.person && <NationalityBadge person={p.person} compact />}
                              {isMvp && (
                                <span
                                  className="badge badge--gold"
                                  style={{ fontSize: '0.65rem', padding: '1px 5px' }}
                                  title="Meilleur joueur du match"
                                >
                                  ⭐ MVP
                                </span>
                              )}
                            </div>
                            <span style={{ fontSize: '0.7rem', color: 'var(--color-text-dim)' }}>
                              {p.isStarter ? 'Titulaire' : 'Remplaçant'}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <span
                          style={{
                            fontSize: '0.7rem',
                            fontWeight: 600,
                            padding: '2px 6px',
                            borderRadius: '4px',
                            background:
                              p.role === 'ATTACKER' ? 'rgba(245, 158, 11, 0.15)' : 'rgba(56, 189, 248, 0.15)',
                            color: p.role === 'ATTACKER' ? '#fbbf24' : '#38bdf8',
                            border: `1px solid ${
                              p.role === 'ATTACKER' ? 'rgba(245, 158, 11, 0.3)' : 'rgba(56, 189, 248, 0.3)'
                            }`,
                          }}
                        >
                          {p.role === 'ATTACKER' ? 'ATT' : 'DEF'}
                        </span>
                      </td>
                      <td style={{ textAlign: 'center', fontSize: '0.75rem', color: 'var(--color-text-dim)', whiteSpace: 'nowrap' }}>
                        ATQ <strong style={{ color: '#f8fafc' }}>{p.attack}</strong> · DEF{' '}
                        <strong style={{ color: '#f8fafc' }}>{p.defense}</strong>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        {p.goals > 0 ? (
                          <span
                            style={{
                              fontWeight: 800,
                              color: '#facc15',
                              background: 'rgba(234, 179, 8, 0.15)',
                              padding: '2px 7px',
                              borderRadius: '4px',
                              border: '1px solid rgba(234, 179, 8, 0.3)',
                              fontSize: '0.85rem',
                            }}
                          >
                            ⚽ {p.goals}
                          </span>
                        ) : (
                          <span style={{ color: 'var(--color-text-dim)' }}>0</span>
                        )}
                      </td>
                      <td style={{ textAlign: 'center', fontWeight: 600, color: 'var(--color-text-secondary)' }}>
                        <span style={{ color: p.goals > 0 ? '#f8fafc' : 'inherit' }}>{p.goals}</span> / {p.shots}
                        {p.shotsMissed > 0 && (
                          <small style={{ color: 'var(--color-text-dim)', marginLeft: '4px' }}>
                            ({p.shotsMissed} raté{p.shotsMissed > 1 ? 's' : ''})
                          </small>
                        )}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        {p.shots > 0 ? (
                          <span
                            style={{
                              fontWeight: 700,
                              color: p.conversionRate >= 50 ? '#4ade80' : p.conversionRate > 0 ? '#f8fafc' : '#94a3b8',
                            }}
                          >
                            {p.conversionRate}%
                          </span>
                        ) : (
                          <span style={{ color: 'var(--color-text-dim)' }}>—</span>
                        )}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        {p.defensiveStops > 0 ? (
                          <span
                            style={{
                              fontWeight: 800,
                              color: '#38bdf8',
                              background: 'rgba(56, 189, 248, 0.15)',
                              padding: '2px 7px',
                              borderRadius: '4px',
                              border: '1px solid rgba(56, 189, 248, 0.3)',
                              fontSize: '0.85rem',
                            }}
                          >
                            🛡️ {p.defensiveStops}
                          </span>
                        ) : (
                          <span style={{ color: 'var(--color-text-dim)' }}>0</span>
                        )}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <span
                          style={{
                            fontWeight: 700,
                            fontSize: '0.8rem',
                            color: p.gameScore > 0 ? '#fbbf24' : p.gameScore < 0 ? '#f87171' : 'var(--color-text-dim)',
                          }}
                        >
                          {p.gameScore > 0 ? `+${p.gameScore}` : p.gameScore}
                        </span>
                      </td>
                    </tr>
                  )
                })
              )}

              {/* Ligne d'actions collectives du club si existantes */}
              {hasCollective && (
                <tr className="row-collective">
                  <td>
                    <span style={{ color: 'var(--color-text-dim)', fontSize: '0.78rem' }}>
                      👥 Actions collectives (sans joueur clé)
                    </span>
                  </td>
                  <td style={{ textAlign: 'center', fontSize: '0.7rem' }}>Équipe</td>
                  <td style={{ textAlign: 'center', fontSize: '0.75rem' }}>—</td>
                  <td style={{ textAlign: 'center' }}>
                    {box.collectiveGoals > 0 ? (
                      <span style={{ fontWeight: 700, color: '#facc15' }}>⚽ {box.collectiveGoals}</span>
                    ) : (
                      '0'
                    )}
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    {box.collectiveGoals} / {box.collectiveShots}
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    {box.collectiveShots > 0 ? `${box.collectiveConversionRate}%` : '—'}
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    {box.collectiveStops > 0 ? `🛡️ ${box.collectiveStops}` : '0'}
                  </td>
                  <td style={{ textAlign: 'center' }}>—</td>
                </tr>
              )}

              {/* Ligne TOTAL ÉQUIPE */}
              <tr className="row-total">
                <td style={{ fontWeight: 800, color: teamColorVar }}>TOTAL ÉQUIPE</td>
                <td style={{ textAlign: 'center', color: 'var(--color-text-dim)' }}>—</td>
                <td style={{ textAlign: 'center', fontSize: '0.75rem', color: 'var(--color-text-dim)' }}>
                  Force {box.team.strength !== undefined ? box.team.strength.toFixed(1) : (box.team.baseStrength?.toFixed(1) ?? '—')}
                </td>
                <td style={{ textAlign: 'center', fontWeight: 800, color: '#facc15', fontSize: '0.95rem' }}>
                  ⚽ {box.totalGoals}
                </td>
                <td style={{ textAlign: 'center', fontWeight: 700, color: '#f8fafc' }}>
                  {box.totalGoals} / {box.totalShots}
                </td>
                <td style={{ textAlign: 'center', fontWeight: 700, color: box.totalConversionRate >= 40 ? '#4ade80' : '#f8fafc' }}>
                  {box.totalShots > 0 ? `${box.totalConversionRate}%` : '—'}
                </td>
                <td style={{ textAlign: 'center', fontWeight: 800, color: '#38bdf8', fontSize: '0.95rem' }}>
                  🛡️ {box.totalStops}
                </td>
                <td style={{ textAlign: 'center', fontWeight: 800, color: box.totalGameScore > 0 ? '#fbbf24' : 'var(--color-text-dim)' }}>
                  {box.totalGameScore > 0 ? `+${box.totalGameScore}` : box.totalGameScore}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  return (
    <section className="match-boxscore-card" aria-label="Statistiques individuelles des joueurs (Box Score)">
      <div className="match-boxscore-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <h2 className="match-boxscore-title">
            <span>📊</span> Statistiques individuelles du match · Box Score
          </h2>
          <span style={{ fontSize: '0.8rem', color: 'var(--color-text-dim)' }}>
            ({allPlayers.length} joueur{allPlayers.length > 1 ? 's' : ''} engagé{allPlayers.length > 1 ? 's' : ''})
          </span>
        </div>

        {/* Boutons d'affichage façon NBA */}
        <div className="view-switch" style={{ margin: 0 }}>
          <button
            type="button"
            className={viewMode === 'both' ? 'is-active' : ''}
            onClick={() => setViewMode('both')}
            title="Afficher les deux équipes côte à côte"
          >
            Les 2 équipes
          </button>
          <button
            type="button"
            className={viewMode === 'home' ? 'is-active' : ''}
            onClick={() => setViewMode('home')}
            style={viewMode === 'home' ? { color: 'var(--color-match-home)' } : undefined}
            title={`Afficher uniquement ${home.name}`}
          >
            {home.name}
          </button>
          <button
            type="button"
            className={viewMode === 'away' ? 'is-active' : ''}
            onClick={() => setViewMode('away')}
            style={viewMode === 'away' ? { color: 'var(--color-match-away)' } : undefined}
            title={`Afficher uniquement ${away.name}`}
          >
            {away.name}
          </button>
          <button
            type="button"
            className={viewMode === 'comparison' ? 'is-active' : ''}
            onClick={() => setViewMode('comparison')}
            title="Tableau unique comparatif de tous les joueurs de la confrontation"
          >
            ⚔️ Comparatif direct
          </button>
        </div>
      </div>

      {/* Vue 1: Les 2 équipes ou vue mono-équipe */}
      {(viewMode === 'both' || viewMode === 'home' || viewMode === 'away') && (
        <div
          className="match-boxscore-grid"
          style={{
            gridTemplateColumns: viewMode === 'both' ? undefined : 'minmax(0, 1fr)',
          }}
        >
          {(viewMode === 'both' || viewMode === 'home') && renderTeamTable(homeBox, homeEffectiveStrength)}
          {(viewMode === 'both' || viewMode === 'away') && renderTeamTable(awayBox, awayEffectiveStrength)}
        </div>
      )}

      {/* Vue 2: Comparatif confrontation directe */}
      {viewMode === 'comparison' && (
        <div
          style={{
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-md)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              padding: '12px 16px',
              borderBottom: '1px solid var(--color-border)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '8px',
              background: 'rgba(0,0,0,0.15)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <strong style={{ fontSize: '0.95rem', color: '#f8fafc' }}>
                Comparatif de tous les joueurs sur la confrontation
              </strong>
              {mvpPlayerId && (
                <span className="badge badge--gold" style={{ fontSize: '0.7rem' }}>
                  ⭐ MVP désigné
                </span>
              )}
            </div>
            <span style={{ fontSize: '0.8rem', color: 'var(--color-text-dim)' }}>
              Cliquez sur les colonnes pour trier les performances
            </span>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table className="match-boxscore-table" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th style={{ width: '50px', textAlign: 'center' }}>Rang</th>
                  <th style={{ minWidth: '180px' }}>Joueur</th>
                  <th style={{ minWidth: '140px' }}>Équipe</th>
                  <th style={{ width: '70px', textAlign: 'center' }}>Poste</th>
                  <th style={{ width: '80px', textAlign: 'center' }}>Notes</th>
                  <th
                    onClick={() => handleSort('goals')}
                    style={{ width: '75px', textAlign: 'center', cursor: 'pointer', userSelect: 'none' }}
                    title="Trier par buts marqués"
                  >
                    ⚽ Buts {renderSortArrow('goals')}
                  </th>
                  <th
                    onClick={() => handleSort('shots')}
                    style={{ width: '90px', textAlign: 'center', cursor: 'pointer', userSelect: 'none' }}
                    title="Trier par tirs tentés"
                  >
                    Tirs (M/T) {renderSortArrow('shots')}
                  </th>
                  <th
                    onClick={() => handleSort('rate')}
                    style={{ width: '80px', textAlign: 'center', cursor: 'pointer', userSelect: 'none' }}
                    title="Trier par efficacité au tir"
                  >
                    % Tir {renderSortArrow('rate')}
                  </th>
                  <th
                    onClick={() => handleSort('stops')}
                    style={{ width: '85px', textAlign: 'center', cursor: 'pointer', userSelect: 'none' }}
                    title="Trier par arrêts et interventions"
                  >
                    🛡️ Arrêts {renderSortArrow('stops')}
                  </th>
                  <th
                    onClick={() => handleSort('eval')}
                    style={{ width: '75px', textAlign: 'center', cursor: 'pointer', userSelect: 'none' }}
                    title="Trier par note d'évaluation"
                  >
                    ★ Éval {renderSortArrow('eval')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedComparisonPlayers.length === 0 ? (
                  <tr>
                    <td colSpan={10} style={{ textAlign: 'center', padding: '24px', color: 'var(--color-text-dim)' }}>
                      Aucun joueur individuel répertorié sur cette confrontation.
                    </td>
                  </tr>
                ) : (
                  sortedComparisonPlayers.map((p, idx) => {
                    const initials = computePlayerInitials(p.firstName, p.lastName, p.name)
                    const isHome = p.side === 'home'
                    const teamColorVar = isHome ? 'var(--color-match-home)' : 'var(--color-match-away)'
                    const isMvp = p.id === mvpPlayerId

                    return (
                      <tr
                        key={`${p.teamId}-${p.id}`}
                        style={{
                          background: isMvp ? 'rgba(234, 179, 8, 0.08)' : undefined,
                        }}
                      >
                        <td style={{ textAlign: 'center', fontWeight: 800, color: idx === 0 ? '#facc15' : 'inherit' }}>
                          {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `${idx + 1}`}
                        </td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div
                              style={{
                                width: '28px',
                                height: '28px',
                                borderRadius: '50%',
                                background:
                                  p.role === 'ATTACKER'
                                    ? 'linear-gradient(135deg, #f59e0b, #ef4444)'
                                    : 'linear-gradient(135deg, #3b82f6, #10b981)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: '#ffffff',
                                fontWeight: 700,
                                fontSize: '0.75rem',
                                flexShrink: 0,
                              }}
                            >
                              {initials}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexWrap: 'wrap' }}>
                              <Link
                                to={`/personnes/${p.id}`}
                                style={{
                                  color: teamColorVar,
                                  fontWeight: 700,
                                  textDecoration: 'none',
                                  fontSize: '0.85rem',
                                }}
                              >
                                {p.name}
                              </Link>
                              {p.person && <NationalityBadge person={p.person} compact />}
                              {isMvp && (
                                <span className="badge badge--gold" style={{ fontSize: '0.65rem', padding: '1px 5px' }}>
                                  ⭐ MVP
                                </span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td>
                          <span
                            style={{
                              fontSize: '0.8rem',
                              fontWeight: 600,
                              color: teamColorVar,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                            }}
                          >
                            <span style={{ fontSize: '0.65rem', opacity: 0.8 }}>({isHome ? 'Éq. 1' : 'Éq. 2'})</span>
                            {p.teamName}
                          </span>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <span
                            style={{
                              fontSize: '0.7rem',
                              fontWeight: 600,
                              padding: '2px 6px',
                              borderRadius: '4px',
                              background:
                                p.role === 'ATTACKER' ? 'rgba(245, 158, 11, 0.15)' : 'rgba(56, 189, 248, 0.15)',
                              color: p.role === 'ATTACKER' ? '#fbbf24' : '#38bdf8',
                              border: `1px solid ${
                                p.role === 'ATTACKER' ? 'rgba(245, 158, 11, 0.3)' : 'rgba(56, 189, 248, 0.3)'
                              }`,
                            }}
                          >
                            {p.role === 'ATTACKER' ? 'ATT' : 'DEF'}
                          </span>
                        </td>
                        <td style={{ textAlign: 'center', fontSize: '0.75rem', color: 'var(--color-text-dim)', whiteSpace: 'nowrap' }}>
                          ATQ <strong style={{ color: '#f8fafc' }}>{p.attack}</strong> · DEF{' '}
                          <strong style={{ color: '#f8fafc' }}>{p.defense}</strong>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          {p.goals > 0 ? (
                            <span
                              style={{
                                fontWeight: 800,
                                color: '#facc15',
                                background: 'rgba(234, 179, 8, 0.15)',
                                padding: '2px 7px',
                                borderRadius: '4px',
                                border: '1px solid rgba(234, 179, 8, 0.3)',
                                fontSize: '0.85rem',
                              }}
                            >
                              ⚽ {p.goals}
                            </span>
                          ) : (
                            <span style={{ color: 'var(--color-text-dim)' }}>0</span>
                          )}
                        </td>
                        <td style={{ textAlign: 'center', fontWeight: 600, color: 'var(--color-text-secondary)' }}>
                          <span style={{ color: p.goals > 0 ? '#f8fafc' : 'inherit' }}>{p.goals}</span> / {p.shots}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          {p.shots > 0 ? (
                            <span
                              style={{
                                fontWeight: 700,
                                color: p.conversionRate >= 50 ? '#4ade80' : p.conversionRate > 0 ? '#f8fafc' : '#94a3b8',
                              }}
                            >
                              {p.conversionRate}%
                            </span>
                          ) : (
                            <span style={{ color: 'var(--color-text-dim)' }}>—</span>
                          )}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          {p.defensiveStops > 0 ? (
                            <span
                              style={{
                                fontWeight: 800,
                                color: '#38bdf8',
                                background: 'rgba(56, 189, 248, 0.15)',
                                padding: '2px 7px',
                                borderRadius: '4px',
                                border: '1px solid rgba(56, 189, 248, 0.3)',
                                fontSize: '0.85rem',
                              }}
                            >
                              🛡️ {p.defensiveStops}
                            </span>
                          ) : (
                            <span style={{ color: 'var(--color-text-dim)' }}>0</span>
                          )}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <span
                            style={{
                              fontWeight: 800,
                              fontSize: '0.85rem',
                              color: p.gameScore > 0 ? '#fbbf24' : p.gameScore < 0 ? '#f87171' : 'var(--color-text-dim)',
                            }}
                          >
                            {p.gameScore > 0 ? `+${p.gameScore}` : p.gameScore}
                          </span>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  )
}
