import { Link } from 'react-router-dom'
import type { IndividualHonor } from './types'
import type { PersonCareerSeason } from '../persons/types'
import { isTeamHonor } from './seasonAwards'
import './awards.css'

/**
 * Hiérarchie officielle des distinctions individuelles :
 * 1. Ballon d'Or (la plus haute distinction individuelle)
 * 2. Soulier d'Or (meilleur buteur) & Bouclier d'Or (roi des interventions)
 * 3. Meilleurs de la saison par poste (Meilleur défenseur / Meilleur attaquant)
 * 4. Trophées Espoirs (Meilleur espoir, Meilleur attaquant/défenseur espoir)
 * 5. Trophées de Conférence
 */
export function getAwardHierarchyRank(awardId: string): number {
  if (awardId === 'ballon-or') return 100
  if (awardId === 'top-scorer') return 85
  if (awardId === 'top-stops') return 80
  if (awardId === 'best-defender') return 65
  if (awardId === 'best-attacker') return 60
  if (awardId.startsWith('young-')) return 40
  if (awardId.startsWith('conference-')) return 20
  return 10
}

export function getAwardVisual(awardId: string): { icon: string; className: string } {
  if (awardId === 'ballon-or') {
    return { icon: '⚽', className: 'individual-honor-pill--ballon-or' }
  }
  if (awardId === 'top-scorer') {
    return { icon: '👟', className: 'individual-honor-pill--scorer' }
  }
  if (awardId === 'top-stops') {
    return { icon: '🛡️', className: 'individual-honor-pill--stops' }
  }
  if (awardId === 'best-defender') {
    return { icon: '🛡️', className: 'individual-honor-pill--defender' }
  }
  if (awardId === 'best-attacker') {
    return { icon: '⚔️', className: 'individual-honor-pill--attacker' }
  }
  if (awardId.startsWith('young-')) {
    return { icon: '🌱', className: 'individual-honor-pill--youth' }
  }
  if (awardId.startsWith('conference-')) {
    return { icon: '🏛️', className: 'individual-honor-pill--conference' }
  }
  return { icon: '🏅', className: 'individual-honor-pill--generic' }
}

export function sortIndividualHonors<T extends { awardId: string }>(honors: readonly T[]): T[] {
  return [...honors].sort((a, b) => getAwardHierarchyRank(b.awardId) - getAwardHierarchyRank(a.awardId))
}

export function IndividualHonors({ honors, year }: { honors: readonly IndividualHonor[]; year: number }) {
  const clean = sortIndividualHonors(honors.filter(h => !isTeamHonor(h)))
  if (!clean.length) return null
  return (
    <div className="individual-honors">
      {clean.map(honor => {
        const visual = getAwardVisual(honor.awardId)
        return (
          <Link
            key={honor.awardId}
            to={`/trophees?saison=${year}`}
            title={`${honor.title} · ${year}`}
            className={`individual-honor-pill ${visual.className}`}
          >
            <span className="individual-honor-icon">{visual.icon}</span>
            <span className="individual-honor-title">{honor.title}</span>
          </Link>
        )
      })}
    </div>
  )
}

export function IndividualHonorCabinet({ seasons }: { seasons: readonly PersonCareerSeason[] }) {
  const decorated = seasons
    .map(s => ({
      ...s,
      individualHonors: sortIndividualHonors(s.individualHonors?.filter(h => !isTeamHonor(h)) ?? []),
    }))
    .filter(s => s.individualHonors && s.individualHonors.length > 0)
    .sort((a, b) => b.year - a.year)

  const count = decorated.reduce((n, s) => n + s.individualHonors.length, 0)

  return (
    <section className="individual-honors--cabinet" aria-label="Palmarès individuel">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
        <h3 style={{ margin: 0, fontSize: '1rem', color: '#f3d58d', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span>📜</span> Distinctions individuelles {count > 0 && <span>· {count}</span>}
        </h3>
        {count > 0 && (
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted, #94a3b8)' }}>
            Attribuées à l’issue de chaque finale de Coupe
          </span>
        )}
      </div>

      {decorated.length ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {decorated.map(s => (
            <div
              key={s.year}
              style={{
                display: 'flex',
                alignItems: 'baseline',
                gap: '12px',
                padding: '6px 10px',
                background: 'rgba(255, 255, 255, 0.02)',
                borderRadius: '8px',
                border: '1px solid rgba(255, 255, 255, 0.05)',
                flexWrap: 'wrap',
              }}
            >
              <div style={{ minWidth: '150px', fontSize: '0.82rem', fontWeight: 700, color: '#c9bc9a' }}>
                Édition {s.year} {s.clubName && <span style={{ fontWeight: 400, color: 'var(--text-muted, #94a3b8)', fontSize: '0.78rem' }}>· {s.clubName}</span>}
              </div>
              <IndividualHonors year={s.year} honors={s.individualHonors} />
            </div>
          ))}
        </div>
      ) : (
        <p style={{ margin: 0, fontSize: '0.85rem', color: '#94a3b8' }}>
          Aucune distinction individuelle pour le moment. Les trophées sont attribués après la finale de chaque Coupe.
        </p>
      )}
    </section>
  )
}
