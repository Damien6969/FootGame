import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import fixture from '../../test/fixtures/communes.fixture.json'
import { parseGeography } from './loadGeography'
import { CommunePage } from './CommunePage'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { CupAppContext, type CupAppContextType } from '../../app/CupAppContext'
import type { Club } from '../teams/types'
import type { SeasonArchive } from '../storage/cupRepository'

describe('CommunePage - Alliance Naming', () => {
  it('displays the alliance name as primary title in active clubs and in season history', async () => {
    const dataset = parseGeography(fixture)
    // Commune cible : 01004 (Ambérieu-en-Bugey)
    const commune = dataset.communes.find((c) => c.id === '01004')!

    // Club en alliance engagé représentant Ambérieu-en-Bugey
    const allianceClub: Club = {
      id: '01004',
      name: 'Entente Bugey-Plaine de l’Ain',
      shortName: 'Entente Bugey',
      communeId: '01004',
      communeName: commune.name,
      communeIds: ['01004', '01053'],
      communeNames: ['Ambérieu-en-Bugey', 'Bourg-en-Bresse'],
      departmentId: commune.departmentId,
      regionId: commune.regionId,
      zoneId: commune.zoneId,
      conferenceId: commune.conferenceId,
      population: 50000,
      strength: 16.5,
      isFusion: true,
      fusionCount: 2,
    }

    const archive: SeasonArchive = {
      year: 2026,
      seed: 'test-seed',
      completedAt: '2026-09-24T00:00:00.000Z',
      datasetVersion: '1.0',
      nationalChampionId: '01004',
      conferenceChampions: { EST: '01004' },
      finalFourTeamIds: ['01004'],
      totalMatches: 5,
      teamPerformances: {
        '01004': {
          teamId: '01004',
          clubName: 'Entente Bugey-Plaine de l’Ain',
          roundReached: 14,
          stageLabel: 'Finale (Vainqueur)',
          isNationalChampion: true,
          isConferenceChampion: true,
          matchesWon: 5,
          matchesPlayed: 5,
          isFusion: true,
          communeNames: ['Ambérieu-en-Bugey', 'Bourg-en-Bresse'],
        },
      },
      history: [],
    }

    const contextValue: CupAppContextType = {
      dataset,
      clubs: [allianceClub],
      clubsById: new Map([[allianceClub.id, allianceClub]]),
      clubsByCommuneId: new Map([['01004', [allianceClub]]]),
      persons: [],
      session: {
        seasonYear: 2027,
        activeTeamIds: [allianceClub.id],
        clubs: [allianceClub],
      } as any,
      archives: [archive],
      teamRecords: new Map(),
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

    render(
      <CupAppContext.Provider value={contextValue}>
        <MemoryRouter initialEntries={[`/villes/${commune.id}`]}>
          <Routes>
            <Route path="/villes/:communeId" element={<CommunePage />} />
          </Routes>
        </MemoryRouter>
      </CupAppContext.Provider>,
    )

    // Vérifier que le nom de l'alliance est affiché en titre principal de la carte du club actif
    const activeClubLinks = screen.getAllByRole('link', { name: 'Entente Bugey-Plaine de l’Ain' })
    expect(activeClubLinks.length).toBeGreaterThanOrEqual(2) // Présent dans la carte et dans le tableau

    // Vérifier la sous-mention du club d'origine
    expect(screen.getByText(/Club d'origine de la commune :/i)).toBeVisible()

    // Vérifier dans le tableau "Club(s) engagé(s)"
    expect(screen.getByRole('columnheader', { name: /Club\(s\) engagé\(s\)/i })).toBeVisible()
    expect(screen.getByText('Saison 2026')).toBeVisible()
  })

  it('allows navigating to Personnalités tab and displays the personalities table', async () => {
    const dataset = parseGeography(fixture)
    const commune = dataset.communes.find((c) => c.id === '01004')!

    const mockPerson = {
      id: 'p-amberieu-1',
      firstName: 'Thierry',
      lastName: 'Bugiste',
      age: 23,
      nationality: 'FR',
      birthCommuneId: '01004',
      birthCommuneName: commune.name,
      birthDepartmentId: commune.departmentId,
      currentClubId: '01004',
      primaryRole: 'PLAYER' as const,
      position: 'ATTACKER' as const,
      attack: 22,
      defense: 14,
      peakAge: 27,
      peakAttack: 26,
      peakDefense: 16,
    }

    const contextValue: any = {
      dataset,
      clubs: [],
      clubsById: new Map(),
      clubsByCommuneId: new Map(),
      persons: [mockPerson],
      session: null,
      archives: [],
      teamRecords: new Map(),
      ready: true,
    }

    render(
      <CupAppContext.Provider value={contextValue}>
        <MemoryRouter initialEntries={[`/villes/${commune.id}`]}>
          <Routes>
            <Route path="/villes/:communeId" element={<CommunePage />} />
          </Routes>
        </MemoryRouter>
      </CupAppContext.Provider>,
    )

    // Verify tabs are present
    const persTab = screen.getByRole('tab', { name: /Personnalités/i })
    expect(persTab).toBeVisible()

    // Switch to Personnalités tab
    fireEvent.click(persTab)

    // Verify player is displayed in structured table
    expect(await screen.findByText('Thierry Bugiste')).toBeVisible()
    expect(screen.getByRole('columnheader', { name: /Joueur/i })).toBeVisible()
    expect(screen.getByRole('columnheader', { name: /Poste/i })).toBeVisible()
    expect(screen.getByRole('columnheader', { name: /GÉN/i })).toBeVisible()
  })
})
