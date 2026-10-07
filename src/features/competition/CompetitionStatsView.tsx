import { useState, useMemo, useEffect } from 'react'
import { Link } from 'react-router-dom'
import type { CupSession } from '../storage/cupRepository'
import type { Person } from '../persons/types'
import type { Club } from '../teams/types'
import { computeCompetitionStats, type ScorerStat, type DefenderStat } from './competitionStats'
import { TeamLink } from '../teams/TeamLink'
import { compareVolume, getSeasonAwards } from '../awards/seasonAwards'
import {
  conferenceLabel,
  departmentLabel,
  regionLabel,
  getDepartmentName,
  getRegionName,
  getRegionIdForDepartment,
  getAllConferences,
  getAllRegions,
  getAllDepartments,
} from '../geography/territoryLabels'
import { conferenceForRegion } from '../geography/loadGeography'
import { NationalityBadge } from '../persons/NationalityBadge'

type Props = Readonly<{
  session: CupSession
  persons: readonly Person[]
  clubsById?: Map<string, Club>
}>

type ScorerSortKey = 'rank' | 'name' | 'club' | 'goals' | 'shots' | 'conversionRate' | 'matchesPlayed' | 'goalsPerMatch'
type DefenderSortKey = 'rank' | 'name' | 'club' | 'defensiveStops' | 'matchesPlayed' | 'stopsPerMatch'

function getStatTerritory(stat: ScorerStat | DefenderStat) {
  const deptId = stat.club?.departmentId ?? stat.person.birthDepartmentId
  const regionId = stat.club?.regionId ?? getRegionIdForDepartment(deptId)
  const conferenceId = stat.club?.conferenceId ?? (regionId ? conferenceForRegion(regionId) : undefined)
  return { deptId, regionId, conferenceId }
}

export function CompetitionStatsView({ session, persons, clubsById }: Props) {
  const [activeTab, setActiveTab] = useState<'scorers' | 'defenders'>('scorers')
  const [searchTerm, setSearchTerm] = useState('')
  const [conferenceFilter, setConferenceFilter] = useState<'ALL' | string>('ALL')
  const [regionFilter, setRegionFilter] = useState<'ALL' | string>('ALL')
  const [departmentFilter, setDepartmentFilter] = useState<'ALL' | string>('ALL')
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ALIVE' | 'ELIMINATED'>('ALL')

  // Tri pour buteurs
  const [scorerSortKey, setScorerSortKey] = useState<ScorerSortKey>('rank')
  const [scorerSortDir, setScorerSortDir] = useState<'asc' | 'desc'>('desc')

  // Tri pour défenseurs
  const [defenderSortKey, setDefenderSortKey] = useState<DefenderSortKey>('rank')
  const [defenderSortDir, setDefenderSortDir] = useState<'asc' | 'desc'>('desc')

  // Pagination
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)

  // Clubs encore en lice
  const activeClubIds = useMemo(() => new Set(session?.activeTeamIds ?? []), [session?.activeTeamIds])

  const getClubStatus = (clubId?: string) => {
    if (!clubId) return { isAlive: false, isChampion: false }
    const isChampion = Boolean(session?.championId && session.championId === clubId)
    const isAlive = isChampion || activeClubIds.has(clubId)
    return { isAlive, isChampion }
  }

  // Réinitialiser la page en cas de changement de filtre ou d'onglet
  useEffect(() => {
    setPage(1)
  }, [
    searchTerm,
    activeTab,
    scorerSortKey,
    scorerSortDir,
    defenderSortKey,
    defenderSortDir,
    pageSize,
    conferenceFilter,
    regionFilter,
    departmentFilter,
    statusFilter,
  ])

  const stats = useMemo(() => {
    return computeCompetitionStats(session, persons, clubsById)
  }, [session, persons, clubsById])
  const awards = useMemo(() => getSeasonAwards(session), [session])
  const scorerWinnerId = awards?.awards.find(a => a.id === 'top-scorer')?.winners[0]?.personId
  const stopsWinnerId = awards?.awards.find(a => a.id === 'top-stops')?.winners[0]?.personId

  const allConferences = useMemo(() => getAllConferences(), [])
  const allRegions = useMemo(() => getAllRegions(), [])
  const allDepartments = useMemo(() => getAllDepartments(), [])

  // Options de régions filtrées selon la conférence sélectionnée
  const regionOptions = useMemo(() => {
    if (conferenceFilter === 'ALL') {
      return [...allRegions].sort((a, b) => a.name.localeCompare(b.name, 'fr'))
    }
    return allRegions
      .filter((r) => conferenceForRegion(r.id) === conferenceFilter)
      .sort((a, b) => a.name.localeCompare(b.name, 'fr'))
  }, [allRegions, conferenceFilter])

  // Options de départements filtrées selon la région ou la conférence sélectionnée
  const departmentOptions = useMemo(() => {
    let list = allDepartments
    if (regionFilter !== 'ALL') {
      list = list.filter((d) => d.regionId === regionFilter)
    } else if (conferenceFilter !== 'ALL') {
      list = list.filter((d) => conferenceForRegion(d.regionId) === conferenceFilter)
    }
    return [...list].sort((a, b) => a.name.localeCompare(b.name, 'fr'))
  }, [allDepartments, regionFilter, conferenceFilter])

  const handleConferenceChange = (confId: string) => {
    setConferenceFilter(confId)
    if (confId !== 'ALL' && regionFilter !== 'ALL') {
      if (conferenceForRegion(regionFilter) !== confId) {
        setRegionFilter('ALL')
        setDepartmentFilter('ALL')
      }
    }
  }

  const handleRegionChange = (regId: string) => {
    setRegionFilter(regId)
    if (regId !== 'ALL') {
      const conf = conferenceForRegion(regId)
      if (conf) setConferenceFilter(conf)
      if (departmentFilter !== 'ALL' && getRegionIdForDepartment(departmentFilter) !== regId) {
        setDepartmentFilter('ALL')
      }
    }
  }

  const handleDepartmentChange = (deptId: string) => {
    setDepartmentFilter(deptId)
    if (deptId !== 'ALL') {
      const reg = getRegionIdForDepartment(deptId)
      if (reg) {
        setRegionFilter(reg)
        const conf = conferenceForRegion(reg)
        if (conf) setConferenceFilter(conf)
      }
    }
  }

  const hasActiveFilters =
    conferenceFilter !== 'ALL' ||
    regionFilter !== 'ALL' ||
    departmentFilter !== 'ALL' ||
    statusFilter !== 'ALL' ||
    searchTerm.trim() !== ''

  const resetFilters = () => {
    setConferenceFilter('ALL')
    setRegionFilter('ALL')
    setDepartmentFilter('ALL')
    setStatusFilter('ALL')
    setSearchTerm('')
  }

  const territoryTitle = useMemo(() => {
    let base: string | null = null
    if (departmentFilter !== 'ALL') {
      base = `Dép. ${departmentLabel(departmentFilter)}`
    } else if (regionFilter !== 'ALL') {
      base = `Région ${regionLabel(regionFilter)}`
    } else if (conferenceFilter !== 'ALL') {
      base = conferenceLabel(conferenceFilter)
    }
    const statusTag = statusFilter === 'ALIVE' ? ' · En lice' : statusFilter === 'ELIMINATED' ? ' · Éliminés' : ''
    if (base) return `${base}${statusTag}`
    if (statusTag) return statusTag.replace(' · ', '')
    return null
  }, [departmentFilter, regionFilter, conferenceFilter, statusFilter])

  // Filtrage et Tri des Buteurs
  const sortedScorers = useMemo(() => {
    let list = stats.topScorers.filter((s) => {
      const { deptId, regionId, conferenceId } = getStatTerritory(s)

      if (conferenceFilter !== 'ALL' && conferenceId !== conferenceFilter) {
        return false
      }
      if (regionFilter !== 'ALL' && regionId !== regionFilter) {
        return false
      }
      if (departmentFilter !== 'ALL' && deptId !== departmentFilter) {
        return false
      }

      if (statusFilter !== 'ALL') {
        const clubId = s.club?.id ?? s.person.currentClubId
        const { isAlive } = getClubStatus(clubId ?? undefined)
        if (statusFilter === 'ALIVE' && !isAlive) return false
        if (statusFilter === 'ELIMINATED' && isAlive) return false
      }

      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase().trim()
        const fullName = `${s.person.firstName} ${s.person.lastName}`.toLowerCase()
        const clubName = s.clubName.toLowerCase()
        const communeName = s.club?.communeName?.toLowerCase() ?? ''
        const deptName = getDepartmentName(deptId)?.toLowerCase() ?? ''
        const regName = getRegionName(regionId)?.toLowerCase() ?? ''

        if (
          !fullName.includes(q) &&
          !clubName.includes(q) &&
          !communeName.includes(q) &&
          !deptName.includes(q) &&
          !regName.includes(q) &&
          deptId !== q
        ) {
          return false
        }
      }

      return true
    })

    list.sort((a, b) => {
      let cmp = 0
      switch (scorerSortKey) {
        case 'name':
          cmp = `${a.person.lastName} ${a.person.firstName}`.localeCompare(`${b.person.lastName} ${b.person.firstName}`)
          break
        case 'club':
          cmp = a.clubName.localeCompare(b.clubName)
          break
        case 'goals':
          cmp = a.goals - b.goals
          break
        case 'shots':
          cmp = a.shots - b.shots
          break
        case 'conversionRate':
          cmp = a.conversionRate - b.conversionRate
          break
        case 'matchesPlayed':
          cmp = a.matchesPlayed - b.matchesPlayed
          break
        case 'goalsPerMatch':
          cmp = a.goalsPerMatch - b.goalsPerMatch
          break
        case 'rank':
        default:
          cmp = -compareVolume({ ...a, personId: a.person.id }, { ...b, personId: b.person.id }, a.goals, b.goals)
          break
      }
      return scorerSortDir === 'asc' ? cmp : -cmp
    })

    return list
  }, [stats.topScorers, searchTerm, conferenceFilter, regionFilter, departmentFilter, statusFilter, scorerSortKey, scorerSortDir, activeClubIds])

  // Filtrage et Tri des Défenseurs
  const sortedDefenders = useMemo(() => {
    let list = stats.topDefenders.filter((d) => {
      const { deptId, regionId, conferenceId } = getStatTerritory(d)

      if (conferenceFilter !== 'ALL' && conferenceId !== conferenceFilter) {
        return false
      }
      if (regionFilter !== 'ALL' && regionId !== regionFilter) {
        return false
      }
      if (departmentFilter !== 'ALL' && deptId !== departmentFilter) {
        return false
      }

      if (statusFilter !== 'ALL') {
        const clubId = d.club?.id ?? d.person.currentClubId
        const { isAlive } = getClubStatus(clubId ?? undefined)
        if (statusFilter === 'ALIVE' && !isAlive) return false
        if (statusFilter === 'ELIMINATED' && isAlive) return false
      }

      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase().trim()
        const fullName = `${d.person.firstName} ${d.person.lastName}`.toLowerCase()
        const clubName = d.clubName.toLowerCase()
        const communeName = d.club?.communeName?.toLowerCase() ?? ''
        const deptName = getDepartmentName(deptId)?.toLowerCase() ?? ''
        const regName = getRegionName(regionId)?.toLowerCase() ?? ''

        if (
          !fullName.includes(q) &&
          !clubName.includes(q) &&
          !communeName.includes(q) &&
          !deptName.includes(q) &&
          !regName.includes(q) &&
          deptId !== q
        ) {
          return false
        }
      }

      return true
    })

    list.sort((a, b) => {
      let cmp = 0
      switch (defenderSortKey) {
        case 'name':
          cmp = `${a.person.lastName} ${a.person.firstName}`.localeCompare(`${b.person.lastName} ${b.person.firstName}`)
          break
        case 'club':
          cmp = a.clubName.localeCompare(b.clubName)
          break
        case 'defensiveStops':
          cmp = a.defensiveStops - b.defensiveStops
          break
        case 'matchesPlayed':
          cmp = a.matchesPlayed - b.matchesPlayed
          break
        case 'stopsPerMatch':
          cmp = a.stopsPerMatch - b.stopsPerMatch
          break
        case 'rank':
        default:
          cmp = -compareVolume({ ...a, personId: a.person.id }, { ...b, personId: b.person.id }, a.defensiveStops, b.defensiveStops)
          break
      }
      return defenderSortDir === 'asc' ? cmp : -cmp
    })

    return list
  }, [stats.topDefenders, searchTerm, conferenceFilter, regionFilter, departmentFilter, statusFilter, defenderSortKey, defenderSortDir, activeClubIds])

  // Données actives paginées
  const currentList = activeTab === 'scorers' ? sortedScorers : sortedDefenders
  const totalCount = currentList.length
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize))
  const currentPage = Math.min(page, totalPages)
  const startIndex = (currentPage - 1) * pageSize
  const endIndex = Math.min(startIndex + pageSize, totalCount)
  const paginatedItems = currentList.slice(startIndex, endIndex)

  const handleScorerSort = (key: ScorerSortKey) => {
    if (scorerSortKey === key) {
      setScorerSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setScorerSortKey(key)
      setScorerSortDir(key === 'name' || key === 'club' ? 'asc' : 'desc')
    }
  }

  const handleDefenderSort = (key: DefenderSortKey) => {
    if (defenderSortKey === key) {
      setDefenderSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setDefenderSortKey(key)
      setDefenderSortDir(key === 'name' || key === 'club' ? 'asc' : 'desc')
    }
  }

  const renderSortIndicator = (activeKey: string, targetKey: string, dir: 'asc' | 'desc') => {
    if (activeKey !== targetKey) {
      return <span style={{ opacity: 0.35, fontSize: '0.75rem', marginLeft: '5px' }}>↕</span>
    }
    return (
      <span style={{ color: 'var(--color-primary-light, #38bdf8)', fontSize: '0.8rem', marginLeft: '5px' }}>
        {dir === 'asc' ? '▲' : '▼'}
      </span>
    )
  }

  return (
    <div className="competition-stats-view" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      {awards && <Link className="btn btn--secondary" to={`/trophees?saison=${awards.year}`}>✦ Remise des trophées · Soulier d’Or et Bouclier d’Or attribués</Link>}
      {/* En-tête KPI de la compétition */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: 'var(--space-3)',
        }}
      >
        <div className="stat-card" style={{ background: 'var(--color-surface, #1e293b)', padding: '16px 20px', borderRadius: '12px', border: '1px solid var(--color-border, #334155)' }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--color-text-dim)', textTransform: 'uppercase', fontWeight: 600 }}>Matchs Joués</span>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#f8fafc', marginTop: '4px' }}>
            {stats.totalMatches.toLocaleString('fr-FR')}
          </div>
        </div>

        <div className="stat-card" style={{ background: 'var(--color-surface, #1e293b)', padding: '16px 20px', borderRadius: '12px', border: '1px solid var(--color-border, #334155)' }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--color-text-dim)', textTransform: 'uppercase', fontWeight: 600 }}>Total Buts Marqués</span>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#facc15', marginTop: '4px' }}>
            ⚽ {stats.totalGoals.toLocaleString('fr-FR')}
          </div>
          <span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', marginTop: '2px', display: 'block' }}>
            {stats.personalityGoals} par des stars ({stats.totalGoals > 0 ? Math.round((stats.personalityGoals / stats.totalGoals) * 100) : 0}%)
          </span>
        </div>

        <div className="stat-card" style={{ background: 'var(--color-surface, #1e293b)', padding: '16px 20px', borderRadius: '12px', border: '1px solid var(--color-border, #334155)' }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--color-text-dim)', textTransform: 'uppercase', fontWeight: 600 }}>Actions & Tirs Tentés</span>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#38bdf8', marginTop: '4px' }}>
            ⚡ {stats.totalShots.toLocaleString('fr-FR')}
          </div>
        </div>

        <div className="stat-card" style={{ background: 'var(--color-surface, #1e293b)', padding: '16px 20px', borderRadius: '12px', border: '1px solid var(--color-border, #334155)' }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--color-text-dim)', textTransform: 'uppercase', fontWeight: 600 }}>Arrêts & Sauvetages</span>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#4ade80', marginTop: '4px' }}>
            🛡️ {stats.totalDefensiveStops.toLocaleString('fr-FR')}
          </div>
        </div>
      </div>

      {/* Barre d'onglets Buteurs / Défenseurs, filtres géographiques et Recherche */}
      <div className="table-toolbar" style={{ flexWrap: 'wrap', gap: 'var(--space-3)', alignItems: 'center' }}>
        <div className="view-switch">
          <button
            type="button"
            className={activeTab === 'scorers' ? 'is-active' : ''}
            onClick={() => setActiveTab('scorers')}
            style={activeTab === 'scorers' ? { color: '#fbbf24' } : undefined}
          >
            <span>⚽</span> Meilleurs Buteurs ({sortedScorers.length})
          </button>
          <button
            type="button"
            className={activeTab === 'defenders' ? 'is-active' : ''}
            onClick={() => setActiveTab('defenders')}
            style={activeTab === 'defenders' ? { color: '#38bdf8' } : undefined}
          >
            <span>🛡️</span> Meilleurs Défenseurs ({sortedDefenders.length})
          </button>
        </div>

        <input
          type="search"
          placeholder="Rechercher joueur ou club…"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{ width: 'min(100%, 15rem)' }}
          aria-label="Rechercher joueur ou club"
        />

        {/* Filtre Conférence */}
        <select
          value={conferenceFilter}
          onChange={(e) => handleConferenceChange(e.target.value)}
          aria-label="Filtrer par conférence"
        >
          <option value="ALL">Toutes les conférences</option>
          {allConferences.map((conf) => (
            <option key={conf.id} value={conf.id}>
              {conf.label}
            </option>
          ))}
        </select>

        {/* Filtre Région */}
        <select
          value={regionFilter}
          onChange={(e) => handleRegionChange(e.target.value)}
          aria-label="Filtrer par région"
        >
          <option value="ALL">
            {conferenceFilter !== 'ALL' ? 'Toutes les régions (conf.)' : 'Toutes les régions'}
          </option>
          {regionOptions.map((reg) => (
            <option key={reg.id} value={reg.id}>
              {reg.name} ({reg.id})
            </option>
          ))}
        </select>

        {/* Filtre Département */}
        <select
          value={departmentFilter}
          onChange={(e) => handleDepartmentChange(e.target.value)}
          aria-label="Filtrer par département"
        >
          <option value="ALL">
            {regionFilter !== 'ALL'
              ? 'Tous les départements (région)'
              : conferenceFilter !== 'ALL'
                ? 'Tous les départements (conf.)'
                : 'Tous les départements'}
          </option>
          {departmentOptions.map((dept) => (
            <option key={dept.id} value={dept.id}>
              {dept.name} ({dept.id})
            </option>
          ))}
        </select>

        {/* Filtre Statut du club (En lice / Éliminé) */}
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as 'ALL' | 'ALIVE' | 'ELIMINATED')}
          aria-label="Filtrer par statut du club"
        >
          <option value="ALL">Tous les statuts</option>
          <option value="ALIVE">🟢 En lice uniquement</option>
          <option value="ELIMINATED">🔴 Éliminés uniquement</option>
        </select>

        {hasActiveFilters && (
          <button
            type="button"
            className="match-filter-chip"
            onClick={resetFilters}
            title="Effacer tous les filtres (géographiques, statut et recherche)"
          >
            ✕ Réinitialiser filtres
          </button>
        )}

        <div style={{ marginLeft: hasActiveFilters ? undefined : 'auto', fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
          <strong>{currentList.length}</strong> joueur(s) trouvé(s)
        </div>
      </div>

      {/* Tableau des Meilleurs Buteurs */}
      {activeTab === 'scorers' && (
        <div
          style={{
            background: 'var(--color-surface, #1e293b)',
            borderRadius: '14px',
            border: '1px solid var(--color-border, #334155)',
            overflow: 'hidden',
          }}
        >
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--color-border, #334155)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
            <h3 style={{ margin: 0, fontSize: '1.15rem', color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>⚽</span> {territoryTitle ? `Classement des Buteurs · ${territoryTitle}` : `Classement National des Buteurs`} ({session.seasonYear ?? 2026})
            </h3>
            <span style={{ fontSize: '0.85rem', color: 'var(--color-text-dim)' }}>
              {sortedScorers.length} buteur{sortedScorers.length > 1 ? 's' : ''} répertorié{sortedScorers.length > 1 ? 's' : ''}
            </span>
          </div>

          {sortedScorers.length === 0 ? (
            <div style={{ padding: '32px', textAlign: 'center', color: 'var(--color-text-dim)' }}>
              {stats.totalMatches === 0
                ? "Aucun match n'a encore été disputé pour cette saison. Les buts apparaîtront dès le coup d'envoi !"
                : "Aucun buteur ne correspond à vos critères de recherche."}
            </div>
          ) : (
            <>
              <div style={{ overflowX: 'auto' }}>
                <table className="matches-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ background: 'rgba(0,0,0,0.2)', borderBottom: '1px solid var(--color-border, #334155)' }}>
                      <th
                        onClick={() => handleScorerSort('rank')}
                        style={{ padding: '12px 16px', width: '70px', textAlign: 'center', cursor: 'pointer', userSelect: 'none' }}
                        title="Trier par rang"
                      >
                        Rang {renderSortIndicator(scorerSortKey, 'rank', scorerSortDir)}
                      </th>
                      <th
                        onClick={() => handleScorerSort('name')}
                        style={{ padding: '12px 16px', minWidth: '200px', cursor: 'pointer', userSelect: 'none' }}
                        title="Trier par nom"
                      >
                        Buteur {renderSortIndicator(scorerSortKey, 'name', scorerSortDir)}
                      </th>
                      <th
                        onClick={() => handleScorerSort('club')}
                        style={{ padding: '12px 16px', minWidth: '180px', cursor: 'pointer', userSelect: 'none' }}
                        title="Trier par club"
                      >
                        Club {renderSortIndicator(scorerSortKey, 'club', scorerSortDir)}
                      </th>
                      <th
                        onClick={() => handleScorerSort('goals')}
                        style={{ padding: '12px 16px', textAlign: 'center', width: '100px', cursor: 'pointer', userSelect: 'none' }}
                        title="Trier par buts marqués"
                      >
                        Buts {renderSortIndicator(scorerSortKey, 'goals', scorerSortDir)}
                      </th>
                      <th
                        onClick={() => handleScorerSort('shots')}
                        style={{ padding: '12px 16px', textAlign: 'center', width: '120px', cursor: 'pointer', userSelect: 'none' }}
                        title="Trier par tirs tentés"
                      >
                        Tirs (Ratés) {renderSortIndicator(scorerSortKey, 'shots', scorerSortDir)}
                      </th>
                      <th
                        onClick={() => handleScorerSort('conversionRate')}
                        style={{ padding: '12px 16px', textAlign: 'center', width: '110px', cursor: 'pointer', userSelect: 'none' }}
                        title="Trier par efficacité au tir"
                      >
                        Efficacité {renderSortIndicator(scorerSortKey, 'conversionRate', scorerSortDir)}
                      </th>
                      <th
                        onClick={() => handleScorerSort('matchesPlayed')}
                        style={{ padding: '12px 16px', textAlign: 'center', width: '100px', cursor: 'pointer', userSelect: 'none' }}
                        title="Trier par matchs joués"
                      >
                        Matchs {renderSortIndicator(scorerSortKey, 'matchesPlayed', scorerSortDir)}
                      </th>
                      <th
                        onClick={() => handleScorerSort('goalsPerMatch')}
                        style={{ padding: '12px 16px', textAlign: 'center', width: '110px', cursor: 'pointer', userSelect: 'none' }}
                        title="Trier par ratio buts / match"
                      >
                        Ratio {renderSortIndicator(scorerSortKey, 'goalsPerMatch', scorerSortDir)}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {(paginatedItems as ScorerStat[]).map((s, idx) => {
                      const absoluteRank = startIndex + idx + 1
                      const rankBadge =
                        absoluteRank === 1 ? '🥇' : absoluteRank === 2 ? '🥈' : absoluteRank === 3 ? '🥉' : `${absoluteRank}`

                      return (
                        <tr
                          key={s.person.id}
                          style={{
                            borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
                            background: absoluteRank === 1 ? 'rgba(234, 179, 8, 0.06)' : undefined,
                          }}
                        >
                          <td style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 800, fontSize: absoluteRank <= 3 ? '1.2rem' : '0.95rem' }}>
                            {rankBadge}
                          </td>
                          <td style={{ padding: '12px 16px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                              <div
                                style={{
                                  width: '32px',
                                  height: '32px',
                                  borderRadius: '50%',
                                  background: s.person.position === 'ATTACKER' ? 'linear-gradient(135deg, #f59e0b, #ef4444)' : 'linear-gradient(135deg, #3b82f6, #10b981)',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  color: '#ffffff',
                                  fontWeight: 700,
                                  fontSize: '0.8rem',
                                  flexShrink: 0,
                                }}
                              >
                                {s.person.firstName.charAt(0)}{s.person.lastName.charAt(0)}
                              </div>
                              <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                  <Link
                                    to={`/personnes/${s.person.id}`}
                                    style={{ color: '#ffffff', fontWeight: 700, textDecoration: 'none', fontSize: '0.95rem' }}
                                  >
                                    {s.person.firstName} {s.person.lastName}
                                  </Link>
                                  <NationalityBadge person={s.person} compact />
                                </div>
                                {s.person.id === scorerWinnerId && <div><Link className="badge badge--gold" to={`/trophees?saison=${awards!.year}`}>⚽ Soulier d’Or</Link></div>}
                                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-dim)', marginTop: '1px' }}>
                                  {s.person.assignedPosition === 'ATTACKER' ? 'Attaquant' : s.person.assignedPosition === 'DEFENDER' ? 'Défenseur' : (s.person.position === 'ATTACKER' ? 'Attaquant' : 'Défenseur')} · ATQ {s.person.attack}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td style={{ padding: '12px 16px' }}>
                            {s.club ? (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                  <TeamLink team={s.club} showTrophies={false} />
                                  {s.club.departmentId && (
                                    <span style={{ fontSize: '0.75rem', color: 'var(--color-text-dim)' }}>
                                      ({s.club.departmentId})
                                    </span>
                                  )}
                                </div>
                                <div>
                                  {(() => {
                                    const { isAlive, isChampion } = getClubStatus(s.club.id)
                                    if (isChampion) {
                                      return (
                                        <span
                                          className="badge badge--gold"
                                          style={{ fontSize: '0.68rem', padding: '1px 6px', fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: '3px' }}
                                          title="Champion de la Coupe des communes"
                                        >
                                          🏆 Champion
                                        </span>
                                      )
                                    }
                                    if (isAlive) {
                                      return (
                                        <span
                                          className="badge badge--emerald"
                                          style={{ fontSize: '0.68rem', padding: '1px 6px', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '3px' }}
                                          title="Club encore en lice dans la compétition"
                                        >
                                          <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#34d399', display: 'inline-block' }} />
                                          En lice
                                        </span>
                                      )
                                    }
                                    return (
                                      <span
                                        className="badge badge--rose"
                                        style={{ fontSize: '0.68rem', padding: '1px 6px', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '3px' }}
                                        title="Club éliminé de la compétition"
                                      >
                                        <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#fb7185', display: 'inline-block' }} />
                                        Éliminé
                                      </span>
                                    )
                                  })()}
                                </div>
                              </div>
                            ) : (
                              s.clubName
                            )}
                          </td>
                          <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                            <span
                              className="badge badge--gold"
                              style={{
                                fontSize: '0.95rem',
                                fontWeight: 800,
                                padding: '4px 12px',
                                background: 'rgba(234, 179, 8, 0.2)',
                                color: '#facc15',
                                border: '1px solid rgba(234, 179, 8, 0.4)',
                              }}
                            >
                              ⚽ {s.goals}
                            </span>
                          </td>
                          <td style={{ padding: '12px 16px', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
                            <strong>{s.shots}</strong> <span style={{ fontSize: '0.8rem', color: 'var(--color-text-dim)' }}>({s.shotsMissed})</span>
                          </td>
                          <td style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 600, color: s.conversionRate >= 40 ? '#4ade80' : '#e2e8f0' }}>
                            {s.conversionRate}%
                          </td>
                          <td style={{ padding: '12px 16px', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
                            {s.matchesPlayed}
                          </td>
                          <td style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 700, color: '#f8fafc' }}>
                            {s.goalsPerMatch.toFixed(2)}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {/* Barre de pagination */}
              <PaginationBar
                currentPage={currentPage}
                totalPages={totalPages}
                totalItems={totalCount}
                startIndex={startIndex}
                endIndex={endIndex}
                pageSize={pageSize}
                onPageChange={setPage}
                onPageSizeChange={setPageSize}
              />
            </>
          )}
        </div>
      )}

      {/* Tableau des Meilleurs Défenseurs */}
      {activeTab === 'defenders' && (
        <div
          style={{
            background: 'var(--color-surface, #1e293b)',
            borderRadius: '14px',
            border: '1px solid var(--color-border, #334155)',
            overflow: 'hidden',
          }}
        >
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--color-border, #334155)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
            <h3 style={{ margin: 0, fontSize: '1.15rem', color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>🛡️</span> {territoryTitle ? `Classement des Défenseurs · ${territoryTitle}` : `Classement National des Défenseurs`} ({session.seasonYear ?? 2026})
            </h3>
            <span style={{ fontSize: '0.85rem', color: 'var(--color-text-dim)' }}>
              {sortedDefenders.length} défenseur{sortedDefenders.length > 1 ? 's' : ''} répertorié{sortedDefenders.length > 1 ? 's' : ''}
            </span>
          </div>

          {sortedDefenders.length === 0 ? (
            <div style={{ padding: '32px', textAlign: 'center', color: 'var(--color-text-dim)' }}>
              {stats.totalMatches === 0
                ? "Aucun match n'a encore été disputé. Les interventions défensives seront comptabilisées en direct !"
                : "Aucun défenseur ne correspond à vos critères de recherche."}
            </div>
          ) : (
            <>
              <div style={{ overflowX: 'auto' }}>
                <table className="matches-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ background: 'rgba(0,0,0,0.2)', borderBottom: '1px solid var(--color-border, #334155)' }}>
                      <th
                        onClick={() => handleDefenderSort('rank')}
                        style={{ padding: '12px 16px', width: '70px', textAlign: 'center', cursor: 'pointer', userSelect: 'none' }}
                        title="Trier par rang"
                      >
                        Rang {renderSortIndicator(defenderSortKey, 'rank', defenderSortDir)}
                      </th>
                      <th
                        onClick={() => handleDefenderSort('name')}
                        style={{ padding: '12px 16px', minWidth: '200px', cursor: 'pointer', userSelect: 'none' }}
                        title="Trier par nom"
                      >
                        Défenseur {renderSortIndicator(defenderSortKey, 'name', defenderSortDir)}
                      </th>
                      <th
                        onClick={() => handleDefenderSort('club')}
                        style={{ padding: '12px 16px', minWidth: '180px', cursor: 'pointer', userSelect: 'none' }}
                        title="Trier par club"
                      >
                        Club {renderSortIndicator(defenderSortKey, 'club', defenderSortDir)}
                      </th>
                      <th
                        onClick={() => handleDefenderSort('defensiveStops')}
                        style={{ padding: '12px 16px', textAlign: 'center', width: '150px', cursor: 'pointer', userSelect: 'none' }}
                        title="Trier par interventions défensives"
                      >
                        Interventions {renderSortIndicator(defenderSortKey, 'defensiveStops', defenderSortDir)}
                      </th>
                      <th
                        onClick={() => handleDefenderSort('matchesPlayed')}
                        style={{ padding: '12px 16px', textAlign: 'center', width: '100px', cursor: 'pointer', userSelect: 'none' }}
                        title="Trier par matchs joués"
                      >
                        Matchs {renderSortIndicator(defenderSortKey, 'matchesPlayed', defenderSortDir)}
                      </th>
                      <th
                        onClick={() => handleDefenderSort('stopsPerMatch')}
                        style={{ padding: '12px 16px', textAlign: 'center', width: '130px', cursor: 'pointer', userSelect: 'none' }}
                        title="Trier par moyenne d'arrêts par match"
                      >
                        Moyenne / Match {renderSortIndicator(defenderSortKey, 'stopsPerMatch', defenderSortDir)}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {(paginatedItems as DefenderStat[]).map((d, idx) => {
                      const absoluteRank = startIndex + idx + 1
                      const rankBadge =
                        absoluteRank === 1 ? '🥇' : absoluteRank === 2 ? '🥈' : absoluteRank === 3 ? '🥉' : `${absoluteRank}`

                      return (
                        <tr
                          key={d.person.id}
                          style={{
                            borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
                            background: absoluteRank === 1 ? 'rgba(56, 189, 248, 0.06)' : undefined,
                          }}
                        >
                          <td style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 800, fontSize: absoluteRank <= 3 ? '1.2rem' : '0.95rem' }}>
                            {rankBadge}
                          </td>
                          <td style={{ padding: '12px 16px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                              <div
                                style={{
                                  width: '32px',
                                  height: '32px',
                                  borderRadius: '50%',
                                  background: 'linear-gradient(135deg, #3b82f6, #10b981)',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  color: '#ffffff',
                                  fontWeight: 700,
                                  fontSize: '0.8rem',
                                  flexShrink: 0,
                                }}
                              >
                                {d.person.firstName.charAt(0)}{d.person.lastName.charAt(0)}
                              </div>
                              <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                  <Link
                                    to={`/personnes/${d.person.id}`}
                                    style={{ color: '#ffffff', fontWeight: 700, textDecoration: 'none', fontSize: '0.95rem' }}
                                  >
                                    {d.person.firstName} {d.person.lastName}
                                  </Link>
                                  <NationalityBadge person={d.person} compact />
                                </div>
                                {d.person.id === stopsWinnerId && <div><Link className="badge badge--gold" to={`/trophees?saison=${awards!.year}`}>🛡️ Bouclier d’Or</Link></div>}
                                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-dim)', marginTop: '1px' }}>
                                  {d.person.assignedPosition === 'ATTACKER' ? 'Attaquant' : d.person.assignedPosition === 'DEFENDER' ? 'Défenseur' : (d.person.position === 'ATTACKER' ? 'Attaquant' : 'Défenseur')} · DEF {d.person.defense}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td style={{ padding: '12px 16px' }}>
                            {d.club ? (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                  <TeamLink team={d.club} showTrophies={false} />
                                  {d.club.departmentId && (
                                    <span style={{ fontSize: '0.75rem', color: 'var(--color-text-dim)' }}>
                                      ({d.club.departmentId})
                                    </span>
                                  )}
                                </div>
                                <div>
                                  {(() => {
                                    const { isAlive, isChampion } = getClubStatus(d.club.id)
                                    if (isChampion) {
                                      return (
                                        <span
                                          className="badge badge--gold"
                                          style={{ fontSize: '0.68rem', padding: '1px 6px', fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: '3px' }}
                                          title="Champion de la Coupe des communes"
                                        >
                                          🏆 Champion
                                        </span>
                                      )
                                    }
                                    if (isAlive) {
                                      return (
                                        <span
                                          className="badge badge--emerald"
                                          style={{ fontSize: '0.68rem', padding: '1px 6px', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '3px' }}
                                          title="Club encore en lice dans la compétition"
                                        >
                                          <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#34d399', display: 'inline-block' }} />
                                          En lice
                                        </span>
                                      )
                                    }
                                    return (
                                      <span
                                        className="badge badge--rose"
                                        style={{ fontSize: '0.68rem', padding: '1px 6px', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '3px' }}
                                        title="Club éliminé de la compétition"
                                      >
                                        <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#fb7185', display: 'inline-block' }} />
                                        Éliminé
                                      </span>
                                    )
                                  })()}
                                </div>
                              </div>
                            ) : (
                              d.clubName
                            )}
                          </td>
                          <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                            <span
                              className="badge badge--blue"
                              style={{
                                fontSize: '0.95rem',
                                fontWeight: 800,
                                padding: '4px 12px',
                                background: 'rgba(56, 189, 248, 0.2)',
                                color: '#38bdf8',
                                border: '1px solid rgba(56, 189, 248, 0.4)',
                              }}
                            >
                              🛡️ {d.defensiveStops}
                            </span>
                          </td>
                          <td style={{ padding: '12px 16px', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
                            {d.matchesPlayed}
                          </td>
                          <td style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 700, color: '#f8fafc' }}>
                            {d.stopsPerMatch.toFixed(2)}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {/* Barre de pagination */}
              <PaginationBar
                currentPage={currentPage}
                totalPages={totalPages}
                totalItems={totalCount}
                startIndex={startIndex}
                endIndex={endIndex}
                pageSize={pageSize}
                onPageChange={setPage}
                onPageSizeChange={setPageSize}
              />
            </>
          )}
        </div>
      )}
    </div>
  )
}

interface PaginationBarProps {
  currentPage: number
  totalPages: number
  totalItems: number
  startIndex: number
  endIndex: number
  pageSize: number
  onPageChange: (p: number) => void
  onPageSizeChange: (s: number) => void
}

function PaginationBar({
  currentPage,
  totalPages,
  totalItems,
  startIndex,
  endIndex,
  pageSize,
  onPageChange,
  onPageSizeChange,
}: PaginationBarProps) {
  if (totalItems <= 10) return null

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '14px 20px',
        borderTop: '1px solid var(--color-border, #334155)',
        background: 'rgba(0, 0, 0, 0.15)',
        flexWrap: 'wrap',
        gap: '12px',
        fontSize: '0.88rem',
        color: 'var(--color-text-dim)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span>
          Affichage de <strong style={{ color: '#ffffff' }}>{startIndex + 1}</strong> à{' '}
          <strong style={{ color: '#ffffff' }}>{endIndex}</strong> sur{' '}
          <strong style={{ color: '#ffffff' }}>{totalItems}</strong> joueurs
        </span>
        <span style={{ color: 'var(--color-border, #334155)' }}>|</span>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
          <span>Par page :</span>
          <select
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            style={{
              background: 'var(--color-surface, #1e293b)',
              color: '#ffffff',
              border: '1px solid var(--color-border, #334155)',
              borderRadius: '6px',
              padding: '2px 8px',
              fontSize: '0.85rem',
            }}
          >
            <option value={10}>10</option>
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
        </label>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <button
          type="button"
          className="btn btn--secondary"
          onClick={() => onPageChange(1)}
          disabled={currentPage <= 1}
          style={{ padding: '4px 10px', fontSize: '0.82rem' }}
          title="Première page"
        >
          ««
        </button>
        <button
          type="button"
          className="btn btn--secondary"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage <= 1}
          style={{ padding: '4px 10px', fontSize: '0.82rem' }}
        >
          ‹ Précédent
        </button>

        <span style={{ margin: '0 8px', fontWeight: 600, color: '#f8fafc' }}>
          Page {currentPage} / {totalPages}
        </span>

        <button
          type="button"
          className="btn btn--secondary"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage >= totalPages}
          style={{ padding: '4px 10px', fontSize: '0.82rem' }}
        >
          Suivant ›
        </button>
        <button
          type="button"
          className="btn btn--secondary"
          onClick={() => onPageChange(totalPages)}
          disabled={currentPage >= totalPages}
          style={{ padding: '4px 10px', fontSize: '0.82rem' }}
          title="Dernière page"
        >
          »»
        </button>
      </div>
    </div>
  )
}
