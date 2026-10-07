import { beforeEach, expect, it, vi } from 'vitest'
import { cupRepository } from './cupRepository'

beforeEach(async () => { await cupRepository.clearAll(); localStorage.clear() })

it('round-trips player favorites and accepts older backups', async () => {
  localStorage.setItem('coupe_favorite_person_ids', '["player-1","player-2"]')
  const backup = await cupRepository.exportBackup()
  expect(backup.favoritePersonIds).toEqual(['player-1', 'player-2'])
  localStorage.clear()
  await cupRepository.importBackup(backup)
  expect(localStorage.getItem('coupe_favorite_person_ids')).toBe('["player-1","player-2"]')
  await cupRepository.importBackup({ version: 1, exportedAt: new Date().toISOString(), archives: [] })
  expect(localStorage.getItem('coupe_favorite_person_ids')).toBe('[]')
})

it('rejects malformed player favorites before modifying existing favorites', async () => {
  localStorage.setItem('coupe_favorite_team_ids', '["old-club"]')
  await expect(cupRepository.importBackup({ version: 1, exportedAt: new Date().toISOString(),
    archives: [], favoritePersonIds: [123] } as never)).rejects.toThrow()
  expect(localStorage.getItem('coupe_favorite_team_ids')).toBe('["old-club"]')
})

it('rolls back club favorites if writing player favorites fails during import', async () => {
  localStorage.setItem('coupe_favorite_team_ids', '["old-club"]')
  localStorage.setItem('coupe_favorite_person_ids', '["old-player"]')
  const setItem = Storage.prototype.setItem
  const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key, value) {
    if (key === 'coupe_favorite_person_ids') throw new Error('Storage full')
    setItem.call(this, key, value)
  })
  try {
    await expect(cupRepository.importBackup({ version: 1, exportedAt: new Date().toISOString(),
      archives: [], favoriteTeamIds: ['new-club'], favoritePersonIds: ['new-player'] })).rejects.toThrow('Storage full')
    expect(localStorage.getItem('coupe_favorite_team_ids')).toBe('["old-club"]')
    expect(localStorage.getItem('coupe_favorite_person_ids')).toBe('["old-player"]')
  } finally { spy.mockRestore() }
})
