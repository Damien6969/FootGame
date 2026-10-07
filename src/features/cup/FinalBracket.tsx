import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import type { RoundView } from "./cupSelectors";
import type { Club } from "../teams/types";
import type { Commune } from "../geography/types";
import type { CupSession } from "../storage/cupRepository";
import { TeamTrophyBadges } from "../teams/TeamTrophyBadges";
import { departmentLabel } from "../geography/territoryLabels";
import { conferenceForRegion } from "../geography/loadGeography";
import type { CompetitionPhase } from "../competition/competition";
import { useOptionalCupApp } from "../../app/CupAppContext";
import { getRoundBadgeClass } from "../competition/echelonColors";

export type PalmaresRank = "national" | "conference" | "region" | "none";

export function getTeamPalmaresRank(
  teamId: string | undefined,
  teamRecords?: Map<string, any>,
  session?: CupSession | null
): PalmaresRank {
  if (!teamId) return "none";
  const rec = teamRecords?.get(teamId);

  // 1. Coupe de France (National) -> Doré
  if (rec && rec.nationalTitles > 0) return "national";
  if (session?.championId === teamId) return "national";

  // 2. Conférence -> Violet
  if (rec && rec.conferenceTitles > 0) return "conference";
  if (
    session?.conferenceChampionIds &&
    Object.values(session.conferenceChampionIds).includes(teamId)
  ) {
    return "conference";
  }

  // 3. Régional -> Vert
  if (rec && rec.regionTitles > 0) return "region";

  // 4. Départemental ou aucun -> None
  return "none";
}

const phaseLabels: Record<CompetitionPhase, string> = {
  DEPARTMENT: "Départemental",
  REGION: "Régional",
  CONFERENCE: "Conférences",
  NATIONAL: "National",
};

type FinalBracketProps = {
  rounds: readonly RoundView[];
  byId: Map<string, Club | Commune>;
  session?: CupSession | null;
  onRunAll?: () => void;
  onRunCompetition?: () => void;
  onAdvance?: () => void;
  isComplete?: boolean;
};

type BracketMatchNode = {
  matchIndex: number;
  matchId?: string;
  isPlayable: boolean;
  isCompleted: boolean;
  homeTeam?: Club | Commune;
  awayTeam?: Club | Commune;
  homePlaceholder?: string;
  awayPlaceholder?: string;
  homeScore?: number;
  awayScore?: number;
  winnerId?: string;
  isExtraTime?: boolean;
};

type BracketLevel = {
  level: number;
  title: string;
  matchCount: number;
  roundNumber: number;
  isCurrent: boolean;
  matches: BracketMatchNode[];
};

const CONFERENCE_DEFS = [
  {
    id: "CONF_NORD",
    name: "Conférence Nord",
    fullName: "Conférence Nord (Septentrion)",
    icon: "🛡️",
    badgeClass: "conf-badge-nord",
    boxClass: "conf-box-nord",
    accentColor: "#3b82f6",
    regions: "Hauts-de-France · Île-de-France · Grand Est",
  },
  {
    id: "CONF_OUEST",
    name: "Conférence Ouest",
    fullName: "Conférence Ouest (Atlantique)",
    icon: "🌊",
    badgeClass: "conf-badge-ouest",
    boxClass: "conf-box-ouest",
    accentColor: "#06b6d4",
    regions: "Bretagne · Pays de la Loire · Normandie · Centre-Val de Loire · Outre-mer atlantique",
  },
  {
    id: "CONF_SUD_OUEST",
    name: "Conférence Sud-Ouest",
    fullName: "Conférence Sud-Ouest",
    icon: "🍷",
    badgeClass: "conf-badge-sud-ouest",
    boxClass: "conf-box-sud-ouest",
    accentColor: "#f43f5e",
    regions: "Nouvelle-Aquitaine · Occitanie (Ouest)",
  },
  {
    id: "CONF_SUD_EST",
    name: "Conférence Sud-Est",
    fullName: "Conférence Sud-Est (Méditerranée & Alpes)",
    icon: "☀️",
    badgeClass: "conf-badge-sud-est",
    boxClass: "conf-box-sud-est",
    accentColor: "#f59e0b",
    regions: "Auvergne-Rhône-Alpes · PACA · Corse · Occitanie (Est)",
  },
] as const;

export function FinalBracket({
  rounds,
  byId,
  session,
}: FinalBracketProps) {
  const navigate = useNavigate();
  const appContext = useOptionalCupApp();
  const [searchParams, setSearchParams] = useSearchParams();
  const [highlightedTeamId, setHighlightedTeamId] = useState<string | null>(null);

  const confParam = searchParams.get("conf");
  const validConfIds = ["all", "CONF_NORD", "CONF_OUEST", "CONF_SUD_OUEST", "CONF_SUD_EST", "final-four"];
  const initialConf = confParam && validConfIds.includes(confParam) ? confParam : "all";
  const [activeConfFilter, setActiveConfFilter] = useState<string>(initialConf);

  useEffect(() => {
    if (confParam && validConfIds.includes(confParam)) {
      setActiveConfFilter(confParam);
    }
  }, [confParam]);

  const handleSelectConfFilter = (confId: string) => {
    setActiveConfFilter(confId);
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set("tab", "tableau-final");
        if (confId === "all") {
          next.delete("conf");
        } else {
          next.set("conf", confId);
        }
        return next;
      },
      { replace: true },
    );
  };

  const nationalRounds = useMemo(
    () =>
      rounds.filter(
        (round) =>
          round.phase === "NATIONAL" || round.phase === "CONFERENCE",
      ),
    [rounds],
  );

  const hasConferences = useMemo(
    () => rounds.some((round) => round.phase === "CONFERENCE"),
    [rounds],
  );

  // Current active round across bracket
  const currentRoundInBracket = useMemo(() => {
    return nationalRounds.find((r) => r.isCurrent);
  }, [nationalRounds]);

  const currentCompletedCount = currentRoundInBracket
    ? Object.keys(currentRoundInBracket.results).length
    : 0;
  const currentTotalCount = currentRoundInBracket?.matches.length ?? 0;

type ConferenceTreeData = {
  levels: BracketLevel[];
  champion?: Commune;
  championId?: string;
  isDone: boolean;
  completedCount: number;
  totalCount: number;
};

  // Build 4 conference trees when conference rounds are present
  const conferenceTrees = useMemo<Map<string, ConferenceTreeData>>(() => {
    if (!hasConferences) return new Map();

    const round9 = rounds.find((r) => r.number === 9);
    const round10 = rounds.find((r) => r.number === 10);
    const round11 = rounds.find((r) => r.number === 11);
    const round12 = rounds.find((r) => r.number === 12);

    const getMatchesForConf = (roundView: RoundView | undefined, confId: string) => {
      if (!roundView) return [];
      const list = roundView.matches.filter((m) => {
        if (m.id.includes(`:${confId}:`)) return true;
        const home = byId.get(m.homeTeamId);
        if (home?.conferenceId === confId) return true;
        if (home?.regionId && conferenceForRegion(home.regionId) === confId) return true;
        return false;
      });
      return [...list].sort((a, b) => {
        const numA = parseInt(a.id.split(":").pop() ?? "0", 10);
        const numB = parseInt(b.id.split(":").pop() ?? "0", 10);
        return (isNaN(numA) ? 0 : numA) - (isNaN(numB) ? 0 : numB);
      });
    };

    const trees = new Map<
      string,
      {
        levels: BracketLevel[];
        champion?: Commune;
        championId?: string;
        isDone: boolean;
        completedCount: number;
        totalCount: number;
      }
    >();

    for (const conf of CONFERENCE_DEFS) {
      const m9 = getMatchesForConf(round9, conf.id);
      const m10 = getMatchesForConf(round10, conf.id);
      const m11 = getMatchesForConf(round11, conf.id);
      const m12 = getMatchesForConf(round12, conf.id);

      // Level 0: 8es (8 matches)
      const l0Matches: BracketMatchNode[] = [];
      for (let m = 0; m < 8; m++) {
        const actual = m9[m];
        if (actual) {
          const res = round9?.results[actual.id];
          l0Matches.push({
            matchIndex: m,
            matchId: actual.id,
            isPlayable: Boolean(round9?.isCurrent && !res),
            isCompleted: Boolean(res),
            homeTeam: byId.get(actual.homeTeamId),
            awayTeam: byId.get(actual.awayTeamId),
            homeScore: res?.homeScore,
            awayScore: res?.awayScore,
            winnerId: res?.winnerId,
            isExtraTime: res?.isExtraTime,
          });
        } else {
          l0Matches.push({
            matchIndex: m,
            isPlayable: false,
            isCompleted: false,
            homePlaceholder: `8e #${m + 1}A`,
            awayPlaceholder: `8e #${m + 1}B`,
          });
        }
      }

      // Level 1: Quarts (4 matches fed by Level 0)
      const l1Matches: BracketMatchNode[] = [];
      for (let m = 0; m < 4; m++) {
        const actual = m10[m];
        if (actual) {
          const res = round10?.results[actual.id];
          l1Matches.push({
            matchIndex: m,
            matchId: actual.id,
            isPlayable: Boolean(round10?.isCurrent && !res),
            isCompleted: Boolean(res),
            homeTeam: byId.get(actual.homeTeamId),
            awayTeam: byId.get(actual.awayTeamId),
            homeScore: res?.homeScore,
            awayScore: res?.awayScore,
            winnerId: res?.winnerId,
            isExtraTime: res?.isExtraTime,
          });
        } else {
          const feederTop = l0Matches[2 * m];
          const feederBottom = l0Matches[2 * m + 1];
          const home = feederTop?.winnerId ? byId.get(feederTop.winnerId) : undefined;
          const away = feederBottom?.winnerId ? byId.get(feederBottom.winnerId) : undefined;
          l1Matches.push({
            matchIndex: m,
            isPlayable: false,
            isCompleted: false,
            homeTeam: home,
            awayTeam: away,
            homePlaceholder: home ? undefined : feederTop?.homeTeam ? `Vainqueur 8e #${2 * m + 1}` : `En attente 8e #${2 * m + 1}`,
            awayPlaceholder: away ? undefined : feederBottom?.homeTeam ? `Vainqueur 8e #${2 * m + 2}` : `En attente 8e #${2 * m + 2}`,
          });
        }
      }

      // Level 2: Demies (2 matches fed by Level 1)
      const l2Matches: BracketMatchNode[] = [];
      for (let m = 0; m < 2; m++) {
        const actual = m11[m];
        if (actual) {
          const res = round11?.results[actual.id];
          l2Matches.push({
            matchIndex: m,
            matchId: actual.id,
            isPlayable: Boolean(round11?.isCurrent && !res),
            isCompleted: Boolean(res),
            homeTeam: byId.get(actual.homeTeamId),
            awayTeam: byId.get(actual.awayTeamId),
            homeScore: res?.homeScore,
            awayScore: res?.awayScore,
            winnerId: res?.winnerId,
            isExtraTime: res?.isExtraTime,
          });
        } else {
          const feederTop = l1Matches[2 * m];
          const feederBottom = l1Matches[2 * m + 1];
          const home = feederTop?.winnerId ? byId.get(feederTop.winnerId) : undefined;
          const away = feederBottom?.winnerId ? byId.get(feederBottom.winnerId) : undefined;
          l2Matches.push({
            matchIndex: m,
            isPlayable: false,
            isCompleted: false,
            homeTeam: home,
            awayTeam: away,
            homePlaceholder: home ? undefined : `Vainqueur Quart #${2 * m + 1}`,
            awayPlaceholder: away ? undefined : `Vainqueur Quart #${2 * m + 2}`,
          });
        }
      }

      // Level 3: Finale (1 match fed by Level 2)
      const l3Matches: BracketMatchNode[] = [];
      const actual12 = m12[0];
      if (actual12) {
        const res = round12?.results[actual12.id];
        l3Matches.push({
          matchIndex: 0,
          matchId: actual12.id,
          isPlayable: Boolean(round12?.isCurrent && !res),
          isCompleted: Boolean(res),
          homeTeam: byId.get(actual12.homeTeamId),
          awayTeam: byId.get(actual12.awayTeamId),
          homeScore: res?.homeScore,
          awayScore: res?.awayScore,
          winnerId: res?.winnerId,
          isExtraTime: res?.isExtraTime,
        });
      } else {
        const feederTop = l2Matches[0];
        const feederBottom = l2Matches[1];
        const home = feederTop?.winnerId ? byId.get(feederTop.winnerId) : undefined;
        const away = feederBottom?.winnerId ? byId.get(feederBottom.winnerId) : undefined;
        l3Matches.push({
          matchIndex: 0,
          isPlayable: false,
          isCompleted: false,
          homeTeam: home,
          awayTeam: away,
          homePlaceholder: home ? undefined : "Vainqueur Demie 1",
          awayPlaceholder: away ? undefined : "Vainqueur Demie 2",
        });
      }

      const confWinnerId = l3Matches[0]?.winnerId;
      const champion = confWinnerId ? byId.get(confWinnerId) : undefined;

      const levels: BracketLevel[] = [
        { level: 0, title: "8es de Conférence", roundNumber: 9, matchCount: 8, isCurrent: Boolean(round9?.isCurrent), matches: l0Matches },
        { level: 1, title: "Quarts", roundNumber: 10, matchCount: 4, isCurrent: Boolean(round10?.isCurrent), matches: l1Matches },
        { level: 2, title: "Demi-finales", roundNumber: 11, matchCount: 2, isCurrent: Boolean(round11?.isCurrent), matches: l2Matches },
        { level: 3, title: "Finale de Conférence", roundNumber: 12, matchCount: 1, isCurrent: Boolean(round12?.isCurrent), matches: l3Matches },
      ];

      const completedCount =
        l0Matches.filter((m) => m.isCompleted).length +
        l1Matches.filter((m) => m.isCompleted).length +
        l2Matches.filter((m) => m.isCompleted).length +
        l3Matches.filter((m) => m.isCompleted).length;

      trees.set(conf.id, {
        levels,
        champion,
        championId: confWinnerId,
        isDone: Boolean(champion),
        completedCount,
        totalCount: 15, // 8 + 4 + 2 + 1
      });
    }

    return trees;
  }, [hasConferences, rounds, byId]);

  // Final Four National Tree (Tours 13 & 14)
  const finalFourTree = useMemo(() => {
    if (!hasConferences) return null;

    const round13 = rounds.find((r) => r.number === 13);
    const round14 = rounds.find((r) => r.number === 14);

    const champNord = conferenceTrees.get("CONF_NORD")?.champion;
    const champOuest = conferenceTrees.get("CONF_OUEST")?.champion;
    const champSudOuest = conferenceTrees.get("CONF_SUD_OUEST")?.champion;
    const champSudEst = conferenceTrees.get("CONF_SUD_EST")?.champion;

    // Demi-finales (Tour 13)
    // Match 0: Ouest vs Nord
    const actual13_0 = round13?.matches[0];
    const m13_0: BracketMatchNode = actual13_0
      ? {
          matchIndex: 0,
          matchId: actual13_0.id,
          isPlayable: Boolean(round13?.isCurrent && !round13.results[actual13_0.id]),
          isCompleted: Boolean(round13?.results[actual13_0.id]),
          homeTeam: byId.get(actual13_0.homeTeamId),
          awayTeam: byId.get(actual13_0.awayTeamId),
          homeScore: round13?.results[actual13_0.id]?.homeScore,
          awayScore: round13?.results[actual13_0.id]?.awayScore,
          winnerId: round13?.results[actual13_0.id]?.winnerId,
          isExtraTime: round13?.results[actual13_0.id]?.isExtraTime,
        }
      : {
          matchIndex: 0,
          isPlayable: false,
          isCompleted: false,
          homeTeam: champOuest,
          awayTeam: champNord,
          homePlaceholder: champOuest ? undefined : "Champion Ouest 🌊",
          awayPlaceholder: champNord ? undefined : "Champion Nord 🛡️",
        };

    // Match 1: Sud-Ouest vs Sud-Est
    const actual13_1 = round13?.matches[1];
    const m13_1: BracketMatchNode = actual13_1
      ? {
          matchIndex: 1,
          matchId: actual13_1.id,
          isPlayable: Boolean(round13?.isCurrent && !round13.results[actual13_1.id]),
          isCompleted: Boolean(round13?.results[actual13_1.id]),
          homeTeam: byId.get(actual13_1.homeTeamId),
          awayTeam: byId.get(actual13_1.awayTeamId),
          homeScore: round13?.results[actual13_1.id]?.homeScore,
          awayScore: round13?.results[actual13_1.id]?.awayScore,
          winnerId: round13?.results[actual13_1.id]?.winnerId,
          isExtraTime: round13?.results[actual13_1.id]?.isExtraTime,
        }
      : {
          matchIndex: 1,
          isPlayable: false,
          isCompleted: false,
          homeTeam: champSudOuest,
          awayTeam: champSudEst,
          homePlaceholder: champSudOuest ? undefined : "Champion Sud-Ouest 🍷",
          awayPlaceholder: champSudEst ? undefined : "Champion Sud-Est ☀️",
        };

    // Grande Finale (Tour 14)
    const actual14 = round14?.matches[0];
    const homeFinal = m13_0.winnerId ? byId.get(m13_0.winnerId) : undefined;
    const awayFinal = m13_1.winnerId ? byId.get(m13_1.winnerId) : undefined;

    const m14: BracketMatchNode = actual14
      ? {
          matchIndex: 0,
          matchId: actual14.id,
          isPlayable: Boolean(round14?.isCurrent && !round14.results[actual14.id]),
          isCompleted: Boolean(round14?.results[actual14.id]),
          homeTeam: byId.get(actual14.homeTeamId),
          awayTeam: byId.get(actual14.awayTeamId),
          homeScore: round14?.results[actual14.id]?.homeScore,
          awayScore: round14?.results[actual14.id]?.awayScore,
          winnerId: round14?.results[actual14.id]?.winnerId,
          isExtraTime: round14?.results[actual14.id]?.isExtraTime,
        }
      : {
          matchIndex: 0,
          isPlayable: false,
          isCompleted: false,
          homeTeam: homeFinal,
          awayTeam: awayFinal,
          homePlaceholder: homeFinal ? undefined : "Vainqueur Demi 1 (Ouest / Nord)",
          awayPlaceholder: awayFinal ? undefined : "Vainqueur Demi 2 (Sud-Ouest / Sud-Est)",
        };

    const natChampionId = session?.championId ?? m14.winnerId;
    const natChampion = natChampionId ? byId.get(natChampionId) : undefined;

    return {
      demis: [m13_0, m13_1],
      finale: m14,
      champion: natChampion,
      isRound13Current: Boolean(round13?.isCurrent),
      isRound14Current: Boolean(round14?.isCurrent),
    };
  }, [hasConferences, rounds, conferenceTrees, byId, session]);

  // Fallback tree for smaller cups or non-conference datasets (e.g. 2 teams in tests)
  const genericLevels = useMemo(() => {
    if (hasConferences || !nationalRounds.length) return [];
    const firstRound = nationalRounds[0];
    const initialMatchCount = firstRound.matches.length;
    const numLevels = Math.max(1, Math.round(Math.log2(initialMatchCount)) + 1);

    const built: BracketLevel[] = [];
    for (let k = 0; k < numLevels; k++) {
      const matchCount = Math.max(1, Math.floor(initialMatchCount / Math.pow(2, k)));
      const roundNumber = firstRound.number + k;
      const roundView = rounds.find((r) => r.number === roundNumber);
      const title =
        matchCount === 16
          ? "16es de finale"
          : matchCount === 8
            ? "8es de finale"
            : matchCount === 4
              ? "Quarts de finale"
              : matchCount === 2
                ? "Demi-finales"
                : matchCount === 1
                  ? "Grande Finale"
                  : `Tour ${roundNumber}`;

      const matchesList: BracketMatchNode[] = [];
      const prevMatches = k > 0 ? built[k - 1].matches : null;

      for (let m = 0; m < matchCount; m++) {
        const actual = roundView?.matches[m];
        if (actual) {
          const res = roundView.results[actual.id];
          matchesList.push({
            matchIndex: m,
            matchId: actual.id,
            isPlayable: Boolean(roundView.isCurrent && !res),
            isCompleted: Boolean(res),
            homeTeam: byId.get(actual.homeTeamId),
            awayTeam: byId.get(actual.awayTeamId),
            homeScore: res?.homeScore,
            awayScore: res?.awayScore,
            winnerId: res?.winnerId,
          });
        } else {
          const feederTop = prevMatches ? prevMatches[2 * m] : undefined;
          const feederBottom = prevMatches ? prevMatches[2 * m + 1] : undefined;
          const home = feederTop?.winnerId ? byId.get(feederTop.winnerId) : undefined;
          const away = feederBottom?.winnerId ? byId.get(feederBottom.winnerId) : undefined;
          matchesList.push({
            matchIndex: m,
            isPlayable: false,
            isCompleted: false,
            homeTeam: home,
            awayTeam: away,
            homePlaceholder: home ? undefined : `Vainqueur M${2 * m + 1}`,
            awayPlaceholder: away ? undefined : `Vainqueur M${2 * m + 2}`,
          });
        }
      }

      built.push({
        level: k,
        title,
        matchCount,
        roundNumber,
        isCurrent: Boolean(roundView?.isCurrent),
        matches: matchesList,
      });
    }
    return built;
  }, [hasConferences, nationalRounds, rounds, byId]);

  // Overall Champion for header & badge
  const finalChampion =
    finalFourTree?.champion ??
    (genericLevels.length > 0
      ? genericLevels[genericLevels.length - 1].matches[0]?.winnerId
        ? byId.get(genericLevels[genericLevels.length - 1].matches[0].winnerId!)
        : undefined
      : undefined) ??
    (session?.championId ? byId.get(session.championId) : undefined);

  if (!nationalRounds.length) {
    return (
      <div className="empty-bracket-preview">
        <div className="bracket-action-bar">
          <div className="bracket-action-status">
            <span className="bracket-action-title">🏆 Tableau Final National & Conférences</span>
            <span className="bracket-action-meta">
              Le tableau final débute dès la phase de Conférences (Tour 9 · 64 clubs qualifiés).
            </span>
          </div>
        </div>

        <div className="bracket-preview-banner">
          <div className="preview-banner-icon">🗺️</div>
          <div className="preview-banner-text">
            <h3>Architecture du Tableau Final</h3>
            <p>
              Après les phases Départementales (Tours 1 à 4) et Régionales (Tours 5 à 8), les 64 clubs
              rescapés sont répartis équitablement dans <strong>4 Conférences géographiques</strong> de 16 clubs chacune :
            </p>
          </div>
        </div>

        <div className="conferences-quad-grid">
          {CONFERENCE_DEFS.map((conf) => (
            <div className={`conference-bracket-box ${conf.boxClass}`} key={conf.id}>
              <div className="conf-box-header">
                <div className="conf-header-badge">{conf.icon}</div>
                <div className="conf-header-info">
                  <h4 className="conf-header-title">{conf.fullName}</h4>
                  <p className="conf-header-regions">{conf.regions}</p>
                </div>
                <span className="conf-tag-waiting">16 clubs qualifiés au Tour 9</span>
              </div>
              <div className="conf-preview-steps">
                <div className="step-pill">8es de Conf. (8 matchs)</div>
                <div className="step-arrow">→</div>
                <div className="step-pill">Quarts (4 matchs)</div>
                <div className="step-arrow">→</div>
                <div className="step-pill">Demies (2 matchs)</div>
                <div className="step-arrow">→</div>
                <div className="step-pill is-gold">Finale de Conférence</div>
              </div>
            </div>
          ))}
        </div>

        <div className="final-four-preview-card">
          <div className="final-four-preview-badge">👑</div>
          <div>
            <h4>Le Carré Final National (Top 4 · Tours 13 & 14)</h4>
            <p>
              Les 4 Champions de Conférence se réunissent pour les <strong>Demi-finales Nationales</strong> (Ouest vs Nord, Sud-Ouest vs Sud-Est),
              suivies de la <strong>Grande Finale Nationale</strong> pour sacrer le Champion de France des Communes !
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Render a single match card
  const renderMatchCard = (match: BracketMatchNode, compact = false) => {
    const isHomeHighlighted = match.homeTeam && highlightedTeamId === match.homeTeam.id;
    const isAwayHighlighted = match.awayTeam && highlightedTeamId === match.awayTeam.id;

    const homeRank = getTeamPalmaresRank(match.homeTeam?.id, appContext?.teamRecords, session);
    const awayRank = getTeamPalmaresRank(match.awayTeam?.id, appContext?.teamRecords, session);

    const cardClassName = `bracket-card ${compact ? "is-compact" : ""} ${
      match.isCompleted ? "is-completed" : ""
    } ${match.isPlayable ? "is-playable" : ""} ${!match.matchId ? "is-upcoming" : ""}`;

    const handleCardClick = () => {
      if (match.matchId) {
        navigate(`/matchs/${encodeURIComponent(match.matchId)}`);
      }
    };

    const handleCardKeyDown = (e: React.KeyboardEvent) => {
      if ((e.key === "Enter" || e.key === " ") && match.matchId) {
        e.preventDefault();
        navigate(`/matchs/${encodeURIComponent(match.matchId)}`);
      }
    };

    const cardContent = (
      <>
        <div
          className={`bracket-card-team ${
            match.winnerId === match.homeTeam?.id ? "is-winner" : ""
          } ${isHomeHighlighted ? "is-highlighted" : ""} rank-${homeRank}`}
          onMouseEnter={() => match.homeTeam && setHighlightedTeamId(match.homeTeam.id)}
          onMouseLeave={() => setHighlightedTeamId(null)}
        >
          <div className="bracket-team-name">
            {match.homeTeam ? (
              <>
                <div className="bracket-name-row">
                  <Link
                    to={`/equipes/${match.homeTeam.id}`}
                    className={`bracket-name-link rank-${homeRank}`}
                    title={`Voir la fiche du club ${match.homeTeam.name}`}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {match.homeTeam.name}
                  </Link>
                  <small className="bracket-dept">({match.homeTeam.departmentId})</small>
                </div>
                <div className="bracket-trophies-row">
                  <TeamTrophyBadges teamId={match.homeTeam.id} size="xs" />
                </div>
              </>
            ) : (
              <span className="bracket-placeholder">{match.homePlaceholder}</span>
            )}
          </div>
          <span className="bracket-score">
            {match.isCompleted ? (
              <b>
                {match.homeScore}
                {match.isExtraTime && match.winnerId === match.homeTeam?.id && (
                  <span className="bracket-ot-tag" title="Victoire après prolongation / T.A.B.">a.p.</span>
                )}
              </b>
            ) : (
              <span className="bracket-score-dash">–</span>
            )}
          </span>
        </div>

        <div className="bracket-card-divider" />

        <div
          className={`bracket-card-team ${
            match.winnerId === match.awayTeam?.id ? "is-winner" : ""
          } ${isAwayHighlighted ? "is-highlighted" : ""} rank-${awayRank}`}
          onMouseEnter={() => match.awayTeam && setHighlightedTeamId(match.awayTeam.id)}
          onMouseLeave={() => setHighlightedTeamId(null)}
        >
          <div className="bracket-team-name">
            {match.awayTeam ? (
              <>
                <div className="bracket-name-row">
                  <Link
                    to={`/equipes/${match.awayTeam.id}`}
                    className={`bracket-name-link rank-${awayRank}`}
                    title={`Voir la fiche du club ${match.awayTeam.name}`}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {match.awayTeam.name}
                  </Link>
                  <small className="bracket-dept">({match.awayTeam.departmentId})</small>
                </div>
                <div className="bracket-trophies-row">
                  <TeamTrophyBadges teamId={match.awayTeam.id} size="xs" />
                </div>
              </>
            ) : (
              <span className="bracket-placeholder">{match.awayPlaceholder}</span>
            )}
          </div>
          <span className="bracket-score">
            {match.isCompleted ? (
              <b>
                {match.awayScore}
                {match.isExtraTime && match.winnerId === match.awayTeam?.id && (
                  <span className="bracket-ot-tag" title="Victoire après prolongation / T.A.B.">a.p.</span>
                )}
              </b>
            ) : (
              <span className="bracket-score-dash">–</span>
            )}
          </span>
        </div>
      </>
    );

    return (
      <div
        className={cardClassName}
        onClick={match.matchId ? handleCardClick : undefined}
        onKeyDown={match.matchId ? handleCardKeyDown : undefined}
        tabIndex={match.matchId ? 0 : undefined}
        role={match.matchId ? "button" : undefined}
        title={match.matchId ? "Consulter la feuille de match (ou cliquer sur un nom de club pour sa fiche)" : undefined}
        style={{ cursor: match.matchId ? "pointer" : "default" }}
      >
        {cardContent}
      </div>
    );
  };

  return (
    <div className="bracket-view-container">
      {/* Top Status Bar (Actions de simulation gérées par la barre supérieure de la page) */}
      <div className="bracket-action-bar">
        <div className="bracket-action-status">
          <span className="bracket-action-title">🏆 Tableau Final National</span>
          {currentRoundInBracket ? (
            <span className="bracket-action-meta">
              Tour en cours :{" "}
              <span className={getRoundBadgeClass(currentRoundInBracket.number)} style={{ fontSize: "0.85rem", padding: "2px 8px" }}>
                Tour {currentRoundInBracket.number} ({phaseLabels[currentRoundInBracket.phase]})
              </span>{" "}
              · {currentCompletedCount}/{currentTotalCount} matchs joués
            </span>
          ) : finalChampion ? (
            <span className="bracket-action-meta is-champion">
              🏆 Tournoi achevé · Sacre de{" "}
              <Link
                to={`/equipes/${finalChampion.id}`}
                className="bracket-status-champ-link rank-national"
                title={`Voir la fiche du club ${finalChampion.name}`}
              >
                <strong>{finalChampion.name}</strong>
              </Link>{" "}
              !
            </span>
          ) : (
            <span className="bracket-action-meta">4 Conférences régies par élimination directe puis Carré Final National</span>
          )}
        </div>

        <div className="bracket-palmares-legend" aria-label="Légende des titres historiques">
          <span className="legend-item rank-national" title="Club ayant déjà remporté au moins une Coupe de France">
            <span className="legend-dot dot-national" />
            Coupe de France (Doré)
          </span>
          <span className="legend-item rank-conference" title="Club ayant déjà été sacré Champion de Conférence">
            <span className="legend-dot dot-conference" />
            Conférence (Violet)
          </span>
          <span className="legend-item rank-region" title="Club ayant déjà été sacré Champion Régional">
            <span className="legend-dot dot-region" />
            Régional (Vert)
          </span>
        </div>
      </div>

      {/* Conference Filter Tabs */}
      {hasConferences && (
        <div className="bracket-filter-nav" role="tablist" aria-label="Filtres de Conférence">
          <button
            type="button"
            className={`bracket-filter-btn ${activeConfFilter === "all" ? "is-active" : ""}`}
            onClick={() => handleSelectConfFilter("all")}
          >
            🌐 Vue d'ensemble (4 Conférences + Top 4)
          </button>
          {CONFERENCE_DEFS.map((c) => {
            const data = conferenceTrees.get(c.id);
            return (
              <button
                key={c.id}
                type="button"
                className={`bracket-filter-btn ${activeConfFilter === c.id ? "is-active" : ""}`}
                onClick={() => handleSelectConfFilter(c.id)}
              >
                <span>{c.icon}</span> {c.name}
                {data?.champion && <span className="filter-pill-winner">👑</span>}
              </button>
            );
          })}
          <button
            type="button"
            className={`bracket-filter-btn is-gold-tab ${activeConfFilter === "final-four" ? "is-active" : ""}`}
            onClick={() => handleSelectConfFilter("final-four")}
          >
            👑 Carré Final National (Top 4)
          </button>
        </div>
      )}

      {/* VIEW: Conference Hub (4 Gros Carrés + Final Four) */}
      {hasConferences && finalFourTree && (
        <div className="conferences-view-hub">
          {/* Section 1: Final Four National (Top 4) - Highlighted when on "all" or "final-four" */}
          {(activeConfFilter === "all" || activeConfFilter === "final-four") && (
            <section className="final-four-hub" aria-label="Carré Final National">
              <div className="final-four-header">
                <div className="final-four-title-wrap">
                  <span className="final-four-icon">👑</span>
                  <div>
                    <h3 className="final-four-title">Le Carré Final National · Top 4</h3>
                    <p className="final-four-sub">
                      Tours 13 & 14 · Les 4 Champions de Conférence s'affrontent pour le titre suprême
                    </p>
                  </div>
                </div>
                {finalChampion && (
                  <div className="final-four-champ-banner">
                    <div className="final-four-champ-text">
                      🏆 Champion de France :{" "}
                      <Link
                        to={`/equipes/${finalChampion.id}`}
                        className="champ-banner-link rank-national"
                        title={`Voir la fiche de ${finalChampion.name}`}
                      >
                        <strong>{finalChampion.name}</strong>
                      </Link>{" "}
                      ({departmentLabel(finalChampion.departmentId)})
                    </div>
                    <div className="final-four-champ-trophies">
                      <TeamTrophyBadges teamId={finalChampion.id} size="xs" />
                    </div>
                  </div>
                )}
              </div>

              <div className="final-four-tree-row">
                {/* Demi-finales Column */}
                <div className="final-four-col">
                  <div className="final-four-col-header">
                    <h4>Demi-finales Nationales</h4>
                    <small>Tour 13 · 2 matchs</small>
                  </div>
                  <div className="final-four-matches">
                    <div className="ff-demi-slot">
                      <div className="ff-match-tag">Demi 1 · Ouest vs Nord</div>
                      {renderMatchCard(finalFourTree.demis[0])}
                    </div>
                    <div className="ff-demi-slot">
                      <div className="ff-match-tag">Demi 2 · Sud-Ouest vs Sud-Est</div>
                      {renderMatchCard(finalFourTree.demis[1])}
                    </div>
                  </div>
                </div>

                {/* Grande Finale Column */}
                <div className="final-four-col is-finale-col">
                  <div className="final-four-col-header">
                    <h4>Grande Finale Nationale</h4>
                    <small>Tour 14 · Sacre de France</small>
                  </div>
                  <div className="final-four-matches">
                    <div className="ff-final-slot">
                      <div className="ff-match-tag is-gold">⚔️ Finale Nationale</div>
                      {renderMatchCard(finalFourTree.finale)}
                    </div>
                  </div>
                </div>

                {/* Champion Column */}
                <div className="final-four-col is-champion-col">
                  <div className="final-four-col-header">
                    <h4 className="bracket-header-title">🏆 Champion</h4>
                    <p className="bracket-header-sub">Sacre National</p>
                  </div>
                  <div className="bracket-champion-slot">
                    <div className="bracket-champion-card">
                      <span className="bracket-trophy">🏆</span>
                      <span className="bracket-champion-label">VAINQUEUR</span>
                      {finalChampion ? (
                        <>
                          <Link to={`/equipes/${finalChampion.id}`} className="bracket-champion-name rank-national" title={`Voir la fiche du champion ${finalChampion.name}`}>
                            {finalChampion.name}
                          </Link>
                          <span className="bracket-champion-meta">
                            {departmentLabel(finalChampion.departmentId)} ·{" "}
                            {finalChampion.population.toLocaleString("fr-FR")} hab.
                          </span>
                          <div style={{ marginTop: "6px", display: "flex", justifyContent: "center" }}>
                            <TeamTrophyBadges teamId={finalChampion.id} size="sm" />
                          </div>
                        </>
                      ) : (
                        <span className="bracket-champion-placeholder">En attente de la finale</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* Section 2: The 4 Conference Quadrants ("Gros Carrés") */}
          {(activeConfFilter === "all" || activeConfFilter.startsWith("CONF_")) && (
            <div className={`conferences-quad-grid ${activeConfFilter !== "all" ? "is-single-focus" : ""}`}>
              {CONFERENCE_DEFS.filter(
                (c) => activeConfFilter === "all" || activeConfFilter === c.id,
              ).map((conf) => {
                const data = conferenceTrees.get(conf.id);
                if (!data) return null;

                return (
                  <div className={`conference-bracket-box ${conf.boxClass}`} key={conf.id}>
                    {/* Conference Header */}
                    <div className="conf-box-header">
                      <div className="conf-header-badge">{conf.icon}</div>
                      <div className="conf-header-info">
                        <div className="conf-title-row">
                          <h4 className="conf-header-title">{conf.fullName}</h4>
                          {data.champion ? (
                            <span className="conf-badge-champ">
                              <span className="conf-badge-champ-title">
                                👑 Champion :{" "}
                                <Link
                                  to={`/equipes/${data.champion.id}`}
                                  className={`conf-champ-title-link rank-${getTeamPalmaresRank(data.champion.id, appContext?.teamRecords, session)}`}
                                  title={`Voir la fiche de ${data.champion.name}`}
                                >
                                  {data.champion.name}
                                </Link>
                              </span>
                              <span className="conf-badge-champ-trophies">
                                <TeamTrophyBadges teamId={data.champion.id} size="xs" />
                              </span>
                            </span>
                          ) : (
                            <span className="conf-badge-live">
                              {data.completedCount}/{data.totalCount} matchs joués
                            </span>
                          )}
                        </div>
                        <p className="conf-header-regions">{conf.regions}</p>
                      </div>
                      {activeConfFilter !== "all" && (
                        <button
                          type="button"
                          className="conf-back-all-btn"
                          onClick={() => handleSelectConfFilter("all")}
                        >
                          ← Toutes les Conférences
                        </button>
                      )}
                    </div>

                    {/* Horizontal 16-Team Tree for this Conference */}
                    <div className="conf-tree-scroll">
                      <div className="conf-tree-levels">
                        {data.levels.map((lvl) => {
                          const isFinale = lvl.level === 3;
                          return (
                            <div
                              className={`conf-tree-col ${lvl.isCurrent ? "is-current" : ""}`}
                              key={`conf-${conf.id}-lvl-${lvl.level}`}
                            >
                              <div className="conf-col-header">
                                <span className="conf-col-title">{lvl.title}</span>
                                <span className="conf-col-count">
                                  {lvl.matchCount} {lvl.matchCount > 1 ? "matchs" : "match"}
                                </span>
                              </div>

                              <div className="conf-col-matches">
                                {!isFinale ? (
                                  Array.from({ length: Math.ceil(lvl.matchCount / 2) }, (_, p) => {
                                    const topMatch = lvl.matches[2 * p];
                                    const bottomMatch = lvl.matches[2 * p + 1];
                                    return (
                                      <div
                                        className="conf-pair"
                                        key={`pair-${lvl.level}-${p}`}
                                        style={{
                                          height: `calc(var(--conf-slot-h0) * ${Math.pow(2, lvl.level + 1)})`,
                                        }}
                                      >
                                        <div className="conf-slot">{topMatch && renderMatchCard(topMatch, true)}</div>
                                        <div className="conf-fork" />
                                        <div className="conf-fork-stem" />
                                        <div className="conf-slot">{bottomMatch && renderMatchCard(bottomMatch, true)}</div>
                                      </div>
                                    );
                                  })
                                ) : (
                                  <div
                                    className="conf-final-slot"
                                    style={{
                                      height: `calc(var(--conf-slot-h0) * 8)`,
                                    }}
                                  >
                                    <div className="conf-slot">
                                      {lvl.matches[0] && renderMatchCard(lvl.matches[0], true)}
                                      <div className="conf-final-stem" />
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}

                        {/* Conf Champion Box */}
                        <div className="conf-tree-col is-conf-champ-col">
                          <div className="conf-col-header">
                            <span className="conf-col-title">👑 Champion {conf.name.replace("Conférence ", "")}</span>
                            <span className="conf-col-count">Qualifié Carré Final</span>
                          </div>
                          <div
                            className="conf-champ-slot"
                            style={{
                              height: `calc(var(--conf-slot-h0) * 8)`,
                            }}
                          >
                            <div className="conf-champion-card">
                              <span className="conf-champ-trophy">👑</span>
                              <span className="conf-champ-label">CHAMPION DE CONFÉRENCE</span>
                              {data.champion ? (
                                <>
                                  <Link
                                    to={`/equipes/${data.champion.id}`}
                                    className={`conf-champ-name rank-${getTeamPalmaresRank(data.champion.id, appContext?.teamRecords, session)}`}
                                    title={`Voir la fiche de ${data.champion.name}`}
                                  >
                                    {data.champion.name}
                                  </Link>
                                  <small className="conf-champ-dept">
                                    ({data.champion.departmentId}) · {data.champion.population.toLocaleString("fr-FR")} hab.
                                  </small>
                                  <div style={{ margin: "4px 0 2px 0", display: "flex", justifyContent: "center" }}>
                                    <TeamTrophyBadges teamId={data.champion.id} size="xs" />
                                  </div>
                                  <span className="conf-champ-ticket">🎟️ Ticket Carré Final</span>
                                </>
                              ) : (
                                <span className="conf-champ-pending">En attente de la finale</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* VIEW: Generic Binary Bracket (Fallback for small datasets / unit tests without conferences) */}
      {!hasConferences && genericLevels.length > 0 && (
        <div className="bracket-scroll-wrapper">
          <div className="bracket-tree">
            {genericLevels.map((lvl) => {
              const isFinalLevel = lvl.level === genericLevels.length - 1;
              return (
                <div
                  className={`bracket-column ${lvl.isCurrent ? "is-current" : ""}`}
                  key={`generic-lvl-${lvl.level}`}
                >
                  <div className="bracket-column-header">
                    <h4 className="bracket-header-title">{lvl.title}</h4>
                    <p className="bracket-header-sub">
                      {lvl.matchCount} {lvl.matchCount > 1 ? "matchs" : "match"}
                    </p>
                  </div>

                  <div className="bracket-column-matches">
                    {!isFinalLevel ? (
                      Array.from({ length: Math.ceil(lvl.matchCount / 2) }, (_, p) => {
                        const topMatch = lvl.matches[2 * p];
                        const bottomMatch = lvl.matches[2 * p + 1];
                        return (
                          <div
                            className="bracket-pair"
                            key={`pair-${lvl.level}-${p}`}
                            style={{
                              height: `calc(var(--bracket-slot-h0) * ${Math.pow(2, lvl.level + 1)})`,
                            }}
                          >
                            <div className="bracket-slot">{topMatch && renderMatchCard(topMatch)}</div>
                            <div className="bracket-fork" />
                            <div className="bracket-fork-stem" />
                            <div className="bracket-slot">{bottomMatch && renderMatchCard(bottomMatch)}</div>
                          </div>
                        );
                      })
                    ) : (
                      <div
                        className="bracket-final-slot"
                        style={{
                          height: `calc(var(--bracket-slot-h0) * ${Math.pow(2, lvl.level)})`,
                        }}
                      >
                        <div className="bracket-slot">
                          {lvl.matches[0] && renderMatchCard(lvl.matches[0])}
                          <div className="bracket-final-stem" />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Champion Column */}
            <div className="bracket-column is-champion-col">
              <div className="bracket-column-header">
                <h4 className="bracket-header-title">🏆 Champion</h4>
                <p className="bracket-header-sub">Sacre National</p>
              </div>

              <div
                className="bracket-champion-slot"
                style={{
                  height: `calc(var(--bracket-slot-h0) * ${Math.pow(2, genericLevels.length - 1)})`,
                }}
              >
                <div className="bracket-champion-card">
                  <span className="bracket-trophy">🏆</span>
                  <span className="bracket-champion-label">VAINQUEUR</span>
                  {finalChampion ? (
                    <>
                      <Link to={`/equipes/${finalChampion.id}`} className="bracket-champion-name rank-national" title={`Voir la fiche du champion ${finalChampion.name}`}>
                        {finalChampion.name}
                      </Link>
                      <span className="bracket-champion-meta">
                        {departmentLabel(finalChampion.departmentId)} ·{" "}
                        {finalChampion.population.toLocaleString("fr-FR")} hab.
                      </span>
                      <div style={{ marginTop: "6px", display: "flex", justifyContent: "center" }}>
                        <TeamTrophyBadges teamId={finalChampion.id} size="sm" />
                      </div>
                    </>
                  ) : (
                    <span className="bracket-champion-placeholder">En attente de la finale</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
