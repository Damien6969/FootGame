import userEvent from '@testing-library/user-event'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import fixture from '../../test/fixtures/communes.fixture.json'
import { parseGeography } from '../geography/loadGeography'
import { CupPage } from './CupPage'
import { MemoryRouter } from 'react-router-dom'
import type { CupRepository, CupSession } from '../storage/cupRepository'

const createMemoryRepository = (): CupRepository => {
  let saved: CupSession | undefined
  return {
    load: async () => saved,
    save: async (session) => { saved = session },
    clear: async () => { saved = undefined },
  }
}

describe('CupPage', () => {
  it('does not crown the winner of a single departmental match when other clubs have byes', async () => {
    const dataset = parseGeography(fixture)
    const [home, away] = dataset.communes
    const repository = createMemoryRepository()
    await repository.save({ id: 'active', seed: 'tournoi-2038', seasonYear: 2038,
      datasetVersion: dataset.version, activeTeamIds: [home.id, away.id, 'bye'], roundNumber: 5,
      round: { matches: [{ id: 'DEPARTMENT:5:59:1', homeTeamId: home.id, awayTeamId: away.id }], byeTeamIds: ['bye'] },
      results: {}, history: [],
    })
    render(<MemoryRouter><CupPage loadDataset={async () => dataset} repository={repository} /></MemoryRouter>)
    await userEvent.click(await screen.findByRole('button', { name: '⚡ Jouer vite' }))
    expect((await repository.load())?.championId).toBeUndefined()
    expect(screen.queryByRole('button', { name: /Lancer la Saison 2039/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Passer à la journée suivante →' })).toBeVisible()
  })
  it('loads communes and prepares a seeded cup', async () => {
    const user = userEvent.setup()
    const repository = createMemoryRepository()
    render(
      <MemoryRouter>
        <CupPage
          loadDataset={async () => parseGeography(fixture)}
          repository={repository}
        />
      </MemoryRouter>,
    )

    expect(await screen.findByText('communes éligibles')).toBeVisible()
    expect(screen.getByText('2')).toBeVisible()
    await user.clear(screen.getByLabelText('Seed de la Coupe'))
    await user.type(screen.getByLabelText('Seed de la Coupe'), 'damien-2026')
    await user.click(screen.getByRole('button', { name: 'Créer la Coupe' }))

    expect(screen.getByText('2 équipes encore en lice')).toBeVisible()
    expect(screen.getByText('Seed : damien-2026')).toBeVisible()
    expect(screen.getByRole('complementary', { name: 'Navigation des territoires' })).toBeVisible()
  })

  it('allows playing a match and shows results', async () => {
    const user = userEvent.setup()
    const repository = createMemoryRepository()
    render(
      <MemoryRouter>
        <CupPage
          loadDataset={async () => parseGeography(fixture)}
          repository={repository}
        />
      </MemoryRouter>,
    )

    await user.clear(await screen.findByLabelText('Seed de la Coupe'))
    await user.type(screen.getByLabelText('Seed de la Coupe'), 'test-play')
    await user.click(screen.getByRole('button', { name: 'Créer la Coupe' }))

    expect(await screen.findByRole('button', { name: '⚡ Jouer vite' })).toBeVisible()
    await user.click(screen.getByRole('button', { name: '⚡ Jouer vite' }))

    expect(await screen.findByText('Terminé ✓')).toBeVisible()
    expect(screen.queryByText('Passer à la journée suivante →')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Lancer la Saison 2027/ })).toBeVisible()
  })

  it('keeps a match unplayed and reports a failed save', async () => {
    const user = userEvent.setup()
    let saved: CupSession | undefined
    const repository: CupRepository = {
      load: async () => saved,
      save: async (next) => {
        if (Object.keys(next.results).length > 0) throw new Error('Quota dépassé')
        saved = next
      },
      clear: async () => { saved = undefined },
    }
    render(<MemoryRouter><CupPage
      loadDataset={async () => parseGeography(fixture)} repository={repository}
    /></MemoryRouter>)

    await user.click(await screen.findByRole('button', { name: 'Créer la Coupe' }))
    await user.click(await screen.findByRole('button', { name: '⚡ Jouer vite' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Quota dépassé')
    expect(Object.keys((await repository.load())?.results ?? {})).toHaveLength(0)
    expect(screen.getByRole('button', { name: '⚡ Jouer vite' })).toBeVisible()
  })

  it('renders the final bracket view with columns and champion', async () => {
    const user = userEvent.setup()
    const repository = createMemoryRepository()
    render(
      <MemoryRouter>
        <CupPage
          loadDataset={async () => parseGeography(fixture)}
          repository={repository}
        />
      </MemoryRouter>,
    )

    await user.clear(await screen.findByLabelText('Seed de la Coupe'))
    await user.type(screen.getByLabelText('Seed de la Coupe'), 'bracket-view-test')
    await user.click(screen.getByRole('button', { name: 'Créer la Coupe' }))

    // Switch to bracket view
    await user.click(await screen.findByRole('button', { name: 'Tableau final' }))

    expect(await screen.findByText('🏆 Tableau Final National')).toBeVisible()
    expect(screen.getByText('🏆 Champion')).toBeVisible()

    // Palmarès legend should be visible
    expect(screen.getByText(/Coupe de France \(Doré\)/i)).toBeInTheDocument()
    expect(screen.getByText(/Conférence \(Violet\)/i)).toBeInTheDocument()
    expect(screen.getByText(/Régional \(Vert\)/i)).toBeInTheDocument()

    // Club names in the bracket must link to /equipes/:id and NOT to /matchs/:id
    const clubLinks = screen.getAllByRole('link', { name: /Ambérieu/i })
    expect(clubLinks.length).toBeGreaterThan(0)
    for (const link of clubLinks) {
      expect(link.getAttribute('href')).toMatch(/^\/equipes\//)
      expect(link.getAttribute('href')).not.toMatch(/^\/matchs\//)
    }
  })

  it('opens directly in bracket view when tab=tableau-final is in URL', async () => {
    const repository = createMemoryRepository()
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={['/coupe?tab=tableau-final']}>
        <CupPage
          loadDataset={async () => parseGeography(fixture)}
          repository={repository}
        />
      </MemoryRouter>,
    )

    await user.clear(await screen.findByLabelText('Seed de la Coupe'))
    await user.type(screen.getByLabelText('Seed de la Coupe'), 'url-tab-test')
    await user.click(screen.getByRole('button', { name: 'Créer la Coupe' }))

    expect(await screen.findByText('🏆 Tableau Final National')).toBeVisible()
  })

  it('provides global top actions: Simuler la compétition and Simuler le tour', async () => {
    const repository = createMemoryRepository()
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <CupPage
          loadDataset={async () => parseGeography(fixture)}
          repository={repository}
        />
      </MemoryRouter>,
    )

    await user.clear(await screen.findByLabelText('Seed de la Coupe'))
    await user.type(screen.getByLabelText('Seed de la Coupe'), 'top-actions-test')
    await user.click(screen.getByRole('button', { name: 'Créer la Coupe' }))

    // Top global actions should contain "⚡ Simuler la compétition" and "⚡ Simuler le tour"
    const simCompBtns = await screen.findAllByRole('button', { name: '⚡ Simuler la compétition' })
    expect(simCompBtns.length).toBeGreaterThanOrEqual(1)
    const simTourBtn = screen.getByRole('button', { name: '⚡ Simuler le tour' })
    expect(simTourBtn).toBeVisible()

    // Simulate entire competition via top button
    await user.click(simCompBtns[0])

    // A champion is crowned and only ONE single "Lancer la Saison" button appears at the top
    const nextSeasonBtn = await screen.findByRole('button', { name: /Lancer la Saison 2027/ })
    expect(nextSeasonBtn).toBeVisible()

    // Advancing to next season transitions to 2027
    await user.click(nextSeasonBtn)
    expect(await screen.findByText('Seed : tournoi-2027')).toBeVisible()
  })

  it('renders the round flow banner explaining progression through the round', async () => {
    const repository = createMemoryRepository()
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <CupPage
          loadDataset={async () => parseGeography(fixture)}
          repository={repository}
        />
      </MemoryRouter>,
    )

    await user.clear(await screen.findByLabelText('Seed de la Coupe'))
    await user.type(screen.getByLabelText('Seed de la Coupe'), 'flow-banner-test')
    await user.click(screen.getByRole('button', { name: 'Créer la Coupe' }))

    // Flow banner should display clubs au départ, matchs, and qualifiés
    expect(await screen.findByRole('region', { name: /Déroulement et flux du tour/i })).toBeVisible()
    expect(screen.getByText(/au départ du Tour 1/i)).toBeVisible()
    expect(screen.getByText(/qualifié/i)).toBeVisible()
  })
})
