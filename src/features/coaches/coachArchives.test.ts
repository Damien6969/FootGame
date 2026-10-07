import { describe, expect, it } from 'vitest'
import { buildSeasonArchive } from '../history/palmaresSelectors'
import { toArchiveSummary, extractTeamSeasonPerformanceRecords, type CupSession } from '../storage/cupRepository'
import { validateCareerBackup } from '../storage/validateBackup'
import { computePersonTrophyRecord, computePersonTitleCounts } from '../persons/personSelectors'
import { extractSeasonPlayerHonors, buildPlayerPalmaresFromHonors } from '../history/playerPalmaresStorage'
import { getRankedPlayerPalmares } from '../history/playerPalmaresSelectors'
import { advancePersonsSeason } from '../persons/personGenerator'
import { applyRostersStrengthToClubs } from '../persons/rosterAndLoans'
import type { Person } from '../persons/types'
import type { Club } from '../teams/types'

const club: Club = { id: 'c', name: 'Club', shortName: 'Club', communeId: 'town', communeName: 'Town',
  communeIds: ['town'], communeNames: ['Town'], departmentId: '75', regionId: '11', zoneId: 'N', conferenceId: 'N', population: 1000, strength: 15 }
const coach: Person = { id: 'p', firstName: 'Paul', lastName: 'Test', age: 50, nationality: 'FR', birthCommuneId: 'town',
  birthCommuneName: 'Town', birthDepartmentId: '75', currentClubId: 'c', primaryRole: 'COACH', isRetired: true, retiredYear: 2014,
  coachStartedYear: 2014, lastAgedYear: 2026, coachStartAge: 38, coachPeakAge: 50, coachPeakSkill: 25, coachSkill: 25,
  position: 'ATTACKER', attack: 10, defense: 5, peakAttack: 28, peakDefense: 18, careerYears: 32, careerHistory: [] }
const session: CupSession = { id: 'active', seasonYear: 2026, seed: '2026', datasetVersion: 'test', activeTeamIds: ['c'],
  championId: 'c', roundNumber: 14, round: { matches: [], byeTeamIds: ['c'] }, results: {}, history: [],
  persons: [coach], clubs: applyRostersStrengthToClubs([club], [coach]) }
const dataset = { version: 'test', sourceLabel: 'test', sourceUrl: '', communes: [] }
const backup = () => ({ version: 1, exportedAt: '2026-10-03T12:00:00Z', session, archives: [buildSeasonArchive(session, dataset)] })

describe('coach archives and backups', () => {
  it('keeps historical coach ratings in lightweight archives and JSON backups', () => {
    const archive = buildSeasonArchive(session, dataset)
    expect(archive.teamPerformances.c.coach).toMatchObject({ personId: 'p', skill: 25, peakSkill: 25, bonus: 1.8 })
    const summary = toArchiveSummary(archive)
    expect(summary.persons).toBeUndefined()
    expect(summary.teamPerformances).toEqual({})
    const teamPerfs = extractTeamSeasonPerformanceRecords(archive)
    expect(teamPerfs.find(p => p.teamId === 'c')?.coach?.skill).toBe(25)
    const restored = JSON.parse(JSON.stringify(backup()))
    expect(() => validateCareerBackup(restored)).not.toThrow()
    const next = advancePersonsSeason({ persons: [coach], clubs: session.clubs!, communes: [],
      seasonYear: 2027, seed: 'next', newRecruitsCount: 0, previousSeasonArchive: archive })
    expect(next[0].careerHistory?.at(-1)).toMatchObject({ role: 'COACH', coachSkill: 25, matchesPlayed: 0, isNationalChampion: true })
    expect(restored.archives[0].teamPerformances.c.coach.skill).toBe(25)
  })

  it('combines player and coach national titles without counting an archived active season twice', () => {
    const person = { ...coach, careerHistory: [{ year: 2013, clubId: 'c', role: 'PLAYER' as const, age: 37,
      attack: 10, defense: 5, isStarter: true, matchesPlayed: 14, isNationalChampion: true }] }
    const record = computePersonTrophyRecord(person, [buildSeasonArchive(session, dataset)], session)
    expect(record.nationalTitleYears).toEqual([2026, 2013])
    expect(record.seasons.find(s => s.year === 2026)).toMatchObject({ role: 'COACH', coachSkill: 25, matchesPlayed: 0 })
  })

  it('counts all collective coach titles equally in the profile, directory and persisted leaderboard', () => {
    const archive = buildSeasonArchive(session, dataset)
    const decoratedArchive = { ...archive, conferenceChampions: { N: 'c' }, regionChampions: { '11': 'c' },
      departmentChampions: { '75': 'c' }, teamPerformances: { c: { ...archive.teamPerformances.c,
        isConferenceChampion: true, isRegionChampion: true, isDepartmentChampion: true } } }
    const record = computePersonTrophyRecord(coach, [decoratedArchive], session)
    expect([record.nationalTitles, record.conferenceTitles, record.regionTitles, record.departmentTitles]).toEqual([1, 1, 1, 1])
    expect(record.seasons[0]).toMatchObject({ role: 'COACH', isStarter: false, matchesPlayed: 0, isNationalChampion: true })
    expect(computePersonTitleCounts([coach], [decoratedArchive], session).get(coach.id)).toEqual({
      nationalTitles: 1, conferenceTitles: 1, regionTitles: 1, departmentTitles: 1,
    })
    const honors = extractSeasonPlayerHonors(decoratedArchive, new Map([[club.id, club]]))
    expect(honors[0]).toMatchObject({ role: 'COACH', isStarter: false, isNationalChampion: true })
    const ranked = buildPlayerPalmaresFromHonors(honors)
    expect(ranked[0]).toMatchObject({ totalTeamTitles: 4, totalTitles: 4, totalIndividualTitles: 0, palmaresScore: 18 })
    expect(getRankedPlayerPalmares([coach], [decoratedArchive], session)[0].totalTitles).toBe(4)
  })

  it('credits the active head coach but neither substitutes nor a retired coach', () => {
    const formerCoach = { ...coach, id: 'former', coachRetiredYear: 2025 }
    const starter: Person = { ...coach, id: 'starter', primaryRole: 'PLAYER', isRetired: false }
    const substitute = { ...starter, id: 'reserve', attack: 1, defense: 1 }
    const defender: Person = { ...starter, id: 'defender', position: 'DEFENDER', defense: 30 }
    const active = { ...session, persons: [coach, formerCoach, starter, defender, substitute] }
    const honors = extractSeasonPlayerHonors(active, new Map([[club.id, club]]))
    expect(honors.find(h => h.personId === coach.id)?.isNationalChampion).toBe(true)
    expect(honors.find(h => h.personId === formerCoach.id)?.isNationalChampion ?? false).toBe(false)
    expect(honors.find(h => h.personId === substitute.id)?.isNationalChampion ?? false).toBe(false)
    expect(computePersonTrophyRecord(coach, [], active).nationalTitles).toBe(1)
  })

  it('includes active regional and departmental titles in directory coach counters', () => {
    const active: CupSession = { ...session, conferenceChampionIds: { N: 'c' }, history: [8, 10].map(roundNumber => ({
      roundNumber, homeTeamId: 'c', awayTeamId: 'opponent',
      result: { matchId: `round-${roundNumber}`, homeScore: 1, awayScore: 0, winnerId: 'c', events: [] },
    })) }
    expect(computePersonTitleCounts([coach], [], active, new Map([[club.id, club]])).get(coach.id)).toEqual({
      nationalTitles: 1, conferenceTitles: 1, regionTitles: 1, departmentTitles: 1,
    })
    const rivalClub = { ...club, id: 'rival' }
    const rival = { ...coach, id: 'rival-coach', currentClubId: rivalClub.id }
    const competing = { ...active, persons: [coach, rival], history: [...active.history, {
      roundNumber: 10, homeTeamId: 'rival', awayTeamId: 'other',
      result: { matchId: 'rival-quarter', homeScore: 2, awayScore: 0, winnerId: 'rival', events: [] },
    }] }
    const clubs = new Map([[club.id, club], [rivalClub.id, rivalClub]])
    expect(extractSeasonPlayerHonors(competing, clubs).find(h => h.personId === coach.id)).toMatchObject({
      isRegionChampion: true, isDepartmentChampion: true,
    })
    expect(computePersonTitleCounts([rival], [], competing, clubs).get(rival.id)?.regionTitles).toBe(0)
    expect(extractSeasonPlayerHonors(competing, clubs).find(h => h.personId === rival.id)?.isRegionChampion ?? false).toBe(false)
  })

  it('rejects duplicate coaching posts and coach loans', () => {
    const duplicate = backup()
    duplicate.session = { ...session, persons: [coach, { ...coach, id: 'other' }] }
    expect(() => validateCareerBackup(duplicate)).toThrow(/entraîneur/)
    const loan = backup()
    loan.session = { ...session, transferMovements: [{ id: 'loan', seasonYear: 2026, kind: 'LOAN', role: 'COACH',
      personId: 'p', playerName: 'Paul Test', age: 50, position: 'ATTACKER', rating: 25,
      fromClubId: 'other', fromClubName: 'Other', toClubId: 'c', toClubName: 'Club', reason: 'AMBITION' }] }
    expect(() => validateCareerBackup(loan)).toThrow(/prêt/)
  })

  it('keeps only one coach after a fusion and hires the displaced coach on another vacancy', () => {
    const absorbed = { ...coach, id: 'absorbed', currentClubId: 'old', coachSkill: 30, coachPeakSkill: 30 }
    const mergedClub = { ...club, fusedClubs: [{ id: 'old', name: 'Old', communeName: 'Old' }] }
    const next = advancePersonsSeason({ persons: [coach, absorbed], clubs: [mergedClub, { ...club, id: 'vacancy' }], communes: [],
      seasonYear: 2027, seed: 'fusion', newRecruitsCount: 0 })
    expect(next.find(p => p.id === 'p')?.currentClubId).toBe('c')
    expect(next.find(p => p.id === 'absorbed')?.currentClubId).toBe('vacancy')
    expect(new Set(next.map(p => p.currentClubId)).size).toBe(2)
  })
})
