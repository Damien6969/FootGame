import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import type { Person, PlayerPosition } from '../persons/types'
import type { Club } from '../teams/types'
import type { CupSession, SeasonArchive } from '../storage/cupRepository'
import {
  extractBallonOrHistory,
  extractTopScorersHistory,
  extractTopDefendersHistory,
  extractAllAwardsHistory,
  getOtherIndividualHonors,
  type PlayerPalmaresRecord,
  type BallonOrEditionRecord,
  type TopScorerEditionRecord,
  type TopDefenderEditionRecord,
  type AllAwardsEditionRecord,
} from '../history/playerPalmaresSelectors'
import {
  convertAwardSummariesToBallonOr,
  convertAwardSummariesToTopScorers,
  convertAwardSummariesToTopDefenders,
  convertAwardSummariesToAllAwards,
} from '../history/playerPalmaresStorage'
import { usePlayerPalmares } from '../history/usePlayerPalmares'
import { PersonLink } from '../persons/PersonLink'
import { TeamLink } from '../teams/TeamLink'
import { NationalityBadge } from '../persons/NationalityBadge'
import { departmentLabel } from '../geography/territoryLabels'
import { formatPosition } from '../persons/personSelectors'
import { getStageBadgeClass } from '../competition/echelonColors'
import { getSeasonAwards } from '../awards/seasonAwards'
import './palmaresPlayers.css'

export type PlayerSubTab =
  | 'classement'
  | 'ballon-or'
  | 'buteurs'
  | 'defenseurs'
  | 'tous'
  | 'all-views'

interface PalmaresPlayersViewProps {
  completedEditions: SeasonArchive[]
  persons: readonly Person[]
  clubsById: Map<string, Club>
  activeSession?: CupSession | null
}

export function PalmaresPlayersView({
  completedEditions,
  persons,
  clubsById,
  activeSession,
}: PalmaresPlayersViewProps) {
  const [subTab, setSubTab] = useState<PlayerSubTab>('classement')

  const {
    rankedPlayers,
    awardSummaries,
    loading: palmaresLoading,
    error: palmaresError,
  } = usePlayerPalmares({
    completedEditions,
    persons,
    clubsById,
    activeSession,
  })

  const personsById = useMemo(() => {
    const map = new Map<string, Person>()
    for (const p of persons) map.set(p.id, p)
    for (const ed of completedEditions) {
      if (ed.persons) {
        for (const p of ed.persons) {
          if (!map.has(p.id)) map.set(p.id, p)
        }
      }
    }
    return map
  }, [persons, completedEditions])

  // Count editions with individual awards for fast counts
  const awardsEditionsCount = useMemo(() => {
    if (awardSummaries.length > 0) return awardSummaries.length
    return completedEditions.filter((e) => Boolean(e.individualAwards?.awards?.length)).length
  }, [awardSummaries, completedEditions])

  // Lightweight extraction of latest award winners for highlight KPI cards (reads at most 1 edition or summaries)
  const { latestBallonOr, latestScorer, latestDefender } = useMemo(() => {
    if (awardSummaries.length > 0) {
      const bOrList = convertAwardSummariesToBallonOr(awardSummaries, personsById, clubsById)
      const scList = convertAwardSummariesToTopScorers(awardSummaries, personsById, clubsById)
      const defList = convertAwardSummariesToTopDefenders(awardSummaries, clubsById)
      return {
        latestBallonOr: bOrList[0],
        latestScorer: scList[0],
        latestDefender: defList[0],
      }
    }

    let bOr: BallonOrEditionRecord | undefined
    let sc: TopScorerEditionRecord | undefined
    let def: TopDefenderEditionRecord | undefined

    for (const edition of completedEditions) {
      const snapshot = getSeasonAwards(edition)
      if (!snapshot) continue

      if (!bOr) {
        const award = snapshot.awards.find((a) => a.id === 'ballon-or')
        if (award && award.winners.length > 0) {
          const winner = award.winners[0]
          bOr = {
            year: snapshot.year,
            winner,
            winnerPerson: personsById.get(winner.personId),
            winnerClub: clubsById.get(winner.clubId),
            nominees: [],
            minimumMatches: snapshot.minimumMatches,
          }
        }
      }

      if (!sc) {
        const award = snapshot.awards.find((a) => a.id === 'top-scorer')
        if (award && award.winners.length > 0) {
          const winner = award.winners[0]
          const matches = winner.matchesPlayed ?? 0
          const goals = winner.goals ?? 0
          sc = {
            year: snapshot.year,
            winner,
            winnerPerson: personsById.get(winner.personId),
            winnerClub: clubsById.get(winner.clubId),
            goals,
            matchesPlayed: matches,
            ratio: matches > 0 ? goals / matches : 0,
            shots: winner.shots ?? 0,
            nominees: [],
            bestAttackerNominees: [],
          }
        }
      }

      if (!def) {
        const stopsAward = snapshot.awards.find((a) => a.id === 'top-stops')
        const bestDefAward = snapshot.awards.find((a) => a.id === 'best-defender')
        const winner = stopsAward?.winners[0] ?? bestDefAward?.winners[0]
        if (winner) {
          def = {
            year: snapshot.year,
            stopsWinner: stopsAward?.winners[0] ?? winner,
            stopsWinnerClub: clubsById.get((stopsAward?.winners[0] ?? winner).clubId),
            stopsCount: stopsAward?.winners[0]?.defensiveStops ?? winner.defensiveStops ?? 0,
            stopsNominees: [],
            bestDefenderNominees: [],
          }
        }
      }

      if (bOr && sc && def) break
    }

    return { latestBallonOr: bOr, latestScorer: sc, latestDefender: def }
  }, [awardSummaries, completedEditions, personsById, clubsById])

  // Lazy award histories: computed only when the user selects their sub-tab
  const ballonOrRecords = useMemo(() => {
    if (subTab !== 'ballon-or' && subTab !== 'all-views') return []
    if (awardSummaries.length > 0) {
      return convertAwardSummariesToBallonOr(awardSummaries, personsById, clubsById)
    }
    return extractBallonOrHistory(completedEditions, personsById, clubsById)
  }, [subTab, awardSummaries, completedEditions, personsById, clubsById])

  const scorerRecords = useMemo(() => {
    if (subTab !== 'buteurs' && subTab !== 'all-views') return []
    if (awardSummaries.length > 0) {
      return convertAwardSummariesToTopScorers(awardSummaries, personsById, clubsById)
    }
    return extractTopScorersHistory(completedEditions, personsById, clubsById)
  }, [subTab, awardSummaries, completedEditions, personsById, clubsById])

  const defenderRecords = useMemo(() => {
    if (subTab !== 'defenseurs' && subTab !== 'all-views') return []
    if (awardSummaries.length > 0) {
      return convertAwardSummariesToTopDefenders(awardSummaries, clubsById)
    }
    return extractTopDefendersHistory(completedEditions, clubsById)
  }, [subTab, awardSummaries, completedEditions, clubsById])

  const allAwardsRecords = useMemo(() => {
    if (subTab !== 'tous' && subTab !== 'all-views') return []
    if (awardSummaries.length > 0) {
      return convertAwardSummariesToAllAwards(awardSummaries)
    }
    return extractAllAwardsHistory(completedEditions)
  }, [subTab, awardSummaries, completedEditions])

  // Top highlight stats
  const topDecorated = rankedPlayers[0]

  if (palmaresLoading && rankedPlayers.length === 0 && completedEditions.length > 0) {
    return (
      <section className="status-panel" style={{ marginTop: 'var(--space-4)' }}>
        Chargement du palmarès des joueurs…
      </section>
    )
  }

  if (palmaresError && rankedPlayers.length === 0) {
    return (
      <section className="status-panel" role="alert" style={{ marginTop: 'var(--space-4)' }}>
        Erreur lors du chargement du palmarès : {palmaresError}
      </section>
    )
  }

  if (rankedPlayers.length === 0 && awardsEditionsCount === 0 && !latestBallonOr) {
    return (
      <div className="empty-bracket" style={{ marginTop: 'var(--space-4)' }}>
        <h3>Aucune distinction individuelle décernée</h3>
        <p>
          Les récompenses individuelles et les titres de joueurs sont enregistrés à l'issue de chaque finale
          nationale de la Coupe des communes. Menez vos équipes vers la victoire pour inaugurer le palmarès des joueurs !
        </p>
      </div>
    )
  }

  return (
    <div className="player-palmares-view">
      {/* Highlight KPI Cards */}
      <div className="player-palmares-kpi-grid">
        {/* Card 1: Recordman des Titres */}
        {topDecorated && (
          <div className="player-palmares-kpi-card player-palmares-kpi-card--gold">
            <div className="player-palmares-kpi-icon" aria-hidden="true">
              👑
            </div>
            <div className="player-palmares-kpi-body">
              <span className="player-palmares-kpi-label">Recordman de Titres</span>
              <span className="player-palmares-kpi-name">
                <Link to={`/personnes/${topDecorated.person.id}`} style={{ color: 'inherit', textDecoration: 'none' }}>
                  {topDecorated.person.firstName} {topDecorated.person.lastName}
                </Link>
              </span>
              <span className="player-palmares-kpi-sub">
                <span className="player-palmares-kpi-stat">🏆 {topDecorated.totalTitles} titres</span>
                {topDecorated.currentOrLastClub && ` · ${topDecorated.currentOrLastClub.name}`}
              </span>
            </div>
          </div>
        )}

        {/* Card 2: Dernier Ballon d'Or */}
        {latestBallonOr && (
          <div className="player-palmares-kpi-card player-palmares-kpi-card--amber">
            <div className="player-palmares-kpi-icon" aria-hidden="true">
              🌕
            </div>
            <div className="player-palmares-kpi-body">
              <span className="player-palmares-kpi-label">Dernier Ballon d'Or ({latestBallonOr.year})</span>
              <span className="player-palmares-kpi-name">
                <Link to={`/personnes/${latestBallonOr.winner.personId}`} style={{ color: 'inherit', textDecoration: 'none' }}>
                  {latestBallonOr.winner.firstName} {latestBallonOr.winner.lastName}
                </Link>
              </span>
              <span className="player-palmares-kpi-sub">
                <span>{latestBallonOr.winner.clubName}</span>
                <span className="player-palmares-kpi-stat">· {latestBallonOr.winner.overallScore.toFixed(1)} pts</span>
              </span>
            </div>
          </div>
        )}

        {/* Card 3: Dernier Soulier d'Or */}
        {latestScorer && (
          <div className="player-palmares-kpi-card player-palmares-kpi-card--blue">
            <div className="player-palmares-kpi-icon" aria-hidden="true">
              👟
            </div>
            <div className="player-palmares-kpi-body">
              <span className="player-palmares-kpi-label">Soulier d'Or ({latestScorer.year})</span>
              <span className="player-palmares-kpi-name">
                <Link to={`/personnes/${latestScorer.winner.personId}`} style={{ color: 'inherit', textDecoration: 'none' }}>
                  {latestScorer.winner.firstName} {latestScorer.winner.lastName}
                </Link>
              </span>
              <span className="player-palmares-kpi-sub">
                <span className="player-palmares-kpi-stat">⚽ {latestScorer.goals} buts</span>
                <span> en {latestScorer.matchesPlayed} matchs</span>
              </span>
            </div>
          </div>
        )}

        {/* Card 4: Dernier Bouclier d'Or */}
        {latestDefender && latestDefender.stopsWinner && (
          <div className="player-palmares-kpi-card player-palmares-kpi-card--purple">
            <div className="player-palmares-kpi-icon" aria-hidden="true">
              🛡️
            </div>
            <div className="player-palmares-kpi-body">
              <span className="player-palmares-kpi-label">Bouclier d'Or ({latestDefender.year})</span>
              <span className="player-palmares-kpi-name">
                <Link to={`/personnes/${latestDefender.stopsWinner.personId}`} style={{ color: 'inherit', textDecoration: 'none' }}>
                  {latestDefender.stopsWinner.firstName} {latestDefender.stopsWinner.lastName}
                </Link>
              </span>
              <span className="player-palmares-kpi-sub">
                <span className="player-palmares-kpi-stat">🛡️ {latestDefender.stopsCount} arrêts</span>
                <span> · {latestDefender.stopsWinner.clubName}</span>
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Sub-Navigation Tabs */}
      <nav className="player-palmares-subnav" aria-label="Sous-onglets du palmarès joueurs">
        <button
          type="button"
          className={`player-subnav-btn ${subTab === 'classement' ? 'is-active' : ''}`}
          onClick={() => setSubTab('classement')}
        >
          <span>⭐</span> Classement Historique ({rankedPlayers.length})
        </button>
        <button
          type="button"
          className={`player-subnav-btn ${subTab === 'ballon-or' ? 'is-active' : ''}`}
          onClick={() => setSubTab('ballon-or')}
        >
          <span>🌕</span> Tableau Ballon d'Or ({ballonOrRecords.length || awardsEditionsCount})
        </button>
        <button
          type="button"
          className={`player-subnav-btn ${subTab === 'buteurs' ? 'is-active' : ''}`}
          onClick={() => setSubTab('buteurs')}
        >
          <span>👟</span> Souliers d'Or · Buteurs ({scorerRecords.length || awardsEditionsCount})
        </button>
        <button
          type="button"
          className={`player-subnav-btn ${subTab === 'defenseurs' ? 'is-active' : ''}`}
          onClick={() => setSubTab('defenseurs')}
        >
          <span>🛡️</span> Meilleurs Défenseurs ({defenderRecords.length || awardsEditionsCount})
        </button>
        <button
          type="button"
          className={`player-subnav-btn ${subTab === 'tous' ? 'is-active' : ''}`}
          onClick={() => setSubTab('tous')}
        >
          <span>📜</span> Toutes les Distinctions
        </button>
        <button
          type="button"
          className={`player-subnav-btn ${subTab === 'all-views' ? 'is-active' : ''}`}
          onClick={() => setSubTab('all-views')}
        >
          <span>👁️</span> Tout Afficher
        </button>
      </nav>

      {/* SUB-TAB 1: CLASSEMENT HISTORIQUE DES JOUEURS */}
      {(subTab === 'classement' || subTab === 'all-views') && (
        <section className="palmares-section-box" aria-labelledby="heading-player-leaderboard">
          <header className="palmares-section-header">
            <h3 id="heading-player-leaderboard" className="palmares-section-title">
              <span>⭐</span> Classement Historique des Joueurs les Plus Titrés
            </h3>
            <p className="palmares-section-desc">
              Priorité : France, Ballon d’Or, Soulier et Bouclier d’Or, Conférence, Région, Département, puis total. Titres cumulés comme joueur et entraîneur.
            </p>
          </header>

          <PalmaresPlayersLeaderboardTable
            rankedPlayers={rankedPlayers}
            clubsById={clubsById}
            defaultLimit={20}
          />
        </section>
      )}

      {/* SUB-TAB 2: TABLEAU DU BALLON D'OR */}
      {(subTab === 'ballon-or' || subTab === 'all-views') && (
        <section className="palmares-section-box" aria-labelledby="heading-ballon-or">
          <header className="palmares-section-header">
            <h3 id="heading-ballon-or" className="palmares-section-title">
              <span>🌕</span> Tableau d'Honneur du Ballon d'Or
            </h3>
            <p className="palmares-section-desc">
              Décerné à la fin de chaque édition au joueur le plus complet de la Coupe après examen des statistiques et vote du jury.
            </p>
          </header>

          <PalmaresBallonOrTable
            ballonOrRecords={ballonOrRecords}
            clubsById={clubsById}
          />
        </section>
      )}

      {/* SUB-TAB 3: TABLEAU DES MEILLEURS BUTEURS (SOULIER D'OR) */}
      {(subTab === 'buteurs' || subTab === 'all-views') && (
        <section className="palmares-section-box" aria-labelledby="heading-top-scorers">
          <header className="palmares-section-header">
            <h3 id="heading-top-scorers" className="palmares-section-title">
              <span>👟</span> Tableau d'Honneur des Meilleurs Buteurs (Soulier d'Or)
            </h3>
            <p className="palmares-section-desc">
              Récompense le meilleur buteur de chaque saison de la Coupe des communes, avec ses dauphins et statistiques de finition.
            </p>
          </header>

          <PalmaresScorersTable
            scorerRecords={scorerRecords}
            clubsById={clubsById}
          />
        </section>
      )}

      {/* SUB-TAB 4: TABLEAU DES MEILLEURS DÉFENSEURS & BOUCLIER D'OR */}
      {(subTab === 'defenseurs' || subTab === 'all-views') && (
        <section className="palmares-section-box" aria-labelledby="heading-top-defenders">
          <header className="palmares-section-header">
            <h3 id="heading-top-defenders" className="palmares-section-title">
              <span>🛡️</span> Tableau d'Honneur des Défenseurs & Bouclier d'Or
            </h3>
            <p className="palmares-section-desc">
              Le Bouclier d'Or couronne le roi des interventions défensives, et le trophée de Meilleur Défenseur distingue la note jury de l'édition.
            </p>
          </header>

          <PalmaresDefendersTable
            defenderRecords={defenderRecords}
            clubsById={clubsById}
          />
        </section>
      )}

      {/* SUB-TAB 5: TOUTES LES DISTINCTIONS INDIVIDUELLES PAR ÉDITION */}
      {(subTab === 'tous' || subTab === 'all-views') && (
        <section className="palmares-section-box" aria-labelledby="heading-all-awards">
          <header className="palmares-section-header">
            <h3 id="heading-all-awards" className="palmares-section-title">
              <span>📜</span> Tableau Complet de Toutes les Distinctions par Édition
            </h3>
            <p className="palmares-section-desc">
              Vue synthétique de l'ensemble des récompenses : Ballons d'Or, Souliers d'Or, Meilleurs Espoirs et distinctions de Conférence.
            </p>
          </header>

          <PalmaresAllAwardsTable
            allAwardsRecords={allAwardsRecords}
            clubsById={clubsById}
          />
        </section>
      )}
    </div>
  )
}

/* =========================================================================
   COMPOSANT 1: TABLEAU DU CLASSEMENT HISTORIQUE DES JOUEURS
   ========================================================================= */

function PalmaresPlayersLeaderboardTable({
  rankedPlayers,
  clubsById,
  defaultLimit = 20,
}: {
  rankedPlayers: PlayerPalmaresRecord[]
  clubsById: Map<string, Club>
  defaultLimit?: number | 'all'
}) {
  const [limit, setLimit] = useState<number | 'all'>(defaultLimit)
  const [page, setPage] = useState(0)
  const [searchQuery, setSearchQuery] = useState('')
  const [positionFilter, setPositionFilter] = useState<'ALL' | PlayerPosition | 'COACH'>('ALL')
  const [trophyFilter, setTrophyFilter] = useState<'ALL' | 'BALLON_OR' | 'CHAMPION_FRANCE'>('ALL')

  type SortKey =
    | 'rank'
    | 'name'
    | 'club'
    | 'ballonOr'
    | 'soulier'
    | 'bouclier'
    | 'indiv'
    | 'national'
    | 'conf'
    | 'region'
    | 'dept'
    | 'total'

  const [sortKey, setSortKey] = useState<SortKey>('rank')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      if (['ballonOr', 'soulier', 'bouclier', 'indiv', 'national', 'conf', 'region', 'dept', 'total'].includes(key)) {
        setSortDir('desc')
      } else {
        setSortDir('asc')
      }
    }
  }

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    return rankedPlayers.filter((r) => {
      // Filtre position
      if (positionFilter === 'COACH' && r.person.primaryRole !== 'COACH') return false
      if (positionFilter !== 'ALL' && positionFilter !== 'COACH' &&
        (r.person.primaryRole === 'COACH' || r.person.position !== positionFilter)) {
        return false
      }
      // Filtre trophée spécifique
      if (trophyFilter === 'BALLON_OR' && r.ballonOrCount === 0) {
        return false
      }
      if (trophyFilter === 'CHAMPION_FRANCE' && r.nationalTitles === 0) {
        return false
      }
      // Filtre texte
      if (q) {
        const fullName = `${r.person.firstName} ${r.person.lastName}`.toLowerCase()
        const clubName = (r.currentOrLastClub?.name ?? r.lastClubName ?? '').toLowerCase()
        const birthCity = (r.person.birthCommuneName ?? '').toLowerCase()
        const dept = r.person.birthDepartmentId ?? ''
        return (
          fullName.includes(q) ||
          clubName.includes(q) ||
          birthCity.includes(q) ||
          dept.includes(q)
        )
      }
      return true
    })
  }, [rankedPlayers, searchQuery, positionFilter, trophyFilter])

  const sorted = useMemo(() => {
    const list = [...filtered]
    list.sort((a, b) => {
      let cmp = 0
      switch (sortKey) {
        case 'rank':
          cmp = a.rank - b.rank
          break
        case 'name':
          cmp = `${a.person.lastName} ${a.person.firstName}`.localeCompare(
            `${b.person.lastName} ${b.person.firstName}`,
            'fr',
          )
          break
        case 'club': {
          const nameA = a.currentOrLastClub?.name ?? a.lastClubName ?? ''
          const nameB = b.currentOrLastClub?.name ?? b.lastClubName ?? ''
          cmp = nameA.localeCompare(nameB, 'fr')
          break
        }
        case 'ballonOr':
          cmp = a.ballonOrCount - b.ballonOrCount
          break
        case 'indiv':
          cmp = getOtherIndividualHonors(a).length - getOtherIndividualHonors(b).length
          break
        case 'soulier':
          cmp = a.topScorerCount - b.topScorerCount
          break
        case 'bouclier':
          cmp = a.topStopsCount - b.topStopsCount
          break
        case 'national':
          cmp = a.nationalTitles - b.nationalTitles
          break
        case 'conf':
          cmp = a.conferenceTitles - b.conferenceTitles
          break
        case 'region':
          cmp = a.regionTitles - b.regionTitles
          break
        case 'dept':
          cmp = a.departmentTitles - b.departmentTitles
          break
        case 'total':
          cmp = a.totalTitles - b.totalTitles
          break
      }
      return (sortDir === 'desc' ? -cmp : cmp) || a.rank - b.rank
    })
    return list
  }, [filtered, sortKey, sortDir])

  const visible = useMemo(() => {
    if (limit === 'all') return sorted.slice(page * 25, (page + 1) * 25)
    return sorted.slice(0, limit)
  }, [sorted, limit, page])

  const totalPages = Math.max(1, Math.ceil(sorted.length / 25))

  const getSortIcon = (key: SortKey) => {
    if (sortKey !== key) return <span className="sort-icon">⇅</span>
    return <span className="sort-icon">{sortDir === 'asc' ? '▲' : '▼'}</span>
  }

  return (
    <div>
      {/* Controls: Search, position filter, trophy filter, limit buttons */}
      <div className="palmares-table-controls">
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
          <input
            type="search"
            placeholder="Rechercher un joueur, un club, une ville…"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value)
              setPage(0)
            }}
            className="filter-input"
            style={{ width: '280px', maxWidth: '100%' }}
            aria-label="Recherche dans le classement des joueurs"
          />

          {/* Position filter */}
          <div className="palmares-chips-group">
            <button
              type="button"
              className={`palmares-chip-btn ${positionFilter === 'ALL' ? 'is-active' : ''}`}
              onClick={() => {
                setPositionFilter('ALL')
                setPage(0)
              }}
            >
              Tous les rôles
            </button>
            <button
              type="button"
              className={`palmares-chip-btn ${positionFilter === 'ATTACKER' ? 'is-active' : ''}`}
              onClick={() => {
                setPositionFilter('ATTACKER')
                setPage(0)
              }}
            >
              Attaquants
            </button>
            <button
              type="button"
              className={`palmares-chip-btn ${positionFilter === 'DEFENDER' ? 'is-active' : ''}`}
              onClick={() => {
                setPositionFilter('DEFENDER')
                setPage(0)
              }}
            >
              Défenseurs
            </button>
            <button
              type="button"
              className={`palmares-chip-btn ${positionFilter === 'COACH' ? 'is-active' : ''}`}
              onClick={() => { setPositionFilter('COACH'); setPage(0) }}
            >
              Entraîneurs
            </button>
          </div>

          {/* Trophy category filter */}
          <div className="palmares-chips-group">
            <button
              type="button"
              className={`palmares-chip-btn ${trophyFilter === 'BALLON_OR' ? 'is-active' : ''}`}
              onClick={() => {
                setTrophyFilter(trophyFilter === 'BALLON_OR' ? 'ALL' : 'BALLON_OR')
                setPage(0)
              }}
            >
              🌕 Ballon d'Or
            </button>
            <button
              type="button"
              className={`palmares-chip-btn ${trophyFilter === 'CHAMPION_FRANCE' ? 'is-active' : ''}`}
              onClick={() => {
                setTrophyFilter(trophyFilter === 'CHAMPION_FRANCE' ? 'ALL' : 'CHAMPION_FRANCE')
                setPage(0)
              }}
            >
              🏆 Champions de France
            </button>
          </div>
        </div>

        {/* Display limit chips */}
        <div className="palmares-chips-group">
          <button
            type="button"
            className={`palmares-chip-btn ${limit === 20 ? 'is-active' : ''}`}
            onClick={() => {
              setLimit(20)
              setPage(0)
            }}
          >
            Top 20
          </button>
          <button
            type="button"
            className={`palmares-chip-btn ${limit === 50 ? 'is-active' : ''}`}
            onClick={() => {
              setLimit(50)
              setPage(0)
            }}
          >
            Top 50
          </button>
          <button
            type="button"
            className={`palmares-chip-btn ${limit === 'all' ? 'is-active' : ''}`}
            onClick={() => {
              setLimit('all')
              setPage(0)
            }}
          >
            Tous ({filtered.length})
          </button>
        </div>
      </div>

      <div className="palmares-table-summary">
        Affichage de <strong>{visible.length}</strong> sur <strong>{filtered.length}</strong> joueur
        {filtered.length > 1 ? 's' : ''} titré{filtered.length > 1 ? 's' : ''}
        {searchQuery && ` (filtré pour « ${searchQuery} »)`}
      </div>

      <div className="matches-table-wrap">
        <table className="matches-table">
          <thead>
            <tr>
              <th
                className="sortable-th"
                style={{ width: '3.8rem', textAlign: 'center' }}
                onClick={() => handleSort('rank')}
                title="Trier par Rang"
              >
                Rang {getSortIcon('rank')}
              </th>
              <th className="sortable-th" onClick={() => handleSort('name')} title="Trier par Joueur">
                Joueur {getSortIcon('name')}
              </th>
              <th className="sortable-th" onClick={() => handleSort('club')} title="Trier par Club">
                Club {getSortIcon('club')}
              </th>
              <th
                className="sortable-th"
                style={{ textAlign: 'center' }}
                onClick={() => handleSort('ballonOr')}
                title="Trier par Ballons d'Or"
              >
                🌕 Ballon d'Or {getSortIcon('ballonOr')}
              </th>
              <th
                className="sortable-th"
                style={{ textAlign: 'center' }}
                onClick={() => handleSort('soulier')}
                title="Trier par Souliers d'Or"
              >
                👟 Soulier d'Or {getSortIcon('soulier')}
              </th>
              <th
                className="sortable-th"
                style={{ textAlign: 'center' }}
                onClick={() => handleSort('bouclier')}
                title="Trier par Boucliers d'Or"
              >
                🛡️ Bouclier d'Or {getSortIcon('bouclier')}
              </th>
              <th
                className="sortable-th"
                style={{ textAlign: 'center' }}
                onClick={() => handleSort('indiv')}
                title="Trier par les autres distinctions individuelles"
              >
                🎖️ Autres {getSortIcon('indiv')}
              </th>
              <th
                className="sortable-th"
                style={{ textAlign: 'center' }}
                onClick={() => handleSort('national')}
                title="Trier par Titres de Champion de France"
              >
                🏆 France {getSortIcon('national')}
              </th>
              <th
                className="sortable-th"
                style={{ textAlign: 'center' }}
                onClick={() => handleSort('conf')}
                title="Trier par Titres de Conférence"
              >
                👑 Conf. {getSortIcon('conf')}
              </th>
              <th
                className="sortable-th"
                style={{ textAlign: 'center' }}
                onClick={() => handleSort('region')}
                title="Trier par Titres Régionaux"
              >
                🌟 Région {getSortIcon('region')}
              </th>
              <th
                className="sortable-th"
                style={{ textAlign: 'center' }}
                onClick={() => handleSort('dept')}
                title="Trier par Titres Départementaux"
              >
                🏅 Départ. {getSortIcon('dept')}
              </th>
              <th
                className="sortable-th"
                style={{ textAlign: 'center' }}
                onClick={() => handleSort('total')}
                title="Trier par Total de Titres (Individuels + Équipe)"
              >
                Total {getSortIcon('total')}
              </th>
              <th>Meilleur Parcours</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((item) => {
              const { person, rank } = item
              const isTop3 = rank <= 3
              const isAttacker = person.position === 'ATTACKER'
              const otherHonors = getOtherIndividualHonors(item)
              const club = item.currentOrLastClub ?? (item.person.currentClubId ? clubsById.get(item.person.currentClubId) : undefined)

              return (
                <tr key={person.id}>
                  {/* Rang */}
                  <td
                    style={{
                      textAlign: 'center',
                      fontWeight: 800,
                      color: rank === 1 ? 'var(--color-gold-light, #fbbf24)' : 'inherit',
                    }}
                  >
                    {rank === 1 ? '🥇 1' : rank === 2 ? '🥈 2' : rank === 3 ? '🥉 3' : rank}
                  </td>

                  {/* Joueur avec avatar et badges */}
                  <td>
                    <div className="player-flex-cell">
                      <div
                        className={`player-avatar-circle ${isTop3 ? 'player-avatar-circle--gold' : ''}`}
                        aria-hidden="true"
                      >
                        {person.firstName[0]}
                        {person.lastName[0]}
                      </div>
                      <div className="player-info-lines">
                        <div className="player-name-row">
                          <PersonLink person={person} showPositionBadge={false} />
                          <NationalityBadge person={person} compact />
                          <span
                            className={isAttacker ? 'badge badge--amber' : 'badge badge--blue'}
                            style={{ fontSize: '0.72rem', padding: '1px 6px' }}
                          >
                            {person.primaryRole === 'COACH' ? 'Entraîneur' : formatPosition(person.position)}
                          </span>
                        </div>
                        <div className="player-meta-row">
                          <span>{person.age} ans</span>
                          {(person.primaryRole === 'COACH' ? Boolean(person.coachRetiredYear) : person.isRetired) && (
                            <span className="badge badge--neutral" style={{ fontSize: '0.68rem', padding: '1px 5px' }}>
                              Retraité
                            </span>
                          )}
                          <span>· {person.birthCommuneName}</span>
                          {person.birthDepartmentId && (
                            <span>({person.birthDepartmentId})</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </td>

                  {/* Club */}
                  <td>
                    {club ? (
                      <div>
                        <TeamLink team={club} showTrophies={false} />
                        <div style={{ fontSize: '0.78rem', color: 'var(--color-text-muted, #94a3b8)' }}>
                          {departmentLabel(club.departmentId)}
                        </div>
                      </div>
                    ) : item.lastClubName ? (
                      <span style={{ color: 'var(--color-text-secondary, #cbd5e1)', fontSize: '0.88rem' }}>
                        {item.lastClubName}
                      </span>
                    ) : (
                      <span style={{ color: 'var(--color-text-dim, #64748b)' }}>—</span>
                    )}
                  </td>

                  {/* Ballon d'Or */}
                  <td style={{ textAlign: 'center' }}>
                    {item.ballonOrCount > 0 ? (
                      <span
                        className="trophy-pill trophy-pill--ballon"
                        style={{ display: 'inline-flex' }}
                        title={`${item.ballonOrCount} Ballon(s) d'Or : ${item.ballonOrYears.join(', ')}`}
                      >
                        🌕 {item.ballonOrCount}
                      </span>
                    ) : (
                      <span style={{ color: 'var(--color-text-dim, #64748b)' }}>—</span>
                    )}
                  </td>

                  <td style={{ textAlign: 'center' }}>
                    {item.topScorerCount > 0 ? (
                      <span className="trophy-pill trophy-pill--scorer" style={{ display: 'inline-flex' }} title={`${item.topScorerCount} Soulier(s) d'Or : ${item.topScorerYears.join(', ')}`}>
                        👟 {item.topScorerCount}
                      </span>
                    ) : '—'}
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    {item.topStopsCount > 0 ? (
                      <span className="trophy-pill trophy-pill--stops" style={{ display: 'inline-flex' }} title={`${item.topStopsCount} Bouclier(s) d'Or : ${item.topStopsYears.join(', ')}`}>
                        🛡️ {item.topStopsCount}
                      </span>
                    ) : '—'}
                  </td>
                  {/* Autres Trophées Individuels */}
                  <td style={{ textAlign: 'center' }}>
                    {otherHonors.length > 0 ? (
                      <span
                        className="trophy-pill trophy-pill--individual"
                        style={{ display: 'inline-flex' }}
                        title={otherHonors.map((h) => `${h.title} (${h.year})`).join(', ')}
                      >
                        🎖️ {otherHonors.length}
                      </span>
                    ) : (
                      <span style={{ color: 'var(--color-text-dim, #64748b)' }}>—</span>
                    )}
                  </td>

                  {/* Champion de France */}
                  <td style={{ textAlign: 'center' }}>
                    {item.nationalTitles > 0 ? (
                      <span
                        className="trophy-pill trophy-pill--national"
                        style={{ display: 'inline-flex' }}
                        title={`${item.nationalTitles} titre(s) de champion de France : ${item.nationalTitleYears.join(', ')}`}
                      >
                        🏆 {item.nationalTitles}
                      </span>
                    ) : (
                      <span style={{ color: 'var(--color-text-dim, #64748b)' }}>—</span>
                    )}
                  </td>

                  {/* Champion de Conférence */}
                  <td style={{ textAlign: 'center' }}>
                    {item.conferenceTitles > 0 ? (
                      <span
                        className="trophy-pill trophy-pill--conference"
                        style={{ display: 'inline-flex' }}
                        title={`${item.conferenceTitles} titre(s) de conférence : ${item.conferenceTitleDetails.map((d) => d.year).join(', ')}`}
                      >
                        👑 {item.conferenceTitles}
                      </span>
                    ) : (
                      <span style={{ color: 'var(--color-text-dim, #64748b)' }}>—</span>
                    )}
                  </td>

                  {/* Champion Régional */}
                  <td style={{ textAlign: 'center' }}>
                    {item.regionTitles > 0 ? (
                      <span
                        className="trophy-pill trophy-pill--region"
                        style={{ display: 'inline-flex' }}
                        title={`${item.regionTitles} titre(s) régional : ${item.regionTitleDetails.map((d) => d.year).join(', ')}`}
                      >
                        🌟 {item.regionTitles}
                      </span>
                    ) : (
                      <span style={{ color: 'var(--color-text-dim, #64748b)' }}>—</span>
                    )}
                  </td>

                  {/* Champion Départemental */}
                  <td style={{ textAlign: 'center' }}>
                    {item.departmentTitles > 0 ? (
                      <span
                        className="trophy-pill trophy-pill--dept"
                        style={{ display: 'inline-flex' }}
                        title={`${item.departmentTitles} titre(s) départemental : ${item.departmentTitleDetails.map((d) => d.year).join(', ')}`}
                      >
                        🏅 {item.departmentTitles}
                      </span>
                    ) : (
                      <span style={{ color: 'var(--color-text-dim, #64748b)' }}>—</span>
                    )}
                  </td>

                  {/* Total de Titres combiné */}
                  <td style={{ textAlign: 'center' }}>
                    <strong
                      style={{
                        background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.2) 0%, rgba(217, 119, 6, 0.08) 100%)',
                        border: '1px solid rgba(245, 158, 11, 0.4)',
                        padding: '3px 8px',
                        borderRadius: '8px',
                        color: '#fbbf24',
                        display: 'inline-block',
                      }}
                      title={`${item.totalTitles} titre(s) total (${item.totalIndividualTitles} individuels + ${item.totalTeamTitles} collectifs)`}
                    >
                      🏆 {item.totalTitles}
                    </strong>
                  </td>

                  {/* Meilleur parcours */}
                  <td>
                    {item.bestPerformance ? (
                      <span
                        className={getStageBadgeClass(item.bestPerformance.stageLabel, item.bestPerformance.roundNumber)}
                        style={{ fontSize: '0.78rem', padding: '2px 8px' }}
                      >
                        {item.bestPerformance.stageLabel} ({item.bestPerformance.year})
                      </span>
                    ) : (
                      <span style={{ color: 'var(--color-text-dim, #64748b)' }}>—</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {limit === 'all' && totalPages > 1 && (
        <div className="pagination" aria-label="Pages du palmarès joueurs" style={{ marginTop: 'var(--space-3)' }}>
          <button type="button" disabled={page === 0} onClick={() => setPage((current) => current - 1)}>
            ← Précédent
          </button>
          <span>
            Page {page + 1} sur {totalPages}
          </span>
          <button
            type="button"
            disabled={page + 1 >= totalPages}
            onClick={() => setPage((current) => current + 1)}
          >
            Suivant →
          </button>
        </div>
      )}
    </div>
  )
}

/* =========================================================================
   COMPOSANT 2: TABLEAU DU BALLON D'OR PAR ÉDITION
   ========================================================================= */

function PalmaresBallonOrTable({
  ballonOrRecords,
  clubsById,
}: {
  ballonOrRecords: BallonOrEditionRecord[]
  clubsById: Map<string, Club>
}) {
  if (ballonOrRecords.length === 0) {
    return (
      <p style={{ color: 'var(--color-text-muted)' }}>
        Aucun Ballon d'Or n'a encore été attribué. Le trophée est décerné lors de la nuit des trophées après la finale nationale.
      </p>
    )
  }

  return (
    <div className="matches-table-wrap">
      <table className="matches-table">
        <thead>
          <tr>
            <th style={{ width: '7.5rem', textAlign: 'center', whiteSpace: 'nowrap' }}>Saison</th>
            <th>🌕 Vainqueur du Ballon d'Or</th>
            <th style={{ textAlign: 'center' }}>Stats sur la Coupe</th>
            <th style={{ textAlign: 'center' }}>Score & Vote Jury</th>
            <th>🥈 2e & 🥉 3e Nommés (Podium)</th>
          </tr>
        </thead>
        <tbody>
          {ballonOrRecords.map((record) => {
            const { winner, nominees } = record
            const club = clubsById.get(winner.clubId)
            const jury = winner.juryAdjustment ?? 0

            return (
              <tr key={record.year}>
                {/* Saison */}
                <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                  <span className="palmares-season-tag">
                    Saison <strong>{record.year}</strong>
                  </span>
                </td>

                {/* Vainqueur */}
                <td>
                  <div className="player-flex-cell">
                    <div className="player-avatar-circle player-avatar-circle--gold" aria-hidden="true">
                      {winner.firstName[0]}
                      {winner.lastName[0]}
                    </div>
                    <div className="player-info-lines">
                      <div className="player-name-row">
                        <strong style={{ fontSize: '0.95rem' }}>
                          <Link to={`/personnes/${winner.personId}`}>
                            {winner.firstName} {winner.lastName}
                          </Link>
                        </strong>
                        <span
                          className={winner.position === 'ATTACKER' ? 'badge badge--amber' : 'badge badge--blue'}
                          style={{ fontSize: '0.72rem', padding: '1px 6px' }}
                        >
                          {formatPosition(winner.position)}
                        </span>
                      </div>
                      <div className="player-meta-row">
                        <span>
                          {club ? <TeamLink team={club} showTrophies={false} /> : winner.clubName}
                        </span>
                        <span>·</span>
                        <span>{winner.age} ans</span>
                        {winner.isChampion && (
                          <span className="badge badge--gold" style={{ fontSize: '0.7rem' }}>
                            Champion 🏆
                          </span>
                        )}
                        {winner.eliminationStageLabel && !winner.isChampion && (
                          <span>· {winner.eliminationStageLabel}</span>
                        )}
                      </div>
                    </div>
                  </div>
                </td>

                {/* Stats */}
                <td style={{ textAlign: 'center' }}>
                  <div style={{ display: 'inline-flex', gap: '4px', flexWrap: 'wrap', justifyContent: 'center' }}>
                    <span className="stat-pill stat-pill--goals" title="Buts marqués">
                      ⚽ {winner.goals}
                    </span>
                    <span className="stat-pill stat-pill--stops" title="Interventions défensives">
                      🛡️ {winner.defensiveStops}
                    </span>
                    <span className="stat-pill" title="Matchs disputés">
                      🏟️ {winner.matchesPlayed} m.
                    </span>
                  </div>
                </td>

                {/* Score & Vote */}
                <td style={{ textAlign: 'center' }}>
                  <div>
                    <strong style={{ color: '#fbbf24', fontSize: '0.95rem' }}>
                      {(winner.awardScore ?? winner.overallScore).toFixed(1)} pts
                    </strong>
                    <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                      Vote : {jury >= 0 ? '+' : '−'}
                      {(Math.abs(jury) * 100).toFixed(1)}%
                    </div>
                  </div>
                </td>

                {/* Nommés / Podium */}
                <td>
                  {nominees.length > 0 ? (
                    <div className="nominees-cell-stack">
                      {nominees.map((nom, idx) => (
                        <div key={nom.personId} className="nominee-item">
                          <span className="nominee-badge">{idx === 0 ? '🥈 2e' : '🥉 3e'}</span>
                          <Link to={`/personnes/${nom.personId}`}>
                            {nom.firstName} {nom.lastName}
                          </Link>
                          <span className="nominee-stats">
                            ({nom.clubName} · ⚽ {nom.goals} · 🛡️ {nom.defensiveStops} ·{' '}
                            {(nom.awardScore ?? nom.overallScore).toFixed(1)} pts)
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <span style={{ color: 'var(--color-text-dim)' }}>—</span>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

/* =========================================================================
   COMPOSANT 3: TABLEAU DU SOULIER D'OR (MEILLEURS BUTEURS)
   ========================================================================= */

function PalmaresScorersTable({
  scorerRecords,
  clubsById,
}: {
  scorerRecords: TopScorerEditionRecord[]
  clubsById: Map<string, Club>
}) {
  if (scorerRecords.length === 0) {
    return (
      <p style={{ color: 'var(--color-text-muted)' }}>
        Aucun Soulier d'Or enregistré pour l'instant.
      </p>
    )
  }

  return (
    <div className="matches-table-wrap">
      <table className="matches-table">
        <thead>
          <tr>
            <th style={{ width: '7.5rem', textAlign: 'center', whiteSpace: 'nowrap' }}>Saison</th>
            <th>👟 Soulier d'Or (Buteur)</th>
            <th style={{ textAlign: 'center' }}>Buts Marqués</th>
            <th>🎯 Meilleur Attaquant (Jury)</th>
            <th style={{ textAlign: 'center' }}>Note Offensive</th>
            <th>Dauphins & Autres Nommés</th>
          </tr>
        </thead>
        <tbody>
          {scorerRecords.map((record) => {
            const { winner, bestAttackerWinner } = record
            const winnerClub = clubsById.get(winner.clubId)
            const bestAtkClub = bestAttackerWinner ? clubsById.get(bestAttackerWinner.clubId) : undefined

            return (
              <tr key={record.year}>
                <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                  <span className="palmares-season-tag">
                    Saison <strong>{record.year}</strong>
                  </span>
                </td>

                {/* Soulier d'Or (Volume) */}
                <td>
                  <div className="player-flex-cell">
                    <div
                      className="player-avatar-circle"
                      style={{ borderColor: 'rgba(249, 115, 22, 0.6)', color: '#fdba74' }}
                      aria-hidden="true"
                    >
                      {winner.firstName[0]}
                      {winner.lastName[0]}
                    </div>
                    <div className="player-info-lines">
                      <div className="player-name-row">
                        <Link to={`/personnes/${winner.personId}`}>
                          <strong>
                            {winner.firstName} {winner.lastName}
                          </strong>
                        </Link>
                      </div>
                      <div className="player-meta-row">
                        <span>
                          {winnerClub ? <TeamLink team={winnerClub} showTrophies={false} /> : winner.clubName}
                        </span>
                        <span>·</span>
                        <span>{winner.age} ans</span>
                        {winner.isChampion && (
                          <span className="badge badge--gold" style={{ fontSize: '0.7rem' }}>
                            Champion 🏆
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </td>

                {/* Buts Marqués & Efficacité */}
                <td style={{ textAlign: 'center' }}>
                  <div>
                    <span
                      className="trophy-pill trophy-pill--scorer"
                      style={{ display: 'inline-flex', fontSize: '0.88rem', padding: '3px 8px' }}
                    >
                      ⚽ <strong>{record.goals}</strong> but{record.goals > 1 ? 's' : ''}
                    </span>
                    <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '2px' }}>
                      {record.matchesPlayed} matchs ({record.ratio.toFixed(2)} b/m)
                    </div>
                  </div>
                </td>

                {/* Meilleur Attaquant (Jury) */}
                <td>
                  {bestAttackerWinner ? (
                    <div className="player-flex-cell">
                      <div
                        className="player-avatar-circle"
                        style={{ borderColor: 'rgba(234, 179, 8, 0.6)', color: '#fde047' }}
                        aria-hidden="true"
                      >
                        {bestAttackerWinner.firstName[0]}
                        {bestAttackerWinner.lastName[0]}
                      </div>
                      <div className="player-info-lines">
                        <div className="player-name-row">
                          <Link to={`/personnes/${bestAttackerWinner.personId}`}>
                            <strong>
                              {bestAttackerWinner.firstName} {bestAttackerWinner.lastName}
                            </strong>
                          </Link>
                        </div>
                        <div className="player-meta-row">
                          <span>
                            {bestAtkClub ? <TeamLink team={bestAtkClub} showTrophies={false} /> : bestAttackerWinner.clubName}
                          </span>
                          <span>·</span>
                          <span>{bestAttackerWinner.age} ans</span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <span style={{ color: 'var(--color-text-dim)' }}>—</span>
                  )}
                </td>

                {/* Note Offensive Jury */}
                <td style={{ textAlign: 'center' }}>
                  {bestAttackerWinner ? (
                    <div>
                      <strong style={{ color: '#f59e0b', fontSize: '0.95rem' }}>
                        {(bestAttackerWinner.awardScore ?? bestAttackerWinner.attackScore).toFixed(1)} pts
                      </strong>
                      <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                        {bestAttackerWinner.goals} but{bestAttackerWinner.goals > 1 ? 's' : ''} en {bestAttackerWinner.matchesPlayed} m.
                      </div>
                    </div>
                  ) : (
                    '—'
                  )}
                </td>

                {/* Dauphins & Autres Nommés */}
                <td>
                  {(record.nominees.length > 0 || (record.bestAttackerNominees && record.bestAttackerNominees.length > 0)) ? (
                    <div className="nominees-cell-stack">
                      {record.nominees.slice(0, 1).map((nom) => (
                        <div key={`scorer-${nom.personId}`} className="nominee-item">
                          <span className="nominee-badge">Dauphin buteurs :</span>
                          <Link to={`/personnes/${nom.personId}`}>
                            {nom.firstName} {nom.lastName}
                          </Link>
                          <span className="nominee-stats">
                            ({nom.clubName} · ⚽ {nom.goals} but{nom.goals > 1 ? 's' : ''})
                          </span>
                        </div>
                      ))}
                      {record.bestAttackerNominees?.slice(0, 1).map((nom) => (
                        <div key={`atk-${nom.personId}`} className="nominee-item">
                          <span className="nominee-badge">Nommé jury :</span>
                          <Link to={`/personnes/${nom.personId}`}>
                            {nom.firstName} {nom.lastName}
                          </Link>
                          <span className="nominee-stats">
                            ({nom.clubName} · {(nom.awardScore ?? nom.attackScore).toFixed(1)} pts)
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <span style={{ color: 'var(--color-text-dim)' }}>—</span>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

/* =========================================================================
   COMPOSANT 4: TABLEAU DES MEILLEURS DÉFENSEURS & BOUCLIER D'OR
   ========================================================================= */

function PalmaresDefendersTable({
  defenderRecords,
  clubsById,
}: {
  defenderRecords: TopDefenderEditionRecord[]
  clubsById: Map<string, Club>
}) {
  if (defenderRecords.length === 0) {
    return (
      <p style={{ color: 'var(--color-text-muted)' }}>
        Aucun palmarès de défenseur enregistré pour l'instant.
      </p>
    )
  }

  return (
    <div className="matches-table-wrap">
      <table className="matches-table">
        <thead>
          <tr>
            <th style={{ width: '7.5rem', textAlign: 'center', whiteSpace: 'nowrap' }}>Saison</th>
            <th>🛡️ Bouclier d'Or (Volume)</th>
            <th style={{ textAlign: 'center' }}>Interventions</th>
            <th>🏰 Meilleur Défenseur (Jury)</th>
            <th style={{ textAlign: 'center' }}>Note Défensive</th>
            <th>Dauphins & Autres Nommés</th>
          </tr>
        </thead>
        <tbody>
          {defenderRecords.map((record) => {
            const { stopsWinner, bestDefenderWinner } = record
            const stopsClub = stopsWinner ? clubsById.get(stopsWinner.clubId) : undefined
            const bestDefClub = bestDefenderWinner ? clubsById.get(bestDefenderWinner.clubId) : undefined

            return (
              <tr key={record.year}>
                <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                  <span className="palmares-season-tag">
                    Saison <strong>{record.year}</strong>
                  </span>
                </td>

                {/* Bouclier d'Or */}
                <td>
                  {stopsWinner ? (
                    <div className="player-flex-cell">
                      <div
                        className="player-avatar-circle"
                        style={{ borderColor: 'rgba(56, 189, 248, 0.6)', color: '#7dd3fc' }}
                        aria-hidden="true"
                      >
                        {stopsWinner.firstName[0]}
                        {stopsWinner.lastName[0]}
                      </div>
                      <div className="player-info-lines">
                        <div className="player-name-row">
                          <Link to={`/personnes/${stopsWinner.personId}`}>
                            <strong>
                              {stopsWinner.firstName} {stopsWinner.lastName}
                            </strong>
                          </Link>
                        </div>
                        <div className="player-meta-row">
                          <span>
                            {stopsClub ? <TeamLink team={stopsClub} showTrophies={false} /> : stopsWinner.clubName}
                          </span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <span style={{ color: 'var(--color-text-dim)' }}>—</span>
                  )}
                </td>

                {/* Interventions Bouclier d'Or */}
                <td style={{ textAlign: 'center' }}>
                  {stopsWinner ? (
                    <div>
                      <span className="trophy-pill trophy-pill--stops" style={{ display: 'inline-flex' }}>
                        🛡️ <strong>{stopsWinner.defensiveStops}</strong> arrêts
                      </span>
                      <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '2px' }}>
                        {stopsWinner.matchesPlayed} matchs ({stopsWinner.matchesPlayed > 0 ? (stopsWinner.defensiveStops / stopsWinner.matchesPlayed).toFixed(1) : 0}/m)
                      </div>
                    </div>
                  ) : (
                    '—'
                  )}
                </td>

                {/* Meilleur Défenseur Jury */}
                <td>
                  {bestDefenderWinner ? (
                    <div className="player-flex-cell">
                      <div
                        className="player-avatar-circle"
                        style={{ borderColor: 'rgba(168, 85, 247, 0.6)', color: '#d8b4fe' }}
                        aria-hidden="true"
                      >
                        {bestDefenderWinner.firstName[0]}
                        {bestDefenderWinner.lastName[0]}
                      </div>
                      <div className="player-info-lines">
                        <div className="player-name-row">
                          <Link to={`/personnes/${bestDefenderWinner.personId}`}>
                            <strong>
                              {bestDefenderWinner.firstName} {bestDefenderWinner.lastName}
                            </strong>
                          </Link>
                        </div>
                        <div className="player-meta-row">
                          <span>
                            {bestDefClub ? <TeamLink team={bestDefClub} showTrophies={false} /> : bestDefenderWinner.clubName}
                          </span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <span style={{ color: 'var(--color-text-dim)' }}>—</span>
                  )}
                </td>

                {/* Note Jury Meilleur Défenseur */}
                <td style={{ textAlign: 'center' }}>
                  {bestDefenderWinner ? (
                    <div>
                      <strong style={{ color: '#38bdf8', fontSize: '0.95rem' }}>
                        {(bestDefenderWinner.awardScore ?? bestDefenderWinner.defenseScore).toFixed(1)} pts
                      </strong>
                      <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                        {bestDefenderWinner.defensiveStops} arrêts en {bestDefenderWinner.matchesPlayed} m.
                      </div>
                    </div>
                  ) : (
                    '—'
                  )}
                </td>

                {/* Nommés */}
                <td>
                  {record.stopsNominees.length > 0 || record.bestDefenderNominees.length > 0 ? (
                    <div className="nominees-cell-stack">
                      {record.stopsNominees.slice(0, 1).map((nom) => (
                        <div key={`stop-${nom.personId}`} className="nominee-item">
                          <span className="nominee-badge">Dauphin arrêts :</span>
                          <Link to={`/personnes/${nom.personId}`}>
                            {nom.firstName} {nom.lastName}
                          </Link>
                          <span className="nominee-stats">
                            ({nom.clubName} · 🛡️ {nom.defensiveStops})
                          </span>
                        </div>
                      ))}
                      {record.bestDefenderNominees.slice(0, 1).map((nom) => (
                        <div key={`def-${nom.personId}`} className="nominee-item">
                          <span className="nominee-badge">Nommé jury :</span>
                          <Link to={`/personnes/${nom.personId}`}>
                            {nom.firstName} {nom.lastName}
                          </Link>
                          <span className="nominee-stats">
                            ({nom.clubName} · {(nom.awardScore ?? nom.defenseScore).toFixed(1)} pts)
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <span style={{ color: 'var(--color-text-dim)' }}>—</span>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

/* =========================================================================
   COMPOSANT 5: TABLEAU COMPLET DE TOUTES LES DISTINCTIONS PAR ÉDITION
   ========================================================================= */

function PalmaresAllAwardsTable({
  allAwardsRecords,
  clubsById,
}: {
  allAwardsRecords: AllAwardsEditionRecord[]
  clubsById: Map<string, Club>
}) {
  if (allAwardsRecords.length === 0) {
    return (
      <p style={{ color: 'var(--color-text-muted)' }}>
        Aucune distinction enregistrée pour l'instant.
      </p>
    )
  }

  return (
    <div className="matches-table-wrap">
      <table className="matches-table">
        <thead>
          <tr>
            <th style={{ width: '7.5rem', textAlign: 'center' }}>Saison</th>
            <th>🌕 Ballon d'Or</th>
            <th>👟 Soulier d'Or</th>
            <th>🛡️ Bouclier d'Or</th>
            <th>🏰 Meilleur Défenseur</th>
            <th>⚔️ Meilleur Attaquant</th>
            <th>🌟 Meilleurs Espoirs</th>
            <th>🎖️ Conférences</th>
          </tr>
        </thead>
        <tbody>
          {allAwardsRecords.map((record) => (
            <tr key={record.year}>
              <td style={{ textAlign: 'center' }}>
                <span className="palmares-season-tag">
                  Saison <strong>{record.year}</strong>
                </span>
              </td>

              {/* Ballon d'Or */}
              <td>
                {record.ballonOr ? (() => {
                  const club = clubsById.get(record.ballonOr.clubId)
                  return (
                    <div>
                      <Link to={`/personnes/${record.ballonOr.personId}`}>
                        <strong>
                          {record.ballonOr.firstName} {record.ballonOr.lastName}
                        </strong>
                      </Link>
                      <div style={{ fontSize: '0.75rem', marginTop: '2px' }}>
                        {club ? <TeamLink team={club} showTrophies={false} inline /> : record.ballonOr.clubName}
                      </div>
                    </div>
                  )
                })() : (
                  '—'
                )}
              </td>

              {/* Soulier d'Or */}
              <td>
                {record.topScorer ? (() => {
                  const club = clubsById.get(record.topScorer.clubId)
                  return (
                    <div>
                      <Link to={`/personnes/${record.topScorer.personId}`}>
                        <strong>
                          {record.topScorer.firstName} {record.topScorer.lastName}
                        </strong>
                      </Link>
                      <div style={{ fontSize: '0.75rem', marginTop: '2px' }}>
                        {club ? <TeamLink team={club} showTrophies={false} inline /> : record.topScorer.clubName}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#fbbf24', marginTop: '2px', fontWeight: 600 }}>
                        ⚽ {record.topScorer.goals} but{record.topScorer.goals > 1 ? 's' : ''}
                      </div>
                    </div>
                  )
                })() : (
                  '—'
                )}
              </td>

              {/* Bouclier d'Or */}
              <td>
                {record.topStops ? (() => {
                  const club = clubsById.get(record.topStops.clubId)
                  return (
                    <div>
                      <Link to={`/personnes/${record.topStops.personId}`}>
                        <strong>
                          {record.topStops.firstName} {record.topStops.lastName}
                        </strong>
                      </Link>
                      <div style={{ fontSize: '0.75rem', marginTop: '2px' }}>
                        {club ? <TeamLink team={club} showTrophies={false} inline /> : record.topStops.clubName}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#38bdf8', marginTop: '2px', fontWeight: 600 }}>
                        🛡️ {record.topStops.defensiveStops} arrêts
                      </div>
                    </div>
                  )
                })() : (
                  '—'
                )}
              </td>

              {/* Meilleur Défenseur */}
              <td>
                {record.bestDefender ? (() => {
                  const club = clubsById.get(record.bestDefender.clubId)
                  return (
                    <div>
                      <Link to={`/personnes/${record.bestDefender.personId}`}>
                        <strong>
                          {record.bestDefender.firstName} {record.bestDefender.lastName}
                        </strong>
                      </Link>
                      <div style={{ fontSize: '0.75rem', marginTop: '2px' }}>
                        {club ? <TeamLink team={club} showTrophies={false} inline /> : record.bestDefender.clubName}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#38bdf8', marginTop: '2px', fontWeight: 600 }}>
                        {(record.bestDefender.awardScore ?? record.bestDefender.defenseScore).toFixed(1)} pts
                      </div>
                    </div>
                  )
                })() : (
                  '—'
                )}
              </td>

              {/* Meilleur Attaquant */}
              <td>
                {record.bestAttacker ? (() => {
                  const club = clubsById.get(record.bestAttacker.clubId)
                  return (
                    <div>
                      <Link to={`/personnes/${record.bestAttacker.personId}`}>
                        <strong>
                          {record.bestAttacker.firstName} {record.bestAttacker.lastName}
                        </strong>
                      </Link>
                      <div style={{ fontSize: '0.75rem', marginTop: '2px' }}>
                        {club ? <TeamLink team={club} showTrophies={false} inline /> : record.bestAttacker.clubName}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#f59e0b', marginTop: '2px', fontWeight: 600 }}>
                        {(record.bestAttacker.awardScore ?? record.bestAttacker.attackScore).toFixed(1)} pts
                      </div>
                    </div>
                  )
                })() : (
                  '—'
                )}
              </td>

              {/* Meilleurs Espoirs */}
              <td>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', fontSize: '0.8rem' }}>
                  {record.youngPlayer && (() => {
                    const club = clubsById.get(record.youngPlayer.clubId)
                    return (
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <span>⭐</span>
                          <Link to={`/personnes/${record.youngPlayer.personId}`}>
                            <strong>{record.youngPlayer.firstName} {record.youngPlayer.lastName}</strong>
                          </Link>
                        </div>
                        <div style={{ fontSize: '0.73rem', marginLeft: '18px', marginTop: '1px' }}>
                          {club ? <TeamLink team={club} showTrophies={false} inline /> : record.youngPlayer.clubName}
                        </div>
                      </div>
                    )
                  })()}
                  {record.youngAttacker && (() => {
                    const club = clubsById.get(record.youngAttacker.clubId)
                    return (
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <span>⚔️</span>
                          <Link to={`/personnes/${record.youngAttacker.personId}`}>
                            <strong>{record.youngAttacker.firstName} {record.youngAttacker.lastName}</strong>
                          </Link>
                        </div>
                        <div style={{ fontSize: '0.73rem', marginLeft: '18px', marginTop: '1px' }}>
                          {club ? <TeamLink team={club} showTrophies={false} inline /> : record.youngAttacker.clubName}
                        </div>
                      </div>
                    )
                  })()}
                  {record.youngDefender && (() => {
                    const club = clubsById.get(record.youngDefender.clubId)
                    return (
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <span>🏰</span>
                          <Link to={`/personnes/${record.youngDefender.personId}`}>
                            <strong>{record.youngDefender.firstName} {record.youngDefender.lastName}</strong>
                          </Link>
                        </div>
                        <div style={{ fontSize: '0.73rem', marginLeft: '18px', marginTop: '1px' }}>
                          {club ? <TeamLink team={club} showTrophies={false} inline /> : record.youngDefender.clubName}
                        </div>
                      </div>
                    )
                  })()}
                  {!record.youngPlayer && !record.youngAttacker && !record.youngDefender && '—'}
                </div>
              </td>

              {/* Conférences */}
              <td>
                {record.conferenceAwards.length > 0 ? (
                  <details style={{ cursor: 'pointer', fontSize: '0.8rem' }}>
                    <summary style={{ color: 'var(--color-primary, #60a5fa)', fontWeight: 600 }}>
                      {record.conferenceAwards.length} lauréats
                    </summary>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', marginTop: '4px' }}>
                      {record.conferenceAwards.map((ca) => {
                        const club = clubsById.get(ca.winner.clubId)
                        return (
                          <div key={ca.awardId}>
                            <span style={{ color: 'var(--color-text-muted)' }}>{ca.title} : </span>
                            <Link to={`/personnes/${ca.winner.personId}`}>
                              <strong>{ca.winner.firstName} {ca.winner.lastName}</strong>
                            </Link>
                            <div style={{ fontSize: '0.73rem', marginLeft: '6px', marginTop: '1px' }}>
                              {club ? <TeamLink team={club} showTrophies={false} inline /> : ca.winner.clubName}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </details>
                ) : (
                  <span style={{ color: 'var(--color-text-dim)' }}>—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
