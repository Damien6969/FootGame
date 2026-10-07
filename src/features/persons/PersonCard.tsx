import { NationalityBadge } from './NationalityBadge'
import { Link } from 'react-router-dom'
import type { Person } from './types'
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

type PersonCardProps = {
  person: Person
  showClub?: boolean
  showCommune?: boolean
}

export function PersonCard({ person, showClub = true, showCommune = true }: PersonCardProps) {
  const overall = computeOverallRating(person)
  const peakAge = (person.primaryRole === 'COACH' ? person.coachPeakAge : person.peakAge) ?? 27
  const phase = getCareerPhase(person.age, peakAge)
  const phaseInfo = formatCareerPhase(phase)
  const peakOverall = computePeakOverallRating(person)
  const isAttacker = person.position === 'ATTACKER'

  const initials = `${person.firstName.charAt(0)}${person.lastName.charAt(0)}`

  const app = useOptionalCupApp()
  const club = person.currentClubId && app?.clubsById ? app.clubsById.get(person.currentClubId) : null
  const trophyRecord = computePersonTrophyRecord(person, app?.archives, app?.session, app?.clubsById)
  const totalTitles = computePersonTotalTitles(trophyRecord)

  return (
    <div
      className="person-card"
      style={{
        background: 'var(--color-surface, #1e293b)',
        borderRadius: '12px',
        border: '1px solid var(--color-border, #334155)',
        padding: '16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        position: 'relative',
        transition: 'transform 0.15s ease, border-color 0.15s ease',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              width: '38px',
              height: '38px',
              borderRadius: '50%',
              background: isAttacker
                ? 'linear-gradient(135deg, #f59e0b, #ef4444)'
                : 'linear-gradient(135deg, #3b82f6, #10b981)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 700,
              fontSize: '0.85rem',
              color: '#ffffff',
              boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
            }}
          >
            {initials}
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
              <Link
                to={`/personnes/${person.id}`}
                style={{
                  color: 'var(--text-primary, #ffffff)',
                  fontWeight: 600,
                  fontSize: '1rem',
                  textDecoration: 'none',
                }}
              >
                {person.firstName} {person.lastName}
              </Link>
              <NationalityBadge person={person} compact />
              {totalTitles > 0 && (
                <span
                  className="badge badge--gold"
                  style={{ fontSize: '0.68rem', padding: '1px 5px', lineHeight: 1.2 }}
                  title={`${totalTitles} titre(s) officiel(s) au palmarès (${trophyRecord.nationalTitles} national, ${trophyRecord.conferenceTitles} conf., ${trophyRecord.regionTitles} rég., ${trophyRecord.departmentTitles} dépt.)`}
                >
                  🏆 {totalTitles}
                </span>
              )}
            </div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted, #94a3b8)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span title={`${phaseInfo.label} (Pic estimé à ${peakAge} ans)`} style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                {person.age} ans <span style={{ fontSize: '0.75rem' }}>{phaseInfo.icon}</span>
              </span>
              <span>•</span>
              <span style={{ color: isAttacker ? '#f59e0b' : '#38bdf8' }}>
                {person.primaryRole === 'COACH' ? 'Entraîneur' : formatPosition(person.position)}
              </span>
            </div>
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(255, 255, 255, 0.05)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '8px',
            padding: '4px 8px',
            minWidth: '42px',
          }}
          title={`Note globale : ${overall} / 30 • Potentiel au pic : ${peakOverall} (à ${peakAge} ans)`}
        >
          <span style={{ fontSize: '0.65rem', textTransform: 'uppercase', color: 'var(--text-muted, #94a3b8)' }}>
            GÉN
          </span>
          <span style={{ fontSize: '1.1rem', fontWeight: 800, color: '#f8fafc' }}>
            {overall}
          </span>
        </div>
      </div>

      {/* Barres de stats ATQ / DEF */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '0.8rem' }}>
        <div style={{ background: 'rgba(0,0,0,0.15)', padding: '6px 8px', borderRadius: '6px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
            <span style={{ color: '#f59e0b', fontWeight: 600 }}>ATQ</span>
            <span style={{ fontWeight: 700 }}>{person.attack}</span>
          </div>
          <div style={{ height: '4px', background: 'rgba(255,255,255,0.1)', borderRadius: '2px', overflow: 'hidden' }}>
            <div
              style={{
                height: '100%',
                width: `${(person.attack / 30) * 100}%`,
                background: '#f59e0b',
                borderRadius: '2px',
              }}
            />
          </div>
        </div>

        <div style={{ background: 'rgba(0,0,0,0.15)', padding: '6px 8px', borderRadius: '6px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
            <span style={{ color: '#38bdf8', fontWeight: 600 }}>DEF</span>
            <span style={{ fontWeight: 700 }}>{person.defense}</span>
          </div>
          <div style={{ height: '4px', background: 'rgba(255,255,255,0.1)', borderRadius: '2px', overflow: 'hidden' }}>
            <div
              style={{
                height: '100%',
                width: `${(person.defense / 30) * 100}%`,
                background: '#38bdf8',
                borderRadius: '2px',
              }}
            />
          </div>
        </div>
      </div>

      {/* Informations de club et de ville natale */}
      <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '8px', fontSize: '0.78rem', color: 'var(--text-muted, #94a3b8)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {showClub && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
            <span style={{ color: 'var(--text-secondary, #cbd5e1)' }}>Club :</span>
            {person.isRetired && !isActiveCoach(person) && !(person.primaryRole === 'COACH' && !person.coachRetiredYear) ? (
              <span className="badge badge--neutral" style={{ fontSize: '0.7rem' }}>Retraité</span>
            ) : club ? (
              <TeamLink team={club} />
            ) : (
              <span>Sans club</span>
            )}
          </div>
        )}

        {showCommune && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
            <span style={{ color: 'var(--text-secondary, #cbd5e1)' }}>Origine :</span>
            <CommuneLink communeId={person.birthCommuneId} communeName={person.birthCommuneName} />
          </div>
        )}
      </div>
    </div>
  )
}
