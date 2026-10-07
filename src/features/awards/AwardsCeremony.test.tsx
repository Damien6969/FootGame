import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { AwardsCeremony } from './AwardsCeremony'
import { computeSeasonAwards } from './seasonAwards'
import { player, match, finishedSession } from './awards.fixture'
import type { SeasonAwards } from './types'

const p = player('Alice', 'a')
const snapshot = computeSeasonAwards(finishedSession([p], [0, 1, 2].map(i => match(`m${i}`, [p]))))!
const small = { ...snapshot, awards: [snapshot.awards[0], snapshot.awards.at(-1)!] }
const show = (data: SeasonAwards = small) => render(<MemoryRouter><AwardsCeremony snapshot={data} storageKey="test-ceremony" /></MemoryRouter>)

describe('AwardsCeremony', () => {
  beforeEach(() => { localStorage.clear(); vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })
  it('keeps results hidden until the envelope opens and ends with the Ballon d’Or', () => {
    show()
    expect(screen.queryByRole('link', { name: /Alice Lauréat/ })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Ouvrir l’enveloppe/ }))
    expect(screen.queryByRole('link', { name: /Alice Lauréat/ })).not.toBeInTheDocument()
    act(() => vi.advanceTimersByTime(1300))
    expect(screen.getAllByRole('link', { name: /Alice Lauréat/ }).length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('button', { name: /Prix suivant/ }))
    expect(screen.getByRole('heading', { name: 'Ballon d’Or' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Ouvrir l’enveloppe/ }))
    act(() => vi.advanceTimersByTime(1300))
    expect(screen.getByText(/La cérémonie est terminée/)).toBeInTheDocument()
  })
  it('resumes the local progress and allows a fresh replay', () => {
    const view = show()
    fireEvent.click(screen.getByRole('button', { name: /Ouvrir l’enveloppe/ }))
    act(() => vi.advanceTimersByTime(1300))
    view.unmount()
    show()
    expect(screen.getByRole('heading', { name: 'Ballon d’Or' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Rejouer la cérémonie/ }))
    expect(screen.getByRole('heading', { name: snapshot.awards[0].title })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Alice Lauréat/ })).not.toBeInTheDocument()
  })
  it('reveals all youth and conference awards together while keeping national stages separate', () => {
    const q = player('Bob', 'b', 'DEFENDER')
    const s = computeSeasonAwards(finishedSession([p, q], [0, 1, 2].flatMap(i => [match(`a${i}`, [p]), match(`b${i}`, [q])])))!
    show(s)
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuemax', '6')
    expect(screen.queryByRole('link', { name: /Lauréat/ })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Ouvrir l’enveloppe/i }))
    act(() => vi.advanceTimersByTime(1300))
    const stage = within(screen.getByRole('region', { name: 'Scène de remise des prix' }))
    for (const title of ['Meilleur défenseur espoir', 'Meilleur attaquant espoir', 'Meilleur espoir']) {
      expect(stage.getByRole('heading', { name: title })).toBeInTheDocument()
    }
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '1')
    expect(within(screen.getByRole('heading', { name: 'Déjà récompensés' }).parentElement!).getAllByRole('article')).toHaveLength(3)
    fireEvent.click(screen.getByRole('button', { name: /Prix suivant/ }))
    expect(stage.queryByRole('link', { name: /Lauréat/ })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Ouvrir l’enveloppe/ }))
    act(() => vi.advanceTimersByTime(1300))
    for (const title of ['Meilleur défenseur · Conférence Ouest (Atlantique)', 'Meilleur attaquant · Conférence Ouest (Atlantique)', 'Meilleur joueur · Conférence Ouest (Atlantique)']) {
      expect(stage.getByRole('heading', { name: title })).toBeInTheDocument()
    }
    expect(within(screen.getByRole('heading', { name: 'Déjà récompensés' }).parentElement!).getAllByRole('article')).toHaveLength(6)
    for (const title of ['Soulier d’Or · Meilleur buteur', 'Bouclier d’Or · Roi des interventions', 'Meilleurs défenseur & attaquant de la saison', 'Ballon d’Or']) {
      fireEvent.click(screen.getByRole('button', { name: /Prix suivant/ }))
      expect(stage.getByRole('heading', { name: title })).toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: /Ouvrir l’enveloppe/ }))
      act(() => vi.advanceTimersByTime(1300))
    }
    expect(screen.getByText(/La cérémonie est terminée/)).toBeInTheDocument()
    expect(within(screen.getByRole('heading', { name: 'Le livre d’or de la saison' }).parentElement!).getAllByRole('article')).toHaveLength(11)
  })
  it.each([
    [1, 0, /Les espoirs/],
    [2, 1, /Conférence Ouest/],
    [4, 2, /Soulier d’Or/],
    [8, 6, /Ballon d’Or/],
  ])('migrates %i old revelations without skipping unseen awards', (oldCount, newCount, title) => {
    localStorage.setItem('test-ceremony', String(oldCount))
    show(snapshot)
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', String(newCount))
    expect(within(screen.getByRole('region', { name: 'Scène de remise des prix' })).getByRole('heading', { name: title })).toBeInTheDocument()
  })
  it('keeps a grouped award visible when a specialist has no eligible winner', () => {
    show(snapshot)
    fireEvent.click(screen.getByRole('button', { name: /Ouvrir l’enveloppe/ }))
    act(() => vi.advanceTimersByTime(1300))
    const stage = within(screen.getByRole('region', { name: 'Scène de remise des prix' }))
    expect(stage.getByRole('heading', { name: 'Meilleur défenseur espoir' })).toBeInTheDocument()
    expect(stage.getByText('Prix non attribué')).toBeInTheDocument()
    expect(stage.getByRole('heading', { name: 'Meilleur espoir' })).toBeInTheDocument()
  })
  it('resumes the grouped progress and replays all grouped awards', () => {
    const view = show(snapshot)
    fireEvent.click(screen.getByRole('button', { name: /Ouvrir l’enveloppe/ }))
    act(() => vi.advanceTimersByTime(1300))
    view.unmount()
    show(snapshot)
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '1')
    const stage = within(screen.getByRole('region', { name: 'Scène de remise des prix' }))
    expect(stage.getByRole('heading', { name: 'Conférence Ouest (Atlantique)' })).toBeInTheDocument()
    expect(stage.queryByRole('link', { name: /Lauréat/ })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Rejouer la cérémonie/ }))
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0')
    expect(stage.getByRole('heading', { name: 'Les espoirs de la saison' })).toBeInTheDocument()
    expect(stage.queryByRole('link', { name: /Lauréat/ })).not.toBeInTheDocument()
  })
  it('displays nominee clubs and elimination rounds in nominee badges', () => {
    const q = player('Bob', 'b')
    const bLoss = {
      roundNumber: 8,
      homeTeamId: 'b',
      awayTeamId: 'opponent',
      result: { matchId: 'loss-b', homeScore: 0, awayScore: 1, winnerId: 'opponent', events: [] },
    }
    const session = finishedSession([p, q], [
      match('m0', [p]),
      match('m1', [p]),
      match('m2', [p]),
      match('mb0', [q]),
      match('mb1', [q]),
      match('mb2', [q]),
      bLoss,
    ])
    const awards = computeSeasonAwards(session)!
    const ballonOr = awards.awards.find(a => a.id === 'ballon-or')!
    expect(ballonOr.nominees.length).toBeGreaterThan(1)
    render(<MemoryRouter><AwardsCeremony snapshot={{ ...awards, awards: [ballonOr] }} storageKey="test-nominees" /></MemoryRouter>)

    // Nominee badges display player name, club, and elimination status
    expect(screen.getByText(/Alice Lauréat/)).toBeInTheDocument()
    expect(screen.getByText(/\(Club a · Champion 🏆\)/)).toBeInTheDocument()
    expect(screen.getByText(/Bob Lauréat/)).toBeInTheDocument()
    expect(screen.getByText(/\(Club b · Éliminé au Tour 8\)/)).toBeInTheDocument()
  })

  it('displays past honors badges next to nominees and winner with icons and tooltips', () => {
    const q = player('Bob', 'b')
    const session = finishedSession([p, q], [
      match('m0', [p]),
      match('m1', [p]),
      match('m2', [p]),
      match('mb0', [q]),
      match('mb1', [q]),
      match('mb2', [q]),
    ])
    const awards = computeSeasonAwards(session)!
    const ballonOr = awards.awards.find(a => a.id === 'ballon-or')!

    const pastMap = new Map([
      [p.id, {
        personId: p.id,
        ballonOrCount: 1,
        ballonOrYears: [2025],
        topScorerCount: 2,
        topScorerYears: [2024, 2025],
        topStopsCount: 0,
        topStopsYears: [],
        bestDefenderCount: 0,
        bestDefenderYears: [],
        bestAttackerCount: 0,
        bestAttackerYears: [],
        youthCount: 0,
        youthYears: [],
        youthDetails: [],
        conferenceCount: 1,
        conferenceYears: [2025],
        conferenceDetails: [{ year: 2025, title: 'Meilleur joueur · Ouest' }],
        totalCount: 4,
      }],
    ])

    render(
      <MemoryRouter>
        <AwardsCeremony
          snapshot={{ ...awards, awards: [ballonOr] }}
          storageKey="test-past-honors"
          pastHonorsMap={pastMap}
        />
      </MemoryRouter>
    )

    // Dans la liste des nommés avant révélation
    expect(screen.getByLabelText(/1 Ballon d’Or/)).toBeInTheDocument()
    expect(screen.getByLabelText(/2 Soulier d’Or/)).toBeInTheDocument()
    // Lors d'une étape nationale/finale, les titres de conférence ne sont pas affichés
    expect(screen.queryByLabelText(/Trophée de Conférence/)).not.toBeInTheDocument()

    // Révélation du vainqueur
    fireEvent.click(screen.getByRole('button', { name: /Ouvrir l’enveloppe/ }))
    act(() => vi.advanceTimersByTime(1300))

    // Le vainqueur et les autres nommés affichent le palmarès passé
    const ballonBadges = screen.getAllByLabelText(/1 Ballon d’Or/)
    expect(ballonBadges.length).toBeGreaterThanOrEqual(1)
    const scorerBadges = screen.getAllByLabelText(/2 Soulier d’Or/)
    expect(scorerBadges.length).toBeGreaterThanOrEqual(1)
  })
})
