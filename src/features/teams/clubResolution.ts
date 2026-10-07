import type { Commune, GeographyDataset } from '../geography/types'
import type { Club, FusedClubInfo } from './types'
import { getClubNameForCommune } from './clubGenerator'
import type { CupSession, SeasonArchive, FusionEvent } from '../storage/cupRepository'
import { getDepartmentNamesList } from '../geography/territoryLabels'
import { conferenceForRegion } from '../geography/loadGeography'
import { getClubIdentity } from './clubIdentity'
import { parseSeasonYear } from '../history/palmaresSelectors'

/**
 * Checks if a club name looks like a synthetic alliance/entente name
 * rather than a genuine French football club name.
 */
export function isAllianceSyntheticName(name?: string): boolean {
  if (!name) return false
  if (
    name.startsWith('Entente ') ||
    name.startsWith('Grand ') ||
    name.startsWith('Union ') ||
    name.startsWith('Alliance ') ||
    name.startsWith('FC Pays ') ||
    name.startsWith('FC Bassin ') ||
    /\b(?:\d{2,3}|2[AB])\b/.test(name) ||
    name.includes(' / ')
  ) {
    return true
  }

  // Reconnaître aussi les départements avec un style en toutes lettres ou le suffixe FC.
  const candidateDept = name
    .replace(/^(?:FC|AS|US|RC|SC|ES|CS|AC|CO|Olympique|Racing|Sporting|Stade|Étoile|Avenir|Athlétic Club|Club olympique) /i, '')
    .replace(/ FC$/i, '')
    .toLowerCase()
  const allDepts = getDepartmentNamesList().map((department) => department.toLowerCase())
  if (allDepts.includes(candidateDept)) return true

  return false
}

/**
 * Deterministically returns the original, genuine club name for a commune.
 */
export function getGenuineClubNameForCommune(commune: Commune, clubIndex = 0): string {
  return getClubNameForCommune(commune, clubIndex).name
}

/**
 * Resolves the genuine club name of a commune when it is represented by a club,
 * taking into account whether the club is an alliance / entente or autonomous.
 */
export function resolveCommuneRealClubName(
  commune: Commune,
  club: Club | { id: string; name: string; isFusion?: boolean; communeId?: string; communeNames?: readonly string[] },
  options?: {
    dataset?: GeographyDataset
    session?: CupSession
    archives?: readonly SeasonArchive[]
  },
): string {
  // If not a fusion club, the club name is already genuine
  if (!club.isFusion && !isAllianceSyntheticName(club.name)) {
    return club.name
  }

  const baseCommuneId = 'communeId' in club && club.communeId ? club.communeId : club.id.split('-')[0]
  const isLeadCommune = baseCommuneId === commune.id

  // 1. If this commune is the initiator/lead of the alliance
  if (isLeadCommune) {
    // If club has a genuine parent or lead name recorded in fusions
    const sessionFusions = options?.session?.interseasonReport?.fusions ?? []
    const matchingSessionFusion = sessionFusions.find((f) => f.mergedClubId === club.id && f.leadClubName && !isAllianceSyntheticName(f.leadClubName))
    if (matchingSessionFusion?.leadClubName) {
      return matchingSessionFusion.leadClubName
    }

    if (options?.archives) {
      for (const arch of options.archives) {
        const archFusions = arch.fusions ?? arch.interseasonReport?.fusions ?? []
        const m = archFusions.find((f) => f.mergedClubId === club.id && f.leadClubName && !isAllianceSyntheticName(f.leadClubName))
        if (m?.leadClubName) {
          return m.leadClubName
        }
      }
    }

    // Canonical fallback from commune
    return getGenuineClubNameForCommune(commune, 0)
  }

  // 2. If this commune is a partner / absorbed commune in the alliance
  // Check club.fusedClubs if available
  const fusedClubs = 'fusedClubs' in club ? (club.fusedClubs as Club['fusedClubs']) : undefined
  if (fusedClubs && fusedClubs.length > 0) {
    const fcMatch = fusedClubs.find(
      (fc) =>
        fc.communeId === commune.id ||
        fc.communeName === commune.name ||
        fc.communeNames?.includes(commune.name) ||
        fc.communeIds?.includes(commune.id),
    )
    if (fcMatch?.name && !isAllianceSyntheticName(fcMatch.name)) {
      return fcMatch.name
    }
  }

  // Check in session interseason report fusions
  if (options?.session?.interseasonReport?.fusions) {
    for (const f of options.session.interseasonReport.fusions) {
      if (
        f.mergedClubId === club.id &&
        (f.absorbedClubId === commune.id ||
          f.absorbedClubId.startsWith(`${commune.id}-`) ||
          f.absorbedCommuneNames?.includes(commune.name) ||
          f.communeNames.includes(commune.name))
      ) {
        if (f.absorbedClubName && !isAllianceSyntheticName(f.absorbedClubName)) {
          return f.absorbedClubName
        }
      }
    }
  }

  // Check in archives fusions
  if (options?.archives) {
    for (const arch of options.archives) {
      const archFusions = arch.fusions ?? arch.interseasonReport?.fusions ?? []
      for (const f of archFusions) {
        if (
          f.mergedClubId === club.id &&
          (f.absorbedClubId === commune.id ||
            f.absorbedClubId.startsWith(`${commune.id}-`) ||
            f.absorbedCommuneNames?.includes(commune.name) ||
            f.communeNames.includes(commune.name))
        ) {
          if (f.absorbedClubName && !isAllianceSyntheticName(f.absorbedClubName)) {
            return f.absorbedClubName
          }
        }
      }
    }
  }

  // Fallback: deterministic club name for this commune
  return getGenuineClubNameForCommune(commune, 0)
}

export type ResolvedAlliancePartner = Readonly<{
  communeId: string
  communeName: string
  commune?: Commune
  clubName: string
  isHeadquarter: boolean
  year?: number
}>

/**
 * Returns the list of all communes and their genuine clubs involved in an alliance club.
 */
export function resolveAlliancePartners(
  club: Club,
  dataset?: GeographyDataset,
  session?: CupSession,
  archives?: readonly SeasonArchive[],
): readonly ResolvedAlliancePartner[] {
  if (!club.communeNames || club.communeNames.length <= 1) {
    const leadCommune = dataset?.communes.find((c) => c.id === club.communeId || c.name === club.communeName)
    const clubName = leadCommune ? getGenuineClubNameForCommune(leadCommune, 0) : club.name
    return [
      {
        communeId: club.communeId,
        communeName: club.communeName,
        commune: leadCommune,
        clubName: !isAllianceSyntheticName(club.name) ? club.name : clubName,
        isHeadquarter: true,
      },
    ]
  }

  const partners: ResolvedAlliancePartner[] = []
  const seenCommuneNames = new Set<string>()

  // 1. Headquarter / Seat commune
  const headquarterCommune = dataset?.communes.find(
    (c) => c.id === club.communeId || c.name === club.communeName,
  )
  const headquarterCommuneName = headquarterCommune?.name ?? club.communeName
  const headquarterClubName = headquarterCommune
    ? resolveCommuneRealClubName(headquarterCommune, club, { dataset, session, archives })
    : club.name

  seenCommuneNames.add(headquarterCommuneName)
  partners.push({
    communeId: headquarterCommune?.id ?? club.communeId,
    communeName: headquarterCommuneName,
    commune: headquarterCommune,
    clubName: headquarterClubName,
    isHeadquarter: true,
  })

  // 2. Partner communes
  for (const cName of club.communeNames) {
    if (seenCommuneNames.has(cName)) continue
    seenCommuneNames.add(cName)

    const cObj = dataset?.communes.find((c) => c.name === cName)
    const cId = cObj?.id ?? club.communeIds.find((id) => id !== club.communeId) ?? cName

    let partnerClubName: string | undefined

    // Check fusedClubs on club
    if (club.fusedClubs && club.fusedClubs.length > 0) {
      const fc = club.fusedClubs.find(
        (item) =>
          item.communeName === cName ||
          item.communeId === cId ||
          item.communeNames?.includes(cName),
      )
      if (fc?.name && !isAllianceSyntheticName(fc.name)) {
        partnerClubName = fc.name
      }
    }

    // Check session report
    if (!partnerClubName && session?.interseasonReport?.fusions) {
      const fMatch = session.interseasonReport.fusions.find(
        (f) =>
          f.mergedClubId === club.id &&
          (f.absorbedCommuneNames?.includes(cName) || f.communeNames.includes(cName)),
      )
      if (fMatch?.absorbedClubName && !isAllianceSyntheticName(fMatch.absorbedClubName)) {
        partnerClubName = fMatch.absorbedClubName
      }
    }

    // Check archives
    if (!partnerClubName && archives) {
      for (const arch of archives) {
        const fusions = arch.fusions ?? arch.interseasonReport?.fusions ?? []
        const fMatch = fusions.find(
          (f) =>
            f.mergedClubId === club.id &&
            (f.absorbedCommuneNames?.includes(cName) || f.communeNames.includes(cName)),
        )
        if (fMatch?.absorbedClubName && !isAllianceSyntheticName(fMatch.absorbedClubName)) {
          partnerClubName = fMatch.absorbedClubName
          break
        }
      }
    }

    // Fallback if commune object found
    if (!partnerClubName && cObj) {
      partnerClubName = getGenuineClubNameForCommune(cObj, 0)
    }

    partners.push({
      communeId: cId,
      communeName: cName,
      commune: cObj,
      clubName: partnerClubName ?? `Club de ${cName}`,
      isHeadquarter: false,
    })
  }

  return partners
}

/**
 * Resolves the real club name of a partner commune from its name and context.
 */
export function resolvePartnerClubName(
  partnerCommuneName: string,
  options?: {
    leadClubId?: string
    dataset?: GeographyDataset
    session?: CupSession
    archives?: readonly SeasonArchive[]
  },
): string {
  const pCommune = options?.dataset?.communes.find((c) => c.name === partnerCommuneName)

  // Look in session fusions
  if (options?.session?.interseasonReport?.fusions) {
    const match = options.session.interseasonReport.fusions.find(
      (f) =>
        (!options.leadClubId || f.mergedClubId === options.leadClubId) &&
        (f.absorbedCommuneNames?.includes(partnerCommuneName) || f.communeNames.includes(partnerCommuneName)),
    )
    if (match?.absorbedClubName && !isAllianceSyntheticName(match.absorbedClubName)) {
      return match.absorbedClubName
    }
  }

  // Look in archives fusions
  if (options?.archives) {
    for (const arch of options.archives) {
      const fusions = arch.fusions ?? arch.interseasonReport?.fusions ?? []
      const match = fusions.find(
        (f) =>
          (!options.leadClubId || f.mergedClubId === options.leadClubId) &&
          (f.absorbedCommuneNames?.includes(partnerCommuneName) || f.communeNames.includes(partnerCommuneName)),
      )
      if (match?.absorbedClubName && !isAllianceSyntheticName(match.absorbedClubName)) {
        return match.absorbedClubName
      }
    }
  }

  // Deterministic fallback
  if (pCommune) {
    return getGenuineClubNameForCommune(pCommune, 0)
  }

  return `Club de ${partnerCommuneName}`
}

export type ResolvedCareerSeasonClub = Readonly<{
  clubId?: string | null
  clubName: string
  club?: Club | null
  isAbsorbedClub: boolean
  isHistoricalPreFusion: boolean
}>

/**
 * Resolves the historical club name, club ID, and club entity for a person's career season.
 * If the season took place before a club merger:
 * - If the player played for a secondary (absorbed) club, restores the former secondary club's
 *   genuine name and identity (e.g. "Étoile de Cassis"), never displaying the post-fusion alliance name.
 * - If the player played for the lead/principal club, uses its genuine pre-fusion name
 *   or keeps the continuous principal club identity.
 * - If the season occurred after the merger, keeps the active post-fusion alliance name.
 */
type FusedClubEntry = FusedClubInfo & { mergedClubId?: string; mergedClubName?: string }
const clubsMapFusedCache = new WeakMap<ReadonlyMap<string, Club>, FusedClubEntry[]>()

export function resolveCareerSeasonClub(
  season: {
    year: number
    clubId?: string | null
    clubName?: string
  },
  options?: {
    person?: {
      id?: string
      birthCommuneId?: string
      birthCommuneName?: string
      originClubId?: string | null
      originClubName?: string | null
      parentClubId?: string | null
      currentClubId?: string | null
    }
    clubsById?: ReadonlyMap<string, Club>
    clubs?: readonly Club[]
    session?: CupSession | null
    archives?: readonly SeasonArchive[]
    dataset?: GeographyDataset
  },
): ResolvedCareerSeasonClub {
  if (!season.clubId && !season.clubName) {
    return { clubId: null, clubName: 'Sans club', club: null, isAbsorbedClub: false, isHistoricalPreFusion: false }
  }

  const clubsMap: ReadonlyMap<string, Club> =
    options?.clubsById ?? (options?.clubs ? new Map(options.clubs.map((c) => [c.id, c])) : new Map<string, Club>())

  const allFusions: FusionEvent[] = [
    ...(options?.session?.interseasonReport?.fusions ?? []),
    ...(options?.archives ? options.archives.flatMap((a) => a.fusions ?? a.interseasonReport?.fusions ?? []) : []),
  ]

  const allFusedClubs: FusedClubEntry[] = []

  if (options?.clubs) {
    for (const c of options.clubs) {
      if (c.fusedClubs) {
        for (const fc of c.fusedClubs) {
          allFusedClubs.push({ ...fc, mergedClubId: c.id, mergedClubName: c.name })
        }
      }
    }
  } else if (options?.clubsById) {
    // Collect fused clubs from clubsById without allocating full array of all clubs each time
    let cached = clubsMapFusedCache.get(options.clubsById)
    if (!cached) {
      cached = []
      for (const c of options.clubsById.values()) {
        if (c.fusedClubs && c.fusedClubs.length > 0) {
          for (const fc of c.fusedClubs) {
            cached.push({ ...fc, mergedClubId: c.id, mergedClubName: c.name })
          }
        }
      }
      clubsMapFusedCache.set(options.clubsById, cached)
    }
    allFusedClubs.push(...cached)
  }

  if (options?.archives) {
    for (const arch of options.archives) {
      if (arch.clubs) {
        for (const c of arch.clubs) {
          if (c.fusedClubs) {
            for (const fc of c.fusedClubs) {
              allFusedClubs.push({ ...fc, mergedClubId: c.id, mergedClubName: c.name })
            }
          }
        }
      }
    }
  }

  const createVirtualClub = (
    id: string,
    name: string,
    communeId?: string,
    communeName?: string,
    identity?: any,
    strength = 10,
  ): Club => {
    const cId = communeId ?? id.split('-')[0]
    const cName = communeName ?? name
    const communeObj = options?.dataset?.communes.find((cm) => cm.id === cId || cm.name === cName)
    return {
      id,
      name,
      shortName: name,
      identity: identity ?? getClubIdentity({ id }),
      communeId: cId,
      communeName: cName,
      communeIds: [cId],
      communeNames: [cName],
      departmentId: communeObj?.departmentId ?? '',
      regionId: communeObj?.regionId ?? '',
      conferenceId: communeObj?.regionId ? conferenceForRegion(communeObj.regionId) : '',
      zoneId: '',
      population: communeObj?.population ?? 0,
      strength,
      baseStrength: strength,
      coordinates: communeObj?.coordinates ?? [0, 0],
    }
  }

  // Les instantanés officiels priment sur les noms de carrière et les
  // déductions depuis les fusions actuelles : un même ID peut changer de nom.
  const seasonArchive = options?.archives?.find((archive) => archive.year === season.year)
  const archivedClub = season.clubId ? seasonArchive?.clubs?.find((club) => club.id === season.clubId) : undefined
  const archivedName = archivedClub?.name ?? (season.clubId ? seasonArchive?.teamPerformances?.[season.clubId]?.clubName : undefined)
  const currentClub = season.clubId ? clubsMap.get(season.clubId) : undefined
  const activeYear = options?.session
    ? options.session.seasonYear ?? parseSeasonYear(options.session.seed, 2026)
    : undefined
  const activeClub = season.clubId && season.year === activeYear && !seasonArchive
    ? options?.session?.clubs?.find((club) => club.id === season.clubId) ?? currentClub
    : undefined
  const datedName = archivedName ?? activeClub?.name
  if (datedName && season.clubId) {
    const sourceClub = archivedClub ?? activeClub ?? currentClub ?? createVirtualClub(season.clubId, datedName)
    return {
      clubId: season.clubId,
      clubName: datedName,
      club: { ...sourceClub, name: datedName, shortName: datedName },
      isAbsorbedClub: !currentClub && allFusedClubs.some((club) => club.id === season.clubId),
      isHistoricalPreFusion: Boolean(archivedClub && !archivedClub.isFusion && currentClub?.isFusion),
    }
  }

  // 1. Direct match with an absorbed / secondary club by ID
  const directAbsorbedFc = season.clubId
    ? allFusedClubs.find((fc) => fc.id === season.clubId || fc.communeId === season.clubId)
    : undefined
  const directAbsorbedFusion = season.clubId
    ? allFusions.find((f) => f.absorbedClubId === season.clubId)
    : undefined

  if (season.clubId && (directAbsorbedFc || directAbsorbedFusion)) {
    const fc = directAbsorbedFc
    const f = directAbsorbedFusion
    const absorbedId = season.clubId

    let formerClubName: string | undefined
    if (fc?.name && !isAllianceSyntheticName(fc.name)) {
      formerClubName = fc.name
    } else if (f?.absorbedClubName && !isAllianceSyntheticName(f.absorbedClubName)) {
      formerClubName = f.absorbedClubName
    }

    if (!formerClubName && options?.archives) {
      const arch = options.archives.find((a) => a.year === season.year)
      const perf = arch?.teamPerformances?.[absorbedId]
      if (perf?.clubName && !isAllianceSyntheticName(perf.clubName)) {
        formerClubName = perf.clubName
      } else {
        const archClub = arch?.clubs?.find((c) => c.id === absorbedId)
        if (archClub?.name && !isAllianceSyntheticName(archClub.name)) {
          formerClubName = archClub.name
        }
      }
    }

    if (!formerClubName && season.clubName && !isAllianceSyntheticName(season.clubName)) {
      formerClubName = season.clubName
    }

    const communeId = fc?.communeId ?? (f?.absorbedCommuneIds?.[0] ?? absorbedId.split('-')[0])
    const communeName = fc?.communeName ?? (f?.absorbedCommuneNames?.[0] ?? formerClubName)
    const communeObj = options?.dataset?.communes.find((cm) => cm.id === communeId || cm.name === communeName)

    if (!formerClubName && communeObj) {
      formerClubName = getGenuineClubNameForCommune(communeObj, 0)
    }
    if (!formerClubName) {
      formerClubName = season.clubName ?? (communeName ? `Club de ${communeName}` : absorbedId)
    }

    const virtualClub = createVirtualClub(
      absorbedId,
      formerClubName,
      communeId,
      communeName,
      fc?.identity,
      fc?.oldStrength ?? 10,
    )

    return {
      clubId: absorbedId,
      clubName: formerClubName,
      club: virtualClub,
      isAbsorbedClub: true,
      isHistoricalPreFusion: true,
    }
  }

  // 2. Club exists in active clubs (or is referenced as a merged club ID)
  const targetClub = season.clubId ? clubsMap.get(season.clubId) : undefined
  const isFusionClub = Boolean(
    targetClub?.isFusion ||
    (targetClub?.fusedClubs && targetClub.fusedClubs.length > 0) ||
    allFusions.some((f) => f.mergedClubId === season.clubId),
  )

  if (targetClub && isFusionClub) {
    let earliestFusionYear: number | undefined
    if (targetClub.fusedClubs) {
      for (const fc of targetClub.fusedClubs) {
        if (fc.year && (earliestFusionYear === undefined || fc.year < earliestFusionYear)) {
          earliestFusionYear = fc.year
        }
      }
    }
    for (const f of allFusions) {
      if (f.mergedClubId === targetClub.id) {
        const arch = options?.archives?.find((a) =>
          a.fusions?.some((af) => af.mergedClubId === f.mergedClubId && af.absorbedClubId === f.absorbedClubId) ||
          a.interseasonReport?.fusions?.some((af) => af.mergedClubId === f.mergedClubId && af.absorbedClubId === f.absorbedClubId),
        )
        const fYear = arch?.year
        if (fYear && (earliestFusionYear === undefined || fYear < earliestFusionYear)) {
          earliestFusionYear = fYear
        }
      }
    }

    const currentSessionYear = options?.session?.seasonYear ?? parseSeasonYear(options?.session?.seed ?? '', 2026)
    if (earliestFusionYear === undefined && targetClub.isFusion) {
      earliestFusionYear = currentSessionYear
    }

    const isPreFusionSeason = earliestFusionYear !== undefined && season.year < earliestFusionYear

    if (isPreFusionSeason) {
      // Check if the person played for an absorbed / secondary club
      const birthCommuneId = options?.person?.birthCommuneId
      const originClubId = options?.person?.originClubId

      let matchedFc: FusedClubEntry | undefined = targetClub.fusedClubs?.find(
        (fc) =>
          (originClubId && (fc.id === originClubId || fc.communeId === originClubId)) ||
          (birthCommuneId && (fc.communeId === birthCommuneId || fc.communeIds?.includes(birthCommuneId) || fc.id === birthCommuneId)),
      )

      if (!matchedFc && season.clubName && targetClub.fusedClubs) {
        matchedFc = targetClub.fusedClubs.find(
          (fc) =>
            fc.name.toLowerCase() === season.clubName?.toLowerCase() ||
            fc.communeName.toLowerCase() === season.clubName?.toLowerCase(),
        )
      }

      if (!matchedFc && options?.archives && options?.person?.id && targetClub.fusedClubs) {
        const arch = options.archives.find((a) => a.year === season.year)
        const archPerson = arch?.persons?.find((p) => p.id === options.person!.id)
        if (archPerson?.currentClubId) {
          matchedFc = targetClub.fusedClubs.find((fc) => fc.id === archPerson.currentClubId)
        }
      }

      if (matchedFc) {
        // Person belonged to the absorbed secondary club!
        const absorbedId = matchedFc.id
        const formerName = matchedFc.name
        const virtualClub = createVirtualClub(
          absorbedId,
          formerName,
          matchedFc.communeId,
          matchedFc.communeName,
          matchedFc.identity,
          matchedFc.oldStrength ?? 10,
        )

        return {
          clubId: absorbedId,
          clubName: formerName,
          club: virtualClub,
          isAbsorbedClub: true,
          isHistoricalPreFusion: true,
        }
      }

      // Person belonged to the lead/principal club before fusion
      const fusionMatch = allFusions.find(
        (f) => f.mergedClubId === targetClub.id && f.leadClubName && !isAllianceSyntheticName(f.leadClubName),
      )
      let leadFormerName: string | undefined = fusionMatch?.leadClubName

      if (!leadFormerName && options?.archives) {
        const arch = options.archives.find((a) => a.year === season.year)
        const perf = arch?.teamPerformances?.[targetClub.id]
        if (perf?.clubName && !isAllianceSyntheticName(perf.clubName)) {
          leadFormerName = perf.clubName
        }
      }

      if (!leadFormerName && season.clubName && !isAllianceSyntheticName(season.clubName)) {
        leadFormerName = season.clubName
      }

      if (!leadFormerName) {
        const leadCommune = options?.dataset?.communes.find(
          (cm) => cm.id === targetClub.communeId || cm.name === targetClub.communeName,
        )
        if (leadCommune) {
          leadFormerName = getGenuineClubNameForCommune(leadCommune, 0)
        }
      }

      const finalLeadName = leadFormerName ?? targetClub.name

      return {
        clubId: targetClub.id,
        clubName: finalLeadName,
        club: { ...targetClub, name: finalLeadName, shortName: finalLeadName },
        isAbsorbedClub: false,
        isHistoricalPreFusion: true,
      }
    }

    // Season is during or after fusion
    const activeName = season.clubName ?? targetClub.name
    return {
      clubId: targetClub.id,
      clubName: activeName,
      club: { ...targetClub, name: activeName },
      isAbsorbedClub: false,
      isHistoricalPreFusion: false,
    }
  }

  if (targetClub) {
    const finalName = season.clubName ?? targetClub.name
    return {
      clubId: targetClub.id,
      clubName: finalName,
      club: { ...targetClub, name: finalName },
      isAbsorbedClub: false,
      isHistoricalPreFusion: false,
    }
  }

  // 3. Historical club from archives
  let historicalClub: Club | undefined
  if (options?.archives && season.clubId) {
    const arch = options.archives.find((a) => a.year === season.year)
    historicalClub = arch?.clubs?.find((c) => c.id === season.clubId)
  }

  const finalName = season.clubName ?? historicalClub?.name ?? (season.clubId ? `Club ${season.clubId}` : 'Sans club')
  return {
    clubId: season.clubId,
    clubName: finalName,
    club: historicalClub ? { ...historicalClub, name: finalName } : null,
    isAbsorbedClub: false,
    isHistoricalPreFusion: false,
  }
}
