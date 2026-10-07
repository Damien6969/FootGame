import type { SeasonArchive } from '../storage/cupRepository'
import type { GeographyDataset } from '../geography/types'
import { buildClubsFromCommunes } from '../teams/clubGenerator'
import type { Club } from '../teams/types'
import { getClubIdentity } from '../teams/clubIdentity'

export function archiveClubs(archive: SeasonArchive, dataset: GeographyDataset): Map<string, Club> {
  const original = new Map(buildClubsFromCommunes(dataset.communes).map((club) => [club.id, club]))

  if (archive.clubs) {
    const map = new Map<string, Club>(original)
    for (const club of archive.clubs) {
      map.set(club.id, club)
      if (club.fusedClubs) {
        for (const fc of club.fusedClubs) {
          if (!map.has(fc.id)) {
            const baseCommune = dataset.communes.find((c) => c.id === (fc.communeId ?? fc.id.split('-')[0]))
            if (baseCommune) {
              const base = buildClubsFromCommunes([baseCommune])[0]
              map.set(fc.id, {
                ...base,
                id: fc.id,
                name: fc.name,
                shortName: fc.name,
                identity: fc.identity ?? getClubIdentity({ id: fc.id }),
              })
            }
          }
        }
      }
    }
    return map
  }

  // Older archives or summary archives without full clubs array:
  // Initialize the map with all base clubs from the dataset so ANY commune/club can be resolved
  const map = new Map<string, Club>(original)

  const fusionsById = new Map<string, { name: string; communeNames?: readonly string[] }>()
  const fusions = archive.fusions ?? archive.interseasonReport?.fusions ?? []
  for (const f of fusions) {
    if (f.mergedClubId) {
      fusionsById.set(f.mergedClubId, { name: f.mergedClubName, communeNames: f.communeNames })
    }
  }

  const rivalCreated = archive.interseasonReport?.rivalCreated
  if (rivalCreated?.clubId) {
    fusionsById.set(rivalCreated.clubId, { name: rivalCreated.clubName })
  }

  const secessions = archive.secessions ?? archive.interseasonReport?.secessions ?? []
  for (const s of secessions) {
    if (s.newClubId) {
      fusionsById.set(s.newClubId, { name: s.newClubName })
    }
  }

  const ids = new Set<string>([
    ...Object.keys(archive.teamPerformances || {}),
    ...(archive.history || []).flatMap((match) => [match.homeTeamId, match.awayTeamId]),
    ...(archive.nationalChampionId ? [archive.nationalChampionId] : []),
    ...(archive.finalistId ? [archive.finalistId] : []),
    ...Object.values(archive.conferenceChampions || {}).filter(Boolean),
    ...Object.values(archive.regionChampions || {}).filter(Boolean),
    ...Object.values(archive.departmentChampions || {}).filter(Boolean),
    ...(archive.finalFourTeamIds || []).filter(Boolean),
    ...fusionsById.keys(),
  ])

  for (const id of ids) {
    const base = original.get(id.split('-')[0])
    const perf = archive.teamPerformances?.[id]
    const fusion = fusionsById.get(id)
    const name = perf?.clubName ?? fusion?.name ?? (base ? (id.includes('-') ? `${base.name} (${id})` : base.name) : id)
    const club: Club = {
      ...base,
      id,
      name,
      shortName: name,
      communeId: base?.communeId ?? id.split('-')[0],
      communeName: base?.communeName ?? name,
      communeIds: base?.communeIds ?? [id.split('-')[0]],
      communeNames: perf?.communeNames ?? fusion?.communeNames ?? base?.communeNames ?? [base?.communeName ?? name],
      departmentId: perf?.departmentId ?? base?.departmentId ?? '',
      regionId: perf?.regionId ?? base?.regionId ?? '',
      conferenceId: perf?.conferenceId ?? base?.conferenceId ?? '',
      zoneId: base?.zoneId ?? '',
      population: base?.population ?? 0,
      strength: perf ? 0 : (base?.strength ?? 0),
      coach: perf?.coach,
      identity: base?.identity ?? getClubIdentity({ id }),
    }
    map.set(id, club)
  }

  return map
}
