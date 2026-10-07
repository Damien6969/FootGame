import { useState, useMemo, useEffect } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useOptionalCupApp } from '../../app/CupAppContext'
import type { PersonSortKey, SortDirection, PlayerPosition, CareerTrajectoryPhase } from './types'
import {
  computeOverallRating,
  computePeakOverallRating,
  computePersonTitleCounts,
  computePersonTotalTitles,
  computePersonsMetrics,
  formatCareerPhase,
  formatPosition,
  sortPersons,
} from './personSelectors'
import { getCareerPhase } from './personGenerator'
import { PersonLink } from './PersonLink'
import { NationalityBadge } from './NationalityBadge'
import { PlayerFavoriteButton } from './PlayerFavoriteButton'
import { TeamLink } from '../teams/TeamLink'
import { CommuneLink } from '../geography/CommuneLink'
import {
  departmentLabel,
  getDepartmentName,
  getRegionName,
  getRegionIdForDepartment,
  getRegionNameForDepartment,
} from '../geography/territoryLabels'
import { isActiveCoach } from '../coaches/coachRatings'

const ITEMS_PER_PAGE = 30

function normalizeSearchText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/['’\-]/g, ' ')
    .trim()
}

function getRegionAliases(regionId?: string): string {
  switch (regionId) {
    case '11':
      return 'idf ile de france'
    case '93':
      return 'paca'
    case '84':
      return 'aura'
    case '27':
      return 'bfc'
    case '75':
      return 'aquitaine'
    default:
      return ''
  }
}

export function PersonsPage() {
  const app = useOptionalCupApp()
  const persons = app?.persons ?? []
  const clubsById = app?.clubsById
  const session = app?.session
  const favoriteIds = app?.favoritePersonIds ?? []
  const archives = app?.archives

  const [searchParams, setSearchParams] = useSearchParams()
  const urlQuery = searchParams.get('q') || searchParams.get('recherche') || ''
  const [search, setSearch] = useState(urlQuery)

  useEffect(() => {
    const q = searchParams.get('q') || searchParams.get('recherche') || ''
    if (q !== search) {
      setSearch(q)
      setCurrentPage(1)
    }
  }, [searchParams])
  const [positionFilter, setPositionFilter] = useState<'ALL' | PlayerPosition>('ALL')
  const statusParam = searchParams.get('statut')
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'RETIRED' | 'FAVORITES' | 'COACHES' | 'FREE_COACHES'>(
    statusParam === 'coaches' ? 'COACHES' : statusParam === 'free_coaches' ? 'FREE_COACHES' : statusParam === 'favorites' ? 'FAVORITES' : statusParam === 'active' ? 'ACTIVE' : statusParam === 'retired' ? 'RETIRED' : 'ALL',
  )
  useEffect(() => {
    setStatusFilter(statusParam === 'coaches' ? 'COACHES' : statusParam === 'free_coaches' ? 'FREE_COACHES' : statusParam === 'favorites' ? 'FAVORITES' : statusParam === 'active' ? 'ACTIVE' : statusParam === 'retired' ? 'RETIRED' : 'ALL')
    setCurrentPage(1)
  }, [statusParam])
  const selectStatus = (status: typeof statusFilter) => {
    setStatusFilter(status)
    setCurrentPage(1)
    setSearchParams(previous => {
      const next = new URLSearchParams(previous)
      if (status === 'ALL') next.delete('statut')
      else next.set('statut', status.toLowerCase())
      return next
    }, { replace: true })
  }
  const [trajectoryFilter, setTrajectoryFilter] = useState<'ALL' | CareerTrajectoryPhase>('ALL')
  const [sortKey, setSortKey] = useState<PersonSortKey>('overall')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')
  const [currentPage, setCurrentPage] = useState(1)

  const titleCounts = useMemo(() => computePersonTitleCounts(persons, archives, session, clubsById), [persons, archives, session, clubsById])
  const metrics = useMemo(() => computePersonsMetrics(persons, archives, session, titleCounts), [persons, archives, session, titleCounts])

  const clubNamesById = useMemo(() => {
    const map = new Map<string, string>()
    if (clubsById) {
      for (const [id, club] of clubsById.entries()) {
        map.set(id, club.name)
      }
    }
    return map
  }, [clubsById])

  const filteredPersons = useMemo(() => {
    const rawQuery = search.trim()
    const queryTokens = normalizeSearchText(rawQuery).split(/\s+/).filter(Boolean)

    return persons.filter((p) => {
      if (statusFilter === 'FAVORITES' && !favoriteIds.includes(p.id)) return false
      // Filtre texte
      if (queryTokens.length > 0) {
        const birthDeptName = getDepartmentName(p.birthDepartmentId) ?? ''
        const birthRegionId = getRegionIdForDepartment(p.birthDepartmentId)
        const birthRegionName = getRegionName(birthRegionId) ?? ''
        const birthRegionAliases = getRegionAliases(birthRegionId)

        const club = p.currentClubId ? clubsById?.get(p.currentClubId) : undefined
        const clubName = club?.name ?? (p.currentClubId ? clubNamesById.get(p.currentClubId) ?? '' : '')
        const clubCommune = club?.communeName ?? ''
        const clubOtherCommunes = club?.communeNames ? club.communeNames.join(' ') : ''
        const clubDeptId = club?.departmentId ?? ''
        const clubDeptName = getDepartmentName(clubDeptId) ?? ''
        const clubRegionId = club?.regionId ?? getRegionIdForDepartment(clubDeptId)
        const clubRegionName = getRegionName(clubRegionId) ?? ''
        const clubRegionAliases = getRegionAliases(clubRegionId)

        const fullSearchable = [
          p.firstName,
          p.lastName,
          `${p.firstName} ${p.lastName}`,
          p.birthCommuneName,
          p.birthDepartmentId,
          birthDeptName,
          birthRegionName,
          birthRegionAliases,
          clubName,
          clubCommune,
          clubOtherCommunes,
          clubDeptId,
          clubDeptName,
          clubRegionName,
          clubRegionAliases,
          p.isRetired ? 'retraite' : (!p.currentClubId ? 'sans club' : ''),
        ].join(' ')

        const normalizedSearchable = normalizeSearchText(fullSearchable)

        const matchesAll = queryTokens.every((token) => normalizedSearchable.includes(token))
        if (!matchesAll) {
          return false
        }
      }

      // Filtre poste
      if (positionFilter !== 'ALL' && (p.primaryRole !== 'PLAYER' || p.position !== positionFilter)) {
        return false
      }

      // Filtre statut
      if (statusFilter === 'COACHES' && p.primaryRole !== 'COACH') return false
      if (statusFilter === 'FREE_COACHES' && (p.primaryRole !== 'COACH' || p.currentClubId || p.coachRetiredYear)) return false
      if (statusFilter === 'ACTIVE' && p.isRetired && !isActiveCoach(p)) {
        return false
      }
      if (statusFilter === 'RETIRED' && (!p.isRetired || isActiveCoach(p))) {
        return false
      }

      // Filtre trajectoire / phase de carrière
      if (trajectoryFilter !== 'ALL') {
        const phase = getCareerPhase(p.age, p.primaryRole === 'COACH' ? p.coachPeakAge : p.peakAge)
        if (phase !== trajectoryFilter) {
          return false
        }
      }

      return true
    })
  }, [persons, search, positionFilter, statusFilter, trajectoryFilter, clubNamesById, clubsById, favoriteIds])

  const sortedPersons = useMemo(() => {
    return sortPersons(filteredPersons, sortKey, sortDirection, clubNamesById, titleCounts)
  }, [filteredPersons, sortKey, sortDirection, clubNamesById, titleCounts])

  // Pagination
  const totalPages = Math.max(1, Math.ceil(sortedPersons.length / ITEMS_PER_PAGE))
  const paginatedPersons = useMemo(() => {
    const start = (Math.min(currentPage, totalPages) - 1) * ITEMS_PER_PAGE
    return sortedPersons.slice(start, start + ITEMS_PER_PAGE)
  }, [sortedPersons, currentPage, totalPages])

  const handleSort = (key: PersonSortKey) => {
    if (sortKey === key) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDirection(key === 'name' || key === 'club' || key === 'birthCity' ? 'asc' : 'desc')
    }
    setCurrentPage(1)
  }

  const renderSortIndicator = (key: PersonSortKey) => {
    if (sortKey !== key) return null
    return <span>{sortDirection === 'asc' ? ' ↑' : ' ↓'}</span>
  }

  return (
    <section className="cup-ready">
      {/* En-tête standardisé */}
      <p className="eyebrow">Acteurs & Effectifs Nationaux</p>
      <h2>Personnalités & Joueurs</h2>

      {/* Cartes de statistiques globales - summary-strip */}
      <div className="summary-strip">
        <span>
          <small>Effectif Global</small>
          <strong>{metrics.total}</strong>
          <small style={{ color: '#10b981', textTransform: 'none', fontWeight: 600 }}>
            {metrics.activeCount} actifs • {metrics.retiredCount} retraités
          </small>
        </span>

        <span>
          <small>Postes Actifs</small>
          <strong style={{ color: 'var(--color-primary-light)' }}>
            {metrics.attackersCount} <small style={{ fontSize: '0.85rem', color: 'var(--color-text-dim)' }}>ATQ</small> / {metrics.defendersCount} <small style={{ fontSize: '0.85rem', color: 'var(--color-text-dim)' }}>DEF</small>
          </strong>
          <small style={{ color: 'var(--color-text-muted)', textTransform: 'none' }}>Attaquants / Défenseurs</small>
        </span>

        <span>
          <small>Âge Moyen</small>
          <strong>
            {metrics.avgAge} <small style={{ fontSize: '0.85rem', color: 'var(--color-text-dim)' }}>ans</small>
          </strong>
          <small style={{ color: 'var(--color-text-muted)', textTransform: 'none' }}>Génération active</small>
        </span>

        {metrics.topAttacker && (
          <span>
            <small style={{ color: 'var(--color-gold-light)' }}>Top Attaquant</small>
            <strong style={{ fontSize: '1rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              <Link to={`/personnes/${metrics.topAttacker.id}`} style={{ color: 'inherit' }}>
                {metrics.topAttacker.firstName} {metrics.topAttacker.lastName}
              </Link>
            </strong>
            <small style={{ color: 'var(--color-text-muted)', textTransform: 'none' }}>
              ATQ <strong style={{ color: '#f59e0b' }}>{metrics.topAttacker.attack}</strong>/30 · {metrics.topAttacker.age} ans
            </small>
          </span>
        )}

        {metrics.topDefender && (
          <span>
            <small style={{ color: '#38bdf8' }}>Top Défenseur</small>
            <strong style={{ fontSize: '1rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              <Link to={`/personnes/${metrics.topDefender.id}`} style={{ color: 'inherit' }}>
                {metrics.topDefender.firstName} {metrics.topDefender.lastName}
              </Link>
            </strong>
            <small style={{ color: 'var(--color-text-muted)', textTransform: 'none' }}>
              DEF <strong style={{ color: '#38bdf8' }}>{metrics.topDefender.defense}</strong>/30 · {metrics.topDefender.age} ans
            </small>
          </span>
        )}

        {metrics.mostDecorated && metrics.mostDecorated.titleCount > 0 && (
          <span>
            <small style={{ color: '#eab308' }}>Plus Titré</small>
            <strong style={{ fontSize: '1rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              <Link to={`/personnes/${metrics.mostDecorated.person.id}`} style={{ color: 'inherit' }}>
                {metrics.mostDecorated.person.firstName} {metrics.mostDecorated.person.lastName}
              </Link>
            </strong>
            <small style={{ color: 'var(--color-gold-light)', textTransform: 'none' }}>
              🏆 {metrics.mostDecorated.titleCount} titre{metrics.mostDecorated.titleCount > 1 ? 's' : ''}
            </small>
          </span>
        )}
      </div>

      {/* Barre d'outils, filtres et recherche */}
      <div className="table-toolbar" style={{ flexWrap: 'wrap', gap: 'var(--space-3)' }}>
        <label htmlFor="person-search">Rechercher</label>
        <input
          id="person-search"
          type="search"
          placeholder="Rechercher par nom, ville ou club, département, région…"
          value={search}
          onChange={(e) => {
            const val = e.target.value
            setSearch(val)
            setCurrentPage(1)
            setSearchParams(
              (prev) => {
                const next = new URLSearchParams(prev)
                if (val.trim()) {
                  next.set('q', val.trim())
                } else {
                  next.delete('q')
                  next.delete('recherche')
                }
                return next
              },
              { replace: true },
            )
          }}
          style={{ width: 'min(100%, 20rem)' }}
        />

        {/* Chips de statut */}
        <div className="matches-filter-chips">
          <button type="button" className={`match-filter-chip ${statusFilter === 'COACHES' ? 'is-active' : ''}`} onClick={() => selectStatus('COACHES')}>Entraîneurs ({persons.filter(p => p.primaryRole === 'COACH').length})</button>
          <button type="button" className={`match-filter-chip ${statusFilter === 'FREE_COACHES' ? 'is-active' : ''}`} onClick={() => selectStatus('FREE_COACHES')}>Entraîneurs libres ({persons.filter(p => p.primaryRole === 'COACH' && !p.currentClubId && !p.coachRetiredYear).length})</button>
          <button
            type="button"
            className={`match-filter-chip ${statusFilter === 'ALL' ? 'is-active' : ''}`}
            onClick={() => {
              selectStatus('ALL')
            }}
          >
            Tous ({metrics.total})
          </button>
          <button
            type="button"
            className={`match-filter-chip ${statusFilter === 'ACTIVE' ? 'is-active' : ''}`}
            onClick={() => {
              selectStatus('ACTIVE')
            }}
          >
            Actifs ({metrics.activeCount})
          </button>
          <button
            type="button"
            className={`match-filter-chip ${statusFilter === 'RETIRED' ? 'is-active' : ''}`}
            onClick={() => {
              selectStatus('RETIRED')
            }}
          >
            Retraités ({metrics.retiredCount})
          </button>
          <button type="button" className={`match-filter-chip ${statusFilter === 'FAVORITES' ? 'is-active' : ''}`}
            aria-pressed={statusFilter === 'FAVORITES'} onClick={() => selectStatus('FAVORITES')}>
            ★ Favoris ({persons.filter(person => favoriteIds.includes(person.id)).length})
          </button>
        </div>

        {/* Dropdowns poste, statut et trajectoire */}
        <select
          value={positionFilter}
          onChange={(e) => {
            setPositionFilter(e.target.value as 'ALL' | PlayerPosition)
            setCurrentPage(1)
          }}
          aria-label="Filtrer par poste"
        >
          <option value="ALL">Tous les postes</option>
          <option value="ATTACKER">Attaquants</option>
          <option value="DEFENDER">Défenseurs</option>
        </select>

        <select
          value={statusFilter}
          onChange={(e) => {
            selectStatus(e.target.value as typeof statusFilter)
          }}
          aria-label="Filtrer par statut"
        >
          <option value="ALL">Tous les statuts</option>
          <option value="ACTIVE">Actifs uniquement</option>
          <option value="RETIRED">Retraités</option>
          <option value="FAVORITES">Favoris uniquement</option>
        </select>

        <select
          value={trajectoryFilter}
          onChange={(e) => {
            setTrajectoryFilter(e.target.value as 'ALL' | CareerTrajectoryPhase)
            setCurrentPage(1)
          }}
          aria-label="Filtrer par trajectoire"
        >
          <option value="ALL">Toutes les trajectoires</option>
          <option value="GROWTH">📈 En progression</option>
          <option value="PEAK">👑 À son apogée</option>
          <option value="DECLINE">📉 En déclin</option>
        </select>

        <div style={{ marginLeft: 'auto', fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
          <strong>{sortedPersons.length}</strong> joueur(s) trouvé(s)
        </div>
      </div>

      {/* Tableau principal */}
      <div
        style={{
          background: 'var(--color-surface, #1e293b)',
          borderRadius: '12px',
          border: '1px solid var(--color-border, #334155)',
          overflow: 'hidden',
        }}
      >
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ background: 'rgba(0,0,0,0.2)', borderBottom: '1px solid var(--color-border, #334155)' }}>
                <th
                  onClick={() => handleSort('name')}
                  style={{ padding: '12px 16px', cursor: 'pointer', userSelect: 'none' }}
                >
                  Joueur {renderSortIndicator('name')}
                </th>
                <th style={{ padding: '12px 16px' }}>Poste</th>
                <th
                  onClick={() => handleSort('age')}
                  style={{ padding: '12px 16px', cursor: 'pointer', userSelect: 'none' }}
                >
                  Âge {renderSortIndicator('age')}
                </th>
                <th
                  onClick={() => handleSort('club')}
                  style={{ padding: '12px 16px', cursor: 'pointer', userSelect: 'none' }}
                >
                  Club actuel {renderSortIndicator('club')}
                </th>
                <th
                  onClick={() => handleSort('birthCity')}
                  style={{ padding: '12px 16px', cursor: 'pointer', userSelect: 'none' }}
                >
                  Ville natale {renderSortIndicator('birthCity')}
                </th>
                <th
                  onClick={() => handleSort('attack')}
                  style={{ padding: '12px 16px', cursor: 'pointer', userSelect: 'none', textAlign: 'center' }}
                >
                  ATQ {renderSortIndicator('attack')}
                </th>
                <th
                  onClick={() => handleSort('defense')}
                  style={{ padding: '12px 16px', cursor: 'pointer', userSelect: 'none', textAlign: 'center' }}
                >
                  DEF {renderSortIndicator('defense')}
                </th>
                <th
                  onClick={() => handleSort('overall')}
                  style={{ padding: '12px 16px', cursor: 'pointer', userSelect: 'none', textAlign: 'center' }}
                >
                  GÉN {renderSortIndicator('overall')}
                </th>
                <th
                  onClick={() => handleSort('titles')}
                  style={{ padding: '12px 16px', cursor: 'pointer', userSelect: 'none', textAlign: 'center' }}
                >
                  Palmarès {renderSortIndicator('titles')}
                </th>
              </tr>
            </thead>
            <tbody>
              {paginatedPersons.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted, #94a3b8)' }}>
                    Aucune personnalité ne correspond à vos critères de recherche.
                  </td>
                </tr>
              ) : (
                paginatedPersons.map((p) => {
                  const overall = computeOverallRating(p)
                  const peakOverall = computePeakOverallRating(p)
                  const peakAge = (p.primaryRole === 'COACH' ? p.coachPeakAge : p.peakAge) ?? 27
                  const phase = getCareerPhase(p.age, peakAge)
                  const phaseInfo = formatCareerPhase(phase)
                  const isAttacker = p.position === 'ATTACKER'
                  const trophyRecord = titleCounts.get(p.id)!
                  const totalTitles = computePersonTotalTitles(trophyRecord)
                  return (
                    <tr
                      key={p.id}
                      style={{
                        borderBottom: '1px solid rgba(255,255,255,0.04)',
                        transition: 'background 0.1s ease',
                      }}
                    >
                      <td style={{ padding: '12px 16px' }}>
                        <div className="player-directory-name">
                          <PlayerFavoriteButton person={p} />
                          <PersonLink person={p} showPositionBadge={false} />
                          <NationalityBadge person={p} compact />
                        </div>
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <span className={isAttacker ? 'badge badge--amber' : 'badge badge--blue'} style={{ fontSize: '0.75rem' }}>
                          {p.primaryRole === 'COACH' ? 'Entraîneur' : formatPosition(p.position)}
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px', color: 'var(--text-secondary, #cbd5e1)', whiteSpace: 'nowrap' }}>
                        <span>{p.age} ans</span>{' '}
                        <span
                          title={`${phaseInfo.label} (Pic estimé à ${peakAge} ans)`}
                          style={{ cursor: 'help', fontSize: '0.85rem' }}
                        >
                          {phaseInfo.icon}
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        {p.isRetired && !isActiveCoach(p) && !(p.primaryRole === 'COACH' && !p.coachRetiredYear) ? (
                          <span className="badge badge--neutral" style={{ fontSize: '0.72rem' }}>Retraité</span>
                        ) : p.currentClubId && clubsById?.has(p.currentClubId) ? (
                          <>
                            <TeamLink team={clubsById.get(p.currentClubId)} showTrophies={false} />
                            {clubsById.get(p.currentClubId)?.departmentId && (
                              <span
                                style={{ color: 'var(--text-muted, #94a3b8)', fontSize: '0.75rem', marginLeft: '6px' }}
                                title={`${departmentLabel(clubsById.get(p.currentClubId)!.departmentId)} · ${getRegionName(clubsById.get(p.currentClubId)!.regionId) ?? ''}`}
                              >
                                ({clubsById.get(p.currentClubId)!.departmentId})
                              </span>
                            )}
                          </>
                        ) : (
                          <span style={{ color: 'var(--text-muted, #94a3b8)' }}>Sans club</span>
                        )}
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <CommuneLink communeId={p.birthCommuneId} communeName={p.birthCommuneName} />
                        {p.birthDepartmentId && (
                          <span
                            style={{ color: 'var(--text-muted, #94a3b8)', fontSize: '0.75rem', marginLeft: '6px' }}
                            title={`${departmentLabel(p.birthDepartmentId)} · ${getRegionNameForDepartment(p.birthDepartmentId) ?? ''}`}
                          >
                            ({p.birthDepartmentId})
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                        <span style={{ fontWeight: 700, color: '#f59e0b' }}>{p.primaryRole === 'COACH' ? '—' : p.attack}</span>
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                        <span style={{ fontWeight: 700, color: '#38bdf8' }}>{p.primaryRole === 'COACH' ? '—' : p.defense}</span>
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                        <span
                          style={{
                            background: 'rgba(255,255,255,0.08)',
                            padding: '3px 8px',
                            borderRadius: '6px',
                            fontWeight: 800,
                            color: '#f8fafc',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                          }}
                          title={`Note globale : ${overall} / 30 • Potentiel au pic : ${peakOverall} (à ${peakAge} ans)`}
                        >
                          <span>{overall}</span>
                          {!p.isRetired && peakOverall > overall && (
                            <span style={{ fontSize: '0.7rem', color: '#f59e0b', fontWeight: 600 }}>
                              ↗{peakOverall}
                            </span>
                          )}
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                        {totalTitles > 0 ? (
                          <span
                            className="badge badge--gold"
                            style={{ fontSize: '0.75rem', fontWeight: 700, padding: '2px 8px' }}
                            title={`${totalTitles} titre(s) : ${trophyRecord.nationalTitles} national, ${trophyRecord.conferenceTitles} conf., ${trophyRecord.regionTitles} rég., ${trophyRecord.departmentTitles} dépt.`}
                          >
                            🏆 {totalTitles}
                          </span>
                        ) : (
                          <span style={{ color: 'var(--text-muted, #64748b)', fontSize: '0.8rem' }}>—</span>
                        )}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Contrôles de pagination */}
        {totalPages > 1 && (
          <div
            style={{
              padding: '12px 16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              borderTop: '1px solid var(--color-border, #334155)',
              background: 'rgba(0,0,0,0.1)',
            }}
          >
            <button
              type="button"
              className="btn btn--secondary"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              style={{ padding: '4px 12px', fontSize: '0.85rem' }}
            >
              ← Précédent
            </button>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted, #94a3b8)' }}>
              Page {currentPage} sur {totalPages}
            </span>
            <button
              type="button"
              className="btn btn--secondary"
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              style={{ padding: '4px 12px', fontSize: '0.85rem' }}
            >
              Suivant →
            </button>
          </div>
        )}
      </div>
    </section>
  )
}
