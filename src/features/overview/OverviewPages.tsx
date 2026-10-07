import { useEffect, useState, useMemo } from "react";
import { loadGeography, conferenceForRegion } from "../geography/loadGeography";
import type { Commune, GeographyDataset } from "../geography/types";
import type { Club } from "../teams/types";
import { buildClubsFromCommunes } from "../teams/clubGenerator";
import { archiveClubs } from '../history/archiveClubs';
import { useDetailedArchives } from '../storage/useDetailedArchives';
import { cupRepository, type CupSession, type SeasonArchive } from "../storage/cupRepository";
import { departmentLabel, conferenceLabel, getConferenceShortName } from "../geography/territoryLabels";
import { getRoundBadgeClass, getStageBadgeClass } from "../competition/echelonColors";
import { TeamLink } from "../teams/TeamLink";
import { CoachBadge } from '../coaches/CoachBadge';
import { Link, useSearchParams } from "react-router-dom";
import { useOptionalCupApp } from "../../app/CupAppContext";
import {
  getRankedPalmares,
  buildSeasonArchive,
  computeRegionPalmares,
  computeDepartmentPalmares,
  type TeamTrophyRecord,
} from "../history/palmaresSelectors";
import { PalmaresPlayersView } from "./PalmaresPlayersView";

function useOverview() {
  const appContext = useOptionalCupApp();
  const [localData, setLocalData] = useState<GeographyDataset | null>(null);
  const [localSession, setLocalSession] = useState<CupSession | undefined>();
  const [localArchives, setLocalArchives] = useState<SeasonArchive[]>([]);

  useEffect(() => {
    if (appContext) return;
    const loadArch = cupRepository.loadArchives ? cupRepository.loadArchives() : Promise.resolve([]);
    void Promise.all([loadGeography(), cupRepository.load(), loadArch]).then(
      ([dataset, saved, archives]) => {
        setLocalData(dataset);
        setLocalSession(saved);
        setLocalArchives(archives ?? []);
      },
    );
  }, [appContext]);

  return {
    appContext,
    data: appContext?.dataset ?? localData,
    session: appContext?.session ?? localSession,
    archives: appContext?.archives ?? localArchives,
    teamRecords: appContext?.teamRecords,
    persons: appContext?.persons ?? localSession?.persons ?? [],
  };
}

export function HistoryPage() {
  const { appContext, data, session, archives: archiveSummaries } = useOverview();
  const { archives, loading: archivesLoading, error: archivesError } = useDetailedArchives(archiveSummaries);
  const [searchParams, setSearchParams] = useSearchParams();
  const saisonParam = searchParams.get("saison");
  const initialSeason = saisonParam
    ? (saisonParam.startsWith("archive-") || saisonParam === "active" ? saisonParam : `archive-${saisonParam}`)
    : "active";
  const [selectedSeasonKey, setSelectedSeasonKey] = useState<string>(initialSeason);
  const [page, setPage] = useState(0);

  useEffect(() => {
    if (saisonParam) {
      const key = saisonParam.startsWith("archive-") || saisonParam === "active" ? saisonParam : `archive-${saisonParam}`;
      setSelectedSeasonKey(key);
    }
  }, [saisonParam]);

  const handleSelectSeason = (key: string) => {
    setSelectedSeasonKey(key);
    setPage(0);
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (key === "active") {
          next.delete("saison");
        } else {
          next.set("saison", key.replace("archive-", ""));
        }
        return next;
      },
      { replace: true },
    );
  };

  // Available seasons for history view
  const availableSeasons = useMemo(() => {
    const list: Array<{ key: string; label: string; year: number; isArchived: boolean }> = [];
    if (session) {
      list.push({
        key: "active",
        label: `Saison ${session.seasonYear ?? 2026} (En cours)`,
        year: session.seasonYear ?? 2026,
        isArchived: false,
      });
    }
    const sortedArchives = [...archives].sort((a, b) => b.year - a.year);
    for (const a of sortedArchives) {
      list.push({
        key: `archive-${a.year}`,
        label: `Saison ${a.year} (Archivée)`,
        year: a.year,
        isArchived: true,
      });
    }
    return list;
  }, [session, archives]);

  // Selected season data
  const currentArchive = useMemo(() => {
    if (selectedSeasonKey.startsWith("archive-")) {
      const year = parseInt(selectedSeasonKey.replace("archive-", ""), 10);
      return archives.find((a) => a.year === year);
    }
    return null;
  }, [selectedSeasonKey, archives]);

  const allMatches = useMemo(() => {
    if (currentArchive) {
      return [...currentArchive.history].reverse();
    }
    return session?.history ? session.history.slice().reverse() : [];
  }, [currentArchive, session?.history]);

  const byId = useMemo(
    () => currentArchive && data ? archiveClubs(currentArchive, data) : appContext?.clubsById ?? (data ? new Map(buildClubsFromCommunes(data.communes).map((team) => [team.id, team])) : new Map<string, Club>()),
    [appContext?.clubsById, data, currentArchive],
  );

  if (!data || archivesLoading) return <section className="status-panel">Chargement des archives…</section>;
  if (archivesError) return <section className="status-panel" role="alert">Archives indisponibles : {archivesError}</section>;

  const pageSize = 50;
  const totalPages = Math.max(1, Math.ceil(allMatches.length / pageSize));
  const visibleMatches = allMatches.slice(page * pageSize, (page + 1) * pageSize);

  return (
    <section className="cup-ready">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "var(--space-3)" }}>
        <div>
          <p className="eyebrow">Résultats archivés</p>
          <h2>Historique des matchs</h2>
        </div>

        {/* Season Selector */}
        {availableSeasons.length > 1 && (
          <div className="matches-filter-chips">
            {availableSeasons.map((s) => (
              <button
                key={s.key}
                type="button"
                className={`match-filter-chip ${selectedSeasonKey === s.key ? "is-active" : ""}`}
                onClick={() => handleSelectSeason(s.key)}
              >
                {s.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {currentArchive && (
        <div className="archive-summary-banner" style={{ marginTop: "var(--space-3)", marginBottom: "var(--space-4)" }}>
          <span className="badge badge--gold">🏆 Archive Saison {currentArchive.year}</span>
          <span>Champion de France : <strong>{byId.get(currentArchive.nationalChampionId)?.name ?? currentArchive.nationalChampionId}</strong></span>
          <span>· Entraîneur : <CoachBadge coach={currentArchive.teamPerformances[currentArchive.nationalChampionId]?.coach} /></span>
          {currentArchive.finalistId && (
            <span>· Finaliste : <strong>{byId.get(currentArchive.finalistId)?.name ?? currentArchive.finalistId}</strong></span>
          )}
          <span>· {currentArchive.totalMatches} matchs enregistrés</span>
        </div>
      )}

      {allMatches.length === 0 ? (
        <p style={{ color: "var(--color-text-muted)", marginTop: "var(--space-4)" }}>
          Aucun match joué dans cette saison pour le moment.
        </p>
      ) : (
        <>
          <div className="matches-table-wrap">
            <table className="matches-table">
              <thead>
                <tr>
                  <th>Tour</th>
                  <th>Club Domicile</th>
                  <th style={{ textAlign: "center" }}>Score</th>
                  <th>Club Extérieur</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {visibleMatches.map((match) => {
                  const home = byId.get(match.homeTeamId);
                  const away = byId.get(match.awayTeamId);
                  const isHomeWinner = match.result.winnerId === match.homeTeamId;
                  const isAwayWinner = match.result.winnerId === match.awayTeamId;

                  return (
                    <tr key={match.result.matchId}>
                      <td>
                        <span className={getRoundBadgeClass(match.roundNumber)}>T{match.roundNumber}</span>
                      </td>
                      <td style={{ fontWeight: isHomeWinner ? 800 : 500, color: isHomeWinner ? "var(--color-accent-light)" : "inherit" }}>
                        {home ? <TeamLink team={home} /> : match.homeTeamId}
                        <span className="coach-history-inline"><CoachBadge coach={currentArchive ? currentArchive.teamPerformances[match.homeTeamId]?.coach : home?.coach} /></span>
                      </td>
                      <td className="score-cell">
                        <Link
                          className="score-badge-link"
                          to={`/matchs/${encodeURIComponent(match.result.matchId)}?saison=${currentArchive?.year ?? session?.seasonYear ?? 2026}`}
                          style={{ fontSize: "0.95rem", padding: "0.2rem 0.6rem" }}
                        >
                          {match.result.homeScore} – {match.result.awayScore}
                        </Link>
                      </td>
                      <td style={{ fontWeight: isAwayWinner ? 800 : 500, color: isAwayWinner ? "var(--color-accent-light)" : "inherit" }}>
                        {away ? <TeamLink team={away} /> : match.awayTeamId}
                        <span className="coach-history-inline"><CoachBadge coach={currentArchive ? currentArchive.teamPerformances[match.awayTeamId]?.coach : away?.coach} /></span>
                      </td>
                      <td>
                        <Link
                          to={`/matchs/${encodeURIComponent(match.result.matchId)}?saison=${currentArchive?.year ?? session?.seasonYear ?? 2026}`}
                          style={{ fontSize: "0.85rem", fontWeight: 700 }}
                        >
                          Détails
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div className="pagination">
              <button disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>
                ← Précédent
              </button>
              <span style={{ fontWeight: 600, color: "var(--color-text-muted)" }}>
                Page {page + 1} sur {totalPages} ({allMatches.length} matchs)
              </span>
              <button disabled={page + 1 >= totalPages} onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}>
                Suivant →
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}

export function TerritoriesPage() {
  const { data, session } = useOverview();
  const [filter, setFilter] = useState("");

  const conferences = useMemo(() => {
    if (!data) return [];
    const active = new Set(session?.activeTeamIds ?? []);
    const map = new Map<string, { total: number; active: number }>();
    for (const team of data.communes) {
      const conf = team.conferenceId || "CONF_NORD";
      const val = map.get(conf) ?? { total: 0, active: 0 };
      val.total += 1;
      if (active.has(team.id)) val.active += 1;
      map.set(conf, val);
    }
    const order = ["CONF_OUEST", "CONF_NORD", "CONF_SUD_OUEST", "CONF_SUD_EST"];
    return order
      .map((id) => {
        const stats = map.get(id) ?? { total: 0, active: 0 };
        return {
          id,
          name: conferenceLabel(id),
          total: stats.total,
          active: stats.active,
          percent: stats.total > 0 ? (stats.active / stats.total) * 100 : 0,
        };
      })
      .filter((c) => c.total > 0);
  }, [data, session?.activeTeamIds]);

  const departments = useMemo(() => {
    if (!data) return [];
    const active = new Set(session?.activeTeamIds ?? []);
    const map = new Map<string, { total: number; active: number }>();
    for (const team of data.communes) {
      const val = map.get(team.departmentId) ?? { total: 0, active: 0 };
      val.total += 1;
      if (active.has(team.id)) val.active += 1;
      map.set(team.departmentId, val);
    }
    return Array.from(map.entries())
      .map(([id, stats]) => ({
        id,
        name: departmentLabel(id),
        total: stats.total,
        active: stats.active,
        percent: stats.total > 0 ? (stats.active / stats.total) * 100 : 0,
      }))
      .sort((a, b) => a.id.localeCompare(b.id));
  }, [data, session?.activeTeamIds]);

  if (!data) return <section className="status-panel">Chargement…</section>;

  const filteredDepts = departments.filter((d) =>
    `${d.id} ${d.name}`.toLocaleLowerCase("fr").includes(filter.toLocaleLowerCase("fr")),
  );

  return (
    <section className="cup-ready">
      <p className="eyebrow">Vue géographique</p>
      <h2>Les 4 Grandes Conférences & Territoires</h2>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "var(--space-4)", marginBottom: "var(--space-6)" }}>
        {conferences.map((conf) => (
          <div key={conf.id} className="stat-card" style={{ padding: "var(--space-4)", borderRadius: "var(--radius-lg)", border: "1px solid var(--color-border)", background: "var(--color-surface)" }}>
            <div style={{ fontSize: "0.85rem", color: "var(--color-text-muted)", fontWeight: 600 }}>{conf.name}</div>
            <div style={{ fontSize: "1.4rem", fontWeight: 800, marginTop: "var(--space-1)" }}>
              {session ? conf.active.toLocaleString("fr-FR") : conf.total.toLocaleString("fr-FR")}{" "}
              <span style={{ fontSize: "0.9rem", color: "var(--color-text-muted)", fontWeight: 500 }}>
                {session ? `/ ${conf.total.toLocaleString("fr-FR")} clubs` : "communes"}
              </span>
            </div>
            {session && (
              <div style={{ fontSize: "0.8rem", color: "var(--color-accent-light)", marginTop: "var(--space-1)", fontWeight: 600 }}>
                {conf.percent.toFixed(1)}% encore en lice
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="table-toolbar">
        <label htmlFor="dept-search">Rechercher un département</label>
        <input
          id="dept-search"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Nom ou numéro de département..."
        />
      </div>

      <div className="matches-table-wrap">
        <table className="matches-table">
          <thead>
            <tr>
              <th>N°</th>
              <th>Département</th>
              <th>Clubs au départ</th>
              <th>Encore en lice</th>
              <th>Taux de survie</th>
            </tr>
          </thead>
          <tbody>
            {filteredDepts.map((d) => (
              <tr key={d.id}>
                <td>
                  <span className="badge badge--neutral">{d.id}</span>
                </td>
                <td style={{ fontWeight: 700 }}>{d.name}</td>
                <td>{d.total.toLocaleString("fr-FR")}</td>
                <td>
                  {session ? (
                    <strong style={{ color: d.active > 0 ? "var(--color-accent-light)" : "var(--color-text-dim)" }}>
                      {d.active.toLocaleString("fr-FR")}
                    </strong>
                  ) : (
                    "—"
                  )}
                </td>
                <td>
                  {session ? (
                    <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                      <div
                        style={{
                          flex: 1,
                          maxWidth: "8rem",
                          height: "6px",
                          borderRadius: "4px",
                          background: "var(--color-surface-elevated)",
                          overflow: "hidden",
                        }}
                      >
                        <div
                          style={{
                            width: `${d.percent}%`,
                            height: "100%",
                            background: "linear-gradient(90deg, #10b981, #3b82f6)",
                            borderRadius: "4px",
                          }}
                        />
                      </div>
                      <span style={{ fontSize: "0.8rem", color: "var(--color-text-muted)", minWidth: "3rem" }}>
                        {d.percent.toFixed(1)}%
                      </span>
                    </div>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}


export function ConferenceBadge({ conferenceId }: { conferenceId?: string }) {
  if (!conferenceId) return null;
  const shortName = getConferenceShortName(conferenceId);
  if (!shortName) return null;

  const confClass =
    shortName === "Nord"
      ? "conf-badge--nord"
      : shortName === "Ouest"
        ? "conf-badge--ouest"
        : shortName === "Sud-Ouest"
          ? "conf-badge--sud-ouest"
          : shortName === "Sud-Est"
            ? "conf-badge--sud-est"
            : "";

  return (
    <span
      className={`palmares-conf-badge ${confClass}`}
      title={conferenceLabel(conferenceId)}
      aria-label={`Conférence ${shortName}`}
    >
      {shortName}
    </span>
  );
}

export function TitleCountBadge({
  count,
  title,
  type = "national",
}: {
  count: number;
  title?: string;
  type?: "national" | "conf" | "general";
}) {
  if (count <= 1) return null;
  const icon = type === "conf" ? "👑" : "⭐";
  const label = `${count}e`;
  const defaultTitle =
    type === "conf" ? `${count}e titre de conférence` : `${count}e titre de Champion de France`;

  return (
    <span
      className={`palmares-title-count-badge palmares-title-count-badge--${type}`}
      title={title ?? defaultTitle}
      aria-label={title ?? defaultTitle}
    >
      <span className="badge-icon" aria-hidden="true">{icon}</span>
      <span className="badge-num">{label}</span>
    </span>
  );
}

function EditionPodiumDetail({
  edition,
  byId,
  titleCounts,
}: {
  edition: SeasonArchive;
  byId: Map<string, Club | Commune>;
  titleCounts?: {
    nationalCounts: Map<string, number>;
    confCounts: Map<string, number>;
  };
}) {
  const getClub = (clubId?: string) => {
    if (!clubId) return undefined;
    return byId.get(clubId) ?? byId.get(clubId.split("-")[0]);
  };

  const champ = getClub(edition.nationalChampionId);
  const champConfId = champ?.conferenceId ?? (champ?.regionId ? conferenceForRegion(champ.regionId) : undefined);
  const champCount = titleCounts?.nationalCounts.get(`${edition.year}:${edition.nationalChampionId}`) ?? 1;

  const finalMatch = edition.finalMatch ?? edition.history?.find(
    (m) => m.roundNumber === 14 && (m.homeTeamId === edition.nationalChampionId || m.awayTeamId === edition.nationalChampionId),
  );
  const finalistId = edition.finalistId ?? (finalMatch ? (finalMatch.homeTeamId === edition.nationalChampionId ? finalMatch.awayTeamId : finalMatch.homeTeamId) : undefined);
  const fin = getClub(finalistId);

  const getConfWinnerId = (confKey: string, altKeys: string[] = []) => {
    if (!edition.conferenceChampions) return undefined;
    if (edition.conferenceChampions[confKey]) return edition.conferenceChampions[confKey];
    for (const k of altKeys) {
      if (edition.conferenceChampions[k]) return edition.conferenceChampions[k];
    }
    return undefined;
  };

  const confNordId = getConfWinnerId("CONF_NORD", ["NORD", "north"]);
  const confOuestId = getConfWinnerId("CONF_OUEST", ["OUEST", "west"]);
  const confSudOuestId = getConfWinnerId("CONF_SUD_OUEST", ["SUD_OUEST", "south_west"]);
  const confSudEstId = getConfWinnerId("CONF_SUD_EST", ["SUD_EST", "south_east", "EST"]);

  const confNord = getClub(confNordId);
  const confOuest = getClub(confOuestId);
  const confSudOuest = getClub(confSudOuestId);
  const confSudEst = getClub(confSudEstId);

  const confNordCount = confNordId ? (titleCounts?.confCounts.get(`${edition.year}:${confNordId}`) ?? 1) : 1;
  const confOuestCount = confOuestId ? (titleCounts?.confCounts.get(`${edition.year}:${confOuestId}`) ?? 1) : 1;
  const confSudOuestCount = confSudOuestId ? (titleCounts?.confCounts.get(`${edition.year}:${confSudOuestId}`) ?? 1) : 1;
  const confSudEstCount = confSudEstId ? (titleCounts?.confCounts.get(`${edition.year}:${confSudEstId}`) ?? 1) : 1;

  return (
    <div className="edition-award-card" style={{ marginTop: "var(--space-2)", marginBottom: "var(--space-4)" }}>
      <div className="edition-card-header">
        <div className="edition-header-left">
          <span className="edition-year-badge">Saison {edition.year}</span>
          <h3 className="edition-header-title">Podium & Bilan de l'Édition {edition.year}</h3>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          <Link
            to={`/historique?saison=${edition.year}`}
            style={{
              padding: "4px 12px",
              background: "rgba(59, 130, 246, 0.15)",
              border: "1px solid rgba(59, 130, 246, 0.35)",
              borderRadius: "6px",
              color: "#93c5fd",
              fontSize: "0.85rem",
              textDecoration: "none",
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              fontWeight: 600,
            }}
            title={`Consulter l'historique complet des matchs et résultats de la saison ${edition.year}`}
          >
            <span>📜</span> Historique des matchs ({edition.totalMatches.toLocaleString("fr-FR")})
          </Link>
          <span className="edition-seed-tag">Seed : {edition.seed}</span>
        </div>
      </div>

      <div className="edition-podium-wrap">
        <div className="edition-national-champ">
          <div className="award-trophy-large" aria-hidden="true">🏆</div>
          <div className="award-champ-info">
            <small className="award-champ-label">CHAMPION DE FRANCE DES COMMUNES</small>
            <h3 className="award-champ-title" style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
              {champ ? <TeamLink team={champ} showTrophies={false} /> : edition.nationalChampionId}
              <ConferenceBadge conferenceId={champConfId} />
              <TitleCountBadge count={champCount} type="national" />
            </h3>
            {champ && (
              <span className="award-champ-meta">
                {departmentLabel(champ.departmentId)} · {champ.population.toLocaleString("fr-FR")} hab.
              </span>
            )}
            {(fin || finalistId) && (
              <div className="award-finalist-line">
                🥈 Finaliste National : {fin ? <TeamLink team={fin} showTrophies={false} /> : finalistId}
              </div>
            )}
          </div>
        </div>

        <div className="edition-conferences-grid">
          <div className="award-conf-card">
            <div className="award-conf-header">
              <span className="award-conf-icon" aria-hidden="true">🛡️</span>
              <span className="award-conf-name">Conférence Nord</span>
            </div>
            <strong className="award-conf-club" style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
              {confNord ? <TeamLink team={confNord} showTrophies={false} /> : confNordId ? <span>{confNordId}</span> : "—"}
              <TitleCountBadge count={confNordCount} type="conf" />
            </strong>
          </div>
          <div className="award-conf-card">
            <div className="award-conf-header">
              <span className="award-conf-icon" aria-hidden="true">🌊</span>
              <span className="award-conf-name">Conférence Ouest</span>
            </div>
            <strong className="award-conf-club" style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
              {confOuest ? <TeamLink team={confOuest} showTrophies={false} /> : confOuestId ? <span>{confOuestId}</span> : "—"}
              <TitleCountBadge count={confOuestCount} type="conf" />
            </strong>
          </div>
          <div className="award-conf-card">
            <div className="award-conf-header">
              <span className="award-conf-icon" aria-hidden="true">🍷</span>
              <span className="award-conf-name">Conférence Sud-Ouest</span>
            </div>
            <strong className="award-conf-club" style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
              {confSudOuest ? <TeamLink team={confSudOuest} showTrophies={false} /> : confSudOuestId ? <span>{confSudOuestId}</span> : "—"}
              <TitleCountBadge count={confSudOuestCount} type="conf" />
            </strong>
          </div>
          <div className="award-conf-card">
            <div className="award-conf-header">
              <span className="award-conf-icon" aria-hidden="true">☀️</span>
              <span className="award-conf-name">Conférence Sud-Est</span>
            </div>
            <strong className="award-conf-club" style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
              {confSudEst ? <TeamLink team={confSudEst} showTrophies={false} /> : confSudEstId ? <span>{confSudEstId}</span> : "—"}
              <TitleCountBadge count={confSudEstCount} type="conf" />
            </strong>
          </div>
        </div>
      </div>
    </div>
  );
}

function PalmaresEditionsTable({
  completedEditions,
  byId,
  dataset,
}: {
  completedEditions: SeasonArchive[];
  byId: Map<string, Club | Commune>;
  dataset: GeographyDataset;
}) {
  const [expandedYear, setExpandedYear] = useState<number | null>(null);
  const bySeason = useMemo(() => new Map(completedEditions.map((edition) => [edition.year, archiveClubs(edition, dataset)])), [completedEditions, dataset]);

  const titleCountsMap = useMemo(() => {
    const sortedAsc = [...completedEditions].sort((a, b) => a.year - b.year);
    const nationalCounts = new Map<string, number>();
    const confCounts = new Map<string, number>();

    const runningNational = new Map<string, number>();
    const runningConf = new Map<string, number>();

    for (const ed of sortedAsc) {
      if (ed.nationalChampionId) {
        const c = (runningNational.get(ed.nationalChampionId) ?? 0) + 1;
        runningNational.set(ed.nationalChampionId, c);
        nationalCounts.set(`${ed.year}:${ed.nationalChampionId}`, c);
      }
      for (const confWinnerId of Object.values(ed.conferenceChampions ?? {})) {
        if (confWinnerId) {
          const c = (runningConf.get(confWinnerId) ?? 0) + 1;
          runningConf.set(confWinnerId, c);
          confCounts.set(`${ed.year}:${confWinnerId}`, c);
        }
      }
    }

    return { nationalCounts, confCounts };
  }, [completedEditions]);

  if (completedEditions.length === 0) {
    return (
      <p style={{ color: "var(--color-text-muted)" }}>
        Aucune édition terminée pour l'instant.
      </p>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
      <div className="matches-table-wrap">
        <table className="matches-table">
          <thead>
            <tr>
              <th style={{ width: "7.5rem", minWidth: "7.5rem", textAlign: "center", whiteSpace: "nowrap" }}>Saison</th>
              <th>🏆 Champion de France</th>
              <th style={{ textAlign: "center" }}>Score</th>
              <th>🥈 Finaliste National</th>
              <th>👑 Conf. Nord</th>
              <th>👑 Conf. Ouest</th>
              <th>👑 Conf. Sud-Ouest</th>
              <th>👑 Conf. Sud-Est</th>
              <th style={{ textAlign: "center" }}>Matchs</th>
              <th style={{ textAlign: "center" }}>Fiche</th>
            </tr>
          </thead>
          <tbody>
            {completedEditions.map((ed) => {
              const seasonById = bySeason.get(ed.year) ?? byId;
              const getClub = (clubId?: string) => {
                if (!clubId) return undefined;
                return seasonById?.get(clubId) ?? seasonById?.get(clubId.split('-')[0]) ?? byId?.get(clubId) ?? byId?.get(clubId.split('-')[0]);
              };

              const champ = getClub(ed.nationalChampionId);
              const champConfId = champ?.conferenceId ?? (champ?.regionId ? conferenceForRegion(champ.regionId) : undefined);
              const champCount = titleCountsMap.nationalCounts.get(`${ed.year}:${ed.nationalChampionId}`) ?? 1;

              // Find final match in history or direct property if present
              const finalMatch = ed.finalMatch ?? ed.history?.find(
                (m) => m.roundNumber === 14 && (m.homeTeamId === ed.nationalChampionId || m.awayTeamId === ed.nationalChampionId),
              );
              const finalistId = ed.finalistId ?? (finalMatch ? (finalMatch.homeTeamId === ed.nationalChampionId ? finalMatch.awayTeamId : finalMatch.homeTeamId) : undefined);
              const fin = getClub(finalistId);

              const getConfWinnerId = (confKey: string, altKeys: string[] = []) => {
                if (!ed.conferenceChampions) return undefined;
                if (ed.conferenceChampions[confKey]) return ed.conferenceChampions[confKey];
                for (const k of altKeys) {
                  if (ed.conferenceChampions[k]) return ed.conferenceChampions[k];
                }
                return undefined;
              };

              const confNordId = getConfWinnerId("CONF_NORD", ["NORD", "north"]);
              const confOuestId = getConfWinnerId("CONF_OUEST", ["OUEST", "west"]);
              const confSudOuestId = getConfWinnerId("CONF_SUD_OUEST", ["SUD_OUEST", "south_west"]);
              const confSudEstId = getConfWinnerId("CONF_SUD_EST", ["SUD_EST", "south_east", "EST"]);

              const confNord = getClub(confNordId);
              const confOuest = getClub(confOuestId);
              const confSudOuest = getClub(confSudOuestId);
              const confSudEst = getClub(confSudEstId);

              const confNordCount = confNordId
                ? (titleCountsMap.confCounts.get(`${ed.year}:${confNordId}`) ?? 1)
                : 1;
              const confOuestCount = confOuestId
                ? (titleCountsMap.confCounts.get(`${ed.year}:${confOuestId}`) ?? 1)
                : 1;
              const confSudOuestCount = confSudOuestId
                ? (titleCountsMap.confCounts.get(`${ed.year}:${confSudOuestId}`) ?? 1)
                : 1;
              const confSudEstCount = confSudEstId
                ? (titleCountsMap.confCounts.get(`${ed.year}:${confSudEstId}`) ?? 1)
                : 1;

              const isExpanded = expandedYear === ed.year;

              return (
                <tr key={ed.year}>
                  <td style={{ textAlign: "center", whiteSpace: "nowrap" }}>
                    <Link
                      to={`/historique?saison=${ed.year}`}
                      className="edition-year-badge"
                      style={{ textDecoration: "none", cursor: "pointer", display: "inline-block" }}
                      title={`Consulter l'historique complet des matchs de la saison ${ed.year}`}
                    >
                      Saison {ed.year}
                    </Link>
                  </td>
                  <td style={{ fontWeight: 800 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                      <span>🏆</span>
                      {champ ? <TeamLink team={champ} showTrophies={false} /> : ed.nationalChampionId}
                      <ConferenceBadge conferenceId={champConfId} />
                      <TitleCountBadge count={champCount} type="national" />
                    </div>
                    {champ && (
                      <div style={{ fontSize: "0.8rem", color: "var(--color-text-muted)", fontWeight: 500 }}>
                        {departmentLabel(champ.departmentId)} · {champ.population.toLocaleString("fr-FR")} hab.
                      </div>
                    )}
                  </td>
                  <td className="score-cell" style={{ textAlign: "center" }}>
                    {finalMatch ? (
                      <Link
                        className="score-badge-link"
                        to={`/matchs/${encodeURIComponent(finalMatch.result.matchId)}?saison=${ed.year}`}
                        style={{ fontSize: "0.85rem", padding: "0.2rem 0.5rem" }}
                        title="Voir la feuille de match de la finale"
                      >
                        {finalMatch.result.homeScore} – {finalMatch.result.awayScore}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td style={{ color: "var(--color-text-muted)" }}>
                    {fin ? (
                      <div>
                        <TeamLink team={fin} showTrophies={false} />
                        <div style={{ fontSize: "0.8rem", color: "var(--color-text-dim)" }}>
                          {departmentLabel(fin.departmentId)}
                        </div>
                      </div>
                    ) : finalistId ? (
                      <div>
                        <span>{finalistId}</span>
                      </div>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td>
                    {confNord ? (
                      <div style={{ display: "flex", alignItems: "center", gap: "4px", flexWrap: "wrap" }}>
                        <TeamLink team={confNord} showTrophies={false} />
                        <TitleCountBadge count={confNordCount} type="conf" />
                      </div>
                    ) : confNordId ? (
                      <div style={{ display: "flex", alignItems: "center", gap: "4px", flexWrap: "wrap" }}>
                        <span>{confNordId}</span>
                        <TitleCountBadge count={confNordCount} type="conf" />
                      </div>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td>
                    {confOuest ? (
                      <div style={{ display: "flex", alignItems: "center", gap: "4px", flexWrap: "wrap" }}>
                        <TeamLink team={confOuest} showTrophies={false} />
                        <TitleCountBadge count={confOuestCount} type="conf" />
                      </div>
                    ) : confOuestId ? (
                      <div style={{ display: "flex", alignItems: "center", gap: "4px", flexWrap: "wrap" }}>
                        <span>{confOuestId}</span>
                        <TitleCountBadge count={confOuestCount} type="conf" />
                      </div>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td>
                    {confSudOuest ? (
                      <div style={{ display: "flex", alignItems: "center", gap: "4px", flexWrap: "wrap" }}>
                        <TeamLink team={confSudOuest} showTrophies={false} />
                        <TitleCountBadge count={confSudOuestCount} type="conf" />
                      </div>
                    ) : confSudOuestId ? (
                      <div style={{ display: "flex", alignItems: "center", gap: "4px", flexWrap: "wrap" }}>
                        <span>{confSudOuestId}</span>
                        <TitleCountBadge count={confSudOuestCount} type="conf" />
                      </div>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td>
                    {confSudEst ? (
                      <div style={{ display: "flex", alignItems: "center", gap: "4px", flexWrap: "wrap" }}>
                        <TeamLink team={confSudEst} showTrophies={false} />
                        <TitleCountBadge count={confSudEstCount} type="conf" />
                      </div>
                    ) : confSudEstId ? (
                      <div style={{ display: "flex", alignItems: "center", gap: "4px", flexWrap: "wrap" }}>
                        <span>{confSudEstId}</span>
                        <TitleCountBadge count={confSudEstCount} type="conf" />
                      </div>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td style={{ textAlign: "center", fontSize: "0.85rem", color: "var(--color-text-muted)" }}>
                    <Link
                      to={`/historique?saison=${ed.year}`}
                      title={`Consulter l'historique complet des ${ed.totalMatches.toLocaleString("fr-FR")} matchs de la saison ${ed.year}`}
                      style={{ color: "var(--color-primary-light, #93c5fd)", textDecoration: "none" }}
                    >
                      {ed.totalMatches.toLocaleString("fr-FR")} ↗
                    </Link>
                  </td>
                  <td style={{ textAlign: "center" }}>
                    <button
                      type="button"
                      className="palmares-details-btn"
                      onClick={() => setExpandedYear(isExpanded ? null : ed.year)}
                      title={isExpanded ? "Masquer la fiche podium" : "Afficher la fiche podium"}
                    >
                      {isExpanded ? "▲ Fermer" : "▼ Fiche"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {expandedYear !== null && (
        <div>
          {completedEditions
            .filter((ed) => ed.year === expandedYear)
            .map((ed) => (
              <EditionPodiumDetail
                edition={ed}
                byId={bySeason.get(ed.year) ?? byId}
                titleCounts={titleCountsMap}
                key={ed.year}
              />
            ))}
        </div>
      )}
    </div>
  );
}

function PalmaresClubsLeaderboardTable({
  rankedClubs,
  defaultLimit = 20,
  showTitle = true,
}: {
  rankedClubs: Array<{ team: Club | Commune; record: TeamTrophyRecord; rank: number }>;
  defaultLimit?: number | "all";
  showTitle?: boolean;
}) {
  const [limit, setLimit] = useState<number | "all">(defaultLimit);
  const [page, setPage] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortKey, setSortKey] = useState<
    "rank" | "name" | "dept" | "national" | "conf" | "region" | "deptTitles" | "total" | "best"
  >("rank");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const handleSort = (key: typeof sortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      if (["national", "conf", "region", "deptTitles", "total", "best"].includes(key)) {
        setSortDir("desc");
      } else {
        setSortDir("asc");
      }
    }
  };

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return rankedClubs;
    return rankedClubs.filter(({ team }) => {
      const deptName = departmentLabel(team.departmentId).toLowerCase();
      return (
        team.name.toLowerCase().includes(q) ||
        team.departmentId.toLowerCase().includes(q) ||
        deptName.includes(q)
      );
    });
  }, [rankedClubs, searchQuery]);

  const sorted = useMemo(() => {
    const list = [...filtered];
    list.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "rank":
          cmp = a.rank - b.rank;
          break;
        case "name":
          cmp = a.team.name.localeCompare(b.team.name, "fr");
          break;
        case "dept":
          cmp = a.team.departmentId.localeCompare(b.team.departmentId, "fr", { numeric: true });
          break;
        case "national":
          cmp = a.record.nationalTitles - b.record.nationalTitles;
          break;
        case "conf":
          cmp = a.record.conferenceTitles - b.record.conferenceTitles;
          break;
        case "region":
          cmp = a.record.regionTitles - b.record.regionTitles;
          break;
        case "deptTitles":
          cmp = a.record.departmentTitles - b.record.departmentTitles;
          break;
        case "total": {
          const totalA =
            a.record.nationalTitles +
            a.record.conferenceTitles +
            a.record.regionTitles +
            a.record.departmentTitles;
          const totalB =
            b.record.nationalTitles +
            b.record.conferenceTitles +
            b.record.regionTitles +
            b.record.departmentTitles;
          cmp = totalA - totalB;
          break;
        }
        case "best":
          cmp = a.record.bestPerformance.roundNumber - b.record.bestPerformance.roundNumber;
          break;
      }
      return sortDir === "desc" ? -cmp : cmp;
    });
    return list;
  }, [filtered, sortKey, sortDir]);

  const visible = useMemo(() => {
    if (limit === "all") return sorted.slice(page * 25, (page + 1) * 25);
    return sorted.slice(0, limit);
  }, [sorted, limit, page]);
  const totalPages = Math.max(1, Math.ceil(sorted.length / 25));

  const getSortIcon = (key: typeof sortKey) => {
    if (sortKey !== key) return <span className="sort-icon">⇅</span>;
    return <span className="sort-icon">{sortDir === "asc" ? "▲" : "▼"}</span>;
  };

  if (rankedClubs.length === 0) {
    return (
      <p style={{ color: "var(--color-text-muted)" }}>
        Aucun club n'a encore remporté de titre national, de conférence, régional ou départemental.
      </p>
    );
  }

  return (
    <div>
      {showTitle && (
        <h3
          style={{
            color: "#ffffff",
            marginBottom: "var(--space-3)",
            display: "flex",
            alignItems: "center",
            gap: "8px",
          }}
        >
          <span>⭐</span> Classement Historique des Clubs les Plus Titrés
        </h3>
      )}

      {/* Controls: Search and Limit segmented buttons */}
      <div className="palmares-table-controls">
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", flex: 1, minWidth: "220px", maxWidth: "420px" }}>
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setPage(0); }}
            placeholder="Filtrer un club ou département..."
            className="edition-search-input"
            style={{ width: "100%" }}
          />
          {searchQuery && (
            <button
              type="button"
              className="search-clear-btn"
              onClick={() => { setSearchQuery(""); setPage(0); }}
              title="Effacer la recherche"
            >
              ✕
            </button>
          )}
        </div>

        <div className="palmares-chips-group">
          <span style={{ fontSize: "0.82rem", color: "var(--color-text-muted)", fontWeight: 700 }}>
            Affichage :
          </span>
          <button
            type="button"
            className={`palmares-chip-btn ${limit === 20 ? "is-active" : ""}`}
            onClick={() => { setLimit(20); setPage(0); }}
          >
            Top 20
          </button>
          <button
            type="button"
            className={`palmares-chip-btn ${limit === 50 ? "is-active" : ""}`}
            onClick={() => { setLimit(50); setPage(0); }}
          >
            Top 50
          </button>
          <button
            type="button"
            className={`palmares-chip-btn ${limit === "all" ? "is-active" : ""}`}
            onClick={() => { setLimit("all"); setPage(0); }}
          >
            Parcourir tous les clubs ({rankedClubs.length})
          </button>
        </div>
      </div>

      <div className="palmares-table-summary">
        Affichage de <strong>{visible.length}</strong> sur <strong>{filtered.length}</strong> club{filtered.length > 1 ? "s" : ""} titré{filtered.length > 1 ? "s" : ""}
        {searchQuery && ` (filtré pour « ${searchQuery} »)`}
      </div>

      <div className="matches-table-wrap">
        <table className="matches-table">
          <thead>
            <tr>
              <th
                className="sortable-th"
                style={{ width: "4rem", textAlign: "center" }}
                onClick={() => handleSort("rank")}
                title="Trier par Rang"
              >
                Rang {getSortIcon("rank")}
              </th>
              <th className="sortable-th" onClick={() => handleSort("name")} title="Trier par Club">
                Club {getSortIcon("name")}
              </th>
              <th className="sortable-th" onClick={() => handleSort("dept")} title="Trier par Département">
                Département {getSortIcon("dept")}
              </th>
              <th
                className="sortable-th"
                style={{ textAlign: "center" }}
                onClick={() => handleSort("national")}
                title="Trier par Titres Nationaux"
              >
                🏆 France {getSortIcon("national")}
              </th>
              <th
                className="sortable-th"
                style={{ textAlign: "center" }}
                onClick={() => handleSort("conf")}
                title="Trier par Titres de Conférence"
              >
                👑 Conf. {getSortIcon("conf")}
              </th>
              <th
                className="sortable-th"
                style={{ textAlign: "center" }}
                onClick={() => handleSort("region")}
                title="Trier par Titres Régionaux"
              >
                🌟 Région {getSortIcon("region")}
              </th>
              <th
                className="sortable-th"
                style={{ textAlign: "center" }}
                onClick={() => handleSort("deptTitles")}
                title="Trier par Titres Départementaux"
              >
                🏅 Départ. {getSortIcon("deptTitles")}
              </th>
              <th
                className="sortable-th"
                style={{ textAlign: "center" }}
                onClick={() => handleSort("total")}
                title="Trier par Total de Titres"
              >
                Total {getSortIcon("total")}
              </th>
              <th
                className="sortable-th"
                onClick={() => handleSort("best")}
                title="Trier par Meilleure Performance"
              >
                Meilleure Performance {getSortIcon("best")}
              </th>
            </tr>
          </thead>
          <tbody>
            {visible.map(({ team, record, rank }) => {
              const totalTitles =
                record.nationalTitles +
                record.conferenceTitles +
                record.regionTitles +
                record.departmentTitles;

              return (
                <tr key={team.id}>
                  <td
                    style={{
                      textAlign: "center",
                      fontWeight: 800,
                      color: rank === 1 ? "var(--color-gold-light)" : "inherit",
                    }}
                  >
                    {rank === 1 ? "🥇 1" : rank === 2 ? "🥈 2" : rank === 3 ? "🥉 3" : rank}
                  </td>
                  <td style={{ fontWeight: 700 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                      <TeamLink team={team} showTrophies={false} />
                      <ConferenceBadge
                        conferenceId={team.conferenceId ?? (team.regionId ? conferenceForRegion(team.regionId) : undefined)}
                      />
                    </div>
                  </td>
                  <td>
                    {departmentLabel(team.departmentId)}
                  </td>
                  <td style={{ textAlign: "center" }}>
                    {record.nationalTitles > 0 ? (
                      <span className="trophy-pill trophy-pill--national" style={{ display: "inline-flex" }}>
                        🏆 {record.nationalTitles}
                      </span>
                    ) : (
                      <span style={{ color: "var(--color-text-dim)" }}>—</span>
                    )}
                  </td>
                  <td style={{ textAlign: "center" }}>
                    {record.conferenceTitles > 0 ? (
                      <span className="trophy-pill trophy-pill--conference" style={{ display: "inline-flex" }}>
                        👑 {record.conferenceTitles}
                      </span>
                    ) : (
                      <span style={{ color: "var(--color-text-dim)" }}>—</span>
                    )}
                  </td>
                  <td style={{ textAlign: "center" }}>
                    {record.regionTitles > 0 ? (
                      <span className="trophy-pill trophy-pill--region" style={{ display: "inline-flex" }}>
                        🌟 {record.regionTitles}
                      </span>
                    ) : (
                      <span style={{ color: "var(--color-text-dim)" }}>—</span>
                    )}
                  </td>
                  <td style={{ textAlign: "center" }}>
                    {record.departmentTitles > 0 ? (
                      <span className="trophy-pill trophy-pill--dept" style={{ display: "inline-flex" }}>
                        🏅 {record.departmentTitles}
                      </span>
                    ) : (
                      <span style={{ color: "var(--color-text-dim)" }}>—</span>
                    )}
                  </td>
                  <td style={{ textAlign: "center", fontWeight: 800, color: "var(--color-gold-light)" }}>
                    {totalTitles}
                  </td>
                  <td style={{ color: "var(--color-text-muted)", fontSize: "0.88rem" }}>
                    <span className={getStageBadgeClass(record.bestPerformance.stageLabel, record.bestPerformance.roundNumber)}>
                      {record.bestPerformance.stageLabel}
                    </span>{" "}
                    ({record.bestPerformance.year})
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {limit === "all" && (
        <div className="pagination" aria-label="Pages du palmarès des clubs">
          <button type="button" disabled={page === 0} onClick={() => setPage((current) => current - 1)}>← Précédent</button>
          <span>Page {page + 1} sur {totalPages}</span>
          <button type="button" disabled={page + 1 >= totalPages} onClick={() => setPage((current) => current + 1)}>Suivant →</button>
        </div>
      )}
    </div>
  );
}

function SeasonTitleList({ seasons }: { seasons: Array<{ year: number; champion: Commune }> }) {
  const renderSeason = (season: { year: number; champion: Commune }) => (
    <span key={season.year} className="palmares-season-tag">
      <strong>{season.year}</strong> : <TeamLink team={season.champion} showTrophies={false} />
    </span>
  );

  if (seasons.length === 0) return <span className="palmares-empty">—</span>;
  return (
    <div className="palmares-season-list">
      <div className="palmares-season-preview">{seasons.slice(0, 2).map(renderSeason)}</div>
      {seasons.length > 2 && (
        <details className="palmares-season-more">
          <summary>Voir {seasons.length - 2} autre{seasons.length > 3 ? "s" : ""} édition{seasons.length > 3 ? "s" : ""}</summary>
          <div className="palmares-season-preview">{seasons.slice(2).map(renderSeason)}</div>
        </details>
      )}
    </div>
  );
}

function PalmaresRegionsTable({
  completedEditions,
  dataset,
  teamRecords,
}: {
  completedEditions: SeasonArchive[];
  dataset: GeographyDataset;
  teamRecords?: Map<string, TeamTrophyRecord>;
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [sortKey, setSortKey] = useState<"code" | "name" | "conf" | "champ" | "mostTitled" | "communes">("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const regionRows = useMemo(() => {
    return computeRegionPalmares(completedEditions, dataset, teamRecords);
  }, [completedEditions, dataset, teamRecords]);

  const handleSort = (key: typeof sortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "communes" ? "desc" : "asc");
    }
  };

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return regionRows;
    return regionRows.filter((r) => {
      const confName = conferenceLabel(r.conferenceId).toLowerCase();
      const champName = r.latestChampion?.name.toLowerCase() ?? "";
      return (
        r.regionName.toLowerCase().includes(q) ||
        r.regionId.toLowerCase().includes(q) ||
        confName.includes(q) ||
        champName.includes(q)
      );
    });
  }, [regionRows, searchQuery]);

  const sorted = useMemo(() => {
    const list = [...filtered];
    list.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "code":
          cmp = a.regionId.localeCompare(b.regionId, "fr", { numeric: true });
          break;
        case "name":
          cmp = a.regionName.localeCompare(b.regionName, "fr");
          break;
        case "conf":
          cmp = conferenceLabel(a.conferenceId).localeCompare(conferenceLabel(b.conferenceId), "fr");
          break;
        case "champ": {
          const nameA = a.latestChampion?.name ?? "";
          const nameB = b.latestChampion?.name ?? "";
          cmp = nameA.localeCompare(nameB, "fr");
          break;
        }
        case "mostTitled": {
          const countA = a.mostTitledClub?.count ?? 0;
          const countB = b.mostTitledClub?.count ?? 0;
          cmp = countA - countB;
          break;
        }
        case "communes":
          cmp = a.totalCommunes - b.totalCommunes;
          break;
      }
      return sortDir === "desc" ? -cmp : cmp;
    });
    return list;
  }, [filtered, sortKey, sortDir]);

  const getSortIcon = (key: typeof sortKey) => {
    if (sortKey !== key) return <span className="sort-icon">⇅</span>;
    return <span className="sort-icon">{sortDir === "asc" ? "▲" : "▼"}</span>;
  };

  return (
    <div>
      <div className="palmares-table-controls">
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", flex: 1, minWidth: "240px", maxWidth: "420px" }}>
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Rechercher une région ou un club..."
            className="edition-search-input"
            style={{ width: "100%" }}
          />
          {searchQuery && (
            <button
              type="button"
              className="search-clear-btn"
              onClick={() => setSearchQuery("")}
              title="Effacer"
            >
              ✕
            </button>
          )}
        </div>
        <div className="palmares-table-summary" style={{ margin: 0 }}>
          {sorted.length} région{sorted.length > 1 ? "s" : ""}
        </div>
      </div>

      <div className="matches-table-wrap">
        <table className="matches-table">
          <thead>
            <tr>
              <th
                className="sortable-th"
                style={{ width: "4rem", textAlign: "center" }}
                onClick={() => handleSort("code")}
                title="Trier par Code"
              >
                Code {getSortIcon("code")}
              </th>
              <th className="sortable-th" onClick={() => handleSort("name")} title="Trier par Région">
                Région {getSortIcon("name")}
              </th>
              <th className="sortable-th" onClick={() => handleSort("conf")} title="Trier par Conférence">
                Conférence {getSortIcon("conf")}
              </th>
              <th className="sortable-th" onClick={() => handleSort("champ")} title="Trier par Dernier Champion">
                Dernier Champion Régional 🌟 {getSortIcon("champ")}
              </th>
              <th>Historique des Titres</th>
              <th className="sortable-th" onClick={() => handleSort("mostTitled")} title="Trier par Club le Plus Titré">
                Club le Plus Titré 🌟 {getSortIcon("mostTitled")}
              </th>
              <th
                className="sortable-th"
                style={{ textAlign: "center" }}
                onClick={() => handleSort("communes")}
                title="Trier par Nombre de Communes"
              >
                Communes {getSortIcon("communes")}
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => (
              <tr key={row.regionId}>
                <td style={{ textAlign: "center" }}>
                  <span className="badge badge--neutral">{row.regionId}</span>
                </td>
                <td style={{ fontWeight: 750, color: "#ffffff" }}>
                  {row.regionName}
                </td>
                <td>
                  <span className="badge badge--purple" style={{ fontSize: "0.78rem" }}>
                    {conferenceLabel(row.conferenceId)}
                  </span>
                </td>
                <td>
                  {row.latestChampion ? (
                    <div>
                      <div style={{ fontWeight: 700, display: "flex", alignItems: "center", gap: "5px", flexWrap: "wrap" }}>
                        <span>🌟</span>
                        <TeamLink team={row.latestChampion} />
                        <ConferenceBadge conferenceId={row.latestChampion.conferenceId ?? row.conferenceId} />
                      </div>
                      <div style={{ fontSize: "0.8rem", color: "var(--color-text-muted)" }}>
                        {departmentLabel(row.latestChampion.departmentId)} · {row.latestChampion.population.toLocaleString("fr-FR")} hab. {row.latestChampionYear ? `(${row.latestChampionYear})` : ""}
                      </div>
                    </div>
                  ) : (
                    <span style={{ color: "var(--color-text-dim)" }}>—</span>
                  )}
                </td>
                <td>
                  <SeasonTitleList seasons={row.seasons} />
                </td>
                <td>
                  {row.mostTitledClub ? (
                    <div>
                      <TeamLink team={row.mostTitledClub.team} />{" "}
                      <span className="trophy-pill trophy-pill--region" style={{ display: "inline-flex", fontSize: "0.75rem", padding: "1px 6px" }}>
                        🌟 {row.mostTitledClub.count} titre{row.mostTitledClub.count > 1 ? "s" : ""}
                      </span>
                    </div>
                  ) : (
                    <span style={{ color: "var(--color-text-dim)" }}>—</span>
                  )}
                </td>
                <td style={{ textAlign: "center", fontSize: "0.88rem", color: "var(--color-text-muted)" }}>
                  {row.totalCommunes.toLocaleString("fr-FR")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PalmaresDepartmentsTable({
  completedEditions,
  dataset,
  teamRecords,
}: {
  completedEditions: SeasonArchive[];
  dataset: GeographyDataset;
  teamRecords?: Map<string, TeamTrophyRecord>;
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRegionId, setSelectedRegionId] = useState("all");
  const [limit, setLimit] = useState<number | "all">(25);
  const [page, setPage] = useState(0);
  const [sortKey, setSortKey] = useState<"code" | "name" | "region" | "champ" | "mostTitled" | "communes">("code");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const deptRows = useMemo(() => {
    return computeDepartmentPalmares(completedEditions, dataset, teamRecords);
  }, [completedEditions, dataset, teamRecords]);

  // Unique regions for select dropdown
  const regionsList = useMemo(() => {
    const map = new Map<string, string>();
    for (const d of deptRows) {
      if (!map.has(d.regionId)) {
        map.set(d.regionId, d.regionName);
      }
    }
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, "fr"));
  }, [deptRows]);

  const handleSort = (key: typeof sortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "communes" ? "desc" : "asc");
    }
  };

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return deptRows.filter((d) => {
      if (selectedRegionId !== "all" && d.regionId !== selectedRegionId) {
        return false;
      }
      if (!q) return true;
      const champName = d.latestChampion?.name.toLowerCase() ?? "";
      return (
        d.departmentName.toLowerCase().includes(q) ||
        d.departmentId.toLowerCase().includes(q) ||
        d.regionName.toLowerCase().includes(q) ||
        champName.includes(q)
      );
    });
  }, [deptRows, searchQuery, selectedRegionId]);

  const sorted = useMemo(() => {
    const list = [...filtered];
    list.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "code":
          cmp = a.departmentId.localeCompare(b.departmentId, "fr", { numeric: true });
          break;
        case "name":
          cmp = a.departmentName.localeCompare(b.departmentName, "fr");
          break;
        case "region":
          cmp = a.regionName.localeCompare(b.regionName, "fr");
          break;
        case "champ": {
          const nameA = a.latestChampion?.name ?? "";
          const nameB = b.latestChampion?.name ?? "";
          cmp = nameA.localeCompare(nameB, "fr");
          break;
        }
        case "mostTitled": {
          const countA = a.mostTitledClub?.count ?? 0;
          const countB = b.mostTitledClub?.count ?? 0;
          cmp = countA - countB;
          break;
        }
        case "communes":
          cmp = a.totalCommunes - b.totalCommunes;
          break;
      }
      return sortDir === "desc" ? -cmp : cmp;
    });
    return list;
  }, [filtered, sortKey, sortDir]);

  const visible = useMemo(() => {
    if (limit === "all") return sorted.slice(page * 25, (page + 1) * 25);
    return sorted.slice(0, limit);
  }, [sorted, limit, page]);
  const totalPages = Math.max(1, Math.ceil(sorted.length / 25));

  const getSortIcon = (key: typeof sortKey) => {
    if (sortKey !== key) return <span className="sort-icon">⇅</span>;
    return <span className="sort-icon">{sortDir === "asc" ? "▲" : "▼"}</span>;
  };

  return (
    <div>
      <div className="palmares-table-controls">
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", flex: 1, minWidth: "220px", maxWidth: "380px" }}>
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setPage(0); }}
            placeholder="Rechercher (ex: 75, Finistère, Lyon...)"
            className="edition-search-input"
            style={{ width: "100%" }}
          />
          {searchQuery && (
            <button
              type="button"
              className="search-clear-btn"
              onClick={() => { setSearchQuery(""); setPage(0); }}
              title="Effacer"
            >
              ✕
            </button>
          )}
        </div>

        <select
          value={selectedRegionId}
          onChange={(e) => { setSelectedRegionId(e.target.value); setPage(0); }}
          className="edition-region-select"
          aria-label="Filtrer par région"
        >
          <option value="all">Toutes les régions ({regionsList.length})</option>
          {regionsList.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>

        <div className="palmares-chips-group">
          <button
            type="button"
            className={`palmares-chip-btn ${limit === 25 ? "is-active" : ""}`}
            onClick={() => { setLimit(25); setPage(0); }}
          >
            25
          </button>
          <button
            type="button"
            className={`palmares-chip-btn ${limit === 50 ? "is-active" : ""}`}
            onClick={() => { setLimit(50); setPage(0); }}
          >
            50
          </button>
          <button
            type="button"
            className={`palmares-chip-btn ${limit === "all" ? "is-active" : ""}`}
            onClick={() => { setLimit("all"); setPage(0); }}
          >
            Parcourir tous les départements ({filtered.length})
          </button>
        </div>
      </div>

      <div className="palmares-table-summary">
        Affichage de <strong>{visible.length}</strong> sur <strong>{filtered.length}</strong> département{filtered.length > 1 ? "s" : ""}
      </div>

      <div className="matches-table-wrap">
        <table className="matches-table">
          <thead>
            <tr>
              <th
                className="sortable-th"
                style={{ width: "4rem", textAlign: "center" }}
                onClick={() => handleSort("code")}
                title="Trier par Code"
              >
                N° {getSortIcon("code")}
              </th>
              <th className="sortable-th" onClick={() => handleSort("name")} title="Trier par Département">
                Département {getSortIcon("name")}
              </th>
              <th className="sortable-th" onClick={() => handleSort("region")} title="Trier par Région">
                Région {getSortIcon("region")}
              </th>
              <th className="sortable-th" onClick={() => handleSort("champ")} title="Trier par Dernier Champion">
                Dernier Champion Départemental 🏅 {getSortIcon("champ")}
              </th>
              <th>Historique des Titres</th>
              <th className="sortable-th" onClick={() => handleSort("mostTitled")} title="Trier par Club le Plus Titré">
                Club le Plus Titré 🏅 {getSortIcon("mostTitled")}
              </th>
              <th
                className="sortable-th"
                style={{ textAlign: "center" }}
                onClick={() => handleSort("communes")}
                title="Trier par Nombre de Communes"
              >
                Communes {getSortIcon("communes")}
              </th>
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr key={row.departmentId}>
                <td style={{ textAlign: "center" }}>
                  <span className="badge badge--neutral">{row.departmentId}</span>
                </td>
                <td style={{ fontWeight: 750, color: "#ffffff" }}>
                  {row.departmentName}
                </td>
                <td style={{ color: "var(--color-text-muted)" }}>
                  {row.regionName}
                </td>
                <td>
                  {row.latestChampion ? (
                    <div>
                      <div style={{ fontWeight: 700, display: "flex", alignItems: "center", gap: "5px", flexWrap: "wrap" }}>
                        <span>🏅</span>
                        <TeamLink team={row.latestChampion} />
                        <ConferenceBadge conferenceId={row.latestChampion.conferenceId ?? (row.latestChampion.regionId ? conferenceForRegion(row.latestChampion.regionId) : undefined)} />
                      </div>
                      <div style={{ fontSize: "0.8rem", color: "var(--color-text-muted)" }}>
                        {row.latestChampion.population.toLocaleString("fr-FR")} hab. {row.latestChampionYear ? `(${row.latestChampionYear})` : ""}
                      </div>
                    </div>
                  ) : (
                    <span style={{ color: "var(--color-text-dim)" }}>—</span>
                  )}
                </td>
                <td>
                  <SeasonTitleList seasons={row.seasons} />
                </td>
                <td>
                  {row.mostTitledClub ? (
                    <div>
                      <TeamLink team={row.mostTitledClub.team} />{" "}
                      <span className="trophy-pill trophy-pill--dept" style={{ display: "inline-flex", fontSize: "0.75rem", padding: "1px 6px" }}>
                        🏅 {row.mostTitledClub.count} titre{row.mostTitledClub.count > 1 ? "s" : ""}
                      </span>
                    </div>
                  ) : (
                    <span style={{ color: "var(--color-text-dim)" }}>—</span>
                  )}
                </td>
                <td style={{ textAlign: "center", fontSize: "0.88rem", color: "var(--color-text-muted)" }}>
                  {row.totalCommunes.toLocaleString("fr-FR")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {limit === "all" && (
        <div className="pagination" aria-label="Pages du palmarès des départements">
          <button type="button" disabled={page === 0} onClick={() => setPage((current) => current - 1)}>← Précédent</button>
          <span>Page {page + 1} sur {totalPages}</span>
          <button type="button" disabled={page + 1 >= totalPages} onClick={() => setPage((current) => current + 1)}>Suivant →</button>
        </div>
      )}
    </div>
  );
}

export function AwardsPage() {
  const { appContext, data, session, archives: archiveSummaries, teamRecords, persons } = useOverview();
  const [searchParams, setSearchParams] = useSearchParams();

  const tabParam = searchParams.get("tab") || searchParams.get("palmaresTab");
  const initialTab =
    tabParam === "joueurs" || tabParam === "players"
      ? "joueurs"
      : tabParam === "departments" || tabParam === "departements"
        ? "departements"
        : tabParam === "regions"
          ? "regions"
          : tabParam === "clubs"
            ? "clubs"
            : "editions";

  const [activeTab, setActiveTab] = useState<"editions" | "clubs" | "joueurs" | "regions" | "departements">(initialTab);

  useEffect(() => {
    const p = searchParams.get("tab") || searchParams.get("palmaresTab");
    if (p === "joueurs" || p === "players") {
      setActiveTab("joueurs");
    } else if (p === "departments" || p === "departements") {
      setActiveTab("departements");
    } else if (p === "regions") {
      setActiveTab("regions");
    } else if (p === "clubs") {
      setActiveTab("clubs");
    } else if (p === "editions") {
      setActiveTab("editions");
    }
  }, [searchParams]);

  const handleSelectTab = (tab: "editions" | "clubs" | "joueurs" | "regions" | "departements") => {
    setActiveTab(tab);
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (tab === "editions") {
          next.delete("tab");
          next.delete("palmaresTab");
        } else {
          next.set("tab", tab);
          next.delete("palmaresTab");
        }
        return next;
      },
      { replace: true },
    );
  };

  const byId = useMemo(
    () => appContext?.clubsById ?? (data ? new Map(buildClubsFromCommunes(data.communes).map((team) => [team.id, team])) : new Map<string, Club>()),
    [appContext?.clubsById, data],
  );

  // Completed seasons list: archived seasons + active session if completed
  const completedEditions = useMemo(() => {
    const list = [...archiveSummaries].sort((a, b) => b.year - a.year);

    // If active session has a champion and isn't yet in archives, include it
    if (session?.championId && data) {
      const activeYear = session.seasonYear ?? 2026;
      if (!list.some((a) => a.year === activeYear)) {
        try {
          list.unshift(buildSeasonArchive(session, data));
        } catch {
          list.unshift({
            year: activeYear,
            seed: session.seed,
            completedAt: new Date().toISOString(),
            datasetVersion: session.datasetVersion,
            nationalChampionId: session.championId,
            conferenceChampions: session.conferenceChampionIds ?? {},
            finalFourTeamIds: session.conferenceChampionIds ? Object.values(session.conferenceChampionIds) : [],
            totalMatches: session.history.length,
            teamPerformances: {},
            history: session.history,
          });
        }
      }
    }
    return list;
  }, [archiveSummaries, session, data]);

  // Ranked clubs leaderboard
  const rankedClubs = useMemo(() => {
    if (!teamRecords || !byId.size) return [];
    return getRankedPalmares(teamRecords, byId);
  }, [teamRecords, byId]);

  if (!data) return <section className="status-panel">Chargement…</section>;

  const activeChampion = session?.championId ? byId.get(session.championId) : undefined;

  return (
    <section className="cup-ready">
      <p className="eyebrow">Tableau d'honneur national</p>
      <h2>Palmarès & Titres de la Coupe</h2>

      {/* Main Tab Navigation */}
      <nav className="palmares-tabs-nav" role="tablist" aria-label="Onglets du palmarès">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "editions"}
          className={`palmares-tab-btn ${activeTab === "editions" ? "is-active" : ""}`}
          onClick={() => handleSelectTab("editions")}
        >
          <span>🏆</span> Éditions & Conférences {completedEditions.length > 0 ? `(${completedEditions.length})` : ""}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "clubs"}
          className={`palmares-tab-btn ${activeTab === "clubs" ? "is-active" : ""}`}
          onClick={() => handleSelectTab("clubs")}
        >
          <span>⭐</span> Palmarès des Clubs ({rankedClubs.length})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "joueurs"}
          className={`palmares-tab-btn ${activeTab === "joueurs" ? "is-active" : ""}`}
          onClick={() => handleSelectTab("joueurs")}
        >
          <span>👤</span> Palmarès des Joueurs
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "regions"}
          className={`palmares-tab-btn ${activeTab === "regions" ? "is-active" : ""}`}
          onClick={() => handleSelectTab("regions")}
        >
          <span>🌟</span> Champions Régionaux
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "departements"}
          className={`palmares-tab-btn ${activeTab === "departements" ? "is-active" : ""}`}
          onClick={() => handleSelectTab("departements")}
        >
          <span>🏅</span> Champions Départementaux
        </button>
      </nav>

      {completedEditions.length === 0 && !activeChampion && rankedClubs.length === 0 && activeTab !== "joueurs" ? (
        <div className="empty-bracket" style={{ marginTop: "var(--space-4)" }}>
          <h3>Aucune édition achevée</h3>
          <p>
            La compétition 2026 est en cours. Menez les communes jusqu'au sacre national pour inaugurer le palmarès historique de la Coupe !
          </p>
        </div>
      ) : (
        <div style={{ marginTop: "var(--space-3)" }}>
          {/* TAB 1: EDITIONS & CONFERENCES */}
          {activeTab === "editions" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-6)" }}>
              <div>
                <h3
                  style={{
                    color: "#ffffff",
                    marginBottom: "var(--space-3)",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                  }}
                >
                  <span>🏆</span> Tableau d'Honneur des Éditions de la Coupe
                </h3>
                <PalmaresEditionsTable completedEditions={completedEditions} byId={byId} dataset={data} />
              </div>

              <div>
                <PalmaresClubsLeaderboardTable
                  rankedClubs={rankedClubs}
                  defaultLimit={20}
                  showTitle={true}
                />
              </div>
            </div>
          )}

          {/* TAB 2: CLUBS LEADERBOARD DEDICATED VIEW */}
          {activeTab === "clubs" && (
            <div>
              <PalmaresClubsLeaderboardTable
                rankedClubs={rankedClubs}
                defaultLimit={20}
                showTitle={true}
              />
            </div>
          )}

          {/* TAB 3: PLAYERS PALMARES & TROPHIES */}
          {activeTab === "joueurs" && (
            <PalmaresPlayersView
              completedEditions={completedEditions}
              persons={persons}
              clubsById={byId}
              activeSession={session}
            />
          )}

          {/* TAB 4: REGIONAL CHAMPIONS */}
          {activeTab === "regions" && (
            <div>
              <h3
                style={{
                  color: "#ffffff",
                  marginBottom: "var(--space-3)",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                }}
              >
                <span>🌟</span> Palmarès Régional (13 Régions Administratives)
              </h3>
              <PalmaresRegionsTable
                completedEditions={completedEditions}
                dataset={data}
                teamRecords={teamRecords}
              />
            </div>
          )}

          {/* TAB 5: DEPARTMENTAL CHAMPIONS */}
          {activeTab === "departements" && (
            <div>
              <h3
                style={{
                  color: "#ffffff",
                  marginBottom: "var(--space-3)",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                }}
              >
                <span>🏅</span> Palmarès Départemental (101 Départements)
              </h3>
              <PalmaresDepartmentsTable
                completedEditions={completedEditions}
                dataset={data}
                teamRecords={teamRecords}
              />
            </div>
          )}
        </div>
      )}
    </section>
  );
}
