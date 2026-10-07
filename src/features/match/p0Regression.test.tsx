import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import fixture from '../../test/fixtures/communes.fixture.json'
import { parseGeography } from '../geography/loadGeography'
import { buildClubsFromCommunes } from '../teams/clubGenerator'
import { buildSeasonArchive, computeTeamRecords } from '../history/palmaresSelectors'
import { getRoundViews } from '../cup/cupSelectors'
import { cupRepository, toArchiveSummary, type CupSession } from '../storage/cupRepository'
import { useOptionalCupApp, type CupAppContextType } from '../../app/CupAppContext'
import { MatchPage } from './MatchPage'
import { archiveClubs } from '../history/archiveClubs'

vi.mock('../../app/CupAppContext', () => ({ useOptionalCupApp: vi.fn() }))
const dataset = parseGeography(fixture)
const clubs = buildClubsFromCommunes(dataset.communes)
const [home, away] = clubs
const match = { id: 'NATIONAL:14:FRANCE:1', homeTeamId: home.id, awayTeamId: away.id }
const result = { matchId: match.id, homeScore: 1, awayScore: 0, winnerId: home.id,
  events: [{ sequence: 1, teamId: home.id, kind: 'GOAL' as const }] }
const completed: CupSession = { id: 'active', seed: 'test-2026', seasonYear: 2026, datasetVersion: dataset.version,
  activeTeamIds: [home.id], roundNumber: 14, round: { matches: [match], byeTeamIds: [] },
  results: { [match.id]: result }, history: [{ roundNumber: 14, ...match, result }],
  championId: home.id, conferenceChampionIds: { [home.conferenceId]: home.id }, clubs }

function showMatch(session: CupSession, archive = false) {
  const persistSession = vi.fn(async (next: CupSession) => { await cupRepository.save(next) })
  vi.mocked(useOptionalCupApp).mockReturnValue({ dataset, session, clubs, teamRecords: new Map(),
    clubsById: new Map(clubs.map((club) => [club.id, club])),
    archives: archive ? [buildSeasonArchive(completed, dataset)] : [], persistSession,
  } as unknown as CupAppContextType)
  render(<MemoryRouter initialEntries={[`/matchs/${encodeURIComponent(match.id)}${archive ? '?saison=2026' : ''}`]}>
    <Routes><Route path="/matchs/:matchId" element={<MatchPage />} /></Routes>
  </MemoryRouter>)
  return persistSession
}

describe('P0 regressions', () => {
  beforeEach(async () => { vi.clearAllMocks(); await cupRepository.clearAll(); localStorage.clear() })

  it('persists a match completed one event at a time', async () => {
    const persist = showMatch({ ...completed, championId: undefined, results: {}, history: [] })
    const next = await screen.findByRole('button', { name: 'Occasion suivante' })
    for (let i = 0; i < 120 && !(next as HTMLButtonElement).disabled; i++) fireEvent.click(next)
    await waitFor(() => expect(persist).toHaveBeenCalledTimes(1))
    expect(persist.mock.calls[0][0].results[match.id].winnerId).toBeTruthy()
    await waitFor(async () => expect((await cupRepository.load())?.results[match.id]).toBeDefined())
    cleanup()
    showMatch((await cupRepository.load())!)
    expect(await screen.findByText('TERMINÉ')).toBeVisible()
  })

  it('shows the final once and counts each match once in the archive', () => {
    expect(getRoundViews(completed)).toHaveLength(1)
    expect(getRoundViews(completed)[0].isCurrent).toBe(false)
    const archive = buildSeasonArchive(completed, dataset)
    expect(archive.totalMatches).toBe(1)
    expect(archive.teamPerformances[home.id].matchesPlayed).toBe(1)
  })

  it('includes all current season titles and performances immediately, without counting them twice after archiving', () => {
    const archive = buildSeasonArchive(completed, dataset)
    const expected = computeTeamRecords([archive])
    const actual = computeTeamRecords([], completed, dataset)
    expect(actual).toEqual(expected)
    expect(computeTeamRecords([archive], completed, dataset)).toEqual(expected)
  })

  it('opens an archived match instead of the same match ID in the active season', async () => {
    showMatch({ ...completed, seasonYear: 2027, results: { [match.id]: { ...result, homeScore: 0, awayScore: 4, winnerId: away.id } }, history: [] }, true)
    await screen.findByText('TERMINÉ')
    expect(document.querySelector('.live-score')?.textContent).toContain('1–0')
    expect(screen.getByText(/Saison 2026/)).toBeVisible()
  })

  it('loads the selected archived match when the cup holds summaries only', async () => {
    const archive = buildSeasonArchive(completed, dataset)
    await cupRepository.saveArchive(archive)
    vi.mocked(useOptionalCupApp).mockReturnValue({ dataset, session: { ...completed, seasonYear: 2027 },
      clubs, clubsById: new Map(clubs.map((club) => [club.id, club])),
      archives: [toArchiveSummary(archive)], teamRecords: new Map(),
    } as unknown as CupAppContextType)
    render(<MemoryRouter initialEntries={[`/matchs/${encodeURIComponent(match.id)}?saison=2026`]}>
      <Routes><Route path="/matchs/:matchId" element={<MatchPage />} /></Routes>
    </MemoryRouter>)

    expect(await screen.findByText('TERMINÉ')).toBeVisible()
    expect(document.querySelector('.live-score')?.textContent).toContain('1–0')
  })

  it('rejects a malformed backup without erasing the existing career', async () => {
    await cupRepository.save(completed)
    await expect(cupRepository.importBackup({ version: 1, exportedAt: new Date().toISOString(), archives: [{}] } as never)).rejects.toThrow()
    expect(await cupRepository.load()).toEqual(completed)
  })

  it('rolls back all database writes if import fails halfway through', async () => {
    await cupRepository.save(completed)
    const oldArchive = buildSeasonArchive(completed, dataset)
    await cupRepository.saveArchive(oldArchive)
    const archive = { ...oldArchive, year: 2025, cannotClone: () => 1 }
    await expect(cupRepository.importBackup({ version: 1, exportedAt: new Date().toISOString(),
      session: { ...completed, seed: 'replacement' }, archives: [archive] })).rejects.toThrow()
    expect(await cupRepository.load()).toEqual(completed)
    expect(await cupRepository.loadArchives()).toEqual([oldArchive])
  })

  it('does not archive a season without saving its successor', async () => {
    await cupRepository.save(completed)
    const invalidArchive = { ...buildSeasonArchive(completed, dataset), cannotClone: () => 1 }
    const nextSeason = { ...completed, seasonYear: 2027, seed: 'test-2027' }

    await expect(cupRepository.commitSeasonTransition(invalidArchive, nextSeason)).rejects.toThrow()

    expect(await cupRepository.load()).toEqual(completed)
    expect(await cupRepository.loadArchives()).toEqual([])
  })

  it('keeps full match history on disk while loading only archive summaries for the cup', async () => {
    const archive = buildSeasonArchive(completed, dataset)
    await cupRepository.saveArchive(archive)

    const summaries = await cupRepository.loadArchiveSummaries()
    expect(summaries).toHaveLength(1)
    expect(summaries[0].year).toBe(archive.year)
    expect(summaries[0].teamPerformances).toEqual({})
    expect(summaries[0].history).toEqual([])
    expect(summaries[0].clubs).toBeUndefined()
    const fullArchive = await cupRepository.loadArchive(archive.year)
    expect(fullArchive?.teamPerformances).toEqual(archive.teamPerformances)
    expect(fullArchive?.history).toEqual(archive.history)
    await cupRepository.clearAll()
    expect(await cupRepository.loadArchiveSummaries()).toEqual([])
  })

  it('imports a valid career and replaces its favorites', async () => {
    const archive = buildSeasonArchive(completed, dataset)
    const backup = { version: 1 as const, exportedAt: new Date().toISOString(), session: completed, archives: [archive], favoriteTeamIds: [home.id] }
    await cupRepository.importBackup(JSON.parse(JSON.stringify(backup)))
    const restored = await cupRepository.exportBackup()
    expect(restored.session?.seed).toBe(completed.seed)
    expect(restored.archives).toEqual(JSON.parse(JSON.stringify([archive])))
    expect((await cupRepository.loadArchiveSummaries())[0].summaryOnly).toBe(true)
    expect((await cupRepository.loadArchiveSummaries())[0].history).toEqual([])
    expect(restored.favoriteTeamIds).toEqual([home.id])
  })

  it('reimports a career containing a retired person without a club', async () => {
    const retired = {
      id: 'p-retired', firstName: 'Alex', lastName: 'Martin', age: 38,
      nationality: 'FR', birthCommuneId: home.communeId,
      birthCommuneName: home.communeName, birthDepartmentId: home.departmentId,
      currentClubId: null, parentClubId: null, primaryRole: 'PLAYER' as const,
      position: 'ATTACKER' as const, attack: 12, defense: 8,
      careerYears: 20, isRetired: true, retiredYear: 2026,
      careerHistory: [{ year: 2026, clubId: null, role: 'PLAYER' as const,
        age: 37, attack: 13, defense: 8 }],
    }
    const backup = {
      version: 1 as const, exportedAt: new Date().toISOString(),
      session: { ...completed, persons: [retired] }, archives: [],
    }

    await cupRepository.importBackup(backup)

    expect((await cupRepository.load())?.persons?.[0].currentClubId).toBeNull()
  })

  it('preserves the career if writing favorites fails', async () => {
    await cupRepository.save(completed)
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Storage full') })
    try {
      await expect(cupRepository.importBackup({ version: 1, exportedAt: new Date().toISOString(),
        session: { ...completed, seed: 'replacement' }, archives: [] })).rejects.toThrow('Storage full')
      expect(await cupRepository.load()).toEqual(completed)
    } finally { spy.mockRestore() }
  })

  it('rejects corrupt nested results before replacing a career', async () => {
    await cupRepository.save(completed)
    await expect(cupRepository.importBackup({ version: 1, exportedAt: new Date().toISOString(),
      session: { ...completed, results: { [match.id]: { ...result, winnerId: 'unknown' } } }, archives: [] })).rejects.toThrow()
    expect(await cupRepository.load()).toEqual(completed)
  })

  it('resolves names of disappeared clubs from legacy archives without inventing historical strength', () => {
    const archive = buildSeasonArchive(completed, dataset)
    const old = { ...archive, clubs: undefined, teamPerformances: { ...archive.teamPerformances,
      [home.id]: { ...archive.teamPerformances[home.id], clubName: 'Ancien nom historique' } } }
    const resolved = archiveClubs(old, dataset).get(home.id)!
    expect(resolved.name).toBe('Ancien nom historique')
    expect(resolved.strength).toBe(0)
  })

  it('hides the total number of actions during match reveal to keep suspense', async () => {
    showMatch({ ...completed, championId: undefined, results: {}, history: [] })
    const liveScore = document.querySelector('.live-score')
    expect(liveScore?.textContent).toContain('Coup d’envoi')
    expect(liveScore?.textContent).not.toContain('événements')

    const nextBtn = await screen.findByRole('button', { name: 'Occasion suivante' })
    fireEvent.click(nextBtn)
    expect(document.querySelector('.live-score')?.textContent).toContain('Action 1')
    expect(document.querySelector('.live-score')?.textContent).not.toContain('événements')
  })

  it('displays enhanced head-to-head confrontations with year, winner, and win stats', async () => {
    const archive = buildSeasonArchive(completed, dataset)
    vi.mocked(useOptionalCupApp).mockReturnValue({
      dataset,
      session: { ...completed, seasonYear: 2027, results: {}, history: [] },
      clubs,
      teamRecords: new Map(),
      clubsById: new Map(clubs.map((club) => [club.id, club])),
      archives: [archive],
      persistSession: vi.fn(),
    } as unknown as CupAppContextType)

    render(
      <MemoryRouter initialEntries={[`/matchs/${encodeURIComponent(match.id)}`]}>
        <Routes><Route path="/matchs/:matchId" element={<MatchPage />} /></Routes>
      </MemoryRouter>
    )

    expect(await screen.findByText(/Confrontations directes/)).toBeVisible()
    expect(screen.getByText(/Saison 2026/)).toBeVisible()
    expect(screen.getByText(/Victoire/)).toBeVisible()
    expect(screen.getByText(/100%/)).toBeVisible()
  })
})
