import { Fragment } from 'react'
import { Link } from 'react-router-dom'
import type { Club } from '../teams/types'
import type { Person } from '../persons/types'
import { TeamLink } from '../teams/TeamLink'
import { departmentLabel } from '../geography/territoryLabels'
import type { MatchEvent } from './simulateMatch'
import { CoachBadge } from '../coaches/CoachBadge'

type Starters = { attacker: Person | null; defender: Person | null } | undefined

export function MatchTeamSummary({ team, side, historical, effectiveStrength, showTrophies }: {
  team: Club; side: 'home' | 'away'; historical: boolean; effectiveStrength?: number; showTrophies: boolean
}) {
  return <div className={`match-team-summary match-team--${side}`}>
    <span className="match-team-label"><i aria-hidden="true" />Équipe {side === 'home' ? '1' : '2'}</span>
    <TeamLink team={team} showTrophies={showTrophies} />
    <p className="match-team-location">{team.communeName !== team.name ? `${team.communeName} · ` : ''}{departmentLabel(team.departmentId)}</p>
    <div className="match-team-facts">
      <span>{historical ? 'Population historique non enregistrée' : `${team.population.toLocaleString('fr-FR')} hab.`}</span>
      <span>{historical ? 'Force historique non enregistrée' : <>Force <strong>{team.strength.toFixed(1)}</strong>
        {effectiveStrength !== undefined && effectiveStrength !== Math.round(team.strength * 10) / 10 && <span className="match-effective" title="Force ajustée selon l'effectif des 2 joueurs titulaires"> (Eff. {effectiveStrength.toFixed(1)})</span>}
      </>}</span>
    </div>
    <div className="coach-history-inline"><CoachBadge coach={team.coach} showBonus /></div>
  </div>
}

function LineupTeam({ team, starters, side }: { team: Club; starters: Starters; side: 'home' | 'away' }) {
  return <article className={`match-lineup-team match-team--${side}`} aria-label={`Composition de ${team.name}`}>
    <h3><span className="match-team-label"><i aria-hidden="true" />Équipe {side === 'home' ? '1' : '2'}</span>{team.name}</h3>
    {(['attacker', 'defender'] as const).map(slot => {
      const player = starters?.[slot]
      const attacking = slot === 'attacker'
      return <div className="match-player-row" key={slot}>
        <span className="match-player-role">{attacking ? 'Attaquant' : 'Défenseur'}</span>
        {player ? <>
          <Link className="match-player-name" to={`/personnes/${player.id}`}>{player.firstName} {player.lastName}</Link>
          <span className="match-player-ratings">{attacking ? <>ATQ <strong>{player.attack}</strong> · DEF {player.defense}</> : <>DEF <strong>{player.defense}</strong> · ATQ {player.attack}</>}</span>
        </> : <span className="match-local-roster">Effectif local</span>}
      </div>
    })}
  </article>
}

export function MatchLineups({ home, away, homeStarters, awayStarters }: { home: Club; away: Club; homeStarters: Starters; awayStarters: Starters }) {
  if (!homeStarters?.attacker && !homeStarters?.defender && !awayStarters?.attacker && !awayStarters?.defender) return null
  return <section className="match-lineups-card" aria-labelledby="match-lineups-title">
    <h2 id="match-lineups-title">Composition des équipes & joueurs clés</h2>
    <div className="match-lineups-grid"><LineupTeam team={home} starters={homeStarters} side="home" /><LineupTeam team={away} starters={awayStarters} side="away" /></div>
  </section>
}

/** Les interventions adverses gardent leur couleur, même dans une action offensive. */
export function MatchEventDetail({ event, homeId }: { event: MatchEvent; homeId: string }) {
  if (!event.detail) return null
  const offense = event.teamId === homeId ? 'home' : 'away'
  const people = [
    { name: event.actorName, id: event.actorId, side: offense },
    { name: event.defenderName, id: event.defenderId, side: offense === 'home' ? 'away' : 'home' },
  ].filter(p => p.name && p.id)
  const parts = []
  let cursor = 0
  while (cursor < event.detail.length) {
    const next = people.map(p => ({ ...p, start: event.detail!.indexOf(p.name!, cursor) })).filter(p => p.start >= cursor).sort((a, b) => a.start - b.start)[0]
    if (!next) { parts.push(event.detail.slice(cursor)); break }
    parts.push(<Fragment key={cursor}>{event.detail.slice(cursor, next.start)}<Link className={`match-person match-person--${next.side}`} to={`/personnes/${next.id}`}>{next.name}</Link></Fragment>)
    cursor = next.start + next.name!.length
  }
  return <p className="match-event-detail">{parts}</p>
}
