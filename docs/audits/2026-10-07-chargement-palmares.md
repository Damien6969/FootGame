# Étude du chargement du palmarès — 7 octobre 2026

Étude en lecture seule du code et d'une sauvegarde locale. Aucune page ouverte, aucun accès à la base du navigateur, aucune modification de l'application. Les mesures portent sur le JSON sérialisé, pas sur la mémoire réelle ni sur les temps de chargement. Le blocage signalé n'a pas été reproduit, conformément à la demande.

## Constats

- `AwardsPage`, dans `src/features/overview/OverviewPages.tsx:1630`, appelle `useDetailedArchives` sans tenir compte de l'onglet. La page attend les archives complètes avant d'afficher son contenu.
- `src/features/storage/useDetailedArchives.ts` appelle `loadArchives()`. Cette méthode lit toute la table `archives` avec `toArray()`, puis nettoie les archives. Revenir sur une page qui utilise ce hook déclenche une nouvelle lecture ; il n'existe pas de cache partagé dans ce hook.
- `getRankedPlayerPalmares`, dans `src/features/history/playerPalmaresSelectors.ts`, parcourt les populations présentes et archivées, sélectionne les candidats puis appelle `computePersonTrophyRecord` pour chacun. Le préfiltrage existe déjà, mais utilise l'ensemble des clubs titrés sur toutes les saisons, ce qui peut élargir les candidats. Sans candidat, il évalue toute la population.
- `computePersonTrophyRecord`, dans `src/features/persons/personSelectors.ts`, reconstruit les carrières, résout les noms des clubs, parcourt les saisons et demande les statistiques de matchs. Des caches par objet existent déjà pour les personnes archivées et les statistiques : les matchs ne sont donc pas reparcourus systématiquement pour chaque joueur. Le premier calcul reste coûteux, et une nouvelle lecture crée de nouveaux objets.
- `PalmaresPlayersView` prépare le classement et les quatre historiques de récompenses dès son montage, même lorsque leurs sous-onglets sont masqués. Les calculs sont synchrones pendant le rendu React.
- Le tableau affiche déjà 20 joueurs par défaut et pagine à 25 en mode « tous ». Cette pagination limite le rendu, pas le chargement des archives ni la reconstruction préalable du classement.
- Après une finale, `AwardsPage` peut aussi appeler `buildSeasonArchive` pour intégrer la saison active non encore archivée.

## Mesure locale

Source : `sauvegardes/coupe-des-communes-carriere-Saison-2040-2026-10-06_18h45m22.json.gz`, analysée avec Node et zlib sans import dans le jeu.

| Élément | Volume |
|---|---:|
| Sauvegarde compressée | 31,0 Mo |
| JSON décompressé total | 354,6 Mo |
| Archives, 15 saisons | 346,3 Mo |
| Historiques de matchs | 190,4 Mo, 147 621 matchs |
| Performances des équipes | 74,2 Mo |
| Instantanés des clubs | 56,8 Mo |
| Instantanés des personnes | 23,5 Mo, 6 096 entrées cumulées |
| Récompenses individuelles | 0,62 Mo |
| Résumés approximés sans matchs, clubs et personnes | 75,5 Mo |

Mo décimaux. Les résumés approximés conservent les autres champs ; le nettoyage et le match final de `toArchiveSummary` ne sont pas exécutés dans cette mesure. La sauvegarde comprend 540 personnes dans la session active. Ces volumes ne prouvent pas quel poste domine le temps réel, mais montrent le coût de la lecture globale et l'importance des performances d'équipes dans les résumés.

## Proposition recommandée

Créer des tables de consultation calculées à la fin des saisons. Le palmarès lirait des résultats prêts à afficher au lieu de reconstruire les carrières à partir des matchs.

| Table proposée | Contenu et usage |
|---|---|
| `playerSeasonHonors` | Une ligne par joueur et saison pertinente : titres, distinctions, participation admissible, meilleur parcours, identité historique minimale et club de la saison. Clé composée joueur/saison. |
| `playerPalmares` | Une ligne par joueur classable : compteurs cumulés, critères de classement, identité minimale, club actuel ou dernier club. Aucun événement de match ni carrière complète. |
| `seasonAwardSummaries` | Gagnants et petits résumés par saison ; nommés et détail chargés lorsque le sous-onglet ou la saison est consulté. |

Préserver exactement le tri actuel : Ballon d'Or, titres nationaux, Soulier d'Or, distinctions individuelles, conférences, titres collectifs, total, prestige, puis nom. Un index de classement doit représenter cette priorité ; trier uniquement par prestige modifierait les résultats. Pour le volume de personnes observé, lire toutes les lignes légères puis filtrer et trier en mémoire est aussi une première option raisonnable.

Les tables sont des données dérivées et reconstruisibles. Calculer les résultats d'une saison puis les enregistrer avec l'archive dans une transaction. Remplacer les lignes d'une saison lors d'un recalcul, sans additionner deux fois les mêmes titres. Conserver les règles de titulaires, prêts, reconversions, identités des clubs et compatibilité des anciennes sauvegardes. Traiter la saison active comme un complément léger, avec exclusion d'une saison déjà archivée.

La reconstruction initiale des anciennes carrières doit avancer saison par saison, avec progression et reprise possible. Un Web Worker peut éviter de bloquer l'interface pendant ce calcul ; il faut également limiter les données transférées. Ne pas charger les 346 Mo d'un coup pour construire le cache. Invalider/reconstruire après import, remise à zéro ou changement de version des règles.

## Ordre des travaux

1. **Réduire le chargement immédiat.** Pour les onglets qui peuvent fonctionner avec les résumés, supprimer la dépendance aux archives complètes. Pour les joueurs, introduire une source légère fiable avant de retirer les instantanés : utiliser uniquement les résumés actuels pourrait perdre les anciens joueurs et leurs participations.
2. **Introduire les tables de palmarès.** Lire les lignes légères au montage ; calculer les détails seulement à la demande. Partager les lectures en cours et utiliser un cache borné avec invalidation.
3. **Alléger les résumés globaux.** Séparer le catalogue des éditions des performances des équipes. Mettre ces performances dans des lignes indexées par saison et club, afin de consulter un parcours sans charger toutes les équipes de toutes les saisons. Les 74,2 Mo actuels en font un chantier transversal important.
4. **Cibler les pages de détail.** Historique : charger la saison sélectionnée ; match : sa saison et son match ; fiche joueur : ses saisons utiles ; fiche club : ses performances utiles. `loadArchive(year)` existe déjà comme première étape. Le hook global est actuellement utilisé par Historique, Match, PersonPage, PersonTable et TeamPage.

## Nettoyage

La priorité est de réduire ce qui est lu et calculé. Ne pas supprimer les vieux matchs ni les joueurs retraités pour accélérer le palmarès : ils servent aux parcours et à l'historique. Étudier ensuite les doublons de données entre instantanés successifs, avec maintien des valeurs historiques. Conserver les archives originales tant que la reconstruction et la restauration n'ont pas été validées.

## Validation à prévoir pendant l'implémentation

- Comparer les anciens et nouveaux résultats : ordre complet, compteurs, distinctions, joueurs retraités, réservistes, prêts et saison active.
- Vérifier l'absence de lecture globale des archives lors de l'ouverture du palmarès.
- Mesurer séparément lecture IndexedDB, calcul du classement, premier affichage et mémoire, sur une carrière courte puis la sauvegarde de 15 saisons ; distinguer première ouverture et retour sur la page.
- Contrôler import, transition de saison, reconstruction interrompue et absence de double comptage. Ne pas promettre de gain chiffré avant ces mesures.

Références techniques : [API Dexie](https://dexie.org/docs/API-Reference), [transactions Dexie](https://dexie.org/docs/Dexie/Dexie.transaction%28%29).
