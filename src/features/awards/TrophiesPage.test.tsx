import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { CupAppContext, type CupAppContextType } from '../../app/CupAppContext'
import { PersonPage } from '../persons/PersonPage'
import { TrophiesPage } from './TrophiesPage'
import { player, club, match, finishedSession } from './awards.fixture'
import { computeSeasonAwards } from './seasonAwards'
import { cupRepository, type SeasonArchive } from '../storage/cupRepository'

const p = player('Alice', 'a')
const session = finishedSession([p], [0, 1, 2].map(i => match(`m${i}`, [p])))
const snapshot = computeSeasonAwards(session)!
const context = { session, archives: [], persons: [p], clubs: [club('a')], clubsById: new Map([['a', club('a')]]) } as unknown as CupAppContextType
function show(value = context, path = '/trophees') {
  return render(<MemoryRouter initialEntries={[path]}><CupAppContext.Provider value={value}><Routes>
    <Route path="/trophees" element={<TrophiesPage />} /><Route path="/personnes/:personId" element={<PersonPage />} />
  </Routes></CupAppContext.Provider></MemoryRouter>)
}
describe('trophies integration', () => {
  beforeEach(() => { localStorage.clear() })
  it('makes the ceremony unavailable before the final and documents the score', () => {
    show({ ...context, session: { ...session, championId: undefined, history: [], roundNumber: 1 } })
    expect(screen.getByRole('heading', { name: /enveloppes sont encore scellées/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Ouvrir/ })).not.toBeInTheDocument()
    fireEvent.click(screen.getByText('Comment le jury attribue les trophées'))
    expect(screen.getByText(/une variation de ±2 %/)).toBeVisible()
  })
  it('reads lightweight snapshots without loading full match histories', () => {
    const loader = vi.spyOn(cupRepository, 'loadArchive')
    const old: SeasonArchive = { year: 2025, seed: '2025', completedAt: '2025-12-31', datasetVersion: 'test',
      nationalChampionId: 'a', conferenceChampions: {}, finalFourTeamIds: [], totalMatches: 3, teamPerformances: {}, history: [], summaryOnly: true,
      individualAwards: { ...snapshot, year: 2025 } }
    show({ ...context, archives: [old] }, '/trophees?saison=2025')
    expect(screen.getByRole('combobox', { name: 'Édition' })).toHaveValue('2025')
    expect(screen.getByRole('heading', { name: 'Les espoirs de la saison' })).toBeInTheDocument()
    expect(loader).not.toHaveBeenCalled()
    loader.mockRestore()
  })
  it('explains cumulative scores for new awards and preserves the rules of saved old awards', () => {
    const current = show()
    fireEvent.click(screen.getByText('Comment le jury attribue les trophées'))
    expect(screen.getByText(/Départemental × 0,25/)).toBeVisible()
    expect(screen.getByText(/les scores de chaque match sont cumulés/)).toBeVisible()
    current.unmount()
    const oldAverage = show({ ...context, session: { ...session, individualAwards: { ...snapshot, scoringMethod: 'PHASE_AVERAGE' } } })
    fireEvent.click(screen.getByText('Comment le jury attribue les trophées'))
    expect(screen.getByText(/Départemental × 0,80/)).toBeVisible()
    expect(screen.getByText(/bonus de participation plafonné à 10 %/)).toBeVisible()
    oldAverage.unmount()
    const { scoringMethod: _method, ...legacy } = snapshot as typeof snapshot & { scoringMethod?: string }
    show({ ...context, session: { ...session, individualAwards: legacy } })
    fireEvent.click(screen.getByText('Comment le jury attribue les trophées'))
    expect(screen.getByText(/6 points par but/)).toBeVisible()
    expect(screen.queryByText(/Départemental × 0,80/)).not.toBeInTheDocument()
  })
  it('loads only the selected legacy archive and recalculates its season awards', async () => {
    const old: SeasonArchive = { year: 2025, seed: '2025', completedAt: '2025-12-31', datasetVersion: 'test',
      nationalChampionId: 'a', conferenceChampions: {}, finalFourTeamIds: [], totalMatches: 3, teamPerformances: {}, history: [], summaryOnly: true }
    const loader = vi.spyOn(cupRepository, 'loadArchive').mockResolvedValue({ ...old, summaryOnly: false, history: session.history, persons: [p], clubs: session.clubs })
    show({ ...context, archives: [old] }, '/trophees?saison=2025')
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Les espoirs de la saison' })).toBeInTheDocument())
    expect(loader).toHaveBeenCalledExactlyOnceWith(2025)
    loader.mockRestore()
  })
  it('shows individual honors on the year and club line and in the player cabinet', () => {
    show(context, '/personnes/Alice')
    expect(screen.getByRole('region', { name: 'Palmarès individuel' })).toHaveTextContent('Ballon d’Or')
    const row = screen.getByRole('cell', { name: '2026' }).closest('tr')!
    expect(row).toHaveTextContent('Club a')
    expect(row).toHaveTextContent('Ballon d’Or')
    expect(row).toHaveTextContent('Champion')
  })
  it('includes all collective season titles beside individual honors before the season is archived', () => {
    const teamRecords = new Map([['a', { seasons: [{ year: 2026, isNationalChampion: true, isConferenceChampion: true,
      isRegionChampion: true, isDepartmentChampion: true, conferenceId: 'CONF_OUEST', regionId: '53', departmentId: '01' }] }]])
    show({ ...context, teamRecords } as unknown as CupAppContextType, '/personnes/Alice')
    const row = screen.getByRole('cell', { name: '2026' }).closest('tr')!
    expect(row).toHaveTextContent('Régional')
    expect(row).toHaveTextContent('Départemental')
    expect(row).toHaveTextContent('Conférence')
    expect(row).toHaveTextContent('Ballon d’Or')
  })
})
