import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import type { Commune } from '../geography/types'
import type { Club } from '../teams/types'
import type { RoundView } from './cupSelectors'
import { useOptionalCupApp } from '../../app/CupAppContext'
import { computeRoundJournal } from './roundJournal'
import { FavoriteStarButton } from '../teams/FavoriteStarButton'
import { departmentLabel } from '../geography/territoryLabels'
import { TeamTrophyBadges } from '../teams/TeamTrophyBadges'
import { PlayerTrackingTable } from '../persons/PlayerTrackingTable'

type Props = Readonly<{
  round: RoundView
  byId: Map<string, Club | Commune>
  onRunMatch?: (matchId: string) => void
}>

export function CupRightPanel({ round, byId, onRunMatch }: Props) {
  const [panelTab, setPanelTab] = useState<'favorites' | 'players' | 'journal'>('favorites')
  const app = useOptionalCupApp()

  const favoriteIds = app?.favoriteTeamIds ?? []
  const session = app?.session

  // Memoized journal analysis
  const journal = useMemo(() => {
    return computeRoundJournal(round, byId)
  }, [round, byId])

  // Compute status for each favorite club with eliminated clubs at the bottom
  const favoritesInfo = useMemo(() => {
    const list = favoriteIds.map((id, index) => {
      const team = byId.get(id)
      const color = app?.getFavoriteColor(id) ?? '#38bdf8'

      if (!team) {
        return {
          id,
          index,
          team: undefined,
          color,
          isAlive: false,
          isChampion: false,
          match: undefined,
          isBye: false,
          isHome: false,
          result: undefined,
          opponent: undefined,
        }
      }

      // Check active status in session
      const isAlive = session?.activeTeamIds.includes(id) ?? true
      const isChampion = session?.championId === id

      // Check role in current round view
      const match = round.matches.find(
        (m) => m.homeTeamId === id || m.awayTeamId === id,
      )
      const isBye = (round.byeTeamIds ?? []).includes(id)
      const result = match ? round.results[match.id] : undefined
      const isHome = match ? match.homeTeamId === id : false
      const opponentId = match
        ? (isHome ? match.awayTeamId : match.homeTeamId)
        : undefined
      const opponent = opponentId ? byId.get(opponentId) : undefined

      return {
        id,
        index,
        team,
        color,
        isAlive,
        isChampion,
        match,
        isBye,
        isHome,
        result,
        opponent,
      }
    })

    // Tri STABLE :
    // 1. Équipes en lice (isAlive) EN HAUT, équipes éliminées EN BAS
    // 2. Ordre strictement stable pendant le tour (a.index - b.index) : pas de réordonnancement lors du clic sur Jouer !
    return list.sort((a, b) => {
      if (a.isAlive !== b.isAlive) {
        return a.isAlive ? -1 : 1
      }
      return a.index - b.index
    })
  }, [favoriteIds, byId, session, round, app])

  const aliveFavorites = useMemo(
    () => favoritesInfo.filter((f) => f.team && f.isAlive),
    [favoritesInfo]
  )
  const eliminatedFavorites = useMemo(
    () => favoritesInfo.filter((f) => f.team && !f.isAlive),
    [favoritesInfo]
  )

  const suggestedIds = ['75056', '13055', '69123']

  const renderFavoriteCard = (fav: (typeof favoritesInfo)[number]) => {
    if (!fav.team) return null
    const isFinished = Boolean(fav.result)
    const isWon = fav.result?.winnerId === fav.id
    const match = fav.match
    const opponent = fav.opponent

    // Détails de l'adversaire
    const opponentStrength =
      opponent && 'strength' in opponent && typeof opponent.strength === 'number'
        ? opponent.strength.toFixed(1)
        : undefined

    const opponentScore = match
      ? match.homeTeamId === fav.id
        ? fav.result?.awayScore
        : fav.result?.homeScore
      : undefined
    const favScore = match
      ? match.homeTeamId === fav.id
        ? fav.result?.homeScore
        : fav.result?.awayScore
      : undefined

    const favStrength =
      fav.team && 'strength' in fav.team && typeof fav.team.strength === 'number'
        ? fav.team.strength.toFixed(1)
        : undefined

    return (
      <div
        key={fav.id}
        className={`favorite-card ${fav.isAlive ? 'is-alive' : 'is-eliminated'}`}
        style={{ borderLeftColor: fav.color }}
      >
        {/* Ligne 1 : En-tête du club favori */}
        <div className="fav-card-header">
          <div className="fav-club-identity">
            <span
              className="favorite-color-dot"
              style={{ background: fav.color }}
              aria-hidden="true"
            />
            <Link
              to={`/equipes/${fav.id}`}
              className="fav-club-name"
              title={`Voir la fiche de ${fav.team.name}`}
            >
              {fav.team.name}
            </Link>
            <span className="fav-club-dept">({fav.team.departmentId})</span>
            <TeamTrophyBadges teamId={fav.id} size="xs" />
          </div>

          <div className="fav-header-actions">
            {fav.isChampion ? (
              <span className="badge badge--gold fav-status-badge">
                🏆 Champion
              </span>
            ) : fav.isAlive ? (
              <span className="badge badge--emerald fav-status-badge">
                En lice
              </span>
            ) : (
              <span className="badge badge--neutral fav-status-badge">
                Éliminé
              </span>
            )}
            <FavoriteStarButton
              teamId={fav.id}
              teamName={fav.team.name}
              size="sm"
            />
          </div>
        </div>

        {/* Ligne 1 bis : Attributs du favori (force, population, domicile/extérieur) */}
        <div className="fav-club-sub">
          {favStrength && (
            <span className="fav-meta-pill fav-meta-strength" title="Force du club favori">
              ⚡ Force {favStrength}
            </span>
          )}
          <span className="fav-meta-pill fav-meta-pop" title="Population">
            👥 {fav.team.population.toLocaleString('fr-FR')} hab.
          </span>
          {match && (
            <span
              className={`fav-location-pill ${fav.isHome ? 'is-home' : 'is-away'}`}
              title={fav.isHome ? 'Match joué à domicile' : 'Match joué à l’extérieur'}
            >
              {fav.isHome ? '🏠 Reçoit' : '✈️ Déplacement'}
            </span>
          )}
        </div>

        {/* Bloc 2 : Affiche / Match / Adversaire */}
        {fav.isBye ? (
          <div className="fav-match-box is-bye">
            <span className="fav-bye-badge">⭐ Exempté ce tour</span>
            <span className="fav-bye-sub">Qualifié d’office pour le Tour {round.number + 1}</span>
          </div>
        ) : match && opponent ? (
          <div className="fav-match-box">
            {/* Ligne adversaire : nom et département */}
            <div className="fav-opp-row">
              <span className="fav-opp-prefix">
                {fav.isHome ? 'Adversaire :' : 'Chez :'}
              </span>
              <Link
                to={`/equipes/${opponent.id}`}
                className="fav-opp-name"
                title={`Fiche de ${opponent.name}`}
              >
                {opponent.name}
              </Link>
              <span className="fav-opp-dept">({opponent.departmentId})</span>
            </div>

            {/* Ligne stats adversaire : FORCE BIEN VISIBLE & population */}
            <div className="fav-opp-details">
              {opponentStrength && (
                <span className="fav-opp-strength-badge" title="Force de l'adversaire">
                  ⚡ Force {opponentStrength}
                </span>
              )}
              <span className="fav-opp-pop-tag">
                👥 {opponent.population.toLocaleString('fr-FR')} hab.
              </span>
            </div>

            {/* Ligne Score & Actions */}
            <div className="fav-match-footer">
              {isFinished ? (
                <div className="fav-match-score-block">
                  <span className={`fav-score-pill ${isWon ? 'is-win' : 'is-loss'}`}>
                    {favScore} – {opponentScore}
                  </span>
                  <span className={`fav-outcome-pill ${isWon ? 'is-win' : 'is-loss'}`}>
                    {isWon ? '✓ Qualifié' : '✗ Éliminé'}
                    {fav.result?.isExtraTime && <small className="fav-ap-tag">a.p.</small>}
                  </span>
                </div>
              ) : (
                <div className="fav-match-pending-block">
                  <span className="fav-pending-label">Match à jouer</span>
                  {round.isCurrent && onRunMatch && (
                    <button
                      type="button"
                      className="btn-accent btn-sm fav-play-btn"
                      onClick={() => onRunMatch(match.id)}
                      title="Simuler ce match"
                    >
                      ⚡ Jouer
                    </button>
                  )}
                </div>
              )}

              <Link
                to={`/matchs/${encodeURIComponent(match.id)}`}
                className="fav-sheet-link"
                title="Consulter la feuille de match"
              >
                Feuille de match →
              </Link>
            </div>
          </div>
        ) : (
          <div className="fav-match-box is-idle">
            <span className="fav-idle-text">
              {fav.isAlive
                ? '⏳ En attente du prochain tour'
                : 'Éliminé de la compétition'}
            </span>
            <Link to={`/equipes/${fav.id}`} className="fav-sheet-link">
              Parcours →
            </Link>
          </div>
        )}
      </div>
    )
  }

  return (
    <aside className="cup-right-panel" aria-label="Volet des favoris et journal">
      {/* Tab Switcher */}
      <div className="right-panel-tabs">
        <button
          type="button"
          className={`right-panel-tab ${panelTab === 'favorites' ? 'is-active' : ''}`}
          onClick={() => setPanelTab('favorites')}
        >
          <span>⭐ Clubs</span>
          <span className="panel-tab-count">{favoriteIds.length}</span>
        </button>
        <button type="button" className={`right-panel-tab ${panelTab === 'players' ? 'is-active' : ''}`}
          aria-label={`Joueurs suivis (${app?.favoritePersonIds?.length ?? 0})`}
          aria-pressed={panelTab === 'players'} onClick={() => setPanelTab('players')}>
          <span>Joueurs</span><span className="panel-tab-count">{app?.favoritePersonIds?.length ?? 0}</span>
        </button>
        <button
          type="button"
          className={`right-panel-tab ${panelTab === 'journal' ? 'is-active' : ''}`}
          onClick={() => setPanelTab('journal')}
        >
          <span>📰 Journal</span>
          {journal.upsets.length > 0 && (
            <span className="panel-tab-badge">{journal.upsets.length}</span>
          )}
        </button>
      </div>

      <div className="right-panel-content">
        {panelTab === 'players' && <PlayerTrackingTable round={round} />}
        {/* TAB 1: FAVORITES */}
        {panelTab === 'favorites' && (
          <div className="favorites-view">
            {favoritesInfo.length === 0 ? (
              <div className="favorites-empty">
                <div className="favorites-empty-icon">⭐</div>
                <h4>Aucun club suivi</h4>
                <p>
                  Cliquez sur l'étoile <strong>☆</strong> à côté d'un club dans la liste des matchs ou l'onglet Équipes pour suivre ses résultats ici.
                </p>
                <div className="favorites-suggestions">
                  <small>Suggestions rapides :</small>
                  <div className="suggestions-chips">
                    {suggestedIds.map((id) => {
                      const comm = byId.get(id)
                      if (!comm) return null
                      return (
                        <button
                          key={id}
                          type="button"
                          className="suggestion-chip"
                          onClick={() => app?.toggleFavorite(id)}
                        >
                          + {comm.name}
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>
            ) : (
              <div className="favorites-groups-container">
                {/* 1. Clubs en lice en priorité au sommet */}
                {aliveFavorites.length > 0 && (
                  <div className="favorites-group">
                    {eliminatedFavorites.length > 0 && (
                      <div className="favorites-section-header is-alive">
                        <span>🟢 En lice ({aliveFavorites.length})</span>
                      </div>
                    )}
                    <div className="favorites-list">
                      {aliveFavorites.map(renderFavoriteCard)}
                    </div>
                  </div>
                )}

                {/* 2. Clubs éliminés placés en bas */}
                {eliminatedFavorites.length > 0 && (
                  <div className="favorites-group is-eliminated-group">
                    <div className="favorites-section-header is-eliminated">
                      <span>⚪ Clubs éliminés ({eliminatedFavorites.length})</span>
                    </div>
                    <div className="favorites-list">
                      {eliminatedFavorites.map(renderFavoriteCard)}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: JOURNAL DU TOUR */}
        {panelTab === 'journal' && (
          <div className="journal-view">
            {/* Journal Header */}
            <div className="journal-banner">
              <span className="journal-kicker">La Gazette du Tour</span>
              <h4 className="journal-title">
                Faits Marquants · Tour {round.number}
              </h4>
              <p className="journal-phase">Phase : {round.phase}</p>
            </div>

            {/* KPI Stats */}
            <div className="journal-kpis">
              <div className="journal-kpi-item">
                <small>Matchs joués</small>
                <strong>
                  {journal.completedMatches} / {journal.totalMatches}
                </strong>
              </div>
              <div className="journal-kpi-item">
                <small>Total Buts</small>
                <strong>{journal.totalGoals}</strong>
              </div>
              <div className="journal-kpi-item">
                <small>Moy. / match</small>
                <strong>{journal.averageGoals}</strong>
              </div>
            </div>

            {/* Section 1: UPSETS (Exploits) */}
            <section className="journal-section">
              <h5 className="journal-section-title">
                <span>🔥 Les Grands Exploits</span>
                <span className="badge badge--gold">{journal.upsets.length}</span>
              </h5>

              {journal.upsets.length === 0 ? (
                <p className="journal-empty-note">
                  {journal.completedMatches === 0
                    ? 'Simulez les matchs du tour pour révéler les exploits du jour.'
                    : 'Aucun exploit majeur recensé sur les matchs joués de ce tour.'}
                </p>
              ) : (
                <div className="journal-upsets-list">
                  {journal.upsets.map((upset) => (
                    <div className="journal-upset-card" key={upset.match.id}>
                      <div className="upset-header">
                        <span className="upset-badge">Exploit ⚡</span>
                        <span className="upset-diff">
                          +{upset.popDifference.toLocaleString('fr-FR')} hab. d'écart
                        </span>
                      </div>
                      <p className="upset-headline">{upset.headline}</p>
                      <div className="upset-teams-row">
                        <div className="upset-winner">
                          <strong>{upset.winner.name}</strong>
                          <small>{upset.winner.population.toLocaleString('fr-FR')} hab.</small>
                        </div>
                        <Link
                          to={`/matchs/${encodeURIComponent(upset.match.id)}`}
                          className="score-badge-link"
                          style={{ fontSize: '0.82rem', padding: '0.15rem 0.45rem' }}
                        >
                          {upset.result.homeScore} – {upset.result.awayScore}
                        </Link>
                        <div className="upset-loser">
                          <span>{upset.loser.name}</span>
                          <small>{upset.loser.population.toLocaleString('fr-FR')} hab.</small>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Section 2: TOP CLASHES */}
            <section className="journal-section">
              <h5 className="journal-section-title">
                <span>⚔️ Les Chocs au Sommet</span>
              </h5>
              <div className="journal-clashes-list">
                {journal.topClashes.map((clash) => (
                  <div className="journal-clash-card" key={clash.match.id}>
                    <div className="clash-names">
                      <strong>{clash.home.name}</strong> vs <strong>{clash.away.name}</strong>
                    </div>
                    <div className="clash-meta">
                      <span>{clash.combinedPopulation.toLocaleString('fr-FR')} hab. cumulés</span>
                      {clash.result ? (
                        <Link
                          to={`/matchs/${encodeURIComponent(clash.match.id)}`}
                          className="score-badge-link is-live-result"
                          style={{ fontSize: '0.78rem', padding: '0.15rem 0.4rem' }}
                        >
                          {clash.result.homeScore} – {clash.result.awayScore}
                        </Link>
                      ) : (
                        <span className="badge badge--neutral">À jouer</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Section 3: FESTIVAL OFFENSIF */}
            {journal.highestScoring && (
              <section className="journal-section">
                <h5 className="journal-section-title">
                  <span>🎯 Festival Offensif</span>
                </h5>
                <div className="journal-festival-card">
                  <div className="festival-headline">
                    <span>{journal.highestScoring.totalGoals} buts marqués</span>
                  </div>
                  <div className="festival-match">
                    <span>{journal.highestScoring.home.name}</span>
                    <Link
                      to={`/matchs/${encodeURIComponent(journal.highestScoring.match.id)}`}
                      className="score-badge-link is-live-result"
                      style={{ fontSize: '0.85rem', padding: '0.2rem 0.5rem' }}
                    >
                      {journal.highestScoring.result.homeScore} –{' '}
                      {journal.highestScoring.result.awayScore}
                    </Link>
                    <span>{journal.highestScoring.away.name}</span>
                  </div>
                </div>
              </section>
            )}

            {/* Section 4: PETIT POUCET DU TOUR */}
            {journal.petitPoucet && (
              <section className="journal-section">
                <h5 className="journal-section-title">
                  <span>🐣 Le Petit Poucet du Tour {round.number}</span>
                </h5>
                <div className="journal-poucet-card">
                  <div className="poucet-info">
                    <Link
                      to={`/equipes/${journal.petitPoucet.commune.id}`}
                      className="poucet-name"
                    >
                      {journal.petitPoucet.commune.name}
                    </Link>
                    <span className="poucet-pop">
                      Seulement{' '}
                      <strong>
                        {journal.petitPoucet.commune.population.toLocaleString('fr-FR')}
                      </strong>{' '}
                      habitants !
                    </span>
                    <small className="poucet-dept">
                      Département {departmentLabel(journal.petitPoucet.commune.departmentId)}
                    </small>
                  </div>
                  {journal.petitPoucet.status === 'QUALIFIED' && (
                    <span className="badge badge--emerald">Qualifié Tour {round.number + 1}</span>
                  )}
                  {journal.petitPoucet.status === 'BYE' && (
                    <span className="badge badge--gold">Exempté Tour {round.number}</span>
                  )}
                  {journal.petitPoucet.status === 'PENDING' && (
                    <span className="badge badge--blue">En lice Tour {round.number}</span>
                  )}
                  {journal.petitPoucet.status === 'ELIMINATED' && (
                    <span className="badge badge--neutral">Éliminé Tour {round.number}</span>
                  )}
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </aside>
  )
}
