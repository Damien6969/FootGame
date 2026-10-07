import type { Person } from '../persons/types'
import type { Club } from '../teams/types'
import type { FusionEvent, SeasonArchive } from '../storage/cupRepository'
import type { TransferMovement } from './types'
import { createPrng } from '../random/prng'
import { buildAbsorbedToMergedClubMap } from '../persons/rosterAndLoans'
import { selectClubStarters } from '../persons/playerSelection'
import { TRANSFER_BALANCE as BALANCE } from '../../config/transferBalance'
import { computeStatAtAge } from '../persons/careerCurve'
import { getPersonOriginClub } from '../persons/personOrigin'
import { expectedRoundForStrength } from '../coaches/coachRatings'

export type TransferMarketOptions = {
  persons: readonly Person[]
  clubs: readonly Club[]
  seasonYear: number
  seed: string
  previousPersons?: readonly Person[]
  fusions?: readonly FusionEvent[]
  previousSeasonArchive?: SeasonArchive
  rng?: () => number
}

export function applyTransferMarket(options: TransferMarketOptions): { persons: Person[]; movements: TransferMovement[] } {
  const { persons, clubs, previousPersons, seasonYear, fusions, previousSeasonArchive } = options
  const rng = options.rng ?? createPrng(`${options.seed}|transfer-market-${seasonYear}-v2`)
  const clubsById = new Map(clubs.map(c => [c.id, c]))
  const previousById = new Map((previousPersons ?? persons).map(p => [p.id, p]))
  const mergedIds = buildAbsorbedToMergedClubMap(clubs, fusions)
  const resolve = (id: string | null | undefined) => id ? mergedIds.get(id) ?? id : undefined
  const owners = new Map<string, Person[]>()
  for (const p of [...persons].sort((a, b) => a.id.localeCompare(b.id))) {
    if (p.isRetired || p.primaryRole !== 'PLAYER') continue
    const id = resolve(p.parentClubId ?? p.currentClubId)
    if (!id) continue
    const players = owners.get(id) ?? []
    players.push({ ...p, assignedPosition: undefined })
    owners.set(id, players)
  }

  const departures = new Set<string>()
  const arrivals = new Set<string>()
  const updated = new Map<string, Person>()
  const movements: TransferMovement[] = []

  const archive = previousSeasonArchive
  const nationalChampId = resolve(archive?.nationalChampionId)
  const nationalChamp = nationalChampId ? clubsById.get(nationalChampId) : undefined
  const confChampIds = new Set(
    Object.values(archive?.conferenceChampions ?? {})
      .map(id => resolve(id))
      .filter((id): id is string => Boolean(id))
  )
  const confChampClubs = [...confChampIds]
    .map(id => clubsById.get(id))
    .filter((c): c is Club => c !== undefined && c.id !== nationalChampId)

  // Recrutement proactif par le Champion National et les Champions de Conférence :
  // Le champion peut attirer des joueurs déjà titulaires dans d'autres clubs
  // si cela constitue une réelle amélioration ("UP") par rapport à son titulaire actuel,
  // tout en restant cohérent avec sa note globale (probabiliste).
  function tryChampionPoach(championClub: Club, isNational: boolean) {
    const chance = isNational ? BALANCE.championPoachChance : BALANCE.conferenceChampionPoachChance
    if (rng() >= chance || arrivals.has(championClub.id)) return

    const champPlayers = owners.get(championClub.id) ?? []
    const champRoster = selectClubStarters(champPlayers)
    const positions: Array<'ATTACKER' | 'DEFENDER'> = rng() > 0.5 ? ['ATTACKER', 'DEFENDER'] : ['DEFENDER', 'ATTACKER']

    for (const position of positions) {
      const currentStarter = position === 'ATTACKER' ? champRoster.attacker : champRoster.defender
      const currentRating = currentStarter ? playerRating(currentStarter, position) : 0

      const potentialTargets: Array<{ player: Person; owner: Club; rating: number; score: number; distanceKm?: number }> = []

      for (const [ownerId, squad] of owners.entries()) {
        if (ownerId === championClub.id || departures.has(ownerId)) continue
        const owner = clubsById.get(ownerId)
        if (!owner) continue
        const squadRoster = selectClubStarters(squad)
        const targetStarter = position === 'ATTACKER' ? squadRoster.attacker : squadRoster.defender
        if (!targetStarter || updated.has(targetStarter.id) || targetStarter.isRetired || targetStarter.primaryRole !== 'PLAYER') continue
        if (targetStarter.careerYears === 0) continue

        const rating = playerRating(targetStarter, position)
        // Doit représenter une réelle progression par rapport au titulaire actuel
        if (rating < currentRating + BALANCE.championPoachUpgradeMin) continue
        // Cohérence avec la note globale du club champion
        if (rating > championClub.strength + BALANCE.aspirationGap) continue

        const distanceKm = clubDistanceKm(owner, championClub)
        if (!withinSearchArea(rating, owner, championClub, distanceKm)) continue

        const perf = archive?.teamPerformances?.[owner.id]
        const underperf = perf ? Math.max(0, expectedRoundForStrength(owner.strength) - (perf.roundReached ?? 1)) : 0

        const upgradeAmount = rating - currentRating
        const score = upgradeAmount * 2.0 + underperf * 1.5 - ((distanceKm ?? 1000) / 400)
        potentialTargets.push({ player: targetStarter, owner, rating, score, distanceKm })
      }

      if (!potentialTargets.length) continue

      potentialTargets.sort((a, b) => b.score - a.score || a.player.id.localeCompare(b.player.id))
      const shortlist = potentialTargets.slice(0, BALANCE.candidateShortlist)
      const picked = shortlist[Math.floor(rng() * shortlist.length)]

      const p = picked.player
      const owner = picked.owner
      const origin = getPersonOriginClub(p, clubsById)
      const transferred: Person = {
        ...p,
        originClubId: origin?.id,
        originClubName: origin?.name,
        parentClubId: championClub.id,
        currentClubId: championClub.id,
        loanedFromClubId: undefined,
        assignedPosition: undefined,
      }

      updated.set(p.id, transferred)
      departures.add(owner.id)
      arrivals.add(championClub.id)
      owners.set(owner.id, (owners.get(owner.id) ?? []).filter(player => player.id !== p.id))
      owners.set(championClub.id, [...(owners.get(championClub.id) ?? []), transferred])

      movements.push({
        id: `transfer-${seasonYear}-${p.id}`,
        seasonYear,
        kind: 'TRANSFER',
        personId: p.id,
        playerName: `${p.firstName} ${p.lastName}`,
        age: p.age,
        position: p.position,
        rating: picked.rating,
        fromClubId: owner.id,
        fromClubName: owner.name,
        toClubId: championClub.id,
        toClubName: championClub.name,
        distanceKm: picked.distanceKm,
        reason: 'DYNAMICS',
      })

      break
    }
  }

  if (nationalChamp) {
    tryChampionPoach(nationalChamp, true)
  }
  for (const confChamp of confChampClubs) {
    tryChampionPoach(confChamp, false)
  }

  // Mercato standard des joueurs (ambition, place bloquée, prêts prolongés, vétérans, progression)
  const candidates = persons.flatMap(p => {
    if (p.isRetired || p.primaryRole !== 'PLAYER' || p.careerYears === 0 || updated.has(p.id)) return []
    // A newly generated player has no previous-season location and does not enter this market.
    if (previousPersons && !previousById.has(p.id)) return []
    const ownerId = resolve(p.parentClubId ?? p.currentClubId)
    const owner = ownerId ? clubsById.get(ownerId) : undefined
    if (!owner) return []
    const roster = selectClubStarters(owners.get(owner.id) ?? [])
    const starter = p.position === 'ATTACKER' ? roster.attacker : roster.defender
    const isStarter = roster.attacker?.id === p.id || roster.defender?.id === p.id
    const rating = playerRating(p)
    const hasFuture = !isStarter && canBecomeStarterBeforePeak(p, starter)
    const blocked = !isStarter && Boolean(starter) && !hasFuture
    const longLoan = consecutiveAwaySeasons(p, seasonYear) >= BALANCE.longLoanSeasons
    let reason: TransferMovement['reason'] | undefined
    let chance = 0
    const qualify = (eligible: boolean, candidateReason: keyof typeof BALANCE.departureChance) => {
      const value = BALANCE.departureChance[candidateReason]
      if (eligible && value > chance) { reason = candidateReason; chance = value }
    }

    // Les clubs qui sous-performent sportivement augmentent le risque de départ de leurs joueurs
    const perf = archive?.teamPerformances?.[owner.id]
    const underperf = perf ? Math.max(0, expectedRoundForStrength(owner.strength) - (perf.roundReached ?? 1)) : 0
    const standoutGap = underperf >= 2 ? Math.max(2, BALANCE.standoutGap - 1) : BALANCE.standoutGap

    qualify(rating - owner.strength >= standoutGap, 'AMBITION')
    qualify(blocked, 'BLOCKED')
    qualify(!isStarter && longLoan, 'LONG_LOAN')
    qualify(blocked && p.age >= BALANCE.veteranAge, 'VETERAN')
    if (hasFuture && chance > 0) { chance = Math.min(chance, BALANCE.departureChance.DEVELOPMENT); reason = 'DEVELOPMENT' }

    if (underperf > 0 && chance > 0) {
      chance = Math.min(0.85, chance + underperf * 0.05)
    }

    if (!reason || !chance) return []
    const previous = previousById.get(p.id)
    const anchorId = resolve(previous?.currentClubId ?? p.currentClubId)
    // Never silently replace an unknown current location with the place of birth.
    const anchor = anchorId ? clubsById.get(anchorId) : undefined
    return [{ player: p, owner, anchor, rating, chance, reason }]
  }).sort((a, b) => b.chance - a.chance || b.rating - a.rating || a.player.id.localeCompare(b.player.id))

  const sortedClubs = [...clubs].sort((a, b) => a.id.localeCompare(b.id))
  for (const entry of candidates) {
    const { player: p, owner, anchor, rating, chance, reason } = entry
    if (departures.has(owner.id) || updated.has(p.id) || rng() >= chance || !anchor) continue
    const destinations = sortedClubs.flatMap(destination => {
      if (destination.id === owner.id || arrivals.has(destination.id)) return []
      const distanceKm = clubDistanceKm(anchor, destination)
      if (!withinSearchArea(rating, anchor, destination, distanceKm)) return []
      const incumbentRoster = selectClubStarters(owners.get(destination.id) ?? [])
      const incumbent = p.position === 'ATTACKER' ? incumbentRoster.attacker : incumbentRoster.defender
      const destinationPlayers = [...(owners.get(destination.id) ?? []), { ...p, assignedPosition: undefined }]
        .sort((a, b) => a.id.localeCompare(b.id))
      const nextRoster = selectClubStarters(destinationPlayers)
      const nextStarter = p.position === 'ATTACKER' ? nextRoster.attacker : nextRoster.defender
      if (nextStarter?.id !== p.id) return []
      if (reason === 'AMBITION') {
        // Ambition requires a sporting step up, with a reachable club level.
        if (destination.strength <= owner.strength || destination.strength > rating + BALANCE.aspirationGap) return []
      } else if (destination.strength > owner.strength) return []
      const opportunity = incumbent ? 1 : 0
      let score = opportunity + Math.abs(rating - destination.strength) + (distanceKm ?? 2000) / 200

      // Attractivité accrue pour les champions récents (dynamique de club)
      if (destination.id === nationalChampId) {
        score -= 3.0
      } else if (confChampIds.has(destination.id)) {
        score -= 1.5
      }

      return [{ destination, distanceKm, score }]
    }).sort((a, b) => a.score - b.score || a.destination.id.localeCompare(b.destination.id))
    if (!destinations.length) continue
    const shortlist = destinations.slice(0, BALANCE.candidateShortlist)
    // Nearby clubs with a playing opportunity receive more weight, without always winning.
    const weights = shortlist.map(d => 1 / (1 + d.score - shortlist[0].score))
    let roll = rng() * weights.reduce((sum, weight) => sum + weight, 0)
    let index = 0
    while (index < weights.length - 1 && roll >= weights[index]) { roll -= weights[index]; index++ }
    const { destination, distanceKm } = shortlist[index]
    const origin = getPersonOriginClub(p, clubsById)
    const transferred: Person = { ...p, originClubId: origin?.id, originClubName: origin?.name,
      parentClubId: destination.id, currentClubId: destination.id,
      loanedFromClubId: undefined, assignedPosition: undefined }
    updated.set(p.id, transferred)
    departures.add(owner.id)
    arrivals.add(destination.id)
    owners.set(owner.id, (owners.get(owner.id) ?? []).filter(player => player.id !== p.id))
    owners.set(destination.id, [...(owners.get(destination.id) ?? []), transferred])

    let finalReason = reason
    if (reason === 'AMBITION' && (destination.id === nationalChampId || confChampIds.has(destination.id))) {
      finalReason = 'DYNAMICS'
    }

    movements.push({ id: `transfer-${seasonYear}-${p.id}`, seasonYear, kind: 'TRANSFER', personId: p.id,
      playerName: `${p.firstName} ${p.lastName}`, age: p.age, position: p.position, rating,
      fromClubId: owner.id, fromClubName: owner.name, toClubId: destination.id, toClubName: destination.name,
      distanceKm, distanceFromClubName: anchor.id !== owner.id ? anchor.name : undefined, reason: finalReason })
  }
  return { persons: persons.map(p => updated.get(p.id) ?? p), movements: sortMovements(movements) }
}

function playerRating(p: Person, position = p.position): number {
  return position === 'ATTACKER' ? p.attack : p.defense
}

/** Compare les deux trajectoires, plutôt que le potentiel du jeune à une note figée. */
function canBecomeStarterBeforePeak(player: Person, incumbent: Person | null): boolean {
  const peakAge = player.peakAge ?? 27
  if (player.age >= peakAge) return false
  if (!incumbent) return true
  const position = player.position
  const potential = position === 'ATTACKER' ? player.peakAttack ?? player.attack : player.peakDefense ?? player.defense
  const incumbentPotential = position === 'ATTACKER'
    ? incumbent.peakAttack ?? incumbent.attack : incumbent.peakDefense ?? incumbent.defense
  const incumbentPeakAge = incumbent.peakAge ?? (incumbent.age >= 27 ? incumbent.age : 27)
  for (let years = 1; years <= peakAge - player.age; years++) {
    // La retraite à 38 ans est certaine dans la progression annuelle.
    if (incumbent.age + years >= 38) return true
    const nextRating = computeStatAtAge(potential, player.age + years, peakAge)
    const incumbentRating = computeStatAtAge(incumbentPotential, incumbent.age + years, incumbentPeakAge)
    if (nextRating > incumbentRating) return true
  }
  return false
}

function consecutiveAwaySeasons(p: Person, seasonYear: number): number {
  const seasons = [...(p.careerHistory ?? [])].filter(s => s.year < seasonYear).sort((a, b) => b.year - a.year)
  let expectedYear = seasonYear - 1
  let count = 0
  for (const season of seasons) {
    if (season.year !== expectedYear || season.role !== 'PLAYER' || (!season.isLoan && season.isStarter !== false)) break
    count++
    expectedYear--
  }
  return count
}

export function clubDistanceKm(a: Pick<Club, 'coordinates'>, b: Pick<Club, 'coordinates'>): number | undefined {
  if (!a.coordinates || !b.coordinates || ![...a.coordinates, ...b.coordinates].every(Number.isFinite)) return undefined
  const rad = Math.PI / 180
  const [lonA, latA] = a.coordinates
  const [lonB, latB] = b.coordinates
  const h = Math.sin((latB - latA) * rad / 2) ** 2 + Math.cos(latA * rad) * Math.cos(latB * rad) * Math.sin((lonB - lonA) * rad / 2) ** 2
  return 6371 * 2 * Math.asin(Math.sqrt(Math.min(1, h)))
}

export function withinSearchArea(rating: number, from: Pick<Club, 'regionId' | 'conferenceId'>, to: Pick<Club, 'regionId' | 'conferenceId'>, distanceKm?: number): boolean {
  const limits = BALANCE.geography
  if (rating < limits.localRating) return distanceKm !== undefined && distanceKm <= limits.localRadiusKm
  if (rating < limits.regionalRating) return from.regionId === to.regionId
  if (rating < limits.conferenceRating) return from.conferenceId === to.conferenceId
  return true
}

export function sortMovements(movements: readonly TransferMovement[]): TransferMovement[] {
  return [...movements].sort((a, b) => b.rating - a.rating || a.id.localeCompare(b.id))
}

/** Capture les prêts attribués, y compris aux nouvelles recrues, après le mercato définitif. */
export function collectLoanMovements(options: Omit<TransferMarketOptions, 'rng'>): TransferMovement[] {
  const clubsById = new Map(options.clubs.map(c => [c.id, c]))
  const previousById = new Map((options.previousPersons ?? []).map(p => [p.id, p]))
  const mergedIds = buildAbsorbedToMergedClubMap(options.clubs, options.fusions)
  const resolve = (id: string | null | undefined) => id ? mergedIds.get(id) ?? id : undefined
  return sortMovements(options.persons.flatMap(p => {
    if (p.isRetired || p.primaryRole !== 'PLAYER' || !p.loanedFromClubId || p.currentClubId === p.loanedFromClubId) return []
    const ownerId = resolve(p.loanedFromClubId)
    const owner = ownerId ? clubsById.get(ownerId) : undefined
    const destination = p.currentClubId ? clubsById.get(p.currentClubId) : undefined
    if (!owner || !destination) return []
    const previousId = resolve(previousById.get(p.id)?.currentClubId)
    const origin = (previousId ? clubsById.get(previousId) : undefined) ?? owner
    if (origin.id === destination.id) return []
    const position = p.assignedPosition ?? p.position
    return [{ id: `loan-${options.seasonYear}-${p.id}`, seasonYear: options.seasonYear, kind: 'LOAN' as const,
      personId: p.id, playerName: `${p.firstName} ${p.lastName}`, age: p.age, position,
      rating: playerRating(p, position), fromClubId: origin.id, fromClubName: origin.name,
      toClubId: destination.id, toClubName: destination.name, ownerClubId: owner.id, ownerClubName: owner.name,
      distanceKm: clubDistanceKm(origin, destination), reason: 'DEVELOPMENT' as const }]
  }))
}
