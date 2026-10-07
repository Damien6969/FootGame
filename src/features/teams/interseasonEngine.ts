import type { Commune } from '../geography/types'
import type { Club } from './types'
import type { SeasonArchive, FusionEvent, RivalCreationEvent, SecessionEvent, InterseasonReport } from '../storage/cupRepository'
import { computeStrength } from '../match/simulateMatch'
import { getClubNameForCommune, generateFusionClubName } from './clubGenerator'
import { createPrng } from '../random/prng'
import { CUP_CONFIG } from '../../config/cupConfig'
import { getClubIdentity, type ClubIdentity } from './clubIdentity'

export type InterseasonOptions = {
  maxFusions?: number
  seed?: string
  popBounds?: { min: number; max: number }
  /** Noms de clubs déjà utilisés (actifs + absorbés), en minuscules. Pour garantir l'unicité des noms. */
  usedClubNames?: ReadonlySet<string>
  /** Prochain indice de club pour chaque commune. Clé = communeId, valeur = prochain entier libre. */
  communeNextIndex?: Readonly<Record<string, number>>
  /** Seuil minimal de population pour la régénération d'un club local (par défaut : 50 000 hab). */
  minRegenerationPopulation?: number
  /** Ratio de population déduit de l'entente lors de la régénération (par défaut : 0.33 = 33 %). */
  regenerationPopLossRatio?: number
  /** Ratio maximal de population du partenaire par rapport au club initiateur (par défaut : 5 = 5x). */
  maxPartnerPopulationRatio?: number
  /** Probabilité rare qu'un club dépasse ce ratio (par défaut : 0.05 = 5 %). */
  disproportionateFusionProb?: number
}

// ----- Constantes des fusions & régénérations -----

/** Ratio maximal de population du partenaire par rapport au club initiateur (par défaut : 5 = 5x). */
const MAX_PARTNER_POPULATION_RATIO = 5

/** Probabilité rare qu'un club absorbe une commune de plus de 5x sa population (5 %). */
const DISPROPORTIONATE_FUSION_PROB = 0.05

/** Probabilité (par an) qu'une grande commune absorbée crée un nouveau club local. */
const SECESSION_PROB = CUP_CONFIG.secessionProbability

/** Population minimale pour qu'une commune absorbée soit éligible à la régénération (50 000 hab.). */
const SECESSION_MIN_POP = 50_000

/** Ratio de la population de la grande commune déduit de la force de l'entente (33 % par étape). */
const REGENERATION_POP_LOSS_RATIO = 0.33

/** Nombre maximal d'étapes de sécession avant retrait complet de la commune de l'alliance (3 étapes). */
const MAX_SECESSION_STEPS = 3

export function calculateDistanceKm(
  coordA?: readonly [number, number],
  coordB?: readonly [number, number],
): number {
  if (!coordA || !coordB) return 30
  const [lonA, latA] = coordA
  const [lonB, latB] = coordB
  const avgLatRad = ((latA + latB) / 2) * (Math.PI / 180)
  const dx = (lonB - lonA) * Math.cos(avgLatRad) * 111.32
  const dy = (latB - latA) * 110.57
  return Math.sqrt(dx * dx + dy * dy)
}

export function findBestFusionPartner(
  clubA: Club,
  eligibleClubs: readonly Club[],
  rng: () => number,
  options?: {
    maxPopulationRatio?: number
    rareDisproportionateProb?: number
  },
): Club | undefined {
  if (eligibleClubs.length === 0) return undefined

  const maxRatio = options?.maxPopulationRatio ?? MAX_PARTNER_POPULATION_RATIO
  const rareProb = options?.rareDisproportionateProb ?? DISPROPORTIONATE_FUSION_PROB

  // Règle de disproportion démographique :
  // Un club ne peut pas cibler un partenaire faisant plus de 5x sa population (ex: village de 2 000 hab. vs Paris),
  // sauf tirage exceptionnel rare (5 % de probabilité).
  const allowDisproportionate = rng() < rareProb
  const withinRatio = eligibleClubs.filter((c) => c.population <= maxRatio * clubA.population)

  let poolAfterRatio: readonly Club[]
  if (withinRatio.length > 0) {
    // S'il existe des partenaires dans le ratio (<= 5x), on s'y restreint sauf tirage rare exceptionnel
    poolAfterRatio = allowDisproportionate ? eligibleClubs : withinRatio
  } else {
    // Si aucun partenaire à moins de 5x la taille (uniquement des métropoles géantes) :
    // On refuse l'alliance disproportionnée sauf si le tirage rare à 5 % est validé
    if (!allowDisproportionate) {
      return undefined
    }
    poolAfterRatio = eligibleClubs
  }

  if (poolAfterRatio.length === 1) return poolAfterRatio[0]

  // Filter out tiny communes (< 2,500 pop) if larger communes (>= 3,000) exist in the pool
  const hasSubstantialTowns = poolAfterRatio.some((c) => c.population >= 3000)
  const pool = hasSubstantialTowns
    ? poolAfterRatio.filter((c) => c.population >= 2000)
    : poolAfterRatio

  const candidates = pool.length > 0 ? pool : poolAfterRatio

  // Modèle de gravité avec affinité démographique :
  // Privilégie la proximité géographique et des tailles comparables (évite d'aspirer systématiquement les géants)
  const scored = candidates.map((clubB) => {
    const dist = calculateDistanceKm(clubA.coordinates, clubB.coordinates)
    const ratio = Math.max(clubA.population / clubB.population, clubB.population / clubA.population)
    const sizeAffinity = 1 / Math.sqrt(ratio)
    const popFactor = Math.sqrt(clubB.population) * sizeAffinity
    const distFactor = Math.pow(dist + 5, 1.3)
    const score = popFactor / distFactor
    return { club: clubB, distance: dist, score }
  })

  scored.sort((a, b) => b.score - a.score)

  // Probabilistically select among top 3 closest & best-matching candidates
  const topN = scored.slice(0, Math.min(3, scored.length))
  const totalScore = topN.reduce((sum, item) => sum + item.score, 0)
  let roll = rng() * totalScore
  for (const item of topN) {
    roll -= item.score
    if (roll <= 0) return item.club
  }

  return topN[0]?.club
}

export function computePerformanceWeight(
  club: Club,
  archive: SeasonArchive,
): number {
  if (club.id === archive.nationalChampionId) {
    return 0 // National Champion NEVER fuses (spawns rival club instead)
  }

  const hasRecordedPerfs = Object.keys(archive.teamPerformances || {}).length > 0
  if (!hasRecordedPerfs) {
    return 1
  }

  const perf = archive.teamPerformances[club.id]
  if (!perf || perf.matchesWon === 0) {
    return 0
  }

  let weight = 0

  // 1. Classement / Tours atteints : compte UNIQUEMENT pour la phase de Conférence (Tours 9 à 14)
  // « tout ce qui est classement ça compte pas, sauf pour la partie conférence »
  if (perf.isConferenceChampion || perf.roundReached >= 13) {
    weight = 5000
  } else if (perf.roundReached === 12) {
    weight = 2500
  } else if (perf.roundReached === 11) {
    weight = 1500
  } else if (perf.roundReached === 10) {
    weight = 800
  } else if (perf.roundReached === 9) {
    weight = 400
  }

  // 2. Titres régionaux et départementaux :
  // « Par contre ce qui peut aider en plus c'est championnats régionaux effectivement ça donne un boost...
  // un boost de poids... et champion départemental aussi ça donne un petit boost de poids... »
  if (perf.isRegionChampion) {
    weight += 250
  }

  if (perf.isDepartmentChampion) {
    weight += 50
  }

  // Si le club n'a pas atteint la Conférence (Tour 9+) et n'est ni Champion Régional ni Champion Départemental,
  // son poids reste à 0 (« on va enlever demi-finalistes départementales... tout ce qui est classement ça compte pas »)
  if (weight === 0) {
    return 0
  }

  // Bonus additionnel au mérite pour les victoires et la différence de buts des clubs éligibles
  weight += perf.matchesWon * 10
  if (perf.goalDifference && perf.goalDifference > 0) {
    weight += Math.min(30, perf.goalDifference)
  }

  return weight
}

export function executeInterseasonTransition(
  currentClubs: readonly Club[],
  archive: SeasonArchive,
  communes: readonly Commune[],
  options?: InterseasonOptions,
): { nextClubs: readonly Club[]; report: InterseasonReport; nextCommuneNextIndex: Record<string, number> } {
  const maxFusions = options?.maxFusions ?? 30
  const seed = options?.seed ?? `${archive.seed}:interseason:${archive.year}`
  const rng = createPrng(seed)
  const popBounds = options?.popBounds ?? { min: 1000, max: 2150000 }

  const fusions: FusionEvent[] = []
  const secessions: SecessionEvent[] = []
  let rivalCreated: RivalCreationEvent | undefined

  // --- Registres d'unicité ---
  // Noms déjà utilisés (actifs + absorbés historiquement), en minuscules
  const usedNames: Set<string> = new Set(options?.usedClubNames ?? [])
  // On enrichit immédiatement avec les noms des clubs actuels
  for (const club of currentClubs) {
    usedNames.add(club.name.toLowerCase())
  }
  // Index maximum par commune (garantit des IDs uniques à vie)
  const communeNextIndex: Record<string, number> = { ...(options?.communeNextIndex ?? {}) }

  /**
   * Alloue un ID unique pour une nouvelle club dans une commune donnée.
   * Utilise communeNextIndex pour ne jamais réutiliser un suffixe passé.
   */
  function allocateClubId(communeId: string): string {
    const next = communeNextIndex[communeId] ?? 2
    communeNextIndex[communeId] = next + 1
    return `${communeId}-${next}`
  }

  /**
   * Trouve le premier nom de club disponible pour une commune,
   * en évitant tous les noms du registre usedNames.
   */
  function findAvailableName(commune: Commune, startIdx = 0): { name: string; shortName: string } {
    let idx = startIdx
    for (let attempt = 0; attempt < 200; attempt++) {
      const naming = getClubNameForCommune(commune, idx)
      if (!usedNames.has(naming.name.toLowerCase())) {
        return naming
      }
      idx++
    }
    // Dernier recours (ne devrait jamais arriver)
    const fallbackName = `Club de ${commune.name}`
    return { name: fallbackName, shortName: commune.name }
  }

  // 1. Create Rival Club for the National Champion
  const nationalChampionId = archive.nationalChampionId
  const championClub = currentClubs.find((c) => c.id === nationalChampionId)
  let rivalClub: Club | undefined

  if (championClub) {
    const championCommune = communes.find((c) => c.id === championClub.communeId)
    if (championCommune) {
      const rivalNaming = findAvailableName(championCommune, 1)
      const rivalId = allocateClubId(championCommune.id)

      // Base strength of commune, reduced by 20%
      const baseCommuneStrength = computeStrength(championCommune.population, popBounds.min, popBounds.max)
      const rivalStrength = Math.max(1, Number((baseCommuneStrength * 0.8).toFixed(1)))

      rivalClub = Object.freeze({
        id: rivalId,
        name: rivalNaming.name,
        shortName: rivalNaming.shortName,
        communeId: championCommune.id,
        communeName: championCommune.name,
        communeIds: [championCommune.id],
        communeNames: [championCommune.name],
        departmentId: championCommune.departmentId,
        regionId: championCommune.regionId,
        zoneId: championCommune.zoneId,
        conferenceId: championCommune.conferenceId,
        population: championCommune.population,
        strength: rivalStrength,
        coordinates: championCommune.coordinates,
        isRivalClub: true,
        parentChampionYear: archive.year,
        parentClubId: championClub.id,
        parentClubName: championClub.name,
        identity: Object.freeze(getClubIdentity({ id: rivalId })),
      })

      usedNames.add(rivalNaming.name.toLowerCase())

      rivalCreated = {
        clubId: rivalClub.id,
        clubName: rivalClub.name,
        communeName: championCommune.name,
        strength: rivalStrength,
        parentChampionName: championClub.name,
      }
    }
  }

  // 2. Perform Fusions based on previous season performance
  // Exclude national champion and clubs with zero performance weight
  const candidateClubs = currentClubs.filter(
    (c) => c.id !== nationalChampionId && computePerformanceWeight(c, archive) > 0,
  )

  // Compute weights and keys using A-Res (Efraimidis-Spirakis weighted sampling without replacement)
  const keyedCandidates = candidateClubs.map((club) => {
    const weight = computePerformanceWeight(club, archive)
    const u = Math.max(0.000001, rng())
    const key = Math.pow(u, 1 / weight)
    return { club, weight, key }
  })

  // Sort descending by key: gives exact weighted random order
  keyedCandidates.sort((a, b) => b.key - a.key)

  // Clubs tracking
  const clubsById = new Map<string, Club>(currentClubs.map((c) => [c.id, c]))
  const mergedIds = new Set<string>()

  // Helper to find nearby active clubs (within 40km, cross-department allowed)
  // Strictly excludes clubs that share a commune (e.g. clubs from the same city / rivals)
  const getNearbyEligibleClubs = (lead: Club): Club[] => {
    const eligible: Club[] = []
    const hasCoords = !!lead.coordinates
    const [lonA, latA] = lead.coordinates ?? [0, 0]

    for (const other of clubsById.values()) {
      if (other.id === lead.id || mergedIds.has(other.id) || other.id === nationalChampionId) {
        continue
      }

      // Règle 1 : Deux clubs qui partagent une même commune ne peuvent PAS fusionner
      // (ex: deux clubs d'une même ville comme un club historique et son club rival restent rivaux et ne fusionnent pas ensemble)
      const sharesCommune = lead.communeIds.some((id) => other.communeIds.includes(id)) || lead.communeId === other.communeId
      if (sharesCommune) {
        continue
      }

      // Règle 1b : Deux clubs rivaux ne peuvent JAMAIS s'absorber entre eux
      // - Si un club a été créé à partir d'un club rival (relation parent-rival), ils ne peuvent pas s'absorber
      // - Deux clubs notés rivaux (isRivalClub) ne peuvent pas s'absorber entre eux
      const isParentOrRivalChild =
        (lead.parentClubId && (lead.parentClubId === other.id || lead.parentClubId === other.parentClubId)) ||
        (other.parentClubId && (other.parentClubId === lead.id || other.parentClubId === lead.parentClubId))
      if (isParentOrRivalChild) {
        continue
      }

      if (lead.isRivalClub && other.isRivalClub) {
        continue
      }

      // Règle 2 : Équilibre des fusions (directive utilisateur)
      // - Un club simple (non-fusion) ne peut PAS absorber une fusion existante.
      // - Une fusion ne peut absorber une autre fusion que si elle est plus grande et que
      //   la fusion absorbée représente au maximum 50 % de sa population.
      // - En revanche, un club simple peut toujours s'allier à une ville isolée (!other.isFusion).
      if (other.isFusion) {
        if (!lead.isFusion) {
          continue
        }
        if (other.population > 0.5 * lead.population) {
          continue
        }
      }

      // Règle 3 : Localisation géographique très proche (pas de délimitation de département)
      if (hasCoords && other.coordinates) {
        // Pré-filtrage rapide boîte englobante (~50 km)
        const dLat = Math.abs(other.coordinates[1] - latA)
        if (dLat > 0.45) continue
        const dLon = Math.abs(other.coordinates[0] - lonA)
        if (dLon > 0.65) continue

        const dist = calculateDistanceKm(lead.coordinates, other.coordinates)
        if (dist <= 40) {
          eligible.push(other)
        }
      } else if (other.departmentId === lead.departmentId) {
        // Secours si coordonnées manquantes : même département
        eligible.push(other)
      }
    }

    // Si aucune ville à moins de 40 km (zone rurale très isolée), élargir jusqu'à 65 km
    if (eligible.length === 0 && hasCoords) {
      for (const other of clubsById.values()) {
        if (other.id === lead.id || mergedIds.has(other.id) || other.id === nationalChampionId) continue
        const sharesCommune = lead.communeIds.some((id) => other.communeIds.includes(id)) || lead.communeId === other.communeId
        if (sharesCommune) continue

        const isParentOrRivalChild =
          (lead.parentClubId && (lead.parentClubId === other.id || lead.parentClubId === other.parentClubId)) ||
          (other.parentClubId && (other.parentClubId === lead.id || other.parentClubId === lead.parentClubId))
        if (isParentOrRivalChild) continue

        if (lead.isRivalClub && other.isRivalClub) continue

        if (other.isFusion) {
          if (!lead.isFusion) continue
          if (other.population > 0.5 * lead.population) continue
        }

        if (other.coordinates) {
          const dist = calculateDistanceKm(lead.coordinates, other.coordinates)
          if (dist <= 65) {
            eligible.push(other)
          }
        }
      }
    }

    return eligible
  }

  for (const item of keyedCandidates) {
    if (fusions.length >= maxFusions) break

    const clubA = clubsById.get(item.club.id)
    if (!clubA || mergedIds.has(clubA.id)) continue

    const candidatePartners = getNearbyEligibleClubs(clubA)
    if (candidatePartners.length === 0) continue

    // Pick best partner: geographically close & size-affinity favored, respects max 5x ratio
    const clubB = findBestFusionPartner(clubA, candidatePartners, rng, {
      maxPopulationRatio: options?.maxPartnerPopulationRatio ?? MAX_PARTNER_POPULATION_RATIO,
      rareDisproportionateProb: options?.disproportionateFusionProb ?? DISPROPORTIONATE_FUSION_PROB,
    })
    if (!clubB) continue

    // Le club initiateur (clubA) a gagné l'initiative de la fusion grâce à ses résultats sportifs.
    // Il demeure le club pilote / commune siège (identifiant, coordonnées).
    const leadClub = clubA
    const absorbedClub = clubB

    // Détermination du club principal pour l'identité visuelle (code couleur & logo) :
    // Règle : "Quand une équipe est fusionnée ou autre, il faut pas qu'elle perde son identité logo et code couleur. On garde le code couleur et le logo du club principal toujours."
    // 1. Si un club a une identité personnalisée explicite (notamment un logo ou des couleurs enregistrées) et l'autre non,
    //    le club personnalisé est prioritaire pour ne jamais écraser la personnalisation de l'utilisateur.
    // 2. Sinon, le club principal est celui ayant la plus grande population (ou leadClub en cas d'égalité).
    const leadHasCustom = Boolean(leadClub.identity)
    const absorbedHasCustom = Boolean(absorbedClub.identity)

    let principalClub: Club
    let secondaryClub: Club

    if (absorbedHasCustom && !leadHasCustom) {
      principalClub = absorbedClub
      secondaryClub = leadClub
    } else if (leadHasCustom && !absorbedHasCustom) {
      principalClub = leadClub
      secondaryClub = absorbedClub
    } else if (absorbedClub.population > leadClub.population) {
      principalClub = absorbedClub
      secondaryClub = leadClub
    } else {
      principalClub = leadClub
      secondaryClub = absorbedClub
    }

    const principalIdentity = getClubIdentity(principalClub)
    const secondaryIdentity = getClubIdentity(secondaryClub)
    const preservedLogo = principalClub.identity?.logo ?? secondaryClub.identity?.logo

    const mergedIdentity: ClubIdentity = Object.freeze({
      primaryColor: principalIdentity.primaryColor,
      secondaryColor: principalIdentity.secondaryColor,
      ...(preservedLogo ? { logo: preservedLogo } : {}),
    })

    const absorbedIdentity: ClubIdentity = Object.freeze({
      primaryColor: secondaryIdentity.primaryColor,
      secondaryColor: secondaryIdentity.secondaryColor,
      ...(secondaryClub.identity?.logo ? { logo: secondaryClub.identity?.logo } : {}),
    })

    const totalPopulation = leadClub.population + absorbedClub.population
    const combinedCommuneIds = [...leadClub.communeIds, ...absorbedClub.communeIds]
    const combinedCommuneNames = [...leadClub.communeNames, ...absorbedClub.communeNames]

    const newStrength = Number(computeStrength(totalPopulation, popBounds.min, popBounds.max).toFixed(1))
    // La force précédente est la force de base purement démographique du club initiateur (sans joueurs ni entraîneur)
    const leadBaseStrength = Number(computeStrength(leadClub.population, popBounds.min, popBounds.max).toFixed(1))

    // Le générateur protège les noms personnalisés et existants, et applique la dominance
    // avant de choisir une convention territoriale, quel que soit le nombre de communes.
    const isCustomName = Boolean(leadClub.isCustomName)
    const { name, shortName } = generateFusionClubName(leadClub, absorbedClub, combinedCommuneNames.length)

    const fusedClubsList = [
      ...(leadClub.fusedClubs ?? []),
      ...(absorbedClub.fusedClubs ?? []),
      {
        id: absorbedClub.id,
        name: absorbedClub.name,
        communeId: absorbedClub.communeId,
        communeName: absorbedClub.communeName,
        communeIds: absorbedClub.communeIds,
        communeNames: absorbedClub.communeNames,
        year: archive.year,
        oldStrength: leadBaseStrength,
        newStrength,
        totalPopulation,
        identity: absorbedClub.identity ?? absorbedIdentity,
      },
    ]

    const mergedClub: Club = Object.freeze({
      id: leadClub.id,
      name,
      shortName,
      communeId: leadClub.communeId,
      communeName: leadClub.communeName,
      communeIds: combinedCommuneIds,
      communeNames: combinedCommuneNames,
      departmentId: leadClub.departmentId,
      regionId: leadClub.regionId,
      zoneId: leadClub.zoneId,
      conferenceId: leadClub.conferenceId,
      population: totalPopulation,
      strength: newStrength,
      baseStrength: newStrength,
      coordinates: leadClub.coordinates,
      isFusion: true,
      fusionCount: combinedCommuneIds.length,
      isRivalClub: leadClub.isRivalClub,
      parentChampionYear: leadClub.parentChampionYear,
      parentClubId: leadClub.parentClubId,
      parentClubName: leadClub.parentClubName,
      identity: mergedIdentity,
      isCustomName: isCustomName || undefined,
      fusedClubs: Object.freeze(fusedClubsList),
      secessionCounts: Object.freeze({
        ...(leadClub.secessionCounts ?? {}),
        ...(absorbedClub.secessionCounts ?? {}),
      }),
    })

    // Retirer les noms des clubs absorbés du pool disponible (ils sont maintenant retraités)
    usedNames.add(absorbedClub.name.toLowerCase())
    usedNames.add(name.toLowerCase())

    // Record fusion
    fusions.push({
      mergedClubId: mergedClub.id,
      mergedClubName: mergedClub.name,
      leadClubName: leadClub.name,
      leadCommuneId: leadClub.communeId,
      leadCommuneName: leadClub.communeName,
      absorbedClubId: absorbedClub.id,
      absorbedClubName: absorbedClub.name,
      absorbedCommuneIds: absorbedClub.communeIds,
      absorbedCommuneNames: absorbedClub.communeNames,
      communeNames: combinedCommuneNames,
      totalPopulation,
      newStrength,
      oldStrength: leadBaseStrength,
    })

    mergedIds.add(absorbedClub.id)
    mergedIds.add(leadClub.id)
    clubsById.delete(absorbedClub.id)
    clubsById.set(leadClub.id, mergedClub)
  }

  // Add the newly created rival club if any
  if (rivalClub) {
    clubsById.set(rivalClub.id, rivalClub)
  }

  // 3. Régénérations & Érosion progressive des Alliances
  //
  // Règles définies par l'utilisateur :
  // - Villes de plus de 50 000 habitants (options?.minRegenerationPopulation ?? SECESSION_MIN_POP = 50 000).
  // - La grande commune absorbée recrée son propre club local indépendant s'il n'en a pas déjà un directement rattaché.
  // - À chaque régénération, l'alliance perd 33 % de la population de la grande commune (sans jamais descendre sous le plancher de la commune hôte).
  // - Au bout de 3 fois, la commune se retire totalement et définitivement de l'alliance.
  // - Si l'alliance n'a plus qu'1 seule commune, elle redevient un club autonome de sa commune d'origine.
  const minRegenPop = options?.minRegenerationPopulation ?? SECESSION_MIN_POP
  const regenLossRatio = options?.regenerationPopLossRatio ?? REGENERATION_POP_LOSS_RATIO
  const communesById = new Map(communes.map((c) => [c.id, c]))

  // Snapshot des clubs en entente avant les régénérations
  const fusionClubsSnapshot = Array.from(clubsById.values()).filter((c) => c.isFusion)
  const regeneratedCommuneIds = new Set<string>()

  for (const enteClubSnapshot of fusionClubsSnapshot) {
    const enteClub = clubsById.get(enteClubSnapshot.id)
    if (!enteClub || !enteClub.isFusion) continue

    // Les communes absorbées sont toutes les communes partenaires (hors première commune / club initiateur)
    const absorbedCommuneIds = enteClub.communeIds.slice(1)

    for (const cId of absorbedCommuneIds) {
      if (regeneratedCommuneIds.has(cId)) continue

      const commune = communesById.get(cId)
      if (!commune || commune.population < minRegenPop) continue

      // Une commune ne peut entamer un processus de sécession que si elle n'a aucun club rattaché.
      // Si elle a déjà entamé la sécession (étape > 0), elle poursuit son processus de désengagement.
      const currentSecessionStep = enteClub.secessionCounts?.[cId] ?? 0
      const alreadyHasAttachedClub = Array.from(clubsById.values()).some((c) => c.communeId === cId)
      if (currentSecessionStep === 0 && alreadyHasAttachedClub) {
        continue
      }

      // Tirage probabiliste
      if (rng() > SECESSION_PROB) continue

      regeneratedCommuneIds.add(cId)

      let createdClub: Club | undefined
      if (!alreadyHasAttachedClub) {
        // --- Création du nouveau club indépendant pour la grande ville ---
        const newClubNaming = findAvailableName(commune)
        const newClubId = allocateClubId(commune.id)
        const newClubStrength = Number(computeStrength(commune.population, popBounds.min, popBounds.max).toFixed(1))

        // Restaurer l'identité originelle du club absorbé si enregistrée dans l'entente
        const previousIdentity = enteClub.fusedClubs?.find((fc) => fc.communeId === commune.id || fc.id === commune.id)?.identity
        const restoredIdentity = previousIdentity ?? getClubIdentity({ id: newClubId })

        createdClub = Object.freeze({
          id: newClubId,
          name: newClubNaming.name,
          shortName: newClubNaming.shortName,
          communeId: commune.id,
          communeName: commune.name,
          communeIds: [commune.id],
          communeNames: [commune.name],
          departmentId: commune.departmentId,
          regionId: commune.regionId,
          zoneId: commune.zoneId,
          conferenceId: commune.conferenceId,
          population: commune.population,
          strength: newClubStrength,
          coordinates: commune.coordinates,
          identity: Object.freeze(restoredIdentity),
        })

        usedNames.add(newClubNaming.name.toLowerCase())
        clubsById.set(newClubId, createdClub)
      }

      const existingAttachedClub = createdClub ?? Array.from(clubsById.values()).find((c) => c.communeId === cId)
      const reportClubId = existingAttachedClub?.id ?? cId
      const reportClubName = existingAttachedClub?.name ?? commune.name

      // 2. --- Mise à jour de TOUTES les Alliances où cette commune est partenaire ---
      // L'alliance perd 33 % de la population de la grande commune par étape, avec un plancher garanti.
      // Au bout de 3 fois, la commune se retire totalement de l'alliance.
      const relatedAlliances = Array.from(clubsById.values()).filter(
        (c) => c.isFusion && c.communeIds.includes(cId),
      )

      for (const alliedClub of relatedAlliances) {
        const currentCount = alliedClub.secessionCounts?.[cId] ?? 0
        const step = currentCount + 1
        const isCompleteWithdrawal = step >= MAX_SECESSION_STEPS

        // Plancher strict : population cumulée des AUTRES communes de l'alliance (la ville alliée/hôte)
        const otherCommuneIds = alliedClub.communeIds.filter((id) => id !== cId)
        const otherCommunes = otherCommuneIds.map((id) => communesById.get(id)).filter(Boolean) as Commune[]
        const floorPopulation = Math.min(alliedClub.population, otherCommunes.reduce((sum, c) => {
          const previousSteps = alliedClub.secessionCounts?.[c.id] ?? 0
          const remaining = Math.max(0, c.population - Math.round(c.population * regenLossRatio) * previousSteps)
          return sum + remaining
        }, 0))

        let populationLost: number
        let newPop: number

        if (isCompleteWithdrawal) {
          // 3e fois : retrait complet, la population de l'alliance retombe exactement sur le plancher des communes restantes
          populationLost = Math.max(0, alliedClub.population - floorPopulation)
          newPop = Math.max(1, floorPopulation)
        } else {
          // Étape 1 ou 2 : déduit 33% de la population de la commune avec respect absolu du plancher
          const portion = Math.round(commune.population * regenLossRatio)
          const maxAllowedLoss = Math.max(0, alliedClub.population - floorPopulation)
          populationLost = Math.min(portion, maxAllowedLoss)
          newPop = Math.max(floorPopulation, alliedClub.population - populationLost)
        }

        const newEnteStrength = Number(computeStrength(newPop, popBounds.min, popBounds.max).toFixed(1))

        let nextCommuneIds = alliedClub.communeIds
        let nextCommuneNames = alliedClub.communeNames
        let nextIsFusion = alliedClub.isFusion
        let nextFusionCount = alliedClub.fusionCount
        let nextName = alliedClub.name
        let nextShortName = alliedClub.shortName

        if (isCompleteWithdrawal) {
          nextCommuneIds = otherCommuneIds
          nextCommuneNames = alliedClub.communeNames.filter((name) => name !== commune.name)

          if (nextCommuneIds.length <= 1) {
            // L'alliance n'a plus qu'une seule commune restante : retour à un club autonome
            nextIsFusion = undefined
            nextFusionCount = 1
            const leadCommune = communesById.get(alliedClub.communeId)
            if (leadCommune) {
              const genuine = getClubNameForCommune(leadCommune, 0)
              nextName = genuine.name
              nextShortName = genuine.shortName
            }
          } else {
            // L'alliance compte encore au moins 2 communes
            nextIsFusion = true
            nextFusionCount = nextCommuneIds.length
            if (nextName.includes(commune.name)) {
              if (nextCommuneNames.length === 2) {
                nextName = `Entente ${nextCommuneNames[0]} / ${nextCommuneNames[1]}`
              } else {
                nextName = `Alliance ${nextCommuneNames.join(' / ')}`
              }
              nextShortName = nextName
            }
          }
        }

        const updatedSecessionCounts = {
          ...(alliedClub.secessionCounts ?? {}),
          [cId]: step,
        }

        const updatedAlliedClub: Club = Object.freeze({
          ...alliedClub,
          name: nextName,
          shortName: nextShortName,
          communeIds: Object.freeze(nextCommuneIds),
          communeNames: Object.freeze(nextCommuneNames),
          population: newPop,
          strength: newEnteStrength,
          baseStrength: newEnteStrength,
          isFusion: nextIsFusion || undefined,
          fusionCount: nextFusionCount ?? undefined,
          identity: Object.freeze(alliedClub.identity ?? getClubIdentity(alliedClub)),
          secessionCounts: Object.freeze(updatedSecessionCounts),
        })

        clubsById.set(alliedClub.id, updatedAlliedClub)

        secessions.push({
          newClubId: reportClubId,
          newClubName: reportClubName,
          communeId: commune.id,
          communeName: commune.name,
          parentEnteId: alliedClub.id,
          parentEnteName: alliedClub.name,
          populationLost,
          newEnteStrength,
          step,
          isCompleteWithdrawal,
        })
      }
    }
  }

  const nextClubs = Object.freeze(Array.from(clubsById.values()))

  const report: InterseasonReport = Object.freeze({
    seasonYear: archive.year + 1,
    fusions: Object.freeze(fusions),
    secessions: Object.freeze(secessions),
    rivalCreated,
  })

  return { nextClubs, report, nextCommuneNextIndex: communeNextIndex }
}
