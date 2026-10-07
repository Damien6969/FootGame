import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { CupAppContext, type CupAppContextType } from './CupAppContext'
import { ResetModal } from './ResetModal'
import { CUP_CONFIG } from '../config/cupConfig'

function renderModalWithContext(overrides: Partial<CupAppContextType> = {}) {
  const resetAllHistoryMock = vi.fn().mockResolvedValue(undefined)
  const closeResetModalMock = vi.fn()

  const defaultContext: CupAppContextType = {
    dataset: null,
    clubs: [],
    clubsById: new Map(),
    clubsByCommuneId: new Map(),
    persons: [],
    session: {
      id: 'active',
      seed: 'test-seed-2026',
      seasonYear: 2026,
      datasetVersion: '1',
      activeTeamIds: [],
      roundNumber: 1,
      round: { matches: [], byeTeamIds: [] },
      results: {},
      history: [],
      roundByes: {},
      clubs: [],
    },
    archives: [],
    teamRecords: new Map(),
    ready: true,
    error: null,
    persistSession: vi.fn(),
    resetSession: vi.fn(),
    resetAllHistory: resetAllHistoryMock,
    createCup: vi.fn(),
    advanceToNextSeason: vi.fn(),
    reloadSession: vi.fn(),
    renameClub: vi.fn(),
    exportBackup: vi.fn(),
    importBackup: vi.fn().mockResolvedValue(true),
    favoriteTeamIds: [],
      favoritePersonIds: [],
      togglePlayerFavorite: vi.fn(),
    toggleFavorite: vi.fn(),
    isFavorite: vi.fn().mockReturnValue(false),
    getFavoriteColor: vi.fn().mockReturnValue('#fff'),
    lastAutoBackupResult: null,
    dismissAutoBackupNotification: vi.fn(),
    isResetModalOpen: true,
    openResetModal: vi.fn(),
    closeResetModal: closeResetModalMock,
    ...overrides,
  }

  const result = render(
    <CupAppContext.Provider value={defaultContext}>
      <ResetModal />
    </CupAppContext.Provider>
  )

  return {
    ...result,
    resetAllHistoryMock,
    closeResetModalMock,
  }
}

describe('ResetModal', () => {
  it('does not render when isResetModalOpen is false', () => {
    renderModalWithContext({ isResetModalOpen: false })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('renders seed input initialized with current session seed', () => {
    renderModalWithContext()
    expect(screen.getByRole('dialog')).toBeVisible()
    const input = screen.getByLabelText(/Seed globale de départ/i) as HTMLInputElement
    expect(input.value).toBe('test-seed-2026')
  })

  it('allows customizing the seed and confirming reset', async () => {
    const user = userEvent.setup()
    const { resetAllHistoryMock, closeResetModalMock } = renderModalWithContext()

    const input = screen.getByLabelText(/Seed globale de départ/i)
    fireEvent.change(input, { target: { value: 'ma-super-seed-2026' } })

    const confirmBtn = screen.getByRole('button', { name: /Confirmer et Réinitialiser/i })
    await user.click(confirmBtn)

    expect(resetAllHistoryMock).toHaveBeenCalledWith('ma-super-seed-2026')
    expect(closeResetModalMock).toHaveBeenCalled()
  })

  it('generates a random seed when clicking Aléatoire', async () => {
    const user = userEvent.setup()
    renderModalWithContext()

    const input = screen.getByLabelText(/Seed globale de départ/i) as HTMLInputElement
    const randomBtn = screen.getByRole('button', { name: /🎲 Aléatoire/i })

    await user.click(randomBtn)
    expect(input.value).not.toBe('test-seed-2026')
    expect(input.value.length).toBeGreaterThan(5)
  })

  it('restores default seed when clicking Défaut', async () => {
    const user = userEvent.setup()
    renderModalWithContext()

    const input = screen.getByLabelText(/Seed globale de départ/i) as HTMLInputElement
    await user.clear(input)
    await user.type(input, 'autre-chose')

    const defaultBtn = screen.getByRole('button', { name: /↺ Défaut/i })
    await user.click(defaultBtn)

    expect(input.value).toBe(CUP_CONFIG.defaultSeed)
  })

  it('cancels and closes when clicking Annuler', async () => {
    const user = userEvent.setup()
    const { resetAllHistoryMock, closeResetModalMock } = renderModalWithContext()

    const cancelBtn = screen.getByRole('button', { name: /Annuler/i })
    await user.click(cancelBtn)

    expect(resetAllHistoryMock).not.toHaveBeenCalled()
    expect(closeResetModalMock).toHaveBeenCalled()
  })
})
