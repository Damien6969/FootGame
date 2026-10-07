import { COACH_BALANCE as B } from '../../config/coachBalance'
import type { Person, PersonCareerSeason } from '../persons/types'
import type { Club } from '../teams/types'
import type { SeasonArchive, FusionEvent } from '../storage/cupRepository'
import { buildAbsorbedToMergedClubMap, applyRostersStrengthToClubs } from '../persons/rosterAndLoans'
import { createPrng } from '../random/prng'
import { computeCoachPeakSkill, computeCoachSkillAtAge, expectedRoundForStrength, getCoachPeakAge, isActiveCoach } from './coachRatings'
import { TRANSFER_BALANCE } from '../../config/transferBalance'
import { clubDistanceKm, withinSearchArea } from '../transfers/transferEngine'
import type { TransferMovement } from '../transfers/types'
import type { Commune } from '../geography/types'
import { getPersonOriginClub } from '../persons/personOrigin'

/** Vieillissement des anciens joueurs ; la retraite sportive reste conservée. */
export function advanceRetiredPerson(person: Person, year: number, archive?: SeasonArchive): Person {
  const referenceYear = person.lastAgedYear ?? person.retiredYear
  if (referenceYear === undefined || referenceYear >= year) return person
  const age = person.age + year - referenceYear
  let history = person.careerHistory ?? []
  const completedYear = archive?.year ?? year - 1
  if (isActiveCoach(person) && !history.some(s => s.year === completedYear)) {
    const perf = archive?.teamPerformances[person.currentClubId!]
    const coachedClub = !perf?.coach || perf.coach.personId === person.id
    const season: PersonCareerSeason = { year: completedYear, clubId: person.currentClubId,
      clubName: perf?.clubName ?? archive?.clubs?.find(c => c.id === person.currentClubId)?.name,
      role: 'COACH', age: person.age, attack: person.attack, defense: person.defense,
      coachSkill: person.coachSkill, coachPeakSkill: person.coachPeakSkill, isStarter: false,
      matchesPlayed: 0, goals: 0, defensiveStops: 0, shots: 0, shotsMissed: 0,
      roundReached: perf?.roundReached, stageLabel: perf?.stageLabel,
      isNationalChampion: coachedClub && Boolean(perf?.isNationalChampion),
      isConferenceChampion: coachedClub && Boolean(perf?.isConferenceChampion),
      isRegionChampion: coachedClub && Boolean(perf?.isRegionChampion),
      isDepartmentChampion: coachedClub && Boolean(perf?.isDepartmentChampion),
      conferenceId: perf?.conferenceId, regionId: perf?.regionId, departmentId: perf?.departmentId }
    history = [...history, season]
  }
  const retired = person.primaryRole === 'COACH' && age >= B.retirementAge
  return { ...person, age, lastAgedYear: year, careerHistory: history,
    careerYears: person.careerYears + (isActiveCoach(person) ? year - referenceYear : 0),
    currentClubId: retired ? null : person.currentClubId,
    coachRetiredYear: retired ? (person.coachRetiredYear ?? year) : person.coachRetiredYear,
    coachSkill: person.coachPeakSkill !== undefined ? computeCoachSkillAtAge(person.coachPeakSkill, age,
      person.coachStartAge ?? age, person.coachPeakAge ?? getCoachPeakAge(person.coachStartAge ?? age)) : person.coachSkill }
}

function countCoachTenure(p: Person, clubId: string, currentYear: number): number {
  const history = [...(p.careerHistory ?? [])]
    .filter(s => s.role === 'COACH')
    .sort((a, b) => b.year - a.year)
  let count = 0
  let expectedYear = currentYear - 1
  for (const season of history) {
    if (season.year !== expectedYear || season.clubId !== clubId) break
    count++
    expectedYear--
  }
  return count
}

/**
 * Vérifie si un entraîneur est interdit d'exercer dans un club donné
 * suite à un limogeage (délai de réflexion de 5 à 10 ans).
 */
export function isCoachBannedFromClub(
  person: Person,
  clubId: string,
  seasonYear: number,
  resolve?: (id: string | null) => string | null,
): boolean {
  if (!person.coachDismissedClubs) return false
  const resolver = resolve ?? ((id: string | null) => id)
  const resolvedTarget = resolver(clubId) ?? clubId
  for (const [bannedClubId, bannedUntil] of Object.entries(person.coachDismissedClubs)) {
    if (!bannedUntil || seasonYear >= bannedUntil) continue
    if (bannedClubId === clubId || (resolver(bannedClubId) ?? bannedClubId) === resolvedTarget) {
      return true
    }
  }
  return false
}

/**
 * Identifie les clubs bénéficiant d'une dynamique sportive positive suite à la saison passée :
 * Champion national, champions de conférence, demi-finalistes/finalistes (Final Four)
 * et clubs ayant réalisé un parcours surprise majeur (quarts de finale ou 2 tours au-delà des attentes).
 */
export function identifyDynamicClubIds(
  archive: SeasonArchive | undefined,
  clubsById: ReadonlyMap<string, Club>,
  resolve: (id: string | null) => string | null,
): Set<string> {
  const dynamicIds = new Set<string>()
  if (!archive) return dynamicIds

  const natChamp = resolve(archive.nationalChampionId ?? null)
  if (natChamp) dynamicIds.add(natChamp)

  for (const confChamp of Object.values(archive.conferenceChampions ?? {})) {
    const resolved = resolve(confChamp)
    if (resolved) dynamicIds.add(resolved)
  }

  for (const f4 of archive.finalFourTeamIds ?? []) {
    const resolved = resolve(f4)
    if (resolved) dynamicIds.add(resolved)
  }

  if (archive.teamPerformances) {
    for (const [teamId, perf] of Object.entries(archive.teamPerformances)) {
      const resolvedId = resolve(teamId)
      if (!resolvedId) continue
      const club = clubsById.get(resolvedId)
      const expected = club ? expectedRoundForStrength(club.strength) : 2
      if ((perf.roundReached ?? 1) >= expected + 2 && (perf.roundReached ?? 1) >= 4) {
        dynamicIds.add(resolvedId)
      }
    }
  }

  return dynamicIds
}

export function assignSeasonCoaches(options: {
  persons: readonly Person[]
  clubs: readonly Club[]
  communes?: readonly Commune[]
  seasonYear: number
  seed: string
  fusions?: readonly FusionEvent[]
  previousSeasonArchive?: SeasonArchive
}): Person[] {
  const { persons, clubs, seasonYear, seed, fusions, previousSeasonArchive } = options
  const rng = createPrng(`${seed}|coaches-${seasonYear}-v2`)
  const clubsById = new Map(clubs.map(c => [c.id, c]))
  const communesById = new Map(options.communes?.map(c => [c.id, c]))
  const merged = buildAbsorbedToMergedClubMap(clubs, fusions)
  const resolve = (id: string | null) => id ? merged.get(id) ?? id : null
  const updated = new Map(persons.map(p => [p.id, p]))
  const occupied = new Set<string>()
  // Localisation avant le mercato : dernier banc, ou dernier club joueur à la retraite.
  // Ne pas remplacer une localisation inconnue par le lieu de naissance.
  const anchors = new Map(persons.map(p => {
    const lastSeason = [...(p.careerHistory ?? [])].filter(s => s.clubId)
      .sort((a, b) => b.year - a.year || Number(b.role === 'COACH') - Number(a.role === 'COACH'))[0]
    const anchorId = resolve(p.currentClubId ?? lastSeason?.clubId ?? null)
    return [p.id, anchorId ? clubsById.get(anchorId) : undefined] as const
  }))
  const isAvailableRetiree = (p: Person) => p.isRetired === true && !p.currentClubId && !p.coachRetiredYear &&
    p.age < B.retirementAge && p.coachDismissedYear !== seasonYear &&
    (p.retiredYear !== undefined || p.lastAgedYear !== undefined)
  const canReachClub = (p: Person, skill: number, club: Club) => {
    const anchor = anchors.get(p.id)
    return !!anchor && withinSearchArea(skill, anchor, club, clubDistanceKm(anchor, club))
  }
  const isNewCoach = (p: Person) => p.primaryRole === 'PLAYER' && p.coachStartedYear === undefined &&
    !(p.careerHistory ?? []).some(s => s.role === 'COACH')
  const canReachBirthCity = (p: Person, skill: number, club: Club) => {
    const birth = communesById.get(p.birthCommuneId)
    return !!birth && withinSearchArea(skill, birth, club, clubDistanceKm(birth, club))
  }
  const movedCoachIds = new Set<string>()

  // Priorité au titulaire du club principal, puis au niveau et à l'identifiant.
  const incumbents = persons.filter(isActiveCoach).sort((a, b) =>
    Number(resolve(a.currentClubId) !== a.currentClubId) - Number(resolve(b.currentClubId) !== b.currentClubId) ||
    (b.coachSkill ?? 0) - (a.coachSkill ?? 0) || a.id.localeCompare(b.id))
  for (const p of incumbents) {
    const id = resolve(p.currentClubId)
    if (id && clubsById.has(id) && !occupied.has(id) && !isCoachBannedFromClub(p, id, seasonYear, resolve)) {
      occupied.add(id)
      updated.set(p.id, { ...p, currentClubId: id })
    } else updated.set(p.id, { ...p, currentClubId: null })
  }

  const clubRatings = new Map(applyRostersStrengthToClubs(clubs, persons.filter(p => p.primaryRole === 'PLAYER'))
    .map(c => [c.id, c.strength]))

  // Limogeages d'entraîneurs : modérés, environ 5 par saison
  // Touche les sous-performances des gros clubs mais aussi les petits clubs (usure du pouvoir et turnover)
  const incumbentsWithClubs = incumbents.filter(p => updated.get(p.id)?.currentClubId)
  const dismissedCoachIds = new Set<string>()
  const maxPossibleDismissals = Math.max(0, incumbentsWithClubs.length - 1)
  const targetDismissals = Math.min(
    maxPossibleDismissals,
    Math.max(1, Math.round(B.targetDismissalsPerSeason + (rng() - 0.5) * 2))
  )

  if (targetDismissals > 0 && incumbentsWithClubs.length > 1) {
    const scoredIncumbents = incumbentsWithClubs.map(original => {
      const p = updated.get(original.id)!
      const clubId = p.currentClubId!
      const owner = clubsById.get(clubId)
      const clubRating = clubRatings.get(clubId) ?? owner?.strength ?? 10
      const perf = previousSeasonArchive?.teamPerformances?.[clubId]

      // 1. Sous-performance sportive par rapport au standing
      const expRound = expectedRoundForStrength(clubRating)
      const roundReached = perf?.roundReached ?? 1
      const perfDeficit = Math.max(0, expRound - roundReached)

      // 2. Ancienneté et routine (usure du pouvoir pour tous les clubs)
      const tenure = countCoachTenure(p, clubId, seasonYear)
      const tenureFatigue = Math.max(0, tenure - B.dismissalTenureThreshold) * 1.5

      // 3. Facteur aléatoire de turnover naturel ("changer juste pour changer")
      const turnoverNoise = rng() * 4.0

      const dismissalScore = perfDeficit * 2.5 + tenureFatigue + turnoverNoise
      return { coach: p, clubId, dismissalScore }
    }).sort((a, b) => b.dismissalScore - a.dismissalScore || a.coach.id.localeCompare(b.coach.id))

    for (const item of scoredIncumbents.slice(0, targetDismissals)) {
      const currentPerson = updated.get(item.coach.id) ?? item.coach
      dismissedCoachIds.add(currentPerson.id)
      occupied.delete(item.clubId)
      // Suspension de 5 à 10 ans (inclus) interdisant au club de réembaucher l'entraîneur limogé
      const cooldownYears = 5 + Math.floor(rng() * 6)
      const bannedUntilYear = seasonYear + cooldownYears
      const existingDismissedClubs = currentPerson.coachDismissedClubs ?? {}
      const resolvedClubId = resolve(item.clubId) ?? item.clubId
      const coachDismissedClubs: Record<string, number> = {
        ...existingDismissedClubs,
        [item.clubId]: Math.max(existingDismissedClubs[item.clubId] ?? 0, bannedUntilYear),
        [resolvedClubId]: Math.max(existingDismissedClubs[resolvedClubId] ?? 0, bannedUntilYear),
      }
      updated.set(currentPerson.id, {
        ...currentPerson,
        currentClubId: null,
        coachDismissedYear: seasonYear,
        coachDismissedClubs,
      })
    }
  }

  const dynamicClubIds = identifyDynamicClubIds(previousSeasonArchive, clubsById, resolve)

  // Dynamique sportive : un club ayant réalisé une grosse performance la saison passée
  // (Champion national, champion de conférence, Final Four ou parcours héroïque)
  // peut attirer un entraîneur plus fort sur son banc.
  const dynamicClubs = clubs.filter(c => dynamicClubIds.has(c.id)).sort((a, b) => {
    const isNatA = a.id === resolve(previousSeasonArchive?.nationalChampionId ?? null)
    const isNatB = b.id === resolve(previousSeasonArchive?.nationalChampionId ?? null)
    return Number(isNatB) - Number(isNatA) || b.strength - a.strength || a.id.localeCompare(b.id)
  })

  for (const dynClub of dynamicClubs) {
    const currentCoach = [...updated.values()].find(p => isActiveCoach(p) && p.currentClubId === dynClub.id)
    const currentSkill = currentCoach?.coachSkill ?? 0
    if (currentSkill >= 26) continue

    const isNatChamp = dynClub.id === resolve(previousSeasonArchive?.nationalChampionId ?? null)
    const isConfChamp = Object.values(previousSeasonArchive?.conferenceChampions ?? {})
      .map(id => resolve(id))
      .includes(dynClub.id)
    const chance = isNatChamp
      ? TRANSFER_BALANCE.championPoachChance
      : isConfChamp
        ? TRANSFER_BALANCE.conferenceChampionPoachChance
        : 0.20
    if (rng() >= chance) continue

    const potentialTargets: Array<{
      coach: Person
      owner?: Club
      rating: number
      score: number
      distanceKm?: number
    }> = []

    for (const p of updated.values()) {
      if (dismissedCoachIds.has(p.id)) continue
      if (movedCoachIds.has(p.id)) continue
      if (p.currentClubId === dynClub.id) continue
      if (isCoachBannedFromClub(p, dynClub.id, seasonYear, resolve)) continue

      const owner = p.currentClubId ? clubsById.get(p.currentClubId) : undefined

      if (owner) {
        if (!isActiveCoach(p)) continue
        if (dynamicClubIds.has(owner.id)) continue
        if (owner.strength > dynClub.strength + 2.0) continue
        const rating = p.coachSkill ?? 1
        const maxAttainableSkill = isNatChamp ? 28 : Math.max(dynClub.strength + 6, 24)
        if (rating < currentSkill + TRANSFER_BALANCE.championPoachUpgradeMin) continue
        if (rating > maxAttainableSkill) continue
        const dist = clubDistanceKm(owner, dynClub)
        if (!canReachClub(p, rating, dynClub)) continue

        const upgradeAmount = rating - currentSkill
        const score = upgradeAmount * 2.0 - ((dist ?? 1000) / 400)
        potentialTargets.push({ coach: p, owner, rating, score, distanceKm: dist })
      } else if (isAvailableRetiree(p) && !isNewCoach(p)) {
        const startAge = p.coachStartAge ?? p.age
        const peakAge = p.coachPeakAge ?? getCoachPeakAge(startAge)
        const peak = p.coachPeakSkill ?? computeCoachPeakSkill(p)
        const skill = computeCoachSkillAtAge(peak, p.age, startAge, peakAge)
        const maxAttainableSkill = isNatChamp ? 28 : Math.max(dynClub.strength + 6, 24)
        if (skill < currentSkill + TRANSFER_BALANCE.championPoachUpgradeMin) continue
        if (skill > maxAttainableSkill) continue
        if (!canReachClub(p, skill, dynClub)) continue

        const upgradeAmount = skill - currentSkill
        const score = upgradeAmount * 2.0 + 1.0
        potentialTargets.push({ coach: p, rating: skill, score })
      }
    }

    if (!potentialTargets.length) continue

    potentialTargets.sort((a, b) => b.score - a.score || a.coach.id.localeCompare(b.coach.id))
    const shortlist = potentialTargets.slice(0, TRANSFER_BALANCE.candidateShortlist)
    const picked = shortlist[Math.floor(rng() * shortlist.length)]
    movedCoachIds.add(picked.coach.id)

    // Libération de l'ancien banc de l'entraîneur recruté
    if (picked.owner) {
      occupied.delete(picked.owner.id)
    }

    // Libération de l'ancien entraîneur s'il existait (qui devient sans club)
    if (currentCoach) {
      updated.set(currentCoach.id, { ...currentCoach, currentClubId: null })
      occupied.delete(dynClub.id)
    }

    occupied.add(dynClub.id)
    const startAge = picked.coach.coachStartAge ?? picked.coach.age
    const peakAge = picked.coach.coachPeakAge ?? getCoachPeakAge(startAge)
    const peak = picked.coach.coachPeakSkill ?? computeCoachPeakSkill(picked.coach)
    updated.set(picked.coach.id, {
      ...picked.coach,
      primaryRole: 'COACH',
      currentClubId: dynClub.id,
      parentClubId: null,
      loanedFromClubId: undefined,
      assignedPosition: undefined,
      coachSkill: picked.rating,
      coachPeakSkill: peak,
      coachStartAge: startAge,
      coachPeakAge: peakAge,
      coachStartedYear: picked.coach.coachStartedYear ?? seasonYear,
      lastAgedYear: seasonYear,
      coachDismissedYear: undefined,
    })
  }

  // Opportunités : un entraîneur en poste peut chercher un projet plus intéressant sur les bancs vacants
  const arrived = new Set<string>()
  for (const original of incumbents) {
    const p = updated.get(original.id)!
    if (dismissedCoachIds.has(p.id)) continue
    if (movedCoachIds.has(p.id)) continue
    const owner = p.currentClubId ? clubsById.get(p.currentClubId) : undefined
    const rating = p.coachSkill ?? 1
    const ownerRating = owner ? (clubRatings.get(owner.id) ?? owner.strength) : 0
    const ownerStrength = owner ? owner.strength : 0
    const ownerBase = owner ? (owner.baseStrength ?? owner.strength) : 0
    if (!owner || arrived.has(owner.id)) continue
    if (rating - ownerRating < TRANSFER_BALANCE.standoutGap && rating - ownerStrength < TRANSFER_BALANCE.standoutGap) continue
    if (rng() >= TRANSFER_BALANCE.departureChance.AMBITION) continue

    const destinations = clubs.filter(c => {
      if (occupied.has(c.id) || c.id === owner.id) return false
      const cRating = clubRatings.get(c.id) ?? c.strength
      const cBase = c.baseStrength ?? c.strength
      const isDyn = dynamicClubIds.has(c.id)

      // 1. Le club de destination doit être STRICTEMENT PLUS FORT que le club actuel,
      //    OU bénéficier d'une grosse performance la saison passée (dynamique sportive attractive)
      if (!isDyn) {
        if (c.strength <= ownerStrength) return false
        if (cBase < ownerBase) return false
        if (cRating <= ownerRating) return false
        if (c.strength < ownerStrength + 1.0) return false
      } else {
        if (c.strength < ownerStrength - 1.5) return false
      }

      // 2. Un entraîneur de haut niveau (gros entraîneur) ne part jamais dans un club faible :
      //    (sauf dynamique sportive avérée du club)
      if (rating >= 20 && c.strength < 17 && !isDyn) return false

      // 3. Plafond d'aspiration du club par rapport au niveau du coach (bonus de tolérance pour dynamique)
      const aspGap = isDyn ? TRANSFER_BALANCE.aspirationGap + 2.0 : TRANSFER_BALANCE.aspirationGap
      if (cRating > rating + aspGap || c.strength > rating + aspGap) return false

      // 4. Zone géographique et exclusions (limogeage récent de 5 à 10 ans)
      if (!canReachClub(p, rating, c)) return false
      if (isCoachBannedFromClub(p, c.id, seasonYear, resolve)) return false

      return true
    })
      .sort((a, b) => {
        const dynBonusA = dynamicClubIds.has(a.id) ? (a.id === resolve(previousSeasonArchive?.nationalChampionId ?? null) ? 3.0 : 1.5) : 0
        const dynBonusB = dynamicClubIds.has(b.id) ? (b.id === resolve(previousSeasonArchive?.nationalChampionId ?? null) ? 3.0 : 1.5) : 0
        const diffA = Math.abs(rating - (clubRatings.get(a.id) ?? a.strength)) - dynBonusA
        const diffB = Math.abs(rating - (clubRatings.get(b.id) ?? b.strength)) - dynBonusB
        return diffA - diffB || a.id.localeCompare(b.id)
      })
      .slice(0, TRANSFER_BALANCE.candidateShortlist)
    if (!destinations.length) continue
    const destination = destinations[Math.floor(rng() * destinations.length)]
    occupied.delete(owner.id)
    occupied.add(destination.id)
    arrived.add(destination.id)
    updated.set(p.id, { ...p, currentClubId: destination.id, coachDismissedYear: undefined })
  }

  // Recrutement sur les bancs encore vacants parmi les sans-club et nouveaux retraités
  const candidates = [...updated.values()].filter(isAvailableRetiree)
    .sort((a, b) => computeCoachPeakSkill(b) - computeCoachPeakSkill(a) || a.id.localeCompare(b.id))
  const sortedClubs = [...clubs].sort((a, b) => a.id.localeCompare(b.id))
  for (const p of candidates) {
    if (occupied.size === clubs.length && !isNewCoach(p)) continue
    const history = (p.careerHistory ?? []).filter(s => s.role === 'PLAYER' && s.clubId).sort((a, b) => b.year - a.year)
    const lastClubId = resolve(history[0]?.clubId ?? null)
    const former = new Set(history.map(s => resolve(s.clubId)))
    const startAge = p.coachStartAge ?? p.age
    const peakAge = p.coachPeakAge ?? getCoachPeakAge(startAge)
    const peak = p.coachPeakSkill ?? computeCoachPeakSkill(p)
    const skill = computeCoachSkillAtAge(peak, p.age, startAge, peakAge)
    const newCoach = isNewCoach(p)
    const originId = resolve(getPersonOriginClub(p)?.id ?? null)
    const yearsByClub = new Map<string | null, Set<number>>()
    for (const season of history) {
      const id = resolve(season.clubId)
      const years = yearsByClub.get(id) ?? new Set<number>()
      years.add(season.year)
      yearsByClub.set(id, years)
    }
    const availableClubs = sortedClubs.filter(c => {
      if (isCoachBannedFromClub(p, c.id, seasonYear, resolve)) return false
      if (newCoach && Math.abs(skill - c.strength) > B.newCoachMaxClubGap) return false
      const reachable = canReachClub(p, skill, c) ||
        (newCoach && !former.has(c.id) && canReachBirthCity(p, skill, c))
      if (!reachable) return false
      if (!occupied.has(c.id)) return true
      if (!newCoach || c.id !== lastClubId) return false
      const coach = [...updated.values()].find(coach => isActiveCoach(coach) && coach.currentClubId === c.id)
      return !!coach && skill > (coach.coachSkill ?? 0)
    })
    const groups = [
      { weight: B.destinationWeights.lastClub, clubs: availableClubs.filter(c => c.id === lastClubId) },
      { weight: B.destinationWeights.formerClub, clubs: availableClubs.filter(c => c.id !== lastClubId && former.has(c.id)) },
      { weight: B.destinationWeights.other, clubs: availableClubs.filter(c => !former.has(c.id)) },
    ].filter(g => g.clubs.length)
    if (!groups.length) continue
    let categoryDraw = rng() * groups.reduce((sum, g) => sum + g.weight, 0)
    const group = groups.find(g => (categoryDraw -= g.weight) < 0) ?? groups.at(-1)!
    const weighted = group.clubs.map(c => {
      const dynBonus = dynamicClubIds.has(c.id) ? 2.0 : 0
      const attachment = newCoach && c.id !== lastClubId && former.has(c.id)
        ? (yearsByClub.get(c.id)?.size ?? 1) * (c.id === originId ? B.originClubWeight : 1) : 1
      const rating = newCoach ? c.strength : (clubRatings.get(c.id) ?? c.strength)
      return { club: c, weight: attachment * ((1 / (1 + Math.abs(skill - rating))) + dynBonus) }
    })
    let draw = rng() * weighted.reduce((sum, c) => sum + c.weight, 0)
    const destination = (weighted.find(c => (draw -= c.weight) < 0) ?? weighted.at(-1)!).club
    const replaced = newCoach && occupied.has(destination.id)
      ? [...updated.values()].find(coach => isActiveCoach(coach) && coach.currentClubId === destination.id) : undefined
    if (replaced) {
      const bannedUntil = seasonYear + 5 + Math.floor(rng() * 6)
      updated.set(replaced.id, { ...replaced, currentClubId: null, coachDismissedYear: seasonYear,
        coachDismissedClubs: { ...replaced.coachDismissedClubs, [destination.id]: bannedUntil } })
    }
    occupied.add(destination.id)
    updated.set(p.id, { ...p, primaryRole: 'COACH', currentClubId: destination.id, parentClubId: null,
      loanedFromClubId: undefined, assignedPosition: undefined, coachSkill: skill, coachPeakSkill: peak,
      coachStartAge: startAge, coachPeakAge: peakAge, coachStartedYear: p.coachStartedYear ?? seasonYear,
      lastAgedYear: seasonYear, coachDismissedYear: undefined })
  }
  return persons.map(p => updated.get(p.id)!)
}

/** Nominations, transferts et limogeages partagent le relevé du mercato ; jamais de prêts. */
export function collectCoachMovements(options: { persons: readonly Person[]; previousPersons?: readonly Person[];
  clubs: readonly Club[]; seasonYear: number; fusions?: readonly FusionEvent[]; previousSeasonArchive?: SeasonArchive }): TransferMovement[] {
  const { persons, previousPersons = [], clubs, seasonYear, fusions, previousSeasonArchive } = options
  const previous = new Map(previousPersons.map(p => [p.id, p]))
  const byId = new Map(clubs.map(c => [c.id, c]))
  const merged = buildAbsorbedToMergedClubMap(clubs, fusions)
  const resolve = (id: string | null | undefined) => id ? merged.get(id) ?? id : null
  const dynamicClubIds = identifyDynamicClubIds(previousSeasonArchive, byId, (id) => id ? merged.get(id) ?? id : null)

  const movements: TransferMovement[] = []

  // 1. Entraîneurs en poste ou nouvellement nommés
  for (const p of persons.filter(isActiveCoach)) {
    const old = previous.get(p.id)
    const formerId = old?.primaryRole === 'COACH' ? old.currentClubId : null
    const fromId = formerId ? resolve(formerId) : null
    if (fromId === p.currentClubId) continue
    const destination = byId.get(p.currentClubId!)
    if (!destination) continue
    const origin = fromId ? byId.get(fromId) : undefined

    const isStepUp = Boolean(origin && destination.strength > origin.strength)
    const isDynamic = dynamicClubIds.has(destination.id)
    const reason = isDynamic && (origin || old?.primaryRole === 'COACH' || (p.coachSkill ?? 0) >= destination.strength)
      ? 'DYNAMICS' as const
      : origin
        ? (isStepUp ? 'OPPORTUNITY' as const : 'FREE_AGENT' as const)
        : old?.primaryRole === 'COACH' ? 'FREE_AGENT' as const : 'RECONVERSION' as const

    movements.push({
      id: `coach-${seasonYear}-${p.id}`,
      seasonYear,
      kind: 'TRANSFER' as const,
      role: 'COACH' as const,
      personId: p.id,
      playerName: `${p.firstName} ${p.lastName}`,
      age: p.age,
      position: p.position,
      rating: p.coachSkill ?? 1,
      fromClubId: origin?.id ?? 'free-agent',
      fromClubName: origin?.name ?? 'Sans club',
      toClubId: destination.id,
      toClubName: destination.name,
      distanceKm: origin ? clubDistanceKm(origin, destination) : undefined,
      reason,
    })
  }

  // 2. Entraîneurs limogés (remerciés et désormais sans club)
  for (const p of persons) {
    if (p.primaryRole !== 'COACH' || p.currentClubId || p.coachRetiredYear || p.age >= B.retirementAge) continue
    if (p.coachDismissedYear !== seasonYear) continue
    const old = previous.get(p.id)
    const formerId = old?.currentClubId ?? (p.careerHistory && p.careerHistory.length > 0 ? p.careerHistory[p.careerHistory.length - 1]?.clubId : null)
    const resolvedFormerId = formerId ? resolve(formerId) : null
    const formerClub = resolvedFormerId ? byId.get(resolvedFormerId) : undefined
    if (!formerClub) continue
    movements.push({
      id: `coach-dismissal-${seasonYear}-${p.id}`,
      seasonYear,
      kind: 'TRANSFER' as const,
      role: 'COACH' as const,
      personId: p.id,
      playerName: `${p.firstName} ${p.lastName}`,
      age: p.age,
      position: p.position,
      rating: p.coachSkill ?? 1,
      fromClubId: formerClub.id,
      fromClubName: formerClub.name,
      toClubId: 'free-agent',
      toClubName: 'Sans club',
      reason: 'LIMOGEAGE' as const,
    })
  }

  return movements
}
