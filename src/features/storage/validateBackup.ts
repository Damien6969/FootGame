import type { CareerBackupData } from './cupRepository'
import { isClubIdentity } from '../teams/clubIdentity'

type Check = (value: unknown, path: string) => void
const fail = (path: string): never => { throw new Error(`Sauvegarde invalide : ${path}.`) }
const text: Check = (v, p) => { if (typeof v !== 'string' || !v.trim()) fail(p) }
const number = (minimum = 0, integer = false): Check => (v, p) => {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < minimum || (integer && !Number.isInteger(v))) fail(p)
}
const count = number(0, true)
const rating: Check = (v, p) => { number(1)(v, p); if ((v as number) > 30) fail(p) }
const positive = number(1, true)
const boolean: Check = (v, p) => { if (typeof v !== 'boolean') fail(p) }
const optional = (check: Check): Check => (v, p) => { if (v !== undefined) check(v, p) }
const nullable = (check: Check): Check => (v, p) => { if (v !== null) check(v, p) }
const list = (check: Check): Check => (v, p) => {
  if (!Array.isArray(v)) fail(p)
  ;(v as unknown[]).forEach((item, i) => check(item, `${p}[${i}]`))
}
const object = (v: unknown, p: string): Record<string, unknown> => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) fail(p)
  return v as Record<string, unknown>
}
const shape = (fields: Record<string, Check>): Check => (v, p) => {
  const item = object(v, p)
  for (const [key, check] of Object.entries(fields)) check(item[key], `${p}.${key}`)
}
const record = (check: Check): Check => (v, p) => {
  for (const [key, item] of Object.entries(object(v, p))) check(item, `${p}.${key}`)
}
const strings = list(text)
const oneOf = (...values: string[]): Check => (v, p) => { if (!values.includes(v as string)) fail(p) }
const coach = nullable(shape({ personId: text, name: text, age: positive, skill: rating, peakSkill: rating,
  peakAge: positive, bonus: number() }))
const honor = shape({ awardId: text, title: text, conferenceId: optional(text) })
const awardPlayer = shape({ personId: text, firstName: text, lastName: text, age: positive, clubId: text, clubName: text,
  conferenceId: (v, p) => { if (typeof v !== 'string') fail(p) }, position: oneOf('ATTACKER', 'DEFENDER'),
  matchesPlayed: positive, goals: count, defensiveStops: count, shots: count, shotsMissed: count,
  attackScore: number(), defenseScore: number(), overallScore: number(), awardScore: optional(number()),
  juryAdjustment: optional((v, p) => { if (typeof v !== 'number' || !Number.isFinite(v) || Math.abs(v) > 0.02) fail(p) }),
  eliminatedInRound: optional(number(1, true)),
  eliminationStageLabel: optional(text),
  isChampion: optional(boolean),
})
const awards = shape({ version: (v, p) => { if (v !== 1) fail(p) }, year: positive, minimumMatches: positive,
  scoringMethod: optional(oneOf('PHASE_AVERAGE', 'PHASE_TOTAL')),
  awards: list(shape({ id: text, title: text, stage: oneOf('YOUTH', 'CONFERENCE', 'NATIONAL', 'FINAL'),
    metric: oneOf('ATTACK', 'DEFENSE', 'OVERALL', 'GOALS', 'STOPS', 'TEAM'), conferenceId: optional(text),
    winners: list(awardPlayer), nominees: list(awardPlayer) })) })
const date: Check = (v, p) => { text(v, p); if (!Number.isFinite(Date.parse(v as string))) fail(p) }
const event = shape({ sequence: positive, teamId: text, kind: (v, p) => { if (v !== 'GOAL' && v !== 'CHANCE') fail(p) } })
const result = shape({ matchId: text, homeScore: count, awayScore: count, winnerId: text, events: list(event) })
const match = shape({ id: text, homeTeamId: text, awayTeamId: text })
const history: Check = (v, p) => {
  shape({ roundNumber: positive, homeTeamId: text, awayTeamId: text, result })(v, p)
  const item = v as CareerBackupData['archives'][number]['history'][number]
  const r = item.result
  if (item.homeTeamId === item.awayTeamId || r.homeScore === r.awayScore ||
      r.winnerId !== (r.homeScore > r.awayScore ? item.homeTeamId : item.awayTeamId) ||
      r.events.some((e) => e.teamId !== item.homeTeamId && e.teamId !== item.awayTeamId)) fail(p)
}
const fusedClub = shape({ id: text, name: text, communeName: text, communeId: optional(text),
  communeIds: optional(strings), communeNames: optional(strings), year: optional(positive),
  oldStrength: optional(number()), newStrength: optional(number()), totalPopulation: optional(number()),
  identity: optional((value, path) => { if (!isClubIdentity(value)) fail(path) }) })
const club = shape({ id: text, name: text, shortName: text, communeId: text, communeName: text,
  communeIds: strings, communeNames: strings, departmentId: text, regionId: text, zoneId: text,
  conferenceId: text, population: number(), strength: number(),
  baseStrength: optional(number()),
  identity: optional((value, path) => { if (!isClubIdentity(value)) fail(path) }),
  coach: optional(coach),
  coordinates: optional((v, p) => { list(number(-180))(v, p); if ((v as unknown[]).length !== 2) fail(p) }),
  isFusion: optional(boolean), fusionCount: optional(count), isRivalClub: optional(boolean),
  parentChampionYear: optional(positive), parentClubId: optional(text), parentClubName: optional(text),
  fusedClubs: optional(list(fusedClub)),
  secessionCounts: optional((v, p) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) fail(p)
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      if (typeof k !== 'string' || typeof val !== 'number' || val < 0) fail(p)
    }
  }),
})
const fusion = shape({ mergedClubId: text, mergedClubName: text, absorbedClubId: text, absorbedClubName: text,
  communeNames: strings, totalPopulation: number(), newStrength: number(), oldStrength: optional(number()),
  leadClubName: optional(text), leadCommuneId: optional(text), leadCommuneName: optional(text),
  absorbedCommuneIds: optional(strings), absorbedCommuneNames: optional(strings) })
const secession = shape({ newClubId: text, newClubName: text, communeId: text, communeName: text,
  parentEnteId: text, parentEnteName: text, populationLost: number(), newEnteStrength: number(),
  step: optional(positive), isCompleteWithdrawal: optional(boolean) })
const report = shape({ seasonYear: positive, fusions: list(fusion), secessions: list(secession),
  rivalCreated: optional(shape({ clubId: text, clubName: text, communeName: text, strength: number(), parentChampionName: text })) })
const performance = shape({ teamId: text, clubName: optional(text), roundReached: positive, stageLabel: text,
  coach: optional(coach),
  isNationalChampion: boolean, isConferenceChampion: boolean, isRegionChampion: optional(boolean), isDepartmentChampion: optional(boolean),
  conferenceId: optional(text), regionId: optional(text), departmentId: optional(text), eliminatedInRound: optional(positive),
  eliminatedByTeamId: optional(text), matchesWon: count, matchesPlayed: count, goalsScored: optional(count),
  goalsConceded: optional(count), goalDifference: optional(number(-Infinity, true)), isFusion: optional(boolean),
  fusionCount: optional(count), communeNames: optional(strings), fusionPartnerNames: optional(strings) })
const careerSeason = shape({
  year: positive, clubId: optional(nullable(text)), clubName: optional(text),
  role: text, age: positive, attack: number(), defense: number(),
  coachSkill: optional(rating), coachPeakSkill: optional(rating), competitionLevel: optional(rating),
  isLoan: optional(boolean), parentClubId: optional(nullable(text)), parentClubName: optional(text),
    assignedPosition: optional(text), isStarter: optional(boolean),
  matchesPlayed: optional(count), goals: optional(count), defensiveStops: optional(count),
  shots: optional(count), shotsMissed: optional(count),
  individualHonors: optional(list(honor)),
  roundReached: optional(positive), stageLabel: optional(text),
  isNationalChampion: optional(boolean), isConferenceChampion: optional(boolean),
  isRegionChampion: optional(boolean), isDepartmentChampion: optional(boolean),
  conferenceId: optional(text), regionId: optional(text), departmentId: optional(text),
})
const person = shape({
  id: text, firstName: text, lastName: text, age: positive, nationality: text, secondNationality: optional(text),
  birthCommuneId: text, birthCommuneName: text, birthDepartmentId: text,
  currentClubId: nullable(text), parentClubId: optional(nullable(text)), loanedFromClubId: optional(nullable(text)), assignedPosition: optional(text),
  originClubId: optional(nullable(text)), originClubName: optional(text),
  primaryRole: text, position: text,
  attack: number(), defense: number(), careerYears: count,
  peakAge: optional(positive), peakAttack: optional(number()), peakDefense: optional(number()),
  careerHistory: optional(list(careerSeason)),
  isRetired: optional(boolean), retiredYear: optional(positive),
  coachSkill: optional(number()), presidentSkill: optional(number()),
  coachPeakSkill: optional(rating), coachStartAge: optional(positive), coachPeakAge: optional(positive),
  coachStartedYear: optional(positive), coachRetiredYear: optional(positive), lastAgedYear: optional(positive),
  coachDismissedYear: optional(positive), coachDismissedClubs: optional(record(positive)),
})
const transferMovement = shape({
  id: text, seasonYear: positive, kind: oneOf('TRANSFER', 'LOAN'), personId: text,
  role: optional(oneOf('PLAYER', 'COACH')),
  playerName: text, age: positive, position: oneOf('ATTACKER', 'DEFENDER'),
  rating: (v, p) => { number()(v, p); if ((v as number) > 30) fail(p) },
  fromClubId: text, fromClubName: text, toClubId: text, toClubName: text,
  ownerClubId: optional(text), ownerClubName: optional(text), distanceKm: optional(number()),
  distanceFromClubName: optional(text),
  reason: oneOf('AMBITION', 'BLOCKED', 'LONG_LOAN', 'VETERAN', 'DEVELOPMENT', 'RECONVERSION', 'FREE_AGENT', 'LIMOGEAGE', 'OPPORTUNITY', 'DYNAMICS'),
})
const archive = shape({ year: positive, seed: text, completedAt: date, datasetVersion: text, nationalChampionId: text,
  finalistId: optional(text), conferenceChampions: record(text), regionChampions: optional(record(text)), departmentChampions: optional(record(text)),
  finalFourTeamIds: strings, totalMatches: count, teamPerformances: record(performance), history: list(history),
  clubs: optional(list(club)), interseasonReport: optional(report), fusions: optional(list(fusion)), secessions: optional(list(secession)),
  persons: optional(list(person)), individualAwards: optional(awards), transferMovements: optional(list(transferMovement)) })
const session = shape({ id: (v, p) => { if (v !== 'active') fail(p) }, seed: text, seasonYear: optional(positive), datasetVersion: text,
  activeTeamIds: strings, roundNumber: positive, round: shape({ matches: list(match), byeTeamIds: strings }),
  results: record(result), history: list(history), championId: optional(text), conferenceChampionIds: optional(record(text)),
  roundByes: optional(record(strings)), clubs: optional(list(club)), interseasonReport: optional(report),
  communeNextIndex: optional(record(positive)), retiredClubNames: optional(strings),
  persons: optional(list(person)), individualAwards: optional(awards), transferMovements: optional(list(transferMovement)) })

export function validateCareerBackup(value: unknown): asserts value is CareerBackupData {
  shape({ version: (v, p) => { if (v !== 1) fail(p) }, exportedAt: date,
    session: optional(session), archives: list(archive), favoriteTeamIds: optional(strings), favoritePersonIds: optional(strings) })(value, 'fichier')
  const backup = value as CareerBackupData
  if (new Set(backup.archives.map((item) => item.year)).size !== backup.archives.length) fail('saisons en double')
  for (const item of [backup.session, ...backup.archives]) {
    const coaches = new Set<string>()
    for (const p of item?.persons ?? []) {
      if (p.primaryRole !== 'COACH' || !p.currentClubId || p.coachRetiredYear) continue
      if (coaches.has(p.currentClubId) || p.loanedFromClubId || p.age >= 65 ||
          (item?.clubs && !item.clubs.some(c => c.id === p.currentClubId))) fail('poste d’entraîneur incohérent')
      coaches.add(p.currentClubId)
    }
    if (item?.clubs && new Set(item.clubs.map((club) => club.id)).size !== item.clubs.length) fail('clubs en double')
    if (item?.transferMovements) {
      const year = 'year' in item ? item.year : item.seasonYear
      const ids = new Set<string>()
      const movedPersons = new Set<string>()
      for (const movement of item.transferMovements) {
        if (movement.role === 'COACH' && movement.kind === 'LOAN') fail('prêt d’entraîneur interdit')
        if (movement.fromClubId === movement.toClubId ||
            (year !== undefined && movement.seasonYear !== year) ||
            ids.has(movement.id) || movedPersons.has(movement.personId)) fail('mouvement de mercato incohérent')
        ids.add(movement.id)
        movedPersons.add(movement.personId)
      }
    }
  }
  if (backup.session) {
    const s = backup.session
    const matches = new Map(s.round.matches.map((m) => [m.id, m]))
    if (matches.size !== s.round.matches.length) fail('matchs en double')
    const participants = [...s.round.byeTeamIds, ...s.round.matches.flatMap((m) => [m.homeTeamId, m.awayTeamId])]
    if (new Set(participants).size !== participants.length) fail('club inscrit plusieurs fois dans le tour')
    for (const [id, r] of Object.entries(s.results)) {
      const m = matches.get(id)
      if (!m || r.matchId !== id) fail('résultat sans match correspondant')
      history({ ...m, roundNumber: s.roundNumber, result: r }, `résultat ${id}`)
    }
    if (s.clubs) {
      const ids = new Set(s.clubs.map((club) => club.id))
      if ([...s.activeTeamIds, ...participants].some((id) => !ids.has(id))) fail('club inconnu')
    }
  }
}
