import type { MouseEvent } from 'react'
import { useOptionalCupApp } from '../../app/CupAppContext'

type Props = Readonly<{
  teamId: string
  teamName?: string
  size?: 'sm' | 'md' | 'lg'
  className?: string
  withLabel?: boolean
}>

export function FavoriteStarButton({
  teamId,
  teamName,
  size = 'md',
  className = '',
  withLabel = false,
}: Props) {
  const app = useOptionalCupApp()
  if (!app) return null

  const { isFavorite, toggleFavorite, getFavoriteColor } = app
  const active = isFavorite(teamId)
  const color = active ? getFavoriteColor(teamId) : undefined

  const handleClick = (e: MouseEvent<HTMLButtonElement>) => {
    e.preventDefault()
    e.stopPropagation()
    toggleFavorite(teamId)
  }

  const label = active
    ? `Retirer ${teamName ?? 'le club'} des favoris`
    : `Ajouter ${teamName ?? 'le club'} aux favoris`

  return (
    <button
      type="button"
      className={`favorite-star-btn favorite-star-btn--${size} ${active ? 'is-active' : ''} ${className}`}
      onClick={handleClick}
      title={label}
      aria-label={label}
      style={active && color ? { color, borderColor: color } : undefined}
    >
      <span className="favorite-star-icon" aria-hidden="true">
        {active ? '★' : '☆'}
      </span>
      {withLabel && (
        <span className="favorite-star-label">
          {active ? 'Favori suivi' : 'Suivre ce club'}
        </span>
      )}
    </button>
  )
}
