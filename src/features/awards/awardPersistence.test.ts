import { describe, expect, it } from 'vitest'
import { buildSeasonArchive } from '../history/palmaresSelectors'
import { advancePersonsSeason } from '../persons/personGenerator'
import { computePersonTrophyRecord } from '../persons/personSelectors'
import { toArchiveSummary, type CareerBackupData } from '../storage/cupRepository'
import { validateCareerBackup } from '../storage/validateBackup'
import type { GeographyDataset } from '../geography/types'
import fixture from '../../test/fixtures/communes.fixture.json'
import { computeSeasonAwards, getSeasonAwards, refreshActiveSeasonAwards } from './seasonAwards'
import { player, club, match, finishedSession } from './awards.fixture'

const dataset: GeographyDataset = { ...fixture, communes: fixture.communes.map(c => ({ ...c, conferenceId: 'CONF_OUEST' })) }

describe('individual award persistence', () => {
  it('refreshes the active season awards while leaving archived snapshots and match results intact', () => {
    const p = player('winner', 'a')
    const session = finishedSession([p], [0, 1, 2].map(i => match(`m${i}`, [p])))
    const old = { ...computeSeasonAwards(session)!, scoringMethod: 'PHASE_AVERAGE' as const }
    const active = { ...session, individualAwards: old }
    const refreshed = refreshActiveSeasonAwards(active)
    expect(refreshed.individualAwards?.scoringMethod).toBe('PHASE_TOTAL')
    expect(refreshed.history).toBe(active.history)
    expect(refreshed.persons).toBe(active.persons)
    expect(active.individualAwards).toBe(old)
    expect(refreshActiveSeasonAwards(refreshed)).toBe(refreshed)
    const archive = { ...buildSeasonArchive(session, dataset), individualAwards: old }
    expect(getSeasonAwards(archive)).toBe(old)
  })
  it('archives awards and keeps them in lightweight summaries and player careers after aging', () => {
    const p = player('winner', 'a')
    const session = finishedSession([p], [0, 1, 2].map(i => match(`m${i}`, [p])))
    const archive = buildSeasonArchive(session, dataset, [club('a')])
    expect(archive.individualAwards).toEqual(computeSeasonAwards(session))
    expect(toArchiveSummary(archive).individualAwards).toEqual(archive.individualAwards)
    const next = advancePersonsSeason({ persons: [p], clubs: [club('a')], communes: dataset.communes,
      seasonYear: 2027, seed: '2027', previousSeasonArchive: archive }).find(person => person.id === p.id)!
    expect(next.age).toBe(23)
    expect(next.careerHistory![0].individualHonors!.some(a => a.awardId === 'young-player')).toBe(true)
    const record = computePersonTrophyRecord(next, [archive])
    expect(record.seasons[0].individualHonors!.some(a => a.awardId === 'ballon-or')).toBe(true)
    expect(computePersonTrophyRecord(p, [], session).seasons[0].individualHonors!.some(a => a.awardId === 'ballon-or')).toBe(true)
  })
  it('accepts old backups and validates new award data before import', () => {
    const p = player('winner', 'a')
    const session = finishedSession([p], [0, 1, 2].map(i => match(`m${i}`, [p])))
    // Les séquences des événements réels commencent à 1.
    const history = session.history.map(m => ({ ...m, result: { ...m.result, events: m.result.events.map((e, i) => ({ ...e, sequence: i + 1 })) } }))
    const backup: CareerBackupData = { version: 1, exportedAt: '2026-10-03', session: { ...session, history }, archives: [] }
    expect(() => validateCareerBackup(backup)).not.toThrow()
    const awards = computeSeasonAwards(session)!
    expect(() => validateCareerBackup({ ...backup, session: { ...backup.session, individualAwards: awards } })).not.toThrow()
    expect(() => validateCareerBackup({ ...backup, session: { ...backup.session, individualAwards: { ...awards, awards: 'broken' } } })).toThrow(/Sauvegarde invalide/)
  })
  it('purges legacy team awards from past snapshots, archives and player career histories', () => {
    const p = player('winner', 'a')
    const session = finishedSession([p], [0, 1, 2].map(i => match(`m${i}`, [p])))
    const awards = computeSeasonAwards(session)!
    const legacyTeamAward = {
      id: 'young-team',
      title: 'Équipe-type espoir',
      stage: 'YOUTH' as const,
      metric: 'TEAM' as const,
      winners: awards.awards[0].winners,
      nominees: awards.awards[0].nominees,
    }
    const legacySnapshot = {
      ...awards,
      awards: [legacyTeamAward, ...awards.awards],
    }
    const archive = buildSeasonArchive({ ...session, individualAwards: legacySnapshot }, dataset, [club('a')])
    // getSeasonAwards purges the team award
    const cleanAwards = getSeasonAwards(archive)!
    expect(cleanAwards.awards.some(a => a.id === 'young-team')).toBe(false)
    expect(toArchiveSummary(archive).individualAwards!.awards.some(a => a.id === 'young-team')).toBe(false)

    // Player with legacy team honor in career history
    const playerWithLegacyHonor = {
      ...p,
      careerHistory: [{
        year: 2026,
        clubId: 'a',
        clubName: 'Club A',
        role: 'PLAYER' as const, age: p.age, attack: p.attack, defense: p.defense,
        matchesPlayed: 3,
        goals: 2,
        defensiveStops: 1,
        shots: 4,
        shotsMissed: 2,
        isStarter: true,
        roundReached: 14,
        stageLabel: 'Finale',
        individualHonors: [
          { awardId: 'young-team', title: 'Équipe-type espoir' },
          { awardId: 'ballon-or', title: 'Ballon d’Or' },
        ],
      }],
    }
    const record = computePersonTrophyRecord(playerWithLegacyHonor, [archive])
    expect(record.seasons[0].individualHonors!.some(h => h.awardId === 'young-team')).toBe(false)
    expect(record.seasons[0].individualHonors!.some(h => h.awardId === 'ballon-or')).toBe(true)
  })
})
