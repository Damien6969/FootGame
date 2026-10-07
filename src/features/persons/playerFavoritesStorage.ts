export const PLAYER_FAVORITES_STORAGE_KEY = 'coupe_favorite_person_ids'

export function loadPlayerFavorites(): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(PLAYER_FAVORITES_STORAGE_KEY) ?? '[]')
    return Array.isArray(parsed) ? [...new Set(parsed.filter((id): id is string => typeof id === 'string'))] : []
  } catch { return [] }
}

export function savePlayerFavorites(ids: readonly string[]): void {
  try { localStorage.setItem(PLAYER_FAVORITES_STORAGE_KEY, JSON.stringify(ids)) }
  catch { /* Même comportement que les favoris clubs en stockage restreint. */ }
}
