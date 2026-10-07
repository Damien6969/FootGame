import { useEffect, useState, useMemo } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { loadGeography } from "../geography/loadGeography";
import type { GeographyDataset, Commune } from "../geography/types";
import type { Club } from "./types";
import { departmentLabel, regionLabel } from "../geography/territoryLabels";
import { cupRepository, type CupSession, type SeasonArchive, type FusionEvent } from "../storage/cupRepository";
import { useDetailedArchives } from '../storage/useDetailedArchives';
import { getRoundViews } from "../cup/cupSelectors";
import { phaseLabel } from '../competition/phaseLabels';
import { getRoundBadgeClass, getStageBadgeClass } from '../competition/echelonColors';
import { TeamLink } from "./TeamLink";
import { ClubBadge } from './ClubBadge';
import { ClubIdentityEditor } from './ClubIdentityEditor';
import { getClubIdentity, identityStyle, type ClubIdentity } from './clubIdentity';
import { CommuneLink } from "../geography/CommuneLink";
import { FavoriteStarButton } from "./FavoriteStarButton";
import { TeamTrophyBadges } from "./TeamTrophyBadges";
import { useOptionalCupApp } from "../../app/CupAppContext";
import { buildClubsFromCommunes, createClubFromCommune } from "./clubGenerator";
import {
  resolveCommuneRealClubName,
  resolveAlliancePartners,
  resolvePartnerClubName,
} from "./clubResolution";
import { isMatchUpset, type MatchResult } from "../match/simulateMatch";
import { parseSeasonYear } from "../history/palmaresSelectors";
import { archiveClubs } from '../history/archiveClubs';
import { CoachBadge } from '../coaches/CoachBadge';
import { useTeamPerformances } from './useTeamPerformances';
import {
  getClubRoster,
  getClubActiveStarters,
  getClubLoanedOut,
  getClubLoanedIn,
  computeOverallRating,
} from "../persons/personSelectors";
import { PersonTable } from "../persons/PersonTable";
import type { Person, PersonCareerSeason } from "../persons/types";

export type TeamTab = 'palmares' | 'parcours' | 'effectif' | 'alliances' | 'all';

export type SeasonStarterItem = {
  id: string;
  firstName: string;
  lastName: string;
  attack: number;
  defense: number;
  position?: 'ATTACKER' | 'DEFENDER';
};

function SeasonStartersCell({
  starters,
}: {
  starters?: { attacker: SeasonStarterItem | null; defender: SeasonStarterItem | null } | null;
}) {
  if (!starters || (!starters.attacker && !starters.defender)) {
    return <span style={{ color: "var(--color-text-dim)", fontSize: "0.85rem" }}>—</span>;
  }

  const { attacker, defender } = starters;

  return (
    <div className="season-starters-cell">
      {attacker && (
        <div
          className="season-starter-line season-starter-line--attacker"
          title={`Attaquant titulaire · Note ATQ ${attacker.attack}`}
        >
          <span className="season-starter-role-badge season-starter-role-badge--atk">⚡ ATT</span>
          <Link to={`/personnes/${attacker.id}`} className="season-starter-link">
            {attacker.firstName} {attacker.lastName}
          </Link>
          <span className="season-starter-stat-val season-starter-stat-val--atk">
            {attacker.attack}
          </span>
        </div>
      )}
      {defender && (
        <div
          className="season-starter-line season-starter-line--defender"
          title={`Défenseur titulaire · Note DEF ${defender.defense}`}
        >
          <span className="season-starter-role-badge season-starter-role-badge--def">🛡️ DEF</span>
          <Link to={`/personnes/${defender.id}`} className="season-starter-link">
            {defender.firstName} {defender.lastName}
          </Link>
          <span className="season-starter-stat-val season-starter-stat-val--def">
            {defender.defense}
          </span>
        </div>
      )}
    </div>
  );
}


function getRoundPhaseText(roundNumber: number): string {
  if (roundNumber <= 4) return 'Départemental';
  if (roundNumber <= 8) return 'Régional';
  if (roundNumber <= 12) return 'Conférence';
  if (roundNumber === 13) return '1/2 finale';
  if (roundNumber === 14) return 'Finale';
  return 'National';
}

export function TeamPage() {
  const { teamId } = useParams();
  const appContext = useOptionalCupApp();

  const [localData, setLocalData] = useState<GeographyDataset>();
  const [localSession, setLocalSession] = useState<CupSession>();
  const [localArchives, setLocalArchives] = useState<readonly SeasonArchive[]>([]);
  const [showAllSeasons, setShowAllSeasons] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab') as TeamTab | null;
  const [activeTab, setActiveTab] = useState<TeamTab>(
    tabParam && ['palmares', 'parcours', 'effectif', 'alliances', 'all'].includes(tabParam) ? tabParam : 'palmares'
  );

  const handleTabChange = (tab: TeamTab) => {
    setActiveTab(tab);
    if (tab === 'palmares') {
      searchParams.delete('tab');
      setSearchParams(searchParams, { replace: true });
    } else {
      searchParams.set('tab', tab);
      setSearchParams(searchParams, { replace: true });
    }
  };

  useEffect(() => {
    if (appContext?.dataset) return;
    const loader = cupRepository.loadArchives ? cupRepository.loadArchives() : Promise.resolve([]);
    void Promise.all([loadGeography(), cupRepository.load(), loader]).then(
      ([dataset, saved, loadedArchives]) => {
        setLocalData(dataset);
        setLocalSession(saved);
        setLocalArchives(loadedArchives ?? []);
      },
    );
  }, [appContext]);

  const data = appContext?.dataset ?? localData;
  const session = appContext?.session ?? localSession;
  const needsDetailedArchives = activeTab === 'parcours' || activeTab === 'all';
  const { archives, loading: archivesLoading, error: archivesError } = useDetailedArchives(
    appContext?.archives ?? localArchives,
    needsDetailedArchives,
  );

  const bounds = useMemo(() => {
    if (!data) return { min: 1000, max: 2150000 };
    return {
      min: Math.min(...data.communes.map((t) => t.population)),
      max: Math.max(...data.communes.map((t) => t.population)),
    };
  }, [data]);

  const clubsById = useMemo(() => {
    if (appContext?.clubsById) return appContext.clubsById;
    if (session?.clubs?.length) return new Map(session.clubs.map(c => [c.id, c]));
    if (!data) return new Map();
    return new Map(buildClubsFromCommunes(data.communes, bounds).map((c) => [c.id, c]));
  }, [appContext?.clubsById, session?.clubs, data, bounds]);

  const archivedClub = useMemo(() => {
    if (!teamId || !data || clubsById.has(teamId)) return undefined;
    const archive = [...archives].sort((a, b) => b.year - a.year).find(a =>
      a.clubs?.some(c => c.id === teamId) || a.teamPerformances?.[teamId]);
    return archive ? archiveClubs(archive, data).get(teamId) : undefined;
  }, [teamId, data, clubsById, archives]);

  const resolvedAbsorbedClub = useMemo(() => {
    if (!teamId || clubsById.has(teamId) || archivedClub) return undefined;
    for (const c of clubsById.values() as Iterable<any>) {
      const fc = c.fusedClubs?.find((item: { id: string; name: string; communeId?: string; identity?: any }) => item.id === teamId);
      if (fc) {
        const cCommune = data?.communes.find((cm) => cm.id === (fc.communeId ?? teamId.split('-')[0]));
        if (cCommune) {
          const base = createClubFromCommune(cCommune, bounds);
          return {
            ...base,
            id: fc.id,
            name: fc.name,
            shortName: fc.name,
            identity: fc.identity ?? getClubIdentity({ id: fc.id }),
          } as Club;
        }
      }
    }
    const allFusions = [
      ...(session?.interseasonReport?.fusions ?? []),
      ...archives.flatMap((a) => a.fusions ?? a.interseasonReport?.fusions ?? []),
    ];
    const match = allFusions.find((f) => f.absorbedClubId === teamId);
    if (match) {
      const cCommune = data?.communes.find((cm) => cm.id === (match.absorbedCommuneIds?.[0] ?? teamId.split('-')[0]));
      if (cCommune) {
        const base = createClubFromCommune(cCommune, bounds);
        return {
          ...base,
          id: teamId,
          name: match.absorbedClubName,
          shortName: match.absorbedClubName,
          identity: getClubIdentity({ id: teamId }),
        } as Club;
      }
    }
    return undefined;
  }, [teamId, clubsById, archivedClub, data, bounds, session, archives]);

  const club = clubsById.get(teamId ?? "") ?? archivedClub ?? resolvedAbsorbedClub;
  const baseCommuneId = club?.communeId ?? (teamId ? teamId.split('-')[0] : '');
  const commune = data?.communes.find((item) => item.id === baseCommuneId);
  const clubObj = commune ? (club ?? createClubFromCommune(commune, bounds)) : undefined;
  const { teamSeasons } = useTeamPerformances(clubObj?.id ?? teamId);

  useEffect(() => {
    setIsEditingName(false);
    setNameInput(clubObj?.name ?? "");
    setSaveSuccess(false);
  }, [teamId, clubObj?.name]);

  const handleSaveName = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = nameInput.trim();
    if (!trimmed || !clubObj || trimmed === clubObj.name) {
      setIsEditingName(false);
      return;
    }
    setIsSaving(true);
    try {
      if (appContext?.renameClub) {
        await appContext.renameClub(clubObj.id, trimmed);
      } else if (localSession) {
        const currentClubs = localSession.clubs && localSession.clubs.length > 0
          ? localSession.clubs
          : (data ? buildClubsFromCommunes(data.communes, bounds) : []);
        const updatedClubs = currentClubs.map((c) =>
          c.id === clubObj.id
            ? { ...c, name: trimmed, shortName: trimmed.length > 40 ? `${trimmed.slice(0, 37)}...` : trimmed, isCustomName: true }
            : c
        );
        const updatedSession = { ...localSession, clubs: updatedClubs };
        setLocalSession(updatedSession);
        await cupRepository.save(updatedSession);
      }
      setIsEditingName(false);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveIdentity = async (identity: ClubIdentity) => {
    if (!clubObj) throw new Error('Club indisponible.');
    if (appContext?.updateClubIdentity) {
      await appContext.updateClubIdentity(clubObj.id, identity);
    } else {
      const saved = appContext?.session ?? localSession;
      if (!saved) throw new Error('Créez une carrière pour enregistrer cette identité.');
      const updated = { ...saved, clubs: [...clubsById.values()].map(c => c.id === clubObj.id ? { ...c, identity } : c) };
      if (appContext) await appContext.persistSession(updated);
      else { await cupRepository.save(updated); setLocalSession(updated); }
    }
  };

  // Récupération de tous les événements de fusion concernant ce club
  const teamFusions = useMemo(() => {
    if (!clubObj || !commune) return [];
    const list: Array<{
      year?: number;
      absorbedClubId: string;
      absorbedClubName: string;
      communes: Array<{ name: string; obj?: Commune }>;
      leadClubName?: string;
      oldStrength?: number;
      newStrength?: number;
    }> = [];

    const seenAbsorbedIds = new Set<string>();

    const resolveAbsorbedCommunes = (
      absorbedClubId: string,
      fcCommuneNames?: readonly string[],
      fusionEvent?: FusionEvent,
    ): Array<{ name: string; obj?: Commune }> => {
      // 1. Si fcCommuneNames est présent et non vide
      if (fcCommuneNames && fcCommuneNames.length > 0) {
        return fcCommuneNames.map((name: string) => ({
          name,
          obj: data?.communes.find((c) => c.name === name || c.id === name),
        }));
      }

      // 2. Si fusionEvent a absorbedCommuneNames
      const fEventAny = fusionEvent as any;
      if (fEventAny?.absorbedCommuneNames && fEventAny.absorbedCommuneNames.length > 0) {
        return fEventAny.absorbedCommuneNames.map((name: string) => ({
          name,
          obj: data?.communes.find((c) => c.name === name || c.id === name),
        }));
      }

      // 3. Si fusionEvent a communeNames, toutes les communes qui ne sont pas la commune siège de ce club
      if (fusionEvent?.communeNames && fusionEvent.communeNames.length > 0) {
        const otherCommunes = fusionEvent.communeNames.filter((name: string) => name !== commune.name);
        if (otherCommunes.length > 0) {
          return otherCommunes.map((name: string) => ({
            name,
            obj: data?.communes.find((c) => c.name === name || c.id === name),
          }));
        }
      }

      // 4. Fallback sur le communeId de l'absorbedClubId
      const cId = absorbedClubId.split('-')[0];
      const cObj = data?.communes.find((c) => c.id === cId);
      return [
        {
          name: cObj?.name ?? 'Commune partenaire',
          obj: cObj,
        },
      ];
    };

    // 1. Depuis clubObj.fusedClubs si présent
    if (clubObj.fusedClubs && clubObj.fusedClubs.length > 0) {
      for (const fc of clubObj.fusedClubs) {
        if (!seenAbsorbedIds.has(fc.id)) {
          seenAbsorbedIds.add(fc.id);
          const communes = resolveAbsorbedCommunes(fc.id, fc.communeNames);
          let fcYear = fc.year;
          if (fcYear === undefined) {
            const sessionMatch = session?.interseasonReport?.fusions?.find((f) => f.mergedClubId === clubObj.id && f.absorbedClubId === fc.id);
            if (sessionMatch) {
              fcYear = session?.interseasonReport?.seasonYear ?? (session?.seasonYear ? session.seasonYear - 1 : undefined);
            } else {
              const archMatch = archives.find((a) => (a.fusions ?? a.interseasonReport?.fusions ?? []).some((f) => f.mergedClubId === clubObj.id && f.absorbedClubId === fc.id));
              if (archMatch) {
                fcYear = archMatch.year;
              }
            }
          }
          list.push({
            year: fcYear,
            absorbedClubId: fc.id,
            absorbedClubName: fc.name,
            communes,
            oldStrength: fc.oldStrength,
            newStrength: fc.newStrength,
          });
        }
      }
    }

    // 2. Depuis le rapport d'inter-saison de la session active
    if (session?.interseasonReport?.fusions) {
      const year = session.interseasonReport.seasonYear ?? (session.seasonYear ? session.seasonYear - 1 : undefined);
      for (const f of session.interseasonReport.fusions) {
        if (f.mergedClubId === clubObj.id && !seenAbsorbedIds.has(f.absorbedClubId)) {
          seenAbsorbedIds.add(f.absorbedClubId);
          const communes = resolveAbsorbedCommunes(f.absorbedClubId, undefined, f);
          list.push({
            year,
            absorbedClubId: f.absorbedClubId,
            absorbedClubName: f.absorbedClubName,
            communes,
            leadClubName: f.leadClubName,
            oldStrength: f.oldStrength,
            newStrength: f.newStrength,
          });
        }
      }
    }

    // 3. Depuis les archives des saisons passées
    for (const arch of archives) {
      const fusions = arch.fusions ?? arch.interseasonReport?.fusions ?? [];
      for (const f of fusions) {
        if (f.mergedClubId === clubObj.id && !seenAbsorbedIds.has(f.absorbedClubId)) {
          seenAbsorbedIds.add(f.absorbedClubId);
          const communes = resolveAbsorbedCommunes(f.absorbedClubId, undefined, f);
          list.push({
            year: arch.year,
            absorbedClubId: f.absorbedClubId,
            absorbedClubName: f.absorbedClubName,
            communes,
            leadClubName: f.leadClubName,
            oldStrength: f.oldStrength,
            newStrength: f.newStrength,
          });
        }
      }
    }

    // 4. Compléter avec toutes les autres communes partenaires de l'alliance non encore listées
    if (clubObj.isFusion && data && commune) {
      const otherNames = clubObj.communeNames.filter((n: string) => n !== commune.name);
      for (const pName of otherNames) {
        const alreadyCovered = list.some((item) => item.communes.some((c) => c.name === pName));
        if (alreadyCovered) continue;

        const pCommune = data.communes.find((c) => c.name === pName);
        const pClubName = resolvePartnerClubName(pName, { leadClubId: clubObj.id, dataset: data, session, archives });
        let partnerYear: number | undefined;
        if (session?.interseasonReport?.fusions) {
          const sMatch = session.interseasonReport.fusions.find((f) => f.mergedClubId === clubObj.id && (f.communeNames?.includes(pName) || (f as any).absorbedCommuneNames?.includes(pName)));
          if (sMatch) {
            partnerYear = session.interseasonReport.seasonYear ?? (session.seasonYear ? session.seasonYear - 1 : undefined);
          }
        }
        if (partnerYear === undefined) {
          const archMatch = archives.find((a) => (a.fusions ?? a.interseasonReport?.fusions ?? []).some((f) => f.mergedClubId === clubObj.id && (f.communeNames?.includes(pName) || (f as any).absorbedCommuneNames?.includes(pName))));
          if (archMatch) {
            partnerYear = archMatch.year;
          }
        }
        list.push({
          year: partnerYear,
          absorbedClubId: pCommune?.id ?? pName,
          absorbedClubName: pClubName,
          communes: [{ name: pName, obj: pCommune }],
          oldStrength: undefined,
          newStrength: clubObj.strength,
        });
      }
    }

    // Tri de la date la plus récente vers la date la plus ancienne
    return list.sort((a, b) => {
      const yearA = a.year ?? -Infinity;
      const yearB = b.year ?? -Infinity;
      if (yearB !== yearA) {
        return yearB - yearA;
      }
      return a.absorbedClubName.localeCompare(b.absorbedClubName);
    });
  }, [clubObj, session, archives, data, commune]);

  const [fusionSortKey, setFusionSortKey] = useState<'year' | 'name' | 'strength'>('year');
  const [fusionSortDir, setFusionSortDir] = useState<'asc' | 'desc'>('desc');

  const handleFusionSort = (key: 'year' | 'name' | 'strength') => {
    if (fusionSortKey === key) {
      setFusionSortDir((prev) => (prev === 'desc' ? 'asc' : 'desc'));
    } else {
      setFusionSortKey(key);
      setFusionSortDir(key === 'year' || key === 'strength' ? 'desc' : 'asc');
    }
  };

  const sortedTeamFusions = useMemo(() => {
    return [...teamFusions].sort((a, b) => {
      if (fusionSortKey === 'year') {
        const yearA = a.year ?? -Infinity;
        const yearB = b.year ?? -Infinity;
        if (yearA !== yearB) {
          return fusionSortDir === 'desc' ? yearB - yearA : yearA - yearB;
        }
        return a.absorbedClubName.localeCompare(b.absorbedClubName);
      }
      if (fusionSortKey === 'name') {
        const comp = a.absorbedClubName.localeCompare(b.absorbedClubName);
        return fusionSortDir === 'asc' ? comp : -comp;
      }
      if (fusionSortKey === 'strength') {
        const strA = a.newStrength ?? -Infinity;
        const strB = b.newStrength ?? -Infinity;
        if (strA !== strB) {
          return fusionSortDir === 'desc' ? strB - strA : strA - strB;
        }
        return a.absorbedClubName.localeCompare(b.absorbedClubName);
      }
      return 0;
    });
  }, [teamFusions, fusionSortKey, fusionSortDir]);

  const alliancePartners = useMemo(() => {
    if (!clubObj || !clubObj.isFusion) return [];
    return resolveAlliancePartners(clubObj, data, session, archives);
  }, [clubObj, data, session, archives]);

  const leadGenuineName = useMemo(() => {
    if (!clubObj || !commune) return undefined;
    return resolveCommuneRealClubName(commune, clubObj, { dataset: data, session, archives });
  }, [commune, clubObj, data, session, archives]);

  // Communes de l'alliance/fusion triées de la plus grande à la plus petite (population)
  const fusionCommunesSorted = useMemo(() => {
    if (!clubObj?.isFusion) return [];
    const map = new Map<string, { id: string; name: string; population: number; commune?: Commune; isHeadquarter: boolean }>();

    // 1. Commune siège / de rattachement
    if (commune) {
      map.set(commune.id, {
        id: commune.id,
        name: commune.name,
        population: commune.population,
        commune,
        isHeadquarter: true,
      });
    }

    // 2. Communes listées dans clubObj.communeNames
    if (clubObj.communeNames && data) {
      for (const name of clubObj.communeNames) {
        const cm = data.communes.find((c) => c.name === name || c.id === name);
        const isHq = cm ? cm.id === commune?.id : name === commune?.name;
        const id = cm?.id ?? name;
        if (!map.has(id)) {
          map.set(id, {
            id,
            name: cm?.name ?? name,
            population: cm?.population ?? 0,
            commune: cm,
            isHeadquarter: isHq,
          });
        }
      }
    }

    // 3. Partenaires d'alliance résolus
    for (const p of alliancePartners) {
      const id = p.commune?.id ?? p.communeId ?? p.communeName;
      if (!map.has(id)) {
        map.set(id, {
          id,
          name: p.commune?.name ?? p.communeName,
          population: p.commune?.population ?? 0,
          commune: p.commune,
          isHeadquarter: p.isHeadquarter,
        });
      }
    }

    return Array.from(map.values()).sort((a, b) => b.population - a.population);
  }, [clubObj, data, alliancePartners, commune]);

  // Vérifier si le club actuel a été absorbé lors d'une fusion
  const absorbedByFusion = useMemo(() => {
    if (!clubObj) return undefined;
    if (session?.interseasonReport?.fusions) {
      const match = session.interseasonReport.fusions.find((f) => f.absorbedClubId === clubObj.id);
      if (match) return { fusion: match, year: session.seasonYear ? session.seasonYear - 1 : undefined };
    }
    for (const arch of archives) {
      const fusions = arch.fusions ?? arch.interseasonReport?.fusions ?? [];
      const match = fusions.find((f) => f.absorbedClubId === clubObj.id);
      if (match) return { fusion: match, year: arch.year };
    }
    return undefined;
  }, [clubObj, session, archives]);

  const matches = useMemo(() => {
    if (!session || !clubObj) return [];
    return getRoundViews(session).flatMap((round) =>
      round.matches
        .filter((m) => m.homeTeamId === clubObj.id || m.awayTeamId === clubObj.id)
        .map((match) => ({ round, match, result: round.results[match.id] })),
    );
  }, [session, clubObj]);

  // Situation actuelle du club dans la Coupe (Saison active - Tâches 13 & 15)
  const currentStatus = useMemo(() => {
    if (!session || !clubObj) return null;

    // 1. Champion National
    if (session.championId === clubObj.id) {
      return {
        type: "CHAMPION" as const,
        cardClass: "status-card--champion",
        badgeText: "🏆 Champion de France",
        badgeClass: "badge--gold",
        title: `Champion de France · Coupe des communes ${session.seasonYear ?? 2026}`,
        description: `Sacre national remporté avec succès ! Le trophée suprême a été décroché lors de cette édition.`,
      };
    }

    // 2. Le club a un match au tour en cours
    const currentMatch = session.round.matches.find(
      (m) => m.homeTeamId === clubObj.id || m.awayTeamId === clubObj.id
    );

    const roundViews = getRoundViews(session);
    const currentRoundView = roundViews.find((r) => r.number === session.roundNumber);
    const currentPhase = currentRoundView?.phase ?? "DEPARTMENT";

    if (currentMatch) {
      const result = session.results[currentMatch.id];
      const isHome = currentMatch.homeTeamId === clubObj.id;
      const opponentId = isHome ? currentMatch.awayTeamId : currentMatch.homeTeamId;
      const opponent = clubsById.get(opponentId) ?? (() => {
        const c = data?.communes.find((cm) => cm.id === (opponentId ? opponentId.split('-')[0] : ''));
        return c ? createClubFromCommune(c, bounds) : undefined;
      })();

      if (result) {
        const won = result.winnerId === clubObj.id;
        if (won) {
          return {
            type: "QUALIFIED" as const,
            cardClass: "status-card--qualified",
            badgeText: `🟢 Qualifié pour le Tour ${session.roundNumber + 1}`,
            badgeClass: "badge--emerald",
            title: `Qualifié pour le Tour ${session.roundNumber + 1}`,
            description: `Victoire ${result.homeScore} – ${result.awayScore}${result.isExtraTime ? " (a.p.)" : ""} contre ${opponent?.name ?? opponentId} au Tour ${session.roundNumber} (${phaseLabel(currentPhase)}).`,
            matchId: currentMatch.id,
            result,
            opponent,
            isHome,
          };
        } else {
          return {
            type: "ELIMINATED" as const,
            cardClass: "status-card--eliminated",
            badgeText: `🔴 Éliminé au Tour ${session.roundNumber}`,
            badgeClass: "badge--rose",
            title: `Éliminé au Tour ${session.roundNumber}`,
            description: `Défaite ${result.homeScore} – ${result.awayScore}${result.isExtraTime ? " (a.p.)" : ""} face à ${opponent?.name ?? opponentId} (${phaseLabel(currentPhase)}).`,
            matchId: currentMatch.id,
            result,
            opponent,
            isHome,
          };
        }
      } else {
        const diffStrength = opponent ? opponent.strength - clubObj.strength : 0;
        return {
          type: "ALIVE" as const,
          cardClass: "status-card--alive",
          badgeText: `🟢 En lice · Tour ${session.roundNumber}`,
          badgeClass: "badge--emerald",
          title: `En lice au Tour ${session.roundNumber} (${phaseLabel(currentPhase)})`,
          matchId: currentMatch.id,
          opponent,
          opponentId,
          isHome,
          diffStrength,
        };
      }
    }

    // 3. Exempté pour le tour en cours
    if (session.round.byeTeamIds.includes(clubObj.id)) {
      return {
        type: "BYE" as const,
        cardClass: "status-card--bye",
        badgeText: `⭐ Exempté du Tour ${session.roundNumber}`,
        badgeClass: "badge--gold",
        title: `Exemption au Tour ${session.roundNumber}`,
        description: `Qualifié d'office pour le Tour ${session.roundNumber + 1} sans jouer ce tour (selon les quotas territoriaux).`,
      };
    }

    // 4. Éliminé lors d'un tour précédent
    const historyMatches = session.history.filter(
      (m) => m.homeTeamId === clubObj.id || m.awayTeamId === clubObj.id
    );
    if (historyMatches.length > 0) {
      const last = historyMatches[historyMatches.length - 1];
      const isHome = last.homeTeamId === clubObj.id;
      const opponentId = isHome ? last.awayTeamId : last.homeTeamId;
      const opponent = clubsById.get(opponentId) ?? (() => {
        const c = data?.communes.find((cm) => cm.id === (opponentId ? opponentId.split('-')[0] : ''));
        return c ? createClubFromCommune(c, bounds) : undefined;
      })();
      return {
        type: "ELIMINATED" as const,
        cardClass: "status-card--eliminated",
        badgeText: `🔴 Éliminé au Tour ${last.roundNumber}`,
        badgeClass: "badge--rose",
        title: `Éliminé au Tour ${last.roundNumber}`,
        description: `Battu ${last.result.homeScore} – ${last.result.awayScore}${last.result.isExtraTime ? " (a.p.)" : ""} par ${opponent?.name ?? opponentId}.`,
        opponent,
        result: last.result,
        matchId: (last as any).matchId,
        roundNumber: last.roundNumber,
      };
    }

    // 5. Compétition terminée
    if (session.championId) {
      return {
        type: "FINISHED" as const,
        cardClass: "status-card--neutral",
        badgeText: "Saison terminée",
        badgeClass: "badge--neutral",
        title: `Édition ${session.seasonYear ?? 2026} achevée`,
        description: `Cette édition a été remportée par ${clubsById.get(session.championId)?.name ?? session.championId}.`,
      };
    }

    return null;
  }, [session, clubObj, clubsById, data, bounds]);

  // Matchs disputés par ce club dans la session en cours
  const sessionMatchesForClub = useMemo(() => {
    if (!session || !clubObj) return [];
    const list: Array<{
      roundNumber: number;
      matchId: string;
      homeTeamId: string;
      awayTeamId: string;
      result: MatchResult;
    }> = [];

    for (const m of session.history) {
      if (m.homeTeamId === clubObj.id || m.awayTeamId === clubObj.id) {
        list.push({
          roundNumber: m.roundNumber,
          matchId: (m as any).matchId ?? `${m.roundNumber}:${m.homeTeamId}-${m.awayTeamId}`,
          homeTeamId: m.homeTeamId,
          awayTeamId: m.awayTeamId,
          result: m.result,
        });
      }
    }

    for (const m of session.round.matches) {
      if ((m.homeTeamId === clubObj.id || m.awayTeamId === clubObj.id) && session.results[m.id]) {
        list.push({
          roundNumber: session.roundNumber,
          matchId: m.id,
          homeTeamId: m.homeTeamId,
          awayTeamId: m.awayTeamId,
          result: session.results[m.id],
        });
      }
    }

    return list;
  }, [session, clubObj]);

  // Historique exhaustif de tous les matchs joués (archives + session en cours)
  const allHistoricalMatches = useMemo(() => {
    if (!clubObj) return [];
    const matchesList: Array<{
      seasonYear: number;
      roundNumber: number;
      matchId: string;
      opponentId: string;
      opponent?: Club | Commune;
      opponentStrength?: number;
      isHome: boolean;
      ourScore: number;
      opponentScore: number;
      won: boolean;
      result: MatchResult;
    }> = [];

    const resolveClub = (id: string, archiveClubs?: readonly Club[]) => {
      if (archiveClubs) {
        const found = archiveClubs.find((c) => c.id === id);
        if (found) return found;
      }
      const foundById = clubsById.get(id);
      if (foundById) return foundById;
      const baseId = id.split('-')[0];
      const cObj = data?.communes.find((c) => c.id === baseId);
      if (cObj) return createClubFromCommune(cObj, bounds);
      return undefined;
    };

    // 1. Depuis les archives
    for (const arch of archives) {
      for (const m of arch.history) {
        if (m.homeTeamId === clubObj.id || m.awayTeamId === clubObj.id) {
          const isHome = m.homeTeamId === clubObj.id;
          const opponentId = isHome ? m.awayTeamId : m.homeTeamId;
          const opponent = resolveClub(opponentId, arch.clubs);
          const opponentStrength =
            opponent && 'strength' in opponent && typeof opponent.strength === 'number'
              ? opponent.strength
              : undefined;
          const ourScore = isHome ? m.result.homeScore : m.result.awayScore;
          const opponentScore = isHome ? m.result.awayScore : m.result.homeScore;
          const won = m.result.winnerId === clubObj.id;

          matchesList.push({
            seasonYear: arch.year,
            roundNumber: m.roundNumber,
            matchId: (m as any).matchId ?? `${arch.year}:${m.roundNumber}:${opponentId}`,
            opponentId,
            opponent,
            opponentStrength,
            isHome,
            ourScore,
            opponentScore,
            won,
            result: m.result,
          });
        }
      }
    }

    // 2. Depuis la session active (si pas déjà archivée sous la même année)
    const currentYear = session?.seasonYear ?? (session ? parseSeasonYear(session.seed, 2026) : 2026);
    const alreadyInArchive = archives.some((a) => a.year === currentYear && a.nationalChampionId);

    if (session && !alreadyInArchive) {
      for (const m of sessionMatchesForClub) {
        const isHome = m.homeTeamId === clubObj.id;
        const opponentId = isHome ? m.awayTeamId : m.homeTeamId;
        const opponent = resolveClub(opponentId, session.clubs);
        const opponentStrength =
          opponent && 'strength' in opponent && typeof opponent.strength === 'number'
            ? opponent.strength
            : undefined;
        const ourScore = isHome ? m.result.homeScore : m.result.awayScore;
        const opponentScore = isHome ? m.result.awayScore : m.result.homeScore;
        const won = m.result.winnerId === clubObj.id;

        matchesList.push({
          seasonYear: currentYear,
          roundNumber: m.roundNumber,
          matchId: m.matchId,
          opponentId,
          opponent,
          opponentStrength,
          isHome,
          ourScore,
          opponentScore,
          won,
          result: m.result,
        });
      }
    }

    return matchesList;
  }, [clubObj, archives, session, sessionMatchesForClub, clubsById, data, bounds]);

  // Plus grosse équipe battue (plus grand exploit en force)
  const biggestWin = useMemo(() => {
    if (!clubObj || allHistoricalMatches.length === 0) return null;
    const wonMatches = allHistoricalMatches.filter(
      (m) => m.won && m.opponentStrength !== undefined,
    );
    if (wonMatches.length === 0) return null;

    wonMatches.sort((a, b) => {
      const diff = (b.opponentStrength ?? 0) - (a.opponentStrength ?? 0);
      if (Math.abs(diff) > 0.01) return diff;
      if (b.roundNumber !== a.roundNumber) return b.roundNumber - a.roundNumber;
      return b.seasonYear - a.seasonYear;
    });

    const best = wonMatches[0];
    const oppStrength = best.opponentStrength ?? 0;
    const diffStrength = oppStrength - clubObj.strength;
    const scoreDisplay = `${best.ourScore} – ${best.opponentScore}${
      best.result.isExtraTime ? ' (a.p.)' : ''
    }`;

    return {
      ...best,
      opponentStrength: oppStrength,
      scoreDisplay,
      diffStrength,
    };
  }, [clubObj, allHistoricalMatches]);

  // Bête noire (équipe contre laquelle ils ont le plus perdu) et Proie favorite (le plus gagné)
  // Règle demandée : max 3 équipes affichées si égalité. Si plus de 3 équipes à égalité, on n'affiche rien.
  const { nemesis, favoritePrey } = useMemo(() => {
    if (!clubObj || allHistoricalMatches.length === 0) {
      return { nemesis: null, favoritePrey: null };
    }

    const opponentsMap = new Map<
      string,
      {
        opponentId: string;
        opponent?: Club | Commune;
        wins: number;
        defeats: number;
      }
    >();

    for (const m of allHistoricalMatches) {
      let opp = opponentsMap.get(m.opponentId);
      if (!opp) {
        opp = {
          opponentId: m.opponentId,
          opponent: m.opponent,
          wins: 0,
          defeats: 0,
        };
        opponentsMap.set(m.opponentId, opp);
      }
      if (m.won) {
        opp.wins += 1;
      } else {
        opp.defeats += 1;
      }
    }

    const allOpponents = Array.from(opponentsMap.values());

    // Bête noire : max défaites
    const maxDefeats = allOpponents.length > 0 ? Math.max(...allOpponents.map((o) => o.defeats)) : 0;
    let nemesisResult: {
      count: number;
      teams: Array<{ id: string; name: string; club?: Club | Commune }>;
      tooMany?: boolean;
    } | null = null;

    if (maxDefeats > 0) {
      const tied = allOpponents.filter((o) => o.defeats === maxDefeats);
      if (tied.length <= 3) {
        nemesisResult = {
          count: maxDefeats,
          teams: tied.map((o) => ({
            id: o.opponentId,
            name: o.opponent?.name ?? o.opponentId,
            club: o.opponent,
          })),
        };
      } else {
        nemesisResult = {
          count: maxDefeats,
          teams: [],
          tooMany: true,
        };
      }
    }

    // Proie favorite : max victoires
    const maxWins = allOpponents.length > 0 ? Math.max(...allOpponents.map((o) => o.wins)) : 0;
    let favoritePreyResult: {
      count: number;
      teams: Array<{ id: string; name: string; club?: Club | Commune }>;
      tooMany?: boolean;
    } | null = null;

    if (maxWins > 0) {
      const tied = allOpponents.filter((o) => o.wins === maxWins);
      if (tied.length <= 3) {
        favoritePreyResult = {
          count: maxWins,
          teams: tied.map((o) => ({
            id: o.opponentId,
            name: o.opponent?.name ?? o.opponentId,
            club: o.opponent,
          })),
        };
      } else {
        favoritePreyResult = {
          count: maxWins,
          teams: [],
          tooMany: true,
        };
      }
    }

    return { nemesis: nemesisResult, favoritePrey: favoritePreyResult };
  }, [clubObj, allHistoricalMatches]);

  // Données de la saison en cours pour le tableau d'historique des éditions
  const currentSeasonEntry = useMemo(() => {
    if (!session || !clubObj || archivedClub) return null;
    const currentYear = session.seasonYear ?? parseSeasonYear(session.seed, 2026);
    const isAlreadyArchived = archives.some((a) => a.year === currentYear && a.nationalChampionId);
    if (isAlreadyArchived) return null;

    let matchesWon = 0;
    let goalsScored = 0;
    let goalsConceded = 0;

    for (const m of sessionMatchesForClub) {
      const isHome = m.homeTeamId === clubObj.id;
      const ourScore = isHome ? m.result.homeScore : m.result.awayScore;
      const oppScore = isHome ? m.result.awayScore : m.result.homeScore;
      goalsScored += ourScore;
      goalsConceded += oppScore;
      if (m.result.winnerId === clubObj.id) {
        matchesWon += 1;
      }
    }

    const matchesPlayed = sessionMatchesForClub.length;
    const goalDifference = goalsScored - goalsConceded;
    const isNationalChampion = session.championId === clubObj.id;
    const isConferenceChampion = Boolean(
      session.conferenceChampionIds &&
      Object.values(session.conferenceChampionIds).includes(clubObj.id)
    );

    let stageLabel = `Tour ${session.roundNumber}`;
    if (isNationalChampion) {
      stageLabel = 'Champion de France 🏆';
    } else if (currentStatus?.type === 'QUALIFIED') {
      stageLabel = `Tour ${session.roundNumber + 1} (Qualifié)`;
    } else if (currentStatus?.type === 'BYE') {
      stageLabel = `Tour ${session.roundNumber + 1} (Exempté)`;
    } else if (currentStatus?.type === 'ALIVE') {
      stageLabel = `Tour ${session.roundNumber} (En lice)`;
    } else if (currentStatus?.type === 'ELIMINATED') {
      stageLabel = `Éliminé au Tour ${currentStatus.roundNumber ?? session.roundNumber}`;
    }

    return {
      year: currentYear,
      stageLabel,
      isNationalChampion,
      isConferenceChampion,
      matchesWon,
      matchesPlayed,
      goalsScored,
      goalsConceded,
      goalDifference,
      isFusion: clubObj.isFusion,
      communeNames: clubObj.communeNames,
      partnerNames: clubObj.isFusion && commune ? clubObj.communeNames.filter((n: string) => n !== commune.name) : undefined,
    };
  }, [session, clubObj, archivedClub, archives, sessionMatchesForClub, currentStatus, commune]);

  const clubRoster = useMemo(() => {
    if (!clubObj || !appContext?.persons) return [];
    return getClubRoster(appContext.persons, clubObj.id);
  }, [clubObj, appContext?.persons]);

  const starters = useMemo(() => {
    if (!clubObj || !appContext?.persons) return { attacker: null, defender: null };
    return getClubActiveStarters(appContext.persons, clubObj.id);
  }, [clubObj, appContext?.persons]);

  const loanedOut = useMemo(() => {
    if (!clubObj || !appContext?.persons) return [];
    return getClubLoanedOut(appContext.persons, clubObj.id);
  }, [clubObj, appContext?.persons]);

  const loanedIn = useMemo(() => {
    if (!clubObj || !appContext?.persons) return [];
    return getClubLoanedIn(appContext.persons, clubObj.id);
  }, [clubObj, appContext?.persons]);

  // Titulaires par saison (Attaquant & Défenseur) pour l'historique des éditions
  const startersBySeason = useMemo(() => {
    if (!clubObj) return new Map<number, { attacker: SeasonStarterItem | null; defender: SeasonStarterItem | null }>();
    const map = new Map<number, { attacker: SeasonStarterItem | null; defender: SeasonStarterItem | null }>();

    // 1. Saison active en cours
    if (currentSeasonEntry) {
      const atk = starters.attacker
        ? {
            id: starters.attacker.id,
            firstName: starters.attacker.firstName,
            lastName: starters.attacker.lastName,
            attack: starters.attacker.attack,
            defense: starters.attacker.defense,
            position: 'ATTACKER' as const,
          }
        : null;

      const def = starters.defender
        ? {
            id: starters.defender.id,
            firstName: starters.defender.firstName,
            lastName: starters.defender.lastName,
            attack: starters.defender.attack,
            defense: starters.defender.defense,
            position: 'DEFENDER' as const,
          }
        : null;

      map.set(currentSeasonEntry.year, { attacker: atk, defender: def });
    }

    // 2. Saisons archivées
    const allPersons = appContext?.persons ?? [];
    const validYears = new Set<number>();
    for (const arch of archives) {
      validYears.add(arch.year);
    }
    const record = appContext?.teamRecords?.get(clubObj.id);
    if (teamSeasons.length > 0) {
      for (const s of teamSeasons) {
        validYears.add(s.year);
      }
    } else if (record?.seasons) {
      for (const s of record.seasons) {
        validYears.add(s.year);
      }
    }

    // A later fusion does not transfer former clubs' historical lineups.
    // Loans belong to the club where the player actually played that season.
    const targetClubIds = new Set<string>([clubObj.id]);

    for (const year of validYears) {
      if (map.has(year)) continue;

      const foundStarters: {
        attacker: SeasonStarterItem | null;
        defender: SeasonStarterItem | null;
      } = { attacker: null, defender: null };

      // Recherche dans l'archive de cette année
      const arch = archives.find((a) => a.year === year);
      const archPersons = arch?.persons?.filter((p) =>
        p.primaryRole === 'PLAYER' && !p.isRetired && p.currentClubId ? targetClubIds.has(p.currentClubId) : false
      ) ?? [];

      if (archPersons.length > 0) {
        const atkP =
          archPersons.find((p) => p.assignedPosition === 'ATTACKER') ??
          archPersons.find((p) => p.position === 'ATTACKER');
        const defP =
          archPersons.find((p) => p.assignedPosition === 'DEFENDER' && p.id !== atkP?.id) ??
          archPersons.find((p) => p.position === 'DEFENDER' && p.id !== atkP?.id);

        const remaining = archPersons.filter((p) => p.id !== atkP?.id && p.id !== defP?.id);
        const effectiveAtk =
          atkP ??
          (defP
            ? remaining.sort((a, b) => b.attack - a.attack)[0] ?? null
            : remaining.length === 1 && remaining[0].defense > remaining[0].attack
              ? null
              : remaining.sort((a, b) => b.attack - a.attack)[0] ?? null);

        const effectiveDef =
          defP ??
          remaining
            .filter((p) => p.id !== effectiveAtk?.id)
            .sort((a, b) => b.defense - a.defense)[0] ??
          null;

        if (effectiveAtk) {
          foundStarters.attacker = {
            id: effectiveAtk.id,
            firstName: effectiveAtk.firstName,
            lastName: effectiveAtk.lastName,
            attack: effectiveAtk.attack,
            defense: effectiveAtk.defense,
            position: 'ATTACKER',
          };
        }
        if (effectiveDef) {
          foundStarters.defender = {
            id: effectiveDef.id,
            firstName: effectiveDef.firstName,
            lastName: effectiveDef.lastName,
            attack: effectiveDef.attack,
            defense: effectiveDef.defense,
            position: 'DEFENDER',
          };
        }
      }

      // Si pas trouvé dans archPersons ou incomplet, chercher dans careerHistory de allPersons
      if (!foundStarters.attacker || !foundStarters.defender) {
        const candidates: Array<{ person: Person; season: PersonCareerSeason }> = [];
        for (const p of allPersons) {
          const sEntry = p.careerHistory?.find(
            (cs: PersonCareerSeason) => cs.role === 'PLAYER' && cs.isStarter !== false && cs.year === year && cs.clubId && targetClubIds.has(cs.clubId)
          );
          if (sEntry) {
            candidates.push({ person: p, season: sEntry });
          }
        }

        if (candidates.length > 0) {
          const atkCand =
            candidates.find((c) => c.season.assignedPosition === 'ATTACKER') ??
            candidates.find((c) => c.person.position === 'ATTACKER');
          const defCand =
            candidates.find(
              (c) =>
                (c.season.assignedPosition === 'DEFENDER' || c.person.position === 'DEFENDER') &&
                c.person.id !== atkCand?.person.id,
            );

          const remaining = candidates.filter(
            (c) => c.person.id !== atkCand?.person.id && c.person.id !== defCand?.person.id,
          );
          const effectiveAtkCand =
            atkCand ??
            (defCand
              ? remaining.sort((a, b) => b.season.attack - a.season.attack)[0] ?? null
              : remaining.length === 1 && remaining[0].season.defense > remaining[0].season.attack
                ? null
                : remaining.sort((a, b) => b.season.attack - a.season.attack)[0] ?? null);

          const effectiveDefCand =
            defCand ??
            remaining
              .filter((c) => c.person.id !== effectiveAtkCand?.person.id)
              .sort((a, b) => b.season.defense - a.season.defense)[0] ??
            null;

          if (!foundStarters.attacker && effectiveAtkCand) {
            foundStarters.attacker = {
              id: effectiveAtkCand.person.id,
              firstName: effectiveAtkCand.person.firstName,
              lastName: effectiveAtkCand.person.lastName,
              attack: effectiveAtkCand.season.attack,
              defense: effectiveAtkCand.season.defense,
              position: 'ATTACKER',
            };
          }
          if (!foundStarters.defender && effectiveDefCand) {
            foundStarters.defender = {
              id: effectiveDefCand.person.id,
              firstName: effectiveDefCand.person.firstName,
              lastName: effectiveDefCand.person.lastName,
              attack: effectiveDefCand.season.attack,
              defense: effectiveDefCand.season.defense,
              position: 'DEFENDER',
            };
          }
        }
      }

      map.set(year, foundStarters);
    }

    return map;
  }, [clubObj, currentSeasonEntry, starters, archives, appContext?.persons, appContext?.teamRecords, teamSeasons]);


  if (!data) return <section className="status-panel">Chargement…</section>;
  if (needsDetailedArchives && archivesLoading) return <section className="status-panel">Chargement des parcours…</section>;
  if (needsDetailedArchives && archivesError) return <section className="status-panel" role="alert">Archives indisponibles : {archivesError}</section>;
  if (!commune || !clubObj)
    return (
      <section className="status-panel">
        <h2>Club introuvable</h2>
      </section>
    );
  return (
    <section className="cup-ready">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Link to="/equipes" className="back-link" style={{ color: "var(--color-primary)", fontWeight: 600 }}>
          ← Tous les clubs
        </Link>
        <FavoriteStarButton teamId={clubObj.id} teamName={clubObj.name} size="md" withLabel />
      </div>

      {absorbedByFusion && (
        <div style={{
          marginTop: "var(--space-2)",
          padding: "var(--space-3) var(--space-4)",
          background: "rgba(234, 179, 8, 0.1)",
          border: "1px solid rgba(234, 179, 8, 0.3)",
          borderRadius: "var(--radius-md)",
          fontSize: "0.9rem",
        }}>
          ℹ️ Ce club a fusionné {absorbedByFusion.year ? `en Saison ${absorbedByFusion.year}` : "lors d'une inter-saison"} pour intégrer l'alliance{" "}
          <Link to={`/equipes/${absorbedByFusion.fusion.mergedClubId}`} style={{ fontWeight: 700, color: "var(--color-primary-light)", textDecoration: "underline" }}>
            {absorbedByFusion.fusion.mergedClubName}
          </Link>.
        </div>
      )}
      <div className="club-identity-hero club-profile-hero" style={identityStyle(getClubIdentity(clubObj))}>
        <ClubBadge club={clubObj} size="lg" />
        <div className="club-profile-heading">
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", flexWrap: "wrap" }}>
          {isEditingName ? (
            <form onSubmit={handleSaveName} style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", flexWrap: "wrap" }}>
              <input
                type="text"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                autoFocus
                disabled={isSaving}
                maxLength={80}
                aria-label="Nom du club"
                className="team-name-edit-input"
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    setIsEditingName(false);
                    setNameInput(clubObj.name);
                  }
                }}
              />
              <button
                type="submit"
                disabled={isSaving || !nameInput.trim()}
                className="btn-save-club-name"
              >
                {isSaving ? "Enregistrement…" : "💾 Enregistrer"}
              </button>
              <button
                type="button"
                disabled={isSaving}
                onClick={() => {
                  setIsEditingName(false);
                  setNameInput(clubObj.name);
                }}
                className="btn-cancel-club-name"
              >
                Annuler
              </button>
              <small style={{ color: "var(--color-text-dim)", fontSize: "0.8rem" }}>
                (Entrée pour valider, Échap pour annuler)
              </small>
            </form>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", flexWrap: "wrap" }}>
              <h2
                style={{ margin: 0, cursor: "pointer" }}
                onClick={() => {
                  setNameInput(clubObj.name);
                  setIsEditingName(true);
                  setSaveSuccess(false);
                }}
                title="Cliquer pour modifier le nom du club"
              >
                {clubObj.name}
              </h2>
              <button
                type="button"
                onClick={() => {
                  setNameInput(clubObj.name);
                  setIsEditingName(true);
                  setSaveSuccess(false);
                }}
                className="btn-edit-club-name"
                title="Modifier le nom du club"
                aria-label="Modifier le nom du club"
              >
                ✏️ Modifier le nom
              </button>
              {saveSuccess && (
                <span
                  className="badge badge--emerald"
                  style={{ fontSize: "0.8rem", padding: "3px 8px" }}
                >
                  ✓ Enregistré
                </span>
              )}
            </div>
          )}
          {!clubObj.isFusion && clubObj.name !== commune.name && (
            <span className="badge badge--neutral" style={{ fontSize: "0.85rem", padding: "4px 10px" }}>
              Commune : <CommuneLink commune={commune} />
            </span>
          )}
          {clubObj.isFusion && leadGenuineName && leadGenuineName !== clubObj.name && (
            <span className="badge badge--neutral" style={{ fontSize: "0.85rem", padding: "4px 10px" }}>
              Club d'origine : <strong>{leadGenuineName}</strong>
            </span>
          )}
          {clubObj.isFusion && (
            <div style={{ display: "inline-flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
              <span
                className="badge badge--accent"
                style={{
                  fontSize: "0.85rem",
                  padding: "4px 10px",
                  background: "rgba(56, 189, 248, 0.15)",
                  border: "1px solid rgba(56, 189, 248, 0.3)",
                }}
              >
                🤝 Fusion ({fusionCommunesSorted.length} communes) :
              </span>
              {fusionCommunesSorted.map((item) => (
                <span
                  key={item.id}
                  className="badge badge--neutral"
                  style={{
                    fontSize: "0.82rem",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "5px",
                    padding: "3px 8px",
                    borderColor: item.isHeadquarter ? "var(--color-primary)" : undefined,
                  }}
                  title={item.isHeadquarter ? `Commune siège · ${item.population.toLocaleString("fr-FR")} hab.` : `${item.population.toLocaleString("fr-FR")} hab.`}
                >
                  <span>🏛️</span>
                  {item.commune ? <CommuneLink commune={item.commune} /> : item.name}
                  <span style={{ color: "var(--color-text-dim)", fontSize: "0.75rem" }}>
                    ({item.population.toLocaleString("fr-FR")} hab.)
                  </span>
                  {item.isHeadquarter && (
                    <span style={{ color: "var(--color-primary-light)", fontSize: "0.7rem", fontWeight: 700 }}>
                      (Siège)
                    </span>
                  )}
                </span>
              ))}
            </div>
          )}
          {clubObj.isRivalClub && (
            <span className="badge badge--accent" style={{ fontSize: "0.85rem", padding: "4px 10px", background: "rgba(234, 179, 8, 0.15)", border: "1px solid rgba(234, 179, 8, 0.3)", color: "#facc15" }}>
              ⚡ Club Rival (créé en {clubObj.parentChampionYear ?? 'saison passée'})
            </span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", flexWrap: "wrap" }}>
          <TeamTrophyBadges teamId={clubObj.id} size="md" showLabels />
        </div>
        <div className="club-color-signature" aria-label="Couleurs du club">
          <span className="club-color-chip club-color-chip--primary">{getClubIdentity(clubObj).primaryColor.toUpperCase()}</span>
          <span className="club-color-chip club-color-chip--secondary">{getClubIdentity(clubObj).secondaryColor.toUpperCase()}</span>
        </div>
        </div>
      </div>

      {clubsById.has(clubObj.id) && <ClubIdentityEditor key={clubObj.id} club={clubObj} onSave={handleSaveIdentity} />}

      <div className="summary-strip">
        <span>
          <small>Ville de rattachement</small>
          <strong>
            <CommuneLink commune={commune} />
          </strong>
        </span>
        <span>
          <small>Département</small>
          <strong>{departmentLabel(commune.departmentId)}</strong>
        </span>
        <span>
          <small>Région</small>
          <strong>{regionLabel(commune.regionId)}</strong>
        </span>
        <span>
          <small>{clubObj.isFusion ? 'Population cumulée' : 'Population ville'}</small>
          <strong>{clubObj.population.toLocaleString("fr-FR")} hab.</strong>
        </span>
        <span>
          <small title="Force réelle du club intégrant sa base territoriale et l'apport de ses 2 joueurs titulaires">
            Force Réelle Club
          </small>
          <strong style={{ color: "var(--color-accent-light)" }}>
            {clubObj.strength.toFixed(1)} {clubObj.strength > 30 ? <small style={{ fontSize: "0.75rem", color: "#38bdf8", fontWeight: 600 }} title="Force d'élite dépassant la référence de 30 grâce aux alliances ou à l'effectif">(&gt; 30)</small> : "/ 30"}
          </strong>
          {clubObj.baseStrength !== undefined && Math.abs(clubObj.strength - clubObj.baseStrength) >= 0.05 && (() => {
            const totalDiff = Math.round((clubObj.strength - clubObj.baseStrength) * 10) / 10
            const coachBonus = clubObj.coach ? (clubObj.coach.bonus ?? 0) : 0
            const playersDiff = Math.round((totalDiff - coachBonus) * 10) / 10
            return (
              <span
                style={{
                  fontSize: "0.72rem",
                  color: clubObj.strength >= clubObj.baseStrength ? "#4ade80" : "#f87171",
                  display: "block",
                  marginTop: "1px",
                }}
                title={`Base territoriale : ${clubObj.baseStrength.toFixed(1)} · Joueurs : ${playersDiff >= 0 ? "+" : ""}${playersDiff.toFixed(1)} · Entraîneur : +${coachBonus.toFixed(1)}`}
              >
                Base {clubObj.baseStrength.toFixed(1)} ({totalDiff >= 0 ? "+" : ""}{totalDiff.toFixed(1)} : joueurs {playersDiff >= 0 ? "+" : ""}{playersDiff.toFixed(1)}{clubObj.coach ? `, coach +${coachBonus.toFixed(1)}` : ''})
              </span>
            )
          })()}
        </span>
      </div>

      <section className="coach-panel" aria-label="Entraîneur du club">
        <h2>Entraîneur</h2>
        <CoachBadge coach={clubObj.coach} showBonus />
      </section>

      {clubObj.isRivalClub && (
        <div style={{
          marginTop: "var(--space-3)",
          padding: "var(--space-3) var(--space-4)",
          background: "rgba(234, 179, 8, 0.08)",
          border: "1px solid rgba(234, 179, 8, 0.25)",
          borderRadius: "var(--radius-md)",
        }}>
          <h4 style={{ margin: "0 0 var(--space-1) 0", color: "#eab308", display: "flex", alignItems: "center", gap: "8px" }}>
            <span>⚡</span> Club Rival Historique
          </h4>
          <p style={{ margin: 0, fontSize: "0.9rem", color: "var(--color-text-muted)" }}>
            Club fondé à {commune.name} suite au sacre national de l'édition {clubObj.parentChampionYear ?? "précédente"} pour contester l'hégémonie locale. Force initiale établie à -20% de la force communale.
          </p>
        </div>
      )}

      {/* Navigation par Onglets */}
      <div className="page-tabs-bar" role="tablist" aria-label="Sections du club">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'palmares'}
          className={`page-tab-btn ${activeTab === 'palmares' ? 'is-active' : ''}`}
          onClick={() => handleTabChange('palmares')}
        >
          <span>🏆</span> Palmarès & Historique
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'parcours'}
          className={`page-tab-btn ${activeTab === 'parcours' ? 'is-active' : ''}`}
          onClick={() => handleTabChange('parcours')}
        >
          <span>⚡</span> Parcours en cours
          {matches.length > 0 && <span className="page-tab-badge">{matches.length}</span>}
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'effectif'}
          className={`page-tab-btn ${activeTab === 'effectif' ? 'is-active' : ''}`}
          onClick={() => handleTabChange('effectif')}
        >
          <span>👤</span> Effectif & Personnalités
          <span className="page-tab-badge">{clubRoster.length}</span>
        </button>

        {(clubObj.isFusion || teamFusions.length > 0) && (
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'alliances'}
            className={`page-tab-btn ${activeTab === 'alliances' ? 'is-active' : ''}`}
            onClick={() => handleTabChange('alliances')}
          >
            <span>🤝</span> Alliances & Fusions
            {teamFusions.length > 0 && <span className="page-tab-badge">{teamFusions.length}</span>}
          </button>
        )}

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'all'}
          className={`page-tab-btn ${activeTab === 'all' ? 'is-active' : ''}`}
          onClick={() => handleTabChange('all')}
        >
          <span>📋</span> Tout afficher
        </button>
      </div>

      {/* Onglet 1 ou Tout afficher : PALMARÈS, SAISONS & PARCOURS */}
      {(activeTab === 'palmares' || activeTab === 'all') && (
        <>
          {/* Palmarès, Confrontations & Historique des Éditions */}
          {(() => {
            const record = appContext?.teamRecords?.get(clubObj.id);
            const hasTrophies =
              record &&
              (record.nationalTitles > 0 ||
                record.conferenceTitles > 0 ||
                record.regionTitles > 0 ||
                record.departmentTitles > 0 ||
                record.bestPerformance?.roundNumber > 1);

            const currentYear = session?.seasonYear ?? (session ? parseSeasonYear(session.seed, 2026) : 2026);
            const rawSeasons = teamSeasons.length > 0 ? teamSeasons : (record?.seasons ?? []);
            const archivedSeasons = rawSeasons
              .filter((s) => s.year !== currentYear)
              .sort((a, b) => b.year - a.year);

            const totalEditions = (currentSeasonEntry ? 1 : 0) + archivedSeasons.length;
            if (totalEditions === 0 && !hasTrophies && !biggestWin && !nemesis && !favoritePrey) {
              return null;
            }

            const visibleArchivedSeasons = showAllSeasons
              ? archivedSeasons
              : archivedSeasons.slice(0, currentSeasonEntry ? 2 : 3);

            return (
              <div className="team-palmares-box" style={{ marginTop: "var(--space-3)" }}>
                <div className="team-palmares-header">
                  <h3>
                    <span>🏆</span> Palmarès & Historique du Club
                  </h3>
                  <span className="team-palmares-status">
                    {totalEditions} {totalEditions > 1 ? "éditions disputées" : "édition disputée"}
                  </span>
                </div>

                {/* Cabinet des Trophées (si des trophées existent) */}
                {hasTrophies && (
                  <div className="team-trophies-grid">
                    <div className={`trophy-kpi-card ${record.nationalTitles > 0 ? "trophy-kpi-card--gold" : ""}`}>
                      <div className="trophy-kpi-icon">🏆</div>
                      <div className="trophy-kpi-content">
                        <span className="trophy-kpi-label">Champion de France</span>
                        <div className="trophy-kpi-value-row">
                          <strong className="trophy-kpi-count">{record.nationalTitles}</strong>
                          <span className="trophy-kpi-unit">{record.nationalTitles > 1 ? "titres" : "titre"}</span>
                        </div>
                        {record.nationalTitleYears.length > 0 && (
                          <span className="trophy-kpi-years">Édition{record.nationalTitles > 1 ? "s" : ""} : {record.nationalTitleYears.join(", ")}</span>
                        )}
                      </div>
                    </div>

                    <div className={`trophy-kpi-card ${record.conferenceTitles > 0 ? "trophy-kpi-card--conf" : ""}`}>
                      <div className="trophy-kpi-icon">👑</div>
                      <div className="trophy-kpi-content">
                        <span className="trophy-kpi-label">Champion de Conférence</span>
                        <div className="trophy-kpi-value-row">
                          <strong className="trophy-kpi-count">{record.conferenceTitles}</strong>
                          <span className="trophy-kpi-unit">{record.conferenceTitles > 1 ? "titres" : "titre"}</span>
                        </div>
                        {record.conferenceTitleDetails.length > 0 && (
                          <span className="trophy-kpi-years">
                            {record.conferenceTitleDetails.map((d) => `${d.year}`).join(", ")}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className={`trophy-kpi-card ${record.regionTitles > 0 ? "trophy-kpi-card--region" : ""}`}>
                      <div className="trophy-kpi-icon">🌟</div>
                      <div className="trophy-kpi-content">
                        <span className="trophy-kpi-label">Champion Régional</span>
                        <div className="trophy-kpi-value-row">
                          <strong className="trophy-kpi-count">{record.regionTitles}</strong>
                          <span className="trophy-kpi-unit">{record.regionTitles > 1 ? "titres" : "titre"}</span>
                        </div>
                        {record.regionTitleDetails.length > 0 && (
                          <span className="trophy-kpi-years">
                            {record.regionTitleDetails.map((d) => `${d.year}`).join(", ")}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className={`trophy-kpi-card ${record.departmentTitles > 0 ? "trophy-kpi-card--dept" : ""}`}>
                      <div className="trophy-kpi-icon">🏅</div>
                      <div className="trophy-kpi-content">
                        <span className="trophy-kpi-label">Champion Départemental</span>
                        <div className="trophy-kpi-value-row">
                          <strong className="trophy-kpi-count">{record.departmentTitles}</strong>
                          <span className="trophy-kpi-unit">{record.departmentTitles > 1 ? "titres" : "titre"}</span>
                        </div>
                        {record.departmentTitleDetails.length > 0 && (
                          <span className="trophy-kpi-years">
                            {record.departmentTitleDetails.map((d) => `${d.year}`).join(", ")}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="trophy-kpi-card trophy-kpi-card--stage">
                      <div className="trophy-kpi-icon">⭐</div>
                      <div className="trophy-kpi-content">
                        <span className="trophy-kpi-label">Meilleure Performance</span>
                        <div className="trophy-kpi-value-row">
                          <span className={getStageBadgeClass(record.bestPerformance.stageLabel, record.bestPerformance.roundNumber)} style={{ fontSize: "0.95rem" }}>
                            {record.bestPerformance.stageLabel}
                          </span>
                        </div>
                        <span className="trophy-kpi-years">Édition {record.bestPerformance.year}</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Statistiques de Confrontation & Records */}
                <div className="confrontation-kpi-grid">
                  {/* Plus grosse équipe battue */}
                  <div className="confrontation-card confrontation-card--exploit">
                    <div className="confrontation-icon">⚡</div>
                    <div className="confrontation-content">
                      <span className="confrontation-label">Plus Grosse Équipe Battue</span>
                      {biggestWin ? (
                        <>
                          <div className="confrontation-target">
                            <Link to={`/equipes/${biggestWin.opponentId}`} className="confrontation-club-link" title={biggestWin.opponent?.name}>
                              {biggestWin.opponent?.name ?? biggestWin.opponentId}
                            </Link>
                            <span className="badge badge--gold" style={{ fontSize: "0.75rem", padding: "1px 6px" }}>
                              Force {biggestWin.opponentStrength.toFixed(1)}/30
                            </span>
                            {biggestWin.diffStrength > 0 && (
                              <span className="badge badge--emerald" style={{ fontSize: "0.72rem", padding: "1px 5px" }} title="Exploit face à un club supérieur">
                                +{biggestWin.diffStrength.toFixed(1)}
                              </span>
                            )}
                          </div>
                          <div className="confrontation-meta">
                            <span>Saison {biggestWin.seasonYear} · <span className={getRoundBadgeClass(biggestWin.roundNumber)}>Tour {biggestWin.roundNumber} ({getRoundPhaseText(biggestWin.roundNumber)})</span></span>
                            <Link to={`/matchs/${encodeURIComponent(biggestWin.matchId)}`} className="confrontation-match-link" title="Voir la feuille de match">
                              Score : <strong>{biggestWin.scoreDisplay}</strong> →
                            </Link>
                          </div>
                        </>
                      ) : (
                        <div className="confrontation-empty">
                          Aucune victoire enregistrée
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Bête Noire */}
                  <div className="confrontation-card confrontation-card--nemesis">
                    <div className="confrontation-icon">👹</div>
                    <div className="confrontation-content">
                      <span className="confrontation-label">Bête Noire</span>
                      {nemesis && !nemesis.tooMany ? (
                        <>
                          <div className="confrontation-target">
                            {nemesis.teams.map((t, idx) => (
                              <span key={t.id}>
                                {idx > 0 && ', '}
                                <Link to={`/equipes/${t.id}`} className="confrontation-club-link" title={t.name}>
                                  {t.name}
                                </Link>
                              </span>
                            ))}
                          </div>
                          <div className="confrontation-meta">
                            <span className="badge badge--rose" style={{ fontSize: "0.75rem", padding: "1px 6px" }}>
                              {nemesis.count} {nemesis.count > 1 ? "défaites subies" : "défaite subie"}
                            </span>
                          </div>
                        </>
                      ) : nemesis?.tooMany ? (
                        <div className="confrontation-empty">
                          Aucune ({nemesis.count} défaites contre plus de 3 clubs)
                        </div>
                      ) : (
                        <div className="confrontation-empty">
                          Aucune défaite subie
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Proie Favorite */}
                  <div className="confrontation-card confrontation-card--prey">
                    <div className="confrontation-icon">🎯</div>
                    <div className="confrontation-content">
                      <span className="confrontation-label">Proie Favorite</span>
                      {favoritePrey && !favoritePrey.tooMany ? (
                        <>
                          <div className="confrontation-target">
                            {favoritePrey.teams.map((t, idx) => (
                              <span key={t.id}>
                                {idx > 0 && ', '}
                                <Link to={`/equipes/${t.id}`} className="confrontation-club-link" title={t.name}>
                                  {t.name}
                                </Link>
                              </span>
                            ))}
                          </div>
                          <div className="confrontation-meta">
                            <span className="badge badge--emerald" style={{ fontSize: "0.75rem", padding: "1px 6px" }}>
                              {favoritePrey.count} {favoritePrey.count > 1 ? "victoires remportées" : "victoire remportée"}
                            </span>
                          </div>
                        </>
                      ) : favoritePrey?.tooMany ? (
                        <div className="confrontation-empty">
                          Aucune ({favoritePrey.count} victoires contre plus de 3 clubs)
                        </div>
                      ) : (
                        <div className="confrontation-empty">
                          Aucune victoire enregistrée
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Multi-Season Track Record Table */}
                {totalEditions > 0 && (
                  <div style={{ marginTop: "var(--space-4)" }}>
                    <h4 style={{ color: "var(--color-text-muted)", fontSize: "0.85rem", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "var(--space-2)" }}>
                      Historique des Éditions (Classement Récent en Premier)
                    </h4>
                    <div className="matches-table-wrap">
                      <table className="matches-table">
                        <thead>
                          <tr>
                            <th>Saison</th>
                            <th>Parcours atteint</th>
                            <th>Titulaires</th>
                            <th>Entraîneur</th>
                            <th>Titres remportés</th>
                            <th>Alliance / Fusion</th>
                            <th>Bilan</th>
                            <th>Issue</th>
                          </tr>
                        </thead>
                        <tbody>
                          {/* Ligne 1 : Saison en cours */}
                          {currentSeasonEntry && (
                            <tr key="current-season" className="season-row--current">
                              <td>
                                <span className="season-current-badge">
                                  <span className="season-pulse-dot" aria-hidden="true" />
                                  Saison {currentSeasonEntry.year} (En cours)
                                </span>
                              </td>
                              <td>
                                <span className={getStageBadgeClass(currentSeasonEntry.stageLabel)}>
                                  {currentSeasonEntry.stageLabel}
                                </span>
                              </td>
                              <td>
                                <SeasonStartersCell starters={startersBySeason.get(currentSeasonEntry.year)} />
                              </td>
                              <td><CoachBadge coach={clubObj.coach} /></td>
                              <td>
                                <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", alignItems: "center" }}>
                                  {currentSeasonEntry.isNationalChampion && (
                                    <span className="trophy-pill trophy-pill--national" title="Champion de France">
                                      🏆 France
                                    </span>
                                  )}
                                  {currentSeasonEntry.isConferenceChampion && (
                                    <span className="trophy-pill trophy-pill--conference" title="Champion de Conférence">
                                      👑 Conférence
                                    </span>
                                  )}
                                  {!currentSeasonEntry.isNationalChampion && !currentSeasonEntry.isConferenceChampion && (
                                    <span style={{ color: "var(--color-text-dim)", fontSize: "0.82rem" }}>—</span>
                                  )}
                                </div>
                              </td>
                              <td>
                                {currentSeasonEntry.isFusion ? (
                                  <div>
                                    <span className="badge badge--accent" style={{ background: "rgba(56, 189, 248, 0.15)", color: "#38bdf8", fontSize: "0.78rem" }}>
                                      🤝 Alliance ({currentSeasonEntry.communeNames?.length ?? 2} communes)
                                    </span>
                                    {currentSeasonEntry.partnerNames && currentSeasonEntry.partnerNames.length > 0 && (
                                      <div style={{ fontSize: "0.78rem", color: "var(--color-text-dim)", marginTop: "3px" }}>
                                        avec{" "}
                                        {currentSeasonEntry.partnerNames.map((pName: string, pIdx: number) => {
                                          const pCommune = data?.communes.find((cm) => cm.name === pName);
                                          const pClubName = resolvePartnerClubName(pName, { leadClubId: clubObj.id, dataset: data, session, archives });
                                          return (
                                            <span key={pIdx}>
                                              {pIdx > 0 && ", "}
                                              {pCommune ? <CommuneLink commune={pCommune} /> : <strong>{pName}</strong>}
                                              {" "}
                                              <span style={{ color: "#93c5fd" }}>({pClubName})</span>
                                            </span>
                                          );
                                        })}
                                      </div>
                                    )}
                                  </div>
                                ) : (
                                  <span className="badge badge--neutral" style={{ fontSize: "0.75rem" }}>
                                    Autonome
                                  </span>
                                )}
                              </td>
                              <td>
                                <span>{currentSeasonEntry.matchesWon} vic. / {currentSeasonEntry.matchesPlayed} m.</span>
                                {currentSeasonEntry.matchesPlayed > 0 && (
                                  <small style={{ display: "block", color: "var(--color-text-muted)", fontSize: "0.75rem" }}>
                                    Diff: {currentSeasonEntry.goalDifference > 0 ? `+${currentSeasonEntry.goalDifference}` : currentSeasonEntry.goalDifference} ({currentSeasonEntry.goalsScored} BP, {currentSeasonEntry.goalsConceded} BC)
                                  </small>
                                )}
                              </td>
                              <td>
                                {currentStatus?.type === "CHAMPION" ? (
                                  <span style={{ color: "var(--color-gold-light)", fontWeight: 800 }}>🏆 Sacre National</span>
                                ) : currentStatus?.type === "QUALIFIED" ? (
                                  <span className="badge badge--emerald" style={{ fontSize: "0.8rem", padding: "2px 7px" }}>
                                    🟢 Qualifié Tour {session?.roundNumber ? session.roundNumber + 1 : ""}
                                  </span>
                                ) : currentStatus?.type === "ALIVE" ? (
                                  <span className="badge badge--emerald" style={{ fontSize: "0.8rem", padding: "2px 7px" }}>
                                    🟢 En lice · Tour {session?.roundNumber}
                                  </span>
                                ) : currentStatus?.type === "BYE" ? (
                                  <span className="badge badge--gold" style={{ fontSize: "0.8rem", padding: "2px 7px" }}>
                                    ⭐ Exempté ce tour
                                  </span>
                                ) : currentStatus?.type === "ELIMINATED" ? (
                                  <span style={{ color: "var(--color-text-muted)", fontSize: "0.88rem" }}>
                                    {currentStatus.opponent ? (
                                      <>Éliminé par <TeamLink team={currentStatus.opponent} inline /></>
                                    ) : (
                                      `Éliminé au Tour ${currentStatus.roundNumber ?? session?.roundNumber}`
                                    )}
                                  </span>
                                ) : (
                                  <span style={{ color: "var(--color-text-dim)" }}>—</span>
                                )}
                              </td>
                            </tr>
                          )}

                          {/* Lignes 2+ : Saisons passées par ordre antichronologique */}
                          {visibleArchivedSeasons.map((s) => (
                            <tr key={s.year}>
                              <td>
                                <span className="badge badge--blue">Saison {s.year}</span>
                              </td>
                              <td>
                                <span className={getStageBadgeClass(s.stageLabel, s.roundReached)}>
                                  {s.stageLabel}
                                </span>
                              </td>
                              <td>
                                <SeasonStartersCell starters={startersBySeason.get(s.year)} />
                              </td>
                              <td><CoachBadge coach={s.coach ?? archives.find(a => a.year === s.year)?.teamPerformances?.[clubObj.id]?.coach} /></td>
                              <td>
                                <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", alignItems: "center" }}>
                                  {s.isNationalChampion && (
                                    <span className="trophy-pill trophy-pill--national" title="Champion de France">
                                      🏆 France
                                    </span>
                                  )}
                                  {s.isConferenceChampion && (
                                    <span className="trophy-pill trophy-pill--conference" title="Champion de Conférence">
                                      👑 Conférence
                                    </span>
                                  )}
                                  {s.isRegionChampion && (
                                    <span className="trophy-pill trophy-pill--region" title="Champion Régional">
                                      🌟 Région
                                    </span>
                                  )}
                                  {s.isDepartmentChampion && (
                                    <span className="trophy-pill trophy-pill--dept" title="Champion Départemental">
                                      🏅 Département
                                    </span>
                                  )}
                                  {!s.isNationalChampion && !s.isConferenceChampion && !s.isRegionChampion && !s.isDepartmentChampion && (
                                    <span style={{ color: "var(--color-text-dim)", fontSize: "0.82rem" }}>—</span>
                                  )}
                                </div>
                              </td>
                              <td>
                                {s.isFusion ? (
                                  <div>
                                    <span className="badge badge--accent" style={{ background: "rgba(56, 189, 248, 0.15)", color: "#38bdf8", fontSize: "0.78rem" }}>
                                      🤝 Alliance ({s.fusionCount ?? (s.communeNames?.length ?? 2)} communes)
                                    </span>
                                    {s.fusionPartnerNames && s.fusionPartnerNames.length > 0 && (
                                      <div style={{ fontSize: "0.78rem", color: "var(--color-text-dim)", marginTop: "3px" }}>
                                        avec{" "}
                                        {s.fusionPartnerNames.map((pName, pIdx) => {
                                          const pCommune = data.communes.find((cm) => cm.name === pName);
                                          const pClubName = resolvePartnerClubName(pName, { leadClubId: clubObj.id, dataset: data, session, archives });
                                          return (
                                            <span key={pIdx}>
                                              {pIdx > 0 && ", "}
                                              {pCommune ? <CommuneLink commune={pCommune} /> : <strong>{pName}</strong>}
                                              {" "}
                                              <span style={{ color: "#93c5fd" }}>({pClubName})</span>
                                            </span>
                                          );
                                        })}
                                      </div>
                                    )}
                                  </div>
                                ) : (
                                  <span className="badge badge--neutral" style={{ fontSize: "0.75rem" }}>
                                    Autonome
                                  </span>
                                )}
                              </td>
                              <td>
                                <span>{s.matchesWon} vic. / {s.matchesPlayed} m.</span>
                                {s.goalDifference !== undefined && (
                                  <small style={{ display: "block", color: "var(--color-text-muted)", fontSize: "0.75rem" }}>
                                    Diff: {s.goalDifference > 0 ? `+${s.goalDifference}` : s.goalDifference} ({s.goalsScored} BP, {s.goalsConceded} BC)
                                  </small>
                                )}
                              </td>
                              <td style={{ color: "var(--color-text-muted)", fontSize: "0.88rem" }}>
                                {s.isNationalChampion ? (
                                  <span style={{ color: "var(--color-gold-light)", fontWeight: 800 }}>🏆 Sacre National</span>
                                ) : s.eliminatedByTeamId ? (
                                  (() => {
                                    const eliminator =
                                      clubsById.get(s.eliminatedByTeamId) ??
                                      (() => {
                                        const c = data.communes.find((cm) => cm.id === (s.eliminatedByTeamId ? s.eliminatedByTeamId.split('-')[0] : ''));
                                        return c ? createClubFromCommune(c, bounds) : undefined;
                                      })();
                                    return eliminator ? (
                                      <>Éliminé par <TeamLink team={eliminator} inline /></>
                                    ) : (
                                      <>Éliminé par <Link to={`/equipes/${s.eliminatedByTeamId}`}>{s.eliminatedByTeamId}</Link></>
                                    );
                                  })()
                                ) : (
                                  "—"
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {totalEditions > 3 && (
                      <button type="button" className="palmares-history-toggle" onClick={() => setShowAllSeasons((value) => !value)}>
                        {showAllSeasons ? "Réduire l’historique" : `Voir les ${totalEditions - 3} autres éditions`}
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })()}
        </>
      )}

      {/* Onglet 2 ou Tout afficher : PARCOURS EN COURS (ÉDITION ACTIVE) */}
      {(activeTab === 'parcours' || activeTab === 'all') && (
        <div style={{ marginTop: activeTab === 'all' ? 'var(--space-5)' : 'var(--space-3)', display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "8px" }}>
            <div>
              <h3 style={{ margin: 0, display: "flex", alignItems: "center", gap: "8px", fontSize: "1.2rem", color: "#ffffff" }}>
                <span>⚡</span> Parcours dans l'édition en cours {session ? `(Saison ${session.seasonYear ?? 2026})` : ""}
              </h3>
              <p style={{ margin: "4px 0 0 0", fontSize: "0.88rem", color: "var(--color-text-muted)" }}>
                Situation actuelle, tirage et historique des confrontations pour cette édition de la Coupe.
              </p>
            </div>
          </div>

          {/* Situation en direct dans la Coupe */}
          {currentStatus && (
            <div className={`team-live-status-card ${currentStatus.cardClass}`} style={{ margin: 0 }}>
              <div className="team-live-status-header">
                <span className={`badge ${currentStatus.badgeClass}`}>
                  {currentStatus.badgeText}
                </span>
                <span className="team-live-status-season">
                  Édition {session?.seasonYear ?? 2026}
                </span>
              </div>

              <div className="team-live-status-body">
                {currentStatus.type === "ALIVE" && (
                  <div className="team-live-matchup">
                    <div className="team-matchup-meta">
                      <h4>⚡ Prochain match programmé</h4>
                      <p>
                        {currentStatus.isHome ? "🏠 À domicile" : "✈️ À l'extérieur"} face à{" "}
                        <strong>{currentStatus.opponent ? <TeamLink team={currentStatus.opponent} inline /> : currentStatus.opponentId}</strong>
                      </p>
                      {currentStatus.opponent && (
                        <div className="team-matchup-stats">
                          <span>Force adverse : <strong>{currentStatus.opponent.strength.toFixed(1)}/30</strong></span>
                          <span className="team-matchup-stat-diff">
                            ({currentStatus.diffStrength > 0 ? `+${currentStatus.diffStrength.toFixed(1)} force` : currentStatus.diffStrength < 0 ? `${currentStatus.diffStrength.toFixed(1)} force` : "force égale"})
                          </span>
                          <span>· {currentStatus.opponent.population.toLocaleString("fr-FR")} hab.</span>
                          <span>· Dép. {departmentLabel(currentStatus.opponent.departmentId)}</span>
                        </div>
                      )}
                    </div>
                    <div className="team-matchup-action">
                      <Link
                        to={`/matchs/${encodeURIComponent(currentStatus.matchId)}`}
                        className="btn-match-direct"
                      >
                        ⚡ Jouer / Voir le direct du match →
                      </Link>
                    </div>
                  </div>
                )}

                {currentStatus.type === "QUALIFIED" && (
                  <div className="team-live-qualified">
                    <div>
                      <h4>{currentStatus.title}</h4>
                      <p>{currentStatus.description}</p>
                    </div>
                    {currentStatus.matchId && (
                      <Link
                        to={`/matchs/${encodeURIComponent(currentStatus.matchId)}`}
                        className="btn-match-summary"
                      >
                        Voir la feuille de match →
                      </Link>
                    )}
                  </div>
                )}

                {currentStatus.type === "ELIMINATED" && (
                  <div className="team-live-eliminated">
                    <div>
                      <h4>{currentStatus.title}</h4>
                      <p>
                        {currentStatus.description}
                        {currentStatus.opponent && (
                          <> (Éliminateur : <TeamLink team={currentStatus.opponent} inline />)</>
                        )}
                      </p>
                    </div>
                    {currentStatus.matchId && (
                      <Link
                        to={`/matchs/${encodeURIComponent(currentStatus.matchId)}`}
                        className="btn-match-replay"
                      >
                        Revoir le match →
                      </Link>
                    )}
                  </div>
                )}

                {currentStatus.type === "BYE" && (
                  <div className="team-live-bye">
                    <h4>{currentStatus.title}</h4>
                    <p>{currentStatus.description}</p>
                  </div>
                )}

                {currentStatus.type === "CHAMPION" && (
                  <div className="team-live-champion">
                    <h4>{currentStatus.title}</h4>
                    <p>{currentStatus.description}</p>
                  </div>
                )}

                {currentStatus.type === "FINISHED" && (
                  <div className="team-live-finished">
                    <h4>{currentStatus.title}</h4>
                    <p>{currentStatus.description}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Feuilles de matchs disputés ou programmés */}
          <div>
            <h4 style={{ color: "var(--color-text-muted)", fontSize: "0.85rem", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "var(--space-2)" }}>
              Feuilles de matchs joués ou programmés
            </h4>
            {matches.length ? (
              <div className="matches-table-wrap">
                <table className="matches-table">
                  <thead>
                    <tr>
                      <th>Tour</th>
                      <th>Adversaire</th>
                      <th>Score</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {matches.map(({ round, match, result }) => {
                      const opponentId =
                        match.homeTeamId === clubObj.id
                          ? match.awayTeamId
                          : match.homeTeamId;
                      const opponent =
                        clubsById.get(opponentId) ??
                        (() => {
                          const c = data?.communes.find((cm) => cm.id === (opponentId ? opponentId.split('-')[0] : ''));
                          return c ? createClubFromCommune(c, bounds) : undefined;
                        })();
                      return (
                        <tr key={match.id}>
                          <td>
                            <span className={getRoundBadgeClass(round.number)}>
                              Tour {round.number} ({phaseLabel(round.phase)})
                            </span>
                          </td>
                          <td>
                            {opponent ? (
                              <TeamLink team={opponent} inline />
                            ) : (
                              <Link to={`/equipes/${opponentId}`}>{opponentId}</Link>
                            )}
                          </td>
                          <td className="score-cell">
                            {result
                              ? `${result.homeScore} – ${result.awayScore}${result.isExtraTime ? " (a.p.)" : ""}`
                              : "À jouer"}
                          </td>
                          <td>
                            <Link to={`/matchs/${encodeURIComponent(match.id)}`} style={{ fontWeight: 700 }}>
                              Voir le match
                            </Link>
                            {result && opponent && isMatchUpset(
                              match.homeTeamId === clubObj.id ? clubObj : opponent,
                              match.awayTeamId === clubObj.id ? clubObj : opponent,
                              result
                            ) && (
                              <span className="match-upset-badge" style={{ marginLeft: "8px" }} title="Exploit face à un club supérieur">
                                ⚡ Exploit !
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <p style={{ color: "var(--color-text-muted)" }}>
                {session && clubObj && session.round.byeTeamIds.includes(clubObj.id)
                  ? `Exempté du tour ${session.roundNumber} : qualifié pour le tour ${session.roundNumber + 1} sans jouer.`
                  : session && clubObj && session.activeTeamIds.includes(clubObj.id)
                    ? `En lice pour le tour ${session.roundNumber} : aucun match programmé pour ce club.`
                    : 'Aucun match dans cette édition.'}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Onglet Effectif & Personnalités */}
      {(activeTab === 'effectif' || activeTab === 'all') && (
        <div style={{ marginTop: activeTab === 'all' ? 'var(--space-5)' : 'var(--space-3)', display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "8px" }}>
            <div>
              <h3 style={{ margin: 0, display: "flex", alignItems: "center", gap: "8px", fontSize: "1.2rem", color: "#ffffff" }}>
                <span>👤</span> Effectif de la Saison ({clubRoster.length}/2 titulaires)
              </h3>
              <p style={{ margin: "4px 0 0 0", fontSize: "0.88rem", color: "var(--color-text-muted)" }}>
                Chaque club aligne 1 attaquant et 1 défenseur titulaire. Les joueurs excédentaires sont prêtés pour la saison aux clubs ayant des postes vacants.
                {loanedIn.length > 0 && ` (${loanedIn.length} joueur${loanedIn.length > 1 ? "s" : ""} accueilli${loanedIn.length > 1 ? "s" : ""} en prêt)`}
              </p>
            </div>
            <Link to="/personnes" style={{ fontSize: "0.85rem", color: "var(--color-primary-light)", textDecoration: "none", fontWeight: 600 }}>
              Voir l'annuaire complet →
            </Link>
          </div>

          {/* Grille des 2 Titulaires : Attaquant & Défenseur */}
          <div className="team-starters-grid">
            {/* Slot Attaquant */}
            <div className={`team-starter-card ${starters.attacker ? 'team-starter-card--attacker' : 'team-starter-card--empty'}`}>
              <div className="team-starter-badge-role">
                <span>⚡</span> Attaquant Titulaire
              </div>
              {starters.attacker ? (
                <div className="team-starter-content">
                  <div className="team-starter-avatar-wrap">
                    <div className="team-starter-avatar team-starter-avatar--attacker">
                      {starters.attacker.firstName.charAt(0)}{starters.attacker.lastName.charAt(0)}
                    </div>
                  </div>
                  <div className="team-starter-info">
                    <Link to={`/personnes/${starters.attacker.id}`} className="team-starter-name">
                      {starters.attacker.firstName} {starters.attacker.lastName}
                    </Link>
                    <div className="team-starter-meta">
                      <span>Âge : {starters.attacker.age} ans</span>
                      {starters.attacker.loanedFromClubId && starters.attacker.loanedFromClubId !== clubObj.id ? (
                        <span className="badge badge--accent" style={{ fontSize: "0.72rem", padding: "1px 6px" }}>
                          🤝 En prêt ({appContext?.clubsById.get(starters.attacker.loanedFromClubId)?.name ?? starters.attacker.loanedFromClubId})
                        </span>
                      ) : (
                        <span className="badge badge--neutral" style={{ fontSize: "0.72rem", padding: "1px 6px" }}>
                          🏠 Club formateur
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="team-starter-stats">
                    <div className="team-starter-stat-box team-starter-stat-box--primary">
                      <span className="team-starter-stat-label">ATQ</span>
                      <strong className="team-starter-stat-val">{starters.attacker.attack}</strong>
                    </div>
                    <div className="team-starter-stat-box">
                      <span className="team-starter-stat-label">DEF</span>
                      <strong className="team-starter-stat-val">{starters.attacker.defense}</strong>
                    </div>
                    <div className="team-starter-stat-box team-starter-stat-box--overall">
                      <span className="team-starter-stat-label">GÉN</span>
                      <strong className="team-starter-stat-val">{computeOverallRating(starters.attacker)}</strong>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="team-starter-empty-state">
                  <span className="team-starter-empty-icon">⚪</span>
                  <p>Aucun attaquant assigné cette saison</p>
                </div>
              )}
            </div>

            {/* Slot Défenseur */}
            <div className={`team-starter-card ${starters.defender ? 'team-starter-card--defender' : 'team-starter-card--empty'}`}>
              <div className="team-starter-badge-role">
                <span>🛡️</span> Défenseur Titulaire
              </div>
              {starters.defender ? (
                <div className="team-starter-content">
                  <div className="team-starter-avatar-wrap">
                    <div className="team-starter-avatar team-starter-avatar--defender">
                      {starters.defender.firstName.charAt(0)}{starters.defender.lastName.charAt(0)}
                    </div>
                  </div>
                  <div className="team-starter-info">
                    <Link to={`/personnes/${starters.defender.id}`} className="team-starter-name">
                      {starters.defender.firstName} {starters.defender.lastName}
                    </Link>
                    <div className="team-starter-meta">
                      <span>Âge : {starters.defender.age} ans</span>
                      {starters.defender.loanedFromClubId && starters.defender.loanedFromClubId !== clubObj.id ? (
                        <span className="badge badge--accent" style={{ fontSize: "0.72rem", padding: "1px 6px" }}>
                          🤝 En prêt ({appContext?.clubsById.get(starters.defender.loanedFromClubId)?.name ?? starters.defender.loanedFromClubId})
                        </span>
                      ) : (
                        <span className="badge badge--neutral" style={{ fontSize: "0.72rem", padding: "1px 6px" }}>
                          🏠 Club formateur
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="team-starter-stats">
                    <div className="team-starter-stat-box team-starter-stat-box--primary">
                      <span className="team-starter-stat-label">DEF</span>
                      <strong className="team-starter-stat-val">{starters.defender.defense}</strong>
                    </div>
                    <div className="team-starter-stat-box">
                      <span className="team-starter-stat-label">ATQ</span>
                      <strong className="team-starter-stat-val">{starters.defender.attack}</strong>
                    </div>
                    <div className="team-starter-stat-box team-starter-stat-box--overall">
                      <span className="team-starter-stat-label">GÉN</span>
                      <strong className="team-starter-stat-val">{computeOverallRating(starters.defender)}</strong>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="team-starter-empty-state">
                  <span className="team-starter-empty-icon">⚪</span>
                  <p>Aucun défenseur assigné cette saison</p>
                </div>
              )}
            </div>
          </div>

          {/* Tableau de l'effectif actuel */}
          <div>
            <h4 style={{ color: "var(--color-text-muted)", fontSize: "0.85rem", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "var(--space-2)" }}>
              Détail des joueurs alignés pour la saison
            </h4>
            <PersonTable
              persons={clubRoster}
              archives={archives}
              showClub={false}
              showCommune={true}
              emptyMessage="Aucun joueur n'est actuellement rattaché à ce club dans le vivier actif."
            />
          </div>

          {/* Section: Joueurs prêtés à d'autres clubs */}
          {loanedOut.length > 0 && (
            <div style={{
              padding: "var(--space-4)",
              background: "rgba(56, 189, 248, 0.05)",
              border: "1px solid rgba(56, 189, 248, 0.2)",
              borderRadius: "var(--radius-md)",
            }}>
              <h4 style={{ margin: "0 0 6px 0", color: "var(--color-primary-light)", display: "flex", alignItems: "center", gap: "8px", fontSize: "1rem" }}>
                <span>🤝</span> Joueurs sous contrat prêtés cette saison ({loanedOut.length})
              </h4>
              <p style={{ margin: "0 0 var(--space-3) 0", fontSize: "0.88rem", color: "var(--color-text-muted)" }}>
                Ces joueurs formés ou sous contrat avec {clubObj.name} ont été prêtés pour cette saison afin de gagner du temps de jeu dans un club ayant un poste vacant. Ils réintégreront le club au terme de l'exercice.
              </p>
              <PersonTable
                persons={loanedOut}
                archives={archives}
                showClub={true}
                showCommune={false}
              />
            </div>
          )}
        </div>
      )}

      {/* Onglet 3 ou Tout afficher : ALLIANCES & FUSIONS */}
      {(clubObj.isFusion || teamFusions.length > 0) && (activeTab === 'alliances' || activeTab === 'all') && (
        <div style={{
          marginTop: activeTab === 'all' ? "var(--space-5)" : "var(--space-3)",
          padding: "var(--space-4)",
          background: "rgba(56, 189, 248, 0.08)",
          border: "1px solid rgba(56, 189, 248, 0.25)",
          borderRadius: "var(--radius-md)",
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-3)",
        }}>
          <div>
            <h4 style={{ margin: "0 0 6px 0", color: "var(--color-primary-light)", display: "flex", alignItems: "center", gap: "8px" }}>
              <span>🤝</span> Alliance Intercommunale ({clubObj.communeNames.length} communes réunies)
            </h4>
            <p style={{ margin: 0, fontSize: "0.9rem", color: "var(--color-text-muted)" }}>
              Ce club réunit plusieurs communes et clubs partenaires afin d'unir leurs forces et bassins de population.
            </p>
          </div>

          {/* Section: Clubs fusionnés - Tableau reprenant l'historique des fusions */}
          {teamFusions.length > 0 && (
            <div style={{ marginTop: "var(--space-1)" }}>
              <div style={{ fontSize: "0.9rem", fontWeight: 700, color: "var(--color-primary-light)", marginBottom: "8px", display: "flex", alignItems: "center", gap: "6px" }}>
                <span>⚽</span> Clubs ayant fusionné avec cette équipe ({teamFusions.length}) :
              </div>
              <div className="matches-table-wrap">
                <table className="matches-table">
                  <thead>
                    <tr>
                      <th
                        style={{ width: "16%", cursor: "pointer", userSelect: "none" }}
                        onClick={() => handleFusionSort('year')}
                        title="Trier par saison (date la plus récente ou plus ancienne)"
                        aria-sort={fusionSortKey === 'year' ? (fusionSortDir === 'desc' ? 'descending' : 'ascending') : 'none'}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                          <span>Saison</span>
                          <span style={{ fontSize: "0.75rem", opacity: fusionSortKey === 'year' ? 1 : 0.4 }}>
                            {fusionSortKey === 'year' ? (fusionSortDir === 'desc' ? ' ▼' : ' ▲') : ' ↕'}
                          </span>
                        </div>
                      </th>
                      <th
                        style={{ width: "32%", cursor: "pointer", userSelect: "none" }}
                        onClick={() => handleFusionSort('name')}
                        title="Trier par nom de club"
                        aria-sort={fusionSortKey === 'name' ? (fusionSortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                          <span>Club absorbé / fusionné</span>
                          <span style={{ fontSize: "0.75rem", opacity: fusionSortKey === 'name' ? 1 : 0.4 }}>
                            {fusionSortKey === 'name' ? (fusionSortDir === 'asc' ? ' ▲' : ' ▼') : ' ↕'}
                          </span>
                        </div>
                      </th>
                      <th style={{ width: "32%" }}>Commune(s) du club</th>
                      <th
                        style={{ width: "20%", cursor: "pointer", userSelect: "none" }}
                        onClick={() => handleFusionSort('strength')}
                        title="Trier par force résultante"
                        aria-sort={fusionSortKey === 'strength' ? (fusionSortDir === 'desc' ? 'descending' : 'ascending') : 'none'}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                          <span>Force résultante</span>
                          <span style={{ fontSize: "0.75rem", opacity: fusionSortKey === 'strength' ? 1 : 0.4 }}>
                            {fusionSortKey === 'strength' ? (fusionSortDir === 'desc' ? ' ▼' : ' ▲') : ' ↕'}
                          </span>
                        </div>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedTeamFusions.map((tf, i) => (
                      <tr key={i}>
                        <td>
                          <span className="badge badge--blue" style={{ fontSize: "0.78rem" }}>
                            {tf.year ? `Saison ${tf.year}` : "Fusion"}
                          </span>
                        </td>
                        <td>
                          <strong style={{ color: "#ffffff", fontSize: "0.92rem" }}>
                            {tf.absorbedClubName}
                          </strong>
                        </td>
                        <td>
                          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", alignItems: "center" }}>
                            {tf.communes.map((c, cIdx) => (
                              <span key={cIdx} style={{ fontSize: "0.85rem" }}>
                                {cIdx > 0 && " · "}
                                {c.obj ? <CommuneLink commune={c.obj} /> : c.name}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td>
                          {tf.oldStrength !== undefined && tf.newStrength !== undefined ? (
                            <span style={{ color: "var(--color-accent-light)", fontWeight: 600, fontSize: "0.85rem" }}>
                              {tf.oldStrength.toFixed(1)} → {tf.newStrength.toFixed(1)}/30
                            </span>
                          ) : (
                            <span style={{ color: "var(--color-text-dim)", fontSize: "0.85rem" }}>—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Section: Communes partenaires */}
          <div>
            <div style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--color-text-dim)", marginBottom: "6px" }}>
              Communes & clubs représentés dans l'alliance :
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)" }}>
              {alliancePartners.map((partner, i) => {
                return (
                  <span
                    key={i}
                    className="badge badge--neutral"
                    style={{
                      fontSize: "0.85rem",
                      borderColor: partner.isHeadquarter ? "var(--color-primary)" : undefined,
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "6px",
                      padding: "4px 10px",
                    }}
                  >
                    <span>🏛️</span>
                    {partner.commune ? <CommuneLink commune={partner.commune} /> : partner.communeName}
                    <span style={{ color: "var(--color-text-dim)", fontSize: "0.8rem" }}>
                      {partner.isHeadquarter
                        ? `(Siège · ${partner.clubName})`
                        : `(Club fusionné : ${partner.clubName})`}
                    </span>
                  </span>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
