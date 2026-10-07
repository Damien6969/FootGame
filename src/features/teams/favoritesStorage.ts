const FAVORITES_STORAGE_KEY = 'coupe_favorite_team_ids'

export const FAVORITE_PALETTE = [
  '#38bdf8', // Cyan ciel
  '#f59e0b', // Ambre doré
  '#ec4899', // Rose fuchsia
  '#10b981', // Vert émeraude
  '#a855f7', // Violet néon
  '#f97316', // Orange vif
  '#06b6d4', // Turquoise
  '#ef4444', // Rouge rubis
  '#84cc16', // Vert lime
  '#818cf8', // Indigo
] as const

export function loadStoredFavorites(): string[] {
  try {
    const raw = localStorage.getItem(FAVORITES_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : []
  } catch {
    return []
  }
}

export function saveStoredFavorites(ids: readonly string[]): void {
  try {
    localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(ids))
  } catch {
    // Ignore storage errors in private/restricted environments
  }
}

export function getFavoriteColorForIndex(index: number): string {
  if (index < 0) return FAVORITE_PALETTE[0]
  return FAVORITE_PALETTE[index % FAVORITE_PALETTE.length]
}
