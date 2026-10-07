import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import fixture from '../../test/fixtures/communes.fixture.json'
import { parseGeography } from '../geography/loadGeography'
import { TeamPage } from './TeamPage'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { CupAppContext, type CupAppContextType } from '../../app/CupAppContext'
import { buildClubsFromCommunes } from './clubGenerator'

describe('TeamPage - Club Renaming', () => {
  it.each(['archive', 'career'] as const)('does not attribute a loan at a subsequently absorbed club to the parent club (%s)', async source => {
    const dataset = parseGeography(fixture)
    const clubs = buildClubsFromCommunes(dataset.communes)
    const [parent, borrower] = clubs
    const target = { ...parent, fusedClubs: [{ id: borrower.id, name: borrower.name, communeName: borrower.communeName }] }
    const player = (id: string, firstName: string, clubId: string) => ({
      id, firstName, lastName: 'Test', age: 25, primaryRole: 'PLAYER', position: 'ATTACKER',
      assignedPosition: 'ATTACKER', currentClubId: clubId, parentClubId: parent.id,
      loanedFromClubId: clubId === borrower.id ? parent.id : undefined,
      attack: 20, defense: 10, careerYears: 5, isRetired: false,
      careerHistory: [{ year: 2025, clubId, role: 'PLAYER', assignedPosition: 'ATTACKER',
        age: 24, attack: 19, defense: 9, isStarter: true, isLoan: clubId === borrower.id }],
    })
    const persons = [player('loaned', 'Prêté ailleurs', borrower.id), player('actual', 'Vrai titulaire', parent.id)]
    const archives = [{ year: 2025, seed: 'tournoi-2025', history: [], clubs,
      persons: source === 'archive' ? persons : undefined,
      teamPerformances: { [parent.id]: { teamId: parent.id, clubName: parent.name,
        roundReached: 4, matchesPlayed: 1, matchesWon: 0, goalsScored: 0, goalsConceded: 1, goalDifference: -1 } },
    }]
    const context: any = { dataset, clubs: [target, borrower], clubsById: new Map([[target.id, target], [borrower.id, borrower]]),
      persons, archives, teamRecords: new Map([[parent.id, {
        teamId: parent.id, nationalTitles: 0, nationalTitleYears: [], conferenceTitles: 0,
        conferenceTitleDetails: [], regionTitles: 0, regionTitleDetails: [], departmentTitles: 0,
        departmentTitleDetails: [], bestPerformance: { year: 2025, roundNumber: 4, stageLabel: 'Tour 4' },
        seasons: [{ ...archives[0].teamPerformances[parent.id], year: 2025, seed: 'tournoi-2025', stageLabel: 'Tour 4' }],
      }]]), session: null, favoriteTeamIds: [],
      isFavorite: () => false, getFavoriteColor: () => '#fff', toggleFavorite: () => {} }
    render(<CupAppContext.Provider value={context}><MemoryRouter initialEntries={[`/equipes/${parent.id}`]}>
      <Routes><Route path="/equipes/:teamId" element={<TeamPage />} /></Routes>
    </MemoryRouter></CupAppContext.Provider>)
    const season = await screen.findByRole('row', { name: /Saison 2025/ })
    expect(within(season).queryByText('Prêté ailleurs Test')).not.toBeInTheDocument()
    expect(within(season).getByText('Vrai titulaire Test')).toBeVisible()
  })
  it('opens the last archived identity of an absorbed club rather than inventing a current club', async () => {
    const dataset = parseGeography(fixture)
    const initialClubs = buildClubsFromCommunes(dataset.communes)
    const archivedClub = { ...initialClubs[0], id: `${initialClubs[0].id}-7`, name: 'Ancienne alliance historique' }
    const archives = [
      { year: 2024, seed: 'tournoi-2024', clubs: [{ ...archivedClub, name: 'Premier nom historique' }], teamPerformances: {}, history: [], fusions: [] },
      { year: 2025, seed: 'tournoi-2025', clubs: [archivedClub], teamPerformances: {}, history: [], fusions: [] },
    ]
    const contextValue: any = { dataset, clubs: initialClubs, clubsById: new Map(initialClubs.map(c => [c.id, c])),
      persons: [], session: { seed: 'tournoi-2026', seasonYear: 2026, roundNumber: 1,
        activeTeamIds: initialClubs.map(c => c.id), round: { matches: [], byeTeamIds: [] }, results: {}, history: [] },
      archives, teamRecords: new Map(), favoriteTeamIds: [],
      isFavorite: () => false, getFavoriteColor: () => '#fff', toggleFavorite: () => {} }
    render(<CupAppContext.Provider value={contextValue}>
      <MemoryRouter initialEntries={[`/equipes/${archivedClub.id}`]}>
        <Routes><Route path="/equipes/:teamId" element={<TeamPage />} /></Routes>
      </MemoryRouter>
    </CupAppContext.Provider>)
    expect(await screen.findByRole('heading', { level: 2, name: 'Ancienne alliance historique' })).toBeVisible()
    expect(screen.queryByText(/Saison 2026 \(En cours\)/)).not.toBeInTheDocument()
  })

  it('allows renaming a club and saves the new name', async () => {
    const dataset = parseGeography(fixture)
    const initialClubs = buildClubsFromCommunes(dataset.communes)
    const targetClub = initialClubs[0]
    const renameClubMock = vi.fn().mockResolvedValue(undefined)

    const contextValue: CupAppContextType = {
      dataset,
      clubs: initialClubs,
      clubsById: new Map(initialClubs.map((c) => [c.id, c])),
      clubsByCommuneId: new Map(initialClubs.map((c) => [c.communeId, [c]])),
      persons: [],
      session: null,
      archives: [],
      teamRecords: new Map(),
      ready: true,
      error: null,
      persistSession: async () => {},
      resetSession: async () => {},
      resetAllHistory: async () => {},
      createCup: () => {},
      advanceToNextSeason: async () => {},
      reloadSession: async () => {},
      renameClub: renameClubMock,
      favoriteTeamIds: [],
      favoritePersonIds: [],
      togglePlayerFavorite: vi.fn(),
      toggleFavorite: () => {},
      isFavorite: () => false,
      getFavoriteColor: () => '#fff',
      exportBackup: async () => {},
      importBackup: async () => true,
      lastAutoBackupResult: null,
      dismissAutoBackupNotification: () => {},
      isResetModalOpen: false,
      openResetModal: () => {},
      closeResetModal: () => {},
    }

    render(
      <CupAppContext.Provider value={contextValue}>
        <MemoryRouter initialEntries={[`/equipes/${targetClub.id}`]}>
          <Routes>
            <Route path="/equipes/:teamId" element={<TeamPage />} />
          </Routes>
        </MemoryRouter>
      </CupAppContext.Provider>,
    )

    // Verify initial club name and edit button
    expect(await screen.findByRole('heading', { level: 2, name: targetClub.name })).toBeVisible()
    const editBtn = screen.getByRole('button', { name: /Modifier le nom/i })
    expect(editBtn).toBeVisible()

    // Click edit button
    fireEvent.click(editBtn)

    // The input field should now be visible with current name
    const input = screen.getByLabelText(/Nom du club/i) as HTMLInputElement
    expect(input).toBeVisible()
    expect(input.value).toBe(targetClub.name)

    // Change input value
    fireEvent.change(input, { target: { value: 'Olympique Bugiste' } })
    expect(input.value).toBe('Olympique Bugiste')

    // Submit save
    const saveBtn = screen.getByRole('button', { name: /Enregistrer/i })
    fireEvent.click(saveBtn)

    // Verify renameClub was called with club id and trimmed new name
    expect(renameClubMock).toHaveBeenCalledWith(targetClub.id, 'Olympique Bugiste')
  })

  it('cancels renaming when clicking Annuler', async () => {
    const dataset = parseGeography(fixture)
    const initialClubs = buildClubsFromCommunes(dataset.communes)
    const targetClub = initialClubs[0]
    const renameClubMock = vi.fn()

    const contextValue: CupAppContextType = {
      dataset,
      clubs: initialClubs,
      clubsById: new Map(initialClubs.map((c) => [c.id, c])),
      clubsByCommuneId: new Map(initialClubs.map((c) => [c.communeId, [c]])),
      persons: [],
      session: null,
      archives: [],
      teamRecords: new Map(),
      ready: true,
      error: null,
      persistSession: async () => {},
      resetSession: async () => {},
      resetAllHistory: async () => {},
      createCup: () => {},
      advanceToNextSeason: async () => {},
      reloadSession: async () => {},
      renameClub: renameClubMock,
      favoriteTeamIds: [],
      favoritePersonIds: [],
      togglePlayerFavorite: vi.fn(),
      toggleFavorite: () => {},
      isFavorite: () => false,
      getFavoriteColor: () => '#fff',
      exportBackup: async () => {},
      importBackup: async () => true,
      lastAutoBackupResult: null,
      dismissAutoBackupNotification: () => {},
      isResetModalOpen: false,
      openResetModal: () => {},
      closeResetModal: () => {},
    }

    render(
      <CupAppContext.Provider value={contextValue}>
        <MemoryRouter initialEntries={[`/equipes/${targetClub.id}`]}>
          <Routes>
            <Route path="/equipes/:teamId" element={<TeamPage />} />
          </Routes>
        </MemoryRouter>
      </CupAppContext.Provider>,
    )

    const editBtn = await screen.findByRole('button', { name: /Modifier le nom/i })
    fireEvent.click(editBtn)

    const cancelBtn = screen.getByRole('button', { name: /Annuler/i })
    fireEvent.click(cancelBtn)

    // Should return to normal view without calling rename
    expect(renameClubMock).not.toHaveBeenCalled()
    expect(screen.getByRole('heading', { level: 2, name: targetClub.name })).toBeVisible()
  })

  it('renders live cup status card with opponent and direct match button when active in cup', async () => {
    const dataset = parseGeography(fixture)
    const initialClubs = buildClubsFromCommunes(dataset.communes)
    const targetClub = initialClubs[0]
    const opponentClub = initialClubs[1]

    const contextValue: CupAppContextType = {
      dataset,
      clubs: initialClubs,
      clubsById: new Map(initialClubs.map((c) => [c.id, c])),
      clubsByCommuneId: new Map(initialClubs.map((c) => [c.communeId, [c]])),
      persons: [],
      session: {
        id: 'active',
        seed: 'test',
        seasonYear: 2026,
        datasetVersion: dataset.version,
        activeTeamIds: [targetClub.id, opponentClub.id],
        roundNumber: 1,
        round: {
          matches: [{
            id: '2026:D1:01:1',
            homeTeamId: targetClub.id,
            awayTeamId: opponentClub.id,
          }],
          byeTeamIds: [],
        },
        results: {},
        history: [],
      },
      archives: [],
      teamRecords: new Map(),
      ready: true,
      error: null,
      persistSession: async () => {},
      resetSession: async () => {},
      resetAllHistory: async () => {},
      createCup: () => {},
      advanceToNextSeason: async () => {},
      reloadSession: async () => {},
      renameClub: vi.fn(),
      favoriteTeamIds: [],
      favoritePersonIds: [],
      togglePlayerFavorite: vi.fn(),
      toggleFavorite: () => {},
      isFavorite: () => false,
      getFavoriteColor: () => '#fff',
      exportBackup: async () => {},
      importBackup: async () => true,
      lastAutoBackupResult: null,
      dismissAutoBackupNotification: () => {},
      isResetModalOpen: false,
      openResetModal: () => {},
      closeResetModal: () => {},
    }

    render(
      <CupAppContext.Provider value={contextValue}>
        <MemoryRouter initialEntries={[`/equipes/${targetClub.id}`]}>
          <Routes>
            <Route path="/equipes/:teamId" element={<TeamPage />} />
          </Routes>
        </MemoryRouter>
      </CupAppContext.Provider>,
    )

    // Switch to Parcours en cours tab
    const parcoursTab = screen.getByRole('tab', { name: /Parcours en cours/i })
    expect(parcoursTab).toBeVisible()
    fireEvent.click(parcoursTab)

    const enLiceElements = await screen.findAllByText(/En lice · Tour 1/i)
    expect(enLiceElements.length).toBeGreaterThanOrEqual(1)
    expect(enLiceElements[0]).toBeVisible()
    expect(screen.getByText(/Prochain match programmé/i)).toBeVisible()
    expect(screen.getByRole('link', { name: /Jouer \/ Voir le direct du match/i })).toBeVisible()
  })

  it('renders biggest win, nemesis, favorite prey and reverse-chronological multi-season table with active season', async () => {
    const dataset = parseGeography({
      version: 'test-v1',
      sourceLabel: 'Test dataset',
      sourceUrl: 'http://test',
      communes: [
        { id: '01001', name: 'Club Alpha', population: 10000, departmentId: '01', regionId: '84', zoneId: 'SUD_EST' },
        { id: '01002', name: 'Club Beta', population: 50000, departmentId: '01', regionId: '84', zoneId: 'SUD_EST' },
        { id: '01003', name: 'Club Gamma', population: 5000, departmentId: '01', regionId: '84', zoneId: 'SUD_EST' },
      ],
    })
    const initialClubs = buildClubsFromCommunes(dataset.communes)
    const clubA = initialClubs[0]
    const clubB = initialClubs[1] // strong opponent
    const clubC = initialClubs[2] // prey

    const archivesMock: any[] = [
      {
        year: 2024,
        seed: 'seed-2024',
        completedAt: '2024-06-01T00:00:00Z',
        datasetVersion: dataset.version,
        nationalChampionId: clubB.id,
        finalFourTeamIds: [clubB.id],
        totalMatches: 2,
        teamPerformances: {
          [clubA.id]: {
            teamId: clubA.id,
            clubName: clubA.name,
            roundReached: 2,
            stageLabel: 'Tour 2 (Départemental)',
            isNationalChampion: false,
            isConferenceChampion: false,
            matchesWon: 1,
            matchesPlayed: 2,
            goalsScored: 3,
            goalsConceded: 2,
            goalDifference: 1,
            eliminatedInRound: 2,
            eliminatedByTeamId: clubB.id,
          },
        },
        history: [
          // Club A won against Club C in 2024
          {
            roundNumber: 1,
            homeTeamId: clubA.id,
            awayTeamId: clubC.id,
            result: {
              matchId: '2024:R1:A-C',
              homeScore: 3,
              awayScore: 0,
              winnerId: clubA.id,
              events: [],
            },
          },
          // Club A lost against Club B in 2024
          {
            roundNumber: 2,
            homeTeamId: clubA.id,
            awayTeamId: clubB.id,
            result: {
              matchId: '2024:R2:A-B',
              homeScore: 0,
              awayScore: 2,
              winnerId: clubB.id,
              events: [],
            },
          },
        ],
        clubs: initialClubs,
      },
      {
        year: 2025,
        seed: 'seed-2025',
        completedAt: '2025-06-01T00:00:00Z',
        datasetVersion: dataset.version,
        nationalChampionId: clubA.id,
        finalFourTeamIds: [clubA.id],
        totalMatches: 3,
        teamPerformances: {
          [clubA.id]: {
            teamId: clubA.id,
            clubName: clubA.name,
            roundReached: 14,
            stageLabel: 'Champion de France 🏆',
            isNationalChampion: true,
            isConferenceChampion: true,
            matchesWon: 2,
            matchesPlayed: 2,
            goalsScored: 5,
            goalsConceded: 1,
            goalDifference: 4,
          },
        },
        history: [
          // Club A beat Club B (exploit!) in 2025
          {
            roundNumber: 14,
            homeTeamId: clubA.id,
            awayTeamId: clubB.id,
            result: {
              matchId: '2025:Final:A-B',
              homeScore: 2,
              awayScore: 1,
              winnerId: clubA.id,
              isExtraTime: true,
              events: [],
            },
          },
          // Club A beat Club C again
          {
            roundNumber: 1,
            homeTeamId: clubA.id,
            awayTeamId: clubC.id,
            result: {
              matchId: '2025:R1:A-C',
              homeScore: 3,
              awayScore: 0,
              winnerId: clubA.id,
              events: [],
            },
          },
        ],
        clubs: initialClubs,
      },
    ]

    const contextValue: CupAppContextType = {
      dataset,
      clubs: initialClubs,
      clubsById: new Map(initialClubs.map((c) => [c.id, c])),
      clubsByCommuneId: new Map(initialClubs.map((c) => [c.communeId, [c]])),
      persons: [],
      session: {
        id: 'active',
        seed: 'seed-2026',
        seasonYear: 2026,
        datasetVersion: dataset.version,
        activeTeamIds: [clubA.id],
        roundNumber: 3,
        round: {
          matches: [],
          byeTeamIds: [],
        },
        results: {},
        history: [
          // In 2026, Club A lost to Club B
          {
            roundNumber: 2,
            homeTeamId: clubA.id,
            awayTeamId: clubB.id,
            result: {
              matchId: '2026:R2:A-B',
              homeScore: 1,
              awayScore: 2,
              winnerId: clubB.id,
              events: [],
            },
          },
        ],
      },
      archives: archivesMock,
      teamRecords: new Map([
        [
          clubA.id,
          {
            teamId: clubA.id,
            nationalTitles: 1,
            nationalTitleYears: [2025],
            conferenceTitles: 1,
            conferenceTitleDetails: [{ year: 2025, conferenceId: 'CONF_SUD_EST' }],
            regionTitles: 0,
            regionTitleDetails: [],
            departmentTitles: 0,
            departmentTitleDetails: [],
            bestPerformance: { year: 2025, roundNumber: 14, stageLabel: 'Champion de France 🏆' },
            seasons: [
              { ...archivesMock[0].teamPerformances[clubA.id], year: 2024 },
              { ...archivesMock[1].teamPerformances[clubA.id], year: 2025 },
            ],
          },
        ],
      ]),
      ready: true,
      error: null,
      persistSession: async () => {},
      resetSession: async () => {},
      resetAllHistory: async () => {},
      createCup: () => {},
      advanceToNextSeason: async () => {},
      reloadSession: async () => {},
      renameClub: vi.fn(),
      favoriteTeamIds: [],
      favoritePersonIds: [],
      togglePlayerFavorite: vi.fn(),
      toggleFavorite: () => {},
      isFavorite: () => false,
      getFavoriteColor: () => '#fff',
      exportBackup: async () => {},
      importBackup: async () => true,
      lastAutoBackupResult: null,
      dismissAutoBackupNotification: () => {},
      isResetModalOpen: false,
      openResetModal: () => {},
      closeResetModal: () => {},
    }

    const { container } = render(
      <CupAppContext.Provider value={contextValue}>
        <MemoryRouter initialEntries={[`/equipes/${clubA.id}`]}>
          <Routes>
            <Route path="/equipes/:teamId" element={<TeamPage />} />
          </Routes>
        </MemoryRouter>
      </CupAppContext.Provider>,
    )

    // Check Biggest Win (Plus grosse équipe battue)
    expect(screen.getByText(/Plus Grosse Équipe Battue/i)).toBeInTheDocument()
    expect(screen.getByText(new RegExp(`Force ${clubB.strength.toFixed(1)}/30`))).toBeInTheDocument()

    // Check Nemesis (Bête noire: Club B with 2 defeats)
    expect(screen.getByText(/Bête Noire/i)).toBeInTheDocument()
    expect(screen.getByText(/2 défaites subies/i)).toBeInTheDocument()

    // Check Favorite Prey (Proie favorite: Club C with 2 wins)
    expect(screen.getByText(/Proie Favorite/i)).toBeInTheDocument()
    expect(screen.getByText(/2 victoires remportées/i)).toBeInTheDocument()

    // Check that current season is rendered with special badge at the top
    expect(screen.getByText(/Saison 2026 \(En cours\)/i)).toBeInTheDocument()
    const currentSeasonRow = container.querySelector('.season-row--current')
    expect(currentSeasonRow).toBeInTheDocument()

    // Check reverse chronological order: 2026 (current) -> 2025 -> 2024
    const seasonRows = container.querySelectorAll('.matches-table tbody tr')
    expect(seasonRows.length).toBeGreaterThanOrEqual(3)
    expect(seasonRows[0].textContent).toContain('2026')
    expect(seasonRows[1].textContent).toContain('2025')
    expect(seasonRows[2].textContent).toContain('2024')
  })

  it('does not display nemesis or favorite prey when more than 3 teams are tied', () => {
    const dataset = parseGeography({
      version: 'test-v1',
      sourceLabel: 'Test',
      sourceUrl: 'http://test',
      communes: [
        { id: '01001', name: 'Club Alpha', population: 10000, departmentId: '01', regionId: '84', zoneId: 'SUD_EST' },
        { id: '01002', name: 'Club 2', population: 10000, departmentId: '01', regionId: '84', zoneId: 'SUD_EST' },
        { id: '01003', name: 'Club 3', population: 10000, departmentId: '01', regionId: '84', zoneId: 'SUD_EST' },
        { id: '01004', name: 'Club 4', population: 10000, departmentId: '01', regionId: '84', zoneId: 'SUD_EST' },
        { id: '01005', name: 'Club 5', population: 10000, departmentId: '01', regionId: '84', zoneId: 'SUD_EST' },
      ],
    })
    const clubs = buildClubsFromCommunes(dataset.communes)
    const target = clubs[0]

    // 4 distinct opponents each have 1 defeat against target (4-way tie for nemesis)
    const historyWith4Ties: any[] = [
      { roundNumber: 1, homeTeamId: target.id, awayTeamId: clubs[1].id, result: { matchId: 'M1', homeScore: 0, awayScore: 1, winnerId: clubs[1].id, events: [] } },
      { roundNumber: 1, homeTeamId: target.id, awayTeamId: clubs[2].id, result: { matchId: 'M2', homeScore: 0, awayScore: 1, winnerId: clubs[2].id, events: [] } },
      { roundNumber: 1, homeTeamId: target.id, awayTeamId: clubs[3].id, result: { matchId: 'M3', homeScore: 0, awayScore: 1, winnerId: clubs[3].id, events: [] } },
      { roundNumber: 1, homeTeamId: target.id, awayTeamId: clubs[4].id, result: { matchId: 'M4', homeScore: 0, awayScore: 1, winnerId: clubs[4].id, events: [] } },
    ]

    const contextValue: any = {
      dataset,
      clubs,
      clubsById: new Map(clubs.map((c) => [c.id, c])),
      clubsByCommuneId: new Map(clubs.map((c) => [c.communeId, [c]])),
      session: {
        id: 'active',
        seed: 'seed-2026',
        seasonYear: 2026,
        datasetVersion: dataset.version,
        activeTeamIds: [target.id],
        roundNumber: 2,
        round: { matches: [], byeTeamIds: [] },
        results: {},
        history: historyWith4Ties,
      },
      archives: [],
      teamRecords: new Map(),
      ready: true,
      renameClub: vi.fn(),
      favoriteTeamIds: [],
      favoritePersonIds: [],
      togglePlayerFavorite: vi.fn(),
      isFavorite: () => false,
      getFavoriteColor: () => '#fff',
    }

    render(
      <CupAppContext.Provider value={contextValue}>
        <MemoryRouter initialEntries={[`/equipes/${target.id}`]}>
          <Routes>
            <Route path="/equipes/:teamId" element={<TeamPage />} />
          </Routes>
        </MemoryRouter>
      </CupAppContext.Provider>,
    )

    // Should indicate "plus de 3 clubs" and NOT list the club names
    expect(screen.getByText(/Aucune \(1 défaites? contre plus de 3 clubs\)/i)).toBeInTheDocument()
  })

  it('allows navigating to Effectif tab and displays squad in a structured data table', async () => {
    const dataset = parseGeography(fixture)
    const clubs = buildClubsFromCommunes(dataset.communes)
    const target = clubs[0]

    const squadPlayer = {
      id: 'p-club-1',
      firstName: 'Antoine',
      lastName: 'Griezmann',
      age: 33,
      nationality: 'FR',
      birthCommuneId: '71270',
      birthCommuneName: 'Mâcon',
      birthDepartmentId: '71',
      currentClubId: target.id,
      primaryRole: 'PLAYER' as const,
      position: 'ATTACKER' as const,
      attack: 26,
      defense: 18,
      peakAge: 28,
      peakAttack: 29,
      peakDefense: 19,
    }

    const contextValue: any = {
      dataset,
      clubs,
      clubsById: new Map(clubs.map((c) => [c.id, c])),
      clubsByCommuneId: new Map([[target.communeId, [target]]]),
      persons: [squadPlayer],
      session: null,
      archives: [],
      teamRecords: new Map(),
      ready: true,
      favoriteTeamIds: [],
      favoritePersonIds: [],
      togglePlayerFavorite: vi.fn(),
      isFavorite: () => false,
      getFavoriteColor: () => '#fff',
    }

    render(
      <CupAppContext.Provider value={contextValue}>
        <MemoryRouter initialEntries={[`/equipes/${target.id}`]}>
          <Routes>
            <Route path="/equipes/:teamId" element={<TeamPage />} />
          </Routes>
        </MemoryRouter>
      </CupAppContext.Provider>,
    )

    // Switch to Effectif tab
    const squadTab = screen.getByRole('tab', { name: /Effectif & Personnalités/i })
    expect(squadTab).toBeVisible()
    fireEvent.click(squadTab)

    // Check player in card and table
    const playerElements = await screen.findAllByText('Antoine Griezmann')
    expect(playerElements[0]).toBeVisible()
    expect(screen.getByRole('columnheader', { name: /Joueur/i })).toBeVisible()
    expect(screen.getByRole('columnheader', { name: /Ville natale/i })).toBeVisible()
    expect(screen.getByRole('columnheader', { name: /ATQ/i })).toBeVisible()
    expect(screen.getByRole('columnheader', { name: /DEF/i })).toBeVisible()
  })

  it('displays the list of merged communes ordered by population descending in header', async () => {
    const dataset = parseGeography(fixture)
    const initialClubs = buildClubsFromCommunes(dataset.communes)
    // Create a fusion club with 2 communes
    const fusionClub = {
      ...initialClubs[0],
      isFusion: true,
      communeNames: [dataset.communes[0].name, dataset.communes[1].name],
    }

    const contextValue: any = {
      dataset,
      clubs: [fusionClub, ...initialClubs.slice(1)],
      clubsById: new Map([[fusionClub.id, fusionClub]]),
      clubsByCommuneId: new Map([[fusionClub.communeId, [fusionClub]]]),
      persons: [],
      session: null,
      archives: [],
      teamRecords: new Map(),
      ready: true,
      favoriteTeamIds: [],
      favoritePersonIds: [],
      togglePlayerFavorite: vi.fn(),
      isFavorite: () => false,
      getFavoriteColor: () => '#fff',
    }

    render(
      <CupAppContext.Provider value={contextValue}>
        <MemoryRouter initialEntries={[`/equipes/${fusionClub.id}`]}>
          <Routes>
            <Route path="/equipes/:teamId" element={<TeamPage />} />
          </Routes>
        </MemoryRouter>
      </CupAppContext.Provider>,
    )

    expect(screen.getByText(/🤝 Fusion \(2 communes\) :/i)).toBeInTheDocument()
    expect(screen.getAllByText(dataset.communes[0].name).length).toBeGreaterThanOrEqual(2)
    expect(screen.getByText(dataset.communes[1].name)).toBeInTheDocument()
  })

  it('renders Titulaires column in Historique des Éditions with attacker and defender, single starter fallback, or dash', async () => {
    const dataset = parseGeography(fixture)
    const initialClubs = buildClubsFromCommunes(dataset.communes)
    const targetClub = initialClubs[0]

    // Active season starters
    const activeAttacker: any = {
      id: 'p-act-1',
      firstName: 'Kylian',
      lastName: 'Mbappe',
      age: 26,
      currentClubId: targetClub.id,
      position: 'ATTACKER',
      assignedPosition: 'ATTACKER',
      primaryRole: 'PLAYER',
      attack: 28,
      defense: 12,
      careerYears: 8,
      careerHistory: [],
    }
    const activeDefender: any = {
      id: 'p-act-2',
      firstName: 'Raphael',
      lastName: 'Varane',
      age: 31,
      currentClubId: targetClub.id,
      position: 'DEFENDER',
      assignedPosition: 'DEFENDER',
      primaryRole: 'PLAYER',
      attack: 10,
      defense: 27,
      careerYears: 12,
      careerHistory: [],
    }

    // Archived 2025 starters (2 starters)
    const arch2025Attacker: any = {
      id: 'p-2025-1',
      firstName: 'Thierry',
      lastName: 'Henry',
      age: 28,
      currentClubId: targetClub.id,
      position: 'ATTACKER',
      assignedPosition: 'ATTACKER',
      primaryRole: 'PLAYER',
      attack: 26,
      defense: 11,
      careerYears: 10,
      careerHistory: [],
    }
    const arch2025Defender: any = {
      id: 'p-2025-2',
      firstName: 'Lilian',
      lastName: 'Thuram',
      age: 30,
      currentClubId: targetClub.id,
      position: 'DEFENDER',
      assignedPosition: 'DEFENDER',
      primaryRole: 'PLAYER',
      attack: 9,
      defense: 25,
      careerYears: 11,
      careerHistory: [],
    }

    // Archived 2024 starter (1 starter only: "s'il y en a qu'un, y en a qu'un")
    const arch2024Attacker: any = {
      id: 'p-2024-1',
      firstName: 'Karim',
      lastName: 'Benzema',
      age: 27,
      currentClubId: targetClub.id,
      position: 'ATTACKER',
      assignedPosition: 'ATTACKER',
      primaryRole: 'PLAYER',
      attack: 24,
      defense: 10,
      careerYears: 7,
      careerHistory: [],
    }

    const archives: any[] = [
      {
        year: 2025,
        seed: 'seed-2025',
        completedAt: '2025-06-01T00:00:00Z',
        datasetVersion: dataset.version,
        nationalChampionId: targetClub.id,
        finalFourTeamIds: [targetClub.id],
        totalMatches: 2,
        teamPerformances: {
          [targetClub.id]: {
            teamId: targetClub.id,
            clubName: targetClub.name,
            roundReached: 14,
            stageLabel: 'Champion de France 🏆',
            isNationalChampion: true,
            isConferenceChampion: true,
            matchesWon: 2,
            matchesPlayed: 2,
            goalsScored: 5,
            goalsConceded: 1,
            goalDifference: 4,
          },
        },
        history: [],
        clubs: initialClubs,
        persons: [arch2025Attacker, arch2025Defender],
      },
      {
        year: 2024,
        seed: 'seed-2024',
        completedAt: '2024-06-01T00:00:00Z',
        datasetVersion: dataset.version,
        nationalChampionId: initialClubs[1].id,
        finalFourTeamIds: [initialClubs[1].id],
        totalMatches: 2,
        teamPerformances: {
          [targetClub.id]: {
            teamId: targetClub.id,
            clubName: targetClub.name,
            roundReached: 8,
            stageLabel: 'Tour 8 (Régional)',
            isNationalChampion: false,
            isConferenceChampion: false,
            matchesWon: 1,
            matchesPlayed: 2,
            goalsScored: 2,
            goalsConceded: 2,
            goalDifference: 0,
          },
        },
        history: [],
        clubs: initialClubs,
        persons: [arch2024Attacker],
      },
    ]

    const teamRecord = {
      teamId: targetClub.id,
      nationalTitles: 1,
      nationalTitleYears: [2025],
      conferenceTitles: 1,
      conferenceTitleDetails: [{ year: 2025, conferenceId: 'C1' }],
      regionTitles: 0,
      regionTitleDetails: [],
      departmentTitles: 0,
      departmentTitleDetails: [],
      bestPerformance: {
        year: 2025,
        roundNumber: 14,
        stageLabel: 'Champion de France 🏆',
      },
      seasons: [
        {
          year: 2025,
          stageLabel: 'Champion de France 🏆',
          roundReached: 14,
          isNationalChampion: true,
          isConferenceChampion: true,
          matchesWon: 2,
          matchesPlayed: 2,
          goalDifference: 4,
          goalsScored: 5,
          goalsConceded: 1,
        },
        {
          year: 2024,
          stageLabel: 'Tour 8 (Régional)',
          roundReached: 8,
          isNationalChampion: false,
          isConferenceChampion: false,
          matchesWon: 1,
          matchesPlayed: 2,
          goalDifference: 0,
          goalsScored: 2,
          goalsConceded: 2,
        },
      ],
    }

    const session: any = {
      id: 'active',
      seed: 'seed-2026',
      seasonYear: 2026,
      datasetVersion: dataset.version,
      roundNumber: 1,
      activeTeamIds: [targetClub.id],
      round: { number: 1, phase: 'DEPT', matches: [], byeTeamIds: [] },
      results: {},
      history: [],
    }

    const contextValue: any = {
      dataset,
      clubs: initialClubs,
      clubsById: new Map(initialClubs.map((c) => [c.id, c])),
      clubsByCommuneId: new Map(initialClubs.map((c) => [c.communeId, [c]])),
      persons: [activeAttacker, activeDefender],
      session,
      archives,
      teamRecords: new Map([[targetClub.id, teamRecord]]),
      ready: true,
      favoriteTeamIds: [],
      favoritePersonIds: [],
      togglePlayerFavorite: vi.fn(),
      isFavorite: () => false,
      getFavoriteColor: () => '#fff',
    }

    render(
      <CupAppContext.Provider value={contextValue}>
        <MemoryRouter initialEntries={[`/equipes/${targetClub.id}`]}>
          <Routes>
            <Route path="/equipes/:teamId" element={<TeamPage />} />
          </Routes>
        </MemoryRouter>
      </CupAppContext.Provider>,
    )

    // 1. Verify "Titulaires" header column in the table
    const tableHeader = screen.getByRole('columnheader', { name: /Titulaires/i })
    expect(tableHeader).toBeInTheDocument()

    // 2. Active season (2026): Kylian Mbappe (ATT 28) and Raphael Varane (DEF 27)
    expect(screen.getByRole('link', { name: 'Kylian Mbappe' })).toHaveAttribute('href', '/personnes/p-act-1')
    expect(screen.getByRole('link', { name: 'Raphael Varane' })).toHaveAttribute('href', '/personnes/p-act-2')
    expect(screen.getByText('28')).toBeInTheDocument()
    expect(screen.getByText('27')).toBeInTheDocument()

    // 3. Archived season 2025: Thierry Henry (ATT 26) and Lilian Thuram (DEF 25)
    expect(screen.getByRole('link', { name: 'Thierry Henry' })).toHaveAttribute('href', '/personnes/p-2025-1')
    expect(screen.getByRole('link', { name: 'Lilian Thuram' })).toHaveAttribute('href', '/personnes/p-2025-2')
    expect(screen.getByText('26')).toBeInTheDocument()
    expect(screen.getByText('25')).toBeInTheDocument()

    // 4. Archived season 2024: Karim Benzema (ATT 24) alone ("s'il y en a qu'un, y en a qu'un")
    expect(screen.getByRole('link', { name: 'Karim Benzema' })).toHaveAttribute('href', '/personnes/p-2024-1')
    expect(screen.getByText('24')).toBeInTheDocument()
  })

  it('displays preserved identity and banner when visiting an absorbed club page', async () => {
    const dataset = parseGeography(fixture)
    const initialClubs = buildClubsFromCommunes(dataset.communes)

    const leadClub = initialClubs[0]
    const absorbedClubCommune = dataset.communes[1]

    const preservedIdentity = {
      primaryColor: '#6d28d9',
      secondaryColor: '#ddd6fe',
      logo: '/club-logos/etoile.svg',
    }

    const mergedClub = {
      ...leadClub,
      isFusion: true,
      fusedClubs: [
        {
          id: absorbedClubCommune.id,
          name: `FC ${absorbedClubCommune.name}`,
          communeId: absorbedClubCommune.id,
          communeName: absorbedClubCommune.name,
          identity: preservedIdentity,
        },
      ],
    }

    const session: any = {
      id: 'active',
      seed: 'fusion-identity-session',
      seasonYear: 2027,
      roundNumber: 1,
      round: { number: 1, phase: 'DEPARTMENT', matches: [], byeTeamIds: [] },
      clubs: [mergedClub],
      interseasonReport: {
        fusions: [
          {
            mergedClubId: mergedClub.id,
            mergedClubName: mergedClub.name,
            absorbedClubId: absorbedClubCommune.id,
            absorbedClubName: `FC ${absorbedClubCommune.name}`,
            communeNames: [leadClub.communeName, absorbedClubCommune.name],
            totalPopulation: 20000,
            newStrength: 15,
            oldStrength: 10,
          },
        ],
      },
      history: [],
    }

    const contextValue: any = {
      dataset,
      clubs: [mergedClub],
      clubsById: new Map([[mergedClub.id, mergedClub]]),
      session,
      archives: [],
      persons: [],
      teamRecords: new Map(),
      ready: true,
      favoriteTeamIds: [],
      favoritePersonIds: [],
      isFavorite: () => false,
      getFavoriteColor: () => '#fff',
    }

    render(
      <CupAppContext.Provider value={contextValue}>
        <MemoryRouter initialEntries={[`/equipes/${absorbedClubCommune.id}`]}>
          <Routes>
            <Route path="/equipes/:teamId" element={<TeamPage />} />
          </Routes>
        </MemoryRouter>
      </CupAppContext.Provider>,
    )

    // Should display the absorbed club's name
    expect(screen.getByRole('heading', { level: 2, name: `FC ${absorbedClubCommune.name}` })).toBeInTheDocument()

    // Should display the banner indicating it merged
    expect(screen.getByText(/Ce club a fusionné.*pour intégrer l'alliance/i)).toBeInTheDocument()

    // Should display its preserved color chips
    expect(screen.getByText('#6D28D9')).toBeInTheDocument()
    expect(screen.getByText('#DDD6FE')).toBeInTheDocument()
  })

  it('sorts alliances and fusions table from most recent date to oldest date', async () => {
    const testDataset = {
      version: 'test',
      sourceLabel: 'Test',
      sourceUrl: 'http://test',
      communes: [
        { id: '01001', name: 'Commune Alpha', population: 20000, departmentId: '01', regionId: '84', zoneId: 'SUD_EST', conferenceId: 'SUD_EST' },
        { id: '01002', name: 'Commune Beta', population: 15000, departmentId: '01', regionId: '84', zoneId: 'SUD_EST', conferenceId: 'SUD_EST' },
        { id: '01003', name: 'Commune Gamma', population: 10000, departmentId: '01', regionId: '84', zoneId: 'SUD_EST', conferenceId: 'SUD_EST' },
        { id: '01004', name: 'Commune Delta', population: 5000, departmentId: '01', regionId: '84', zoneId: 'SUD_EST', conferenceId: 'SUD_EST' },
        { id: '01005', name: 'Commune Epsilon', population: 4000, departmentId: '01', regionId: '84', zoneId: 'SUD_EST', conferenceId: 'SUD_EST' },
      ],
    }
    const initialClubs = buildClubsFromCommunes(testDataset.communes)
    const leadClub = initialClubs[0]
    const club2024 = initialClubs[1]
    const club2026 = initialClubs[2]
    const club2025 = initialClubs[3]
    const clubUndated = initialClubs[4]

    const mergedClub = {
      ...leadClub,
      isFusion: true,
      communeNames: [leadClub.communeName, club2024.communeName, club2026.communeName, club2025.communeName, clubUndated.communeName],
      fusedClubs: [
        {
          id: club2024.id,
          name: 'FC Ancien 2024',
          communeName: club2024.communeName,
          year: 2024,
        },
        {
          id: clubUndated.id,
          name: 'FC Initial Sans Date',
          communeName: clubUndated.communeName,
          year: undefined,
        },
        {
          id: club2026.id,
          name: 'FC Récent 2026',
          communeName: club2026.communeName,
          year: 2026,
        },
        {
          id: club2025.id,
          name: 'FC Moyen 2025',
          communeName: club2025.communeName,
          year: 2025,
        },
      ],
    }

    const contextValue: any = {
      dataset: testDataset,
      clubs: [mergedClub],
      clubsById: new Map([[mergedClub.id, mergedClub]]),
      session: null,
      archives: [],
      persons: [],
      teamRecords: new Map(),
      ready: true,
      favoriteTeamIds: [],
      favoritePersonIds: [],
      isFavorite: () => false,
      getFavoriteColor: () => '#fff',
    }

    render(
      <CupAppContext.Provider value={contextValue}>
        <MemoryRouter initialEntries={[`/equipes/${mergedClub.id}?tab=alliances`]}>
          <Routes>
            <Route path="/equipes/:teamId" element={<TeamPage />} />
          </Routes>
        </MemoryRouter>
      </CupAppContext.Provider>,
    )

    // The heading and table should be rendered
    expect(await screen.findByText(/Clubs ayant fusionné avec cette équipe/i)).toBeInTheDocument()

    // Table rows should appear in descending order by default: 2026, 2025, 2024, Undated
    const rows = screen.getAllByRole('row')
    expect(rows[1]).toHaveTextContent('Saison 2026')
    expect(rows[1]).toHaveTextContent('FC Récent 2026')

    expect(rows[2]).toHaveTextContent('Saison 2025')
    expect(rows[2]).toHaveTextContent('FC Moyen 2025')

    expect(rows[3]).toHaveTextContent('Saison 2024')
    expect(rows[3]).toHaveTextContent('FC Ancien 2024')

    expect(rows[4]).toHaveTextContent('Fusion')
    expect(rows[4]).toHaveTextContent('FC Initial Sans Date')

    // Click on "Saison" header to toggle sort to ascending (oldest first)
    const seasonHeader = screen.getByRole('columnheader', { name: /Saison/i })
    fireEvent.click(seasonHeader)

    const reversedRows = screen.getAllByRole('row')
    expect(reversedRows[1]).toHaveTextContent('Fusion')
    expect(reversedRows[1]).toHaveTextContent('FC Initial Sans Date')

    expect(reversedRows[2]).toHaveTextContent('Saison 2024')
    expect(reversedRows[2]).toHaveTextContent('FC Ancien 2024')

    expect(reversedRows[3]).toHaveTextContent('Saison 2025')
    expect(reversedRows[3]).toHaveTextContent('FC Moyen 2025')

    expect(reversedRows[4]).toHaveTextContent('Saison 2026')
    expect(reversedRows[4]).toHaveTextContent('FC Récent 2026')
  })
})
