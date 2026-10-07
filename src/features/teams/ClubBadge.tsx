import { useEffect, useState } from 'react'
import { getClubIdentity, identityStyle, type ClubIdentity } from './clubIdentity'
import './club-identity.css'

export function ClubBadge({ club, size = 'sm', decorative = true }: {
  club: { id: string; name: string; identity?: ClubIdentity }; size?: 'sm' | 'lg'; decorative?: boolean
}) {
  const identity = getClubIdentity(club)
  const [failed, setFailed] = useState(false)
  useEffect(() => setFailed(false), [identity.logo])
  const initials = club.name.split(/[\s-]+/).filter(Boolean).slice(0, 2).map(s => s[0]).join('').toUpperCase()
  return <span className={`club-badge club-badge--${size}`} style={identityStyle(identity)} aria-hidden={decorative ? true : undefined}>
    {identity.logo && !failed
      ? <img src={identity.logo} alt={decorative ? '' : 'Logo du club'} onError={() => setFailed(true)} />
      : <span>{initials}</span>}
  </span>
}
