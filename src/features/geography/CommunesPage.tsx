import { useEffect, useState, useMemo } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { loadGeography } from './loadGeography'
import type { GeographyDataset } from './types'
import { departmentLabel, regionLabel } from './territoryLabels'
import { useOptionalCupApp } from '../../app/CupAppContext'
import { buildClubsFromCommunes } from '../teams/clubGenerator'
import { CommuneLink } from './CommuneLink'
import { TeamLink } from '../teams/TeamLink'

type FilterStatus = 'all' | 'large' | 'fusions' | 'multiclubs' | 'titled'
export type CommuneSortKey = 'name' | 'department' | 'region' | 'population' | 'clubs' | 'persons' | 'alliance'
export type SortDirection = 'asc' | 'desc'

export function CommunesPage() {
  const appContext = useOptionalCupApp()

  const [localData, setLocalData] = useState<GeographyDataset>()

  useEffect(() => {
    if (appContext?.dataset) return
    void loadGeography().then((dataset) => {
      setLocalData(dataset)
    })
  }, [appContext])

  const data = appContext?.dataset ?? localData
  const archives = appContext?.archives ?? []
  const persons = appContext?.persons ?? []

  const [searchParams, setSearchParams] = useSearchParams()
  const filterParam = searchParams.get('filtre') as FilterStatus | null
  const [statusFilter, setStatusFilter] = useState<FilterStatus>(
    filterParam && ['all', 'large', 'fusions', 'multiclubs', 'titled'].includes(filterParam)
      ? filterParam
      : 'all',
  )
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(0)
  const [sortKey, setSortKey] = useState<CommuneSortKey>('population')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')
  const pageSize = 50

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

  // Map of communeId -> Club[]
  const clubsByCommuneId = useMemo(() => {
    const map = new Map<string, typeof clubs[number][]>()
    for (const club of clubs) {
      for (const cId of club.communeIds) {
        const list = map.get(cId) ?? []
        list.push(club)
        map.set(cId, list)
      }
    }
    return map
  }, [clubs])

  // Map of communeId -> Person[]
  const personsByCommuneId = useMemo(() => {
    const map = new Map<string, typeof persons[number][]>()
    for (const p of persons) {
      if (p.birthCommuneId) {
        const list = map.get(p.birthCommuneId) ?? []
        list.push(p)
        map.set(p.birthCommuneId, list)
      }
    }
    return map
  }, [persons])

  // Set of commune IDs that have ever won a title
  const titledCommuneIds = useMemo(() => {
    const set = new Set<string>()
    for (const arch of archives) {
      if (arch.nationalChampionId) {
        set.add(arch.nationalChampionId.split('-')[0])
      }
      for (const id of Object.values(arch.conferenceChampions)) {
        set.add(id.split('-')[0])
      }
      if (arch.regionChampions) {
        for (const id of Object.values(arch.regionChampions)) {
          set.add(id.split('-')[0])
        }
      }
      if (arch.departmentChampions) {
        for (const id of Object.values(arch.departmentChampions)) {
          set.add(id.split('-')[0])
        }
      }
    }
    return set
  }, [archives])

  const handleSelectFilter = (newFilter: FilterStatus) => {
    setStatusFilter(newFilter)
    setPage(0)
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (newFilter === 'all') {
          next.delete('filtre')
        } else {
          next.set('filtre', newFilter)
        }
        return next
      },
      { replace: true },
    )
  }

  // Pre-filter communes based on search query and filter chips
  const filteredCommunes = useMemo(() => {
    if (!data) return []
    const q = query.trim().toLowerCase()

    return data.communes.filter((commune) => {
      // Query filter
      if (q) {
        const dName = departmentLabel(commune.departmentId).toLowerCase()
        const rName = regionLabel(commune.regionId).toLowerCase()
        const match =
          commune.name.toLowerCase().includes(q) ||
          commune.id.includes(q) ||
          commune.departmentId.includes(q) ||
          dName.includes(q) ||
          rName.includes(q)
        if (!match) return false
      }

      // Status chip filter
      if (statusFilter === 'large') {
        if (commune.population < 50000) return false
      } else if (statusFilter === 'fusions') {
        const cityClubs = clubsByCommuneId.get(commune.id) ?? []
        if (!cityClubs.some((c) => c.isFusion)) return false
      } else if (statusFilter === 'multiclubs') {
        const cityClubs = clubsByCommuneId.get(commune.id) ?? []
        if (cityClubs.length < 2) return false
      } else if (statusFilter === 'titled') {
        if (!titledCommuneIds.has(commune.id)) return false
      }

      return true
    })
  }, [data, query, statusFilter, clubsByCommuneId, titledCommuneIds])

  const handleSort = (key: CommuneSortKey) => {
    if (sortKey === key) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      const isNumeric = key === 'population' || key === 'clubs' || key === 'persons'
      setSortDirection(isNumeric ? 'desc' : 'asc')
    }
    setPage(0)
  }

  const renderSortIndicator = (key: CommuneSortKey) => {
    if (sortKey !== key) {
      return (
        <span
          className="sort-indicator sort-indicator--idle"
          style={{ opacity: 0.35, marginLeft: '6px', fontSize: '0.8rem' }}
          aria-hidden="true"
        >
          ⇅
        </span>
      )
    }
    return (
      <span
        className="sort-indicator sort-indicator--active"
        style={{ color: 'var(--color-primary-light, #38bdf8)', marginLeft: '6px', fontWeight: 700 }}
        aria-hidden="true"
      >
        {sortDirection === 'asc' ? '▲' : '▼'}
      </span>
    )
  }

  // Sorting based on selected column and direction
  const sortedCommunes = useMemo(() => {
    const list = [...filteredCommunes]

    list.sort((a, b) => {
      let cmp = 0
      switch (sortKey) {
        case 'name':
          cmp = a.name.localeCompare(b.name, 'fr')
          break
        case 'department': {
          const deptA = a.departmentId
          const deptB = b.departmentId
          cmp = deptA.localeCompare(deptB, undefined, { numeric: true })
          if (cmp === 0) {
            cmp = a.name.localeCompare(b.name, 'fr')
          }
          break
        }
        case 'region': {
          const regA = regionLabel(a.regionId)
          const regB = regionLabel(b.regionId)
          cmp = regA.localeCompare(regB, 'fr')
          if (cmp === 0) {
            cmp = a.name.localeCompare(b.name, 'fr')
          }
          break
        }
        case 'population':
          cmp = a.population - b.population
          if (cmp === 0) {
            cmp = a.name.localeCompare(b.name, 'fr')
          }
          break
        case 'clubs': {
          const countA = clubsByCommuneId.get(a.id)?.length ?? 0
          const countB = clubsByCommuneId.get(b.id)?.length ?? 0
          cmp = countA - countB
          if (cmp === 0) {
            cmp = b.population - a.population
          }
          break
        }
        case 'persons': {
          const countA = personsByCommuneId.get(a.id)?.length ?? 0
          const countB = personsByCommuneId.get(b.id)?.length ?? 0
          cmp = countA - countB
          if (cmp === 0) {
            cmp = b.population - a.population
          }
          break
        }
        case 'alliance': {
          const allianceA = (clubsByCommuneId.get(a.id) ?? []).some((c) => c.isFusion) ? 1 : 0
          const allianceB = (clubsByCommuneId.get(b.id) ?? []).some((c) => c.isFusion) ? 1 : 0
          cmp = allianceA - allianceB
          if (cmp === 0) {
            cmp = b.population - a.population
          }
          break
        }
      }

      return sortDirection === 'asc' ? cmp : -cmp
    })

    return list
  }, [filteredCommunes, sortKey, sortDirection, clubsByCommuneId, personsByCommuneId])

  const totalPages = Math.ceil(sortedCommunes.length / pageSize)
  const visible = sortedCommunes.slice(page * pageSize, (page + 1) * pageSize)

  if (!data) return <section className="status-panel">Chargement des communes…</section>

  const largeCount = data.communes.filter((c) => c.population >= 50000).length
  const allianceCount = data.communes.filter((c) => (clubsByCommuneId.get(c.id) ?? []).some((cl) => cl.isFusion)).length
  const multiClubCount = data.communes.filter((c) => (clubsByCommuneId.get(c.id) ?? []).length >= 2).length

  return (
    <section className="cup-ready">
      <p className="eyebrow">Territoires & Collectivités</p>
      <h2>Répertoire des Villes</h2>

      <div className="summary-strip">
        <span>
          <small>Total Communes</small>
          <strong>{data.communes.length.toLocaleString('fr-FR')}</strong>
        </span>
        <span>
          <small>Grandes Villes (≥ 50k)</small>
          <strong style={{ color: 'var(--color-primary-light)' }}>
            {largeCount.toLocaleString('fr-FR')}
          </strong>
        </span>
        <span>
          <small>En Alliance</small>
          <strong style={{ color: '#38bdf8' }}>
            {allianceCount.toLocaleString('fr-FR')}
          </strong>
        </span>
        <span>
          <small>Multi-Clubs</small>
          <strong style={{ color: '#facc15' }}>
            {multiClubCount.toLocaleString('fr-FR')}
          </strong>
        </span>
        {titledCommuneIds.size > 0 && (
          <span>
            <small>Villes Titrées</small>
            <strong style={{ color: 'var(--color-gold-light)' }}>
              {titledCommuneIds.size.toLocaleString('fr-FR')}
            </strong>
          </span>
        )}
        {persons.length > 0 && (
          <span>
            <small>Personnalités</small>
            <strong style={{ color: '#c084fc' }}>
              {persons.length.toLocaleString('fr-FR')}
            </strong>
          </span>
        )}
      </div>

      <div className="table-toolbar" style={{ flexWrap: 'wrap', gap: 'var(--space-3)' }}>
        <label htmlFor="commune-search">Rechercher</label>
        <input
          id="commune-search"
          type="search"
          placeholder="Nom de ville, code INSEE, département…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setPage(0)
          }}
          aria-label="Rechercher une ville"
          style={{ width: 'min(100%, 22rem)' }}
        />

        <div className="matches-filter-chips" style={{ marginLeft: 'auto', flexWrap: 'wrap' }}>
          <button
            type="button"
            className={`match-filter-chip ${statusFilter === 'all' ? 'is-active' : ''}`}
            onClick={() => handleSelectFilter('all')}
          >
            Toutes ({data.communes.length.toLocaleString('fr-FR')})
          </button>
          <button
            type="button"
            className={`match-filter-chip ${statusFilter === 'large' ? 'is-active' : ''}`}
            onClick={() => handleSelectFilter('large')}
          >
            🏙️ Grandes villes ({largeCount})
          </button>
          <button
            type="button"
            className={`match-filter-chip ${statusFilter === 'fusions' ? 'is-active' : ''}`}
            onClick={() => handleSelectFilter('fusions')}
          >
            🤝 En Alliance ({allianceCount})
          </button>
          <button
            type="button"
            className={`match-filter-chip ${statusFilter === 'multiclubs' ? 'is-active' : ''}`}
            onClick={() => handleSelectFilter('multiclubs')}
          >
            ⚡ Multi-Clubs ({multiClubCount})
          </button>
          {titledCommuneIds.size > 0 && (
            <button
              type="button"
              className={`match-filter-chip ${statusFilter === 'titled' ? 'is-active' : ''}`}
              onClick={() => handleSelectFilter('titled')}
            >
              🏆 Titrées ({titledCommuneIds.size})
            </button>
          )}
        </div>
      </div>

      <div className="matches-table-wrap" style={{ marginTop: 'var(--space-3)' }}>
        <table className="matches-table">
          <thead>
            <tr>
              <th
                style={{ width: '20%', cursor: 'pointer', userSelect: 'none' }}
                onClick={() => handleSort('name')}
                aria-sort={sortKey === 'name' ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'}
                title="Cliquer pour trier par nom de commune"
              >
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <span>Commune</span>
                  {renderSortIndicator('name')}
                </div>
              </th>
              <th
                style={{ width: '15%', cursor: 'pointer', userSelect: 'none' }}
                onClick={() => handleSort('department')}
                aria-sort={sortKey === 'department' ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'}
                title="Cliquer pour trier par département"
              >
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <span>Département</span>
                  {renderSortIndicator('department')}
                </div>
              </th>
              <th
                style={{ width: '14%', cursor: 'pointer', userSelect: 'none' }}
                onClick={() => handleSort('region')}
                aria-sort={sortKey === 'region' ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'}
                title="Cliquer pour trier par région"
              >
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <span>Région</span>
                  {renderSortIndicator('region')}
                </div>
              </th>
              <th
                style={{ width: '13%', cursor: 'pointer', userSelect: 'none' }}
                onClick={() => handleSort('population')}
                aria-sort={sortKey === 'population' ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'}
                title="Cliquer pour trier par population"
              >
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <span>Population</span>
                  {renderSortIndicator('population')}
                </div>
              </th>
              <th
                style={{ width: '15%', cursor: 'pointer', userSelect: 'none' }}
                onClick={() => handleSort('clubs')}
                aria-sort={sortKey === 'clubs' ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'}
                title="Cliquer pour trier par nombre de clubs actifs"
              >
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <span>Clubs Actifs</span>
                  {renderSortIndicator('clubs')}
                </div>
              </th>
              <th
                style={{ width: '12%', cursor: 'pointer', userSelect: 'none' }}
                onClick={() => handleSort('persons')}
                aria-sort={sortKey === 'persons' ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'}
                title="Cliquer pour trier par nombre de personnalités"
              >
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <span>Personnalités</span>
                  {renderSortIndicator('persons')}
                </div>
              </th>
              <th
                style={{ width: '11%', cursor: 'pointer', userSelect: 'none' }}
                onClick={() => handleSort('alliance')}
                aria-sort={sortKey === 'alliance' ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'}
                title="Cliquer pour trier par statut d'alliance"
              >
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <span>Statut Alliance</span>
                  {renderSortIndicator('alliance')}
                </div>
              </th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', padding: '32px', color: 'var(--color-text-dim)', fontStyle: 'italic' }}>
                  Aucune commune trouvée pour votre recherche.
                </td>
              </tr>
            ) : (
              visible.map((commune) => {
                const cityClubs = clubsByCommuneId.get(commune.id) ?? []
                const hasAlliance = cityClubs.some((c) => c.isFusion)
                const hasMultiple = cityClubs.length > 1
                const hasTitles = titledCommuneIds.has(commune.id)
                const cityPersons = personsByCommuneId.get(commune.id) ?? []
                const activeCount = cityPersons.filter((p) => !p.isRetired).length
                const retiredCount = cityPersons.length - activeCount

                return (
                  <tr key={commune.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <CommuneLink commune={commune} className="team-link" />
                        {hasTitles && <span title="Commune titrée dans l'histoire de la Coupe">🏆</span>}
                        {hasMultiple && (
                          <span
                            className="badge badge--accent"
                            style={{
                              fontSize: '0.68rem',
                              padding: '1px 5px',
                              background: 'rgba(234, 179, 8, 0.15)',
                              color: '#facc15',
                            }}
                            title={`${cityClubs.length} clubs rattachés`}
                          >
                            {cityClubs.length} clubs
                          </span>
                        )}
                      </div>
                    </td>
                    <td>
                      <span className="badge badge--neutral" style={{ marginRight: '6px' }}>
                        {commune.departmentId}
                      </span>
                      {departmentLabel(commune.departmentId)}
                    </td>
                    <td>{regionLabel(commune.regionId)}</td>
                    <td style={{ fontWeight: 600 }}>{commune.population.toLocaleString('fr-FR')} hab.</td>
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                        {cityClubs.map((club) => (
                          <div key={club.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem' }}>
                            <TeamLink team={club} showTrophies={false} inline />
                            {club.isFusion && (
                              <span
                                className="badge badge--accent"
                                style={{ fontSize: '0.68rem', padding: '1px 4px', background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8' }}
                              >
                                Alliance
                              </span>
                            )}
                            {club.isRivalClub && (
                              <span
                                className="badge badge--accent"
                                style={{ fontSize: '0.68rem', padding: '1px 4px', background: 'rgba(234, 179, 8, 0.15)', color: '#facc15' }}
                              >
                                Rival
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </td>
                    <td>
                      {cityPersons.length > 0 ? (
                        <Link
                          to={`/personnes?q=${encodeURIComponent(commune.name)}`}
                          style={{ textDecoration: 'none' }}
                          title={`${cityPersons.length} personnalité(s) de la commune : ${activeCount} active(s)${retiredCount > 0 ? `, ${retiredCount} retraitée(s)` : ''}`}
                        >
                          <span
                            className="badge badge--neutral"
                            style={{
                              fontSize: '0.8rem',
                              fontWeight: 700,
                              padding: '2px 7px',
                              background: 'rgba(168, 85, 247, 0.12)',
                              color: '#c084fc',
                              border: '1px solid rgba(168, 85, 247, 0.25)',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '5px',
                              cursor: 'pointer',
                            }}
                          >
                            <span>👤</span>
                            <span>{cityPersons.length}</span>
                            {retiredCount > 0 && (
                              <span style={{ fontSize: '0.7rem', color: 'var(--color-text-dim)', fontWeight: 500 }}>
                                ({activeCount} act.)
                              </span>
                            )}
                          </span>
                        </Link>
                      ) : (
                        <span style={{ color: 'var(--color-text-dim)', fontSize: '0.85rem' }}>0</span>
                      )}
                    </td>
                    <td>
                      {hasAlliance ? (
                        <span
                          className="badge badge--accent"
                          style={{
                            background: 'rgba(56, 189, 248, 0.12)',
                            color: '#38bdf8',
                            border: '1px solid rgba(56, 189, 248, 0.25)',
                          }}
                        >
                          🤝 En Alliance
                        </span>
                      ) : (
                        <span className="badge badge--emerald" style={{ fontSize: '0.75rem' }}>
                          ⚽ Autonome
                        </span>
                      )}
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="pagination" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-2)', marginTop: 'var(--space-4)' }}>
          <button
            type="button"
            className="btn-bracket-view"
            disabled={page === 0}
            onClick={() => setPage(0)}
            style={{ padding: '6px 12px', fontSize: '0.85rem' }}
          >
            « Premier
          </button>
          <button
            type="button"
            className="btn-bracket-view"
            disabled={page === 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            style={{ padding: '6px 12px', fontSize: '0.85rem' }}
          >
            ‹ Précédent
          </button>
          <span style={{ fontSize: '0.9rem', color: 'var(--color-text-muted)', margin: '0 8px' }}>
            Page <strong>{page + 1}</strong> sur <strong>{totalPages}</strong> (
            {sortedCommunes.length.toLocaleString('fr-FR')} villes)
          </span>
          <button
            type="button"
            className="btn-bracket-view"
            disabled={page >= totalPages - 1}
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            style={{ padding: '6px 12px', fontSize: '0.85rem' }}
          >
            Suivant ›
          </button>
          <button
            type="button"
            className="btn-bracket-view"
            disabled={page >= totalPages - 1}
            onClick={() => setPage(totalPages - 1)}
            style={{ padding: '6px 12px', fontSize: '0.85rem' }}
          >
            Dernier »
          </button>
        </div>
      )}
    </section>
  )
}
