import type { PlayerPosition } from '../persons/types'

export type TransferMovement = Readonly<{
  id: string
  seasonYear: number
  kind: 'TRANSFER' | 'LOAN'
  role?: 'PLAYER' | 'COACH'
  personId: string
  playerName: string
  age: number
  position: PlayerPosition
  rating: number
  fromClubId: string
  fromClubName: string
  toClubId: string
  toClubName: string
  ownerClubId?: string
  ownerClubName?: string
  distanceKm?: number
  /** Club de départ géographique, lorsqu'il diffère du club qui cède le contrat. */
  distanceFromClubName?: string
  reason: 'AMBITION' | 'BLOCKED' | 'LONG_LOAN' | 'VETERAN' | 'DEVELOPMENT' | 'RECONVERSION' | 'FREE_AGENT' | 'LIMOGEAGE' | 'OPPORTUNITY' | 'DYNAMICS'
}>
