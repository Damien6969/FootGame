import { NationalityBadge } from './NationalityBadge'
import { PlayerFavoriteButton } from './PlayerFavoriteButton'
import { useState, useMemo, useEffect } from 'react'
import { Link } from 'react-router-dom'
import type { Person, SortDirection } from './types'
import {
  computeOverallRating,
  computePeakOverallRating,
  computePersonTrophyRecord,
  computePersonTotalTitles,
  formatCareerPhase,
  formatPosition,
} from './personSelectors'
import { getCareerPhase } from './personGenerator'
import { isActiveCoach } from '../coaches/coachRatings'
import { CommuneLink } from '../geography/CommuneLink'
import { TeamLink } from '../teams/TeamLink'
import { useOptionalCupApp } from '../../app/CupAppContext'
import { useDetailedArchives } from '../storage/useDetailedArchives'
import type { SeasonArchive } from '../storage/cupRepository'

export type PersonTableSortKey = 'name' | 'position' | 'age' | 'club' | 'commune' | 'attack' | 'defense' | 'overall' | 'titles'

export type PersonTableProps = {
  persons: readonly Person[]
  showClub?: boolean
  showCommune?: boolean
  emptyMessage?: string
  title?: string
  initialPageSize?: number
  archives?: readonly SeasonArchive[]
}

export function PersonTable({
  persons,
  showClub = true,
  showCommune = true,
  emptyMessage = 'Aucun joueur répertorié pour le moment.',
  title,
  initialPageSize = 25,
  archives: providedArchives,
}: PersonTableProps) {
  const app = useOptionalCupApp()
  const { archives, loading: archivesLoading, error: archivesError } = useDetailedArchives(providedArchives ?? app?.archives ?? [])
  const [sortKey, setSortKey] = useState<PersonTableSortKey>('overall')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(initialPageSize)

  useEffect(() => {
    setPage(1)
  }, [persons, sortKey, sortDirection, pageSize])

  const handleSort = (key: PersonTableSortKey) => {
    if (sortKey === key) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDirection(key === 'name' || key === 'position' || key === 'club' || key === 'commune' ? 'asc' : 'desc')
    }
  }

  const renderSortIndicator = (key: PersonTableSortKey) => {
    if (sortKey !== key) return <span style={{ opacity: 0.35, fontSize: '0.75rem', marginLeft: '4px' }}>↕</span>
    return <span style={{ color: 'var(--color-primary-light, #38bdf8)', marginLeft: '4px' }}>{sortDirection === 'asc' ? '↑' : '↓'}</span>
  }

  const sortedPersons = useMemo(() => {
    const list = [...persons]
    list.sort((a, b) => {
      let cmp = 0
      switch (sortKey) {
        case 'name':
          cmp = `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`)
          break
        case 'position':
          cmp = a.position.localeCompare(b.position)
          break
        case 'age':
          cmp = a.age - b.age
          break
        case 'club': {
          const clubA = a.currentClubId && app?.clubsById ? app.clubsById.get(a.currentClubId)?.name ?? '' : (a.isRetired ? 'Retraité' : 'Sans club')
          const clubB = b.currentClubId && app?.clubsById ? app.clubsById.get(b.currentClubId)?.name ?? '' : (b.isRetired ? 'Retraité' : 'Sans club')
          cmp = clubA.localeCompare(clubB)
          break
        }
        case 'commune':
          cmp = (a.birthCommuneName ?? '').localeCompare(b.birthCommuneName ?? '')
          break
        case 'attack':
          cmp = a.attack - b.attack
          break
        case 'defense':
          cmp = a.defense - b.defense
          break
        case 'overall': {
          const overallA = computeOverallRating(a)
          const overallB = computeOverallRating(b)
          cmp = overallA - overallB
          break
        }
        case 'titles': {
          const recordA = computePersonTrophyRecord(a, archives, app?.session, app?.clubsById)
          const recordB = computePersonTrophyRecord(b, archives, app?.session, app?.clubsById)
          const titlesA = computePersonTotalTitles(recordA)
          const titlesB = computePersonTotalTitles(recordB)
          cmp = titlesA - titlesB
          break
        }
      }
      return sortDirection === 'asc' ? cmp : -cmp
    })
    return list
  }, [persons, sortKey, sortDirection, app?.clubsById, archives, app?.session])

  const totalCount = sortedPersons.length
  const totalPages = pageSize === 0 ? 1 : Math.max(1, Math.ceil(totalCount / pageSize))
  const currentPage = Math.min(page, totalPages)
  const startIndex = pageSize === 0 ? 0 : (currentPage - 1) * pageSize
  const endIndex = pageSize === 0 ? totalCount : Math.min(startIndex + pageSize, totalCount)
  const paginatedPersons = useMemo(() => {
    if (pageSize === 0) return sortedPersons
    return sortedPersons.slice(startIndex, endIndex)
  }, [sortedPersons, startIndex, endIndex, pageSize])

  if (archivesLoading) return <div className="status-panel">Chargement des archives…</div>
  if (archivesError) return <div className="status-panel" role="alert">Archives indisponibles : {archivesError}</div>
  if (persons.length === 0) {
    return (
      <div
        style={{
          padding: 'var(--space-4)',
          background: 'rgba(255, 255, 255, 0.03)',
          border: '1px dashed var(--color-border)',
          borderRadius: 'var(--radius-md)',
          color: 'var(--color-text-dim)',
          fontSize: '0.9rem',
          textAlign: 'center',
        }}
      >
        {emptyMessage}
      </div>
    )
  }

  return (
    <div className="matches-table-wrap">
      {title && (
        <div style={{ padding: '0.8rem 1rem', borderBottom: '1px solid var(--color-border)', background: 'var(--color-surface-muted)', fontWeight: 700, fontSize: '0.95rem' }}>
          {title} ({persons.length})
        </div>
      )}
      <table className="matches-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th
              onClick={() => handleSort('name')}
              style={{ cursor: 'pointer', userSelect: 'none', minWidth: '180px' }}
            >
              Joueur {renderSortIndicator('name')}
            </th>
            <th
              onClick={() => handleSort('position')}
              style={{ cursor: 'pointer', userSelect: 'none', width: '105px' }}
            >
              Poste {renderSortIndicator('position')}
            </th>
            <th
              onClick={() => handleSort('age')}
              style={{ cursor: 'pointer', userSelect: 'none', width: '120px' }}
            >
              Âge & Phase {renderSortIndicator('age')}
            </th>
            {showClub && (
              <th
                onClick={() => handleSort('club')}
                style={{ cursor: 'pointer', userSelect: 'none', minWidth: '160px' }}
              >
                Club actuel {renderSortIndicator('club')}
              </th>
            )}
            {showCommune && (
              <th
                onClick={() => handleSort('commune')}
                style={{ cursor: 'pointer', userSelect: 'none', minWidth: '150px' }}
              >
                Ville natale {renderSortIndicator('commune')}
              </th>
            )}
            <th
              onClick={() => handleSort('attack')}
              style={{ cursor: 'pointer', userSelect: 'none', textAlign: 'center', width: '65px' }}
            >
              ATQ {renderSortIndicator('attack')}
            </th>
            <th
              onClick={() => handleSort('defense')}
              style={{ cursor: 'pointer', userSelect: 'none', textAlign: 'center', width: '65px' }}
            >
              DEF {renderSortIndicator('defense')}
            </th>
            <th
              onClick={() => handleSort('overall')}
              style={{ cursor: 'pointer', userSelect: 'none', textAlign: 'center', width: '80px' }}
            >
              GÉN {renderSortIndicator('overall')}
            </th>
            <th
              onClick={() => handleSort('titles')}
              style={{ cursor: 'pointer', userSelect: 'none', textAlign: 'center', width: '95px' }}
            >
              Palmarès {renderSortIndicator('titles')}
            </th>
          </tr>
        </thead>
        <tbody>
          {paginatedPersons.map((person) => {
            const overall = computeOverallRating(person)
            const peakOverall = computePeakOverallRating(person)
            const peakAge = (person.primaryRole === 'COACH' ? person.coachPeakAge : person.peakAge) ?? 27
            const phase = getCareerPhase(person.age, peakAge)
            const phaseInfo = formatCareerPhase(phase)
            const isAttacker = person.position === 'ATTACKER'
            const initials = `${person.firstName.charAt(0)}${person.lastName.charAt(0)}`

            const club = person.currentClubId && app?.clubsById ? app.clubsById.get(person.currentClubId) : null
            const trophyRecord = computePersonTrophyRecord(person, archives, app?.session, app?.clubsById)
            const totalTitles = computePersonTotalTitles(trophyRecord)

            return (
              <tr key={person.id}>
                {/* Joueur avec avatar et nom cliquable */}
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <PlayerFavoriteButton person={person} />
                    <div
                      style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '50%',
                        flexShrink: 0,
                        background: isAttacker
                          ? 'linear-gradient(135deg, #f59e0b, #ef4444)'
                          : 'linear-gradient(135deg, #3b82f6, #10b981)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 700,
                        fontSize: '0.78rem',
                        color: '#ffffff',
                        boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
                      }}
                      aria-hidden="true"
                    >
                      {initials}
                    </div>
                    <div>
                      <Link
                        to={`/personnes/${person.id}`}
                        style={{
                          color: '#ffffff',
                          fontWeight: 700,
                          textDecoration: 'none',
                          fontSize: '0.92rem',
                        }}
                      >
                        {person.firstName} {person.lastName}
                      </Link>
                      <NationalityBadge person={person} compact />
                      {!showClub && person.loanedFromClubId && person.loanedFromClubId !== person.currentClubId && (
                        <div style={{ fontSize: '0.72rem', color: '#fbbf24', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '3px' }}>
                          <span>🤝</span> Prêté par {app?.clubsById.get(person.loanedFromClubId)?.name ?? 'autre club'}
                        </div>
                      )}
                    </div>
                  </div>
                </td>

                {/* Poste */}
                <td>
                  <span
                    className={
                      (person.assignedPosition ? person.assignedPosition === 'ATTACKER' : isAttacker)
                        ? 'badge badge--amber'
                        : 'badge badge--blue'
                    }
                    style={{ fontSize: '0.72rem', padding: '2px 7px' }}
                    title={
                      person.assignedPosition && person.assignedPosition !== person.position
                        ? `Poste naturel : ${formatPosition(person.position)} (aligné comme ${formatPosition(person.assignedPosition)} titulaire)`
                        : undefined
                    }
                  >
                    {person.primaryRole === 'COACH' ? 'Entraîneur' : formatPosition(person.assignedPosition ?? person.position)}
                    {person.assignedPosition && person.assignedPosition !== person.position && ' *'}
                  </span>
                </td>

                {/* Âge & Trajectoire */}
                <td>
                  <span
                    title={`${phaseInfo.label} (Pic estimé à ${peakAge} ans)`}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', whiteSpace: 'nowrap' }}
                  >
                    <strong style={{ color: 'var(--color-text-secondary, #cbd5e1)' }}>{person.age} ans</strong>
                    <span style={{ fontSize: '0.85rem' }} role="img" aria-label={phaseInfo.label}>
                      {phaseInfo.icon}
                    </span>
                  </span>
                </td>

                {/* Club actuel */}
                {showClub && (
                  <td>
                    {person.isRetired && !isActiveCoach(person) && !(person.primaryRole === 'COACH' && !person.coachRetiredYear) ? (
                      <span className="badge badge--neutral" style={{ fontSize: '0.72rem' }}>
                        Retraité
                      </span>
                    ) : club ? (
                      <div>
                        <TeamLink team={club} showTrophies={false} />
                        {person.loanedFromClubId && person.loanedFromClubId !== person.currentClubId && (
                          <div
                            style={{
                              fontSize: '0.72rem',
                              color: '#fbbf24',
                              marginTop: '2px',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '3px',
                            }}
                            title={`Prêté par ${app?.clubsById.get(person.loanedFromClubId)?.name ?? 'club formateur'}`}
                          >
                            <span>🤝</span> En prêt
                          </div>
                        )}
                      </div>
                    ) : (
                      <span style={{ color: 'var(--color-text-dim)', fontSize: '0.85rem' }}>Sans club</span>
                    )}
                  </td>
                )}

                {/* Ville natale */}
                {showCommune && (
                  <td>
                    <CommuneLink communeId={person.birthCommuneId} communeName={person.birthCommuneName} />
                  </td>
                )}

                {/* ATQ */}
                <td style={{ textAlign: 'center' }}>
                  <span style={{ fontWeight: 700, color: '#f59e0b' }}>{person.primaryRole === 'COACH' ? '—' : person.attack}</span>
                </td>

                {/* DEF */}
                <td style={{ textAlign: 'center' }}>
                  <span style={{ fontWeight: 700, color: '#38bdf8' }}>{person.primaryRole === 'COACH' ? '—' : person.defense}</span>
                </td>

                {/* GÉN */}
                <td style={{ textAlign: 'center' }}>
                  <span
                    style={{
                      background: 'rgba(255,255,255,0.08)',
                      padding: '2px 7px',
                      borderRadius: '6px',
                      fontWeight: 800,
                      color: '#f8fafc',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      fontSize: '0.88rem',
                    }}
                    title={`Note globale : ${overall} / 30 • Potentiel au pic : ${peakOverall} (à ${peakAge} ans)`}
                  >
                    <span>{overall}</span>
                    {!person.isRetired && peakOverall > overall && (
                      <span style={{ fontSize: '0.68rem', color: '#f59e0b', fontWeight: 600 }}>
                        ↗{peakOverall}
                      </span>
                    )}
                  </span>
                </td>

                {/* Palmarès */}
                <td style={{ textAlign: 'center' }}>
                  {totalTitles > 0 ? (
                    <span
                      className="badge badge--gold"
                      style={{ fontSize: '0.75rem', fontWeight: 700, padding: '2px 7px' }}
                      title={`${totalTitles} titre(s) : ${trophyRecord.nationalTitles} national, ${trophyRecord.conferenceTitles} conf., ${trophyRecord.regionTitles} rég., ${trophyRecord.departmentTitles} dépt.`}
                    >
                      🏆 {totalTitles}
                    </span>
                  ) : (
                    <span style={{ color: 'var(--color-text-dim)', fontSize: '0.85rem' }}>—</span>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      {totalCount > 10 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 16px',
            borderTop: '1px solid var(--color-border)',
            background: 'var(--color-surface-muted)',
            flexWrap: 'wrap',
            gap: '12px',
            fontSize: '0.85rem',
            color: 'var(--color-text-dim)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>
              {pageSize === 0 ? (
                <>Tous les <strong>{totalCount}</strong> joueurs affichés</>
              ) : (
                <>
                  Affichage de <strong>{startIndex + 1}</strong> à <strong>{endIndex}</strong> sur <strong>{totalCount}</strong> joueurs
                </>
              )}
            </span>
            <span>|</span>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
              <span>Par page :</span>
              <select
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
                style={{
                  background: 'var(--color-surface)',
                  color: 'inherit',
                  border: '1px solid var(--color-border)',
                  borderRadius: '4px',
                  padding: '2px 6px',
                  fontSize: '0.8rem',
                }}
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={0}>Tout</option>
              </select>
            </label>
          </div>

          {pageSize > 0 && totalPages > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <button
                type="button"
                className="btn btn--secondary"
                onClick={() => setPage(1)}
                disabled={currentPage <= 1}
                style={{ padding: '2px 8px', fontSize: '0.78rem' }}
                title="Première page"
              >
                ««
              </button>
              <button
                type="button"
                className="btn btn--secondary"
                onClick={() => setPage(currentPage - 1)}
                disabled={currentPage <= 1}
                style={{ padding: '2px 8px', fontSize: '0.78rem' }}
              >
                ‹ Précédent
              </button>

              <span style={{ margin: '0 6px', fontWeight: 600, color: 'var(--color-text)' }}>
                Page {currentPage} / {totalPages}
              </span>

              <button
                type="button"
                className="btn btn--secondary"
                onClick={() => setPage(currentPage + 1)}
                disabled={currentPage >= totalPages}
                style={{ padding: '2px 8px', fontSize: '0.78rem' }}
              >
                Suivant ›
              </button>
              <button
                type="button"
                className="btn btn--secondary"
                onClick={() => setPage(totalPages)}
                disabled={currentPage >= totalPages}
                style={{ padding: '2px 8px', fontSize: '0.78rem' }}
                title="Dernière page"
              >
                »»
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
