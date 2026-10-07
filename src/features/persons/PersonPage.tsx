import { NationalityBadge } from './NationalityBadge'
import { PlayerFavoriteButton } from './PlayerFavoriteButton'
import { Fragment, useMemo, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useOptionalCupApp } from '../../app/CupAppContext'
import { useDetailedArchives } from '../storage/useDetailedArchives'
import {
  computeOverallRating,
  computePeakOverallRating,
  computePersonTrophyRecord,
  computePersonTotalTitles,
  formatCareerPhase,
  formatPosition,
  formatRole,
} from './personSelectors'
import { getCareerPhase } from './personGenerator'
import { computeCoachBonus, computeCoachPeakSkill, isActiveCoach } from '../coaches/coachRatings'
import '../coaches/coaches.css'
import { CommuneLink } from '../geography/CommuneLink'
import { TeamLink } from '../teams/TeamLink'
import { resolveCareerSeasonClub } from '../teams/clubResolution'
import { getClubIdentity, identityStyle } from '../teams/clubIdentity'
import { departmentLabel } from '../geography/territoryLabels'
import { getStageBadgeClass } from '../competition/echelonColors'
import { IndividualHonors, IndividualHonorCabinet } from '../awards/IndividualHonors'
import { isTeamHonor } from '../awards/seasonAwards'
import { parseSeasonYear } from '../history/palmaresSelectors'
import { getPersonOriginClub } from './personOrigin'

function getStatGrade(score: number): { label: string; color: string } {
  if (score >= 28) return { label: 'Exceptionnel / Classe Mondiale', color: '#f59e0b' }
  if (score >= 23) return { label: 'Élite Nationale', color: '#8b5cf6' }
  if (score >= 18) return { label: 'Niveau Conférence / Régional+', color: '#3b82f6' }
  if (score >= 12) return { label: 'Bon niveau Régional', color: '#10b981' }
  return { label: 'Niveau Départemental / Espoir', color: '#94a3b8' }
}

export type CareerSortKey =
  | 'year'
  | 'club'
  | 'role'
  | 'age'
  | 'attack'
  | 'defense'
  | 'matches'
  | 'goals'
  | 'defensiveStops'
  | 'shots'
  | 'stage'

export function PersonPage() {
  const { personId } = useParams<{ personId: string }>()
  const app = useOptionalCupApp()
  const persons = app?.persons ?? []
  const clubsById = app?.clubsById
  const session = app?.session
  const { archives, loading: archivesLoading, error: archivesError } = useDetailedArchives(app?.archives ?? [])

  // Tri pour l'historique de carrière
  const [careerSortKey, setCareerSortKey] = useState<CareerSortKey>('year')
  const [careerSortDir, setCareerSortDir] = useState<'asc' | 'desc'>('desc')

  const person = useMemo(() => {
    return persons.find((p) => p.id === personId)
  }, [persons, personId])

  const trophyRecord = useMemo(() => {
    if (!person) return null
    const year = session ? session.seasonYear ?? parseSeasonYear(session.seed) : null
    const performance = person.currentClubId ? app?.teamRecords?.get(person.currentClubId)?.seasons.find(s => s.year === year) : undefined
    return computePersonTrophyRecord(person, archives, session, clubsById, performance)
  }, [person, archives, session, clubsById, app?.teamRecords])

  const totalTitles = useMemo(() => {
    return trophyRecord ? computePersonTotalTitles(trophyRecord) : 0
  }, [trophyRecord])

  // Synthèse et hiérarchie des distinctions individuelles
  const individualSummary = useMemo(() => {
    if (!trophyRecord) {
      return {
        ballonOrCount: 0,
        ballonOrYears: [] as number[],
        topScorerCount: 0,
        topScorerYears: [] as number[],
        topStopsCount: 0,
        topStopsYears: [] as number[],
        bestDefenderCount: 0,
        bestDefenderYears: [] as number[],
        bestAttackerCount: 0,
        bestAttackerYears: [] as number[],
        youthAwardsCount: 0,
        confAwardsCount: 0,
        totalIndividual: 0,
        majorHonorsList: [] as Array<{ type: 'ballon-or' | 'top-scorer' | 'top-stops'; year: number; title: string; icon: string }>,
      }
    }

    let ballonOrCount = 0
    const ballonOrYears: number[] = []
    let topScorerCount = 0
    const topScorerYears: number[] = []
    let topStopsCount = 0
    const topStopsYears: number[] = []
    let bestDefenderCount = 0
    const bestDefenderYears: number[] = []
    let bestAttackerCount = 0
    const bestAttackerYears: number[] = []
    let youthAwardsCount = 0
    let confAwardsCount = 0
    const majorHonorsList: Array<{ type: 'ballon-or' | 'top-scorer' | 'top-stops'; year: number; title: string; icon: string }> = []

    for (const s of trophyRecord.seasons) {
      if (!s.individualHonors) continue
      for (const h of s.individualHonors) {
        if (isTeamHonor(h)) continue
        if (h.awardId === 'ballon-or') {
          ballonOrCount += 1
          ballonOrYears.push(s.year)
          majorHonorsList.push({ type: 'ballon-or', year: s.year, title: 'Ballon d’Or', icon: '⚽' })
        } else if (h.awardId === 'top-scorer') {
          topScorerCount += 1
          topScorerYears.push(s.year)
          majorHonorsList.push({ type: 'top-scorer', year: s.year, title: 'Soulier d’Or (Meilleur buteur)', icon: '👟' })
        } else if (h.awardId === 'top-stops') {
          topStopsCount += 1
          topStopsYears.push(s.year)
          majorHonorsList.push({ type: 'top-stops', year: s.year, title: 'Bouclier d’Or (Roi des interventions)', icon: '🛡️' })
        } else if (h.awardId === 'best-defender') {
          bestDefenderCount += 1
          bestDefenderYears.push(s.year)
        } else if (h.awardId === 'best-attacker') {
          bestAttackerCount += 1
          bestAttackerYears.push(s.year)
        } else if (h.awardId.startsWith('young-')) {
          youthAwardsCount += 1
        } else if (h.awardId.startsWith('conference-')) {
          confAwardsCount += 1
        }
      }
    }

    majorHonorsList.sort((a, b) => {
      const rankA = a.type === 'ballon-or' ? 100 : a.type === 'top-scorer' ? 85 : 80
      const rankB = b.type === 'ballon-or' ? 100 : b.type === 'top-scorer' ? 85 : 80
      if (rankB !== rankA) return rankB - rankA
      return b.year - a.year
    })

    const totalIndividual =
      ballonOrCount +
      topScorerCount +
      topStopsCount +
      bestDefenderCount +
      bestAttackerCount +
      youthAwardsCount +
      confAwardsCount

    return {
      ballonOrCount,
      ballonOrYears,
      topScorerCount,
      topScorerYears,
      topStopsCount,
      topStopsYears,
      bestDefenderCount,
      bestDefenderYears,
      bestAttackerCount,
      bestAttackerYears,
      youthAwardsCount,
      confAwardsCount,
      totalIndividual,
      majorHonorsList,
    }
  }, [trophyRecord])

  // Tri de l'historique de saisons
  const sortedCareerSeasons = useMemo(() => {
    if (!trophyRecord) return []
    const list = [...trophyRecord.seasons]
    list.sort((a, b) => {
      let cmp = 0
      switch (careerSortKey) {
        case 'year':
          cmp = a.year - b.year
          break
        case 'club':
          cmp = (a.clubName ?? '').localeCompare(b.clubName ?? '')
          break
        case 'role':
          cmp = a.role.localeCompare(b.role)
          break
        case 'age':
          cmp = a.age - b.age
          break
        case 'attack':
          cmp = a.attack - b.attack
          break
        case 'defense':
          cmp = a.defense - b.defense
          break
        case 'matches':
          cmp = (a.matchesPlayed ?? 0) - (b.matchesPlayed ?? 0)
          break
        case 'goals':
          cmp = (a.goals ?? 0) - (b.goals ?? 0)
          break
        case 'defensiveStops':
          cmp = (a.defensiveStops ?? 0) - (b.defensiveStops ?? 0)
          break
        case 'shots':
          cmp = (a.shots ?? 0) - (b.shots ?? 0)
          break
        case 'stage':
          cmp = (a.roundReached ?? 0) - (b.roundReached ?? 0)
          break
      }
      return careerSortDir === 'asc' ? cmp : -cmp
    })
    return list
  }, [trophyRecord, careerSortKey, careerSortDir])

  // Cumul des statistiques en carrière
  const careerTotals = useMemo(() => {
    if (!trophyRecord) return { matches: 0, coachMatches: 0, goals: 0, defensiveStops: 0, shots: 0 }
    return trophyRecord.seasons.reduce(
      (acc, s) => {
        const isCoachSeason = s.role === 'COACH'
        return {
          matches: acc.matches + (isCoachSeason ? 0 : (s.matchesPlayed ?? 0)),
          coachMatches: acc.coachMatches + (isCoachSeason ? (s.matchesPlayed ?? 0) : 0),
          goals: acc.goals + (isCoachSeason ? 0 : (s.goals ?? 0)),
          defensiveStops: acc.defensiveStops + (isCoachSeason ? 0 : (s.defensiveStops ?? 0)),
          shots: acc.shots + (isCoachSeason ? 0 : (s.shots ?? 0)),
        }
      },
      { matches: 0, coachMatches: 0, goals: 0, defensiveStops: 0, shots: 0 },
    )
  }, [trophyRecord])

  // Détection si la personnalité a exercé à la fois comme joueur et comme entraîneur
  const hasBothRoles = useMemo(() => {
    if (!trophyRecord) return false
    const roles = new Set(trophyRecord.seasons.map((s) => s.role))
    return roles.has('COACH') && roles.has('PLAYER')
  }, [trophyRecord])

  if (archivesLoading) return <section className="status-panel">Chargement des archives…</section>
  if (archivesError) return <section className="status-panel" role="alert">Archives indisponibles : {archivesError}</section>
  if (!person || !trophyRecord) {
    return (
      <div className="container" style={{ padding: '32px 16px' }}>
        <div style={{ marginBottom: '16px' }}>
          <Link to="/personnes" className="btn btn--secondary" style={{ textDecoration: 'none' }}>
            ← Retour à la liste des personnalités
          </Link>
        </div>
        <div
          style={{
            background: 'var(--color-surface, #1e293b)',
            padding: '32px',
            borderRadius: '12px',
            textAlign: 'center',
            border: '1px solid var(--color-border, #334155)',
          }}
        >
          <h2>Personnalité non trouvée</h2>
          <p style={{ color: 'var(--text-muted, #94a3b8)', marginTop: '8px' }}>
            Aucun joueur ou personnalité ne correspond à l'identifiant <code>{personId}</code>.
          </p>
        </div>
      </div>
    )
  }

  const overall = computeOverallRating(person)
  const peakOverall = computePeakOverallRating(person)
  const isCoach = person.primaryRole === 'COACH'
  const peakAge = (isCoach ? person.coachPeakAge : person.peakAge) ?? 27
  const phase = getCareerPhase(person.age, peakAge)
  const phaseInfo = formatCareerPhase(phase)
  const peakAttack = person.peakAttack ?? person.attack
  const peakDefense = person.peakDefense ?? person.defense
  const isAttacker = person.position === 'ATTACKER'
  const initials = `${person.firstName.charAt(0)}${person.lastName.charAt(0)}`
  const currentClub = person.currentClubId && clubsById ? clubsById.get(person.currentClubId) : null
  const parentClub = person.parentClubId && clubsById ? clubsById.get(person.parentClubId) : null
  const origin = getPersonOriginClub(person, clubsById)
  const originClub = origin && clubsById?.get(origin.id)
  const originClubName = origin?.name ?? origin?.id
  const loanedFromClub = person.loanedFromClubId && clubsById ? clubsById.get(person.loanedFromClubId) : null
  const isLoaned = Boolean(person.loanedFromClubId && person.loanedFromClubId !== person.currentClubId)

  const attackGrade = getStatGrade(person.attack)
  const defenseGrade = getStatGrade(person.defense)

  const handleCareerSort = (key: CareerSortKey) => {
    if (careerSortKey === key) {
      setCareerSortDir((prev: 'asc' | 'desc') => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setCareerSortKey(key)
      setCareerSortDir(key === 'club' || key === 'role' ? 'asc' : 'desc')
    }
  }

  const renderCareerSortIndicator = (key: CareerSortKey) => {
    if (careerSortKey !== key) {
      return <span style={{ opacity: 0.35, fontSize: '0.7rem', marginLeft: '4px' }}>↕</span>
    }
    return (
      <span style={{ color: 'var(--color-primary-light, #38bdf8)', fontSize: '0.75rem', marginLeft: '4px' }}>
        {careerSortDir === 'asc' ? '▲' : '▼'}
      </span>
    )
  }

  return (
    <section className="cup-ready">
      {/* Navigation fil d'ariane & identifiant */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', marginBottom: 'var(--space-2)' }}>
        <Link to="/personnes" className="back-link" style={{ color: 'var(--color-primary)', fontWeight: 600 }}>
          ← Toutes les personnalités
        </Link>
        <PlayerFavoriteButton person={person} withLabel />
      </div>

      <p className="eyebrow" style={{ marginTop: 'var(--space-2)' }}>Fiche Personnalité • Football Territorial</p>

      {/* Carte d'en-tête héro */}
      <div
        className={currentClub ? 'club-identity-hero person-identity-hero' : undefined}
        style={{
          background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.95), rgba(15, 23, 42, 0.95))',
          borderRadius: '16px',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          padding: '24px 32px',
          margin: 'var(--space-2) 0 var(--space-4)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.25)',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '24px',
          ...(currentClub ? { ...identityStyle(getClubIdentity(currentClub)), background: 'var(--club-surface)', borderTop: '4px solid var(--club-primary)', borderBottom: '4px solid var(--club-secondary)' } : {}),
        }}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '20px', flex: 1, minWidth: 'min(100%, 320px)' }}>
          <div
            style={{
              width: '76px',
              height: '76px',
              borderRadius: '50%',
              background: currentClub ? getClubIdentity(currentClub).primaryColor : isAttacker
                ? 'linear-gradient(135deg, #f59e0b, #ef4444)'
                : 'linear-gradient(135deg, #3b82f6, #10b981)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 800,
              fontSize: '1.85rem',
              color: currentClub ? identityStyle(getClubIdentity(currentClub))['--club-on-primary'] : '#ffffff',
              boxShadow: '0 4px 14px rgba(0,0,0,0.3)',
              flexShrink: 0,
            }}
          >
            {initials}
          </div>

          <div style={{ flex: 1, minWidth: 'min(100%, 200px)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '8px' }}>
              <span className={isAttacker ? 'badge badge--amber' : 'badge badge--blue'}>
                {isCoach ? 'Entraîneur' : formatPosition(person.position)}
              </span>
              <NationalityBadge person={person} />
              <span className={`badge ${phaseInfo.badgeClass}`} title={`Pic de carrière estimé à ${peakAge} ans`}>
                {phaseInfo.icon} {phaseInfo.label}
              </span>
              {totalTitles > 0 && (
                <span className="badge badge--gold" title={`${totalTitles} titre(s) officiel(s) au palmarès`}>
                  🏆 {totalTitles} titre{totalTitles > 1 ? 's' : ''}
                </span>
              )}
              {isCoach && !person.coachRetiredYear ? (
                <span className="badge badge--emerald">{isActiveCoach(person) ? 'Entraîneur en poste' : 'Entraîneur sans club'}</span>
              ) : person.isRetired ? (
                <span className="badge badge--neutral" style={{ background: 'rgba(239, 68, 68, 0.2)', color: '#fca5a5' }}>
                  Retraité {person.retiredYear ? `(${person.retiredYear})` : ''}
                </span>
              ) : (
                <span className="badge badge--emerald">Actif</span>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
              <h1 style={{ margin: 0, fontSize: '2.1rem', fontWeight: 800, color: '#f8fafc', letterSpacing: '-0.02em', lineHeight: 1.2 }}>
                {person.firstName} {person.lastName}
              </h1>
              {individualSummary.majorHonorsList.length > 0 && (
                <div
                  className="person-major-honors-strip"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}
                  aria-label="Distinctions majeures remportées"
                >
                  {individualSummary.majorHonorsList.map((item, idx) => (
                    <span
                      key={`${item.type}-${item.year}-${idx}`}
                      className={`major-honor-badge major-honor-badge--${item.type}`}
                      title={`${item.title} · ${item.year}`}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: '28px',
                        height: '28px',
                        borderRadius: '50%',
                        fontSize: item.type === 'ballon-or' ? '1rem' : '0.9rem',
                        lineHeight: 1,
                        cursor: 'help',
                        flexShrink: 0,
                        ...(item.type === 'ballon-or'
                          ? {
                              background: 'radial-gradient(circle, #fef08a 0%, #eab308 60%, #a16207 100%)',
                              border: '1.5px solid #fef08a',
                              boxShadow: '0 0 10px rgba(234, 179, 8, 0.65), 0 2px 4px rgba(0,0,0,0.4)',
                            }
                          : item.type === 'top-scorer'
                            ? {
                                background: 'radial-gradient(circle, #fef3c7 0%, #f59e0b 65%, #b45309 100%)',
                                border: '1.5px solid #fde68a',
                                boxShadow: '0 0 8px rgba(245, 158, 11, 0.55), 0 2px 4px rgba(0,0,0,0.4)',
                              }
                            : {
                                background: 'radial-gradient(circle, #e0f2fe 0%, #38bdf8 65%, #0369a1 100%)',
                                border: '1.5px solid #bae6fd',
                                boxShadow: '0 0 8px rgba(56, 189, 248, 0.55), 0 2px 4px rgba(0,0,0,0.4)',
                              }),
                      }}
                    >
                      {item.icon}
                    </span>
                  ))}
                </div>
              )}



              {currentClub ? (
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '1.3rem', color: 'var(--text-muted, #64748b)' }}>•</span>
                  <span style={{ fontSize: '1.5rem', fontWeight: 700 }}>
                    <TeamLink team={currentClub} badgeSize="lg" inline={true} />
                  </span>
                  {currentClub.isFusion && (
                    <span
                      className="badge badge--accent"
                      style={{ fontSize: '0.72rem', padding: '2px 7px', background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8' }}
                    >
                      🤝 Alliance
                    </span>
                  )}
                  {isLoaned && parentClub && (
                    <span
                      className="badge badge--accent"
                      style={{
                        fontSize: '0.78rem',
                        padding: '3px 8px',
                        background: 'rgba(245, 158, 11, 0.15)',
                        color: '#fbbf24',
                        border: '1px solid rgba(245, 158, 11, 0.35)',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '5px',
                      }}
                      title={`Joueur sous contrat avec ${parentClub.name}, prêté pour la saison en cours`}
                    >
                      🤝 En prêt de <TeamLink team={parentClub} inline showTrophies={false} />
                    </span>
                  )}
                </div>
              ) : person.isRetired && !(isCoach && !person.coachRetiredYear) ? (
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '1.3rem', color: 'var(--text-muted, #64748b)' }}>•</span>
                  <span style={{ fontSize: '1.2rem', fontWeight: 600, color: '#fca5a5' }}>
                    Retraité {person.retiredYear ? `(${person.retiredYear})` : ''}
                  </span>
                </div>
              ) : (
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '1.3rem', color: 'var(--text-muted, #64748b)' }}>•</span>
                  <span style={{ fontSize: '1.2rem', fontWeight: 500, color: 'var(--text-muted, #94a3b8)', fontStyle: 'italic' }}>
                    Sans club
                  </span>
                </div>
              )}
            </div>

            <p style={{ margin: '8px 0 0 0', color: 'var(--text-muted, #94a3b8)', fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span>{person.age} ans</span>
              <span>•</span>
              <span>{formatRole(person.primaryRole)}</span>
              <span>•</span>
              <span>Originaire de <CommuneLink communeId={person.birthCommuneId} communeName={person.birthCommuneName} /></span>
              <span>•</span>
              <span>{person.careerYears > 0 ? `${person.careerYears} saison${person.careerYears > 1 ? 's' : ''} en Coupe` : '1ère saison'}</span>
            </p>
          </div>
        </div>

        {/* Notes globales actuelle et au pic */}
        <div style={{ display: 'flex', gap: '14px', alignItems: 'center', flexWrap: 'wrap' }}>
          <div
            style={{
              background: 'rgba(255, 255, 255, 0.04)',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              borderRadius: '14px',
              padding: '12px 20px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              minWidth: '85px',
            }}
          >
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted, #94a3b8)', textTransform: 'uppercase' }}>
              Note Actuelle
            </span>
            <span style={{ fontSize: '2.5rem', fontWeight: 900, color: '#f8fafc', lineHeight: 1.1 }}>
              {overall}
            </span>
            <span style={{ fontSize: '0.75rem', color: isAttacker ? '#f59e0b' : '#38bdf8', fontWeight: 600 }}>
              / 30
            </span>
          </div>

          <div
            style={{
              background: 'rgba(255, 255, 255, 0.02)',
              border: '1px dashed rgba(245, 158, 11, 0.35)',
              borderRadius: '14px',
              padding: '12px 18px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              minWidth: '85px',
            }}
            title={`Niveau maximal atteint ou projeté à l'apogée (${peakAge} ans)`}
          >
            <span style={{ fontSize: '0.72rem', fontWeight: 600, color: '#f59e0b', textTransform: 'uppercase' }}>
              👑 Potentiel Pic
            </span>
            <span style={{ fontSize: '2.2rem', fontWeight: 800, color: '#fbbf24', lineHeight: 1.1 }}>
              {peakOverall}
            </span>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted, #94a3b8)', fontWeight: 500 }}>
              à {peakAge} ans
            </span>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))', gap: '16px' }}>
        {/* Fiche d'appartenance et origine */}
        <div
          style={{
            background: 'var(--color-surface, #1e293b)',
            borderRadius: '12px',
            border: '1px solid var(--color-border, #334155)',
            padding: '16px 20px',
          }}
        >
          <h2 style={{ fontSize: '1.05rem', marginBottom: '12px', color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>📍</span> Identité & Territoire
          </h2>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px 16px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '6px' }}>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted, #94a3b8)', textTransform: 'uppercase', fontWeight: 600 }}>Commune natale</span>
              <div style={{ fontWeight: 600, fontSize: '0.92rem' }}>
                <CommuneLink communeId={person.birthCommuneId} communeName={person.birthCommuneName} />
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '6px' }}>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted, #94a3b8)', textTransform: 'uppercase', fontWeight: 600 }}>Département</span>
              <span style={{ fontWeight: 600, color: '#f8fafc', fontSize: '0.92rem' }}>
                {departmentLabel(person.birthDepartmentId)} ({person.birthDepartmentId})
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '6px' }}>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted, #94a3b8)', textTransform: 'uppercase', fontWeight: 600 }}>Club affilié actuel</span>
              <div style={{ fontWeight: 600, fontSize: '0.92rem' }}>
                {person.isRetired && !(isCoach && !person.coachRetiredYear) ? (
                  <span style={{ color: '#94a3b8' }}>Sans club (Retraité)</span>
                ) : currentClub ? (
                  <TeamLink team={currentClub} />
                ) : (
                  <span style={{ color: '#94a3b8' }}>Sans club</span>
                )}
              </div>
            </div>

            {/* Club d'origine / formateur */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '6px' }}>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted, #94a3b8)', textTransform: 'uppercase', fontWeight: 600 }}>Club d'origine / formateur</span>
              <div style={{ fontWeight: 600, fontSize: '0.92rem' }}>
                {originClub ? (
                  <TeamLink team={{ ...originClub, name: originClubName ?? originClub.name }} />
                ) : originClubName ? (
                  <Link className="team-link" to={`/equipes/${origin!.id}`}>{originClubName}</Link>
                ) : (
                  <span style={{ color: '#94a3b8' }}>-</span>
                )}
              </div>
            </div>

            {/* Statut de prêt si actif */}
            {isLoaned && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '6px' }}>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted, #94a3b8)', textTransform: 'uppercase', fontWeight: 600 }}>Statut de prêt</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem' }}>
                  <span
                    className="badge"
                    style={{
                      fontSize: '0.68rem',
                      padding: '1px 6px',
                      background: 'rgba(245, 158, 11, 0.15)',
                      color: '#fbbf24',
                      border: '1px solid rgba(245, 158, 11, 0.3)',
                      fontWeight: 600,
                    }}
                  >
                    🤝 En prêt
                  </span>
                  <span style={{ color: '#94a3b8' }}>
                    de {loanedFromClub ? <TeamLink team={loanedFromClub} inline showTrophies={false} /> : (parentClub ? <TeamLink team={parentClub} inline showTrophies={false} /> : 'club prêteur inconnu')}
                  </span>
                </div>
              </div>
            )}

            {currentClub && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '6px' }}>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted, #94a3b8)', textTransform: 'uppercase', fontWeight: 600 }}>Force du club</span>
                <span style={{ fontWeight: 600, color: '#38bdf8', fontSize: '0.92rem' }}>
                  {currentClub.strength} / 30
                </span>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px', paddingTop: '6px', borderTop: '1px dashed rgba(255,255,255,0.08)', fontSize: '0.75rem' }}>
            <span style={{ color: 'var(--text-muted, #94a3b8)' }}>Identifiant joueur</span>
            <code style={{ fontSize: '0.78rem', color: '#94a3b8', background: 'rgba(0,0,0,0.2)', padding: '1px 5px', borderRadius: '4px' }}>{person.id}</code>
          </div>
        </div>

        {/* Fiche des statistiques Joueur */}
        <div
          style={{
            background: 'var(--color-surface, #1e293b)',
            borderRadius: '12px',
            border: '1px solid var(--color-border, #334155)',
            padding: '16px 20px',
          }}
        >
          <h2 style={{ fontSize: '1.05rem', margin: '0 0 12px 0', color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>⚡</span> {isCoach ? 'Ancienne carrière de joueur (0 - 30)' : 'Statistiques de Joueur (0 - 30)'}
          </h2>

          {/* Attaque & Défense côte à côte */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
            {/* Stat Attaque */}
            <div style={{ background: 'rgba(255,255,255,0.02)', padding: '8px 12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '4px' }}>
                <span style={{ fontWeight: 600, fontSize: '0.82rem', color: '#f59e0b', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span>⚔️</span> Attaque
                </span>
                <span style={{ fontSize: '1.15rem', fontWeight: 800, color: '#f59e0b' }}>
                  {person.attack} <span style={{ fontSize: '0.72rem', color: 'var(--text-muted, #94a3b8)' }}>/ 30</span>
                </span>
              </div>
              <div style={{ height: '6px', background: 'rgba(255,255,255,0.1)', borderRadius: '3px', overflow: 'hidden' }}>
                <div
                  style={{
                    height: '100%',
                    width: `${(person.attack / 30) * 100}%`,
                    background: 'linear-gradient(90deg, #f59e0b, #ef4444)',
                    borderRadius: '3px',
                  }}
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px', fontSize: '0.7rem' }}>
                <span style={{ color: attackGrade.color, fontWeight: 500 }}>{attackGrade.label}</span>
                {person.attack !== peakAttack && (
                  <span style={{ color: '#fbbf24', fontWeight: 600 }}>Pic : {peakAttack}</span>
                )}
              </div>
            </div>

            {/* Stat Défense */}
            <div style={{ background: 'rgba(255,255,255,0.02)', padding: '8px 12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '4px' }}>
                <span style={{ fontWeight: 600, fontSize: '0.82rem', color: '#38bdf8', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span>🛡️</span> Défense
                </span>
                <span style={{ fontSize: '1.15rem', fontWeight: 800, color: '#38bdf8' }}>
                  {person.defense} <span style={{ fontSize: '0.72rem', color: 'var(--text-muted, #94a3b8)' }}>/ 30</span>
                </span>
              </div>
              <div style={{ height: '6px', background: 'rgba(255,255,255,0.1)', borderRadius: '3px', overflow: 'hidden' }}>
                <div
                  style={{
                    height: '100%',
                    width: `${(person.defense / 30) * 100}%`,
                    background: 'linear-gradient(90deg, #3b82f6, #10b981)',
                    borderRadius: '3px',
                  }}
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px', fontSize: '0.7rem' }}>
                <span style={{ color: defenseGrade.color, fontWeight: 500 }}>{defenseGrade.label}</span>
                {person.defense !== peakDefense && (
                  <span style={{ color: '#38bdf8', fontWeight: 600 }}>Pic : {peakDefense}</span>
                )}
              </div>
            </div>
          </div>

          {/* Encadré Trajectoire & Apogée sportive (compact) */}
          <div
            style={{
              background: 'rgba(255, 255, 255, 0.03)',
              borderRadius: '8px',
              padding: '8px 12px',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              marginBottom: '10px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3px' }}>
              <span style={{ fontWeight: 600, fontSize: '0.8rem', color: phaseInfo.color, display: 'flex', alignItems: 'center', gap: '5px' }}>
                <span>{phaseInfo.icon}</span> {phaseInfo.label}
              </span>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted, #94a3b8)' }}>
                Apogée : <strong style={{ color: '#f8fafc' }}>{peakAge} ans</strong>
              </span>
            </div>
            <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-secondary, #cbd5e1)', lineHeight: 1.35 }}>
              {isCoach && `Progression jusqu’à ${peakAge} ans, 2 saisons au pic, puis déclin progressif.`}
              {!isCoach && person.age < peakAge && (
                `En développement. Progression chaque saison vers son apogée (${peakAge} ans).`
              )}
              {!isCoach && (person.age === peakAge || person.age === peakAge + 1) && (
                `Au sommet de son potentiel athlétique et technique (${peakAge}-${peakAge + 1} ans).`
              )}
              {!isCoach && person.age > peakAge + 1 && (
                `Post-apogée (${peakAge} ans) : déclin physique compensé par l'expérience du jeu.`
              )}
            </p>
          </div>

          {/* Aptitudes futures (compact inline row) */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', background: 'rgba(0,0,0,0.2)', padding: '6px 12px', borderRadius: '8px', fontSize: '0.78rem', flexWrap: 'wrap' }}>
            <span style={{ color: 'var(--text-muted, #94a3b8)', fontWeight: 500 }}>Reconversion :</span>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
              <span>Tactique Entraîneur : <strong style={{ color: '#cbd5e1' }}>{isCoach ? person.coachSkill : computeCoachPeakSkill(person)}/30</strong></span>
              <span>•</span>
              <span>Gestion Président : <strong style={{ color: '#cbd5e1' }}>{person.presidentSkill ?? 10}/30</strong></span>
            </div>
          </div>
        </div>
      </div>

      {isCoach && <section className="coach-panel" aria-label="Carrière d’entraîneur">
        <h2>Carrière d’entraîneur</h2>
        <strong>{person.coachSkill}/30 actuellement · Potentiel {person.coachPeakSkill}/30</strong>
        <p>Début à {person.coachStartAge} ans · Pic à {person.coachPeakAge} ans · {phaseInfo.label} · Départ à 65 ans.</p>
        {(() => {
          const coachBonus = currentClub && person.coachSkill
            ? computeCoachBonus(person.coachSkill, currentClub.baseStrength ?? currentClub.strength)
            : Math.round(((person.coachSkill ?? 0) * 0.1) * 10) / 10
          return (
            <p>{person.coachRetiredYear ? `Carrière terminée en ${person.coachRetiredYear}.` : isActiveCoach(person) ? (currentClub ? `Apport à ${currentClub.name} : +${coachBonus.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} point(s) de force relative.` : `Apport au club : +${coachBonus.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} point(s) de force.`) : 'Disponible pour un poste au prochain mercato.'}</p>
          )
        })()}
      </section>}

      {/* Palmarès & Distinctions de la Personnalité */}
      <div className="team-palmares-box" style={{ marginTop: '20px', padding: '18px 22px' }}>
        <div className="team-palmares-header" style={{ marginBottom: '14px' }}>
          <h2 style={{ fontSize: '1.25rem', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>🏆</span> Palmarès & Distinctions
          </h2>
          <span className="team-palmares-status">
            {totalTitles > 0 ? `${totalTitles} titre${totalTitles > 1 ? 's' : ''} collectif${totalTitles > 1 ? 's' : ''}` : 'En quête d’un titre d’équipe'}
            {individualSummary.totalIndividual > 0 ? ` · ${individualSummary.totalIndividual} distinction${individualSummary.totalIndividual > 1 ? 's' : ''} individuelle${individualSummary.totalIndividual > 1 ? 's' : ''}` : ''}
          </span>
        </div>

        {/* LIGNE 1 : Titres collectifs & championnats */}
        <div style={{ marginBottom: '14px' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted, #94a3b8)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span>🏆</span> Titres en club & Championnats
          </div>
          <div className="team-trophies-grid" style={{ marginBottom: 0, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px' }}>
            {/* Trophée Champion de France */}
            <div className={`trophy-kpi-card is-compact ${trophyRecord.nationalTitles > 0 ? 'trophy-kpi-card--gold' : ''}`}>
              <div className="trophy-kpi-icon">🏆</div>
              <div className="trophy-kpi-content">
                <span className="trophy-kpi-label">Champion de France</span>
                <div className="trophy-kpi-value-row">
                  <strong className="trophy-kpi-count">{trophyRecord.nationalTitles}</strong>
                  <span className="trophy-kpi-unit">{trophyRecord.nationalTitles > 1 ? 'titres' : 'titre'}</span>
                </div>
                {trophyRecord.nationalTitleYears.length > 0 && (
                  <span className="trophy-kpi-years">
                    Édition{trophyRecord.nationalTitles > 1 ? 's' : ''} : {trophyRecord.nationalTitleYears.join(', ')}
                  </span>
                )}
              </div>
            </div>

            {/* Trophée Champion de Conférence */}
            <div className={`trophy-kpi-card is-compact ${trophyRecord.conferenceTitles > 0 ? 'trophy-kpi-card--conf' : ''}`}>
              <div className="trophy-kpi-icon">👑</div>
              <div className="trophy-kpi-content">
                <span className="trophy-kpi-label">Champion de Conférence</span>
                <div className="trophy-kpi-value-row">
                  <strong className="trophy-kpi-count">{trophyRecord.conferenceTitles}</strong>
                  <span className="trophy-kpi-unit">{trophyRecord.conferenceTitles > 1 ? 'titres' : 'titre'}</span>
                </div>
                {trophyRecord.conferenceTitleDetails.length > 0 && (
                  <span className="trophy-kpi-years">
                    {trophyRecord.conferenceTitleDetails.map((d) => `${d.year}${d.clubName ? ` (${d.clubName})` : ''}`).join(', ')}
                  </span>
                )}
              </div>
            </div>

            {/* Trophée Champion Régional */}
            <div className={`trophy-kpi-card is-compact ${trophyRecord.regionTitles > 0 ? 'trophy-kpi-card--region' : ''}`}>
              <div className="trophy-kpi-icon">🌟</div>
              <div className="trophy-kpi-content">
                <span className="trophy-kpi-label">Champion Régional</span>
                <div className="trophy-kpi-value-row">
                  <strong className="trophy-kpi-count">{trophyRecord.regionTitles}</strong>
                  <span className="trophy-kpi-unit">{trophyRecord.regionTitles > 1 ? 'titres' : 'titre'}</span>
                </div>
                {trophyRecord.regionTitleDetails.length > 0 && (
                  <span className="trophy-kpi-years">
                    {trophyRecord.regionTitleDetails.map((d) => `${d.year}`).join(', ')}
                  </span>
                )}
              </div>
            </div>

            {/* Trophée Champion Départemental */}
            <div className={`trophy-kpi-card is-compact ${trophyRecord.departmentTitles > 0 ? 'trophy-kpi-card--dept' : ''}`}>
              <div className="trophy-kpi-icon">🏅</div>
              <div className="trophy-kpi-content">
                <span className="trophy-kpi-label">Champion Départemental</span>
                <div className="trophy-kpi-value-row">
                  <strong className="trophy-kpi-count">{trophyRecord.departmentTitles}</strong>
                  <span className="trophy-kpi-unit">{trophyRecord.departmentTitles > 1 ? 'titres' : 'titre'}</span>
                </div>
                {trophyRecord.departmentTitleDetails.length > 0 && (
                  <span className="trophy-kpi-years">
                    {trophyRecord.departmentTitleDetails.map((d) => `${d.year}`).join(', ')}
                  </span>
                )}
              </div>
            </div>

            {/* Meilleure Performance */}
            <div className="trophy-kpi-card is-compact trophy-kpi-card--stage">
              <div className="trophy-kpi-icon">⭐</div>
              <div className="trophy-kpi-content">
                <span className="trophy-kpi-label">Meilleur Parcours</span>
                <div className="trophy-kpi-value-row">
                  {trophyRecord.bestPerformance ? (
                    <span
                      className={getStageBadgeClass(trophyRecord.bestPerformance.stageLabel, trophyRecord.bestPerformance.roundNumber)}
                      style={{ fontSize: '0.8rem', padding: '2px 7px' }}
                    >
                      {trophyRecord.bestPerformance.stageLabel}
                    </span>
                  ) : (
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-muted, #94a3b8)' }}>Aucun parcours</span>
                  )}
                </div>
                <span className="trophy-kpi-years">
                  {trophyRecord.bestPerformance ? (
                    <>
                      Édition {trophyRecord.bestPerformance.year}
                      {trophyRecord.bestPerformance.clubName ? ` · ${trophyRecord.bestPerformance.clubName}` : ''}
                    </>
                  ) : (
                    'En attente'
                  )}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* LIGNE 2 : Principaux titres individuels */}
        <div style={{ marginBottom: '14px' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#fbbf24', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span>🏅</span> Principaux Titres Individuels
          </div>
          <div className="team-trophies-grid" style={{ marginBottom: 0, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px' }}>
            {/* Ballon d'Or - Plus grosse distinction */}
            <div className={`trophy-kpi-card is-compact ${individualSummary.ballonOrCount > 0 ? 'trophy-kpi-card--ballon-or' : ''}`}>
              <div className="trophy-kpi-icon" style={{ filter: individualSummary.ballonOrCount > 0 ? 'drop-shadow(0 0 6px rgba(234, 179, 8, 0.8))' : 'grayscale(0.6)' }}>
                ⚽
              </div>
              <div className="trophy-kpi-content">
                <span className="trophy-kpi-label" style={{ color: individualSummary.ballonOrCount > 0 ? '#fef08a' : undefined }}>
                  👑 Ballon d’Or
                </span>
                <div className="trophy-kpi-value-row">
                  <strong className="trophy-kpi-count" style={{ color: individualSummary.ballonOrCount > 0 ? '#fef08a' : undefined }}>
                    {individualSummary.ballonOrCount}
                  </strong>
                  <span className="trophy-kpi-unit">{individualSummary.ballonOrCount > 1 ? 'titres' : 'titre'}</span>
                </div>
                <span className="trophy-kpi-years">
                  {individualSummary.ballonOrYears.length > 0
                    ? `Édition${individualSummary.ballonOrCount > 1 ? 's' : ''} : ${individualSummary.ballonOrYears.join(', ')}`
                    : 'Plus prestigieuse distinction'}
                </span>
              </div>
            </div>

            {/* Soulier d'Or - Distinction majeure */}
            <div className={`trophy-kpi-card is-compact ${individualSummary.topScorerCount > 0 ? 'trophy-kpi-card--scorer' : ''}`}>
              <div className="trophy-kpi-icon" style={{ filter: individualSummary.topScorerCount > 0 ? 'drop-shadow(0 0 5px rgba(245, 158, 11, 0.7))' : 'grayscale(0.6)' }}>
                👟
              </div>
              <div className="trophy-kpi-content">
                <span className="trophy-kpi-label" style={{ color: individualSummary.topScorerCount > 0 ? '#fde68a' : undefined }}>
                  Soulier d’Or
                </span>
                <div className="trophy-kpi-value-row">
                  <strong className="trophy-kpi-count" style={{ color: individualSummary.topScorerCount > 0 ? '#fde68a' : undefined }}>
                    {individualSummary.topScorerCount}
                  </strong>
                  <span className="trophy-kpi-unit">{individualSummary.topScorerCount > 1 ? 'titres' : 'titre'}</span>
                </div>
                <span className="trophy-kpi-years">
                  {individualSummary.topScorerYears.length > 0
                    ? `Édition${individualSummary.topScorerCount > 1 ? 's' : ''} : ${individualSummary.topScorerYears.join(', ')}`
                    : 'Meilleur buteur national'}
                </span>
              </div>
            </div>

            {/* Bouclier d'Or - Distinction majeure */}
            <div className={`trophy-kpi-card is-compact ${individualSummary.topStopsCount > 0 ? 'trophy-kpi-card--stops' : ''}`}>
              <div className="trophy-kpi-icon" style={{ filter: individualSummary.topStopsCount > 0 ? 'drop-shadow(0 0 5px rgba(56, 189, 248, 0.7))' : 'grayscale(0.6)' }}>
                🛡️
              </div>
              <div className="trophy-kpi-content">
                <span className="trophy-kpi-label" style={{ color: individualSummary.topStopsCount > 0 ? '#bae6fd' : undefined }}>
                  Bouclier d’Or
                </span>
                <div className="trophy-kpi-value-row">
                  <strong className="trophy-kpi-count" style={{ color: individualSummary.topStopsCount > 0 ? '#bae6fd' : undefined }}>
                    {individualSummary.topStopsCount}
                  </strong>
                  <span className="trophy-kpi-unit">{individualSummary.topStopsCount > 1 ? 'titres' : 'titre'}</span>
                </div>
                <span className="trophy-kpi-years">
                  {individualSummary.topStopsYears.length > 0
                    ? `Édition${individualSummary.topStopsCount > 1 ? 's' : ''} : ${individualSummary.topStopsYears.join(', ')}`
                    : 'Roi des arrêts & interventions'}
                </span>
              </div>
            </div>

            {/* Meilleurs par Poste (Défenseur / Attaquant) */}
            <div className={`trophy-kpi-card is-compact ${individualSummary.bestDefenderCount + individualSummary.bestAttackerCount > 0 ? 'trophy-kpi-card--role' : ''}`}>
              <div className="trophy-kpi-icon">⚔️</div>
              <div className="trophy-kpi-content">
                <span className="trophy-kpi-label">Meilleurs par Poste</span>
                <div className="trophy-kpi-value-row">
                  <strong className="trophy-kpi-count">
                    {individualSummary.bestDefenderCount + individualSummary.bestAttackerCount}
                  </strong>
                  <span className="trophy-kpi-unit">{individualSummary.bestDefenderCount + individualSummary.bestAttackerCount > 1 ? 'titres' : 'titre'}</span>
                </div>
                <span className="trophy-kpi-years">
                  {[
                    individualSummary.bestAttackerCount > 0 ? `${individualSummary.bestAttackerCount} Attaquant` : null,
                    individualSummary.bestDefenderCount > 0 ? `${individualSummary.bestDefenderCount} Défenseur` : null,
                  ].filter(Boolean).join(' · ') || 'Défenseur / attaquant de saison'}
                </span>
              </div>
            </div>

            {/* Espoirs & Conférence */}
            <div className={`trophy-kpi-card is-compact ${individualSummary.youthAwardsCount + individualSummary.confAwardsCount > 0 ? 'trophy-kpi-card--youth' : ''}`}>
              <div className="trophy-kpi-icon">🌱</div>
              <div className="trophy-kpi-content">
                <span className="trophy-kpi-label">Espoirs & Conférence</span>
                <div className="trophy-kpi-value-row">
                  <strong className="trophy-kpi-count">
                    {individualSummary.youthAwardsCount + individualSummary.confAwardsCount}
                  </strong>
                  <span className="trophy-kpi-unit">{individualSummary.youthAwardsCount + individualSummary.confAwardsCount > 1 ? 'titres' : 'titre'}</span>
                </div>
                <span className="trophy-kpi-years">
                  {[
                    individualSummary.youthAwardsCount > 0 ? `${individualSummary.youthAwardsCount} Espoir${individualSummary.youthAwardsCount > 1 ? 's' : ''}` : null,
                    individualSummary.confAwardsCount > 0 ? `${individualSummary.confAwardsCount} Conférence` : null,
                  ].filter(Boolean).join(' · ') || 'Distinctions espoir & régionales'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Détail par édition des distinctions individuelles */}
        <IndividualHonorCabinet seasons={trophyRecord.seasons} />
      </div>

      {/* Historique de Carrière & Parcours en Club */}
      <div
        style={{
          background: 'var(--color-surface, #1e293b)',
          borderRadius: '14px',
          border: '1px solid var(--color-border, #334155)',
          padding: '24px',
          marginTop: '24px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
          <div>
            <h2 style={{ fontSize: '1.2rem', margin: 0, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>📜</span> Historique de Carrière & Parcours en Club
            </h2>
            <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: 'var(--text-muted, #94a3b8)' }}>
              Détail des matchs, buts, actions défensives et parcours en Coupe de France des Communes
            </p>
          </div>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted, #94a3b8)' }}>
            {trophyRecord.seasons.length} saison{trophyRecord.seasons.length > 1 ? 's' : ''} enregistrée{trophyRecord.seasons.length > 1 ? 's' : ''}
          </span>
        </div>

        {/* Mini KPI récapitulatif de carrière */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
            gap: '10px',
            marginBottom: '16px',
            padding: '12px 16px',
            background: 'rgba(255, 255, 255, 0.02)',
            borderRadius: '10px',
            border: '1px solid rgba(255, 255, 255, 0.05)',
          }}
        >
          <div>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted, #94a3b8)', textTransform: 'uppercase', fontWeight: 600 }}>
              {careerTotals.coachMatches > 0 ? 'Matchs Joueur' : 'Matchs en Coupe'}
            </span>
            <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#f8fafc' }}>
              🏟️ {careerTotals.matches}
            </div>
          </div>
          {careerTotals.coachMatches > 0 && (
            <div>
              <span style={{ fontSize: '0.72rem', color: '#c084fc', textTransform: 'uppercase', fontWeight: 600 }}>Matchs Entraîneur</span>
              <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#e9d5ff' }}>
                👔 {careerTotals.coachMatches}
              </div>
            </div>
          )}
          <div>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted, #94a3b8)', textTransform: 'uppercase', fontWeight: 600 }}>Total Buts</span>
            <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#facc15' }}>
              ⚽ {careerTotals.goals}
            </div>
          </div>
          <div>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted, #94a3b8)', textTransform: 'uppercase', fontWeight: 600 }}>Interventions Déf.</span>
            <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#38bdf8' }}>
              🛡️ {careerTotals.defensiveStops}
            </div>
          </div>
          <div>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted, #94a3b8)', textTransform: 'uppercase', fontWeight: 600 }}>Tirs Tentés</span>
            <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#4ade80' }}>
              ⚡ {careerTotals.shots}
            </div>
          </div>
        </div>

        {trophyRecord.seasons.length === 0 ? (
          <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted, #94a3b8)', fontStyle: 'italic' }}>
            Aucun historique de saison enregistré pour cette personnalité.
          </div>
        ) : (
          <>
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead>
                  <tr style={{ background: 'rgba(0,0,0,0.2)', borderBottom: '1px solid var(--color-border, #334155)' }}>
                    <th
                      onClick={() => handleCareerSort('year')}
                      style={{ padding: '10px 14px', cursor: 'pointer', userSelect: 'none', width: '85px' }}
                      title="Trier par saison"
                    >
                      Saison {renderCareerSortIndicator('year')}
                    </th>
                    <th
                      onClick={() => handleCareerSort('club')}
                      style={{ padding: '10px 14px', cursor: 'pointer', userSelect: 'none', minWidth: '170px' }}
                      title="Trier par club"
                    >
                      Club {renderCareerSortIndicator('club')}
                    </th>
                    <th
                      onClick={() => handleCareerSort('role')}
                      style={{ padding: '10px 14px', cursor: 'pointer', userSelect: 'none', width: '110px' }}
                      title="Trier par rôle/poste"
                    >
                      Poste {renderCareerSortIndicator('role')}
                    </th>
                    <th
                      onClick={() => handleCareerSort('age')}
                      style={{ padding: '10px 14px', textAlign: 'center', cursor: 'pointer', userSelect: 'none', width: '70px' }}
                      title="Trier par âge"
                    >
                      Âge {renderCareerSortIndicator('age')}
                    </th>
                    <th
                      onClick={() => handleCareerSort('attack')}
                      style={{ padding: '10px 14px', textAlign: 'center', cursor: 'pointer', userSelect: 'none', width: '95px' }}
                      title="Trier par notes ATQ/DEF"
                    >
                      Notes {renderCareerSortIndicator('attack')}
                    </th>
                    <th
                      onClick={() => handleCareerSort('matches')}
                      style={{ padding: '10px 14px', textAlign: 'center', cursor: 'pointer', userSelect: 'none', width: '85px' }}
                      title="Trier par matchs joués"
                    >
                      Matchs {renderCareerSortIndicator('matches')}
                    </th>
                    <th
                      onClick={() => handleCareerSort('goals')}
                      style={{ padding: '10px 14px', textAlign: 'center', cursor: 'pointer', userSelect: 'none', width: '90px' }}
                      title="Trier par buts marqués"
                    >
                      ⚽ Buts {renderCareerSortIndicator('goals')}
                    </th>
                    <th
                      onClick={() => handleCareerSort('defensiveStops')}
                      style={{ padding: '10px 14px', textAlign: 'center', cursor: 'pointer', userSelect: 'none', width: '110px' }}
                      title="Trier par arrêts et interventions défensives"
                    >
                      🛡️ Défenses {renderCareerSortIndicator('defensiveStops')}
                    </th>
                    <th
                      onClick={() => handleCareerSort('shots')}
                      style={{ padding: '10px 14px', textAlign: 'center', cursor: 'pointer', userSelect: 'none', width: '95px' }}
                      title="Trier par tirs tentés"
                    >
                      ⚡ Tirs {renderCareerSortIndicator('shots')}
                    </th>
                    <th
                      onClick={() => handleCareerSort('stage')}
                      style={{ padding: '10px 14px', cursor: 'pointer', userSelect: 'none', minWidth: '150px' }}
                      title="Trier par parcours"
                    >
                      Parcours & Titres {renderCareerSortIndicator('stage')}
                    </th>
                    <th style={{ padding: '10px 14px', minWidth: '210px' }}>Trophées individuels</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedCareerSeasons.map((s, idx) => {
                    const prevSeason = idx > 0 ? sortedCareerSeasons[idx - 1] : null
                    const isRoleChange = prevSeason !== null && prevSeason.role !== s.role

                    const resolvedSeasonClub = resolveCareerSeasonClub(s, {
                      person,
                      clubsById,
                      clubs: app?.clubs ?? (session?.clubs ?? []),
                      session,
                      archives,
                      dataset: app?.dataset ?? undefined,
                    })
                    const hasNational = Boolean(s.isNationalChampion || s.stageLabel?.toLowerCase().includes('champion de france'))
                    const hasConf = Boolean(s.isConferenceChampion || s.stageLabel?.toLowerCase().includes('champion de conf') || s.stageLabel?.toLowerCase().includes('champion de conférence'))
                    const hasReg = Boolean(s.isRegionChampion || s.stageLabel?.toLowerCase().includes('champion rég') || s.stageLabel?.toLowerCase().includes('champion regional'))
                    const hasDept = Boolean(s.isDepartmentChampion || s.stageLabel?.toLowerCase().includes('champion dép') || s.stageLabel?.toLowerCase().includes('champion departemental'))

                    const seasonParentClubId = s.parentClubId
                    const resolvedParent = seasonParentClubId
                      ? resolveCareerSeasonClub(
                          { year: s.year, clubId: seasonParentClubId, clubName: s.parentClubName },
                          { clubsById, clubs: app?.clubs ?? (session?.clubs ?? []), session, archives, dataset: app?.dataset ?? undefined },
                        )
                      : null
                    const seasonParentClub = resolvedParent?.club ?? (seasonParentClubId && clubsById ? clubsById.get(seasonParentClubId) : null)
                    const seasonParentClubName = resolvedParent?.clubName ?? s.parentClubName ?? seasonParentClub?.name
                    const isOriginClub = Boolean(
                      (resolvedSeasonClub.clubId && resolvedSeasonClub.clubId === origin?.id) ||
                      (s.clubId && s.clubId === origin?.id),
                    )

                    const isCoachSeason = s.role === 'COACH'

                    // Code couleur d'arrière-plan selon le titre remporté (national, conférence, régional, départemental), que ce soit en joueur ou en entraîneur
                    const rowBg = hasNational
                      ? 'rgba(234, 179, 8, 0.16)'
                      : hasConf
                        ? 'rgba(168, 85, 247, 0.14)'
                        : hasReg
                          ? 'rgba(16, 185, 129, 0.14)'
                          : hasDept
                            ? 'rgba(148, 163, 184, 0.12)'
                            : idx % 2 === 1
                              ? 'rgba(255, 255, 255, 0.015)'
                              : 'transparent'

                    const rowBorderLeft = hasNational
                      ? '4px solid #facc15'
                      : hasConf
                        ? '4px solid #c084fc'
                        : hasReg
                          ? '4px solid #34d399'
                          : hasDept
                            ? '4px solid #94a3b8'
                            : '4px solid transparent'

                    const rowBorderBottom = hasNational
                      ? '1px solid rgba(234, 179, 8, 0.28)'
                      : hasConf
                        ? '1px solid rgba(168, 85, 247, 0.24)'
                        : hasReg
                          ? '1px solid rgba(16, 185, 129, 0.22)'
                          : hasDept
                            ? '1px solid rgba(148, 163, 184, 0.20)'
                            : '1px solid rgba(255, 255, 255, 0.04)'

                    return (
                      <Fragment key={`${s.year}-${s.role}-${idx}`}>
                        {/* En-tête de section initial lorsque la personne a exercé les deux rôles */}
                        {hasBothRoles && idx === 0 && (
                          <tr className="career-role-demarcation career-role-demarcation--initial">
                            <td colSpan={11} style={{ padding: 0, border: 'none' }}>
                              <div
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                                  gap: '12px',
                                  padding: '8px 14px',
                                  marginBottom: '4px',
                                  background: isCoachSeason
                                    ? 'linear-gradient(90deg, rgba(168, 85, 247, 0.22) 0%, rgba(99, 102, 241, 0.10) 60%, transparent 100%)'
                                    : 'linear-gradient(90deg, rgba(59, 130, 246, 0.22) 0%, rgba(16, 185, 129, 0.10) 60%, transparent 100%)',
                                  borderLeft: isCoachSeason ? '4px solid #a855f7' : '4px solid #38bdf8',
                                  borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
                                  borderRadius: '4px',
                                }}
                              >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  <span
                                    style={{
                                      fontSize: '0.82rem',
                                      fontWeight: 800,
                                      textTransform: 'uppercase',
                                      letterSpacing: '0.04em',
                                      color: isCoachSeason ? '#e9d5ff' : '#bae6fd',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '6px',
                                    }}
                                  >
                                    {isCoachSeason ? '👔 Période Entraîneur' : '⚽ Période Joueur'}
                                  </span>
                                  <span
                                    className={isCoachSeason ? 'badge badge--purple' : 'badge badge--blue'}
                                    style={{ fontSize: '0.68rem', padding: '1px 6px' }}
                                  >
                                    {isCoachSeason ? 'Management & Stratégie' : 'Performances Terrain'}
                                  </span>
                                </div>
                                <span style={{ fontSize: '0.74rem', color: 'var(--text-muted, #94a3b8)', fontStyle: 'italic' }}>
                                  {isCoachSeason ? 'Banc et tactique' : 'Matchs et statistiques individuelles'}
                                </span>
                              </div>
                            </td>
                          </tr>
                        )}

                        {/* Démarcation visuelle forte lors du changement de rôle (reconversion joueur ↔ entraîneur) */}
                        {isRoleChange && (
                          <tr className="career-role-demarcation career-role-demarcation--transition">
                            <td colSpan={11} style={{ padding: 0, border: 'none' }}>
                              <div
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                                  gap: '12px',
                                  padding: '12px 16px',
                                  margin: '14px 0 6px 0',
                                  background: isCoachSeason
                                    ? 'linear-gradient(90deg, rgba(168, 85, 247, 0.3) 0%, rgba(99, 102, 241, 0.16) 50%, rgba(30, 41, 59, 0.6) 100%)'
                                    : 'linear-gradient(90deg, rgba(59, 130, 246, 0.3) 0%, rgba(16, 185, 129, 0.16) 50%, rgba(30, 41, 59, 0.6) 100%)',
                                  borderTop: isCoachSeason ? '4px solid #a855f7' : '4px solid #38bdf8',
                                  borderBottom: '2px solid rgba(255, 255, 255, 0.12)',
                                  borderRadius: '6px',
                                  boxShadow: '0 4px 14px rgba(0, 0, 0, 0.3)',
                                }}
                              >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                  <span
                                    style={{
                                      fontSize: '0.88rem',
                                      fontWeight: 800,
                                      textTransform: 'uppercase',
                                      letterSpacing: '0.05em',
                                      color: isCoachSeason ? '#f3e8ff' : '#e0f2fe',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '8px',
                                    }}
                                  >
                                    {isCoachSeason ? '👔 Reconversion · Carrière d\'Entraîneur' : '⚽ Carrière de Joueur'}
                                  </span>
                                  <span
                                    className={isCoachSeason ? 'badge badge--purple' : 'badge badge--blue'}
                                    style={{ fontSize: '0.72rem', padding: '2px 8px', fontWeight: 700 }}
                                  >
                                    {isCoachSeason ? 'Staff & Stratégie' : 'Statistiques Terrain'}
                                  </span>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  <span style={{ fontSize: '0.76rem', color: '#cbd5e1', fontWeight: 500 }}>
                                    {isCoachSeason
                                      ? 'Transition vers le poste d\'entraîneur (banc & coaching)'
                                      : 'Statistiques normales de joueur (buts, défenses, tirs)'}
                                  </span>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}

                        <tr
                          style={{
                            borderBottom: rowBorderBottom,
                            borderLeft: rowBorderLeft,
                            background: rowBg,
                            transition: 'background 0.15s ease',
                          }}
                        >
                          <td style={{ padding: '10px 14px', fontWeight: 600, color: '#f8fafc', whiteSpace: 'nowrap' }}>
                            {s.year}
                          </td>
                          <td style={{ padding: '10px 14px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                              {resolvedSeasonClub.club ? (
                                <TeamLink team={resolvedSeasonClub.club} showTrophies={false} />
                              ) : resolvedSeasonClub.clubId ? (
                                <Link className="team-link" to={`/equipes/${resolvedSeasonClub.clubId}`}>
                                  {resolvedSeasonClub.clubName}
                                </Link>
                              ) : resolvedSeasonClub.clubName && resolvedSeasonClub.clubName !== 'Sans club' ? (
                                <span style={{ fontWeight: 600, color: '#cbd5e1' }}>{resolvedSeasonClub.clubName}</span>
                              ) : (
                                <span style={{ color: 'var(--text-muted, #94a3b8)' }}>Sans club</span>
                              )}
                              {s.isLoan ? (
                                <span
                                  className="badge"
                                  style={{
                                    fontSize: '0.68rem',
                                    padding: '1px 7px',
                                    background: 'rgba(245, 158, 11, 0.16)',
                                    color: '#fbbf24',
                                    border: '1px solid rgba(245, 158, 11, 0.35)',
                                    fontWeight: 600,
                                  }}
                                  title={seasonParentClubName ? `En prêt accordé par ${seasonParentClubName}` : 'En prêt pour cette saison'}
                                >
                                  🤝 Prêt
                                </span>
                              ) : isOriginClub ? (
                                <span
                                  className="badge"
                                  style={{
                                    fontSize: '0.65rem',
                                    padding: '1px 6px',
                                    background: 'rgba(56, 189, 248, 0.12)',
                                    color: '#7dd3fc',
                                    border: '1px solid rgba(56, 189, 248, 0.25)',
                                  }}
                                  title="Club formateur et d'origine"
                                >
                                  🏠 Club d'origine
                                </span>
                              ) : null}
                            </div>

                            {/* Club prêteur de cette saison, distinct du club d'origine */}
                            {s.isLoan && (
                              <div
                                style={{
                                  fontSize: '0.74rem',
                                  color: '#fbbf24',
                                  marginTop: '4px',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  flexWrap: 'wrap',
                                }}
                              >
                                <span style={{ opacity: 0.9 }}>↳ En prêt de :</span>
                                {seasonParentClub ? (
                                  <TeamLink team={{ ...seasonParentClub, name: seasonParentClubName ?? seasonParentClub.name }} showTrophies={false} />
                                ) : seasonParentClubId ? (
                                  <Link className="team-link" to={`/equipes/${seasonParentClubId}`}>{seasonParentClubName ?? seasonParentClubId}</Link>
                                ) : seasonParentClubName ? (
                                  <span style={{ fontWeight: 600, color: '#fef08a' }}>{seasonParentClubName}</span>
                                ) : (
                                  <span style={{ fontStyle: 'italic', opacity: 0.8 }}>Club prêteur inconnu</span>
                                )}
                                {seasonParentClubId === origin?.id && origin && (
                                  <span style={{ fontSize: '0.68rem', color: 'var(--text-muted, #94a3b8)', fontStyle: 'italic' }}>
                                    (Club d'origine)
                                  </span>
                                )}
                              </div>
                            )}
                          </td>
                          <td style={{ padding: '10px 14px' }}>
                            {isCoachSeason ? (
                              <span className="badge badge--purple" style={{ fontSize: '0.76rem', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                👔 Entraîneur
                              </span>
                            ) : (
                              <span className="badge badge--neutral" style={{ fontSize: '0.75rem', display: 'inline-block', whiteSpace: 'normal', maxWidth: '180px' }}>
                                {formatRole(s.role)}
                                {s.role === 'PLAYER' && s.isStarter === false && (
                                  <span style={{ display: 'block', marginTop: '4px', opacity: 0.85 }}>
                                    Au club · non titulaire
                                  </span>
                                )}
                                {s.role === 'PLAYER' && s.assignedPosition && (
                                  <span style={{ opacity: 0.85, marginLeft: '4px' }}>
                                    ({s.assignedPosition === 'ATTACKER' ? 'Att.' : 'Déf.'})
                                  </span>
                                )}
                              </span>
                            )}
                          </td>
                          <td style={{ padding: '10px 14px', textAlign: 'center', color: 'var(--text-secondary, #cbd5e1)' }}>
                            {s.age} ans
                          </td>
                          <td style={{ padding: '10px 14px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                            {isCoachSeason ? (
                              <div>
                                <strong style={{ color: '#c4b5fd', fontSize: '0.9rem' }} title="Note tactique d'entraîneur sur 30">
                                  {s.coachSkill ?? '—'}/30
                                </strong>
                                <span style={{ display: 'block', fontSize: '0.68rem', color: '#94a3b8' }}>Tactique</span>
                              </div>
                            ) : (
                              <>
                                <span style={{ color: '#f59e0b', fontWeight: 600 }}>{s.attack}</span>
                                <span style={{ color: 'var(--text-muted, #94a3b8)', margin: '0 4px' }}>/</span>
                                <span style={{ color: '#38bdf8', fontWeight: 600 }}>{s.defense}</span>
                              </>
                            )}
                          </td>
                          <td style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 600 }}>
                            {isCoachSeason ? (
                              <div>
                                <span style={{ color: '#f8fafc' }}>{s.matchesPlayed ?? 0}</span>
                                <span style={{ display: 'block', fontSize: '0.68rem', color: '#94a3b8', fontWeight: 400 }}>dirigés</span>
                              </div>
                            ) : (
                              s.matchesPlayed ?? 0
                            )}
                          </td>
                          <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                            {isCoachSeason ? (
                              <span style={{ color: 'var(--text-muted, #64748b)', fontSize: '0.85rem' }} title="Non applicable aux entraîneurs">—</span>
                            ) : s.goals && s.goals > 0 ? (
                              <span
                                className="badge badge--gold"
                                style={{
                                  fontSize: '0.82rem',
                                  fontWeight: 800,
                                  padding: '2px 8px',
                                  background: 'rgba(234, 179, 8, 0.2)',
                                  color: '#facc15',
                                  border: '1px solid rgba(234, 179, 8, 0.4)',
                                }}
                              >
                                ⚽ {s.goals}
                              </span>
                            ) : (
                              <span style={{ color: 'var(--text-muted, #64748b)', fontSize: '0.85rem' }}>0</span>
                            )}
                          </td>
                          <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                            {isCoachSeason ? (
                              <span style={{ color: 'var(--text-muted, #64748b)', fontSize: '0.85rem' }} title="Non applicable aux entraîneurs">—</span>
                            ) : s.defensiveStops && s.defensiveStops > 0 ? (
                              <span
                                className="badge badge--blue"
                                style={{
                                  fontSize: '0.82rem',
                                  fontWeight: 800,
                                  padding: '2px 8px',
                                  background: 'rgba(56, 189, 248, 0.2)',
                                  color: '#38bdf8',
                                  border: '1px solid rgba(56, 189, 248, 0.4)',
                                }}
                              >
                                🛡️ {s.defensiveStops}
                              </span>
                            ) : (
                              <span style={{ color: 'var(--text-muted, #64748b)', fontSize: '0.85rem' }}>0</span>
                            )}
                          </td>
                          <td style={{ padding: '10px 14px', textAlign: 'center', color: 'var(--text-secondary, #cbd5e1)', fontSize: '0.85rem' }}>
                            {isCoachSeason ? (
                              <span style={{ color: 'var(--text-muted, #64748b)' }} title="Non applicable aux entraîneurs">—</span>
                            ) : s.shots && s.shots > 0 ? (
                              <span>
                                <strong>{s.shots}</strong>{' '}
                                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted, #94a3b8)' }}>({s.shotsMissed ?? 0})</span>
                              </span>
                            ) : (
                              <span style={{ color: 'var(--text-muted, #64748b)' }}>—</span>
                            )}
                          </td>
                          <td style={{ padding: '10px 14px' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                              <div>
                                <span
                                  className={getStageBadgeClass(s.stageLabel, s.roundReached)}
                                  style={{ fontSize: '0.8rem', padding: '2px 8px', fontWeight: 700, display: 'inline-flex' }}
                                >
                                  {s.stageLabel ?? (s.roundReached ? `Tour ${s.roundReached}` : '—')}
                                </span>
                              </div>
                              <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                                {hasNational && (
                                  <span className="badge badge--gold" style={{ fontSize: '0.72rem', fontWeight: 700 }}>
                                    🏆 Champion
                                  </span>
                                )}
                                {hasConf && (
                                  <span className="badge badge--purple" style={{ fontSize: '0.72rem', fontWeight: 700 }}>
                                    👑 Conférence
                                  </span>
                                )}
                                {hasReg && (
                                  <span className="badge badge--emerald" style={{ fontSize: '0.72rem', fontWeight: 700 }}>
                                    🌟 Régional
                                  </span>
                                )}
                                {hasDept && (
                                  <span className="badge badge--departmental" style={{ fontSize: '0.72rem', fontWeight: 700 }}>
                                    🏅 Départemental
                                  </span>
                                )}
                              </div>
                            </div>
                          </td>
                          <td style={{ padding: '10px 14px' }}>
                            {s.individualHonors?.length ? <IndividualHonors year={s.year} honors={s.individualHonors} /> : <span style={{ color: '#94a3b8' }}>—</span>}
                          </td>
                        </tr>
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </section>
  )
}
