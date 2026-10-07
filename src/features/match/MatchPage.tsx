import { MatchTeamSummary, MatchLineups, MatchEventDetail } from './MatchPresentation';
import { MatchBoxScore } from './MatchBoxScore';
import './match-view.css';
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { findMatchContext } from "../cup/cupSelectors";
import { loadGeography } from "../geography/loadGeography";
import type { GeographyDataset } from "../geography/types";
import { cupRepository, type CupSession, type SeasonArchive } from "../storage/cupRepository";
import { archiveClubs } from '../history/archiveClubs';
import {
  simulateMatch,
  isMatchUpset,
  type MatchResult,
} from "./simulateMatch";
import { replayState, visibleEventCount } from "./matchReplay";
import { useOptionalCupApp } from "../../app/CupAppContext";
import type { Club } from "../teams/types";
import { buildClubsFromCommunes } from "../teams/clubGenerator";
import { phaseLabel } from '../competition/phaseLabels';
import { getRoundBadgeClass } from '../competition/echelonColors';
import { getClubActiveStarters } from "../persons/personSelectors";
import { useDetailedArchives } from '../storage/useDetailedArchives';

export function MatchPage() {
  const { matchId = "" } = useParams();
  const id = decodeURIComponent(matchId);
  const appContext = useOptionalCupApp();
  const [searchParams] = useSearchParams();
  const requestedSeason = searchParams.get('saison');

  const [localData, setLocalData] = useState<GeographyDataset>();
  const [localSession, setLocalSession] = useState<CupSession>();
  const [localArchives, setLocalArchives] = useState<SeasonArchive[]>([]);
  const [revealed, setRevealed] = useState(-1);
  const [auto, setAuto] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const saving = useRef(false);
  useEffect(() => { setRevealed(-1); setAuto(false); setSaveError(false); }, [id, requestedSeason]);

  useEffect(() => {
    if (appContext?.dataset && appContext?.session) return;
    void Promise.all([loadGeography(), cupRepository.load(), cupRepository.loadArchives()]).then(
      ([dataset, saved, archives]) => {
        setLocalData(dataset);
        setLocalSession(saved);
        setLocalArchives(archives);
      },
    );
  }, [appContext]);

  const data = appContext?.dataset ?? localData;
  const activeSession = appContext?.session ?? localSession;
  const { archives: allArchives, loading: archivesLoading, error: archivesError } = useDetailedArchives(appContext?.archives ?? localArchives);
  const archive = allArchives.find((item) => String(item.year) === requestedSeason);
  const session: CupSession | undefined = archive ? {
    id: 'active', seed: archive.seed, seasonYear: archive.year, datasetVersion: archive.datasetVersion,
    activeTeamIds: [archive.nationalChampionId], championId: archive.nationalChampionId,
    roundNumber: Math.max(1, ...archive.history.map((match) => match.roundNumber)),
    round: { matches: [], byeTeamIds: [] }, results: {}, history: archive.history,
  } : (!requestedSeason || String(activeSession?.seasonYear) === requestedSeason ? activeSession ?? undefined : undefined);
  const context = session ? findMatchContext(session, id) : undefined;
  const byId = useMemo(
    () => archive && data ? archiveClubs(archive, data) : appContext?.clubsById ?? (data ? new Map(buildClubsFromCommunes(data.communes).map((t) => [t.id, t])) : new Map<string, Club>()),
    [appContext?.clubsById, data, archive],
  );
  const home = context ? byId.get(context.match.homeTeamId) : undefined;
  const away = context ? byId.get(context.match.awayTeamId) : undefined;

  const persons = useMemo(() => {
    return archive?.persons ?? appContext?.persons ?? activeSession?.persons ?? [];
  }, [archive?.persons, appContext?.persons, activeSession?.persons]);

  const homeStarters = useMemo(() => {
    if (!home || persons.length === 0) return undefined;
    return getClubActiveStarters(persons, home.id);
  }, [home, persons]);

  const awayStarters = useMemo(() => {
    if (!away || persons.length === 0) return undefined;
    return getClubActiveStarters(persons, away.id);
  }, [away, persons]);

  const generated = useMemo<MatchResult | undefined>(() => {
    if (!data || !session || !context || !home || !away) return;
    if (context.result) return context.result;
    const pops = data.communes.map((t) => t.population);
    return simulateMatch({
      matchId: id,
      rootSeed: session.seed,
      home,
      away,
      populationBounds: { min: Math.min(...pops), max: Math.max(...pops) },
      homeStarters,
      awayStarters,
    });
  }, [data, session, context, home, away, id, homeStarters, awayStarters]);
  const total = generated?.events.length ?? 0;
  const persistFinished = async (result: MatchResult) => {
    if (!session || archive || context?.result || !context?.round.isCurrent || saving.current) return;
    saving.current = true;
    setSaveError(false);
    const next = { ...session, results: { ...session.results, [id]: result } };
    try {
    if (appContext) {
      await appContext.persistSession(next);
    } else {
      await cupRepository.save(next);
      setLocalSession(next);
    }
    } catch { setSaveError(true); }
    finally { saving.current = false; }
  };
  useEffect(() => {
    if (!auto || !generated) return;
    if (revealed >= total) {
      setAuto(false);
      persistFinished(generated);
      return;
    }
    const timer = window.setTimeout(
      () => setRevealed(Math.min(total, Math.max(0, revealed) + 1)),
      650,
    );
    return () => clearTimeout(timer);
  }, [auto, revealed, total, generated]);
  const currentSeasonYear = session?.seasonYear ?? 2026;

  const h2hMatches = useMemo(() => {
    if (!home || !away) return [];
    const list: Array<{
      matchId: string;
      seasonYear: number;
      roundNumber: number;
      homeTeamId: string;
      awayTeamId: string;
      homeTeamName: string;
      awayTeamName: string;
      homeScore: number;
      awayScore: number;
      winnerId: string;
      isExtraTime?: boolean;
    }> = [];

    const addMatch = (
      mId: string,
      year: number,
      roundNum: number,
      hId: string,
      aId: string,
      res: MatchResult
    ) => {
      if (mId === id && year === currentSeasonYear) return;
      if (
        (hId === home.id && aId === away.id) ||
        (hId === away.id && aId === home.id)
      ) {
        if (list.some((existing) => existing.matchId === mId && existing.seasonYear === year)) {
          return;
        }
        const hName = byId.get(hId)?.name ?? (hId === home.id ? home.name : away.name);
        const aName = byId.get(aId)?.name ?? (aId === home.id ? home.name : away.name);
        list.push({
          matchId: mId,
          seasonYear: year,
          roundNumber: roundNum,
          homeTeamId: hId,
          awayTeamId: aId,
          homeTeamName: hName,
          awayTeamName: aName,
          homeScore: res.homeScore,
          awayScore: res.awayScore,
          winnerId: res.winnerId,
          isExtraTime: res.isExtraTime,
        });
      }
    };

    // 1. From past archives
    for (const arch of allArchives) {
      if (arch.history) {
        for (const m of arch.history) {
          if (m.result) {
            addMatch(
              m.result.matchId || `arch:${arch.year}:${m.roundNumber}:${m.homeTeamId}:${m.awayTeamId}`,
              arch.year,
              m.roundNumber,
              m.homeTeamId,
              m.awayTeamId,
              m.result
            );
          }
        }
      }
    }

    // 2. From current session history
    if (session?.history) {
      for (const m of session.history) {
        if (m.result) {
          addMatch(
            m.result.matchId || `hist:${currentSeasonYear}:${m.roundNumber}:${m.homeTeamId}:${m.awayTeamId}`,
            currentSeasonYear,
            m.roundNumber,
            m.homeTeamId,
            m.awayTeamId,
            m.result
          );
        }
      }
    }

    // 3. From current session results (earlier rounds)
    if (session?.results) {
      for (const [mId, res] of Object.entries(session.results)) {
        const mContext = findMatchContext(session, mId);
        if (mContext) {
          addMatch(
            mId,
            currentSeasonYear,
            mContext.round.number,
            mContext.match.homeTeamId,
            mContext.match.awayTeamId,
            res
          );
        }
      }
    }

    return list.sort((a, b) => b.seasonYear - a.seasonYear || b.roundNumber - a.roundNumber);
  }, [allArchives, session, home, away, byId, currentSeasonYear, id]);

  const h2hStats = useMemo(() => {
    if (!home || !away || h2hMatches.length === 0) return null;
    const totalCount = h2hMatches.length;
    const homeWins = h2hMatches.filter((m) => m.winnerId === home.id).length;
    const awayWins = h2hMatches.filter((m) => m.winnerId === away.id).length;
    const homeWinPct = Math.round((homeWins / totalCount) * 100);
    const awayWinPct = Math.round((awayWins / totalCount) * 100);

    let homeGoals = 0;
    let awayGoals = 0;
    for (const m of h2hMatches) {
      if (m.homeTeamId === home.id) {
        homeGoals += m.homeScore;
        awayGoals += m.awayScore;
      } else {
        homeGoals += m.awayScore;
        awayGoals += m.homeScore;
      }
    }

    return {
      total: totalCount,
      homeWins,
      awayWins,
      homeWinPct,
      awayWinPct,
      homeGoals,
      awayGoals,
    };
  }, [h2hMatches, home, away]);
  if (!data || archivesLoading || (!session && !requestedSeason))
    return <section className="status-panel">Chargement du match…</section>;
  if (archivesError) return <section className="status-panel" role="alert">Archives indisponibles : {archivesError}</section>;
  if (!session || !context || !home || !away || !generated)
    return (
      <section className="status-panel">
        <h2>Match introuvable</h2>
        <Link to="/coupe">Retour à la Coupe</Link>
      </section>
    );
  const finished = Boolean(context.result);
  const visibleCount = visibleEventCount(finished, revealed, total);
  const replay = replayState(generated.events, visibleCount, home.id, away.id);
  const finish = () => {
    setRevealed(total);
    setAuto(false);
    persistFinished(generated);
  };
  return (
    <section className="match-page">
      <div className="match-topbar">
        <h1>Centre du match</h1>
        <Link to="/coupe">← Retour à la Coupe</Link>
        <span>
          Saison {session.seasonYear ?? 2026} · <span className={getRoundBadgeClass(context.round.number)}>Tour {context.round.number} · {phaseLabel(context.round.phase)}</span>
        </span>
      </div>
      <div className="scoreboard">
        <MatchTeamSummary team={home} side="home" historical={Boolean(archive && !archive.clubs)} effectiveStrength={generated.homeEffectiveStrength} showTrophies={!archive} />
        <div className="live-score">
          <span className="match-score--home">{visibleCount >= total ? generated.homeScore : replay.homeScore}</span>
          <i>–</i>
          <span className="match-score--away">{visibleCount >= total ? generated.awayScore : replay.awayScore}</span>
          <small aria-live="polite">
            {visibleCount >= total
              ? (generated.isExtraTime ? "TERMINÉ (a.p.)" : "TERMINÉ")
              : visibleCount === 0
                ? "Coup d’envoi"
                : `Match en cours · Action ${visibleCount}`}
          </small>
        </div>
        <MatchTeamSummary team={away} side="away" historical={Boolean(archive && !archive.clubs)} effectiveStrength={generated.awayEffectiveStrength} showTrophies={!archive} />
      </div>
      {visibleCount >= total && isMatchUpset(home, away, generated) && (
        <div className="match-exploit-banner" style={{
          margin: "var(--space-3) auto 0",
          maxWidth: "700px",
          padding: "var(--space-2) var(--space-4)",
          background: "linear-gradient(135deg, rgba(234, 179, 8, 0.15), rgba(245, 158, 11, 0.08))",
          border: "1px solid rgba(234, 179, 8, 0.4)",
          borderRadius: "var(--radius-md)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "8px",
          color: "#facc15",
          fontWeight: 700,
          fontSize: "0.95rem",
        }}>
          <span>⚡ Exploit !</span>
          <span>{generated.winnerId === home.id ? home.name : away.name} crée la surprise et élimine un adversaire hiérarchiquement supérieur !</span>
        </div>
      )}
      <div className="match-controls">
        <button
          disabled={visibleCount >= total}
          onClick={() => {
            const next = Math.min(total, visibleCount + 1);
            setRevealed(next);
            if (next >= total) { setAuto(false); void persistFinished(generated); }
          }}
        >
          Occasion suivante
        </button>
        <button
          disabled={visibleCount >= total}
          onClick={() => setAuto((value) => !value)}
        >
          {auto ? "Pause" : "Lecture automatique"}
        </button>
        <button disabled={visibleCount >= total} onClick={finish}>
          Terminer maintenant
        </button>
        {finished && visibleCount >= total && (
          <button onClick={() => setRevealed(0)}>Revoir depuis le début</button>
        )}
      </div>
      {saveError && <p role="alert">Le résultat n’a pas pu être enregistré. <button onClick={() => void persistFinished(generated)}>Réessayer l’enregistrement</button></p>}
      <MatchLineups home={home} away={away} homeStarters={homeStarters} awayStarters={awayStarters} />
      <MatchBoxScore
        home={home}
        away={away}
        homeStarters={homeStarters}
        awayStarters={awayStarters}
        events={visibleCount >= total ? generated.events : replay.events}
        allPersons={persons}
        homeEffectiveStrength={generated.homeEffectiveStrength}
        awayEffectiveStrength={generated.awayEffectiveStrength}
      />
      <div className="match-columns">
        <article className="event-feed">
          <h2>Film du match</h2>
          {replay.events.length === 0 ? (
            <p>Le match attend son coup d’envoi.</p>
          ) : (
            [...replay.events].reverse().map((event) => (
              <div
                className={`event event--${event.teamId === home.id ? 'home' : 'away'} ${event.kind === 'GOAL' ? 'event--goal' : ''}`}
                key={event.sequence}
              >
                <b className="match-event-time">{event.sequence * 7}’</b>
                <div className="match-event-body">
                  <span className="match-event-heading">
                    {event.kind === "GOAL" ? "⚽ But" : "🧤 Occasion"} ·{" "}
                    <strong className="match-event-team">{byId.get(event.teamId)?.name}</strong>
                  </span>
                  <MatchEventDetail event={event} homeId={home.id} />
                </div>
              </div>
            ))
          )}
        </article>
        <article className="h2h">
          <div className="h2h-header">
            <h2>Confrontations directes</h2>
            {h2hStats && (
              <span className="h2h-badge-count">
                {h2hStats.total} {h2hStats.total > 1 ? "rencontres" : "rencontre"}
              </span>
            )}
          </div>

          {!h2hStats || h2hMatches.length === 0 ? (
            <div className="h2h-empty-box">
              <span className="h2h-empty-icon">🤝</span>
              <p className="h2h-empty-title">Première confrontation officielle</p>
              <small className="h2h-empty-desc">
                Ces deux clubs ne se sont encore jamais affrontés en Coupe des communes.
              </small>
            </div>
          ) : (
            <>
              {/* Bilan & pourcentages de victoire */}
              <div className="h2h-summary-card">
                <div className="h2h-summary-teams">
                  <div className="h2h-team-stat is-home">
                    <span className="h2h-stat-name">{home.name}</span>
                    <span className="h2h-stat-score">
                      {h2hStats.homeWins} {h2hStats.homeWins > 1 ? "victoires" : "victoire"} ({h2hStats.homeWinPct}%)
                    </span>
                  </div>
                  <div className="h2h-vs-divider">VS</div>
                  <div className="h2h-team-stat is-away">
                    <span className="h2h-stat-name">{away.name}</span>
                    <span className="h2h-stat-score">
                      {h2hStats.awayWins} {h2hStats.awayWins > 1 ? "victoires" : "victoire"} ({h2hStats.awayWinPct}%)
                    </span>
                  </div>
                </div>

                {/* Barre de ratio visuel */}
                <div className="h2h-ratio-bar">
                  <div
                    className="h2h-ratio-fill is-home"
                    style={{ width: `${h2hStats.homeWinPct}%` }}
                    title={`${home.name} : ${h2hStats.homeWinPct}% de victoires`}
                  />
                  <div
                    className="h2h-ratio-fill is-away"
                    style={{ width: `${h2hStats.awayWinPct}%` }}
                    title={`${away.name} : ${h2hStats.awayWinPct}% de victoires`}
                  />
                </div>

                <div className="h2h-summary-goals">
                  <span>
                    Buts cumulés : <strong>{h2hStats.homeGoals}</strong> ({home.name}) – <strong>{h2hStats.awayGoals}</strong> ({away.name})
                  </span>
                </div>
              </div>

              {/* Liste détaillée des confrontations */}
              <div className="h2h-matches-list">
                {h2hMatches.map((item) => {
                  const winnerIsHome = item.winnerId === home.id;
                  const winnerIsAway = item.winnerId === away.id;
                  const winnerName = winnerIsHome ? home.name : (winnerIsAway ? away.name : (byId.get(item.winnerId)?.name ?? "Vainqueur"));

                  return (
                    <Link
                      key={item.matchId}
                      to={`/matchs/${encodeURIComponent(item.matchId)}?saison=${item.seasonYear}`}
                      className="h2h-match-card"
                      title="Consulter cette confrontation"
                    >
                      <div className="h2h-match-header">
                        <span className="h2h-season-badge">
                          📅 Saison {item.seasonYear} · Tour {item.roundNumber}
                        </span>
                        <span className={`h2h-winner-pill match-person--${winnerIsHome ? "home" : "away"}`}>
                          👑 Victoire {winnerName}
                          {item.isExtraTime && <span className="h2h-ot-tag">a.p.</span>}
                        </span>
                      </div>

                      <div className="h2h-match-scoreline">
                        <span className={`h2h-team match-person--${item.homeTeamId === home.id ? "home" : "away"} ${item.winnerId === item.homeTeamId ? "is-winner" : ""}`}>
                          {item.homeTeamName}
                        </span>
                        <span className="h2h-score-badge">
                          {item.homeScore} – {item.awayScore}
                        </span>
                        <span className={`h2h-team match-person--${item.awayTeamId === home.id ? "home" : "away"} ${item.winnerId === item.awayTeamId ? "is-winner" : ""}`}>
                          {item.awayTeamName}
                        </span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </>
          )}
        </article>
      </div>
    </section>
  );
}
