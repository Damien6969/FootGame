import type { CoachSnapshot } from '../coaches/types'
import type { ClubIdentity } from './clubIdentity'

export type FusedClubInfo = Readonly<{
  id: string
  name: string
  communeId?: string
  communeName: string
  communeIds?: readonly string[]
  communeNames?: readonly string[]
  year?: number
  oldStrength?: number
  newStrength?: number
  totalPopulation?: number
  identity?: ClubIdentity
}>

export type Club = Readonly<{
  id: string
  name: string
  shortName: string
  communeId: string
  communeName: string
  communeIds: readonly string[]
  communeNames: readonly string[]
  departmentId: string
  regionId: string
  zoneId: string
  conferenceId: string
  population: number
  strength: number
  baseStrength?: number
  coach?: CoachSnapshot | null
  coordinates?: readonly [number, number]
  isFusion?: boolean
  fusionCount?: number
  isRivalClub?: boolean
  parentChampionYear?: number
  parentClubId?: string
  parentClubName?: string
  fusedClubs?: readonly FusedClubInfo[]
  isCustomName?: boolean
  identity?: ClubIdentity
  secessionCounts?: Readonly<Record<string, number>>
}>
