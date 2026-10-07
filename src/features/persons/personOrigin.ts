import type { Person } from './types'
import type { Club } from '../teams/types'

/** Le premier club propriétaire reste l'origine, même après un transfert ou une fusion. */
export function getPersonOriginClub(person: Person, clubsById?: ReadonlyMap<string, Club>): { id: string; name?: string } | null {
  const firstSeason = [...(person.careerHistory ?? [])]
    .sort((a, b) => a.year - b.year)
    .find(s => s.parentClubId || (!s.isLoan && s.clubId))
  const historicalId = firstSeason?.parentClubId ?? firstSeason?.clubId
  const id = person.originClubId ?? historicalId ?? person.loanedFromClubId ?? person.parentClubId ?? person.currentClubId
  if (!id) return null
  const historicalName = id === historicalId
    ? firstSeason?.parentClubName ?? (firstSeason?.clubId === id ? firstSeason.clubName : undefined)
    : person.careerHistory?.find(s => s.clubId === id)?.clubName
  let resolvedName = person.originClubName ?? historicalName ?? clubsById?.get(id)?.name
  if (!resolvedName && clubsById) {
    for (const c of clubsById.values()) {
      const fc = c.fusedClubs?.find((item) => item.id === id || item.communeId === id)
      if (fc?.name) {
        resolvedName = fc.name
        break
      }
    }
  }
  return { id, name: resolvedName }
}
