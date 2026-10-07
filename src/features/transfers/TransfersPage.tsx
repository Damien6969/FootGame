import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useOptionalCupApp } from '../../app/CupAppContext'
import { parseSeasonYear } from '../history/palmaresSelectors'
import type { TransferMovement } from './types'
import './transfers.css'

const EMPTY_MOVEMENTS: readonly TransferMovement[] = []
const PAGE_SIZE = 50
const reasonLabels: Record<TransferMovement['reason'], string> = {
  AMBITION: 'Ambition', BLOCKED: 'Place bloquée', LONG_LOAN: 'Prêts prolongés',
  VETERAN: 'Nouveau départ', DEVELOPMENT: 'Développement',
  RECONVERSION: 'Reconversion', FREE_AGENT: 'Entraîneur libre',
  LIMOGEAGE: 'Limogeage', OPPORTUNITY: 'Opportunité', DYNAMICS: 'Dynamique sportive',
}
const numberFormat = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 })
const integerFormat = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 })
function normalize(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('fr').trim()
}
function byRating(a: TransferMovement, b: TransferMovement) {
  return b.rating - a.rating || a.playerName.localeCompare(b.playerName, 'fr') || a.id.localeCompare(b.id)
}
function distanceLabel(distance?: number, fromName?: string) {
  return distance === undefined ? '—' : `${integerFormat.format(distance)} km${fromName ? ` · depuis ${fromName}` : ''}`
}
function ClubLink({ id, name }: { id: string; name: string }) {
  if (id === 'free-agent' || !id) return <span>{name}</span>
  return <Link to={`/equipes/${encodeURIComponent(id)}`}>{name}</Link>
}
function MovementRoute({ movement }: { movement: TransferMovement }) {
  return <div className="transfer-route">
    <span><small>Départ</small><ClubLink id={movement.fromClubId} name={movement.fromClubName} /></span>
    <span className="transfer-route-arrow" aria-hidden="true">→</span>
    <span><small>{movement.kind === 'LOAN' ? 'Club d’accueil' : 'Arrivée'}</small><ClubLink id={movement.toClubId} name={movement.toClubName} /></span>
  </div>
}

export function TransfersPage() {
  const app = useOptionalCupApp()
  const [params, setParams] = useSearchParams()
  const [kind, setKind] = useState<'ALL' | TransferMovement['kind']>('ALL')
  const [role, setRole] = useState<'ALL' | 'PLAYER' | 'COACH'>('ALL')
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<'rating' | 'distance' | 'name'>('rating')
  const [page, setPage] = useState(0)
  const activeYear = app?.session ? app.session.seasonYear ?? parseSeasonYear(app.session.seed) : null
  const years = useMemo(() => {
    const available = new Set((app?.archives ?? []).map(archive => archive.year))
    if (activeYear !== null) available.add(activeYear)
    return [...available].sort((a, b) => b - a)
  }, [activeYear, app?.archives])
  const requestedYear = Number(params.get('saison'))
  const selectedYear = years.includes(requestedYear) ? requestedYear : years[0]
  const source = selectedYear === activeYear ? app?.session : app?.archives?.find(archive => archive.year === selectedYear)
  const movements = source?.transferMovements ?? EMPTY_MOVEMENTS
  const permanent = useMemo(() => movements.filter(movement => movement.kind === 'TRANSFER').sort(byRating), [movements])
  const loans = movements.length - permanent.length
  const clubsCount = useMemo(() => new Set(movements.flatMap(movement => [movement.fromClubId, movement.toClubId]).filter(id => id !== 'free-agent')).size, [movements])
  const filtered = useMemo(() => {
    const query = normalize(search)
    const result = movements.filter(movement =>
      (kind === 'ALL' || movement.kind === kind) && (role === 'ALL' || (movement.role ?? 'PLAYER') === role) && (!query || normalize(`${movement.playerName} ${movement.fromClubName} ${movement.toClubName} ${movement.ownerClubName ?? ''}`).includes(query)))
    return result.sort(sort === 'name'
      ? (a, b) => a.playerName.localeCompare(b.playerName, 'fr') || byRating(a, b)
      : sort === 'distance'
        ? (a, b) => (b.distanceKm ?? -1) - (a.distanceKm ?? -1) || byRating(a, b)
        : byRating)
  }, [movements, kind, role, search, sort])
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const currentPage = Math.min(page, pageCount - 1)
  const visible = filtered.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE)
  const recorded = source?.transferMovements !== undefined

  return <section className="transfers-page">
    <header className="transfer-header">
      <div>
        <p className="eyebrow">Coupe des communes · Vie des clubs</p>
        <h1>Le mercato</h1>
        <p>De nouvelles couleurs. Une nouvelle chance.</p>
      </div>
      {years.length > 0 && <label className="transfer-field transfer-season">Saison
        <select value={selectedYear} onChange={event => {
          const next = new URLSearchParams(params)
          next.set('saison', event.target.value)
          setParams(next)
          setPage(0)
        }}>{years.map(year => <option key={year} value={year}>{year}{year === activeYear ? ' · Actuelle' : ' · Archives'}</option>)}</select>
      </label>}
    </header>

    {!source ? <div className="transfer-empty">
      <span className="transfer-empty-symbol" aria-hidden="true">⇄</span>
      <h2>Le mercato attend sa première saison</h2>
      <p>Lance une Coupe pour retrouver ici les transferts et les prêts de chaque saison.</p>
      <Link className="btn btn--primary" to="/coupe">Aller à la Coupe</Link>
    </div> : !recorded ? <div className="transfer-empty">
      <span className="transfer-empty-symbol" aria-hidden="true">⇄</span>
      <h2>Mouvements non enregistrés</h2>
      <p>Cette saison a été créée avant le suivi du mercato. Les prochains changements de saison conserveront les transferts et les prêts ici.</p>
    </div> : <>
      <div className="transfer-season-line"><span>Saison {selectedYear}</span><span>Mercato de début de saison</span><span>{integerFormat.format(movements.length)} mouvements</span></div>
      <div className="transfer-summary" aria-label="Bilan du mercato">
        <article><span>Transferts définitifs</span><strong>{integerFormat.format(permanent.length)}</strong><small>Une nouvelle équipe</small></article>
        <article><span>Prêts</span><strong>{integerFormat.format(loans)}</strong><small>Une saison pour jouer</small></article>
        <article><span>Clubs concernés</span><strong>{integerFormat.format(clubsCount)}</strong><small>Au départ ou à l’arrivée</small></article>
        <article><span>Plus haute note transférée</span><strong>{permanent[0] ? <>{numberFormat.format(permanent[0].rating)}<small> / 30</small></> : '—'}</strong><small>Niveau au poste lors du départ</small></article>
      </div>

      {permanent.length > 0 && <section className="transfer-featured" aria-labelledby="transfer-featured-title">
        <div className="transfer-section-heading"><h2 id="transfer-featured-title">Transferts à la une</h2><p>Les plus fortes notes au poste</p></div>
        <div className="transfer-featured-grid">{permanent.filter(m => m.reason !== 'LIMOGEAGE').slice(0, 3).map((movement, index) => <article key={movement.id} className="transfer-feature-card">
          <div className="transfer-feature-top"><span className="transfer-rank">{String(index + 1).padStart(2, '0')}</span><span className="transfer-note" aria-label={`Note au poste : ${movement.rating} sur 30`}>{numberFormat.format(movement.rating)}<small>/30</small></span></div>
          <h3><Link to={`/personnes/${encodeURIComponent(movement.personId)}`}>{movement.playerName}</Link></h3>
          <p className="transfer-player-meta">{movement.role === 'COACH' ? 'Entraîneur' : movement.position === 'ATTACKER' ? 'Attaquant' : 'Défenseur'} · {movement.age} ans</p>
          <MovementRoute movement={movement} />
          <div className="transfer-feature-footer"><span className="transfer-reason">{reasonLabels[movement.reason]}</span><span>{distanceLabel(movement.distanceKm, movement.distanceFromClubName)}</span></div>
        </article>)}</div>
      </section>}

      <section className="transfer-market" aria-labelledby="transfer-market-title">
        <div className="transfer-section-heading"><h2 id="transfer-market-title">Tous les mouvements</h2><p>Des grands départs aux prêts de proximité</p></div>
        <div className="transfer-toolbar">
          <div className="transfer-filters" role="group" aria-label="Type de mouvement">
            {([['ALL', 'Tous', movements.length], ['TRANSFER', 'Transferts', permanent.length], ['LOAN', 'Prêts', loans]] as const).map(([value, label, count]) =>
              <button key={value} type="button" aria-pressed={kind === value} onClick={() => { setKind(value); setPage(0) }}>{label}<span>{integerFormat.format(count)}</span></button>)}
          </div>
          <div className="transfer-search-sort">
            <label className="transfer-field">Rôle<select value={role} onChange={event => { setRole(event.target.value as typeof role); setPage(0) }}><option value="ALL">Joueurs et entraîneurs</option><option value="PLAYER">Joueurs</option><option value="COACH">Entraîneurs</option></select></label>
            <label className="transfer-field transfer-search">Rechercher une personne ou un club<input type="search" placeholder="Joueur, entraîneur ou club…" value={search} onChange={event => { setSearch(event.target.value); setPage(0) }} /></label>
            <label className="transfer-field">Trier par<select value={sort} onChange={event => { setSort(event.target.value as typeof sort); setPage(0) }}><option value="rating">Note au poste · décroissante</option><option value="distance">Distance · décroissante</option><option value="name">Nom du joueur · A → Z</option></select></label>
          </div>
        </div>
        {movements.length === 0 ? <div className="transfer-empty transfer-empty--compact"><h3>Aucun mouvement cette saison</h3><p>Les joueurs ont conservé leur club. Un départ reste toujours une possibilité, jamais une obligation.</p></div>
          : filtered.length === 0 ? <div className="transfer-empty transfer-empty--compact" role="status"><h3>Aucun mouvement ne correspond à ces filtres</h3><p>Essaie un autre nom ou une autre catégorie.</p><button className="btn btn--secondary" type="button" onClick={() => { setSearch(''); setKind('ALL'); setRole('ALL'); setPage(0) }}>Effacer les filtres</button></div>
            : <>
              <div className="transfer-result-count" role="status">{integerFormat.format(filtered.length)} mouvement{filtered.length > 1 ? 's' : ''}{search.trim() ? ` pour « ${search.trim()} »` : ''} · Du {currentPage * PAGE_SIZE + 1} au {Math.min((currentPage + 1) * PAGE_SIZE, filtered.length)}</div>
              <div className="transfer-table-scroll"><table className="transfer-table" aria-label="Mouvements du mercato">
                <thead><tr><th scope="col">Joueur</th><th scope="col">Note au poste</th><th scope="col">Parcours</th><th scope="col">Mouvement</th><th scope="col">Distance</th></tr></thead>
                <tbody>{visible.map(movement => <tr key={movement.id}>
                  <td data-label="Joueur"><Link className="transfer-player-name" to={`/personnes/${encodeURIComponent(movement.personId)}`}>{movement.playerName}</Link><small className="transfer-player-meta">{movement.role === 'COACH' ? 'Entraîneur' : movement.position === 'ATTACKER' ? 'Attaquant' : 'Défenseur'} · {movement.age} ans</small></td>
                  <td data-label="Note au poste"><span className="transfer-table-note">{numberFormat.format(movement.rating)}<small>/30</small></span></td>
                  <td data-label="Parcours"><MovementRoute movement={movement} />{movement.kind === 'LOAN' && movement.ownerClubId && <small className="transfer-owner">Club propriétaire : <ClubLink id={movement.ownerClubId} name={movement.ownerClubName ?? movement.fromClubName} /></small>}</td>
                  <td data-label="Mouvement"><span className={`transfer-kind transfer-kind--${movement.reason === 'LIMOGEAGE' ? 'dismissal' : movement.kind.toLowerCase()}`}>{movement.kind === 'LOAN' ? 'Prêt' : movement.reason === 'LIMOGEAGE' ? 'Limogeage' : 'Transfert'}</span><small className={`transfer-motive transfer-motive--${movement.reason.toLowerCase()}`}>{movement.reason === 'LIMOGEAGE' ? 'Remercié par le club' : reasonLabels[movement.reason]}</small></td>
                  <td data-label="Distance"><span className="transfer-distance" title={`Distance depuis ${movement.distanceFromClubName ?? movement.fromClubName}, club actuel avant le mercato`}>{distanceLabel(movement.distanceKm, movement.distanceFromClubName)}</span></td>
                </tr>)}</tbody>
              </table></div>
              {pageCount > 1 && <nav className="transfer-pagination" aria-label="Pages des mouvements"><button className="btn btn--secondary" type="button" aria-label="Page précédente" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>← Précédente</button><span>Page {currentPage + 1} sur {pageCount}</span><button className="btn btn--secondary" type="button" aria-label="Page suivante" disabled={currentPage === pageCount - 1} onClick={() => setPage(currentPage + 1)}>Suivante →</button></nav>}
            </>}
      </section>
      <p className="transfer-footnote">La note correspond au niveau actuel lors du mouvement. Les entraîneurs rejoignent un poste vacant et ne sont jamais prêtés. Les distances partent du club actuel ; les entraîneurs sans club n’ont pas de distance de départ. Pour un joueur prêté, le club propriétaire est conservé. Les prêts reconduits dans le même club ne créent pas de nouveau mouvement.</p>
    </>}
  </section>
}
