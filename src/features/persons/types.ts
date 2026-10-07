import type { IndividualHonor } from '../awards/types'

export type PersonRoleType = 'PLAYER' | 'COACH' | 'PRESIDENT'

export type PlayerPosition = 'ATTACKER' | 'DEFENDER'

export type PersonCareerSeason = Readonly<{
  year: number
  clubId: string | null
  clubName?: string
  role: PersonRoleType
  age: number
  attack: number
  defense: number
  coachSkill?: number
  coachPeakSkill?: number
  competitionLevel?: number
  isLoan?: boolean
  parentClubId?: string | null
  parentClubName?: string
  assignedPosition?: PlayerPosition
  /** False : joueur présent au club, sans participation à la saison. */
  isStarter?: boolean
  
  /** Statistiques individuelles enregistrées lors de cette saison */
  matchesPlayed?: number
  goals?: number
  defensiveStops?: number
  shots?: number
  shotsMissed?: number
  individualHonors?: readonly IndividualHonor[]

  /** Performances et distinctions obtenues avec ce club cette saison */
  roundReached?: number
  stageLabel?: string
  isNationalChampion?: boolean
  isConferenceChampion?: boolean
  isRegionChampion?: boolean
  isDepartmentChampion?: boolean
  conferenceId?: string
  regionId?: string
  departmentId?: string
}>

export type PersonTrophyRecord = Readonly<{
  personId: string
  nationalTitles: number
  nationalTitleYears: readonly number[]
  conferenceTitles: number
  conferenceTitleDetails: ReadonlyArray<{ year: number; conferenceId: string; clubName?: string }>
  regionTitles: number
  regionTitleDetails: ReadonlyArray<{ year: number; regionId: string; clubName?: string }>
  departmentTitles: number
  departmentTitleDetails: ReadonlyArray<{ year: number; departmentId: string; clubName?: string }>
  bestPerformance?: {
    year: number
    roundNumber: number
    stageLabel: string
    clubName?: string
  }
  seasons: ReadonlyArray<PersonCareerSeason>
}>

export type Person = Readonly<{
  id: string
  firstName: string
  lastName: string
  age: number
  nationality: string // Code ISO 2 lettres, ex: 'FR'
  secondNationality?: string // Identité narrative, sans effet sur le niveau sportif
  birthCommuneId: string
  birthCommuneName: string
  birthDepartmentId: string
  currentClubId: string | null
  parentClubId?: string | null     // Club propriétaire actuel (change lors d'un transfert)
  originClubId?: string | null     // Premier club propriétaire, conservé pour toute la carrière
  originClubName?: string
  loanedFromClubId?: string | null // Club prêteur si actuellement en prêt
  assignedPosition?: PlayerPosition // Poste effectif cette saison ('ATTACKER' | 'DEFENDER')
  
  primaryRole: PersonRoleType
  
  /** Attributs de joueur */
  position: PlayerPosition
  attack: number   // 0 à 30 (note actuelle selon l'âge et la courbe de carrière)
  defense: number  // 0 à 30 (note actuelle selon l'âge et la courbe de carrière)
  
  /** Pic de forme & Potentiel maximal */
  peakAge?: number     // Âge de l'apogée (ex. 24 à 31 ans)
  peakAttack?: number  // Attaque maximale atteinte au pic (0 à 30)
  peakDefense?: number // Défense maximale atteinte au pic (0 à 30)
  
  /** Aptitudes pour futurs rôles d'entraîneur ou président (0 à 30) */
  coachSkill?: number
  coachPeakSkill?: number
  coachStartAge?: number
  coachPeakAge?: number
  coachStartedYear?: number
  coachRetiredYear?: number
  coachDismissedYear?: number
  coachDismissedClubs?: Readonly<Record<string, number>>
  lastAgedYear?: number
  presidentSkill?: number
  
  /** Historique de carrière */
  careerYears: number
  careerHistory?: readonly PersonCareerSeason[]
  isRetired?: boolean
  retiredYear?: number
}>

export type CareerTrajectoryPhase = 'GROWTH' | 'PEAK' | 'DECLINE'

export type PersonSortKey = 'name' | 'age' | 'attack' | 'defense' | 'overall' | 'club' | 'birthCity' | 'titles'
export type SortDirection = 'asc' | 'desc'
