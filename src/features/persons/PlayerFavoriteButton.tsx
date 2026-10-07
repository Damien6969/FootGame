import { useOptionalCupApp } from '../../app/CupAppContext'
import type { Person } from './types'
import './player-favorites.css'

export function PlayerFavoriteButton({ person, withLabel = false }: {
  person: Pick<Person, 'id' | 'firstName' | 'lastName'>
  withLabel?: boolean
}) {
  const app = useOptionalCupApp()
  if (!app?.togglePlayerFavorite) return null
  const active = app.favoritePersonIds.includes(person.id)
  const name = `${person.firstName} ${person.lastName}`
  const label = active ? `Retirer ${name} des favoris` : `Ajouter ${name} aux favoris`
  const visibleLabel = active ? 'Joueur suivi' : 'Suivre ce joueur'
  return <button type="button"
    className={`favorite-star-btn favorite-star-btn--${withLabel ? 'md' : 'sm'} player-favorite-button ${active ? 'is-active' : ''}`}
    aria-label={withLabel ? `${label} · ${visibleLabel}` : label} title={label} aria-pressed={active}
    onClick={event => { event.preventDefault(); event.stopPropagation(); app.togglePlayerFavorite(person.id) }}>
    <span aria-hidden="true">{active ? '★' : '☆'}</span>
    {withLabel && <span className="favorite-star-label">{visibleLabel}</span>}
  </button>
}
