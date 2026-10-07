import type { Person } from './types'
import { PLAYER_BALANCE } from '../../config/playerBalance'

export type ClubStarters = {
  attacker: Person | null
  defender: Person | null
  surplusPlayers: Person[]
}

/**
 * Sélectionne les 2 meilleurs titulaires pour un club (1 Attaquant et 1 Défenseur)
 * parmi ses joueurs sous contrat, en maximisant la somme des notes ATT + DEF.
 * Les joueurs peuvent changer de poste si nécessaire (ex: 2 défenseurs -> le meilleur en attaque passe attaquant).
 */
export function selectClubStarters(contractedPlayers: readonly Person[], respectAssignments = false): ClubStarters {
  const activePlayers = contractedPlayers.filter((p) => !p.isRetired && p.primaryRole === 'PLAYER')

  if (activePlayers.length === 0) {
    return { attacker: null, defender: null, surplusPlayers: [] }
  }

  if (activePlayers.length === 1) {
    const only = activePlayers[0]
    const prefersDefense =
      only.assignedPosition === 'DEFENDER' ||
      (only.assignedPosition !== 'ATTACKER' &&
        (only.position === 'DEFENDER'
          ? only.defense >= only.attack - 2
          : only.defense > only.attack + 2))

    if (prefersDefense) {
      return {
        attacker: null,
        defender: { ...only, assignedPosition: 'DEFENDER' },
        surplusPlayers: [],
      }
    } else {
      return {
        attacker: { ...only, assignedPosition: 'ATTACKER' },
        defender: null,
        surplusPlayers: [],
      }
    }
  }

  // Si 2 joueurs ou plus : tester toutes les paires ordonnées (p1 = ATT, p2 = DEF)
  let bestScore = -Infinity
  let bestAttacker: Person = activePlayers[0]
  let bestDefender: Person = activePlayers[1]
  const assignedAtt = respectAssignments ? activePlayers.find(p => p.assignedPosition === 'ATTACKER') : undefined
  const assignedDef = respectAssignments ? activePlayers.find(p => p.assignedPosition === 'DEFENDER') : undefined

  for (let i = 0; i < activePlayers.length; i++) {
    for (let j = 0; j < activePlayers.length; j++) {
      if (i === j) continue
      const pAtt = activePlayers[i]
      const pDef = activePlayers[j]
      if (respectAssignments) {
        if (assignedAtt && pAtt.id !== assignedAtt.id) continue
        if (assignedDef && pDef.id !== assignedDef.id) continue
      }

      // Score combiné : Attaque du premier + Défense du second
      let score = pAtt.attack + pDef.defense

      // Légère préférence pour le poste nominal d'origine
      if (pAtt.position === 'ATTACKER') score += PLAYER_BALANCE.nominalPositionBonus
      if (pDef.position === 'DEFENDER') score += PLAYER_BALANCE.nominalPositionBonus

      if (score > bestScore) {
        bestScore = score
        bestAttacker = pAtt
        bestDefender = pDef
      }
    }
  }

  const starterAttacker: Person = { ...bestAttacker, assignedPosition: 'ATTACKER' }
  const starterDefender: Person = { ...bestDefender, assignedPosition: 'DEFENDER' }

  const surplusPlayers = activePlayers.filter(
    (p) => p.id !== bestAttacker.id && p.id !== bestDefender.id,
  )

  return {
    attacker: starterAttacker,
    defender: starterDefender,
    surplusPlayers,
  }
}

