import { Link } from 'react-router-dom'
import type { CoachSnapshot } from './types'
import './coaches.css'

export function CoachBadge({ coach, showBonus = false }: { coach?: CoachSnapshot | null; showBonus?: boolean }) {
  if (!coach) return <span className="coach-empty">{coach === null ? 'Aucun entraîneur' : 'Entraîneur non enregistré'}</span>
  return <span className="coach-badge">
    <Link to={`/personnes/${encodeURIComponent(coach.personId)}`}>{coach.name}</Link>
    <span className="coach-rating" title={`Potentiel : ${coach.peakSkill}/30 · Pic à ${coach.peakAge} ans`}>{coach.skill}<small>/30</small></span>
    {showBonus && <small className="coach-bonus">+{coach.bonus.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} force</small>}
  </span>
}
