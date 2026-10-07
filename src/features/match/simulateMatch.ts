import { PLAYER_BALANCE } from '../../config/playerBalance'
import { computeCoachBonus } from '../coaches/coachRatings'
import { createPrng } from '../random/prng'


export type PlayerMatchInfo = Readonly<{
  id: string
  firstName?: string
  lastName?: string
  name?: string
  attack: number
  defense: number
  position?: string
}>

export type TeamStartersInput = Readonly<{
  attacker?: PlayerMatchInfo | null
  defender?: PlayerMatchInfo | null
}>

export type TeamInput = Readonly<{
  id: string
  name?: string
  population: number
  strength?: number
  baseStrength?: number
  coach?: { skill: number } | null
  starters?: TeamStartersInput | null
}>

type MatchInput = Readonly<{
  matchId: string
  rootSeed: string
  home: TeamInput
  away: TeamInput
  populationBounds: Readonly<{ min: number; max: number }>
  homeStarters?: TeamStartersInput | null
  awayStarters?: TeamStartersInput | null
  playerInfluenceWeight?: number
}>

export type MatchEvent = Readonly<{
  sequence: number
  teamId: string
  kind: 'CHANCE' | 'GOAL'
  /** Absent dans les anciennes sauvegardes. */
  shotOutcome?: 'GOAL' | 'STOPPED' | 'OFF_TARGET'
  actorId?: string
  actorName?: string
  actorRole?: 'ATTACKER' | 'DEFENDER'
  defenderId?: string
  defenderName?: string
  defenderRole?: 'ATTACKER' | 'DEFENDER'
  detail?: string
  isExtraTime?: boolean
}>

export type MatchResult = Readonly<{
  matchId: string
  homeScore: number
  awayScore: number
  winnerId: string
  events: readonly MatchEvent[]
  isExtraTime?: boolean
  regularHomeScore?: number
  regularAwayScore?: number
  homeEffectiveStrength?: number
  awayEffectiveStrength?: number
}>

export function computeStrength(population: number, min: number, max: number) {
  if (max <= min) return 1
  return Math.max(1, 1 + 29 * Math.log(Math.max(min, population) / min) / Math.log(max / min))
}

/**
 * Calcule la force effective d'une équipe en combinant son indice de base (commune / fusion)
 * avec l'apport de ses 2 titulaires actifs (pondération de 40% par défaut, soit 20% par titulaire).
 *
 * Formule asymétrique orientée bonus :
 * - Un joueur supérieur au club apporte un bonus direct proportionnel à l'écart.
 * - Un joueur légèrement inférieur bénéficie d'une marge de tolérance de 3.0 points sans malus.
 * - Tout déficit au-delà de 3.0 points est fortement amorti (à 20%), évitant de pénaliser les grands clubs.
 * - Chaque poste vide coûte 0.5 point, avec 0.5 point supplémentaire si les deux sont vides.
 * - Une influence explicitement nulle désactive tous les ajustements d'effectif.
 */
export function computeEffectiveStrength(
  baseStrength: number,
  starters?: TeamStartersInput | null,
  playerWeight = PLAYER_BALANCE.influenceWeight,
  coachSkill = 0,
): number {
  const coachBonus = coachSkill > 0 ? computeCoachBonus(coachSkill, baseStrength) : 0
  if (playerWeight === 0) return Math.max(1, Math.round((baseStrength + coachBonus) * 10) / 10)
  const { attacker, defender } = starters ?? {}

  const scale = PLAYER_BALANCE.influenceWeight > 0 ? playerWeight / PLAYER_BALANCE.influenceWeight : 1
  const slotWeight = playerWeight / 2
  const starterBase = PLAYER_BALANCE.starterBaseBonus * scale

  const missingPositions = Number(!attacker) + Number(!defender)
  let totalAdjustment = -missingPositions * PLAYER_BALANCE.missingPositionPenalty
  if (missingPositions === 2) totalAdjustment -= PLAYER_BALANCE.emptyRosterExtraPenalty

  if (attacker) {
    const attRating = PLAYER_BALANCE.primaryRatingWeight === 1
      ? attacker.attack
      : attacker.attack * PLAYER_BALANCE.primaryRatingWeight + attacker.defense * (1 - PLAYER_BALANCE.primaryRatingWeight)
    const diff = attRating - baseStrength
    if (diff >= 0) {
      totalAdjustment += starterBase + diff * slotWeight
    } else {
      const deficit = Math.max(0, -diff - PLAYER_BALANCE.deficitTolerance)
      const basePart = Math.max(0, starterBase - (-diff) * 0.10)
      totalAdjustment += basePart - deficit * PLAYER_BALANCE.deficitWeight
    }
  }

  if (defender) {
    const defRating = PLAYER_BALANCE.primaryRatingWeight === 1
      ? defender.defense
      : defender.defense * PLAYER_BALANCE.primaryRatingWeight + defender.attack * (1 - PLAYER_BALANCE.primaryRatingWeight)
    const diff = defRating - baseStrength
    if (diff >= 0) {
      totalAdjustment += starterBase + diff * slotWeight
    } else {
      const deficit = Math.max(0, -diff - PLAYER_BALANCE.deficitTolerance)
      const basePart = Math.max(0, starterBase - (-diff) * 0.10)
      totalAdjustment += basePart - deficit * PLAYER_BALANCE.deficitWeight
    }
  }

  const effective = baseStrength + totalAdjustment + coachBonus
  return Math.max(1, Math.round(effective * 10) / 10)
}

export function isMatchUpset(
  home: TeamInput,
  away: TeamInput,
  result: MatchResult,
): boolean {
  const winner = result.winnerId === home.id ? home : away
  const loser = result.winnerId === home.id ? away : home
  const winnerStrength = result.winnerId === home.id
    ? (result.homeEffectiveStrength ?? winner.strength)
    : (result.awayEffectiveStrength ?? winner.strength)
  const loserStrength = result.winnerId === home.id
    ? (result.awayEffectiveStrength ?? loser.strength)
    : (result.homeEffectiveStrength ?? loser.strength)

  if (winnerStrength !== undefined && loserStrength !== undefined && (loserStrength - winnerStrength) >= 3.5) {
    return true
  }
  if (loser.population >= winner.population * 2.5 && (loser.population - winner.population) >= 3000) {
    return true
  }
  return false
}

function resolvePlayerDisplayName(player: PlayerMatchInfo): string {
  if (player.name) return player.name
  if (player.firstName && player.lastName) return `${player.firstName} ${player.lastName}`
  return player.id
}

// Le collectif garde au moins 10 % des actions, même avec deux stars.
// Une note très inférieure au club réduit fortement la part personnelle.
function selectChancePlayer(
  starters: TeamStartersInput | null | undefined,
  clubStrength: number,
  stat: 'attack' | 'defense',
  roll: number,
): { player: PlayerMatchInfo; role: 'ATTACKER' | 'DEFENDER' } | undefined {
  const primary = stat === 'attack' ? starters?.attacker : starters?.defender
  const secondary = stat === 'attack' ? starters?.defender : starters?.attacker
  const baseline = Math.max(1, clubStrength)
  const primaryShare = primary ? Math.min(0.78, 0.65 * (Math.max(1, primary[stat]) / baseline) ** 2) : 0
  const secondaryShare = secondary ? Math.min(0.12, 0.08 * (Math.max(1, secondary[stat]) / baseline) ** 2) : 0
  if (primary && roll < primaryShare) return { player: primary, role: stat === 'attack' ? 'ATTACKER' : 'DEFENDER' }
  if (secondary && roll < primaryShare + secondaryShare) return { player: secondary, role: stat === 'attack' ? 'DEFENDER' : 'ATTACKER' }
  return undefined
}

export function simulateMatch(input: MatchInput): MatchResult {
  const random = createPrng(`${input.rootSeed}|${input.matchId}|match-v2`)

  const homeBaseStrength = input.home.baseStrength ?? input.home.strength ?? computeStrength(input.home.population, input.populationBounds.min, input.populationBounds.max)
  const awayBaseStrength = input.away.baseStrength ?? input.away.strength ?? computeStrength(input.away.population, input.populationBounds.min, input.populationBounds.max)

  const homeStarters = input.homeStarters ?? input.home.starters
  const awayStarters = input.awayStarters ?? input.away.starters

  const playerWeight = input.playerInfluenceWeight ?? PLAYER_BALANCE.influenceWeight
  const homeStrength = computeEffectiveStrength(homeBaseStrength, homeStarters, playerWeight, input.home.coach?.skill)
  const awayStrength = computeEffectiveStrength(awayBaseStrength, awayStarters, playerWeight, input.away.coach?.skill)

  const homePower = Math.pow(homeStrength, 2.0)
  const awayPower = Math.pow(awayStrength, 2.0)
  const homeChanceProb = homePower / (homePower + awayPower)

  const events: MatchEvent[] = []
  let homeScore = 0
  let awayScore = 0
  let sequence = 0

  const playChance = (isExtra = false) => {
    const isHome = random() < homeChanceProb
    const attackingTeam = isHome ? input.home : input.away
    const defendingTeam = isHome ? input.away : input.home
    const attackingStarters = isHome ? homeStarters : awayStarters
    const defendingStarters = isHome ? awayStarters : homeStarters
    const attackingBase = isHome ? homeBaseStrength : awayBaseStrength
    const defendingBase = isHome ? awayBaseStrength : homeBaseStrength
    const actor = selectChancePlayer(playerWeight === 0 ? undefined : attackingStarters, attackingBase, 'attack', random())
    const defender = selectChancePlayer(playerWeight === 0 ? undefined : defendingStarters, defendingBase, 'defense', random())
    const attackRating = Math.max(1, actor?.player.attack ?? attackingBase)
    const defenseRating = Math.max(1, defender?.player.defense ?? defendingBase)
    // À notes égales : 22 %. La note du tireur affronte celle du défenseur
    // choisi, ou la force du collectif adverse lorsqu'aucun joueur n'intervient.
    const conv = Math.max(0.04, Math.min(0.55, 0.22 * (attackRating / defenseRating) ** 0.65))
    sequence += 1
    const goal = random() < conv
    const stopped = !goal && random() < 0.65

    const actorId = actor?.player.id
    const actorName = actor ? resolvePlayerDisplayName(actor.player) : undefined
    const actorRole = actor?.role
    let defenderId: string | undefined
    let defenderName: string | undefined
    let defenderRole: 'ATTACKER' | 'DEFENDER' | undefined
    let detail: string | undefined

    if (goal) {
      if (actorRole === 'ATTACKER') {
        detail = `But de ${actorName} d'une frappe limpide !`
      } else if (actorRole === 'DEFENDER') {
        detail = `But de ${actorName} sur coup de pied arrêté !`
      } else {
        detail = `But sur une action collective de ${attackingTeam.name ?? 'l\'équipe'}`
      }
      attackingTeam.id === input.home.id ? homeScore += 1 : awayScore += 1
    } else {
      // Un échec peut être un tir non cadré : aucun arrêt n'est alors crédité.
      if (stopped) {
        if (defender) {
          defenderId = defender.player.id
          defenderName = resolvePlayerDisplayName(defender.player)
          defenderRole = defender.role
          detail = actorName
            ? `Tir de ${actorName} stoppé par ${defenderName} !`
            : `Occasion neutralisée par une intervention décisive de ${defenderName}.`
        } else {
          detail = `Occasion repoussée par la défense de ${defendingTeam.name ?? 'l\'adversaire'}.`
        }
      } else {
        detail = actorName
          ? `Tir de ${actorName} qui passe à côté du cadre.`
          : `Occasion non cadrée.`
      }
    }

    events.push({
      sequence,
      teamId: attackingTeam.id,
      kind: goal ? 'GOAL' : 'CHANCE',
      shotOutcome: goal ? 'GOAL' : stopped ? 'STOPPED' : 'OFF_TARGET',
      ...(actorId ? { actorId, actorName, actorRole } : {}),
      ...(defenderId ? { defenderId, defenderName, defenderRole } : {}),
      ...(detail ? { detail } : {}),
      ...(isExtra ? { isExtraTime: true } : {}),
    })
  }

  const chances = 7 + Math.floor(random() * 7)
  for (let index = 0; index < chances; index += 1) playChance()
  const regularHomeScore = homeScore
  const regularAwayScore = awayScore
  let extra = 0
  while (homeScore === awayScore && extra < 100) { playChance(true); extra += 1 }
  if (homeScore === awayScore) homeScore += 1
  const isExtraTime = extra > 0

  return Object.freeze({
    matchId: input.matchId,
    homeScore,
    awayScore,
    winnerId: homeScore > awayScore ? input.home.id : input.away.id,
    events: Object.freeze(events),
    isExtraTime,
    regularHomeScore,
    regularAwayScore,
    homeEffectiveStrength: Math.round(homeStrength * 10) / 10,
    awayEffectiveStrength: Math.round(awayStrength * 10) / 10,
  })
}
