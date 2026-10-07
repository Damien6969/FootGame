import { useState, useEffect, useRef, type FormEvent } from 'react'
import { useOptionalCupApp } from './CupAppContext'
import { CUP_CONFIG } from '../config/cupConfig'

const RANDOM_SEEDS_PREFIXES = [
  'coupe-france',
  'epopee',
  'aventure',
  'gloire',
  'terroirs',
  'communes',
  'defi-national',
  'etoiles',
  'heros',
  'magie-coupe',
]

function generateRandomSeed(): string {
  const prefix = RANDOM_SEEDS_PREFIXES[Math.floor(Math.random() * RANDOM_SEEDS_PREFIXES.length)]
  const suffix = Math.random().toString(36).substring(2, 6)
  return `${prefix}-2026-${suffix}`
}

export function ResetModal() {
  const cupApp = useOptionalCupApp()
  const [seedInput, setSeedInput] = useState<string>(CUP_CONFIG.defaultSeed)
  const [isResetting, setIsResetting] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  if (!cupApp) return null

  const {
    isResetModalOpen,
    closeResetModal,
    resetAllHistory,
    session,
  } = cupApp

  useEffect(() => {
    if (isResetModalOpen) {
      setSeedInput(session?.seed ?? CUP_CONFIG.defaultSeed)
      setIsResetting(false)
      // Focus input shortly after opening
      setTimeout(() => {
        inputRef.current?.select()
      }, 50)
    }
  }, [isResetModalOpen, session?.seed])

  useEffect(() => {
    if (!isResetModalOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isResetting) {
        closeResetModal()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isResetModalOpen, isResetting, closeResetModal])

  if (!isResetModalOpen) return null

  const handleRandomize = () => {
    setSeedInput(generateRandomSeed())
  }

  const handleDefault = () => {
    setSeedInput(CUP_CONFIG.defaultSeed)
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (isResetting) return
    setIsResetting(true)
    try {
      const chosenSeed = seedInput.trim() || CUP_CONFIG.defaultSeed
      await resetAllHistory(chosenSeed)
      closeResetModal()
    } finally {
      setIsResetting(false)
    }
  }

  return (
    <div
      className="reset-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="reset-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isResetting) {
          closeResetModal()
        }
      }}
    >
      <div className="reset-modal">
        <div className="reset-modal-header">
          <span className="reset-modal-badge" aria-hidden="true">
            ⚠️ Remise à zéro
          </span>
          <h2 id="reset-modal-title" className="reset-modal-title">
            Réinitialiser la simulation
          </h2>
          <p className="reset-modal-subtitle">
            Attention : cette action effacera l'ensemble de l'historique, les palmarès et les
            saisons archivées pour redémarrer une nouvelle aventure vierge.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="reset-modal-form">
          <div className="reset-modal-field">
            <label htmlFor="reset-seed-input" className="reset-modal-label">
              Seed globale de départ :
            </label>
            <div className="reset-modal-input-row">
              <input
                ref={inputRef}
                id="reset-seed-input"
                type="text"
                className="reset-modal-input"
                value={seedInput}
                onChange={(e) => setSeedInput(e.target.value)}
                placeholder="ex: tournoi-2026, bretagne-power..."
                disabled={isResetting}
                required
              />
              <button
                type="button"
                className="btn-seed-action"
                onClick={handleRandomize}
                title="Générer une seed aléatoire"
                disabled={isResetting}
              >
                🎲 Aléatoire
              </button>
              <button
                type="button"
                className="btn-seed-action"
                onClick={handleDefault}
                title={`Revenir à la seed par défaut (${CUP_CONFIG.defaultSeed})`}
                disabled={isResetting}
              >
                ↺ Défaut
              </button>
            </div>
            <p className="reset-modal-hint">
              💡 La <strong>seed</strong> détermine l'arbre du tournoi, les tirages au sort par
              département et région, ainsi que les facteurs aléatoires. Une même seed garantit une
              reproduction exacte des matchs.
            </p>
          </div>

          <div className="reset-modal-actions">
            <button
              type="button"
              className="btn-modal-cancel"
              onClick={closeResetModal}
              disabled={isResetting}
            >
              Annuler
            </button>
            <button
              type="submit"
              className="btn-modal-confirm-reset"
              disabled={isResetting}
            >
              {isResetting ? (
                <>⏳ Réinitialisation...</>
              ) : (
                <>↺ Confirmer et Réinitialiser</>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
