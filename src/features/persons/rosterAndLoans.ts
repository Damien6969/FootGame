import { createPrng } from '../random/prng'
import type { Person, PlayerPosition } from './types'
import type { Club } from '../teams/types'
import type { FusionEvent } from '../storage/cupRepository'
import { computeEffectiveStrength } from '../match/simulateMatch'
import { getClubActiveStarters } from './personSelectors'
import { selectClubStarters } from './playerSelection'
import { PLAYER_BALANCE } from '../../config/playerBalance'
import { coachSnapshot, isActiveCoach } from '../coaches/coachRatings'
export { selectClubStarters } from './playerSelection'
export type { ClubStarters } from './playerSelection'

/**
 * Calcule une distance approximative en degrés entre deux coordonnées [lon, lat].
 */
function coordDistDeg(a?: readonly [number, number], b?: readonly [number, number]): number {
  if (!a || !b) return 999
  const dx = a[0] - b[0]
  const dy = a[1] - b[1]
  return Math.sqrt(dx * dx + dy * dy)
}

/**
 * Construit une table de correspondance pour rediriger n'importe quel club absorbé
 * (directement ou par fusions successives) vers le club actif fusionné correspondant.
 */
export function buildAbsorbedToMergedClubMap(
  clubs: readonly Club[],
  fusions?: readonly FusionEvent[],
): Map<string, string> {
  const directMap = new Map<string, string>()

  // 1. Depuis les événements de fusions récents
  if (fusions) {
    for (const f of fusions) {
      if (f.absorbedClubId && f.mergedClubId) {
        directMap.set(f.absorbedClubId, f.mergedClubId)
      }
    }
  }

  // 2. Depuis les fusedClubs enregistrés sur chaque club actif
  for (const c of clubs) {
    if (c.fusedClubs) {
      for (const fc of c.fusedClubs) {
        directMap.set(fc.id, c.id)
      }
    }
  }

  // 3. Depuis les communeIds multiples d'un club fusionné
  const activeIds = new Set(clubs.map((c) => c.id))
  for (const c of clubs) {
    if (c.communeIds && c.communeIds.length > 1) {
      for (const cId of c.communeIds) {
        if (!activeIds.has(cId) && cId !== c.communeId) {
          directMap.set(cId, c.id)
        }
      }
    }
  }

  // 4. Résolution des fusions en chaîne (si B -> A et A -> C, alors B -> C)
  const resolvedMap = new Map<string, string>()

  for (const [absorbedId, initialMergedId] of directMap.entries()) {
    let current = initialMergedId
    const visited = new Set<string>([absorbedId])
    while (directMap.has(current) && !activeIds.has(current) && !visited.has(current)) {
      visited.add(current)
      current = directMap.get(current)!
    }
    resolvedMap.set(absorbedId, current)
  }

  return resolvedMap
}

export type AssignRostersOptions = {
  persons: readonly Person[]
  clubs: readonly Club[]
  seed: string
  fusions?: readonly FusionEvent[]
}

/**
 * Moteur de composition d'effectif et de prêt inter-clubs :
 * 1. Retourne tous les joueurs prêtés à leur club d'origine (parentClubId).
 * 2. Chaque club sélectionne ses 2 meilleurs titulaires (1 Attaquant, 1 Défenseur).
 * 3. Les clubs les plus forts (en poids/force) redistribuent leurs joueurs en surplus
 *    sous forme de prêts vers les clubs ayant des postes vacants, en privilégiant
 *    la proximité géographique et l'adéquation de niveau (notes sur 30).
 */
export function assignSeasonRostersAndLoans(options: AssignRostersOptions): Person[] {
  const { persons, clubs, seed, fusions } = options
  const rng = createPrng(`${seed}|loans-engine-v1`)

  // Indexation des clubs actifs
  const clubsMap = new Map<string, Club>()
  for (const c of clubs) {
    clubsMap.set(c.id, c)
  }

  // Table de redirection des clubs absorbés vers les clubs fusionnés actifs
  const absorbedToMergedMap = buildAbsorbedToMergedClubMap(clubs, fusions)

  // 1. Réinitialisation des prêts précédents : retour au club d'origine (ou fusionné s'il a été absorbé)
  const resetPersons: Person[] = persons.map((p) => {
    if (p.isRetired) return p
    let parentId = p.parentClubId ?? p.currentClubId
    if (parentId && absorbedToMergedMap.has(parentId)) {
      parentId = absorbedToMergedMap.get(parentId)!
    } else if (parentId && !clubsMap.has(parentId)) {
      // Si le club n'est pas actif, chercher le club fusionné repreneur
      const absorbing = clubs.find(
        (c) => c.fusedClubs?.some((f) => f.id === parentId) || c.communeIds?.includes(p.birthCommuneId),
      )
      if (absorbing) parentId = absorbing.id
    }

    return {
      ...p,
      parentClubId: parentId,
      currentClubId: parentId,
      loanedFromClubId: undefined,
      assignedPosition: undefined,
    }
  })

  // 2. Regroupement des joueurs par club d'origine
  const contractedByClub = new Map<string, Person[]>()
  for (const p of resetPersons) {
    if (p.isRetired || !p.parentClubId) continue
    const list = contractedByClub.get(p.parentClubId) ?? []
    list.push(p)
    contractedByClub.set(p.parentClubId, list)
  }

  // Structure de gestion des 2 postes par club : Attaquant & Défenseur
  const clubSlots = new Map<
    string,
    {
      attacker: Person | null
      defender: Person | null
    }
  >()

  // Tous les clubs actifs démarrent avec leurs slots
  for (const c of clubs) {
    clubSlots.set(c.id, { attacker: null, defender: null })
  }

  // Liste globale des joueurs en surplus par club prêteur
  const surplusByLender: Array<{ lenderClub: Club; surplus: Person[] }> = []
  const allUpdatedMap = new Map<string, Person>()

  // Ajouter les retraités directement
  for (const p of resetPersons) {
    if (p.isRetired) {
      allUpdatedMap.set(p.id, p)
    }
  }

  // Sélection des titulaires pour chaque club possédant des joueurs
  for (const [clubId, players] of contractedByClub.entries()) {
    const club = clubsMap.get(clubId)
    if (!club) {
      // Club non actif (fusionné ou disparu) : tous les joueurs deviennent éligibles au prêt
      continue
    }

    const { attacker, defender, surplusPlayers } = selectClubStarters(players)
    clubSlots.set(clubId, { attacker, defender })

    if (attacker) allUpdatedMap.set(attacker.id, attacker)
    if (defender) allUpdatedMap.set(defender.id, defender)

    if (surplusPlayers.length > 0) {
      // Trier les joueurs en surplus du meilleur au moins bon pour prêter les talents d'abord
      surplusPlayers.sort((a, b) => Math.max(b.attack, b.defense) - Math.max(a.attack, a.defense))
      surplusByLender.push({ lenderClub: club, surplus: surplusPlayers })
    }
  }

  // Trier les clubs prêteurs du plus fort au moins fort ("partir des meilleures équipes en poids jusqu'à la moins bonne")
  surplusByLender.sort(
    (a, b) =>
      (b.lenderClub.strength ?? b.lenderClub.population) -
      (a.lenderClub.strength ?? a.lenderClub.population),
  )

  // 3. Attribution des prêts vers les clubs ayant des postes vacants
  for (const { lenderClub, surplus } of surplusByLender) {
    for (const player of surplus) {
      // Déterminer le poste naturel pour lequel ce joueur postule
      const prefersAttack =
        player.position === 'ATTACKER'
          ? player.attack >= player.defense - 2
          : player.attack > player.defense + 2
      const primarySlot: PlayerPosition = prefersAttack ? 'ATTACKER' : 'DEFENDER'
      const secondarySlot: PlayerPosition = prefersAttack ? 'DEFENDER' : 'ATTACKER'
      const playerStat = prefersAttack ? player.attack : player.defense

      // Trouver les clubs candidats ayant un poste vacant
      // 1. On cherche d'abord les clubs ayant le poste primaire vacant
      let candidateClubs: Array<{ club: Club; slot: PlayerPosition }> = []

      for (const candidate of clubs) {
        if (candidate.id === lenderClub.id) continue // Pas de prêt à soi-même
        const slots = clubSlots.get(candidate.id)
        if (!slots) continue

        if (primarySlot === 'ATTACKER' && !slots.attacker) {
          candidateClubs.push({ club: candidate, slot: 'ATTACKER' })
        } else if (primarySlot === 'DEFENDER' && !slots.defender) {
          candidateClubs.push({ club: candidate, slot: 'DEFENDER' })
        }
      }

      // 2. Si aucun club ne cherche le poste primaire, on regarde le poste secondaire
      if (candidateClubs.length === 0) {
        for (const candidate of clubs) {
          if (candidate.id === lenderClub.id) continue
          const slots = clubSlots.get(candidate.id)
          if (!slots) continue

          if (secondarySlot === 'ATTACKER' && !slots.attacker) {
            candidateClubs.push({ club: candidate, slot: 'ATTACKER' })
          } else if (secondarySlot === 'DEFENDER' && !slots.defender) {
            candidateClubs.push({ club: candidate, slot: 'DEFENDER' })
          }
        }
      }

      // Si aucun club candidat n'a de place, le joueur reste en réserve dans son club parent (non titulaire)
      if (candidateClubs.length === 0) {
        allUpdatedMap.set(player.id, {
          ...player,
          currentClubId: lenderClub.id,
          loanedFromClubId: undefined,
          assignedPosition: undefined,
        })
        continue
      }

      // Évaluer le coût de chaque candidat :
      // - Différence de niveau : |playerStat - candidate.strength| (tous deux sur échelle 0-30)
      // - Proximité géographique : distance en degrés (1 deg ≈ 111 km)
      // - Bonus de même département
      // - Variance aléatoire contrôlée
      let bestCandidate = candidateClubs[0]
      let minCost = Infinity

      for (const entry of candidateClubs) {
        const dest = entry.club
        const levelDiff = Math.abs(playerStat - (dest.strength ?? 15))
        const distDeg = coordDistDeg(lenderClub.coordinates, dest.coordinates)
        const sameDept = lenderClub.departmentId === dest.departmentId ? -2.0 : 0
        const variance = (rng() - 0.5) * 2.5 // variance légère

        const cost = levelDiff * 1.0 + distDeg * 4.0 + sameDept + variance

        if (cost < minCost) {
          minCost = cost
          bestCandidate = entry
        }
      }

      // Affectation du prêt au club retenu
      const destClub = bestCandidate.club
      const assignedSlot = bestCandidate.slot

      const loanedPlayer: Person = {
        ...player,
        currentClubId: destClub.id,
        loanedFromClubId: lenderClub.id,
        assignedPosition: assignedSlot,
      }

      // Mettre à jour les slots du club d'accueil
      const destSlots = clubSlots.get(destClub.id)!
      if (assignedSlot === 'ATTACKER') {
        destSlots.attacker = loanedPlayer
      } else {
        destSlots.defender = loanedPlayer
      }

      allUpdatedMap.set(loanedPlayer.id, loanedPlayer)
    }
  }

  // Reconstituer la liste dans l'ordre initial des identifiants
  return resetPersons.map((p) => allUpdatedMap.get(p.id) ?? p)
}

/**
 * Met à jour la force réelle (strength) de chaque club pour la saison en cours
 * en intégrant l'apport de ses 2 titulaires actifs (pondération définie dans PLAYER_BALANCE).
 * Préserve baseStrength (indice territorial dérivé de la population et des fusions).
 */
export function applyRostersStrengthToClubs(
  clubs: readonly Club[],
  persons: readonly Person[],
  playerWeight = PLAYER_BALANCE.influenceWeight,
): Club[] {
  // Pré-indexer les entraîneurs et titulaires par club
  const activeCoaches = new Map(persons.filter(isActiveCoach).map(p => [p.currentClubId!, p]))
  const startersByClubId = new Map<string, { attacker: Person | null; defender: Person | null }>()
  for (const p of persons) {
    if (p.currentClubId && !p.isRetired && !startersByClubId.has(p.currentClubId)) {
      startersByClubId.set(p.currentClubId, getClubActiveStarters(persons, p.currentClubId))
    }
  }

  return clubs.map((c) => {
    const starters = startersByClubId.get(c.id)
    const base = c.baseStrength ?? c.strength
    const coachPerson = activeCoaches.get(c.id)
    const coach = coachPerson ? coachSnapshot(coachPerson, base) : null
    const effective = computeEffectiveStrength(base, starters, playerWeight, coach?.skill)
    return {
      ...c,
      baseStrength: base,
      coach,
      strength: Math.round(effective * 10) / 10,
    }
  })
}

