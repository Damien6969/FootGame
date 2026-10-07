import { render, screen, within } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { PersonPage } from './PersonPage'
import { CupAppContext, type CupAppContextType } from '../../app/CupAppContext'
import type { Person } from './types'

const mockPerson: Person = {
  id: 'p-42',
  firstName: 'Zinédine',
  lastName: 'Zidane',
  age: 26,
  nationality: 'FR',
  birthCommuneId: '13055',
  birthCommuneName: 'Marseille',
  birthDepartmentId: '13',
  currentClubId: '13055-1',
  primaryRole: 'PLAYER',
  position: 'ATTACKER',
  attack: 29,
  defense: 14,
  careerYears: 8,
  isRetired: false,
}

const mockClubsById = new Map([
  ['13055-1', { id: '13055-1', name: 'Olympique de Marseille', strength: 27 } as any],
])

const mockContextValue: Partial<CupAppContextType> = {
  persons: [mockPerson],
  clubsById: mockClubsById,
  dataset: {
    version: '1.0',
    communes: [{ id: '13055', name: 'Marseille', departmentId: '13', regionId: '93', zoneId: 'ZONE_SUD_EST', conferenceId: 'CONF_SUD_EST', population: 870000 }],
    sourceLabel: 'INSEE',
    sourceUrl: 'https://example.com',
  } as any,
}

describe('PersonPage', () => {
  it('links historical clubs and loan owners that are no longer active, preserving their names', () => {
    const person: Person = { ...mockPerson, careerHistory: [
      { year: 2024, clubId: '13055-2', clubName: 'Ancienne alliance', role: 'PLAYER', age: 24, attack: 29, defense: 14 },
      { year: 2025, clubId: '13055-3', clubName: 'Ancien club accueil', parentClubId: '13055-2', parentClubName: 'Ancienne alliance', isLoan: true, role: 'PLAYER', age: 25, attack: 29, defense: 14 },
    ] }
    render(<MemoryRouter initialEntries={['/personnes/p-42']}>
      <CupAppContext.Provider value={{ ...mockContextValue, persons: [person] } as CupAppContextType}>
        <Routes><Route path="/personnes/:personId" element={<PersonPage />} /></Routes>
      </CupAppContext.Provider>
    </MemoryRouter>)
    const firstRow = screen.getByRole('cell', { name: '2024' }).closest('tr')!
    const loanRow = screen.getByRole('cell', { name: '2025' }).closest('tr')!
    expect(within(firstRow).getByRole('link', { name: 'Ancienne alliance' })).toHaveAttribute('href', '/equipes/13055-2')
    expect(within(loanRow).getByRole('link', { name: 'Ancien club accueil' })).toHaveAttribute('href', '/equipes/13055-3')
    expect(within(loanRow).getByRole('link', { name: 'Ancienne alliance' })).toHaveAttribute('href', '/equipes/13055-2')
    expect(within(screen.getByText("Club d'origine / formateur").parentElement!).getByRole('link', { name: 'Ancienne alliance' })).toHaveAttribute('href', '/equipes/13055-2')
  })

  it('keeps the first club as origin after a transfer and a loan from the new owner', () => {
    const person: Person = { ...mockPerson, currentClubId: 'host', parentClubId: 'new-owner', loanedFromClubId: 'new-owner',
      careerHistory: [
        { year: 2025, clubId: 'new-owner', clubName: 'Nouveau club', parentClubId: 'new-owner', role: 'PLAYER', age: 25, attack: 29, defense: 14 },
        { year: 2024, clubId: '13055-1', clubName: 'Olympique de Marseille', parentClubId: '13055-1', role: 'PLAYER', age: 24, attack: 29, defense: 14 },
        { year: 2026, clubId: 'host', clubName: 'Club accueil', parentClubId: 'new-owner', parentClubName: 'Nouveau club', isLoan: true, role: 'PLAYER', age: 26, attack: 29, defense: 14 },
      ] }
    const clubsById = new Map([...mockClubsById,
      ['new-owner', { id: 'new-owner', name: 'Nouveau club', strength: 25 } as any],
      ['host', { id: 'host', name: 'Club accueil', strength: 20 } as any],
    ])
    render(<MemoryRouter initialEntries={['/personnes/p-42']}>
      <CupAppContext.Provider value={{ ...mockContextValue, persons: [person], clubsById } as CupAppContextType}>
        <Routes><Route path="/personnes/:personId" element={<PersonPage />} /></Routes>
      </CupAppContext.Provider>
    </MemoryRouter>)
    const origin = screen.getByText("Club d'origine / formateur").parentElement!
    expect(within(origin).getByRole('link', { name: 'Olympique de Marseille' })).toHaveAttribute('href', '/equipes/13055-1')
    const originalRow = screen.getByRole('cell', { name: '2024' }).closest('tr')!
    const transferredRow = screen.getByRole('cell', { name: '2025' }).closest('tr')!
    const loanRow = screen.getByRole('cell', { name: '2026' }).closest('tr')!
    expect(within(originalRow).getByText("🏠 Club d'origine")).toBeInTheDocument()
    expect(within(transferredRow).queryByText("🏠 Club d'origine")).not.toBeInTheDocument()
    expect(screen.queryByText(/Formé à/)).not.toBeInTheDocument()
    expect(within(loanRow).getByText(/En prêt de/)).toBeInTheDocument()
    expect(within(loanRow).getByRole('link', { name: 'Nouveau club' })).toBeInTheDocument()
    expect(within(loanRow).queryByText("(Club d'origine)")).not.toBeInTheDocument()
  })

  it('shows the archived origin name when the first club disappeared and the player retired', () => {
    const person: Person = { ...mockPerson, currentClubId: null, parentClubId: null, isRetired: true,
      careerHistory: [{ year: 2024, clubId: 'old-club', clubName: 'Ancien club', role: 'PLAYER', age: 24, attack: 29, defense: 14 }] }
    render(<MemoryRouter initialEntries={['/personnes/p-42']}>
      <CupAppContext.Provider value={{ ...mockContextValue, persons: [person] } as CupAppContextType}>
        <Routes><Route path="/personnes/:personId" element={<PersonPage />} /></Routes>
      </CupAppContext.Provider>
    </MemoryRouter>)
    expect(within(screen.getByText("Club d'origine / formateur").parentElement!).getByText('Ancien club')).toBeInTheDocument()
  })

  it('shows a reconverted coach as affiliated and in post despite his sporting retirement', () => {
    const coach: Person = { ...mockPerson, primaryRole: 'COACH', isRetired: true, age: 50,
      retiredYear: 2014, coachSkill: 25, coachPeakSkill: 25, coachStartAge: 38, coachPeakAge: 50 }
    render(<MemoryRouter initialEntries={['/personnes/p-42']}>
      <CupAppContext.Provider value={{ ...mockContextValue, persons: [coach] } as CupAppContextType}>
        <Routes><Route path="/personnes/:personId" element={<PersonPage />} /></Routes>
      </CupAppContext.Provider>
    </MemoryRouter>)
    expect(screen.getByText('Entraîneur en poste')).toBeInTheDocument()
    expect(screen.queryByText('Sans club (Retraité)')).not.toBeInTheDocument()
  })
  it('shows a season spent at the club without participation', () => {
    const reserve: Person = { ...mockPerson, careerHistory: [{ year: 2025, clubId: '13055-1', clubName: 'Olympique de Marseille', role: 'PLAYER', age: 25, attack: 28, defense: 14, isStarter: false, matchesPlayed: 0 }] }
    render(
      <MemoryRouter initialEntries={['/personnes/p-42']}>
        <CupAppContext.Provider value={{ ...mockContextValue, persons: [reserve] } as CupAppContextType}>
          <Routes><Route path="/personnes/:personId" element={<PersonPage />} /></Routes>
        </CupAppContext.Provider>
      </MemoryRouter>,
    )
    expect(screen.getByText('Au club · non titulaire')).toBeInTheDocument()
    expect(screen.getAllByText('Olympique de Marseille').length).toBeGreaterThan(0)
  })
  it('renders detailed player identity, territory and stats', () => {
    render(
      <MemoryRouter initialEntries={['/personnes/p-42']}>
        <CupAppContext.Provider value={mockContextValue as CupAppContextType}>
          <Routes>
            <Route path="/personnes/:personId" element={<PersonPage />} />
          </Routes>
        </CupAppContext.Provider>
      </MemoryRouter>,
    )

    // Player name, position, nationality
    expect(screen.getByRole('heading', { name: /Zinédine Zidane/i })).toBeInTheDocument()
    expect(screen.getByText('Attaquant')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Nationalité : France' })).toBeInTheDocument()
    expect(screen.getByText(/26 ans/i)).toBeInTheDocument()

    // Territory info
    expect(screen.getAllByText('Marseille')[0]).toBeInTheDocument()
    expect(screen.getAllByText('Olympique de Marseille')[0]).toBeInTheDocument()

    // Stats
    expect(screen.getByText('29')).toBeInTheDocument() // Attack
    expect(screen.getByText('14')).toBeInTheDocument() // Defense

    // Palmarès and career history
    expect(screen.getByText(/Palmarès & Distinctions/i)).toBeInTheDocument()
    expect(screen.getByText(/Historique de Carrière & Parcours en Club/i)).toBeInTheDocument()
    expect(screen.getByText(/Champion de France/i)).toBeInTheDocument()
  })

  it('renders not found state when personId is invalid', () => {
    render(
      <MemoryRouter initialEntries={['/personnes/p-99999']}>
        <CupAppContext.Provider value={mockContextValue as CupAppContextType}>
          <Routes>
            <Route path="/personnes/:personId" element={<PersonPage />} />
          </Routes>
        </CupAppContext.Provider>
      </MemoryRouter>,
    )

    expect(screen.getByRole('heading', { name: /Personnalité non trouvée/i })).toBeInTheDocument()
  })

  it('renders loan badge and parent club for loaned players', () => {
    const parentClub = { id: 'parent-1', name: 'Paris Saint-Germain', strength: 29 }
    const loanedPerson: Person = {
      ...mockPerson,
      id: 'p-loan-1',
      firstName: 'Bradley',
      lastName: 'Barcola',
      currentClubId: '13055-1',
      parentClubId: 'parent-1',
      loanedFromClubId: 'parent-1',
      assignedPosition: 'ATTACKER',
      careerHistory: [
        {
          year: 2025,
          clubId: '13055-1',
          clubName: 'Olympique de Marseille',
          role: 'PLAYER',
          age: 22,
          attack: 26,
          defense: 10,
          isLoan: true,
          parentClubId: 'parent-1',
          parentClubName: 'Paris Saint-Germain',
          assignedPosition: 'ATTACKER',
        },
      ],
    }

    const clubsMapWithParent = new Map([
      ['13055-1', { id: '13055-1', name: 'Olympique de Marseille', strength: 27 } as any],
      ['parent-1', parentClub as any],
    ])

    render(
      <MemoryRouter initialEntries={['/personnes/p-loan-1']}>
        <CupAppContext.Provider
          value={{
            ...mockContextValue,
            persons: [loanedPerson],
            clubsById: clubsMapWithParent,
          } as CupAppContextType}
        >
          <Routes>
            <Route path="/personnes/:personId" element={<PersonPage />} />
          </Routes>
        </CupAppContext.Provider>
      </MemoryRouter>,
    )

    expect(screen.getAllByText(/En prêt de/i).length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Paris Saint-Germain').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText(/🤝 Prêt/).length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText(/↳ En prêt de :/i)).toBeInTheDocument()
    expect(screen.getByText(/\(Club d'origine\)/i)).toBeInTheDocument()
  })

  it('renders career stats (goals, defensive stops, matches) and stat headers', () => {
    const personWithStats: Person = {
      ...mockPerson,
      careerHistory: [
        {
          year: 2024,
          clubId: '13055-1',
          clubName: 'Olympique de Marseille',
          role: 'PLAYER',
          age: 24,
          attack: 27,
          defense: 13,
          matchesPlayed: 7,
          goals: 5,
          defensiveStops: 2,
          shots: 11,
          shotsMissed: 6,
          roundReached: 14,
          stageLabel: 'Champion de France 🏆',
          isNationalChampion: true,
        },
      ],
    }

    render(
      <MemoryRouter initialEntries={['/personnes/p-42']}>
        <CupAppContext.Provider
          value={{
            ...mockContextValue,
            persons: [personWithStats],
          } as CupAppContextType}
        >
          <Routes>
            <Route path="/personnes/:personId" element={<PersonPage />} />
          </Routes>
        </CupAppContext.Provider>
      </MemoryRouter>,
    )

    // Table headers for stats
    expect(screen.getByRole('columnheader', { name: /Matchs/i })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: /Buts/i })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: /Défenses/i })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: /Tirs/i })).toBeInTheDocument()

    // Rendered stat values (in summary KPI card and in table row)
    expect(screen.getAllByText('⚽ 5').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('🛡️ 2').length).toBeGreaterThanOrEqual(1)
  })

  it('displays all career seasons on a single page without pagination even if there are > 10 seasons', () => {
    const manySeasons = Array.from({ length: 15 }, (_, i) => ({
      year: 2015 + i,
      clubId: '13055-1',
      clubName: 'Olympique de Marseille',
      role: 'PLAYER' as const,
      age: 20 + i,
      attack: 25,
      defense: 15,
      matchesPlayed: 5,
      goals: i % 3,
      defensiveStops: i % 2,
    }))

    const personWith15Seasons: Person = {
      ...mockPerson,
      careerHistory: manySeasons,
    }

    render(
      <MemoryRouter initialEntries={['/personnes/p-42']}>
        <CupAppContext.Provider value={{ ...mockContextValue, persons: [personWith15Seasons] } as CupAppContextType}>
          <Routes>
            <Route path="/personnes/:personId" element={<PersonPage />} />
          </Routes>
        </CupAppContext.Provider>
      </MemoryRouter>,
    )

    // All 15 seasons are visible on the same page
    for (let yr = 2015; yr <= 2029; yr++) {
      expect(screen.getByRole('cell', { name: String(yr) })).toBeInTheDocument()
    }

    // No pagination controls
    expect(screen.queryByText(/Par page/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Suivant/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Précédent/i })).not.toBeInTheDocument()
  })

  it('renders a strong visual demarcation between player and coach phases with adapted stats', () => {
    const dualCareerPerson: Person = {
      ...mockPerson,
      primaryRole: 'COACH',
      coachSkill: 26,
      careerHistory: [
        { year: 2025, clubId: '13055-1', clubName: 'Olympique de Marseille', role: 'PLAYER', age: 34, attack: 24, defense: 12, matchesPlayed: 6, goals: 3, defensiveStops: 1 },
        { year: 2026, clubId: '13055-1', clubName: 'Olympique de Marseille', role: 'PLAYER', age: 35, attack: 22, defense: 11, matchesPlayed: 4, goals: 1, defensiveStops: 0 },
        { year: 2027, clubId: '13055-1', clubName: 'Olympique de Marseille', role: 'COACH', age: 36, attack: 0, defense: 0, coachSkill: 25, matchesPlayed: 7, goals: 0, defensiveStops: 0 },
        { year: 2028, clubId: '13055-1', clubName: 'Olympique de Marseille', role: 'COACH', age: 37, attack: 0, defense: 0, coachSkill: 26, matchesPlayed: 8, goals: 0, defensiveStops: 0 },
      ],
    }

    render(
      <MemoryRouter initialEntries={['/personnes/p-42']}>
        <CupAppContext.Provider value={{ ...mockContextValue, persons: [dualCareerPerson] } as CupAppContextType}>
          <Routes>
            <Route path="/personnes/:personId" element={<PersonPage />} />
          </Routes>
        </CupAppContext.Provider>
      </MemoryRouter>,
    )

    // Demarcation banner is displayed between phases
    expect(screen.getAllByText(/Période Joueur|Carrière de Joueur/i).length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText(/Reconversion · Carrière d'Entraîneur|Période Entraîneur/i).length).toBeGreaterThanOrEqual(1)

    // Coach row displays coach skill and matches directed
    const coachRow2028 = screen.getByRole('cell', { name: '2028' }).closest('tr')!
    expect(within(coachRow2028).getByText('26/30')).toBeInTheDocument()
    expect(within(coachRow2028).getByText('dirigés')).toBeInTheDocument()
    expect(within(coachRow2028).getByText('👔 Entraîneur')).toBeInTheDocument()

    // Player row displays player stats
    const playerRow2025 = screen.getByRole('cell', { name: '2025' }).closest('tr')!
    expect(within(playerRow2025).getByText('⚽ 3')).toBeInTheDocument()
    expect(within(playerRow2025).getByText('🛡️ 1')).toBeInTheDocument()
  })

  it('applies color-coded backgrounds and left accent borders for title wins in player and coach seasons', () => {
    const titledPerson: Person = {
      ...mockPerson,
      careerHistory: [
        {
          year: 2024,
          clubId: '13055-1',
          clubName: 'Olympique de Marseille',
          role: 'PLAYER',
          age: 24,
          attack: 28,
          defense: 14,
          isDepartmentChampion: true,
          stageLabel: 'Champion Départemental 🏅',
        },
        {
          year: 2025,
          clubId: '13055-1',
          clubName: 'Olympique de Marseille',
          role: 'PLAYER',
          age: 25,
          attack: 28,
          defense: 14,
          isRegionChampion: true,
          stageLabel: 'Champion Régional 🌟',
        },
        {
          year: 2026,
          clubId: '13055-1',
          clubName: 'Olympique de Marseille',
          role: 'PLAYER',
          age: 26,
          attack: 29,
          defense: 14,
          isConferenceChampion: true,
          stageLabel: 'Champion de Conférence 👑',
        },
        {
          year: 2027,
          clubId: '13055-1',
          clubName: 'Olympique de Marseille',
          role: 'PLAYER',
          age: 27,
          attack: 30,
          defense: 15,
          isNationalChampion: true,
          stageLabel: 'Champion de France 🏆',
        },
        {
          year: 2028,
          clubId: '13055-1',
          clubName: 'Olympique de Marseille',
          role: 'COACH',
          age: 28,
          attack: 0,
          defense: 0,
          coachSkill: 26,
          isNationalChampion: true,
          stageLabel: 'Champion de France 🏆',
        },
      ],
    }

    render(
      <MemoryRouter initialEntries={['/personnes/p-42']}>
        <CupAppContext.Provider value={{ ...mockContextValue, persons: [titledPerson] } as CupAppContextType}>
          <Routes>
            <Route path="/personnes/:personId" element={<PersonPage />} />
          </Routes>
        </CupAppContext.Provider>
      </MemoryRouter>,
    )

    // National title row (Player) - Gold background
    const nationalPlayerRow = screen.getByRole('cell', { name: '2027' }).closest('tr')!
    expect(nationalPlayerRow.style.background).toContain('rgba(234, 179, 8')
    expect(nationalPlayerRow.style.borderLeft).toContain('4px solid rgb(250, 204, 21)')

    // National title row (Coach) - Also Gold background
    const nationalCoachRow = screen.getByRole('cell', { name: '2028' }).closest('tr')!
    expect(nationalCoachRow.style.background).toContain('rgba(234, 179, 8')
    expect(nationalCoachRow.style.borderLeft).toContain('4px solid rgb(250, 204, 21)')

    // Conference title row - Purple background
    const confRow = screen.getByRole('cell', { name: '2026' }).closest('tr')!
    expect(confRow.style.background).toContain('rgba(168, 85, 247')
    expect(confRow.style.borderLeft).toContain('4px solid rgb(192, 132, 252)')

    // Region title row - Emerald background
    const regRow = screen.getByRole('cell', { name: '2025' }).closest('tr')!
    expect(regRow.style.background).toContain('rgba(16, 185, 129')
    expect(regRow.style.borderLeft).toContain('4px solid rgb(52, 211, 153)')

    // Department title row - Neutral/Slate background
    const deptRow = screen.getByRole('cell', { name: '2024' }).closest('tr')!
    expect(deptRow.style.background).toContain('rgba(148, 163, 184')
    expect(deptRow.style.borderLeft).toContain('4px solid rgb(148, 163, 184)')
  })

  it('displays former secondary club name instead of merged alliance name for pre-fusion seasons', () => {
    const mergedClub = {
      id: '13005-1',
      name: 'Alliance Aubagne-Cassis',
      strength: 28,
      communeId: '13005',
      fusedClubs: [
        {
          id: '13022-1',
          name: 'Étoile de Cassis',
          year: 2026,
          communeId: '13022',
          communeName: 'Cassis',
          departmentId: '13',
        },
      ],
    } as any

    const clubsMap = new Map([
      ['13005-1', mergedClub],
    ])

    const fusionsList = [
      {
        id: 'fusion-1',
        mergedClubId: '13005-1',
        mergedClubName: 'Alliance Aubagne-Cassis',
        leadClubId: '13005-1',
        leadClubName: 'Aubagne FC',
        absorbedClubId: '13022-1',
        absorbedClubName: 'Étoile de Cassis',
        fusionYear: 2026,
      },
    ] as any

    const playerWithFusionHistory: Person = {
      ...mockPerson,
      id: 'p-fusion',
      birthCommuneId: '13022',
      birthCommuneName: 'Cassis',
      careerHistory: [
        {
          year: 2024,
          clubId: '13022-1',
          clubName: 'Étoile de Cassis',
          role: 'PLAYER',
          age: 24,
          attack: 25,
          defense: 12,
        },
        {
          year: 2025,
          clubId: '13005-1',
          clubName: 'Alliance Aubagne-Cassis', // Even if record got stored with merged club name
          role: 'PLAYER',
          age: 25,
          attack: 26,
          defense: 13,
        },
        {
          year: 2026,
          clubId: '13005-1',
          clubName: 'Alliance Aubagne-Cassis',
          role: 'PLAYER',
          age: 26,
          attack: 27,
          defense: 13,
        },
      ],
    }

    render(
      <MemoryRouter initialEntries={['/personnes/p-fusion']}>
        <CupAppContext.Provider
          value={{
            ...mockContextValue,
            persons: [playerWithFusionHistory],
            clubsById: clubsMap,
            fusions: fusionsList,
          } as CupAppContextType}
        >
          <Routes>
            <Route path="/personnes/:personId" element={<PersonPage />} />
          </Routes>
        </CupAppContext.Provider>
      </MemoryRouter>,
    )

    const row2024 = screen.getByRole('cell', { name: '2024' }).closest('tr')!
    const row2025 = screen.getByRole('cell', { name: '2025' }).closest('tr')!
    const row2026 = screen.getByRole('cell', { name: '2026' }).closest('tr')!

    // In 2024 (pre-fusion, direct absorbed id), secondary absorbed club is rendered
    const preFusionDirectLink = within(row2024).getByRole('link', { name: 'Étoile de Cassis' })
    expect(preFusionDirectLink).toHaveAttribute('href', '/equipes/13022-1')
    expect(within(row2024).queryByText('Alliance Aubagne-Cassis')).not.toBeInTheDocument()

    // In 2025 (pre-fusion, merged id but player from Cassis), resolves to secondary absorbed club
    const preFusionResolvedLink = within(row2025).getByRole('link', { name: 'Étoile de Cassis' })
    expect(preFusionResolvedLink).toHaveAttribute('href', '/equipes/13022-1')
    expect(within(row2025).queryByText('Alliance Aubagne-Cassis')).not.toBeInTheDocument()

    // In 2026 (post-fusion), merged club is rendered with alliance name
    const postFusionLink = within(row2026).getByRole('link', { name: 'Alliance Aubagne-Cassis' })
    expect(postFusionLink).toHaveAttribute('href', '/equipes/13005-1')
  })
})

