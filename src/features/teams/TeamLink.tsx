import { Link } from 'react-router-dom'
import type { Commune } from '../geography/types'
import type { Club } from './types'
import { TeamTrophyBadges } from './TeamTrophyBadges'
import { ClubBadge } from './ClubBadge'
import { getClubIdentity } from './clubIdentity'
import { useOptionalCupApp } from '../../app/CupAppContext'

export function TeamLink({
  team,
  detailed = false,
  showTrophies = true,
  inline = false,
  badgeSize = 'sm',
}: {
  team?: Club | Commune | null
  detailed?: boolean
  showTrophies?: boolean
  inline?: boolean
  badgeSize?: 'sm' | 'lg'
}) {
  const app = useOptionalCupApp()
  if (!team) return <span>—</span>
  const isClub = typeof team === 'object' && 'communeName' in team
  let identityClub = app?.clubsById?.get(team.id) ?? (isClub ? team as Club : undefined)

  if (!identityClub && app?.clubs && team.id) {
    for (const c of app.clubs) {
      const match = c.fusedClubs?.find((fc) => fc.id === team.id || fc.communeId === team.id)
      if (match) {
        identityClub = {
          id: match.id,
          name: match.name,
          identity: match.identity ?? getClubIdentity({ id: match.id }),
        } as Club
        break
      }
    }
  }

  return (
    <span className={`team-link-wrap ${inline ? 'is-inline' : 'is-stacked'}`}>
      <span className="team-link-name-row">
        <Link className="team-link" to={`/equipes/${team.id}`}>
          {identityClub && <ClubBadge club={identityClub} size={badgeSize} />}
          <span>
            {team.name}
            {detailed
              ? isClub && team.communeName !== team.name
                ? ` (${team.communeName}, ${team.departmentId})`
                : ` (${team.departmentId})`
              : ''}
          </span>
        </Link>
      </span>
      {showTrophies && (
        <span className="team-link-trophies-row">
          <TeamTrophyBadges teamId={team.id} size="xs" />
        </span>
      )}
    </span>
  )
}
