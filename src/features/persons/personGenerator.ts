import { collectPlayerSeasonStatistics } from './playerStatistics'
import { getPersonOriginClub } from './personOrigin'
import { getPlayerHonors, getSeasonAwards } from '../awards/seasonAwards'
import { createPrng } from '../random/prng'
import type { Commune } from '../geography/types'
import type { Club } from '../teams/types'
import type { Person, PlayerPosition, PersonCareerSeason } from './types'
import type { SeasonArchive, FusionEvent } from '../storage/cupRepository'
import { generatePersonName } from './namesData'
import { CUP_CONFIG } from '../../config/cupConfig'
import { assignSeasonRostersAndLoans, buildAbsorbedToMergedClubMap } from './rosterAndLoans'
import type { TransferMovement } from '../transfers/types'
import { applyTransferMarket, collectLoanMovements, sortMovements } from '../transfers/transferEngine'
import { computeStatAtAge } from './careerCurve'
import { advanceRetiredPerson, assignSeasonCoaches, collectCoachMovements } from '../coaches/coachEngine'
import { competitionRating, computeCoachPeakSkill } from '../coaches/coachRatings'
import { isAllianceSyntheticName } from '../teams/clubResolution'
export { computeStatAtAge } from './careerCurve'

export type PersonGeneratorOptions = {
  count?: number
  communes: readonly Commune[]
  clubs: readonly Club[]
  seed: string
  startYear?: number
  assignRostersAndLoans?: boolean
}

export type AdvancePersonsOptions = {
  persons: readonly Person[]
  communes: readonly Commune[]
  clubs: readonly Club[]
  seasonYear: number
  seed: string
  newRecruitsCount?: number
  previousSeasonArchive?: SeasonArchive
  assignRostersAndLoans?: boolean
  fusions?: readonly FusionEvent[]
}

/** Avance d'une saison et conserve les mouvements du mercato. */
export function advancePersonsSeasonWithMarket(options: AdvancePersonsOptions): { persons: Person[]; movements: TransferMovement[] } {
  const advanced = advancePersonsSeason({ ...options, assignRostersAndLoans: false })
  const marketOptions = { clubs: options.clubs, seasonYear: options.seasonYear, seed: options.seed,
    previousPersons: options.persons, fusions: options.fusions, previousSeasonArchive: options.previousSeasonArchive }
  const market = applyTransferMarket({ ...marketOptions, persons: advanced })
  const coachMovements = collectCoachMovements({ ...marketOptions, persons: advanced })
  if (options.assignRostersAndLoans === false) return { ...market, movements: sortMovements([...market.movements, ...coachMovements]) }
  // The market and roster selection use the same stable tie-break order.
  const assigned = assignSeasonRostersAndLoans({ persons: [...market.persons].sort((a, b) => a.id.localeCompare(b.id)),
    clubs: options.clubs, seed: `${options.seed}|loans-${options.seasonYear}`, fusions: options.fusions })
  const assignedById = new Map(assigned.map(p => [p.id, p]))
  const persons = market.persons.map(p => assignedById.get(p.id) ?? p)
  const loans = collectLoanMovements({ ...marketOptions, persons })
  return { persons, movements: sortMovements([...market.movements, ...loans, ...coachMovements]) }
}

/**
 * Calcule une distance au carré approximative entre deux paires de coordonnées [lon, lat].
 */
function coordDistanceSq(a?: readonly [number, number], b?: readonly [number, number]): number {
  if (!a || !b) return Infinity
  const dx = a[0] - b[0]
  const dy = a[1] - b[1]
  return dx * dx + dy * dy
}

/**
 * Trouve le club actif auquel rattacher une personne selon sa commune de naissance.
 * 1. Club basé dans la commune natale (ou entente l'intégrant).
 * 2. Si plusieurs (clubs rivaux), tirage au sort parmi ceux-ci.
 * 3. Sinon, club géographique le plus proche.
 */
export function assignClubForCommune(
  birthCommune: Commune,
  clubs: readonly Club[],
  rng: () => number,
): string | null {
  if (clubs.length === 0) return null

  // 1. Clubs rattachés directement à la commune
  const matchingClubs = clubs.filter(
    (c) => c.communeId === birthCommune.id || c.communeIds?.includes(birthCommune.id),
  )

  if (matchingClubs.length > 0) {
    const picked = matchingClubs[Math.floor(rng() * matchingClubs.length)]
    return picked.id
  }

  // 2. Club le plus proche géographiquement
  let bestClub = clubs[0]
  let minDistance = Infinity

  for (const c of clubs) {
    const dist = coordDistanceSq(birthCommune.coordinates, c.coordinates)
    if (dist < minDistance) {
      minDistance = dist
      bestClub = c
    }
  }

  return bestClub.id
}

/**
 * Génère une stat entre 1 et 30 selon une courbe où les valeurs proches de 30 sont très rares.
 * - Médiane autour de 12-15
 * - Note > 22 : ~10 %
 * - Note > 26 : ~2.5 %
 * - Note 29-30 : < 0.5 %
 */
export function samplePlayerStat(rng: () => number, isPrimary: boolean): number {
  // Tirage asymétrique avec queue de distribution élite
  const u = rng()
  // Puissance 1.8 accentue la rareté des scores élevés
  const curve = Math.pow(u, 1.8)
  
  if (isPrimary) {
    // Stat principale (Attaque pour attaquant, Défense pour défenseur) : 6 à 30
    const val = 6 + Math.floor(curve * 25)
    return Math.min(30, Math.max(1, val))
  } else {
    // Stat secondaire : 2 à 22
    const val = 2 + Math.floor(curve * 21)
    return Math.min(22, Math.max(1, val))
  }
}

/**
 * Détermine la phase de carrière du joueur.
 */
export function getCareerPhase(age: number, peakAge?: number): 'GROWTH' | 'PEAK' | 'DECLINE' {
  const peak = peakAge ?? 27
  if (age < peak) return 'GROWTH'
  if (age <= peak + 1) return 'PEAK'
  return 'DECLINE'
}

/**
 * Génère le vivier initial de personnes (par défaut 300).
 */
export function generateInitialPersonPool(options: PersonGeneratorOptions): Person[] {
  const count = options.count ?? 300
  const rng = createPrng(`${options.seed}|persons-init-v1`)
  const communes = options.communes
  const clubs = options.clubs

  if (communes.length === 0) return []

  // Construction de la table de répartition cumulative pour la pondération démographique
  const cumulativeWeights: number[] = new Array(communes.length)
  let totalPop = 0
  for (let i = 0; i < communes.length; i++) {
    totalPop += Math.max(1, communes[i].population)
    cumulativeWeights[i] = totalPop
  }

  // Fonction de recherche dichotomique pour tirer une commune proportionnellement à sa pop
  const pickCommune = (): Commune => {
    const target = rng() * totalPop
    let low = 0
    let high = communes.length - 1
    while (low < high) {
      const mid = (low + high) >> 1
      if (cumulativeWeights[mid] <= target) {
        low = mid + 1
      } else {
        high = mid
      }
    }
    return communes[low]
  }

  const persons: Person[] = []
  const usedNames = new Set<string>()

  for (let i = 0; i < count; i++) {
    const birthCommune = pickCommune()
    const clubId = assignClubForCommune(birthCommune, clubs, rng)

    // Âge initial entre 16 et 35 ans
    const age = 16 + Math.floor(rng() * 20)

    // Pic d'apogée sportive aléatoire (entre 24 et 31 ans, moyenne ~27)
    const peakAge = 24 + Math.floor(rng() * 8)

    // Choix du poste (50 % Attaquant, 50 % Défenseur)
    const position: PlayerPosition = rng() < 0.5 ? 'ATTACKER' : 'DEFENDER'

    const s1 = samplePlayerStat(rng, true)
    const s2 = samplePlayerStat(rng, false)
    const primaryPeak = Math.max(s1, s2)
    const secondaryPeak = Math.min(s1, s2)

    const peakAttack = position === 'ATTACKER' ? primaryPeak : secondaryPeak
    const peakDefense = position === 'DEFENDER' ? primaryPeak : secondaryPeak

    // Stats actuelles dérivées selon l'âge et la courbe de progression / déclin
    const attack = computeStatAtAge(peakAttack, age, peakAge)
    const defense = computeStatAtAge(peakDefense, age, peakAge)

    // Aptitudes futures d'entraîneur ou de président
    rng() // Conserver la séquence des autres tirages sportifs existants.
    const coachSkill = computeCoachPeakSkill({ position, attack, defense, peakAttack, peakDefense })
    const presidentSkill = Math.min(30, Math.max(1, 4 + Math.floor(Math.pow(rng(), 1.7) * 26)))

    const identity = generateUniqueIdentity(
      `${options.seed}|identity-v2|p-${i + 1}`, birthCommune,
      (options.startYear ?? CUP_CONFIG.defaultStartYear) - age, usedNames,
    )

    persons.push({
      id: `p-${i + 1}`,
      ...identity,
      age,
      birthCommuneId: birthCommune.id,
      birthCommuneName: birthCommune.name,
      birthDepartmentId: birthCommune.departmentId,
      currentClubId: clubId,
      parentClubId: clubId,
      originClubId: clubId,
      originClubName: clubs.find(c => c.id === clubId)?.name,
      primaryRole: 'PLAYER',
      position,
      peakAge,
      peakAttack,
      peakDefense,
      attack,
      defense,
      coachSkill,
      presidentSkill,
      careerYears: 0,
      careerHistory: [],
      isRetired: false,
    })
  }

  if (options.assignRostersAndLoans) {
    return assignSeasonRostersAndLoans({
      persons,
      clubs,
      seed: options.seed,
    })
  }

  return persons
}

/**
 * Fait progresser les personnes d'une saison à l'autre :
 * - Vieillissement de +1 an
 * - Enregistrement de la saison écoulée et du palmarès dans careerHistory
 * - Départs en retraite selon une probabilité croissante de 34 à 38 ans
 * - Réaffectation des joueurs dont le club a été absorbé lors des fusions
 * - Nouvelle promotion de jeunes recrues (16-18 ans)
 */
export function advancePersonsSeason(options: AdvancePersonsOptions): Person[] {
  const { persons, communes, clubs, seasonYear, seed, previousSeasonArchive } = options
  const rng = createPrng(`${seed}|persons-intersaison-${seasonYear}`)

  const activeClubsMap = new Map<string, Club>()
  clubs.forEach((c) => activeClubsMap.set(c.id, c))

  // Table de redirection des clubs absorbés vers les clubs fusionnés actifs
  const absorbedToMergedMap = buildAbsorbedToMergedClubMap(clubs, options.fusions)

  const updatedPersons: Person[] = []
  const usedNames = new Set(persons.map(p => `${p.firstName} ${p.lastName}`))

  const playerSeasonStats = collectPlayerSeasonStatistics(previousSeasonArchive?.history ?? [], persons)
  const individualAwards = previousSeasonArchive ? getSeasonAwards(previousSeasonArchive) : null

  // 1. Vieillissement et retraite des personnes existantes
  for (const existing of persons) {
    const origin = getPersonOriginClub(existing, activeClubsMap)
    const p = { ...existing, originClubId: origin?.id, originClubName: origin?.name }
    if (p.isRetired) {
      updatedPersons.push(advanceRetiredPerson(p, seasonYear, previousSeasonArchive))
      continue
    }

    const nextAge = p.age + 1
    const nextCareerYears = p.careerYears + 1

    // Enregistrement de la saison écoulée dans l'historique de carrière
    const prevClubId = p.currentClubId
    const prevClubPerf = prevClubId && previousSeasonArchive ? previousSeasonArchive.teamPerformances?.[prevClubId] : undefined
    const prevClubObj = prevClubId ? activeClubsMap.get(prevClubId) : undefined

    // Si le club a été absorbé ou impliqué dans une fusion récente, préserver le nom historique de l'ancien club
    const absorbedFusion = prevClubId ? options.fusions?.find((f) => f.absorbedClubId === prevClubId) : undefined
    const leadFusion = prevClubId ? options.fusions?.find((f) => f.mergedClubId === prevClubId) : undefined
    const fusedClubInfo = prevClubId ? clubs.flatMap((c) => c.fusedClubs ?? []).find((fc) => fc.id === prevClubId) : undefined
    const genuineAbsorbedName = absorbedFusion?.absorbedClubName ?? fusedClubInfo?.name
    const genuineLeadName = leadFusion?.leadClubName && !isAllianceSyntheticName(leadFusion.leadClubName) ? leadFusion.leadClubName : undefined

    const recordedClubName =
      prevClubPerf?.clubName ??
      previousSeasonArchive?.clubs?.find(club => club.id === prevClubId)?.name ??
      genuineAbsorbedName ??
      genuineLeadName ??
      prevClubObj?.name

    const completedYear = previousSeasonArchive?.year ?? (seasonYear - 1)
    const isLoan = Boolean(p.loanedFromClubId && p.loanedFromClubId !== p.currentClubId)
    const parentClubObj = p.parentClubId ? activeClubsMap.get(p.parentClubId) : undefined
    const parentAbsorbedFusion = p.parentClubId ? options.fusions?.find((f) => f.absorbedClubId === p.parentClubId) : undefined
    const parentFusedClubInfo = p.parentClubId ? clubs.flatMap((c) => c.fusedClubs ?? []).find((fc) => fc.id === p.parentClubId) : undefined
    const recordedParentClubName =
      (p.parentClubId ? previousSeasonArchive?.teamPerformances?.[p.parentClubId]?.clubName : undefined) ??
      previousSeasonArchive?.clubs?.find(club => club.id === p.parentClubId)?.name ??
      parentAbsorbedFusion?.absorbedClubName ?? parentFusedClubInfo?.name ?? parentClubObj?.name

    const playerStats = playerSeasonStats.get(p.id)
    const isStarter = playerStats?.isStarter ?? false
    const matchesPlayed = isStarter ? (previousSeasonArchive?.history?.length ? playerStats!.matchesPlayed : (prevClubPerf?.matchesPlayed ?? 0)) : 0
    const goals = playerStats?.goals ?? 0
    const defensiveStops = playerStats?.defensiveStops ?? 0
    const shots = playerStats?.shots ?? 0
    const shotsMissed = playerStats?.shotsMissed ?? 0

    const seasonRecord: PersonCareerSeason = {
      year: completedYear,
      clubId: prevClubId,
      clubName: recordedClubName,
      role: p.primaryRole,
      age: p.age,
      attack: p.attack,
      defense: p.defense,
      competitionLevel: isStarter && matchesPlayed > 0 ? Math.max(8, ...(previousSeasonArchive?.history ?? [])
        .filter(m => m.homeTeamId === prevClubId || m.awayTeamId === prevClubId)
        .map(m => competitionRating(m.result.matchId.split(':')[0]))) : 1,
      isLoan,
      parentClubId: p.parentClubId,
      parentClubName: recordedParentClubName,
      assignedPosition: p.assignedPosition,
      isStarter,
      matchesPlayed,
      goals,
      defensiveStops,
      shots,
      shotsMissed,
      individualHonors: getPlayerHonors(individualAwards, p.id),
      roundReached: prevClubPerf?.roundReached,
      stageLabel: prevClubPerf?.stageLabel,
      isNationalChampion: isStarter ? prevClubPerf?.isNationalChampion : false,
      isConferenceChampion: isStarter ? prevClubPerf?.isConferenceChampion : false,
      isRegionChampion: isStarter ? prevClubPerf?.isRegionChampion : false,
      isDepartmentChampion: isStarter ? prevClubPerf?.isDepartmentChampion : false,
      conferenceId: prevClubPerf?.conferenceId,
      regionId: prevClubPerf?.regionId,
      departmentId: prevClubPerf?.departmentId,
    }

    const nextCareerHistory = [...(p.careerHistory ?? []), seasonRecord]

    // Probabilité de retraite croissante
    let shouldRetire = false
    if (nextAge >= 38) {
      shouldRetire = true
    } else if (nextAge >= 34) {
      const retireProb = nextAge === 34 ? 0.15 : nextAge === 35 ? 0.35 : nextAge === 36 ? 0.60 : 0.85
      shouldRetire = rng() < retireProb
    }

    if (shouldRetire) {
      updatedPersons.push({
        ...p,
        age: nextAge,
        careerYears: nextCareerYears,
        careerHistory: nextCareerHistory,
        isRetired: true,
        retiredYear: seasonYear,
        lastAgedYear: seasonYear,
        currentClubId: null,
        parentClubId: null,
        loanedFromClubId: undefined,
        assignedPosition: undefined,
      })
      continue
    }

    // Gestion du club d'origine / parent : s'il a été absorbé lors d'une fusion, il rejoint le club fusionné
    let parentClubId = p.parentClubId ?? p.currentClubId
    if (parentClubId && absorbedToMergedMap.has(parentClubId)) {
      parentClubId = absorbedToMergedMap.get(parentClubId)!
    } else if (parentClubId && !activeClubsMap.has(parentClubId)) {
      const absorbingClub = clubs.find(
        (c) =>
          c.fusedClubs?.some((f) => f.id === parentClubId) ||
          c.communeIds?.includes(p.birthCommuneId),
      )
      if (absorbingClub) {
        parentClubId = absorbingClub.id
      } else {
        const birthCommune = communes.find((c) => c.id === p.birthCommuneId)
        parentClubId = birthCommune ? assignClubForCommune(birthCommune, clubs, rng) : null
      }
    }

    // Gestion du currentClubId : le joueur rejoint d'abord son club d'origine / fusionné
    let currentClubId = parentClubId
    if (p.currentClubId && absorbedToMergedMap.has(p.currentClubId)) {
      currentClubId = absorbedToMergedMap.get(p.currentClubId)!
    }

    // Progression ou déclin des attributs selon l'âge et le pic
    const peakAge = p.peakAge ?? (p.age >= 27 ? p.age : 27)
    const peakAttack = p.peakAttack ?? p.attack
    const peakDefense = p.peakDefense ?? p.defense

    const nextAttack = computeStatAtAge(peakAttack, nextAge, peakAge)
    const nextDefense = computeStatAtAge(peakDefense, nextAge, peakAge)

    updatedPersons.push({
      ...p,
      age: nextAge,
      careerYears: nextCareerYears,
      careerHistory: nextCareerHistory,
      parentClubId,
      currentClubId, // Le joueur rejoint le club fusionné / d'origine
      loanedFromClubId: undefined,
      assignedPosition: undefined,
      peakAge,
      peakAttack,
      peakDefense,
      attack: nextAttack,
      defense: nextDefense,
    })
  }

  // 2. Génération de la nouvelle promotion de jeunes talents (16-18 ans)
  // Si newRecruitsCount est spécifié explicitement, on respecte la consigne.
  // Sinon, maintien pérenne d'un vivier d'au moins 300 joueurs actifs au fil des décennies.
  const activeCount = updatedPersons.filter((p) => !p.isRetired).length
  const recruitsNeeded =
    options.newRecruitsCount !== undefined
      ? options.newRecruitsCount
      : Math.max(0, 300 - activeCount)

  if (communes.length > 0 && recruitsNeeded > 0) {
    let totalPop = 0
    const cumulativeWeights: number[] = new Array(communes.length)
    for (let i = 0; i < communes.length; i++) {
      totalPop += Math.max(1, communes[i].population)
      cumulativeWeights[i] = totalPop
    }

    const pickCommune = (): Commune => {
      const target = rng() * totalPop
      let low = 0
      let high = communes.length - 1
      while (low < high) {
        const mid = (low + high) >> 1
        if (cumulativeWeights[mid] <= target) {
          low = mid + 1
        } else {
          high = mid
        }
      }
      return communes[low]
    }

    const existingIds = new Set(persons.map((p) => p.id))
    let nextNum = persons.length + 1

    for (let i = 0; i < recruitsNeeded; i++) {
      while (existingIds.has(`p-${nextNum}`)) {
        nextNum++
      }
      const id = `p-${nextNum}`
      existingIds.add(id)

      const birthCommune = pickCommune()
      const clubId = assignClubForCommune(birthCommune, clubs, rng)

      // Recrues de 16 à 18 ans
      const age = 16 + Math.floor(rng() * 3)
      const peakAge = 24 + Math.floor(rng() * 8)
      const position: PlayerPosition = rng() < 0.5 ? 'ATTACKER' : 'DEFENDER'

      const s1 = samplePlayerStat(rng, true)
      const s2 = samplePlayerStat(rng, false)
      const primaryPeak = Math.max(s1, s2)
      const secondaryPeak = Math.min(s1, s2)

      const peakAttack = position === 'ATTACKER' ? primaryPeak : secondaryPeak
      const peakDefense = position === 'DEFENDER' ? primaryPeak : secondaryPeak

      const attack = computeStatAtAge(peakAttack, age, peakAge)
      const defense = computeStatAtAge(peakDefense, age, peakAge)

      rng() // Conserver la séquence des autres tirages sportifs existants.
      const coachSkill = computeCoachPeakSkill({ position, attack, defense, peakAttack, peakDefense })
      const presidentSkill = Math.min(30, Math.max(1, 4 + Math.floor(Math.pow(rng(), 1.7) * 26)))

      const identity = generateUniqueIdentity(
        `${seed}|identity-v2|${id}`, birthCommune, seasonYear - age, usedNames,
      )

      updatedPersons.push({
        id,
        ...identity,
        age,
        birthCommuneId: birthCommune.id,
        birthCommuneName: birthCommune.name,
        birthDepartmentId: birthCommune.departmentId,
        currentClubId: clubId,
        parentClubId: clubId,
        originClubId: clubId,
        originClubName: clubs.find(c => c.id === clubId)?.name,
        primaryRole: 'PLAYER',
        position,
        peakAge,
        peakAttack,
        peakDefense,
        attack,
        defense,
        coachSkill,
        presidentSkill,
        careerYears: 0,
        careerHistory: [],
        isRetired: false,
      })
    }
  }

  const coachedPersons = assignSeasonCoaches({
    persons: updatedPersons,
    clubs,
    communes,
    seasonYear,
    seed,
    fusions: options.fusions,
    previousSeasonArchive: options.previousSeasonArchive,
  })
  if (options.assignRostersAndLoans !== false) {
    return assignSeasonRostersAndLoans({
      persons: coachedPersons,
      clubs,
      seed: `${seed}|loans-${seasonYear}`,
      fusions: options.fusions,
    })
  }

  return coachedPersons
}

/**
 * Renfloue automatiquement le vivier de joueurs actifs s'il descend sous un seuil critique
 * (par exemple suite à des saisons où les retraites n'étaient pas compensées),
 * en générant de jeunes espoirs (17-21 ans) et en réaffectant les effectifs.
 */
export function replenishActivePersonsPool(options: {
  persons: readonly Person[]
  communes: readonly Commune[]
  clubs: readonly Club[]
  seed: string
  targetActiveCount?: number
  seasonYear?: number
  fusions?: readonly FusionEvent[]
}): Person[] {
  const { persons, communes, clubs, seed, targetActiveCount = 300, fusions, seasonYear = CUP_CONFIG.defaultStartYear } = options
  const activeCount = persons.filter((p) => !p.isRetired).length
  if (activeCount >= targetActiveCount) {
    return assignSeasonRostersAndLoans({ persons, clubs, seed, fusions })
  }

  const rng = createPrng(`${seed}|replenish-active-pool`)
  const needed = targetActiveCount - activeCount
  const updatedPersons = [...persons]
  const usedNames = new Set(persons.map(p => `${p.firstName} ${p.lastName}`))
  const existingIds = new Set(persons.map((p) => p.id))

  let totalPop = 0
  const cumulativeWeights: number[] = new Array(communes.length)
  for (let i = 0; i < communes.length; i++) {
    totalPop += Math.max(1, communes[i].population)
    cumulativeWeights[i] = totalPop
  }

  const pickCommune = (): Commune => {
    const target = rng() * totalPop
    let low = 0
    let high = communes.length - 1
    while (low < high) {
      const mid = (low + high) >> 1
      if (cumulativeWeights[mid] <= target) {
        low = mid + 1
      } else {
        high = mid
      }
    }
    return communes[low]
  }

  let nextNum = persons.length + 1
  for (let i = 0; i < needed; i++) {
    while (existingIds.has(`p-${nextNum}`)) {
      nextNum++
    }
    const id = `p-${nextNum}`
    existingIds.add(id)

    const birthCommune = pickCommune()
    const clubId = assignClubForCommune(birthCommune, clubs, rng)
    const age = 17 + Math.floor(rng() * 5) // 17 à 21 ans
    const peakAge = 24 + Math.floor(rng() * 8)
    const position: PlayerPosition = rng() < 0.5 ? 'ATTACKER' : 'DEFENDER'

    const s1 = samplePlayerStat(rng, true)
    const s2 = samplePlayerStat(rng, false)
    const primaryPeak = Math.max(s1, s2)
    const secondaryPeak = Math.min(s1, s2)

    const peakAttack = position === 'ATTACKER' ? primaryPeak : secondaryPeak
    const peakDefense = position === 'DEFENDER' ? primaryPeak : secondaryPeak

    const attack = computeStatAtAge(peakAttack, age, peakAge)
    const defense = computeStatAtAge(peakDefense, age, peakAge)

    rng() // Conserver la séquence des autres tirages sportifs existants.
    const coachSkill = computeCoachPeakSkill({ position, attack, defense, peakAttack, peakDefense })
    const presidentSkill = Math.min(30, Math.max(1, 4 + Math.floor(Math.pow(rng(), 1.7) * 26)))

    const identity = generateUniqueIdentity(
      `${seed}|identity-v2|${id}`, birthCommune, seasonYear - age, usedNames,
    )

    updatedPersons.push({
      id,
      ...identity,
      age,
      birthCommuneId: birthCommune.id,
      birthCommuneName: birthCommune.name,
      birthDepartmentId: birthCommune.departmentId,
      currentClubId: clubId,
      parentClubId: clubId,
      originClubId: clubId,
      originClubName: clubs.find(c => c.id === clubId)?.name,
      primaryRole: 'PLAYER',
      position,
      peakAge,
      peakAttack,
      peakDefense,
      attack,
      defense,
      coachSkill,
      presidentSkill,
      careerYears: 0,
      careerHistory: [],
      isRetired: false,
    })
  }

  return assignSeasonRostersAndLoans({
    persons: updatedPersons,
    clubs,
    seed: `${seed}|loans-replenish`,
    fusions,
  })
}

/** Les tirages d’identité sont indépendants des tirages de niveau sportif. */
function generateUniqueIdentity(seed: string, commune: Commune, birthYear: number, usedNames: Set<string>) {
  const rng = createPrng(seed)
  const options = { rng, birthYear, birthDepartmentId: commune.departmentId, birthRegionId: commune.regionId }
  let identity = generatePersonName(options)
  for (let attempts = 0; usedNames.has(`${identity.firstName} ${identity.lastName}`) && attempts < 10; attempts++) {
    identity = generatePersonName(options)
  }
  usedNames.add(`${identity.firstName} ${identity.lastName}`)
  return identity
}
