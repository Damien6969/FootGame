import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { useOptionalCupApp } from '../../app/CupAppContext'
import { conferenceLabel } from '../geography/territoryLabels'
import type { AwardPlayer, SeasonAward, SeasonAwards } from './types'
import { sanitizeSeasonAwards } from './seasonAwards'
import {
  PlayerPastHonorsBadge,
  buildPastHonorsMap,
  type PlayerPastHonorsSummary,
} from './PlayerPastHonors'
import './awards.css'

const stages = { YOUTH: '01 · La relève', CONFERENCE: '02 · Les conférences', NATIONAL: '03 · Les étoiles de la saison', FINAL: '04 · Le sacre individuel' }
const number = (n: number) => n.toLocaleString('fr-FR', { maximumFractionDigits: 1 })

export function formatNomineeStatus(player: AwardPlayer): string {
  if (player.isChampion) return 'Champion 🏆'
  if (player.eliminationStageLabel) return player.eliminationStageLabel
  if (player.eliminatedInRound === 14) return 'Éliminé en finale'
  if (player.eliminatedInRound) return `Éliminé au Tour ${player.eliminatedInRound}`
  return ''
}

function AwardWinner({
  player,
  award,
  pastHonorsMap,
}: {
  player: AwardPlayer
  award: SeasonAward
  pastHonorsMap?: Map<string, PlayerPastHonorsSummary>
}) {
  const specialist = award.metric === 'ATTACK' || award.metric === 'DEFENSE'
  const attack = award.metric === 'ATTACK'
  const jury = player.juryAdjustment ?? 0
  const status = formatNomineeStatus(player)
  return <article className="award-winner">
    <div className="award-avatar" aria-hidden="true">{player.firstName[0]}{player.lastName[0]}</div>
    <p className="award-winner-label">Le prix est décerné à</p>
    <h3 className="award-winner-title">
      <Link to={`/personnes/${encodeURIComponent(player.personId)}`}>{player.firstName} {player.lastName}</Link>
      <PlayerPastHonorsBadge
        personId={player.personId}
        pastHonorsMap={pastHonorsMap}
        isConferenceStage={award.stage === 'CONFERENCE'}
        size="large"
      />
    </h3>
    <p><Link to={`/equipes/${encodeURIComponent(player.clubId)}`}>{player.clubName}</Link> · {player.age} ans{status ? ` · ${status}` : ''}</p>
    <div className="award-stat-strip">
      <span><strong>{player.matchesPlayed}</strong> matchs</span>
      {(!specialist || attack) && <span><strong>{player.goals}</strong> buts</span>}
      {(!specialist || !attack) && <span><strong>{player.defensiveStops}</strong> interventions</span>}
      {specialist && attack && <span><strong>{player.shots}</strong> tirs</span>}
    </div>
    <p className="award-score">
      {award.metric === 'GOALS' ? `${player.goals} buts sur la Coupe` : award.metric === 'STOPS' ? `${player.defensiveStops} interventions sur la Coupe` : <>
        {number(player.awardScore ?? 0)} points après vote du jury
        <span>Vote : {jury >= 0 ? '+' : '−'}{number(Math.abs(jury) * 100)} % · {award.metric === 'OVERALL' ? '65 % spécialité / 35 % complément' : attack ? 'Performance offensive' : 'Performance défensive'}</span>
      </>}
    </p>
  </article>
}

export type CeremonyStep =
  | {
      kind: 'GROUP'
      id: string
      stage: SeasonAward['stage']
      title: string
      subtitle: string
      awards: SeasonAward[]
      legacyStepCount: number
    }
  | {
      kind: 'SPECIALISTS'
      id: string
      stage: SeasonAward['stage']
      title: string
      subtitle: string
      defenderAward: SeasonAward
      attackerAward: SeasonAward
      defenderWinner?: AwardPlayer
      attackerWinner?: AwardPlayer
    }
  | {
      kind: 'SINGLE'
      id: string
      stage: SeasonAward['stage']
      award: SeasonAward
      winner?: AwardPlayer
    }

export function AwardsCeremony({
  snapshot: rawSnapshot,
  storageKey,
  pastHonorsMap: explicitPastHonorsMap,
}: {
  snapshot: SeasonAwards
  storageKey: string
  pastHonorsMap?: Map<string, PlayerPastHonorsSummary>
}) {
  const app = useOptionalCupApp()
  const snapshot = useMemo(() => sanitizeSeasonAwards(rawSnapshot)!, [rawSnapshot])
  const pastHonorsMap = useMemo(() => {
    if (explicitPastHonorsMap) return explicitPastHonorsMap
    if (!app) return undefined
    return buildPastHonorsMap({
      ceremonyYear: snapshot.year,
      archives: app.archives,
      persons: app.persons,
    })
  }, [explicitPastHonorsMap, app, snapshot.year])
  const steps = useMemo<CeremonyStep[]>(() => {
    const list: CeremonyStep[] = []
    const handledAwardIds = new Set<string>()
    const findAward = (id: string) => snapshot.awards.find(a => a.id === id)

    const addGroup = (id: string, stage: SeasonAward['stage'], title: string, subtitle: string, awardIds: string[]) => {
      const awards = awardIds.map(findAward).filter((a): a is SeasonAward => Boolean(a))
      for (const award of awards) handledAwardIds.add(award.id)
      if (awards.length === 1) {
        list.push({ kind: 'SINGLE', id: awards[0].id, stage, award: awards[0], winner: awards[0].winners[0] })
      } else if (awards.length > 1) {
        // The previous layout paired specialists, then revealed the overall winner.
        const legacyStepCount = Number(awards.some(a => a.metric === 'ATTACK' || a.metric === 'DEFENSE'))
          + Number(awards.some(a => a.metric === 'OVERALL'))
        list.push({ kind: 'GROUP', id, stage, title, subtitle, awards, legacyStepCount })
      }
    }

    // 1. All youth awards share one envelope.
    addGroup('youth', 'YOUTH', 'Les espoirs de la saison',
      'Moins de 23 ans · Meilleurs défenseur, attaquant et espoir.',
      ['young-defender', 'young-attacker', 'young-player'])

    // 2. Conferences
    const confIds = [...new Set(
      snapshot.awards
        .filter(a => a.stage === 'CONFERENCE' && a.conferenceId)
        .map(a => a.conferenceId!)
    )].sort()

    for (const confId of confIds) {
      const label = conferenceLabel(confId)
      addGroup(`conference-${confId}`, 'CONFERENCE', label,
        'Meilleurs défenseur, attaquant et joueur de la conférence.',
        [`conference-${confId}-defender`, `conference-${confId}-attacker`, `conference-${confId}-player`])
    }

    // 3. National Volume Awards
    const scorer = findAward('top-scorer')
    if (scorer) {
      handledAwardIds.add(scorer.id)
      list.push({ kind: 'SINGLE', id: scorer.id, stage: 'NATIONAL', award: scorer, winner: scorer.winners[0] })
    }
    const stops = findAward('top-stops')
    if (stops) {
      handledAwardIds.add(stops.id)
      list.push({ kind: 'SINGLE', id: stops.id, stage: 'NATIONAL', award: stops, winner: stops.winners[0] })
    }

    // 4. National Specialists
    const bestDef = findAward('best-defender')
    const bestAtk = findAward('best-attacker')
    if (bestDef && bestAtk) {
      handledAwardIds.add(bestDef.id).add(bestAtk.id)
      list.push({
        kind: 'SPECIALISTS',
        id: 'specialists-national',
        stage: 'NATIONAL',
        title: 'Meilleurs défenseur & attaquant de la saison',
        subtitle: 'L’élite nationale · Les maîtres de la défense et de l’attaque.',
        defenderAward: bestDef,
        attackerAward: bestAtk,
        defenderWinner: bestDef.winners[0],
        attackerWinner: bestAtk.winners[0],
      })
    } else {
      if (bestAtk) {
        handledAwardIds.add(bestAtk.id)
        list.push({ kind: 'SINGLE', id: bestAtk.id, stage: 'NATIONAL', award: bestAtk, winner: bestAtk.winners[0] })
      }
      if (bestDef) {
        handledAwardIds.add(bestDef.id)
        list.push({ kind: 'SINGLE', id: bestDef.id, stage: 'NATIONAL', award: bestDef, winner: bestDef.winners[0] })
      }
    }

    // 5. Final: Ballon d'Or
    const ballonOr = findAward('ballon-or')
    if (ballonOr) {
      handledAwardIds.add(ballonOr.id)
      list.push({ kind: 'SINGLE', id: ballonOr.id, stage: 'FINAL', award: ballonOr, winner: ballonOr.winners[0] })
    }

    // 6. Fallback for any other awards (excluding legacy metric === 'TEAM')
    const stageOrder: Record<SeasonAward['stage'], number> = { YOUTH: 0, CONFERENCE: 1, NATIONAL: 2, FINAL: 3 }
    const unhandled = snapshot.awards
      .filter(a => !handledAwardIds.has(a.id) && a.metric !== 'TEAM')
      .sort((a, b) => stageOrder[a.stage] - stageOrder[b.stage])

    for (const award of unhandled) {
      list.push({
        kind: 'SINGLE',
        id: award.id,
        stage: award.stage,
        award,
        winner: award.winners[0],
      })
    }

    return list
  }, [snapshot])

  const readProgress = () => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) ?? '0')
      if (saved?.version === 2) {
        const n = saved.revealedCount
        return Number.isInteger(n) && n >= 0 ? Math.min(n, steps.length) : 0
      }
      if (!Number.isInteger(saved) || saved < 0) return 0
      // A partially revealed old group is replayed so unseen awards are not skipped.
      let oldCount = 0
      let newCount = 0
      for (const step of steps) {
        oldCount += step.kind === 'GROUP' ? step.legacyStepCount : 1
        if (oldCount > saved) break
        newCount++
      }
      return newCount
    } catch { return 0 }
  }
  const [revealedCount, setRevealedCount] = useState(readProgress)
  const [cursor, setCursor] = useState(() => Math.min(readProgress(), Math.max(0, steps.length - 1)))
  const [opening, setOpening] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const stageRef = useRef<HTMLElement>(null)
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])
  useEffect(() => { try { localStorage.setItem(storageKey, JSON.stringify({ version: 2, revealedCount })) } catch { /* La cérémonie reste utilisable sans stockage local. */ } }, [storageKey, revealedCount])
  useEffect(() => {
    if (cursor > 0) stageRef.current?.scrollIntoView?.({ behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' })
  }, [cursor])
  const step = steps[cursor]
  if (!step) return <p className="status-panel">Aucune distinction disponible pour cette édition.</p>
  const revealed = revealedCount > cursor
  const complete = revealedCount === steps.length

  const revealedAwards = useMemo(() => {
    const revealedSteps = steps.slice(0, revealedCount)
    const set = new Set<string>()
    const list: SeasonAward[] = []
    for (const s of revealedSteps) {
      if (s.kind === 'GROUP') {
        for (const award of s.awards) {
          if (!set.has(award.id)) { set.add(award.id); list.push(award) }
        }
      } else if (s.kind === 'SPECIALISTS') {
        if (!set.has(s.defenderAward.id)) { set.add(s.defenderAward.id); list.push(s.defenderAward) }
        if (!set.has(s.attackerAward.id)) { set.add(s.attackerAward.id); list.push(s.attackerAward) }
      } else {
        if (!set.has(s.award.id)) { set.add(s.award.id); list.push(s.award) }
      }
    }
    return list
  }, [steps, revealedCount])

  const openEnvelope = () => {
    if (opening || revealed) return
    setOpening(true)
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    timer.current = setTimeout(() => { setRevealedCount(n => Math.max(n, cursor + 1)); setOpening(false) }, reduced ? 0 : 1100)
  }
  const replay = () => {
    if (timer.current) clearTimeout(timer.current)
    setOpening(false)
    setRevealedCount(0)
    setCursor(0)
  }

  const renderNomineePill = (p: AwardPlayer) => {
    const status = formatNomineeStatus(p)
    const clubInfo = status ? `${p.clubName} · ${status}` : p.clubName
    return (
      <span
        key={p.personId}
        className="award-nominee-pill"
        title={`${p.firstName} ${p.lastName} — ${p.clubName}${status ? ` (${status})` : ''}`}
      >
        <strong className="award-nominee-name">{p.firstName} {p.lastName}</strong>
        <PlayerPastHonorsBadge
          personId={p.personId}
          pastHonorsMap={pastHonorsMap}
          isConferenceStage={step.stage === 'CONFERENCE'}
        />
        <span className="award-nominee-club"> ({clubInfo})</span>
      </span>
    )
  }

  const stageTitle = step.kind !== 'SINGLE' ? step.title : step.award.title
  const stageSubtitle = step.kind !== 'SINGLE'
    ? step.subtitle
    : step.stage === 'FINAL'
      ? 'Le joueur le plus complet de la Coupe.'
      : step.stage === 'YOUTH'
        ? 'Moins de 23 ans, déjà une saison à raconter.'
        : 'Une saison de performances. Un nom à retenir.'

  return <div className="awards-ceremony">
    <div className="ceremony-toolbar">
      <span>{revealedCount} / {steps.length} révélations</span>
      <button className="btn-secondary" onClick={replay}>Rejouer la cérémonie</button>
    </div>
    <div className="ceremony-progress" role="progressbar" aria-label="Progression de la cérémonie" aria-valuemin={0} aria-valuemax={steps.length} aria-valuenow={revealedCount}>
      <span style={{ width: `${100 * revealedCount / steps.length}%` }} />
    </div>
    <section ref={stageRef} className={`award-stage ${step.stage === 'FINAL' ? 'award-stage--final' : ''}`} aria-label="Scène de remise des prix">
      <div className="award-stage-lights" aria-hidden="true" />
      <p className="eyebrow">{stages[step.stage]}</p>
      <h2>{stageTitle}</h2>
      <p className="award-subtitle">{stageSubtitle}</p>
      <div className="award-reveal-area" aria-live="polite" aria-atomic="true" key={step.id}>
        {!revealed ? (
          <div className={`award-sealed ${opening ? 'is-opening' : ''}`}>
            <div className="award-envelope" aria-hidden="true"><span>✦</span></div>
            <p>{opening ? 'Le jury a rendu son verdict…' : 'Les noms attendent dans l’enveloppe.'}</p>
            {step.kind === 'GROUP' ? (
              <div className="award-group-nominees">
                {step.awards.map(award => award.nominees.length > 0 && (
                  <div className="award-nominees" key={award.id}>
                    <p>{award.title} · Nommés par ordre alphabétique</p>
                    {award.nominees.map(renderNomineePill)}
                  </div>
                ))}
              </div>
            ) : step.kind === 'SPECIALISTS' ? (
              <div className="award-specialists-nominees">
                {step.defenderAward.nominees.length > 0 && (
                  <div className="award-nominees">
                    <p>Nommés en défense · ordre alphabétique</p>
                    {step.defenderAward.nominees.map(renderNomineePill)}
                  </div>
                )}
                {step.attackerAward.nominees.length > 0 && (
                  <div className="award-nominees">
                    <p>Nommés en attaque · ordre alphabétique</p>
                    {step.attackerAward.nominees.map(renderNomineePill)}
                  </div>
                )}
              </div>
            ) : step.award.nominees.length > 1 ? (
              <div className="award-nominees">
                <p>Nommés · ordre alphabétique</p>
                {step.award.nominees.map(renderNomineePill)}
              </div>
            ) : null}
          </div>
        ) : step.kind === 'GROUP' ? (
          <>
            <div className="award-sparkles" aria-hidden="true">{Array.from({ length: 16 }, (_, i) => <i key={i} style={{ '--particle': i } as CSSProperties} />)}</div>
            <div className="award-group-winners">
              {step.awards.map(award => <section key={award.id} className={`award-group-card ${award.metric === 'OVERALL' ? 'award-group-card--best' : ''}`} aria-label={award.title}>
                <h3 className="award-category-title">{award.title}</h3>
                {award.winners[0] ? <AwardWinner player={award.winners[0]} award={award} pastHonorsMap={pastHonorsMap} /> : (
                  <div className="award-empty"><span aria-hidden="true">✧</span><p>Prix non attribué</p></div>
                )}
                {award.nominees.length > 1 && <details className="award-group-runners-up">
                  <summary>Autres nommés</summary>
                  <div className="award-nominees">
                    {award.nominees.filter(p => p.personId !== award.winners[0]?.personId).map(renderNomineePill)}
                  </div>
                </details>}
              </section>)}
            </div>
          </>
        ) : step.kind === 'SPECIALISTS' ? (
          <>
            <div className="award-sparkles" aria-hidden="true">{Array.from({ length: 16 }, (_, i) => <i key={i} style={{ '--particle': i } as CSSProperties} />)}</div>
            <div className="award-specialists-winners">
              {step.defenderWinner ? (
                <AwardWinner player={step.defenderWinner} award={step.defenderAward} pastHonorsMap={pastHonorsMap} />
              ) : (
                <div className="award-empty"><span aria-hidden="true">✧</span><h3>Défenseur non attribué</h3></div>
              )}
              {step.attackerWinner ? (
                <AwardWinner player={step.attackerWinner} award={step.attackerAward} pastHonorsMap={pastHonorsMap} />
              ) : (
                <div className="award-empty"><span aria-hidden="true">✧</span><h3>Attaquant non attribué</h3></div>
              )}
            </div>
            <div role="region" className="award-pitch" aria-label="Composition du duo défense & attaque">
              <div className="award-pitch-row">
                <p>Défenseur lauréat</p>
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                  {step.defenderWinner ? (
                    <div className="award-team-slot is-revealed">
                      <span aria-hidden="true">{step.defenderWinner.firstName[0]}{step.defenderWinner.lastName[0]}</span>
                      <div className="award-team-slot-title">
                        <Link to={`/personnes/${encodeURIComponent(step.defenderWinner.personId)}`}>{step.defenderWinner.firstName} {step.defenderWinner.lastName}</Link>
                        <PlayerPastHonorsBadge personId={step.defenderWinner.personId} pastHonorsMap={pastHonorsMap} isConferenceStage={false} />
                      </div>
                      <small>{step.defenderWinner.clubName}</small>
                    </div>
                  ) : (
                    <div className="award-team-slot"><span aria-hidden="true">✧</span><small>Place non attribuée</small></div>
                  )}
                </div>
              </div>
              <div className="award-pitch-row">
                <p>Attaquant lauréat</p>
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                  {step.attackerWinner ? (
                    <div className="award-team-slot is-revealed">
                      <span aria-hidden="true">{step.attackerWinner.firstName[0]}{step.attackerWinner.lastName[0]}</span>
                      <div className="award-team-slot-title">
                        <Link to={`/personnes/${encodeURIComponent(step.attackerWinner.personId)}`}>{step.attackerWinner.firstName} {step.attackerWinner.lastName}</Link>
                        <PlayerPastHonorsBadge personId={step.attackerWinner.personId} pastHonorsMap={pastHonorsMap} isConferenceStage={false} />
                      </div>
                      <small>{step.attackerWinner.clubName}</small>
                    </div>
                  ) : (
                    <div className="award-team-slot"><span aria-hidden="true">✧</span><small>Place non attribuée</small></div>
                  )}
                </div>
              </div>
            </div>
            <div className="award-specialists-nominees award-nominees--podium">
              {step.defenderAward.nominees.length > 1 && (
                <div className="award-nominees">
                  <p>Étaient également nommés en défense</p>
                  {step.defenderAward.nominees.filter(p => p.personId !== step.defenderWinner?.personId).map(renderNomineePill)}
                </div>
              )}
              {step.attackerAward.nominees.length > 1 && (
                <div className="award-nominees">
                  <p>Étaient également nommés en attaque</p>
                  {step.attackerAward.nominees.filter(p => p.personId !== step.attackerWinner?.personId).map(renderNomineePill)}
                </div>
              )}
            </div>
          </>
        ) : step.winner ? (
          <>
            <div className="award-sparkles" aria-hidden="true">{Array.from({ length: 16 }, (_, i) => <i key={i} style={{ '--particle': i } as CSSProperties} />)}</div>
            <AwardWinner player={step.winner} award={step.award} pastHonorsMap={pastHonorsMap} />
            {step.award.nominees.length > 1 && (
              <div className="award-nominees award-nominees--podium">
                <p>Étaient également nommés</p>
                {step.award.nominees.filter(p => p.personId !== step.winner?.personId).map(renderNomineePill)}
              </div>
            )}
          </>
        ) : (
          <div className="award-empty"><span aria-hidden="true">✧</span><h3>Prix non attribué</h3><p>Aucun joueur ne remplit les conditions de cette catégorie.</p></div>
        )}
      </div>
      <div className="award-controls">
        {!revealed ? (
          <button className="btn award-open-button" disabled={opening} onClick={openEnvelope}>
            {opening ? 'Révélation en cours…' : 'Ouvrir l’enveloppe ✦'}
          </button>
        ) : cursor < steps.length - 1 ? (
          <button className="btn award-open-button" onClick={() => setCursor(c => c + 1)}>
            Prix suivant →
          </button>
        ) : (
          <p className="ceremony-complete">La cérémonie est terminée. Rendez-vous la saison prochaine !</p>
        )}
      </div>
    </section>
    {revealedAwards.length > 0 && <section className="award-recap">
      <h2>{complete ? 'Le livre d’or de la saison' : 'Déjà récompensés'}</h2>
      <p>{complete ? 'Les distinctions sont inscrites au palmarès de chaque joueur.' : 'Les prochains lauréats restent dans leurs enveloppes.'}</p>
      <div className="award-recap-grid">{revealedAwards.map(a => {
        const winner = a.winners[0]
        return <article key={a.id}>
          <h3>{a.title}</h3>
          {winner ? (
            <p key={winner.personId}>
              <Link to={`/personnes/${encodeURIComponent(winner.personId)}`}>{winner.firstName} {winner.lastName}</Link>
              <PlayerPastHonorsBadge personId={winner.personId} pastHonorsMap={pastHonorsMap} isConferenceStage={a.stage === 'CONFERENCE'} />
              <small>{winner.clubName}{formatNomineeStatus(winner) ? ` · ${formatNomineeStatus(winner)}` : ''}</small>
            </p>
          ) : <p>Non attribué</p>}
        </article>
      })}</div>
    </section>}
  </div>
}
