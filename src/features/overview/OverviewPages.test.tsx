import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { CupAppContext, type CupAppContextType } from '../../app/CupAppContext'
import { AwardsPage, ConferenceBadge, TitleCountBadge } from './OverviewPages'
import type { GeographyDataset, Commune } from '../geography/types'
import { cupRepository, type SeasonArchive } from '../storage/cupRepository'
import { computeTeamRecords } from '../history/palmaresSelectors'
import { buildClubsFromCommunes } from '../teams/clubGenerator'

const mockCommunes: Commune[] = [
  { id: 'PARIS', name: 'Paris', departmentId: '75', regionId: '11', zoneId: 'ZONE_NORD', conferenceId: 'CONF_NORD', population: 2100000 },
  { id: 'RENNES', name: 'Rennes', departmentId: '35', regionId: '53', zoneId: 'ZONE_OUEST', conferenceId: 'CONF_OUEST', population: 220000 },
  { id: 'BORDEAUX', name: 'Bordeaux', departmentId: '33', regionId: '75', zoneId: 'ZONE_SUD_OUEST', conferenceId: 'CONF_SUD_OUEST', population: 260000 },
  { id: 'MARSEILLE', name: 'Marseille', departmentId: '13', regionId: '93', zoneId: 'ZONE_SUD_EST', conferenceId: 'CONF_SUD_EST', population: 870000 },
]

const mockDataset: GeographyDataset = {
  version: '2026.1',
  sourceLabel: 'Insee 2026',
  sourceUrl: 'https://insee.fr',
  communes: mockCommunes,
}

const mockArchive2026: SeasonArchive = {
  year: 2026,
  seed: 'coupe-2026',
  completedAt: '2026-06-01T20:00:00.000Z',
  datasetVersion: '2026.1',
  nationalChampionId: 'PARIS',
  finalistId: 'BORDEAUX',
  conferenceChampions: {
    CONF_NORD: 'PARIS',
    CONF_OUEST: 'RENNES',
    CONF_SUD_OUEST: 'BORDEAUX',
    CONF_SUD_EST: 'MARSEILLE',
  },
  regionChampions: {
    '11': 'PARIS',
    '53': 'RENNES',
    '75': 'BORDEAUX',
    '93': 'MARSEILLE',
  },
  departmentChampions: {
    '75': 'PARIS',
    '35': 'RENNES',
    '33': 'BORDEAUX',
    '13': 'MARSEILLE',
  },
  finalFourTeamIds: ['PARIS', 'RENNES', 'BORDEAUX', 'MARSEILLE'],
  totalMatches: 3,
  teamPerformances: {
    PARIS: {
      teamId: 'PARIS',
      roundReached: 14,
      stageLabel: 'Champion de France 🏆',
      isNationalChampion: true,
      isConferenceChampion: true,
      isRegionChampion: true,
      isDepartmentChampion: true,
      matchesWon: 3,
      matchesPlayed: 3,
    },
    BORDEAUX: {
      teamId: 'BORDEAUX',
      roundReached: 14,
      stageLabel: 'Finaliste National 🥈',
      isNationalChampion: false,
      isConferenceChampion: true,
      isRegionChampion: true,
      isDepartmentChampion: true,
      matchesWon: 2,
      matchesPlayed: 3,
    },
  },
  history: [
    {
      roundNumber: 14,
      homeTeamId: 'PARIS',
      awayTeamId: 'BORDEAUX',
      result: {
        matchId: '14:1',
        homeScore: 2,
        awayScore: 1,
        winnerId: 'PARIS',
        events: [],
      },
    },
  ],
  individualAwards: {
    version: 1,
    year: 2026,
    minimumMatches: 3,
    awards: [
      {
        id: 'ballon-or',
        title: 'Ballon d’Or',
        stage: 'FINAL',
        metric: 'OVERALL',
        winners: [
          {
            personId: 'p1',
            firstName: 'Antoine',
            lastName: 'Griezmann',
            age: 28,
            clubId: 'PARIS',
            clubName: 'Paris',
            conferenceId: 'CONF_NORD',
            position: 'ATTACKER',
            matchesPlayed: 7,
            goals: 11,
            defensiveStops: 3,
            shots: 22,
            shotsMissed: 7,
            attackScore: 90,
            defenseScore: 25,
            overallScore: 92.5,
            awardScore: 94.0,
            juryAdjustment: 0.015,
            isChampion: true,
          },
        ],
        nominees: [],
      },
      {
        id: 'top-scorer',
        title: 'Soulier d’Or · Meilleur buteur',
        stage: 'NATIONAL',
        metric: 'GOALS',
        winners: [
          {
            personId: 'p1',
            firstName: 'Antoine',
            lastName: 'Griezmann',
            age: 28,
            clubId: 'PARIS',
            clubName: 'Paris',
            conferenceId: 'CONF_NORD',
            position: 'ATTACKER',
            matchesPlayed: 7,
            goals: 11,
            defensiveStops: 3,
            shots: 22,
            shotsMissed: 7,
            attackScore: 90,
            defenseScore: 25,
            overallScore: 92.5,
            awardScore: 11,
          },
        ],
        nominees: [],
      },
    ],
  },
}

const mockPlayer1 = {
  id: 'p1',
  firstName: 'Antoine',
  lastName: 'Griezmann',
  age: 28,
  nationality: 'FR',
  careerYears: 5,
  attack: 27,
  defense: 18,
  primaryRole: 'PLAYER' as const,
  position: 'ATTACKER' as const,
  assignedPosition: 'ATTACKER' as const,
  birthCommuneId: 'PARIS',
  birthCommuneName: 'Paris',
  birthDepartmentId: '75',
  currentClubId: 'PARIS',
  isRetired: false,
  careerHistory: [
    {
      year: 2026,
      clubId: 'PARIS',
      clubName: 'Paris',
      role: 'PLAYER' as const,
      age: 28,
      attack: 27,
      defense: 18,
      assignedPosition: 'ATTACKER' as const,
      isStarter: true,
      matchesPlayed: 7,
      goals: 11,
      defensiveStops: 3,
      shots: 22,
      shotsMissed: 7,
      roundReached: 14,
      stageLabel: 'Champion de France 🏆',
      isNationalChampion: true,
      isConferenceChampion: true,
      isRegionChampion: true,
      isDepartmentChampion: true,
      conferenceId: 'CONF_NORD',
      regionId: '11',
      departmentId: '75',
      individualHonors: [
        { awardId: 'ballon-or', title: 'Ballon d’Or' },
        { awardId: 'top-scorer', title: 'Soulier d’Or · Meilleur buteur' },
      ],
    },
  ],
}

function renderAwardsPage(initialEntry = '/palmares', archives: SeasonArchive[] = [mockArchive2026]) {
  const records = computeTeamRecords(archives)
  const clubs = buildClubsFromCommunes(mockDataset.communes)
  const clubsById = new Map(clubs.map((c) => [c.id, c]))
  const clubsByCommuneId = new Map(clubs.map((c) => [c.communeId, [c]]))
  const contextValue: CupAppContextType = {
    dataset: mockDataset,
    clubs,
    clubsById,
    clubsByCommuneId,
    persons: [mockPlayer1],
    session: null,
    archives,
    teamRecords: records,
    ready: true,
    error: null,
    persistSession: async () => {},
    resetSession: async () => {},
    resetAllHistory: async () => {},
    createCup: () => {},
    advanceToNextSeason: async () => {},
    reloadSession: async () => {},
    renameClub: async () => {},
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

  return render(
    <CupAppContext.Provider value={contextValue}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <AwardsPage />
      </MemoryRouter>
    </CupAppContext.Provider>,
  )
}

describe('AwardsPage Wikipedia Palmarès', () => {
  it('renders the Wikipedia editions table and the clubs leaderboard', async () => {
    renderAwardsPage('/palmares')

    // Editions table
    expect(screen.getByText("Tableau d'Honneur des Éditions de la Coupe")).toBeVisible()
    expect(screen.getByText('Saison 2026')).toBeVisible()
    expect(screen.getByText('2 – 1')).toBeVisible()

    // Clubs leaderboard
    expect(screen.getByText('Classement Historique des Clubs les Plus Titrés')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Top 20' })).toHaveClass('is-active')
  })

  it('honors tab=regions from URL and shows regional table', async () => {
    renderAwardsPage('/palmares?tab=regions')

    expect(await screen.findByText('Palmarès Régional (13 Régions Administratives)')).toBeVisible()
    expect(screen.getByRole('tab', { name: /Champions Régionaux/ })).toHaveClass('is-active')
  })

  it('honors tab=departements from URL and shows departmental table', async () => {
    renderAwardsPage('/palmares?tab=departements')

    expect(await screen.findByText('Palmarès Départemental (101 Départements)')).toBeVisible()
    expect(screen.getByRole('tab', { name: /Champions Départementaux/ })).toHaveClass('is-active')
  })

  it('allows switching tabs interactively', async () => {
    const user = userEvent.setup()
    renderAwardsPage('/palmares')

    // Click on Champions Régionaux tab
    await user.click(screen.getByRole('tab', { name: /Champions Régionaux/ }))
    expect(await screen.findByText('Palmarès Régional (13 Régions Administratives)')).toBeVisible()

    // Click on Champions Départementaux tab
    await user.click(screen.getByRole('tab', { name: /Champions Départementaux/ }))
    expect(await screen.findByText('Palmarès Départemental (101 Départements)')).toBeVisible()

    // Click on Palmarès des Joueurs tab
    await user.click(screen.getByRole('tab', { name: /Palmarès des Joueurs/ }))
    expect(await screen.findByText('Classement Historique des Joueurs les Plus Titrés')).toBeVisible()
  })

  it('keeps the complete clubs list in manageable pages', async () => {
    const user = userEvent.setup()
    renderAwardsPage('/palmares?tab=clubs')

    await user.click(screen.getByRole('button', { name: /Parcourir tous les clubs/ }))
    expect(screen.getByText(/Page 1 sur 1/)).toBeVisible()
    expect(screen.getByRole('button', { name: 'Suivant →' })).toBeDisabled()
  })

  it('honors tab=joueurs from URL and renders player leaderboard and sub-tabs', async () => {
    const user = userEvent.setup()
    renderAwardsPage('/palmares?tab=joueurs')

    expect(screen.getByRole('tab', { name: /Palmarès des Joueurs/ })).toHaveClass('is-active')
    expect(await screen.findByText('Classement Historique des Joueurs les Plus Titrés')).toBeVisible()
    expect(screen.getAllByText('Antoine Griezmann').length).toBeGreaterThan(0)
    expect(screen.getByText('Recordman de Titres')).toBeVisible()

    // Switch to Ballon d'Or sub-tab
    await user.click(screen.getByRole('button', { name: /Tableau Ballon d'Or/ }))
    expect(screen.getByText("Tableau d'Honneur du Ballon d'Or")).toBeVisible()
    expect(screen.getAllByText('Antoine Griezmann').length).toBeGreaterThan(0)

    // Switch to Souliers d'Or (Buteurs) sub-tab
    await user.click(screen.getByRole('button', { name: /Souliers d'Or · Buteurs/ }))
    expect(screen.getByText("Tableau d'Honneur des Meilleurs Buteurs (Soulier d'Or)")).toBeVisible()

    // Switch to Meilleurs Défenseurs sub-tab
    await user.click(screen.getByRole('button', { name: /Meilleurs Défenseurs/ }))
    expect(screen.getByText("Tableau d'Honneur des Défenseurs & Bouclier d'Or")).toBeVisible()

    // Switch to Toutes les distinctions
    await user.click(screen.getByRole('button', { name: /Toutes les Distinctions/ }))
    expect(screen.getByText('Tableau Complet de Toutes les Distinctions par Édition')).toBeVisible()
  })

  it('renders conference badges next to champions and displays multi-title badges only from the 2nd win onwards', () => {
    const mockArchive2027: SeasonArchive = {
      ...mockArchive2026,
      year: 2027,
      seed: 'coupe-2027',
      nationalChampionId: 'PARIS',
      finalistId: 'RENNES',
      conferenceChampions: {
        CONF_NORD: 'PARIS',
        CONF_OUEST: 'RENNES',
        CONF_SUD_OUEST: 'BORDEAUX',
        CONF_SUD_EST: 'MARSEILLE',
      },
    }

    renderAwardsPage('/palmares', [mockArchive2026, mockArchive2027])

    // Conference badge "Nord" should be rendered
    const nordBadges = screen.getAllByLabelText('Conférence Nord')
    expect(nordBadges.length).toBeGreaterThan(0)
    expect(nordBadges[0]).toHaveClass('palmares-conf-badge', 'conf-badge--nord')

    // In 2026 (1st win for Paris), there should NOT be a "1e" title count badge
    expect(screen.queryByLabelText(/1e titre/i)).toBeNull()

    // In 2027 (2nd win for Paris), there MUST be a "2e titre" badge
    const secondTitleBadge = screen.getByLabelText('2e titre de Champion de France')
    expect(secondTitleBadge).toBeVisible()
    expect(secondTitleBadge).toHaveClass('palmares-title-count-badge--national')
    expect(secondTitleBadge).toHaveTextContent('⭐')
    expect(secondTitleBadge).toHaveTextContent('2e')

    // Conference 2nd title for Paris in 2027
    const confSecondTitleBadges = screen.getAllByLabelText('2e titre de conférence')
    expect(confSecondTitleBadges.length).toBeGreaterThan(0)
    expect(confSecondTitleBadges[0]).toHaveClass('palmares-title-count-badge--conf')
    expect(confSecondTitleBadges[0]).toHaveTextContent('👑')
    expect(confSecondTitleBadges[0]).toHaveTextContent('2e')
  })

  it('does not load heavy detailed archives on editions tab nor on joueurs tab', async () => {
    const summaryArchive: SeasonArchive = {
      ...mockArchive2026,
      summaryOnly: true,
      history: [],
    }
    const loadArchivesSpy = vi.spyOn(cupRepository, 'loadArchives')
    const loadPalmaresSpy = vi.spyOn(cupRepository, 'loadPlayerPalmares')

    const user = userEvent.setup()
    renderAwardsPage('/palmares', [summaryArchive])

    // On editions tab, content is displayed without calling loadArchives
    expect(screen.getByText("Tableau d'Honneur des Éditions de la Coupe")).toBeVisible()
    expect(loadArchivesSpy).not.toHaveBeenCalled()

    // Switch to Palmarès des Joueurs tab: loads from fast palmares tables, NEVER loads 350 MB archives
    await user.click(screen.getByRole('tab', { name: /Palmarès des Joueurs/ }))
    expect(loadArchivesSpy).not.toHaveBeenCalled()
    expect(loadPalmaresSpy).toHaveBeenCalled()
    expect(await screen.findByText('Classement Historique des Joueurs les Plus Titrés')).toBeVisible()
  })
})

describe('ConferenceBadge & TitleCountBadge', () => {
  it('renders conference badge with correct classes and labels', () => {
    const { container, rerender } = render(<ConferenceBadge conferenceId="CONF_NORD" />)
    const badgeNord = container.querySelector('.palmares-conf-badge')
    expect(badgeNord).toHaveClass('conf-badge--nord')
    expect(badgeNord).toHaveTextContent('Nord')

    rerender(<ConferenceBadge conferenceId="CONF_OUEST" />)
    const badgeOuest = container.querySelector('.palmares-conf-badge')
    expect(badgeOuest).toHaveClass('conf-badge--ouest')
    expect(badgeOuest).toHaveTextContent('Ouest')

    rerender(<ConferenceBadge conferenceId="CONF_SUD_OUEST" />)
    const badgeSudOuest = container.querySelector('.palmares-conf-badge')
    expect(badgeSudOuest).toHaveClass('conf-badge--sud-ouest')
    expect(badgeSudOuest).toHaveTextContent('Sud-Ouest')

    rerender(<ConferenceBadge conferenceId="CONF_SUD_EST" />)
    const badgeSudEst = container.querySelector('.palmares-conf-badge')
    expect(badgeSudEst).toHaveClass('conf-badge--sud-est')
    expect(badgeSudEst).toHaveTextContent('Sud-Est')

    rerender(<ConferenceBadge conferenceId={undefined} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders TitleCountBadge only when count >= 2', () => {
    // 1st title: strictly null
    const { container, rerender } = render(<TitleCountBadge count={1} type="national" />)
    expect(container.firstChild).toBeNull()

    // 0 or negative: null
    rerender(<TitleCountBadge count={0} type="national" />)
    expect(container.firstChild).toBeNull()

    // 2nd national title
    rerender(<TitleCountBadge count={2} type="national" />)
    const nationalBadge = screen.getByLabelText('2e titre de Champion de France')
    expect(nationalBadge).toBeVisible()
    expect(nationalBadge).toHaveTextContent('⭐')
    expect(nationalBadge).toHaveTextContent('2e')

    // 3rd conference title
    rerender(<TitleCountBadge count={3} type="conf" />)
    const confBadge = screen.getByLabelText('3e titre de conférence')
    expect(confBadge).toBeVisible()
    expect(confBadge).toHaveTextContent('👑')
    expect(confBadge).toHaveTextContent('3e')
  })
})
