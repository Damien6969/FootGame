import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useOptionalCupApp } from '../../app/CupAppContext'
import { cupRepository, type SeasonArchive } from '../storage/cupRepository'
import { parseSeasonYear } from '../history/palmaresSelectors'
import { getSeasonAwards, isSeasonComplete } from './seasonAwards'
import { AwardsCeremony } from './AwardsCeremony'
import { buildPastHonorsMap } from './PlayerPastHonors'
import type { PlayerSeasonHonor } from '../history/playerPalmaresStorage'
import './awards.css'

function ScoringRules({ minimumMatches, phaseAverage = true, phaseTotal = false }: { minimumMatches?: number; phaseAverage?: boolean; phaseTotal?: boolean }) {
  return <details className="awards-rules"><summary>Comment le jury attribue les trophées</summary>
    <p>Seules les statistiques individuelles de la Coupe sélectionnée comptent. Les exemptions ne sont pas des matchs joués. Les notes de niveau du joueur et les titres du club n’entrent pas dans le calcul.</p>
    <p><strong>Participation :</strong> {minimumMatches ? `au moins ${minimumMatches} matchs cette saison` : 'au moins 3 matchs et 25 % du maximum de matchs disputés par un joueur, arrondis au supérieur'}. Les espoirs ont strictement moins de 23 ans pendant la saison récompensée.</p>
    {phaseAverage && <>
      {phaseTotal ? <>
        <p><strong>Phases :</strong> Départemental × 0,25 ; régional × 0,75 ; conférence × 2 ; demi-finale nationale × 3 ; finale × 4.</p>
        <p><strong>Parcours :</strong> les scores de chaque match sont cumulés sur toute la Coupe. Les actions et les points de participation sont pondérés par leur phase. Les performances des derniers tours comptent beaucoup plus. Aucun tour minimal n’est imposé : une saison courte exceptionnelle reste éligible.</p>
      </> : <>
        <p><strong>Phases :</strong> Départemental × 0,80 ; régional × 1,00 ; conférence × 1,15 ; national × 1,30 ; finale × 1,40. Chaque action est pondérée dans la phase où elle a été réalisée.</p>
        <p><strong>Régularité :</strong> moyenne des scores par match, lissée pour limiter l’effet des parcours courts, avec un bonus de participation plafonné à 10 % après huit matchs. Score final : total des scores / (matchs + 2) × (1 + 0,10 × min(matchs / 8, 1)). Un joueur éliminé tôt peut remporter un prix de performance.</p>
      </>}
    </>}
    <div className="awards-rules-grid">
      <article><h3>Attaquant</h3>{phaseTotal ? <p>Les trois premiers buts par match comptent pleinement ; les suivants comptent pour 25 %. Score du match : coefficient de phase × (2 + max(0, 6 × buts ajustés − 0,25 × tirs manqués + 10 × buts ajustés / (buts ajustés + tirs manqués + 5))).</p> : phaseAverage ? <p>Dans chaque match, les trois premiers buts comptent pleinement ; les suivants comptent pour 25 %. Score : 2 + coefficient de phase × max(0, 6 × buts ajustés − 0,25 × tirs manqués + 10 × buts ajustés / (buts ajustés + tirs manqués + 5)).</p> : <p>6 points par but, −0,25 par tir manqué, 2 par match, plus 10 × buts / (tirs + 5). Score plancher : 0.</p>}<small>Seule la performance offensive compte.</small></article>
      <article><h3>Défenseur</h3>{phaseTotal ? <p>Score du match : coefficient de phase × (2 points de participation + 5 × interventions). Les actions offensives ne comptent pas.</p> : phaseAverage ? <p>Dans chaque match : 2 points de participation + 5 × interventions × coefficient de phase. Les actions offensives ne comptent pas.</p> : <p>4 points par intervention, 2 par match, plus 4 × interventions / (matchs + 3).</p>}<small>Seule la performance défensive compte.</small></article>
      <article><h3>Meilleur joueur</h3><p>Les scores d’attaque et de défense sont ramenés sur une échelle de 100 par rapport aux meilleurs scores éligibles de la saison. Pondération : 65 % pour le poste effectif, 35 % pour l’autre domaine.</p><small>Classement commun au Ballon d’Or et aux conférences.</small></article>
    </div>
    <p><strong>Vote du jury :</strong> une variation de ±2 % peut départager les performances proches. Elle est fixée pour chaque prix de l’édition.</p>
    <p><strong>Prix de volume :</strong> Soulier d’Or = le plus de buts ; Bouclier d’Or = le plus d’interventions. Aucun vote aléatoire et aucun seuil de participation, dès une action enregistrée. À égalité : le plus de matchs, puis un identifiant stable. Les prix de performance suivent le même départage après le score final.</p>
  </details>
}

export function TrophiesPage() {
  const app = useOptionalCupApp()
  const [params, setParams] = useSearchParams()
  const activeYear = app?.session ? app.session.seasonYear ?? parseSeasonYear(app.session.seed) : null
  const seasons = useMemo(() => {
    const years = new Set((app?.archives ?? []).map(a => a.year))
    if (activeYear) years.add(activeYear)
    return [...years].sort((a, b) => b - a)
  }, [app?.archives, activeYear])
  const requested = Number(params.get('saison'))
  const selectedYear = seasons.includes(requested) ? requested : seasons[0]
  const source = selectedYear === activeYear ? app?.session : app?.archives.find(a => a.year === selectedYear)
  const [detail, setDetail] = useState<{ source: SeasonArchive; archive?: SeasonArchive; error?: string } | null>(null)
  const needsDetail = source && 'summaryOnly' in source && source.summaryOnly && !source.individualAwards
  useEffect(() => {
    if (!needsDetail || !source || !('year' in source)) return
    let current = true
    void cupRepository.loadArchive(source.year).then(archive => {
      if (current) setDetail({ source, archive, error: archive ? undefined : 'Cette archive est introuvable.' })
    }, (reason: unknown) => { if (current) setDetail({ source, error: reason instanceof Error ? reason.message : 'Archive indisponible.' }) })
    return () => { current = false }
  }, [source, needsDetail])
  const season = needsDetail ? (detail?.source === source ? detail.archive : undefined) : source
  const snapshot = useMemo(() => season ? getSeasonAwards(season) : null, [season])
  const loading = needsDetail && detail?.source !== source
  const archiveError = needsDetail && detail?.source === source ? detail.error : null
  const [dbHonors, setDbHonors] = useState<PlayerSeasonHonor[]>([])
  useEffect(() => {
    if (cupRepository.loadPlayerSeasonHonors) {
      void cupRepository.loadPlayerSeasonHonors().then(setDbHonors).catch(() => {})
    }
  }, [])
  const pastHonorsMap = useMemo(() => {
    if (!snapshot) return undefined
    return buildPastHonorsMap({
      ceremonyYear: snapshot.year,
      archives: app?.archives ?? [],
      persons: app?.persons ?? [],
      playerSeasonHonors: dbHonors,
    })
  }, [snapshot, app?.archives, app?.persons, dbHonors])

  return <section className="trophies-page cup-ready">
    <header className="awards-page-header">
      <div><p className="eyebrow">Coupe des communes · Remise des prix</p><h1>La nuit des trophées</h1><p>Les saisons s’achèvent. Les noms restent.</p></div>
      {seasons.length > 0 && <label className="award-season-select">Édition<select value={selectedYear} onChange={e => { const next = new URLSearchParams(params); next.set('saison', e.target.value); setParams(next) }}>{seasons.map(year => <option value={year} key={year}>{year}{year === activeYear ? ' · Saison actuelle' : ''}</option>)}</select></label>}
    </header>
    {loading ? <p className="status-panel">Préparation des archives de cette édition…</p>
      : archiveError ? <p role="alert" className="status-panel">{archiveError}</p>
      : !season ? <div className="awards-waiting"><span aria-hidden="true">✦</span><h2>La scène attend sa première saison</h2><p>Lance une Coupe pour préparer la remise des prix.</p><Link className="btn-primary" to="/coupe">Aller à la Coupe</Link></div>
      : !isSeasonComplete(season) ? <div className="awards-waiting"><span aria-hidden="true">✉</span><h2>Les enveloppes sont encore scellées</h2><p>La cérémonie {selectedYear} sera disponible après la finale nationale. Chaque match compte encore.</p><Link className="btn-primary" to="/coupe">Poursuivre la Coupe</Link></div>
      : snapshot ? <><div className="awards-edition-info"><span>Édition {snapshot.year}</span><span>{snapshot.awards.length} distinctions</span><span>Finale jouée · Le jury est prêt</span></div><AwardsCeremony key={`${season.seed}-${snapshot.year}`} snapshot={snapshot} pastHonorsMap={pastHonorsMap} storageKey={`coupe-awards-v1:${snapshot.year}:${season.seed}:${'nationalChampionId' in season ? season.nationalChampionId : season.championId ?? season.history.find(m => m.roundNumber === 14)?.result.winnerId ?? season.results[season.round.matches[0]?.id]?.winnerId ?? ''}`} /></>
      : <div className="awards-waiting"><h2>Statistiques individuelles indisponibles</h2><p>Cette ancienne édition ne conserve pas l’effectif nécessaire au calcul. Aucun lauréat n’a été inventé.</p></div>}
    <ScoringRules minimumMatches={snapshot?.minimumMatches} phaseAverage={!snapshot || Boolean(snapshot.scoringMethod)} phaseTotal={!snapshot || snapshot.scoringMethod === 'PHASE_TOTAL'} />
  </section>
}
