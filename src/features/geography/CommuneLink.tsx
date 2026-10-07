import { Link } from 'react-router-dom'
import type { Commune } from './types'

export type CommuneLinkProps = {
  commune?: Commune | Readonly<{ id: string; name: string }> | null
  communeId?: string
  communeName?: string
  className?: string
  withIcon?: boolean
}

export function CommuneLink({
  commune,
  communeId,
  communeName,
  className = '',
  withIcon = false,
}: CommuneLinkProps) {
  const id = commune?.id ?? communeId
  const name = commune?.name ?? communeName ?? id

  if (!id) return <span>{name ?? '—'}</span>

  return (
    <Link
      to={`/villes/${id}`}
      className={`commune-link ${className}`.trim()}
      title={`Consulter la fiche de la ville de ${name}`}
    >
      {withIcon && <span className="commune-link-icon" aria-hidden="true">🏛️ </span>}
      <span className="commune-link-name">{name}</span>
    </Link>
  )
}
