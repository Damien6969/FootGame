import type { CompetitionPhase } from './competition'

const labels: Record<CompetitionPhase, string> = {
  DEPARTMENT: 'Départemental',
  REGION: 'Régional',
  CONFERENCE: 'Conférences',
  NATIONAL: 'National',
}

export const phaseLabel = (phase: CompetitionPhase) => labels[phase]
