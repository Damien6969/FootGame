import { useEffect, useState, useMemo } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { loadGeography } from './loadGeography'
import type { GeographyDataset, Commune } from './types'
import { departmentLabel, regionLabel } from './territoryLabels'
import { cupRepository, type CupSession, type SeasonArchive, type FusionEvent, type SecessionEvent } from '../storage/cupRepository'
import { getStageBadgeClass, getTrophyPillClassFromTitle } from '../competition/echelonColors'
import { CommuneLink } from './CommuneLink'
import { useOptionalCupApp } from '../../app/CupAppContext'
import { buildClubsFromCommunes } from '../teams/clubGenerator'
import {
  resolveCommuneRealClubName,
  resolveAlliancePartners,
  resolvePartnerClubName,
  getGenuineClubNameForCommune,
  isAllianceSyntheticName,
} from '../teams/clubResolution'
import { getCommuneNatives } from '../persons/personSelectors'
import { PersonTable } from '../persons/PersonTable'
import { ClubBadge } from '../teams/ClubBadge'

export type CommuneTab = 'clubs' | 'personnalites' | 'palmares' | 'all'

export function CommunePage() {
  const { communeId } = useParams()
  const appContext = useOptionalCupApp()

  const [localData, setLocalData] = useState<GeographyDataset>()
  const [localSession, setLocalSession] = useState<CupSession>()
  const [localArchives, setLocalArchives] = useState<readonly SeasonArchive[]>([])
  const [searchParams, setSearchParams] = useSearchParams()
  const tabParam = searchParams.get('tab') as CommuneTab | null
  const [activeTab, setActiveTab] = useState<CommuneTab>(
    tabParam && ['clubs', 'personnalites', 'palmares', 'all'].includes(tabParam) ? tabParam : 'clubs'
  )

  const handleTabChange = (tab: CommuneTab) => {
    setActiveTab(tab)
    if (tab === 'clubs') {
      searchParams.delete('tab')
      setSearchParams(searchParams, { replace: true })
    } else {
      searchParams.set('tab', tab)
      setSearchParams(searchParams, { replace: true })
    }
  }

  useEffect(() => {
    if (appContext?.dataset) return
    const loader = cupRepository.loadArchives ? cupRepository.loadArchives() : Promise.resolve([])
    void Promise.all([loadGeography(), cupRepository.load(), loader]).then(
      ([dataset, saved, loadedArchives]) => {
        setLocalData(dataset)
        setLocalSession(saved)
        setLocalArchives(loadedArchives ?? [])
      },
    )
  }, [appContext])

  const data = appContext?.dataset ?? localData
  const session = appContext?.session ?? localSession
  const archives = appContext?.archives ?? localArchives

  const commune = useMemo(() => {
    if (!data || !communeId) return undefined
    return data.communes.find((c) => c.id === communeId)
  }, [data, communeId])

  const bounds = useMemo(() => {
    if (!data) return { min: 1000, max: 2150000 }
    return {
      min: Math.min(...data.communes.map((t) => t.population)),
      max: Math.max(...data.communes.map((t) => t.population)),
    }
  }, [data])

  const clubs = useMemo(() => {
    if (appContext?.clubs?.length) return appContext.clubs
    if (!data) return []
    return buildClubsFromCommunes(data.communes, bounds)
  }, [appContext?.clubs, data, bounds])


  // Clubs actifs actuellement liés à cette commune (club autonome, rival, ou entente)
  const activeCityClubs = useMemo(() => {
    if (!commune) return []
    return clubs.filter((c) => c.communeIds.includes(commune.id))
  }, [clubs, commune])

  // Personnalités et joueurs nés dans cette commune
  const nativePersons = useMemo(() => {
    if (!communeId || !appContext?.persons) return []
    return getCommuneNatives(appContext.persons, communeId)
  }, [communeId, appContext?.persons])

  // Historique de toutes les fusions impliquant cette commune
  const allFusions = useMemo(() => {
    if (!commune) return []
    const list: Array<{ year: number; fusion: FusionEvent; isLead: boolean }> = []
    const seen = new Set<string>()

    // 1. Depuis le rapport de la session en cours
    if (session?.interseasonReport?.fusions) {
      const year = session.seasonYear ?? 2026
      for (const f of session.interseasonReport.fusions) {
        if (f.communeNames.includes(commune.name)) {
          const key = `${year}:${f.mergedClubId}:${f.absorbedClubId}`
          if (!seen.has(key)) {
            seen.add(key)
            list.push({ year, fusion: f, isLead: f.mergedClubName.includes(commune.name) })
          }
        }
      }
    }

    // 2. Depuis les archives des saisons passées
    for (const arch of archives) {
      const fusions = arch.fusions ?? arch.interseasonReport?.fusions ?? []
      for (const f of fusions) {
        if (f.communeNames.includes(commune.name)) {
          const key = `${arch.year}:${f.mergedClubId}:${f.absorbedClubId}`
          if (!seen.has(key)) {
            seen.add(key)
            list.push({ year: arch.year, fusion: f, isLead: f.mergedClubName.includes(commune.name) })
          }
        }
      }
    }

    return list.sort((a, b) => b.year - a.year)
  }, [commune, session, archives])

  // Historique des régénérations impliquant cette commune
  const allSecessions = useMemo(() => {
    if (!commune) return []
    const list: Array<{ year: number; secession: SecessionEvent }> = []

    if (session?.interseasonReport?.secessions) {
      const year = session.seasonYear ?? 2026
      for (const s of session.interseasonReport.secessions) {
        if (s.communeId === commune.id) {
          list.push({ year, secession: s })
        }
      }
    }

    for (const arch of archives) {
      const secs = arch.secessions ?? arch.interseasonReport?.secessions ?? []
      for (const s of secs) {
        if (s.communeId === commune.id) {
          list.push({ year: arch.year, secession: s })
        }
      }
    }

    return list.sort((a, b) => b.year - a.year)
  }, [commune, session, archives])

  // Palmarès cumulé de la ville (tous clubs de la ville confondus)
  const cityPalmares = useMemo(() => {
    if (!commune) return { national: 0, conference: 0, region: 0, department: 0, years: [] as number[] }

    let national = 0
    let conference = 0
    let region = 0
    let department = 0
    const years: number[] = []

    for (const arch of archives) {
      let wonNational = false
      let wonConf = false
      let wonReg = false
      let wonDept = false

      // Vérifier si un club de la commune a gagné le titre national
      if (arch.nationalChampionId) {
        const champPerf = arch.teamPerformances[arch.nationalChampionId]
        if (champPerf?.communeNames?.includes(commune.name) || arch.nationalChampionId.startsWith(commune.id)) {
          national++
          wonNational = true
        }
      }

      // Vérifier les titres de conférence
      for (const champId of Object.values(arch.conferenceChampions)) {
        if (champId === commune.id || champId.startsWith(`${commune.id}-`)) {
          conference++
          wonConf = true
        }
      }

      // Titres régionaux
      if (arch.regionChampions) {
        for (const champId of Object.values(arch.regionChampions)) {
          if (champId === commune.id || champId.startsWith(`${commune.id}-`)) {
            region++
            wonReg = true
          }
        }
      }

      // Titres départementaux
      if (arch.departmentChampions) {
        for (const champId of Object.values(arch.departmentChampions)) {
          if (champId === commune.id || champId.startsWith(`${commune.id}-`)) {
            department++
            wonDept = true
          }
        }
      }

      if (wonNational || wonConf || wonReg || wonDept) {
        years.push(arch.year)
      }
    }

    return { national, conference, region, department, years }
  }, [commune, archives])

  // Historique saison par saison pour la commune
  const seasonHistory = useMemo(() => {
    if (!commune) return []
    const history: Array<{
      year: number
      clubsRepresenting: Array<{
        id: string
        name: string
        seasonName?: string
        originalClubName?: string
        allianceName?: string
        isFusion?: boolean
        partnerNames?: readonly string[]
        partnerDetails?: Array<{
          communeName: string
          commune?: Commune
          clubName: string
        }>
      }>
      bestStage: string
      matchesWon: number
      matchesPlayed: number
      titles: string[]
    }> = []

    for (const arch of archives) {
      const perfsForCity: Array<{ id: string; perf: any }> = []
      for (const [tId, perf] of Object.entries(arch.teamPerformances)) {
        if (perf.communeNames?.includes(commune.name) || tId === commune.id || tId.startsWith(`${commune.id}-`)) {
          perfsForCity.push({ id: tId, perf })
        }
      }

      if (perfsForCity.length === 0) continue

      // Meilleur parcours
      let maxRound = 0
      let bestStage = 'Tour 1'
      let totalWon = 0
      let totalPlayed = 0
      const titles: string[] = []

      for (const { perf } of perfsForCity) {
        totalWon += perf.matchesWon ?? 0
        totalPlayed += perf.matchesPlayed ?? 0
        if ((perf.roundReached ?? 0) > maxRound) {
          maxRound = perf.roundReached
          bestStage = perf.stageLabel ?? `Tour ${maxRound}`
        }
        if (perf.isNationalChampion) titles.push('🏆 France')
        if (perf.isConferenceChampion) titles.push('👑 Conférence')
        if (perf.isRegionChampion) titles.push('🌟 Région')
        if (perf.isDepartmentChampion) titles.push('🏅 Département')
      }

      const clubsRepresenting = perfsForCity.map(({ id, perf }) => {
        const isFusion = Boolean(perf.isFusion)
        const partnerNames = perf.fusionPartnerNames ?? (perf.communeNames ? perf.communeNames.filter((n: string) => n !== commune.name) : undefined)

        const realClubName = resolveCommuneRealClubName(
          commune,
          {
            id,
            name: perf.clubName ?? '',
            isFusion,
            communeId: id.split('-')[0],
            communeNames: perf.communeNames,
          },
          { dataset: data, session, archives },
        )

        const partnerDetails = partnerNames?.map((pName: string) => ({
          communeName: pName,
          commune: data?.communes.find((c) => c.name === pName),
          clubName: resolvePartnerClubName(pName, { leadClubId: id, dataset: data, session, archives }),
        }))

        // Récupérer le club actuel (s'il existe) pour afficher le vrai nom du club même s'il a changé entre-temps
        const currentClub = session?.clubs?.find((c) => c.id === id) || clubs.find((c) => c.id === id)

        // Nom officiel du club engagé : nom actuel (même changé entre-temps), ou nom lors de la saison archivée, ou nom d'alliance
        const effectiveName = currentClub?.name || perf.clubName || (isFusion ? `Entente ${perf.communeNames?.join(' / ')}` : realClubName)

        return {
          id,
          name: effectiveName,
          seasonName: perf.clubName && perf.clubName !== effectiveName ? perf.clubName : undefined,
          originalClubName: realClubName && realClubName !== effectiveName ? realClubName : undefined,
          allianceName: isFusion ? (effectiveName || perf.clubName || `Entente ${perf.communeNames?.join(' / ')}`) : undefined,
          isFusion,
          partnerNames,
          partnerDetails,
        }
      })

      history.push({
        year: arch.year,
        clubsRepresenting,
        bestStage,
        matchesWon: totalWon,
        matchesPlayed: totalPlayed,
        titles: Array.from(new Set(titles)),
      })
    }

    return history.sort((a, b) => b.year - a.year)
  }, [commune, archives])

  if (!data) return <section className="status-panel">Chargement…</section>

  if (!commune) {
    return (
      <section className="status-panel">
        <h2>Commune introuvable</h2>
        <Link to="/villes" className="back-link" style={{ color: 'var(--color-primary)', fontWeight: 600 }}>
          ← Retour à la liste des villes
        </Link>
      </section>
    )
  }

  const isEngagedInAlliance = activeCityClubs.some((c) => c.isFusion)

  return (
    <section className="cup-ready">
      {/* Top navigation */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-2)' }}>
        <Link to="/villes" className="back-link" style={{ color: 'var(--color-primary)', fontWeight: 600 }}>
          ← Toutes les villes
        </Link>
        <span className="badge badge--neutral">Code INSEE : {commune.id}</span>
      </div>

      {/* Main city header */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', marginBottom: 'var(--space-4)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
          <h2 style={{ margin: 0, fontSize: '2rem' }}>🏛️ {commune.name}</h2>
          <span className="badge badge--blue" style={{ fontSize: '0.9rem', padding: '4px 10px' }}>
            {departmentLabel(commune.departmentId)}
          </span>
          <span className="badge badge--neutral" style={{ fontSize: '0.9rem', padding: '4px 10px' }}>
            {regionLabel(commune.regionId)}
          </span>
          {isEngagedInAlliance ? (
            <span
              className="badge badge--accent"
              style={{
                fontSize: '0.85rem',
                padding: '4px 10px',
                background: 'rgba(56, 189, 248, 0.15)',
                border: '1px solid rgba(56, 189, 248, 0.3)',
              }}
            >
              🤝 Ville en Alliance
            </span>
          ) : (
            <span className="badge badge--emerald" style={{ fontSize: '0.85rem', padding: '4px 10px' }}>
              ⚽ Club Autonome
            </span>
          )}
          {activeCityClubs.length > 1 && (
            <span
              className="badge badge--accent"
              style={{
                fontSize: '0.85rem',
                padding: '4px 10px',
                background: 'rgba(234, 179, 8, 0.15)',
                color: '#facc15',
                border: '1px solid rgba(234, 179, 8, 0.3)',
              }}
            >
              ⚡ Multi-Clubs ({activeCityClubs.length})
            </span>
          )}
        </div>
      </div>

      {/* Summary KPI Strip */}
      <div className="summary-strip">
        <span>
          <small>Population Municipale</small>
          <strong>{commune.population.toLocaleString('fr-FR')} hab.</strong>
        </span>
        <span>
          <small>Département</small>
          <strong>
            {departmentLabel(commune.departmentId)}
          </strong>
        </span>
        <span>
          <small>Région</small>
          <strong>{regionLabel(commune.regionId)}</strong>
        </span>
        <span>
          <small>Conférence Coupe</small>
          <strong>{commune.conferenceId}</strong>
        </span>
        <span>
          <small>Clubs Actifs Liés</small>
          <strong style={{ color: 'var(--color-accent-light)' }}>
            {activeCityClubs.length} {activeCityClubs.length > 1 ? 'clubs' : 'club'}
          </strong>
        </span>
      </div>

      {/* Navigation par Onglets */}
      <div className="page-tabs-bar" role="tablist" aria-label="Sections de la commune">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'clubs'}
          className={`page-tab-btn ${activeTab === 'clubs' ? 'is-active' : ''}`}
          onClick={() => handleTabChange('clubs')}
        >
          <span>⚽</span> Clubs & Parcours
          <span className="page-tab-badge">{activeCityClubs.length}</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'personnalites'}
          className={`page-tab-btn ${activeTab === 'personnalites' ? 'is-active' : ''}`}
          onClick={() => handleTabChange('personnalites')}
        >
          <span>👤</span> Personnalités
          <span className="page-tab-badge">{nativePersons.length}</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'palmares'}
          className={`page-tab-btn ${activeTab === 'palmares' ? 'is-active' : ''}`}
          onClick={() => handleTabChange('palmares')}
        >
          <span>🏆</span> Palmarès
          {(cityPalmares.national > 0 || cityPalmares.conference > 0 || cityPalmares.region > 0 || cityPalmares.department > 0) && (
            <span className="page-tab-badge">
              {cityPalmares.national + cityPalmares.conference + cityPalmares.region + cityPalmares.department}
            </span>
          )}
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'all'}
          className={`page-tab-btn ${activeTab === 'all' ? 'is-active' : ''}`}
          onClick={() => handleTabChange('all')}
        >
          <span>📋</span> Tout afficher
        </button>
      </div>

      {/* Onglet 1 ou Tout afficher : CLUBS, PARCOURS & ALLIANCES */}
      {(activeTab === 'clubs' || activeTab === 'all') && (
        <>
          {/* Section: Clubs Actifs de la Ville */}
          <div style={{ marginTop: 'var(--space-3)' }}>
            <h3 style={{ color: '#ffffff', marginBottom: 'var(--space-2)' }}>
              Clubs en activité représentant la commune {session ? `(Saison ${session.seasonYear ?? 2026})` : ''}
            </h3>
            <p style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem', marginBottom: 'var(--space-3)' }}>
              Une ville peut disposer d'un club local autonome, de clubs rivaux historiques, ou faire partie d'une alliance intercommunale (entente).
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 'var(--space-3)' }}>
              {activeCityClubs.map((club) => {
                const isLead = club.communeId === commune.id
                const isAlive = session ? session.activeTeamIds.includes(club.id) : true
                const realClubName = resolveCommuneRealClubName(commune, club, { dataset: data, session, archives })
                const alliancePartners = club.isFusion ? resolveAlliancePartners(club, data, session, archives) : []
                const otherPartners = alliancePartners.filter((p) => p.communeName !== commune.name)

                return (
                  <div
                    key={club.id}
                    style={{
                      padding: 'var(--space-3) var(--space-4)',
                      background: club.isFusion ? 'rgba(56, 189, 248, 0.06)' : 'rgba(255, 255, 255, 0.04)',
                      border: club.isFusion ? '1px solid rgba(56, 189, 248, 0.25)' : '1px solid rgba(255, 255, 255, 0.1)',
                      borderRadius: 'var(--radius-md)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 'var(--space-2)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                        <ClubBadge club={club} size="sm" />
                        <div>
                          <strong style={{ fontSize: '1.05rem', color: '#ffffff' }}>
                            <Link to={`/equipes/${club.id}`} style={{ color: 'inherit', textDecoration: 'none' }}>
                              {club.name}
                            </Link>
                          </strong>
                          {club.isFusion && realClubName && realClubName !== club.name && (
                            <div style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)', marginTop: '2px' }}>
                              Club d'origine de la commune : <span style={{ color: 'var(--color-primary-light)' }}>{realClubName}</span>
                            </div>
                          )}
                        </div>
                      </div>
                      <span className={`badge ${isAlive ? 'badge--emerald' : 'badge--neutral'}`} style={{ fontSize: '0.75rem' }}>
                        {isAlive ? 'En lice' : 'Éliminé'}
                      </span>
                    </div>

                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', fontSize: '0.8rem' }}>
                      {club.isFusion ? (
                        <span className="badge badge--accent" style={{ background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8' }}>
                          🤝 Alliance ({club.communeNames.length} communes)
                        </span>
                      ) : club.isRivalClub ? (
                        <span className="badge badge--accent" style={{ background: 'rgba(234, 179, 8, 0.15)', color: '#facc15' }}>
                          ⚡ Club Rival
                        </span>
                      ) : (
                        <span className="badge badge--neutral">⚽ Club Local Autonome</span>
                      )}

                      <span className="badge badge--blue">Force : {club.strength.toFixed(1)}/30</span>
                    </div>

                    {club.isFusion && (
                      <div style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)', marginTop: '4px' }}>
                        <span style={{ color: 'var(--color-text-dim)' }}>
                          {isLead ? 'Ville référente de l’alliance' : 'Commune partenaire'} avec :
                        </span>{' '}
                        {otherPartners.map((partner, idx) => (
                          <span key={idx}>
                            {idx > 0 && ', '}
                            {partner.commune ? (
                              <CommuneLink commune={partner.commune} />
                            ) : (
                              <strong>{partner.communeName}</strong>
                            )}
                            {' '}
                            <span style={{ color: '#93c5fd' }}>({partner.clubName})</span>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Section: Parcours de la Commune Saison par Saison */}
          {seasonHistory.length > 0 && (
            <div style={{ marginTop: 'var(--space-5)' }}>
              <h3 style={{ color: '#ffffff', marginBottom: 'var(--space-2)' }}>
                📅 Parcours de la Commune dans les Éditions Précédentes
              </h3>
              <div className="matches-table-wrap">
                <table className="matches-table">
                  <thead>
                    <tr>
                      <th>Saison</th>
                      <th>Club(s) engagé(s)</th>
                      <th>Statut d'Alliance</th>
                      <th>Meilleur Parcours</th>
                      <th>Titres remportés</th>
                      <th>Bilan</th>
                    </tr>
                  </thead>
                  <tbody>
                    {seasonHistory.map((s) => (
                      <tr key={s.year}>
                        <td>
                          <span className="badge badge--blue">Saison {s.year}</span>
                        </td>
                        <td>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            {s.clubsRepresenting.map((c, cIdx) => (
                              <div key={cIdx} style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  <Link to={`/equipes/${c.id}`} style={{ fontWeight: 700, color: 'var(--color-primary-light)' }}>
                                    {c.name}
                                  </Link>
                                  {c.isFusion && (
                                    <span
                                      className="badge badge--accent"
                                      style={{ fontSize: '0.68rem', padding: '1px 5px', background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8' }}
                                    >
                                      Alliance
                                    </span>
                                  )}
                                </div>
                                {c.seasonName && (
                                  <div style={{ fontSize: '0.76rem', color: 'var(--color-text-dim)' }}>
                                    Nom en saison {s.year} : <span style={{ color: '#93c5fd' }}>{c.seasonName}</span>
                                  </div>
                                )}
                                {c.isFusion && c.originalClubName && (
                                  <div style={{ fontSize: '0.76rem', color: 'var(--color-text-muted)' }}>
                                    Club d'origine : {c.originalClubName}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </td>
                        <td>
                          {s.clubsRepresenting.some((c) => c.isFusion) ? (
                            <div>
                              <span className="badge badge--accent" style={{ background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8' }}>
                                🤝 En Alliance
                              </span>
                              {s.clubsRepresenting
                                .filter((c) => c.isFusion && (c.partnerDetails?.length || c.partnerNames?.length))
                                .map((c, idx) => (
                                  <div key={idx} style={{ fontSize: '0.78rem', color: 'var(--color-text-dim)', marginTop: '3px' }}>
                                    avec{' '}
                                    {c.partnerDetails && c.partnerDetails.length > 0
                                      ? c.partnerDetails.map((pd, pIdx) => (
                                          <span key={pIdx}>
                                            {pIdx > 0 && ', '}
                                            {pd.commune ? <CommuneLink commune={pd.commune} /> : pd.communeName}
                                            {' '}
                                            <span style={{ color: '#93c5fd' }}>({pd.clubName})</span>
                                          </span>
                                        ))
                                      : c.partnerNames?.join(', ')}
                                  </div>
                                ))}
                            </div>
                          ) : (
                            <span className="badge badge--neutral">Autonome</span>
                          )}
                        </td>
                        <td>
                          <span className={getStageBadgeClass(s.bestStage)}>{s.bestStage}</span>
                        </td>
                        <td>
                          {s.titles.length > 0 ? (
                            <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                              {s.titles.map((title, tIdx) => (
                                <span key={tIdx} className={`trophy-pill ${getTrophyPillClassFromTitle(title)}`} style={{ fontSize: '0.75rem', padding: '2px 6px' }}>
                                  {title}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span style={{ color: 'var(--color-text-dim)' }}>—</span>
                          )}
                        </td>
                        <td>
                          <span>
                            {s.matchesWon} vic. / {s.matchesPlayed} m.
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Section: Historique des Fusions & Alliances */}
          <div style={{ marginTop: 'var(--space-5)' }}>
            <h3 style={{ color: '#ffffff', marginBottom: 'var(--space-2)' }}>
              🤝 Historique des Alliances & Fusions scellées
            </h3>
            {allFusions.length > 0 ? (
              <div className="matches-table-wrap">
                <table className="matches-table">
                  <thead>
                    <tr>
                      <th>Saison</th>
                      <th>Alliance créée / agrandie</th>
                      <th>Clubs & Communes fusionnés</th>
                      <th>Rôle de la commune</th>
                      <th>Force résultante</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allFusions.map(({ year, fusion, isLead }, idx) => {
                      const leadCommune = data?.communes.find((cm) => cm.id === fusion.mergedClubId.split('-')[0])
                      const leadRealClubName = leadCommune ? getGenuineClubNameForCommune(leadCommune, 0) : fusion.leadClubName ?? fusion.mergedClubName

                      const absorbedNames = fusion.absorbedCommuneNames && fusion.absorbedCommuneNames.length > 0
                        ? fusion.absorbedCommuneNames
                        : fusion.communeNames.filter((name) => name !== leadCommune?.name)
                      const absorbedCommunes = (absorbedNames.length > 0
                        ? absorbedNames
                        : [data?.communes.find((cm) => cm.id === fusion.absorbedClubId.split('-')[0])?.name ?? 'Commune partenaire']
                      ).map((cName) => ({
                        name: cName,
                        obj: data?.communes.find((cm) => cm.name === cName || cm.id === cName),
                      }))

                      const absorbedCommuneObj = absorbedCommunes[0]?.obj ?? data?.communes.find((cm) => cm.id === fusion.absorbedClubId.split('-')[0])
                      const absorbedRealClubName = !isAllianceSyntheticName(fusion.absorbedClubName)
                        ? fusion.absorbedClubName
                        : (absorbedCommuneObj ? getGenuineClubNameForCommune(absorbedCommuneObj, 0) : fusion.absorbedClubName)

                      return (
                        <tr key={idx}>
                          <td>
                            <span className="badge badge--blue">Saison {year}</span>
                          </td>
                          <td>
                            <Link to={`/equipes/${fusion.mergedClubId}`} style={{ fontWeight: 700, color: 'var(--color-primary-light)' }}>
                              {fusion.mergedClubName}
                            </Link>
                            <div style={{ fontSize: '0.78rem', color: 'var(--color-text-dim)', marginTop: '3px' }}>
                              Villes fusionnées :{' '}
                              {fusion.communeNames.map((cName, cIdx) => {
                                const cObj = data?.communes.find((cm) => cm.name === cName)
                                return (
                                  <span key={cIdx}>
                                    {cIdx > 0 && ' + '}
                                    {cObj ? <CommuneLink commune={cObj} /> : cName}
                                  </span>
                                )
                              })}
                            </div>
                          </td>
                          <td>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.85rem' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                <span className="badge badge--neutral" style={{ fontSize: '0.68rem', padding: '1px 5px' }}>
                                  Initiateur
                                </span>
                                <strong style={{ color: leadCommune?.id === commune.id ? 'var(--color-primary-light)' : 'inherit' }}>
                                  {leadRealClubName}
                                </strong>
                                {fusion.leadClubName && fusion.leadClubName !== leadRealClubName && (
                                  <span style={{ color: 'var(--color-text-dim)', fontSize: '0.78rem' }}>
                                    (issu de {fusion.leadClubName})
                                  </span>
                                )}
                                {leadCommune && (
                                  <span style={{ color: 'var(--color-text-dim)', fontSize: '0.8rem' }}>
                                    (<CommuneLink commune={leadCommune} />)
                                  </span>
                                )}
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                <span className="badge badge--neutral" style={{ fontSize: '0.68rem', padding: '1px 5px' }}>
                                  Absorbé
                                </span>
                                <strong style={{ color: absorbedCommunes.some((c) => c.obj?.id === commune.id) ? 'var(--color-primary-light)' : 'inherit' }}>
                                  {absorbedRealClubName}
                                </strong>
                                {fusion.absorbedClubName && fusion.absorbedClubName !== absorbedRealClubName && (
                                  <span style={{ color: 'var(--color-text-dim)', fontSize: '0.78rem' }}>
                                    (issu de {fusion.absorbedClubName})
                                  </span>
                                )}
                                <span style={{ color: 'var(--color-text-dim)', fontSize: '0.8rem' }}>
                                  ({absorbedCommunes.map((c, cIdx) => (
                                    <span key={cIdx}>
                                      {cIdx > 0 && ' · '}
                                      {c.obj ? <CommuneLink commune={c.obj} /> : c.name}
                                    </span>
                                  ))})
                                </span>
                              </div>
                            </div>
                          </td>
                          <td>
                            {isLead ? (
                              <span className="badge badge--emerald">Initiatrice / Pilote</span>
                            ) : (
                              <span className="badge badge--neutral">Partenaire rattachée</span>
                            )}
                          </td>
                          <td>
                            <span style={{ color: 'var(--color-accent-light)', fontWeight: 600 }}>
                              {fusion.oldStrength.toFixed(1)} → {fusion.newStrength.toFixed(1)}/30
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={{ padding: 'var(--space-3)', background: 'rgba(255, 255, 255, 0.03)', borderRadius: 'var(--radius-sm)', color: 'var(--color-text-dim)', fontSize: '0.9rem' }}>
                Aucune alliance n'a impliqué cette commune pour le moment. Son club a concouru de manière autonome.
              </div>
            )}
          </div>

          {/* Section: Historique des Régénérations (si applicable) */}
          {allSecessions.length > 0 && (
            <div style={{ marginTop: 'var(--space-4)' }}>
              <h3 style={{ color: '#fb923c', marginBottom: 'var(--space-2)' }}>
                💥 Régénérations de Clubs Locaux
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                {allSecessions.map(({ year, secession }, idx) => (
                  <div
                    key={idx}
                    style={{
                      padding: 'var(--space-3) var(--space-4)',
                      background: 'rgba(251, 146, 60, 0.08)',
                      border: '1px solid rgba(251, 146, 60, 0.25)',
                      borderRadius: 'var(--radius-md)',
                      fontSize: '0.9rem',
                    }}
                  >
                    <strong>Saison {year} : </strong>
                    La ville a recréé son club local autonome{' '}
                    <Link to={`/equipes/${secession.newClubId}`} style={{ color: '#fb923c', fontWeight: 700, textDecoration: 'underline' }}>
                      {secession.newClubName}
                    </Link>{' '}
                    tout en maintenant sa participation à l'entente{' '}
                    <Link to={`/equipes/${secession.parentEnteId}`} style={{ color: 'var(--color-primary-light)', textDecoration: 'underline' }}>
                      {secession.parentEnteName}
                    </Link>{' '}
                    (−{secession.populationLost.toLocaleString('fr-FR')} hab. déduits de l'entente).
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Onglet 2 ou Tout afficher : PERSONNALITÉS & ENFANTS DE LA VILLE */}
      {(activeTab === 'personnalites' || activeTab === 'all') && (
        <div style={{ marginTop: activeTab === 'all' ? 'var(--space-5)' : 'var(--space-3)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-3)', flexWrap: 'wrap', gap: '8px' }}>
            <div>
              <h3 style={{ color: '#ffffff', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>👤</span> Enfants de la ville & Joueurs natifs ({nativePersons.length})
              </h3>
              <p style={{ margin: '4px 0 0 0', fontSize: '0.88rem', color: 'var(--color-text-muted)' }}>
                Joueurs et personnalités nés dans la commune de {commune.name} évoluant dans la compétition.
              </p>
            </div>
            {nativePersons.length > 0 && (
              <Link
                to={`/personnes?q=${encodeURIComponent(commune.name)}`}
                style={{ fontSize: '0.85rem', color: 'var(--color-primary-light)', textDecoration: 'none', fontWeight: 600 }}
              >
                Voir dans l'annuaire complet →
              </Link>
            )}
          </div>

          <PersonTable
            persons={nativePersons}
            showClub={true}
            showCommune={false}
            emptyMessage={`Aucun joueur originaire de ${commune.name} n'est recensé dans le vivier actuel.`}
          />
        </div>
      )}

      {/* Onglet 3 ou Tout afficher : PALMARÈS & TROPHÉES DE LA VILLE */}
      {(activeTab === 'palmares' || activeTab === 'all') && (
        <div style={{ marginTop: activeTab === 'all' ? 'var(--space-5)' : 'var(--space-3)' }}>
          <h3 style={{ color: '#ffffff', marginBottom: 'var(--space-3)' }}>
            🏆 Palmarès de la Commune (Toutes Éditions)
          </h3>
          <div className="team-trophies-grid">
            <div className={`trophy-kpi-card ${cityPalmares.national > 0 ? 'trophy-kpi-card--gold' : ''}`}>
              <div className="trophy-kpi-icon">🏆</div>
              <div className="trophy-kpi-content">
                <span className="trophy-kpi-label">Champion de France</span>
                <div className="trophy-kpi-value-row">
                  <strong className="trophy-kpi-count">{cityPalmares.national}</strong>
                  <span className="trophy-kpi-unit">{cityPalmares.national > 1 ? 'titres' : 'titre'}</span>
                </div>
              </div>
            </div>

            <div className={`trophy-kpi-card ${cityPalmares.conference > 0 ? 'trophy-kpi-card--conf' : ''}`}>
              <div className="trophy-kpi-icon">👑</div>
              <div className="trophy-kpi-content">
                <span className="trophy-kpi-label">Champion de Conférence</span>
                <div className="trophy-kpi-value-row">
                  <strong className="trophy-kpi-count">{cityPalmares.conference}</strong>
                  <span className="trophy-kpi-unit">{cityPalmares.conference > 1 ? 'titres' : 'titre'}</span>
                </div>
              </div>
            </div>

            <div className={`trophy-kpi-card ${cityPalmares.region > 0 ? 'trophy-kpi-card--region' : ''}`}>
              <div className="trophy-kpi-icon">🌟</div>
              <div className="trophy-kpi-content">
                <span className="trophy-kpi-label">Champion Régional</span>
                <div className="trophy-kpi-value-row">
                  <strong className="trophy-kpi-count">{cityPalmares.region}</strong>
                  <span className="trophy-kpi-unit">{cityPalmares.region > 1 ? 'titres' : 'titre'}</span>
                </div>
              </div>
            </div>

            <div className={`trophy-kpi-card ${cityPalmares.department > 0 ? 'trophy-kpi-card--dept' : ''}`}>
              <div className="trophy-kpi-icon">🏅</div>
              <div className="trophy-kpi-content">
                <span className="trophy-kpi-label">Champion Départemental</span>
                <div className="trophy-kpi-value-row">
                  <strong className="trophy-kpi-count">{cityPalmares.department}</strong>
                  <span className="trophy-kpi-unit">{cityPalmares.department > 1 ? 'titres' : 'titre'}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Si l'utilisateur est spécifiquement sur l'onglet Palmarès, on affiche aussi le parcours pour voir où les titres ont été gagnés */}
          {activeTab === 'palmares' && seasonHistory.length > 0 && (
            <div style={{ marginTop: 'var(--space-4)' }}>
              <h4 style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 'var(--space-2)' }}>
                Détail du parcours et titres par édition
              </h4>
              <div className="matches-table-wrap">
                <table className="matches-table">
                  <thead>
                    <tr>
                      <th>Saison</th>
                      <th>Club(s) engagé(s)</th>
                      <th>Meilleur Parcours</th>
                      <th>Titres remportés</th>
                      <th>Bilan</th>
                    </tr>
                  </thead>
                  <tbody>
                    {seasonHistory.map((s) => (
                      <tr key={s.year}>
                        <td>
                          <span className="badge badge--blue">Saison {s.year}</span>
                        </td>
                        <td>
                          {s.clubsRepresenting.map((c, cIdx) => (
                            <span key={cIdx}>
                              {cIdx > 0 && ', '}
                              <Link to={`/equipes/${c.id}`} style={{ fontWeight: 700, color: 'var(--color-primary-light)' }}>
                                {c.name}
                              </Link>
                            </span>
                          ))}
                        </td>
                        <td>
                          <span className={getStageBadgeClass(s.bestStage)}>{s.bestStage}</span>
                        </td>
                        <td>
                          {s.titles.length > 0 ? (
                            <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                              {s.titles.map((title, tIdx) => (
                                <span key={tIdx} className={`trophy-pill ${getTrophyPillClassFromTitle(title)}`} style={{ fontSize: '0.75rem', padding: '2px 6px' }}>
                                  {title}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span style={{ color: 'var(--color-text-dim)' }}>—</span>
                          )}
                        </td>
                        <td>
                          {s.matchesWon} vic. / {s.matchesPlayed} m.
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
