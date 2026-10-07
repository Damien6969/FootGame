import { useEffect, useState, useMemo, useRef, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  createPhaseRound,
  isFinalRound,
  phaseForCount,
  type CompetitionPhase,
  type DrawMatch,
} from "../competition/competition";
import { loadGeography, conferenceForRegion } from "../geography/loadGeography";
import type { Commune, GeographyDataset } from "../geography/types";
import type { Club } from "../teams/types";
import { buildClubsFromCommunes } from "../teams/clubGenerator";
import {
  departmentLabel,
  regionLabel,
  conferenceLabel,
} from "../geography/territoryLabels";
import { simulateMatch, isMatchUpset } from "../match/simulateMatch";
import {
  cupRepository,
  type CupRepository,
  type CupSession,
} from "../storage/cupRepository";
import { TeamLink } from "../teams/TeamLink";
import { ClubBadge } from '../teams/ClubBadge';
import { TeamTrophyBadges } from "../teams/TeamTrophyBadges";
import { FavoriteStarButton } from "../teams/FavoriteStarButton";
import { CupRightPanel } from "./CupRightPanel";
import { getRoundViews } from "./cupSelectors";
import { useOptionalCupApp } from "../../app/CupAppContext";
import {
  detectConferenceChampions,
  parseSeasonYear,
} from "../history/palmaresSelectors";
import { CUP_CONFIG } from "../../config/cupConfig";
import { InterseasonView } from "./InterseasonView";
import { FinalBracket } from "./FinalBracket";
import { CompetitionStatsView } from "../competition/CompetitionStatsView";
import { getClubActiveStarters } from "../persons/personSelectors";
import { getRoundBadgeClass } from "../competition/echelonColors";
import "./cup.css";

type Props = Readonly<{
  loadDataset?: () => Promise<GeographyDataset>;
  repository?: CupRepository;
}>;

const phaseLabels: Record<CompetitionPhase, string> = {
  DEPARTMENT: "Départemental",
  REGION: "Régional",
  CONFERENCE: "Conférences",
  NATIONAL: "Final Four National",
};

const phaseTerritoryTypeLabel: Record<CompetitionPhase, string> = {
  DEPARTMENT: "Départements",
  REGION: "Régions",
  CONFERENCE: "Conférences",
  NATIONAL: "National",
};

const territoryId = (team: Club | Commune, phase: CompetitionPhase) =>
  phase === "DEPARTMENT"
    ? team.departmentId
    : phase === "REGION"
      ? team.regionId
      : phase === "CONFERENCE"
        ? team.conferenceId
        : "FRANCE";

const territoryName = (id: string, phase: CompetitionPhase) =>
  phase === "DEPARTMENT"
    ? departmentLabel(id)
    : phase === "REGION"
      ? regionLabel(id)
      : phase === "CONFERENCE"
        ? conferenceLabel(id)
        : "Tableau national";


type TerritoryMeta = {
  id: string;
  name: string;
  matches: DrawMatch[];
  byes: Commune[];
  completedCount: number;
  pendingCount: number;
  isDone: boolean;
  totalClubs: number;
};

export function CupPage({
  loadDataset,
  repository,
}: Props) {
  const appContext = useOptionalCupApp();
  const isCustom = Boolean(loadDataset || repository);

  // Local state if props are provided (for testing), else fallback to context
  const [localDataset, setLocalDataset] = useState<GeographyDataset | null>(null);
  const [localSession, setLocalSession] = useState<CupSession | null>(null);
  const [localReady, setLocalReady] = useState(false);
  const [localError, setLocalError] = useState("");
  const [saveError, setSaveError] = useState("");
  const saving = useRef(false);

  useEffect(() => {
    if (!isCustom) return;
    let active = true;
    const loader = loadDataset ?? loadGeography;
    const repo = repository ?? cupRepository;
    Promise.all([loader(), repo.load()])
      .then(([data, saved]) => {
        if (!active) return;
        setLocalDataset(data);
        if (saved?.datasetVersion === data.version) {
          setLocalSession(saved);
        }
        setLocalReady(true);
      })
      .catch((reason: unknown) => {
        if (!active) return;
        setLocalError(
          reason instanceof Error ? reason.message : "Chargement impossible.",
        );
        setLocalReady(true);
      });
    return () => {
      active = false;
    };
  }, [isCustom, loadDataset, repository]);

  const dataset = isCustom ? localDataset : appContext?.dataset ?? null;
  const session = isCustom ? localSession : appContext?.session ?? null;
  const ready = isCustom ? localReady : (appContext?.ready ?? false);
  const error = isCustom ? localError : (appContext?.error ?? "");

  const persist = async (next: CupSession): Promise<boolean> => {
    if (saving.current) return false;
    saving.current = true;
    setSaveError("");
    try {
      if (isCustom) {
        const repo = repository ?? cupRepository;
        await repo.save(next);
        setLocalSession(next);
      } else if (appContext) {
        await appContext.persistSession(next);
      }
      return true;
    } catch (reason) {
      setSaveError(reason instanceof Error ? reason.message : "Sauvegarde impossible.");
      return false;
    } finally {
      saving.current = false;
    }
  };

  const handleReset = async () => {
    if (appContext?.openResetModal) {
      appContext.openResetModal();
      return;
    }
    if (
      window.confirm(
        "Voulez-vous réinitialiser l'intégralité de la compétition et tout l'historique ? (Toutes les statistiques, archives et palmarès seront remis à zéro)",
      )
    ) {
      if (isCustom) {
        const repo = repository ?? cupRepository;
        if (repo.clearAll) {
          await repo.clearAll();
        } else {
          await repo.clear();
        }
        setLocalSession(null);
      } else if (appContext) {
        await appContext.resetAllHistory();
      }
    }
  };

  const [seed, setSeed] = useState<string>(CUP_CONFIG.defaultSeed);
  // URL Search Parameters synchronization for tab persistence
  const [searchParams, setSearchParams] = useSearchParams();

  const tabParam = searchParams.get("tab");
  const initialView =
    tabParam === "tableau-final" || tabParam === "bracket"
      ? "bracket"
      : tabParam === "stats" || tabParam === "statistiques" || tabParam === "buteurs"
      ? "stats"
      : tabParam === "intersaison" || tabParam === "bilan"
      ? "intersaison"
      : "round";
  const [view, setView] = useState<"round" | "bracket" | "stats" | "intersaison">(initialView);

  useEffect(() => {
    if (tabParam === "tableau-final" || tabParam === "bracket") {
      setView("bracket");
    } else if (tabParam === "stats" || tabParam === "statistiques" || tabParam === "buteurs") {
      setView("stats");
    } else if (tabParam === "intersaison" || tabParam === "bilan") {
      setView("intersaison");
    } else if (tabParam === "tours" || tabParam === "round") {
      setView("round");
    }
  }, [tabParam]);

  const tourParam = searchParams.get("tour");
  const initialRound = tourParam && !isNaN(parseInt(tourParam, 10)) ? parseInt(tourParam, 10) : undefined;
  const [selectedRound, setSelectedRound] = useState<number | undefined>(initialRound);

  useEffect(() => {
    if (tourParam && !isNaN(parseInt(tourParam, 10))) {
      setSelectedRound(parseInt(tourParam, 10));
    }
  }, [tourParam]);

  const territoryParam = searchParams.get("territoire") || searchParams.get("dept");
  const [selectedTerritory, setSelectedTerritory] = useState<string>(territoryParam ?? "");

  useEffect(() => {
    if (territoryParam !== null && territoryParam !== undefined) {
      setSelectedTerritory(territoryParam);
    }
  }, [territoryParam]);

  const handleSetView = (nextView: "round" | "bracket" | "stats" | "intersaison") => {
    setView(nextView);
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (nextView === "bracket") {
          next.set("tab", "tableau-final");
        } else if (nextView === "stats") {
          next.set("tab", "stats");
        } else if (nextView === "intersaison") {
          next.set("tab", "intersaison");
        } else {
          next.set("tab", "tours");
        }
        return next;
      },
      { replace: true },
    );
  };

  const handleSelectRound = (roundNum: number) => {
    setSelectedRound(roundNum);
    setSelectedTerritory("");
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set("tab", "tours");
        next.set("tour", String(roundNum));
        next.delete("territoire");
        next.delete("dept");
        return next;
      },
      { replace: true },
    );
  };

  const handleSelectTerritory = (tId: string) => {
    setSelectedTerritory(tId);
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (tId) {
          next.set("territoire", tId);
        } else {
          next.delete("territoire");
          next.delete("dept");
        }
        return next;
      },
      { replace: true },
    );
  };

  // Sidebar & Match filters (Tâche 14 - Mémorisation dans l'URL)
  const [sidebarSearch, setSidebarSearch] = useState("");
  const sideFilterParam = searchParams.get("sideFilter");
  const initialSidebarFilter = sideFilterParam === "pending" || sideFilterParam === "completed" ? sideFilterParam : "all";
  const [sidebarFilter, setSidebarFilter] = useState<"all" | "pending" | "completed">(initialSidebarFilter);

  const qParam = searchParams.get("q") ?? "";
  const [matchQuery, setMatchQuery] = useState(qParam);

  const statutParam = searchParams.get("statut");
  const initialMatchStatus = statutParam === "pending" || statutParam === "completed" ? statutParam : "all";
  const [matchStatusFilter, setMatchStatusFilter] = useState<"all" | "pending" | "completed">(initialMatchStatus);
  const [matchPage, setMatchPage] = useState(0);

  useEffect(() => {
    const s = searchParams.get("statut");
    if (s === "all" || s === "pending" || s === "completed") {
      setMatchStatusFilter(s);
    }
    const q = searchParams.get("q");
    if (q !== null && q !== matchQuery) {
      setMatchQuery(q);
    }
    const sf = searchParams.get("sideFilter");
    if (sf === "all" || sf === "pending" || sf === "completed") {
      setSidebarFilter(sf);
    }
  }, [searchParams]);

  const handleSetSidebarFilter = (filter: "all" | "pending" | "completed") => {
    setSidebarFilter(filter);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (filter === "all") {
        next.delete("sideFilter");
      } else {
        next.set("sideFilter", filter);
      }
      return next;
    }, { replace: true });
  };

  const handleSetMatchStatusFilter = (filter: "all" | "pending" | "completed") => {
    setMatchStatusFilter(filter);
    setMatchPage(0);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (filter === "all") {
        next.delete("statut");
      } else {
        next.set("statut", filter);
      }
      return next;
    }, { replace: true });
  };

  const handleSetMatchQuery = (q: string) => {
    setMatchQuery(q);
    setMatchPage(0);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (!q.trim()) {
        next.delete("q");
      } else {
        next.set("q", q);
      }
      return next;
    }, { replace: true });
  };
  const [simulationProgress, setSimulationProgress] = useState<{
    roundNumber: number;
    phaseName: string;
    remainingClubs: number;
  } | null>(null);

  const populations = useMemo(
    () => dataset?.communes.map((team) => team.population) ?? [],
    [dataset],
  );
  const bounds = useMemo(
    () => ({
      min: populations.length ? Math.min(...populations) : 1000,
      max: populations.length ? Math.max(...populations) : 2000000,
    }),
    [populations],
  );

  const byId = useMemo(
    () => appContext?.clubsById ?? (dataset ? new Map(buildClubsFromCommunes(dataset.communes, bounds).map((c) => [c.id, c])) : new Map<string, Club>()),
    [appContext?.clubsById, dataset, bounds],
  );

  function handleCreateCup(event: FormEvent) {
    event.preventDefault();
    if (!dataset || !seed.trim()) return;
    if (!isCustom && appContext) {
      appContext.createCup(seed);
      setSelectedRound(1);
      return;
    }
    const initialClubs = appContext?.clubs && appContext.clubs.length > 0 ? appContext.clubs : buildClubsFromCommunes(dataset.communes, bounds);
    const ids = initialClubs.map((team) => team.id);
    const normalized = seed.trim();
    const seasonYear = parseSeasonYear(normalized, 2026);
    const newSession: CupSession = {
      id: "active",
      seed: normalized,
      seasonYear,
      datasetVersion: dataset.version,
      activeTeamIds: ids,
      roundNumber: 1,
      round: createPhaseRound(initialClubs, normalized, 1),
      results: {},
      history: [],
      roundByes: {},
      clubs: initialClubs,
    };
    persist(newSession);
    setSelectedRound(1);
  }

  const rounds = useMemo(() => (session ? getRoundViews(session) : []), [session]);
  const roundTabsRef = useRef<HTMLElement>(null);
  const round = useMemo(() => {
    if (!rounds.length) return null;
    return (
      rounds.find(
        (item) => item.number === (selectedRound ?? session?.roundNumber),
      ) ?? rounds.at(-1)!
    );
  }, [rounds, selectedRound, session?.roundNumber]);

  useEffect(() => {
    if (view !== "round") return;
    const selectedTab = roundTabsRef.current?.querySelector<HTMLElement>(".round-tab-btn.is-active");
    selectedTab?.scrollIntoView?.({ block: "nearest", inline: "center" });
  }, [view, round?.number]);

  // Fast pre-indexed territory groupings
  const { territoryMap, allTerritoryIds } = useMemo(() => {
    if (!round) {
      return {
        territoryMap: new Map<string, TerritoryMeta>(),
        allTerritoryIds: [] as string[],
      };
    }

    const groups = new Map<string, DrawMatch[]>();
    for (const match of round.matches) {
      const homeTeam = byId.get(match.homeTeamId);
      const awayTeam = byId.get(match.awayTeamId);
      if (homeTeam) {
        const homeTid = territoryId(homeTeam, round.phase);
        let list = groups.get(homeTid);
        if (!list) {
          list = [];
          groups.set(homeTid, list);
        }
        list.push(match);

        if (awayTeam) {
          const awayTid = territoryId(awayTeam, round.phase);
          if (awayTid && awayTid !== homeTid) {
            let awayList = groups.get(awayTid);
            if (!awayList) {
              awayList = [];
              groups.set(awayTid, awayList);
            }
            awayList.push(match);
          }
        }
      }
    }

    const byes = new Map<string, Array<Club | Commune>>();
    for (const byeId of round.byeTeamIds ?? []) {
      const team = byId.get(byeId);
      if (team) {
        const tid = territoryId(team, round.phase);
        let list = byes.get(tid);
        if (!list) {
          list = [];
          byes.set(tid, list);
        }
        list.push(team);
      }
    }

    const allIds = Array.from(new Set([...groups.keys(), ...byes.keys()])).sort((a, b) =>
      territoryName(a, round.phase).localeCompare(territoryName(b, round.phase), "fr"),
    );

    const territoryMap = new Map<
      string,
      {
        id: string;
        name: string;
        matches: DrawMatch[];
        byes: Array<Club | Commune>;
        completedCount: number;
        pendingCount: number;
        isDone: boolean;
        totalClubs: number;
      }
    >();

    for (const id of allIds) {
      const mList = groups.get(id) ?? [];
      const bList = byes.get(id) ?? [];
      let done = 0;
      for (const m of mList) {
        if (round.results[m.id]) done++;
      }
      const clubsInTerritory = new Set<string>();
      for (const m of mList) {
        const h = byId.get(m.homeTeamId);
        const a = byId.get(m.awayTeamId);
        if (h && territoryId(h, round.phase) === id) clubsInTerritory.add(h.id);
        if (a && territoryId(a, round.phase) === id) clubsInTerritory.add(a.id);
      }
      for (const b of bList) clubsInTerritory.add(b.id);

      territoryMap.set(id, {
        id,
        name: territoryName(id, round.phase),
        matches: mList,
        byes: bList,
        completedCount: done,
        pendingCount: mList.length - done,
        isDone: mList.length > 0 && done === mList.length,
        totalClubs: clubsInTerritory.size,
      });
    }

    return { territoryMap, allTerritoryIds: allIds };
  }, [round, byId]);

  const activeTerritory = allTerritoryIds.includes(selectedTerritory)
    ? selectedTerritory
    : (allTerritoryIds[0] ?? "");

  const activeMeta = territoryMap.get(activeTerritory);
  const deptMatches = activeMeta?.matches ?? [];
  const deptByes = activeMeta?.byes ?? [];
  const deptCompletedCount = activeMeta?.completedCount ?? 0;
  const deptPendingCount = activeMeta?.pendingCount ?? 0;
  const deptIsCompleted = activeMeta?.isDone ?? false;

  // Filtered sidebar territories in sub-millisecond
  const filteredSidebarTerritories = useMemo(() => {
    const q = sidebarSearch.trim().toLowerCase();
    return allTerritoryIds.filter((id) => {
      const meta = territoryMap.get(id);
      if (!meta) return false;
      if (q && !id.toLowerCase().includes(q) && !meta.name.toLowerCase().includes(q)) {
        return false;
      }
      if (sidebarFilter === "completed") return meta.isDone;
      if (sidebarFilter === "pending") return !meta.isDone;
      return true;
    });
  }, [allTerritoryIds, territoryMap, sidebarSearch, sidebarFilter]);

  // Filtered matches in active territory
  const visibleMatches = useMemo(() => {
    if (!round) return [];
    const q = matchQuery.trim().toLowerCase();
    return deptMatches.filter((match: DrawMatch) => {
      const isFinished = Boolean(round.results[match.id]);
      if (matchStatusFilter === "pending" && isFinished) return false;
      if (matchStatusFilter === "completed" && !isFinished) return false;
      if (!q) return true;
      const homeName = byId.get(match.homeTeamId)?.name.toLowerCase() ?? "";
      const awayName = byId.get(match.awayTeamId)?.name.toLowerCase() ?? "";
      return homeName.includes(q) || awayName.includes(q);
    });
  }, [deptMatches, round, matchStatusFilter, matchQuery, byId]);

  // Reset match page whenever territory or filter changes
  useEffect(() => {
    setMatchPage(0);
  }, [activeTerritory, matchQuery, matchStatusFilter]);

  const matchesPerPage = 25;
  const totalMatchPages = Math.max(1, Math.ceil(visibleMatches.length / matchesPerPage));
  const paginatedMatches = useMemo(() => {
    return visibleMatches.slice(matchPage * matchesPerPage, (matchPage + 1) * matchesPerPage);
  }, [visibleMatches, matchPage, matchesPerPage]);

  const startersByClubId = useMemo(() => {
    const persons = appContext?.persons ?? session?.persons;
    if (!persons || persons.length === 0) return new Map();
    const map = new Map<string, { attacker: any; defender: any }>();
    for (const p of persons) {
      if (p.currentClubId && !p.isRetired && !map.has(p.currentClubId)) {
        map.set(p.currentClubId, getClubActiveStarters(persons, p.currentClubId));
      }
    }
    return map;
  }, [appContext?.persons, session?.persons]);

  if (error) {
    return (
      <section className="status-panel status-panel--error">
        <h2>Données indisponibles</h2>
        <p>{error}</p>
      </section>
    );
  }

  if (!dataset || !ready) {
    return (
      <section className="status-panel">
        <p>Chargement du référentiel des communes…</p>
      </section>
    );
  }

  if (!session) {
    return (
      <section className="cup-setup">
        {saveError && <p role="alert" className="status-panel">Sauvegarde impossible : {saveError}</p>}
        <div>
          <p className="eyebrow">Compétition Nationale</p>
          <h2>Créer la Coupe des communes</h2>
          <p className="setup-copy">
            Toutes les communes françaises entrent dans une compétition à élimination directe,
            structurée par départements, régions puis au niveau national.
          </p>
        </div>
        <form onSubmit={handleCreateCup} className="setup-form">
          <div className="dataset-count">
            <strong>{dataset.communes.length.toLocaleString("fr-FR")}</strong>
            <span>communes éligibles</span>
          </div>
          <label htmlFor="cup-seed">Seed de la Coupe</label>
          <input
            id="cup-seed"
            value={seed}
            onChange={(event) => setSeed(event.target.value)}
            required
            placeholder="ex: damien-2026"
          />
          <button type="submit" className="btn-primary">
            Créer la Coupe
          </button>
        </form>
      </section>
    );
  }

  const round14View = rounds.find((r) => r.number === 14);
  const round14WinnerId =
    round14View && round14View.matches.length === 1
      ? round14View.results[round14View.matches[0].id]?.winnerId
      : undefined;

  const effectiveChampionId =
    session.championId ??
    round14WinnerId ??
    (isFinalRound(session.round) && session.results[session.round.matches[0].id]
      ? session.results[session.round.matches[0].id].winnerId
      : undefined) ??
    session.history.find((h) => h.roundNumber === 14)?.result?.winnerId;
  const hasChampion = Boolean(effectiveChampionId);
  const champion = effectiveChampionId ? byId.get(effectiveChampionId) : undefined;
  const currentSeasonYear = session.seasonYear ?? parseSeasonYear(session.seed, 2026);
  const nextSeasonYear = currentSeasonYear + 1;

  const handleNextSeason = async () => {
    if (appContext) {
      await appContext.advanceToNextSeason(effectiveChampionId);
    } else if (isCustom && session) {
      const nextYear = currentSeasonYear + 1;
      const nextSeed = `tournoi-${nextYear}`;
      const currentClubs = session.clubs ?? (dataset ? buildClubsFromCommunes(dataset.communes, bounds) : []);
      const newSession: CupSession = {
        id: "active",
        seed: nextSeed,
        seasonYear: nextYear,
        datasetVersion: session.datasetVersion,
        activeTeamIds: currentClubs.map((c) => c.id),
        roundNumber: 1,
        round: createPhaseRound(currentClubs, nextSeed, 1),
        results: {},
        history: [],
        roundByes: {},
        clubs: currentClubs,
      };
      persist(newSession);
    }
    setSelectedRound(1);
  };

  if (!round) {
    return (
      <section className="status-panel">
        <p>Initialisation du tour…</p>
      </section>
    );
  }

  // Simulation handlers
  const runMatch = (matchId: string) => {
    if (!round.isCurrent) return;
    const match = session.round.matches.find((item) => item.id === matchId);
    if (!match || session.results[matchId]) return;
    const result = simulateMatch({
      matchId,
      rootSeed: session.seed,
      home: byId.get(match.homeTeamId)!,
      away: byId.get(match.awayTeamId)!,
      populationBounds: bounds,
      homeStarters: startersByClubId.get(match.homeTeamId),
      awayStarters: startersByClubId.get(match.awayTeamId),
    });
    const nextResults = { ...session.results, [matchId]: result };
    let newChampionId = session.championId;
    if (!newChampionId && isFinalRound(session.round) && matchId === session.round.matches[0].id) {
      newChampionId = result.winnerId;
    }
    persist({
      ...session,
      results: nextResults,
      ...(newChampionId ? { championId: newChampionId } : {}),
    });
  };

  const runDepartmentMatches = (deptId: string) => {
    if (!round.isCurrent) return;
    const meta = territoryMap.get(deptId);
    if (!meta) return;
    const results = { ...session.results };
    let updated = false;
    for (const match of meta.matches) {
      if (!results[match.id]) {
        results[match.id] = simulateMatch({
          matchId: match.id,
          rootSeed: session.seed,
          home: byId.get(match.homeTeamId)!,
          away: byId.get(match.awayTeamId)!,
          populationBounds: bounds,
          homeStarters: startersByClubId.get(match.homeTeamId),
          awayStarters: startersByClubId.get(match.awayTeamId),
        });
        updated = true;
      }
    }
    let newChampionId = session.championId;
    if (!newChampionId && isFinalRound(session.round)) {
      const finalMatch = session.round.matches[0];
      if (results[finalMatch.id]) {
        newChampionId = results[finalMatch.id].winnerId;
      }
    }
    if (updated) {
      persist({
        ...session,
        results,
        ...(newChampionId ? { championId: newChampionId } : {}),
      });
    }
  };

  const runAll = () => {
    const results = { ...session.results };
    for (const match of session.round.matches) {
      if (!results[match.id]) {
        results[match.id] = simulateMatch({
          matchId: match.id,
          rootSeed: session.seed,
          home: byId.get(match.homeTeamId)!,
          away: byId.get(match.awayTeamId)!,
          populationBounds: bounds,
          homeStarters: startersByClubId.get(match.homeTeamId),
          awayStarters: startersByClubId.get(match.awayTeamId),
        });
      }
    }
    let newChampionId = session.championId;
    if (!newChampionId && isFinalRound(session.round)) {
      const finalMatch = session.round.matches[0];
      if (results[finalMatch.id]) {
        newChampionId = results[finalMatch.id].winnerId;
      }
    }
    persist({
      ...session,
      results,
      ...(newChampionId ? { championId: newChampionId } : {}),
    });
  };

  const totalRoundMatches = round.matches.length;
  const totalRoundResults = Object.keys(round.results).length;
  const complete = totalRoundMatches > 0 && totalRoundResults === totalRoundMatches;
  const favoriteMatch = round.isCurrent
    ? round.matches.find((match) =>
        !round.results[match.id] &&
        (appContext?.favoriteTeamIds.includes(match.homeTeamId) ||
          appContext?.favoriteTeamIds.includes(match.awayTeamId)),
      )
    : undefined;

  const advance = async () => {
    if (!complete) return;
    const history = [
      ...session.history,
      ...session.round.matches.map((match) => ({
        roundNumber: session.roundNumber,
        homeTeamId: match.homeTeamId,
        awayTeamId: match.awayTeamId,
        result: session.results[match.id],
      })),
    ];
    const nextIds = [
      ...session.round.byeTeamIds,
      ...session.round.matches.map(
        (match) => session.results[match.id].winnerId,
      ),
    ];
    const nextRoundByes = {
      ...(session.roundByes ?? {}),
      [session.roundNumber]: session.round.byeTeamIds,
    };

    let confChampions = session.conferenceChampionIds;
    if (session.roundNumber >= 12 && (!confChampions || Object.keys(confChampions).length < 4)) {
      const tempSession: CupSession = {
        ...session,
        history,
      };
      const detected = detectConferenceChampions(tempSession, byId);
      if (Object.keys(detected).length > 0) {
        confChampions = { ...(confChampions ?? {}), ...detected };
      }
    }

    if (nextIds.length === 1) {
      await persist({
        ...session,
        activeTeamIds: nextIds,
        history,
        championId: nextIds[0],
        roundByes: nextRoundByes,
        conferenceChampionIds: confChampions,
      });
      return;
    }
    const nextNumber = session.roundNumber + 1;
    // Bracket progression begins at Tour 10 (feeding winners from 8es of Conférence)
    // and continues through Tour 14 (Grande Finale Nationale) without reshuffling
    const isBracketProgression = nextNumber >= 10;
    const saved = await persist({
      ...session,
      activeTeamIds: nextIds,
      roundNumber: nextNumber,
      conferenceChampionIds: confChampions,
      round: createPhaseRound(
        nextIds.map((id) => byId.get(id)!),
        session.seed,
        nextNumber,
        { preserveOrder: isBracketProgression },
      ),
      results: {},
      history,
      roundByes: nextRoundByes,
    });
    if (saved) {
      setSelectedRound(nextNumber);
      setSelectedTerritory("");
      setMatchQuery("");
    }
  };

  const runCompetition = async () => {
    if (!session || session.championId) return;

    let currentSession: CupSession = { ...session };
    let currentRoundNumber = currentSession.roundNumber;
    let currentRound = currentSession.round;
    let currentResults = { ...currentSession.results };
    let currentHistory = [...currentSession.history];
    let currentByes: Record<number, readonly string[]> = { ...(currentSession.roundByes ?? {}) };
    let confChampions: Record<string, string> = { ...(currentSession.conferenceChampionIds ?? {}) };
    let currentActiveIds = [...currentSession.activeTeamIds];

    const isTestEnv = isCustom;

    while (!currentSession.championId && currentRoundNumber <= 25) {
      if (!isTestEnv) {
        const currentPhase = phaseForCount(currentActiveIds.length);
        setSimulationProgress({
          roundNumber: currentRoundNumber,
          phaseName: phaseLabels[currentPhase],
          remainingClubs: currentActiveIds.length,
        });
        await new Promise((resolve) => setTimeout(resolve, 8));
      }

      // 1. Simulate all unplayed matches in current round
      for (const match of currentRound.matches) {
        if (!currentResults[match.id]) {
          currentResults[match.id] = simulateMatch({
            matchId: match.id,
            rootSeed: currentSession.seed,
            home: byId.get(match.homeTeamId)!,
            away: byId.get(match.awayTeamId)!,
            populationBounds: bounds,
            homeStarters: startersByClubId.get(match.homeTeamId),
            awayStarters: startersByClubId.get(match.awayTeamId),
          });
        }
      }

      // 2. Build history for this round
      currentHistory = [
        ...currentHistory,
        ...currentRound.matches.map((match) => ({
          roundNumber: currentRoundNumber,
          homeTeamId: match.homeTeamId,
          awayTeamId: match.awayTeamId,
          result: currentResults[match.id],
        })),
      ];

      // 3. Compute advancing teams
      const nextIds = [
        ...currentRound.byeTeamIds,
        ...currentRound.matches.map((match) => currentResults[match.id].winnerId),
      ];
      currentByes = {
        ...currentByes,
        [currentRoundNumber]: currentRound.byeTeamIds,
      };

      // Detect conference champions if round >= 12
      if (currentRoundNumber >= 12 && Object.keys(confChampions).length < 4) {
        const tempSession: CupSession = {
          ...currentSession,
          history: currentHistory,
        };
        const detected = detectConferenceChampions(tempSession, byId);
        if (Object.keys(detected).length > 0) {
          confChampions = { ...confChampions, ...detected };
        }
      }

      if (nextIds.length === 1) {
        // Final champion crowned!
        currentSession = {
          ...currentSession,
          activeTeamIds: nextIds,
          history: currentHistory,
          championId: nextIds[0],
          roundByes: currentByes,
          conferenceChampionIds: confChampions,
          results: currentResults,
        };
        break;
      }

      // Next round setup
      currentRoundNumber += 1;
      const isBracketProgression = currentRoundNumber >= 10;
      const nextClubs = nextIds.map((id) => byId.get(id)!);
      currentRound = createPhaseRound(
        nextClubs,
        currentSession.seed,
        currentRoundNumber,
        { preserveOrder: isBracketProgression },
      );
      currentResults = {};
      currentActiveIds = nextIds;

      currentSession = {
        ...currentSession,
        activeTeamIds: currentActiveIds,
        roundNumber: currentRoundNumber,
        round: currentRound,
        results: currentResults,
        history: currentHistory,
        roundByes: currentByes,
        conferenceChampionIds: confChampions,
      };
    }

    setSimulationProgress(null);
    if (await persist(currentSession)) setSelectedRound(currentSession.roundNumber);
  };

  const isOutdated = Boolean(
    dataset &&
      session &&
      !session.clubs &&
      (session.datasetVersion !== dataset.version ||
        (session.roundNumber === 1 &&
          !session.interseasonReport &&
          session.activeTeamIds.length < 30000)),
  );

  return (
    <div className="cup-container">
      {saveError && <p role="alert" className="status-panel">Sauvegarde impossible : {saveError}</p>}
      {/* Simulation Progress Overlay */}
      {simulationProgress && (
        <div className="simulation-progress-overlay" role="dialog" aria-modal="true" aria-label="Simulation en cours">
          <div className="simulation-progress-modal">
            <div className="simulation-spinner" />
            <div className="simulation-progress-text">
              <h3>⚡ Simulation nationale en cours…</h3>
              <p>
                Tour {simulationProgress.roundNumber} / 14 · {simulationProgress.phaseName}
              </p>
              <span className="simulation-progress-meta">
                {simulationProgress.remainingClubs.toLocaleString("fr-FR")} clubs encore en lice
              </span>
            </div>
            <div className="simulation-progress-bar-track">
              <div
                className="simulation-progress-bar-fill"
                style={{
                  width: `${Math.min(100, Math.round((simulationProgress.roundNumber / 14) * 100))}%`,
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Informative banner if existing save is from the older dataset */}
      {isOutdated && (
        <div className="update-banner" role="alert">
          <div className="update-banner-text">
            <span className="update-banner-badge">Mise à jour Insee</span>
            <span>
              La base officielle intègre désormais <strong>{dataset?.communes.length.toLocaleString("fr-FR")} communes</strong> (dont Paris, Marseille et Lyon). Votre sauvegarde actuelle date d'une version précédente ({session?.activeTeamIds.length.toLocaleString("fr-FR")} clubs).
            </span>
          </div>
          <button
            type="button"
            className="update-banner-btn"
            onClick={handleReset}
          >
            ⚡ Réinitialiser pour intégrer Paris, Lyon & Marseille
          </button>
        </div>
      )}

      {/* Interseason Report Banner if new season started with fusions/rivals (when not on interseason tab) */}
      {session.interseasonReport && session.roundNumber === 1 && view !== "intersaison" && (
        <div
          className="interseason-report-banner"
          style={{
            background: "linear-gradient(135deg, rgba(30, 41, 59, 0.95), rgba(15, 23, 42, 0.95))",
            border: "1px solid rgba(56, 189, 248, 0.35)",
            borderRadius: "var(--radius-lg)",
            padding: "var(--space-4)",
            marginBottom: "var(--space-4)",
            boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.3)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "var(--space-3)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
              <span style={{ fontSize: "2.2rem" }}>🤝</span>
              <div>
                <h3 style={{ margin: 0, color: "var(--color-primary-light)", fontSize: "1.2rem", display: "flex", alignItems: "center", gap: "8px" }}>
                  Bilan Intersaison · Saison {session.interseasonReport.seasonYear}
                  <span className="badge badge--emerald" style={{ fontSize: "0.75rem", padding: "2px 8px" }}>
                    Nouveaux statuts validés
                  </span>
                </h3>
                <p style={{ margin: "4px 0 0 0", color: "var(--color-text-muted)", fontSize: "0.95rem" }}>
                  <strong>{session.interseasonReport.fusions.length} alliances intercommunales</strong> actées suite aux parcours de la saison passée.
                  {session.interseasonReport.rivalCreated && (
                    <> · ⚡ <strong>1 club rival</strong> fondé à {session.interseasonReport.rivalCreated.communeName} pour challenger le champion !</>
                  )}
                  {(session.interseasonReport.secessions?.length ?? 0) > 0 && (
                    <> · 💥 <strong>{session.interseasonReport.secessions!.length} régénération{session.interseasonReport.secessions!.length > 1 ? 's' : ''}</strong> : {session.interseasonReport.secessions!.length > 1 ? 'des' : 'une'} grande{session.interseasonReport.secessions!.length > 1 ? 's' : ''} ville{session.interseasonReport.secessions!.length > 1 ? 's' : ''} (≥ 50 000 hab.) recrée{session.interseasonReport.secessions!.length > 1 ? 'nt' : ''} un club local tout en restant dans leur entente ! 🏉</>
                  )}
                </p>
              </div>
            </div>
            <button
              type="button"
              className="btn-view-palmares"
              style={{ fontSize: "0.9rem", padding: "8px 16px", cursor: "pointer", background: "linear-gradient(135deg, #0284c7, #0369a1)", color: "#ffffff", border: 0, fontWeight: 700 }}
              onClick={() => handleSetView("intersaison")}
            >
              📊 Voir le bilan complet & tableau des alliances →
            </button>
          </div>
        </div>
      )}


      {/* Top Banner & Round Navigation */}
      <div className="cup-top-bar">
        <div className="cup-title-block">
          {hasChampion ? (
            <>
              <p className="eyebrow">🏆 Sacre National · Coupe des communes {currentSeasonYear}</p>
              <h2>{champion ? champion.name : `Champion de France ${currentSeasonYear}`}</h2>
              <div className="cup-meta-tags">
                <span>Seed : {session.seed}</span>
                <span>•</span>
                <span className="badge badge--gold">🏆 Sacre National</span>
                <span>•</span>
                <span>Saison {currentSeasonYear} terminée</span>
              </div>
            </>
          ) : view === "bracket" ? (
            <>
              <p className="eyebrow">Phase Finale Nationale · Conférences & Top 4</p>
              <h2>Tableau Final de la Coupe des Communes</h2>
              <div className="cup-meta-tags">
                <span>Seed : {session.seed}</span>
                <span>•</span>
                <span>{session.activeTeamIds.length.toLocaleString("fr-FR")} clubs encore en lice</span>
              </div>
            </>
          ) : (
            <>
              <p className="eyebrow">
                {phaseLabels[round.phase]} · Tour {round.number}
              </p>
              <h2>
                {round.isCurrent
                  ? `${session.activeTeamIds.length.toLocaleString("fr-FR")} équipes encore en lice`
                  : `Tour ${round.number} terminé`}
              </h2>
              <div className="cup-meta-tags">
                <span>Seed : {session.seed}</span>
                <span>•</span>
                <span className={getRoundBadgeClass(round.number)}>Tour {round.number} · {phaseLabels[round.phase]}</span>
                {round.byeTeamIds.length > 0 && (
                  <>
                    <span>•</span>
                    <span className="badge badge--gold">
                      ⭐ {round.byeTeamIds.length} exemptés
                    </span>
                  </>
                )}
              </div>
            </>
          )}
        </div>

        <div className="cup-top-actions">
          {favoriteMatch && (
            <Link className="favorite-next-match" to={`/matchs/${encodeURIComponent(favoriteMatch.id)}`}>
              ⭐ Prochain match favori
            </Link>
          )}

          {/* Action globale Tour / Saison suivante */}
          {hasChampion ? (
            <button
              type="button"
              className="btn-top-action btn-top-next-season"
              onClick={handleNextSeason}
              title={`Lancer la Saison ${nextSeasonYear}`}
            >
              🚀 Lancer la Saison {nextSeasonYear} →
            </button>
          ) : complete ? (
            <button
              type="button"
              className="btn-top-action btn-top-advance"
              onClick={advance}
              title="Passer au tour suivant"
            >
              Passer au tour suivant →
            </button>
          ) : (
            <button
              type="button"
              className="btn-top-action btn-top-run-round"
              onClick={runAll}
              title="Simuler tous les matchs du tour actuel"
            >
              ⚡ Simuler le tour
            </button>
          )}

          {/* Simuler la compétition (à côté du bouton Reset) */}
          {!hasChampion && (
            <button
              type="button"
              className="btn-top-action btn-top-sim-competition"
              onClick={runCompetition}
              title="Simuler instantanément l'ensemble de la Coupe jusqu'à la finale"
            >
              ⚡ Simuler la compétition
            </button>
          )}

          <div className="view-switch">
            <button
              className={view === "round" ? "is-active" : ""}
              onClick={() => handleSetView("round")}
            >
              Tours
            </button>
            <button
              className={view === "bracket" ? "is-active" : ""}
              onClick={() => handleSetView("bracket")}
            >
              Tableau final
            </button>
            <button
              className={view === "stats" ? "is-active" : ""}
              onClick={() => handleSetView("stats")}
              title="Consulter le classement des buteurs et défenseurs de l'édition"
            >
              📊 Stats & Buteurs
            </button>
            <button
              className={view === "intersaison" ? "is-active" : ""}
              onClick={() => handleSetView("intersaison")}
              title="Consulter le bilan complet de l'intersaison (alliances, rivaux, régénérations)"
            >
              🤝 Intersaison
              {session.interseasonReport && session.interseasonReport.fusions.length > 0 && (
                <span className="view-switch-badge">
                  {session.interseasonReport.fusions.length}
                </span>
              )}
            </button>
          </div>

          <button
            type="button"
            className="btn-reset-cup"
            onClick={handleReset}
            title="Réinitialiser la Coupe et créer une nouvelle édition"
          >
            🔄 Réinitialiser
          </button>
        </div>
      </div>

      {hasChampion && (
        <section className="cup-champion-card" style={{ marginBottom: "var(--space-4)" }}>
          <div className="champion-sacre-header">
            <p className="eyebrow">🏆 Sacre National · Coupe des communes {currentSeasonYear}</p>
            <h2>{champion ? <TeamLink team={champion} /> : effectiveChampionId}</h2>
            <p style={{ color: "var(--color-text-muted)", fontSize: "1.1rem" }}>
              {champion?.population.toLocaleString("fr-FR")} habitants · Département{" "}
              {champion ? departmentLabel(champion.departmentId) : ""} · Seed {session.seed}
            </p>
          </div>

          <div className="next-season-banner">
            <div className="next-season-content">
              <span className="next-season-icon">🚀</span>
              <div>
                <h3 className="next-season-title">Lancer la Saison {nextSeasonYear}</h3>
                <p className="next-season-desc">
                  Le sacre de <strong>{champion?.name ?? "l'équipe"}</strong> ({currentSeasonYear}) et les 4 champions de conférence seront archivés au Palmarès.
                  La Coupe {nextSeasonYear} débutera avec les fusions intercommunales et les évolutions de clubs !
                </p>
              </div>
            </div>
            <div className="next-season-actions">
              <Link to={`/trophees?saison=${currentSeasonYear}`} className="btn-view-palmares">
                ✦ Assister à la remise des trophées
              </Link>
              <Link to="/palmares" className="btn-view-palmares">
                🏆 Consulter le Palmarès
              </Link>
              <Link to="/historique" className="btn-view-palmares">
                📜 Historique des saisons
              </Link>
            </div>
          </div>
        </section>
      )}

      {view === "bracket" ? (
        <FinalBracket
          rounds={rounds}
          byId={byId}
          session={session}
          onRunAll={runAll}
          onRunCompetition={runCompetition}
          onAdvance={advance}
          isComplete={complete}
        />
      ) : view === "stats" ? (
        <CompetitionStatsView
          session={session}
          persons={appContext?.persons ?? session.persons ?? []}
          clubsById={byId}
        />
      ) : view === "intersaison" ? (
        <InterseasonView
          currentReport={session.interseasonReport}
          currentSeasonYear={currentSeasonYear}
          archives={appContext?.archives ?? []}
          clubsById={byId}
        />
      ) : (
        <>
          {/* Round Selector */}
          <nav ref={roundTabsRef} className="round-tabs-container" aria-label="Tours de la Coupe">
            <div className="round-tabs">
              {rounds.map((item) => {
                const echelonTabClass =
                  item.number >= 13
                    ? "round-tab-btn--national"
                    : item.number >= 9
                      ? "round-tab-btn--conf"
                      : item.number >= 5
                        ? "round-tab-btn--region"
                        : "round-tab-btn--dept";
                return (
                  <button
                    key={item.number}
                    className={`round-tab-btn ${echelonTabClass} ${item.number === round.number ? "is-active" : ""}`}
                    onClick={() => handleSelectRound(item.number)}
                  >
                    <span>Tour {item.number}</span>
                    <small>{phaseLabels[item.phase]}</small>
                    <span className="round-tab-status">{item.isCurrent ? "● En cours" : "✓ Terminé"}</span>
                  </button>
                );
              })}
            </div>
          </nav>

          {/* Bandeau de déroulement et flux du tour (Tâche 12) */}
          {(() => {
            const participantsCount = round.matches.length * 2 + round.byeTeamIds.length;
            const qualifiersCount = round.matches.length + round.byeTeamIds.length;
            const nextPhaseName = phaseLabels[phaseForCount(qualifiersCount)];
            return (
              <div className="round-flow-banner" role="region" aria-label="Déroulement et flux du tour">
                <div className="round-flow-step">
                  <span className="round-flow-step-icon">👥</span>
                  <div className="round-flow-step-content">
                    <strong>{participantsCount.toLocaleString("fr-FR")} clubs</strong>
                    <small>au départ du Tour {round.number}</small>
                  </div>
                </div>

                <span className="round-flow-arrow" aria-hidden="true">➔</span>

                <div className="round-flow-step">
                  <span className="round-flow-step-icon">⚽</span>
                  <div className="round-flow-step-content">
                    <strong>{round.matches.length.toLocaleString("fr-FR")} match{round.matches.length > 1 ? "s" : ""}</strong>
                    <small>
                      {round.byeTeamIds.length > 0
                        ? `+ ${round.byeTeamIds.length.toLocaleString("fr-FR")} exempté${round.byeTeamIds.length > 1 ? "s" : ""}`
                        : "élimination directe"}
                    </small>
                  </div>
                </div>

                <span className="round-flow-arrow" aria-hidden="true">➔</span>

                <div className="round-flow-step round-flow-step--next">
                  <span className="round-flow-step-icon">🏆</span>
                  <div className="round-flow-step-content">
                    <strong>{qualifiersCount.toLocaleString("fr-FR")} qualifié{qualifiersCount > 1 ? "s" : ""}</strong>
                    <small>
                      {qualifiersCount === 1
                        ? "Champion de France 🏆"
                        : `pour le Tour ${round.number + 1} (${nextPhaseName})`}
                    </small>
                  </div>
                </div>

                <div className="round-flow-explainer">
                  <span>ℹ️</span> Les vainqueurs de chaque rencontre et les clubs exemptés avancent directement au tour suivant.
                </div>
              </div>
            );
          })()}

          {/* Master-Detail Split Layout */}
          <div className="cup-layout-split">
            {/* LEFT SIDEBAR: Territory / Department List */}
            <aside className="cup-sidebar" aria-label="Navigation des territoires">
              <div className="cup-sidebar-header">
                <div className="sidebar-title-row">
                  <h3 className="sidebar-title">
                    {phaseTerritoryTypeLabel[round.phase]}
                  </h3>
                  <span className="sidebar-count-badge">
                    {allTerritoryIds.length}
                  </span>
                </div>

                <div className="sidebar-search-box">
                  <span className="sidebar-search-icon">🔍</span>
                  <input
                    type="text"
                    className="sidebar-search-input"
                    placeholder="Filtrer (nom ou N°)..."
                    value={sidebarSearch}
                    onChange={(e) => setSidebarSearch(e.target.value)}
                  />
                </div>

                <div className="sidebar-filters">
                  <button
                    className={`sidebar-filter-btn ${sidebarFilter === "all" ? "is-active" : ""}`}
                    onClick={() => handleSetSidebarFilter("all")}
                  >
                    Tous
                  </button>
                  <button
                    className={`sidebar-filter-btn ${sidebarFilter === "pending" ? "is-active" : ""}`}
                    onClick={() => handleSetSidebarFilter("pending")}
                  >
                    En cours
                  </button>
                  <button
                    className={`sidebar-filter-btn ${sidebarFilter === "completed" ? "is-active" : ""}`}
                    onClick={() => handleSetSidebarFilter("completed")}
                  >
                    Terminés
                  </button>
                </div>
              </div>

              <div className="territory-list">
                {filteredSidebarTerritories.map((id) => {
                  const meta = territoryMap.get(id);
                  if (!meta) return null;
                  const isActive = id === activeTerritory;

                  return (
                    <button
                      key={id}
                      className={`territory-item-btn ${isActive ? "is-active" : ""}`}
                      onClick={() => handleSelectTerritory(id)}
                    >
                      <span className="territory-code-pill">{id}</span>
                      <span className="territory-name-label" title={meta.name}>
                        {meta.name}
                      </span>
                      <span
                        className={`territory-status-indicator ${
                          meta.isDone ? "is-complete" : "is-pending"
                        }`}
                      >
                        {meta.matches.length > 0 ? (
                          meta.isDone ? (
                            `✓ ${meta.matches.length}`
                          ) : (
                            `${meta.completedCount}/${meta.matches.length}`
                          )
                        ) : meta.byes.length > 0 ? (
                          `⭐ ${meta.byes.length}`
                        ) : (
                          "0"
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            </aside>

            {/* RIGHT MAIN CONTENT: Active Department / Territory Detail */}
              <div className="cup-main-panel">
              {/* Territory Banner Header */}
              <div className="territory-banner">
                <div className="territory-banner-info">
                  <p className="eyebrow">{phaseLabels[round.phase]}</p>
                  <h3>
                    <span>{territoryName(activeTerritory, round.phase)}</span>
                  </h3>
                  {round.phase === "DEPARTMENT" && (
                    <p className="territory-region-subtitle">
                      Région : {regionLabel(byId.get(deptMatches[0]?.homeTeamId ?? deptByes[0]?.id)?.regionId ?? "")}
                    </p>
                  )}
                  {round.phase === "REGION" && (
                    <p className="territory-region-subtitle">
                      Conférence : {conferenceLabel(byId.get(deptMatches[0]?.homeTeamId ?? deptByes[0]?.id)?.conferenceId ?? conferenceForRegion(activeTerritory))}
                      {deptMatches.some((m) => {
                        const h = byId.get(m.homeTeamId);
                        const a = byId.get(m.awayTeamId);
                        return h && a && h.regionId !== a.regionId;
                      }) && (
                        <span className="territory-has-inter"> · Comporte des affiches inter-régionales</span>
                      )}
                    </p>
                  )}
                </div>

                {/* Territory Stat Cards */}
                <div className="territory-stats-strip">
                  <div className="territory-stat-card">
                    <small>Matchs</small>
                    <strong>
                      {deptCompletedCount} / {deptMatches.length}
                    </strong>
                  </div>
                  <div className={`territory-stat-card ${deptByes.length > 0 ? "stat-exempt" : ""}`}>
                    <small>Exemptés</small>
                    <strong>
                      {deptByes.length} {deptByes.length > 1 ? "clubs" : "club"}
                    </strong>
                  </div>
                  <div className="territory-stat-card">
                    <small>Total clubs</small>
                    <strong>
                      {activeMeta?.totalClubs ?? 0}
                    </strong>
                  </div>
                </div>
              </div>

              {/* Action Toolbar */}
              {round.isCurrent && (
                <div className="round-actions-bar">
                  <div className="round-action-progress">
                    <div className="round-action-progress-label">
                      <strong>Progression du tour</strong>
                      <span>{totalRoundResults} / {totalRoundMatches} matchs</span>
                    </div>
                    <progress max={Math.max(1, totalRoundMatches)} value={totalRoundResults} aria-label="Progression du tour" />
                  </div>
                  <div className="actions-group-dept">
                    {deptMatches.length > 0 && !deptIsCompleted && (
                      <button
                        className="btn-primary"
                        onClick={() => runDepartmentMatches(activeTerritory)}
                        title={`Simule tous les matchs de ${round.phase === "REGION" ? "cette région" : round.phase === "CONFERENCE" ? "cette conférence" : "ce département"}`}
                      >
                        ⚡ Simuler {round.phase === "REGION" ? "cette région" : round.phase === "CONFERENCE" ? "cette conférence" : "ce département"}
                      </button>
                    )}
                  </div>

                  <div className="actions-group-global">
                    {!complete && (
                      <button className={deptIsCompleted ? "btn-primary" : "btn-secondary"} onClick={runAll}>
                        🌐 Simuler tout le tour
                      </button>
                    )}
                    {complete && (
                      <button className="btn-primary" onClick={advance}>
                        Passer à la journée suivante →
                      </button>
                    )}
                    {!session.championId && (
                      <button
                        type="button"
                        className="btn-accent"
                        style={{
                          background: "linear-gradient(135deg, #f59e0b, #d97706)",
                          color: "#ffffff",
                          fontWeight: 700,
                          border: "none",
                          cursor: "pointer",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "6px",
                          boxShadow: "0 2px 8px rgba(245, 158, 11, 0.35)",
                        }}
                        onClick={runCompetition}
                        title="Simule instantanément l'ensemble de la Coupe jusqu'à la finale et au sacre du champion"
                      >
                        ⚡ Simuler la compétition
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* MATCHES SECTION */}
              <section className="matches-section" aria-label="Liste des matchs">
                <div className="matches-toolbar">
                  <input
                    type="text"
                    className="search-matches-input"
                    id="match-search"
                    placeholder="Rechercher un club dans ce département..."
                    value={matchQuery}
                    onChange={(e) => handleSetMatchQuery(e.target.value)}
                  />

                  <div className="matches-filter-chips">
                    <button
                      className={`match-filter-chip ${matchStatusFilter === "all" ? "is-active" : ""}`}
                      onClick={() => handleSetMatchStatusFilter("all")}
                    >
                      Tous ({deptMatches.length})
                    </button>
                    <button
                      className={`match-filter-chip ${matchStatusFilter === "pending" ? "is-active" : ""}`}
                      onClick={() => handleSetMatchStatusFilter("pending")}
                    >
                      À jouer ({deptPendingCount})
                    </button>
                    <button
                      className={`match-filter-chip ${matchStatusFilter === "completed" ? "is-active" : ""}`}
                      onClick={() => handleSetMatchStatusFilter("completed")}
                    >
                      Terminés ({deptCompletedCount})
                    </button>
                  </div>
                </div>

                {visibleMatches.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "2.5rem 1rem", color: "var(--color-text-muted)" }}>
                    <p>Aucun match ne correspond à vos filtres.</p>
                  </div>
                ) : (
                  <>
                    <div className="match-list">
                      {paginatedMatches.map((match: DrawMatch) => {
                        const home = byId.get(match.homeTeamId);
                        const away = byId.get(match.awayTeamId);
                        const result = round.results[match.id];
                        const isFinished = Boolean(result);
                        const isHomeWinner = result?.winnerId === match.homeTeamId;
                        const isAwayWinner = result?.winnerId === match.awayTeamId;

                        const isHomeFav = appContext?.isFavorite(match.homeTeamId) ?? false;
                        const isAwayFav = appContext?.isFavorite(match.awayTeamId) ?? false;
                        const homeColor = isHomeFav ? appContext?.getFavoriteColor(match.homeTeamId) : undefined;
                        const awayColor = isAwayFav ? appContext?.getFavoriteColor(match.awayTeamId) : undefined;
                        const favColor = homeColor ?? awayColor;

                        const isInterRegion = round.phase === "REGION" && home && away && home.regionId !== away.regionId;
                        const isUpset = Boolean(isFinished && result && home && away && isMatchUpset(home, away, result));

                        return (
                          <div
                            className={`match-card ${isFinished ? "is-finished" : ""} ${isUpset ? "is-upset-match" : ""} ${favColor ? "is-favorite-match" : ""}`}
                            style={favColor ? { borderLeftColor: favColor, borderLeftWidth: "3px" } : undefined}
                            key={match.id}
                          >
                            {/* Home Team */}
                            <div className={`match-team ${isHomeWinner ? "team-winner" : ""}`}>
                              {home ? <ClubBadge club={home} /> : <div className="team-badge-circle">DOM</div>}
                              <div className="team-details">
                                <div className="team-name-row">
                                  {home && <FavoriteStarButton teamId={home.id} teamName={home.name} size="sm" />}
                                  {home && (
                                    <Link className="team-link" to={`/equipes/${home.id}`} title={home.name}>
                                      {home.name}
                                    </Link>
                                  )}
                                </div>
                                {home && (
                                  <div className="team-trophies-row">
                                    <TeamTrophyBadges teamId={home.id} size="xs" />
                                  </div>
                                )}
                                <span className="team-meta">
                                  {round.phase === "REGION" && home ? (
                                    <span className="team-territory-tag">{regionLabel(home.regionId)} ({home.departmentId}) · </span>
                                  ) : round.phase === "DEPARTMENT" && home ? (
                                    <span className="team-territory-tag">Dép. {home.departmentId} · </span>
                                  ) : null}
                                  {home?.population.toLocaleString("fr-FR")} hab.
                                </span>
                              </div>
                            </div>

                            {/* Center Score / VS */}
                            <div className="match-score-box">
                              <Link
                                className={`score-badge-link ${isFinished ? "is-live-result" : ""}`}
                                to={`/matchs/${encodeURIComponent(match.id)}`}
                                title="Voir le compte rendu du match"
                              >
                                {result
                                  ? `${result.homeScore} – ${result.awayScore}`
                                  : "VS"}
                                {result?.isExtraTime && (
                                  <span className="score-extra-tag" title="Après prolongation / T.A.B.">
                                    a.p.
                                  </span>
                                )}
                              </Link>
                              <Link
                                className="score-sublink"
                                to={`/matchs/${encodeURIComponent(match.id)}`}
                              >
                                {isFinished ? "Voir le match" : "Suivre et revoir"}
                              </Link>
                              {isUpset && (
                                <span className="match-upset-badge" title="Exploit face à un club hiérarchiquement supérieur !">
                                  ⚡ Exploit !
                                </span>
                              )}
                              {isInterRegion && (
                                <span className="match-inter-badge" title="Match de cadrage inter-régional au sein de la même Conférence">
                                  ⚔️ Inter-régions
                                </span>
                              )}
                            </div>

                            {/* Away Team */}
                            <div
                              className={`match-team team-away ${
                                isAwayWinner ? "team-winner" : ""
                              }`}
                            >
                              <div className="team-details">
                                <div className="team-name-row team-name-row--away">
                                  {away && (
                                    <Link className="team-link" to={`/equipes/${away.id}`} title={away.name}>
                                      {away.name}
                                    </Link>
                                  )}
                                  {away && <FavoriteStarButton teamId={away.id} teamName={away.name} size="sm" />}
                                </div>
                                {away && (
                                  <div className="team-trophies-row team-trophies-row--away">
                                    <TeamTrophyBadges teamId={away.id} size="xs" />
                                  </div>
                                )}
                                <span className="team-meta">
                                  {round.phase === "REGION" && away ? (
                                    <span className="team-territory-tag">{regionLabel(away.regionId)} ({away.departmentId}) · </span>
                                  ) : round.phase === "DEPARTMENT" && away ? (
                                    <span className="team-territory-tag">Dép. {away.departmentId} · </span>
                                  ) : null}
                                  {away?.population.toLocaleString("fr-FR")} hab.
                                </span>
                              </div>
                              {away ? <ClubBadge club={away} /> : <div className="team-badge-circle">EXT</div>}
                            </div>

                            {/* Action Button */}
                            <div className="match-action-col">
                              {round.isCurrent && !isFinished ? (
                                <button
                                  className="match-play-btn"
                                  onClick={() => runMatch(match.id)}
                                >
                                  ⚡ Jouer vite
                                </button>
                              ) : (
                                <span className="match-done-badge">
                                  {isFinished ? "Terminé ✓" : "Archivé"}
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {totalMatchPages > 1 && (
                      <div className="pagination" style={{ marginTop: "var(--space-4)" }}>
                        <button
                          disabled={matchPage === 0}
                          onClick={() => setMatchPage((p) => Math.max(0, p - 1))}
                        >
                          ← Précédent
                        </button>
                        <span style={{ fontWeight: 600, color: "var(--color-text-muted)" }}>
                          Page {matchPage + 1} sur {totalMatchPages} ({visibleMatches.length} matchs)
                        </span>
                        <button
                          disabled={matchPage + 1 >= totalMatchPages}
                          onClick={() => setMatchPage((p) => Math.min(totalMatchPages - 1, p + 1))}
                        >
                          Suivant →
                        </button>
                      </div>
                    )}
                  </>
                )}
              </section>
              {deptByes.length > 0 && (
                <details className="byes-card">
                  <summary className="byes-header">
                    <span className="byes-title">⭐ Clubs exemptés de ce tour ({deptByes.length})</span>
                    <span className="badge badge--gold">Qualifiés d'office · Voir la liste</span>
                  </summary>
                  <p className="byes-description">
                    Ces clubs sont qualifiés pour le Tour {round.number + 1} sans jouer ce tour, selon le tirage et les quotas territoriaux.
                  </p>
                  <div className="byes-grid">
                    {deptByes.map((club: Commune) => (
                      <div className="bye-item" key={club.id}>
                        <div className="bye-info">
                          <TeamLink team={club} />
                          <small>{club.population.toLocaleString("fr-FR")} hab.</small>
                        </div>
                        <span className="bye-tag">Exempté</span>
                      </div>
                    ))}
                  </div>
                </details>
              )}
              </div>

            {/* RIGHT SIDEBAR: Favorites and Round Journal */}
            <CupRightPanel round={round} byId={byId} onRunMatch={runMatch} />
          </div>
        </>
      )}
    </div>
  );
}
