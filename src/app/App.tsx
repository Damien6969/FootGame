import { lazy, Suspense, useRef, type ChangeEvent } from 'react'
import { NavLink, Navigate, Route, Routes } from 'react-router-dom'
import { CupPage } from '../features/cup/CupPage'
import { useOptionalCupApp } from './CupAppContext'
import { ResetModal } from './ResetModal'
import { getRoundBadgeClass } from '../features/competition/echelonColors'

const TeamsPage = lazy(() => import('../features/teams/TeamsPage').then((m) => ({ default: m.TeamsPage })))
const TeamPage = lazy(() => import('../features/teams/TeamPage').then((m) => ({ default: m.TeamPage })))
const CommunesPage = lazy(() => import('../features/geography/CommunesPage').then((m) => ({ default: m.CommunesPage })))
const CommunePage = lazy(() => import('../features/geography/CommunePage').then((m) => ({ default: m.CommunePage })))
const MatchPage = lazy(() => import('../features/match/MatchPage').then((m) => ({ default: m.MatchPage })))
const TerritoriesPage = lazy(() => import('../features/overview/OverviewPages').then((m) => ({ default: m.TerritoriesPage })))
const HistoryPage = lazy(() => import('../features/overview/OverviewPages').then((m) => ({ default: m.HistoryPage })))
const AwardsPage = lazy(() => import('../features/overview/OverviewPages').then((m) => ({ default: m.AwardsPage })))
const PersonsPage = lazy(() => import('../features/persons/PersonsPage').then((m) => ({ default: m.PersonsPage })))
const PersonPage = lazy(() => import('../features/persons/PersonPage').then((m) => ({ default: m.PersonPage })))
const TransfersPage = lazy(() => import('../features/transfers/TransfersPage').then((m) => ({ default: m.TransfersPage })))
const TrophiesPage = lazy(() => import('../features/awards/TrophiesPage').then(m => ({ default: m.TrophiesPage })))

const navigationItems = [
  { label: 'Coupe', to: '/coupe' },
  { label: 'Équipes', to: '/equipes' },
  { label: 'Villes', to: '/villes' },
  { label: 'Personnalités', to: '/personnes' },
  { label: 'Transferts', to: '/transferts' },
  { label: 'Territoires', to: '/territoires' },
  { label: 'Historique', to: '/historique' },
  { label: 'Palmarès', to: '/palmares' },
  { label: 'Trophées', to: '/trophees' },
] as const

export function App() {
  const cupApp = useOptionalCupApp()
  const session = cupApp?.session
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleExportBackup = async () => {
    try {
      await cupApp?.exportBackup()
    } catch {
      alert("Erreur lors de l'exportation de la sauvegarde.")
    }
  }

  const handleImportClick = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    try {
      const ok = await cupApp?.importBackup(file)
      if (ok) {
        alert("Sauvegarde importée avec succès !")
      }
    } catch {
      alert("Erreur lors de l'importation de la sauvegarde. Fichier invalide ou corrompu.")
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = ""
      }
    }
  }

  const handleToolbarReset = () => {
    cupApp?.openResetModal()
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand-block">
          <span className="brand-mark" aria-hidden="true">C</span>
          <div>
            <p className="eyebrow">Simulation nationale</p>
            <h1>Coupe des communes</h1>
          </div>
          {session && (
            <div className="header-status-group">
              <span className="badge badge--blue">
                Saison {session.seasonYear ?? 2026}
              </span>
              <span className={getRoundBadgeClass(session.roundNumber)}>
                Tour {session.roundNumber}
              </span>
              <span className="badge badge--neutral">
                {session.activeTeamIds.length.toLocaleString('fr-FR')} clubs
              </span>
              <span className="badge badge--neutral" title={`Seed globale du tournoi : ${session.seed}`}>
                🌱 {session.seed}
              </span>
            </div>
          )}
        </div>

        <div className="header-toolbar">
          <nav className="primary-nav" aria-label="Navigation principale">
            {navigationItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) => isActive ? 'nav-link nav-link--active' : 'nav-link'}
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="header-toolbar-divider" aria-hidden="true" />

          <input
            type="file"
            ref={fileInputRef}
            accept=".json,.gz"
            style={{ display: 'none' }}
            onChange={handleFileChange}
            aria-hidden="true"
          />

          <button
            type="button"
            className="toolbar-backup-btn"
            onClick={handleExportBackup}
            title="Télécharger une sauvegarde compressée (.json.gz) de votre carrière et palmarès"
          >
            <span>💾 Exporter</span>
          </button>

          <button
            type="button"
            className="toolbar-backup-btn"
            onClick={handleImportClick}
            title="Charger une sauvegarde existante (.json ou .json.gz)"
          >
            <span>📂 Importer</span>
          </button>

          <button
            type="button"
            className="toolbar-reset-btn"
            onClick={handleToolbarReset}
            title="Réinitialiser complètement la Coupe et l'historique"
            aria-label="Réinitialiser la Coupe et l'historique"
          >
            <span className="reset-icon" aria-hidden="true">↺</span>
            <span>Réinitialiser</span>
          </button>
        </div>
      </header>

      {cupApp?.lastAutoBackupResult && (
        <div
          role="status"
          style={{
            background: cupApp.lastAutoBackupResult.success
              ? 'rgba(16, 185, 129, 0.12)'
              : 'rgba(239, 68, 68, 0.12)',
            borderBottom: cupApp.lastAutoBackupResult.success
              ? '1px solid rgba(16, 185, 129, 0.35)'
              : '1px solid rgba(239, 68, 68, 0.35)',
            color: cupApp.lastAutoBackupResult.success ? '#a7f3d0' : '#fca5a5',
            padding: '8px 16px',
            fontSize: '0.85rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>💾</span>
            <span>
              {cupApp.lastAutoBackupResult.savedLocally ? (
                <>
                  Sauvegarde automatique de fin de saison exportée avec succès dans le dossier local{' '}
                  <strong style={{ color: '#ffffff' }}>{cupApp.lastAutoBackupResult.localPath ?? 'sauvegardes/'}</strong> !
                </>
              ) : (
                <>
                  Sauvegarde exportée :{' '}
                  <strong style={{ color: '#ffffff' }}>{cupApp.lastAutoBackupResult.filename}</strong>
                </>
              )}
            </span>
          </div>
          <button
            type="button"
            onClick={cupApp.dismissAutoBackupNotification}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'inherit',
              cursor: 'pointer',
              fontSize: '1rem',
              padding: '2px 6px',
              lineHeight: 1,
            }}
            aria-label="Fermer la notification"
          >
            ✕
          </button>
        </div>
      )}

      <main className="app-content">
        <Suspense fallback={<div className="page-loading-skeleton"><span className="simulation-spinner" /> Chargement…</div>}>
          <Routes>
            <Route path="/" element={<Navigate to="/coupe" replace />} />
            <Route path="/coupe" element={<CupPage />} />
            <Route path="/equipes" element={<TeamsPage />} />
            <Route path="/equipes/:teamId" element={<TeamPage />} />
            <Route path="/villes" element={<CommunesPage />} />
            <Route path="/villes/:communeId" element={<CommunePage />} />
            <Route path="/communes" element={<Navigate to="/villes" replace />} />
            <Route path="/communes/:communeId" element={<Navigate to="/villes/:communeId" replace />} />
            <Route path="/personnes" element={<PersonsPage />} />
            <Route path="/personnes/:personId" element={<PersonPage />} />
            <Route path="/transferts" element={<TransfersPage />} />
            <Route path="/matchs/:matchId" element={<MatchPage />} />
            <Route path="/territoires" element={<TerritoriesPage />} />
            <Route path="/historique" element={<HistoryPage />} />
            <Route path="/palmares" element={<AwardsPage />} />
            <Route path="/trophees" element={<TrophiesPage />} />
            <Route path="/intersaison" element={<Navigate to="/coupe?tab=intersaison" replace />} />
            <Route path="*" element={<Navigate to="/coupe" replace />} />
          </Routes>
        </Suspense>
      </main>

      <ResetModal />
    </div>
  )
}
