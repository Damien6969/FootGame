import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useOptionalCupApp } from '../../app/CupAppContext'
import type { RoundView } from '../cup/cupSelectors'
import { getActivePlayerStatistics } from './playerStatistics'
import { formatRole } from './personSelectors'
import { PersonLink } from './PersonLink'
import { PlayerFavoriteButton } from './PlayerFavoriteButton'
import { isActiveCoach } from '../coaches/coachRatings'
import type { Person } from './types'
import './player-favorites.css'

function getRoleBorderColor(person: Person, isAlive: boolean): string {
  if (!isAlive || person.isRetired) return 'rgba(148, 163, 184, 0.35)'
  if (person.primaryRole === 'COACH') return '#38bdf8'
  const pos = person.assignedPosition ?? person.position
  if (pos === 'ATTACKER') return '#f59e0b'
  if (pos === 'DEFENDER') return '#3b82f6'
  return '#10b981'
}

export function PlayerTrackingTable({ round }: { round: RoundView }) {
  const app = useOptionalCupApp()
  const session = app?.session
  const favoriteIds = app?.favoritePersonIds ?? []
  const persons = app?.persons ?? []
  const followed = useMemo(() => {
    const byId = new Map(persons.map(person => [person.id, person]))
    return favoriteIds.flatMap(id => {
      const person = byId.get(id)
      return person ? [person] : []
    })
  }, [persons, favoriteIds])

  if (followed.length === 0) {
    return (
      <div className="favorites-empty">
        <div className="favorites-empty-icon" aria-hidden="true">⭐</div>
        <h4>Aucun joueur suivi</h4>
        <p>Ajoutez une étoile depuis une fiche joueur ou un effectif pour retrouver ici son club et ses matchs.</p>
        <Link className="player-tracking-directory" to="/personnes">Choisir des joueurs →</Link>
      </div>
    )
  }

  return (
    <div className="player-tracking">
      <div className="player-tracking-intro">
        <span>Bilan de la saison {session?.seasonYear ?? 2026}</span>
        <Link to="/personnes?statut=favorites">Tous mes joueurs →</Link>
      </div>
      <table className="player-tracking-table" aria-label="Joueurs suivis">
        <thead className="player-tracking-sr-only">
          <tr>
            <th scope="col">Joueur et club</th>
            <th scope="col">Saison</th>
            <th scope="col">Tour {round.number}</th>
          </tr>
        </thead>
        <tbody className="player-fav-tbody">
          {followed.map(person => {
            const stats = session ? getActivePlayerStatistics(session, person) : undefined
            const coach = person.primaryRole === 'COACH'
            const clubId = person.isRetired && !isActiveCoach(person) ? null : person.currentClubId
            const club = clubId ? app?.clubsById.get(clubId) : undefined
            const match = clubId ? round.matches.find(m => m.homeTeamId === clubId || m.awayTeamId === clubId) : undefined
            const result = match ? round.results[match.id] : undefined
            const opponentId = match ? (match.homeTeamId === clubId ? match.awayTeamId : match.homeTeamId) : undefined
            const opponent = opponentId ? app?.clubsById.get(opponentId) : undefined
            const status = coach && !person.coachRetiredYear ? (clubId ? 'En poste' : 'Sans club') : person.isRetired ? 'Retraité' : person.primaryRole !== 'PLAYER' ? formatRole(person.primaryRole)
              : !clubId ? 'Sans club' : stats?.isStarter ? 'Titulaire' : 'Réserviste'
            const isLoan = !person.isRetired && person.loanedFromClubId && person.loanedFromClubId !== clubId
            const count = stats?.matchesPlayed ?? 0
            const isAlive = Boolean(clubId && session?.activeTeamIds.includes(clubId))

            const statusBadgeClass =
              status === 'Titulaire'
                ? 'badge--emerald'
                : status === 'Réserviste'
                ? 'badge--neutral'
                : status === 'En poste'
                ? 'badge--blue'
                : status === 'Retraité'
                ? 'badge--neutral'
                : 'badge--amber'

            const borderColor = getRoleBorderColor(person, isAlive)

            return (
              <tr key={person.id} className="player-fav-row">
                <td className="player-fav-td" colSpan={3}>
                  <div
                    className={`player-fav-card ${isAlive ? 'is-alive' : 'is-inactive'}`}
                    style={{ borderLeftColor: borderColor }}
                  >
                    {/* Ligne 1 : Identité, Club, Statut & Étoile */}
                    <div className="player-fav-header">
                      <div className="player-fav-identity">
                        <PersonLink
                          person={{
                            ...person,
                            position: person.assignedPosition ?? person.position,
                          }}
                          showPositionBadge={true}
                        />
                        {club && (
                          <span className="player-fav-club-group">
                            <span className="player-fav-sep" aria-hidden="true">·</span>
                            <Link
                              className="player-fav-club"
                              to={`/equipes/${encodeURIComponent(club.id)}`}
                              title={`Fiche de ${club.name}`}
                            >
                              {club.name}
                            </Link>
                          </span>
                        )}
                        {isLoan && (
                          <span
                            className="player-fav-loan-tag"
                            title={`En prêt de ${app?.clubsById.get(person.loanedFromClubId!)?.name ?? 'club prêteur'}`}
                          >
                            En prêt
                          </span>
                        )}
                      </div>
                      <div className="player-fav-header-actions">
                        <span className={`badge ${statusBadgeClass} player-fav-status-badge`}>
                          {status}
                        </span>
                        <PlayerFavoriteButton person={person} />
                      </div>
                    </div>

                    {/* Ligne 2 : Bilan de la saison */}
                    <div className="player-fav-sub">
                      <div className="player-fav-stats-wrap">
                        <span className="player-fav-stat-pill">
                          <span className="player-fav-pill-icon" aria-hidden="true">📊</span>
                          <strong>{coach ? `${person.coachSkill ?? '—'}/30 · entraîneur` : `${count} match${count > 1 ? 's' : ''} joué${count > 1 ? 's' : ''}`}</strong>
                        </span>
                        {!coach && (
                          <span className="player-fav-stat-pill">
                            <span className="player-fav-pill-icon" aria-hidden="true">
                              {person.assignedPosition === 'DEFENDER' || (!person.assignedPosition && person.position === 'DEFENDER') ? '🛡️' : '⚽'}
                            </span>
                            <span>
                              {person.assignedPosition === 'DEFENDER' || (!person.assignedPosition && person.position === 'DEFENDER')
                                ? `${stats?.defensiveStops ?? 0} arrêt${(stats?.defensiveStops ?? 0) > 1 ? 's' : ''} défensif${(stats?.defensiveStops ?? 0) > 1 ? 's' : ''}`
                                : `${stats?.goals ?? 0} but${(stats?.goals ?? 0) > 1 ? 's' : ''}`}
                            </span>
                          </span>
                        )}
                        {isLoan && (
                          <span className="player-fav-loan-origin">
                            (prêté par {app?.clubsById.get(person.loanedFromClubId!)?.name ?? 'club prêteur'})
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Ligne 3 : Match du tour */}
                    <div className="player-fav-match-block">
                      {match ? (
                        <div className="player-fav-match-row">
                          <div className="player-fav-opp-info">
                            <span className="player-fav-tour-badge">T{round.number}</span>
                            <span className="player-fav-opp-name" title={`Adversaire : ${opponent?.name ?? opponentId}`}>
                              Face à {opponent?.name ?? opponentId}
                            </span>
                          </div>
                          <div className="player-fav-match-actions">
                            {result ? (
                              <Link
                                className={`fav-score-pill ${stats?.isStarter ? (result.winnerId === clubId ? 'is-win' : 'is-loss') : 'is-neutral'}`}
                                to={`/matchs/${encodeURIComponent(match.id)}`}
                                title="Consulter la feuille de match"
                              >
                                {result.homeScore}–{result.awayScore}{result.isExtraTime ? ' (a.p.)' : ''}
                              </Link>
                            ) : (
                              <Link
                                className="player-fav-match-link"
                                to={`/matchs/${encodeURIComponent(match.id)}`}
                              >
                                Voir le match →
                              </Link>
                            )}
                            {result && stats?.isStarter && (
                              <span className={`fav-outcome-pill ${result.winnerId === clubId ? 'is-win' : 'is-loss'}`}>
                                {result.winnerId === clubId ? 'Victoire' : 'Défaite'}
                              </span>
                            )}
                            {!stats?.isStarter && (
                              <span className="player-fav-bench-badge">
                                {coach ? 'Entraîneur · match du club' : 'Non aligné · match du club'}
                              </span>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="player-fav-idle-row">
                          <span className="player-fav-tour-badge">T{round.number}</span>
                          <span className="player-fav-idle-msg">
                            {person.isRetired
                              ? 'Carrière terminée'
                              : !clubId
                              ? 'Aucun match'
                              : round.byeTeamIds.includes(clubId)
                              ? '⭐ Club exempté ce tour'
                              : session?.championId === clubId
                              ? '🏆 Club champion'
                              : round.isCurrent && !session?.activeTeamIds.includes(clubId)
                              ? 'Club éliminé'
                              : 'Pas de match ce tour'}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
