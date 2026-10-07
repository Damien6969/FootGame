import { useEffect, useState, useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ClubBadge } from './ClubBadge';
import { loadGeography } from "../geography/loadGeography";
import type { GeographyDataset } from "../geography/types";
import {
  cupRepository,
  type CupRepository,
  type CupSession,
} from "../storage/cupRepository";
import { departmentLabel } from "../geography/territoryLabels";
import { TeamTrophyBadges } from "./TeamTrophyBadges";
import { FavoriteStarButton } from "./FavoriteStarButton";
import { CommuneLink } from "../geography/CommuneLink";
import { useOptionalCupApp } from "../../app/CupAppContext";

import { buildClubsFromCommunes } from "./clubGenerator";

type Props = Readonly<{
  loadDataset?: () => Promise<GeographyDataset>;
  repository?: CupRepository;
}>;

export function TeamsPage({
  loadDataset,
  repository,
}: Props) {
  const appContext = useOptionalCupApp();
  const isCustom = Boolean(loadDataset || repository);

  const [localDataset, setLocalDataset] = useState<GeographyDataset | null>(null);
  const [localSession, setLocalSession] = useState<CupSession | undefined>();

  useEffect(() => {
    if (!isCustom) return;
    const loader = loadDataset ?? loadGeography;
    const repo = repository ?? cupRepository;
    void Promise.all([loader(), repo.load()]).then(
      ([data, saved]) => {
        setLocalDataset(data);
        setLocalSession(saved);
      },
    );
  }, [isCustom, loadDataset, repository]);

  const dataset = isCustom ? localDataset : appContext?.dataset;
  const session = isCustom ? localSession : appContext?.session;
  const favoriteIds = appContext?.favoriteTeamIds ?? [];

  const [searchParams, setSearchParams] = useSearchParams();
  const qParam = searchParams.get("q") ?? "";
  const [query, setQuery] = useState(qParam);
  const statutParam = searchParams.get("statut") || searchParams.get("tab");
  const validStatuts = ["all", "alive", "eliminated", "favorites", "titled", "fusions", "rivals"];
  const initialStatut = statutParam && validStatuts.includes(statutParam) ? (statutParam as "all" | "alive" | "eliminated" | "favorites" | "titled" | "fusions" | "rivals") : "all";
  const [statusFilter, setStatusFilter] = useState<"all" | "alive" | "eliminated" | "favorites" | "titled" | "fusions" | "rivals">(initialStatut);
  const [page, setPage] = useState(0);

  useEffect(() => {
    const p = searchParams.get("statut") || searchParams.get("tab");
    if (p && validStatuts.includes(p)) {
      setStatusFilter(p as any);
    }
    const q = searchParams.get("q");
    if (q !== null && q !== query) {
      setQuery(q);
    }
  }, [searchParams]);

  const handleQueryChange = (val: string) => {
    setQuery(val);
    setPage(0);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (!val.trim()) {
        next.delete("q");
      } else {
        next.set("q", val);
      }
      return next;
    }, { replace: true });
  };

  const handleSelectStatus = (newStatus: "all" | "alive" | "eliminated" | "favorites" | "titled" | "fusions" | "rivals") => {
    setStatusFilter(newStatus);
    setPage(0);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (newStatus === "all") {
        next.delete("statut");
        next.delete("tab");
      } else {
        next.set("statut", newStatus);
      }
      return next;
    }, { replace: true });
  };

  const active = useMemo(
    () => new Set(session?.activeTeamIds ?? []),
    [session?.activeTeamIds],
  );

  const teamRecords = appContext?.teamRecords;

  const clubs = useMemo(() => {
    if (appContext?.clubs?.length) return appContext.clubs;
    if (!dataset) return [];
    return buildClubsFromCommunes(dataset.communes);
  }, [appContext?.clubs, dataset]);

  const searchIndex = useMemo(() => {
    return clubs.map((club) =>
      `${club.name} ${club.communeName} ${club.communeNames.join(" ")} ${club.departmentId} ${departmentLabel(club.departmentId)}`.toLowerCase(),
    );
  }, [clubs]);

  const filtered = useMemo(() => {
    if (!clubs.length) return [];
    const q = query.trim().toLowerCase();
    const favSet = new Set(favoriteIds);

    const filteredList = clubs.filter((club, index) => {
      if (statusFilter === "favorites" && !favSet.has(club.id)) return false;
      if (statusFilter === "fusions" && !club.isFusion) return false;
      if (statusFilter === "rivals" && !club.isRivalClub) return false;
      if (statusFilter === "titled") {
        const rec = teamRecords?.get(club.id);
        if (!rec || (rec.nationalTitles === 0 && rec.conferenceTitles === 0)) return false;
      }
      if (session) {
        const isAlive = active.has(club.id);
        if (statusFilter === "alive" && !isAlive) return false;
        if (statusFilter === "eliminated" && isAlive) return false;
      }
      if (!q) return true;
      return searchIndex[index]?.includes(q);
    });

    if (session && statusFilter === "favorites") {
      return [...filteredList].sort((a, b) => {
        const aliveA = active.has(a.id) ? 1 : 0;
        const aliveB = active.has(b.id) ? 1 : 0;
        return aliveB - aliveA;
      });
    }

    return filteredList;
  }, [clubs, searchIndex, query, statusFilter, favoriteIds, session, active, teamRecords]);

  if (!dataset) {
    return (
      <section className="status-panel">
        <p>Chargement des équipes…</p>
      </section>
    );
  }

  const pageSize = 50;
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const visible = filtered.slice(page * pageSize, (page + 1) * pageSize);

  return (
    <section className="cup-ready teams-directory">
      <p className="eyebrow">Référentiel national</p>
      <h2>Équipes engagées</h2>
      <div className="summary-strip">
        <span>
          <small>Total clubs</small>
          <strong>{clubs.length.toLocaleString("fr-FR")}</strong>
        </span>
        <span>
          <small>Encore en lice</small>
          <strong style={{ color: "var(--color-accent-light)" }}>
            {session ? active.size.toLocaleString("fr-FR") : "—"}
          </strong>
        </span>
        <span>
          <small>Éliminés</small>
          <strong style={{ color: "var(--color-text-dim)" }}>
            {session ? (clubs.length - active.size).toLocaleString("fr-FR") : "—"}
          </strong>
        </span>
        {clubs.some((c) => c.isFusion) && (
          <span>
            <small>Clubs fusionnés</small>
            <strong style={{ color: "var(--color-primary-light)" }}>
              {clubs.filter((c) => c.isFusion).length}
            </strong>
          </span>
        )}
        {clubs.some((c) => c.isRivalClub) && (
          <span>
            <small>Clubs rivaux créés</small>
            <strong style={{ color: "#facc15" }}>
              {clubs.filter((c) => c.isRivalClub).length}
            </strong>
          </span>
        )}
      </div>
      <div className="table-toolbar">
        <label htmlFor="team-search">Rechercher</label>
        <input
          id="team-search"
          value={query}
          onChange={(event) => handleQueryChange(event.target.value)}
          placeholder="Ville ou département..."
        />

        <div className="matches-filter-chips" style={{ marginLeft: "auto" }}>
          <button
            type="button"
            className={`match-filter-chip ${statusFilter === "all" ? "is-active" : ""}`}
            onClick={() => handleSelectStatus("all")}
          >
            Tous ({clubs.length.toLocaleString("fr-FR")})
          </button>
          {session && (
            <>
              <button
                type="button"
                className={`match-filter-chip ${statusFilter === "alive" ? "is-active" : ""}`}
                onClick={() => handleSelectStatus("alive")}
              >
                En lice ({active.size.toLocaleString("fr-FR")})
              </button>
              <button
                type="button"
                className={`match-filter-chip ${statusFilter === "eliminated" ? "is-active" : ""}`}
                onClick={() => handleSelectStatus("eliminated")}
              >
                Éliminés ({(clubs.length - active.size).toLocaleString("fr-FR")})
              </button>
            </>
          )}
          {clubs.some((c) => c.isFusion) && (
            <button
              type="button"
              className={`match-filter-chip ${statusFilter === "fusions" ? "is-active" : ""}`}
              onClick={() => handleSelectStatus("fusions")}
            >
              🤝 Fusions ({clubs.filter((c) => c.isFusion).length})
            </button>
          )}
          {clubs.some((c) => c.isRivalClub) && (
            <button
              type="button"
              className={`match-filter-chip ${statusFilter === "rivals" ? "is-active" : ""}`}
              onClick={() => handleSelectStatus("rivals")}
            >
              ⚡ Rivaux ({clubs.filter((c) => c.isRivalClub).length})
            </button>
          )}
          <button
            type="button"
            className={`match-filter-chip ${statusFilter === "favorites" ? "is-active" : ""}`}
            onClick={() => handleSelectStatus("favorites")}
          >
            ⭐ Favoris ({favoriteIds.length})
          </button>
          <button
            type="button"
            className={`match-filter-chip ${statusFilter === "titled" ? "is-active" : ""}`}
            onClick={() => handleSelectStatus("titled")}
          >
            🏆 Titrés
          </button>
        </div>
      </div>
      <div className="matches-table-wrap">
        <table className="matches-table">
          <thead>
            <tr>
              <th style={{ width: "2.5rem", textAlign: "center" }}>⭐</th>
              <th>Club</th>
              <th>Commune</th>
              <th>Département</th>
              <th>Population</th>
              <th>Force</th>
              <th>Statut</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((club) => {
              const isAlive = session ? active.has(club.id) : false;
              return (
                <tr key={club.id}>
                  <td style={{ textAlign: "center" }}>
                    <FavoriteStarButton teamId={club.id} teamName={club.name} size="sm" />
                  </td>
                  <td>
                    <div className="team-cell-wrap">
                      <div className="team-cell-main-row">
                        <Link className="team-link" to={`/equipes/${club.id}`} title={club.name}>
                          <ClubBadge club={club} /><span>{club.name}</span>
                        </Link>
                        {club.isFusion && (
                          <span className="badge badge--accent" style={{ fontSize: "0.72rem", padding: "1px 6px" }}>
                            Fusion
                          </span>
                        )}
                        {club.isRivalClub && (
                          <span className="badge badge--accent" style={{ fontSize: "0.72rem", padding: "1px 6px", background: "rgba(234, 179, 8, 0.15)", color: "#facc15", border: "1px solid rgba(234, 179, 8, 0.3)" }}>
                            Rival
                          </span>
                        )}
                      </div>
                      <div className="team-cell-trophies-row">
                        <TeamTrophyBadges teamId={club.id} size="xs" />
                      </div>
                    </div>
                  </td>
                  <td>
                    <strong>
                      <CommuneLink communeId={club.communeId} communeName={club.communeName} />
                    </strong>
                    {club.isFusion && (
                      <div style={{ fontSize: "0.78rem", color: "var(--color-primary-light)", marginTop: "2px" }}>
                        🤝{" "}
                        {club.communeNames.map((name, i) => {
                          const cId = club.communeIds[i] ?? club.communeId;
                          return (
                            <span key={i}>
                              {i > 0 && " + "}
                              <CommuneLink communeId={cId} communeName={name} />
                            </span>
                          );
                        })}
                      </div>
                    )}
                    {club.isRivalClub && (
                      <div style={{ fontSize: "0.78rem", color: "#facc15", marginTop: "2px" }}>
                        ⚡ Rival (éd. {club.parentChampionYear ?? "passée"})
                      </div>
                    )}
                  </td>
                  <td>
                    <span className="badge badge--neutral" style={{ marginRight: '6px' }}>{club.departmentId}</span>
                    {departmentLabel(club.departmentId)}
                  </td>
                  <td>{club.population.toLocaleString("fr-FR")} hab.</td>
                  <td>
                    <span className="badge badge--blue" title="Variable de force propre au club">
                      {club.strength.toFixed(1)}
                    </span>
                  </td>
                  <td>
                    {session ? (
                      isAlive ? (
                        <span className="badge badge--emerald">En lice</span>
                      ) : (
                        <span className="badge badge--neutral">Éliminé</span>
                      )
                    ) : (
                      <span className="badge badge--neutral">Non démarrée</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="pagination">
        <button disabled={page === 0} onClick={() => setPage(page - 1)}>
          ← Précédent
        </button>
        <span style={{ fontWeight: 600, color: 'var(--color-text-muted)' }}>
          Page {page + 1} sur {pages} ({filtered.length.toLocaleString("fr-FR")} clubs)
        </span>
        <button disabled={page + 1 >= pages} onClick={() => setPage(page + 1)}>
          Suivant →
        </button>
      </div>
    </section>
  );
}
