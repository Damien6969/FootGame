import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import type { InterseasonReport, SeasonArchive, FusionEvent } from '../storage/cupRepository'
import type { Club } from '../teams/types'
import { computeStrength } from '../match/simulateMatch'
import { useOptionalCupApp } from '../../app/CupAppContext'
import { ClubBadge } from '../teams/ClubBadge'

export type GainTier = 'major' | 'medium' | 'minor'

export function getGainTier(gain: number): GainTier {
  if (gain >= 3.0) return 'major'
  if (gain >= 1.0) return 'medium'
  return 'minor'
}

export function getFusionDemographicGain(
  fusion: FusionEvent,
  communes?: readonly { id: string; name: string; population: number }[],
): { oldStrength: number; gain: number; tier: GainTier } {
  let oldStrength = fusion.oldStrength

  // Si pour une raison d'historique (sauvegarde ancienne) oldStrength contenait la force effective
  // avec joueurs/coach (> newStrength), on rétablit la force de base démographique du siège
  if (oldStrength > fusion.newStrength && communes && communes.length > 0) {
    const leadCommuneName = fusion.leadCommuneName ?? fusion.communeNames[0]
    const leadCommune = communes.find(
      (c) => c.name.toLowerCase() === leadCommuneName?.toLowerCase() || (fusion.leadCommuneId && c.id === fusion.leadCommuneId)
    )
    if (leadCommune && leadCommune.population) {
      oldStrength = Number(computeStrength(leadCommune.population, 1000, 2150000).toFixed(1))
    } else {
      oldStrength = Math.min(oldStrength, Number(Math.max(1, fusion.newStrength - 0.5).toFixed(1)))
    }
  }

  const gain = Math.max(0, Number((fusion.newStrength - oldStrength).toFixed(1)))
  return {
    oldStrength,
    gain,
    tier: getGainTier(gain),
  }
}

export interface InterseasonViewProps {
  currentReport?: InterseasonReport
  currentSeasonYear: number
  archives: readonly SeasonArchive[]
  clubsById?: ReadonlyMap<string, Club>
}

type SortField = 'newStrength' | 'gain' | 'population' | 'name'

export function InterseasonView({
  currentReport,
  currentSeasonYear,
  archives,
  clubsById: propClubsById,
}: InterseasonViewProps) {
  const cupApp = useOptionalCupApp()
  const dataset = cupApp?.dataset
  const clubsById = propClubsById ?? cupApp?.clubsById

  const getFusionGain = (f: FusionEvent) => getFusionDemographicGain(f, dataset?.communes)

  // Map commune name (lowercase) -> communeId
  const communeIdByName = useMemo(() => {
    const map = new Map<string, string>()
    if (dataset?.communes) {
      for (const c of dataset.communes) {
        map.set(c.name.toLowerCase(), c.id)
      }
    }
    return map
  }, [dataset?.communes])

  const getCommuneId = (name: string): string | undefined => {
    return communeIdByName.get(name.trim().toLowerCase())
  }

  // Aggregate all available interseason reports
  const allReports = useMemo(() => {
    const list: { seasonYear: number; report: InterseasonReport; isCurrent: boolean }[] = []
    if (currentReport) {
      list.push({ seasonYear: currentReport.seasonYear ?? currentSeasonYear, report: currentReport, isCurrent: true })
    }
    for (const arch of archives) {
      const rep = arch.interseasonReport
      if (rep && !list.some((item) => item.seasonYear === (rep.seasonYear ?? arch.year + 1))) {
        list.push({ seasonYear: rep.seasonYear ?? arch.year + 1, report: rep, isCurrent: false })
      }
    }
    return list.sort((a, b) => b.seasonYear - a.seasonYear)
  }, [currentReport, currentSeasonYear, archives])

  const [selectedYear, setSelectedYear] = useState<number>(
    currentReport?.seasonYear ?? currentSeasonYear
  )

  const activeEntry = useMemo(() => {
    return allReports.find((r) => r.seasonYear === selectedYear) ?? allReports[0]
  }, [allReports, selectedYear])

  const report = activeEntry?.report

  // Search and sorting for alliances table
  const [searchQuery, setSearchQuery] = useState('')
  const [sortField, setSortField] = useState<SortField>('newStrength')
  const [sortAsc, setSortAsc] = useState(false)

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortAsc((prev) => !prev)
    } else {
      setSortField(field)
      setSortAsc(false)
    }
  }

  const filteredAndSortedFusions = useMemo(() => {
    if (!report?.fusions) return []
    const q = searchQuery.trim().toLowerCase()

    let items = report.fusions.filter((f) => {
      if (!q) return true
      if (f.mergedClubName.toLowerCase().includes(q)) return true
      if (f.absorbedClubName?.toLowerCase().includes(q)) return true
      if (f.communeNames.some((c) => c.toLowerCase().includes(q))) return true
      return false
    })

    items = [...items].sort((a, b) => {
      let diff = 0
      switch (sortField) {
        case 'newStrength':
          diff = a.newStrength - b.newStrength
          break
        case 'gain':
          diff = getFusionGain(a).gain - getFusionGain(b).gain
          break
        case 'population':
          diff = a.totalPopulation - b.totalPopulation
          break
        case 'name':
          diff = a.mergedClubName.localeCompare(b.mergedClubName)
          break
      }
      return sortAsc ? diff : -diff
    })

    return items
  }, [report?.fusions, searchQuery, sortField, sortAsc, dataset?.communes])

  // Summary statistics
  const stats = useMemo(() => {
    if (!report) return null
    const fusionsCount = report.fusions.length
    const secessionsCount = report.secessions?.length ?? 0
    const rival = report.rivalCreated
    const totalPop = report.fusions.reduce((sum, f) => sum + f.totalPopulation, 0)
    const maxStrength = report.fusions.length > 0
      ? Math.max(...report.fusions.map((f) => f.newStrength))
      : 0
    const avgGain = report.fusions.length > 0
      ? report.fusions.reduce((sum, f) => sum + getFusionGain(f).gain, 0) / fusionsCount
      : 0

    return {
      fusionsCount,
      secessionsCount,
      rival,
      totalPop,
      maxStrength,
      avgGain,
    }
  }, [report, dataset?.communes])

  const championClub = useMemo(() => {
    if (!report?.rivalCreated?.parentChampionName || !clubsById) return null
    return Array.from(clubsById.values()).find(
      (c) => c.name === report.rivalCreated?.parentChampionName
    )
  }, [report?.rivalCreated?.parentChampionName, clubsById])

  if (!report || report.fusions.length === 0) {
    return (
      <div className="interseason-empty-container">
        <div className="interseason-empty-card">
          <span className="interseason-empty-icon" aria-hidden="true">🤝</span>
          <h2>Bilan de l'Intersaison</h2>
          <p className="interseason-empty-lead">
            Aucun rapport d'intersaison n'a encore été généré pour la Saison {currentSeasonYear}.
          </p>
          <div className="interseason-empty-guide">
            <div className="guide-item">
              <span className="guide-icon">🤝</span>
              <div>
                <strong>Alliances intercommunales</strong>
                <p>À la fin de chaque saison, les communes proches éliminées au même tour s'unissent pour former des ententes plus fortes.</p>
              </div>
            </div>
            <div className="guide-item">
              <span className="guide-icon">⚡</span>
              <div>
                <strong>Club Rival</strong>
                <p>La commune du champion national fonde un club dissident pour contester sa suprématie la saison suivante.</p>
              </div>
            </div>
            <div className="guide-item">
              <span className="guide-icon">💥</span>
              <div>
                <strong>Régénérations métropolitaines</strong>
                <p>Les grandes métropoles (≥ 50 000 hab.) recréent leur propre club local tout en restant partenaires de leur entente.</p>
              </div>
            </div>
          </div>
          <p className="interseason-empty-hint">
            💡 Simulez la saison jusqu'au sacre du champion puis lancez la <strong>Saison {currentSeasonYear + 1}</strong> pour générer votre premier bilan d'intersaison complet !
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="interseason-page">
      {/* Header & Season picker */}
      <div className="interseason-header">
        <div>
          <div className="interseason-eyebrow-row">
            <span className="badge badge--blue">Intersaison officielle</span>
            {activeEntry?.isCurrent && (
              <span className="badge badge--emerald">Saison en cours</span>
            )}
          </div>
          <h2 className="interseason-title">
            Bilan Intersaison · Saison {activeEntry?.seasonYear}
          </h2>
          <p className="interseason-subtitle">
            Restructuration des clubs, alliances territoriales et mouvements sportifs validés suite à l'exercice précédent.
          </p>
        </div>

        {allReports.length > 1 && (
          <div className="interseason-season-picker">
            <label htmlFor="interseason-season-select">Consulter une édition :</label>
            <select
              id="interseason-season-select"
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="interseason-select"
            >
              {allReports.map((entry) => (
                <option key={entry.seasonYear} value={entry.seasonYear}>
                  Saison {entry.seasonYear} {entry.isCurrent ? '(Active)' : ''}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* KPI Stats summary */}
      {stats && (
        <div className="interseason-kpi-grid">
          <div className="interseason-kpi-card">
            <span className="kpi-icon">🤝</span>
            <div className="kpi-content">
              <span className="kpi-value">{stats.fusionsCount}</span>
              <span className="kpi-label">Nouvelles Alliances</span>
            </div>
          </div>
          <div className="interseason-kpi-card">
            <span className="kpi-icon">📈</span>
            <div className="kpi-content">
              <span className="kpi-value">+{stats.avgGain.toFixed(1)} pts</span>
              <span className="kpi-label">Gain moyen de force</span>
            </div>
          </div>
          <div className="interseason-kpi-card">
            <span className="kpi-icon">👥</span>
            <div className="kpi-content">
              <span className="kpi-value">{stats.totalPop.toLocaleString('fr-FR')}</span>
              <span className="kpi-label">Habitants rassemblés</span>
            </div>
          </div>
          <div className="interseason-kpi-card">
            <span className="kpi-icon">⚡</span>
            <div className="kpi-content">
              <span className="kpi-value">
                {stats.rival ? '1 Rival créé' : stats.secessionsCount > 0 ? `${stats.secessionsCount} Régén.` : '0 Dissidence'}
              </span>
              <span className="kpi-label">Mouvements de clubs</span>
            </div>
          </div>
        </div>
      )}

      {/* Section Club Rival si présent */}
      {report.rivalCreated && (
        <div className="interseason-rival-banner">
          <div className="rival-badge-flag">⚡ RIVALITÉ HISTORIQUE</div>
          <div className="rival-body">
            <div className="rival-main-info">
              <h3>
                Nouveau club rival fondé :{' '}
                <Link to={`/equipes/${report.rivalCreated.clubId}`} className="rival-club-link">
                  {report.rivalCreated.clubName}
                </Link>
              </h3>
              <p>
                Fondé à{' '}
                {getCommuneId(report.rivalCreated.communeName) ? (
                  <Link
                    to={`/villes/${getCommuneId(report.rivalCreated.communeName)}`}
                    className="rival-commune-link"
                    title={`Voir la commune de ${report.rivalCreated.communeName}`}
                  >
                    🏛️ <strong>{report.rivalCreated.communeName}</strong>
                  </Link>
                ) : (
                  <strong>{report.rivalCreated.communeName}</strong>
                )}{' '}
                pour défier le champion en titre{' '}
                {championClub ? (
                  <Link
                    to={`/equipes/${championClub.id}`}
                    className="rival-champion-link"
                    title={`Voir le club champion : ${championClub.name}`}
                  >
                    <em>{report.rivalCreated.parentChampionName}</em>
                  </Link>
                ) : (
                  <em>{report.rivalCreated.parentChampionName}</em>
                )}.
              </p>
            </div>
            <div className="rival-strength-badge">
              <span className="strength-label">Force de départ</span>
              <span className="strength-number">{report.rivalCreated.strength.toFixed(1)}/30</span>
              <span className="strength-sub">(-20% du champion)</span>
            </div>
          </div>
        </div>
      )}

      {/* Section Régénérations de grandes villes */}
      {(report.secessions?.length ?? 0) > 0 && (
        <div className="interseason-secessions-section">
          <h3 className="section-title">
            💥 Régénérations de clubs locaux ({report.secessions!.length})
          </h3>
          <p className="section-desc">
            Grandes communes (≥ 50 000 hab.) ayant recréé leur propre club de proximité tout en restant partenaires de leur entente originelle :
          </p>
          <div className="secessions-grid">
            {report.secessions!.map((sec, idx) => (
              <div key={idx} className="secession-card">
                <div className="secession-header">
                  <Link to={`/equipes/${sec.newClubId}`} className="secession-club-title-link">
                    <strong>🏉 {sec.newClubName}</strong>
                  </Link>
                  <Link to={`/equipes/${sec.newClubId}`} className="btn-link-sm">
                    Fiche club →
                  </Link>
                </div>
                <p className="secession-meta">
                  Commune de{' '}
                  <Link
                    to={`/villes/${sec.communeId}`}
                    className="secession-commune-link"
                    title={`Voir la ville de ${sec.communeName}`}
                  >
                    🏛️ <strong>{sec.communeName}</strong>
                  </Link>{' '}
                  · {sec.isCompleteWithdrawal ? 'Séparation définitive de l’entente : ' : 'Entente conservée : '}
                  <Link
                    to={`/equipes/${sec.parentEnteId}`}
                    className="parent-ente-link"
                    title={`Voir le club en entente : ${sec.parentEnteName}`}
                  >
                    {sec.parentEnteName}
                  </Link>
                </p>
                <div className="secession-impact">
                  <span>
                    −{sec.populationLost.toLocaleString('fr-FR')} hab. à l'entente
                    {sec.step ? ` (Étape ${sec.step}/3${sec.isCompleteWithdrawal ? ' · Divorce total' : ''})` : ''}
                  </span>
                  <span className="ente-strength">Force entente : {sec.newEnteStrength.toFixed(1)}/30</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Section Grand Tableau des Alliances */}
      <div className="interseason-table-section">
        <div className="table-header-row">
          <div>
            <h3 className="section-title">
              🤝 Tableau officiel des Alliances Intercommunales ({report.fusions.length})
            </h3>
            <p className="section-desc">
              Clubs fusionnés ordonnés par nouvelle force sportive, du plus fort au plus modeste.
            </p>
          </div>

          <div className="table-search-box">
            <input
              type="text"
              placeholder="Rechercher un club ou une commune..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="table-search-input"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="table-search-clear"
                title="Effacer la recherche"
              >
                ×
              </button>
            )}
          </div>
        </div>

        <div className="interseason-table-wrapper">
          <table className="interseason-table">
            <thead>
              <tr>
                <th className="col-rank">#</th>
                <th
                  className={`col-name sortable ${sortField === 'name' ? 'sorted' : ''}`}
                  onClick={() => handleSort('name')}
                  title="Trier par nom"
                >
                  Nouvelle Alliance {sortField === 'name' ? (sortAsc ? '▲' : '▼') : ''}
                </th>
                <th className="col-lead-commune">Ville Siège</th>
                <th className="col-absorbed">Club Partenaire Absorbé</th>
                <th className="col-communes">Communes associées</th>
                <th
                  className={`col-pop sortable ${sortField === 'population' ? 'sorted' : ''}`}
                  onClick={() => handleSort('population')}
                  title="Trier par population"
                >
                  Population {sortField === 'population' ? (sortAsc ? '▲' : '▼') : ''}
                </th>
                <th className="col-old-strength">Ancienne Force</th>
                <th
                  className={`col-new-strength sortable ${sortField === 'newStrength' ? 'sorted' : ''}`}
                  onClick={() => handleSort('newStrength')}
                  title="Trier par nouvelle force"
                >
                  Nouvelle Force {sortField === 'newStrength' ? (sortAsc ? '▲' : '▼') : ''}
                </th>
                <th
                  className={`col-gain sortable ${sortField === 'gain' ? 'sorted' : ''}`}
                  onClick={() => handleSort('gain')}
                  title="Trier par gain"
                >
                  Gain {sortField === 'gain' ? (sortAsc ? '▲' : '▼') : ''}
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredAndSortedFusions.length === 0 ? (
                <tr>
                  <td colSpan={9} className="table-no-results">
                    Aucune alliance ne correspond à votre recherche "{searchQuery}".
                  </td>
                </tr>
              ) : (
                filteredAndSortedFusions.map((fusion: FusionEvent, index: number) => {
                  const { oldStrength, gain, tier } = getFusionGain(fusion)
                  const rank = index + 1

                  // Determine lead commune name and id
                  const leadCommuneName =
                    fusion.leadCommuneName ??
                    clubsById?.get(fusion.mergedClubId)?.communeName ??
                    fusion.communeNames[0] ??
                    ''
                  const leadCommuneId =
                    fusion.leadCommuneId ??
                    clubsById?.get(fusion.mergedClubId)?.communeId ??
                    getCommuneId(leadCommuneName) ??
                    ''

                  const mergedClubObj = clubsById?.get(fusion.mergedClubId) ?? { id: fusion.mergedClubId, name: fusion.mergedClubName }
                  const absorbedClubObj = mergedClubObj && 'fusedClubs' in mergedClubObj
                    ? mergedClubObj.fusedClubs?.find((fc) => fc.id === fusion.absorbedClubId) ?? { id: fusion.absorbedClubId, name: fusion.absorbedClubName }
                    : { id: fusion.absorbedClubId, name: fusion.absorbedClubName }

                  return (
                    <tr key={fusion.mergedClubId || index} className="table-fusion-row">
                      <td className="col-rank">
                        <span className={`rank-badge ${rank <= 3 ? `rank-${rank}` : ''}`}>
                          {rank}
                        </span>
                      </td>
                      <td className="col-name">
                        <Link
                          to={`/equipes/${fusion.mergedClubId}`}
                          className="merged-club-link"
                          title={`Voir la fiche du club : ${fusion.mergedClubName}`}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}
                        >
                          <ClubBadge club={mergedClubObj} size="sm" />
                          <strong>{fusion.mergedClubName}</strong>
                        </Link>
                      </td>
                      <td className="col-lead-commune">
                        {leadCommuneId ? (
                          <Link
                            to={`/villes/${leadCommuneId}`}
                            className="lead-commune-badge"
                            title={`Siège du club : ${leadCommuneName}`}
                          >
                            🏛️ {leadCommuneName}
                          </Link>
                        ) : (
                          <span className="lead-commune-badge">
                            🏛️ {leadCommuneName || '—'}
                          </span>
                        )}
                      </td>
                      <td className="col-absorbed">
                        <Link
                          to={`/equipes/${fusion.absorbedClubId}`}
                          className="absorbed-badge-link"
                          title={`Voir la fiche du club absorbé : ${fusion.absorbedClubName}`}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                        >
                          <ClubBadge club={absorbedClubObj} size="sm" />
                          <span>{fusion.absorbedClubName}</span>
                        </Link>
                      </td>
                      <td className="col-communes">
                        <div className="communes-tag-list">
                          {fusion.communeNames.map((name, cIdx) => {
                            const isLead = name === leadCommuneName || cIdx === 0
                            const cId = isLead && leadCommuneId ? leadCommuneId : getCommuneId(name)
                            return cId ? (
                              <Link
                                key={cIdx}
                                to={`/villes/${cId}`}
                                className={`commune-tag ${isLead ? 'commune-tag--lead' : ''}`}
                                title={
                                  isLead
                                    ? `Siège du club : ${name} (cliquer pour voir la ville)`
                                    : `Commune partenaire : ${name} (cliquer pour voir la ville)`
                                }
                              >
                                {isLead ? `🏛️ ${name} (siège)` : name}
                              </Link>
                            ) : (
                              <span
                                key={cIdx}
                                className={`commune-tag ${isLead ? 'commune-tag--lead' : ''}`}
                              >
                                {isLead ? `🏛️ ${name} (siège)` : name}
                              </span>
                            )
                          })}
                        </div>
                      </td>
                      <td className="col-pop">
                        <strong>{fusion.totalPopulation.toLocaleString('fr-FR')}</strong> hab.
                      </td>
                      <td className="col-old-strength">
                        <span className="old-strength-text">{oldStrength.toFixed(1)}/30</span>
                      </td>
                      <td className="col-new-strength">
                        <span className="new-strength-badge">
                          {fusion.newStrength.toFixed(1)}/30
                        </span>
                      </td>
                      <td className="col-gain">
                        <span
                          className={`gain-badge gain-badge--${tier}`}
                          title={
                            tier === 'major'
                              ? 'Gros boost territorial (≥ +3.0 pts)'
                              : tier === 'medium'
                                ? 'Boost notable (+1.0 à +2.9 pts)'
                                : 'Gain modéré (< +1.0 pt)'
                          }
                        >
                          ▲ +{gain.toFixed(1)}
                        </span>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
