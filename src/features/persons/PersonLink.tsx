import { Link } from 'react-router-dom'
import type { Person } from './types'

type PersonLinkProps = {
  person: Pick<Person, 'id' | 'firstName' | 'lastName' | 'position'> & Partial<Pick<Person, 'primaryRole'>>
  className?: string
  showPositionBadge?: boolean
}

export function PersonLink({ person, className = '', showPositionBadge = true }: PersonLinkProps) {
  const isAttacker = person.position === 'ATTACKER'
  const badgeClass = isAttacker ? 'badge badge--amber' : 'badge badge--blue'
  const badgeLabel = person.primaryRole === 'COACH' ? 'ENT' : isAttacker ? 'ATQ' : 'DEF'

  return (
    <Link
      to={`/personnes/${person.id}`}
      className={`person-link ${className}`}
      title={`Voir le profil de ${person.firstName} ${person.lastName}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        textDecoration: 'none',
        color: 'var(--text-primary, #f1f5f9)',
        fontWeight: 500,
      }}
    >
      {showPositionBadge && (
        <span
          className={badgeClass}
          style={{
            fontSize: '0.7rem',
            padding: '1px 5px',
            borderRadius: '4px',
            letterSpacing: '0.04em',
            fontWeight: 700,
          }}
        >
          {badgeLabel}
        </span>
      )}
      <span className="person-link__name" style={{ textDecoration: 'underline', textUnderlineOffset: '2px' }}>
        {person.firstName} {person.lastName}
      </span>
    </Link>
  )
}
