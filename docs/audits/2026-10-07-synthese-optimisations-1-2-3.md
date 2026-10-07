# Revue des optimisations 1, 2 et 3 — état du 7 octobre 2026

Relecture du code actuel, sans ouvrir le jeu ni modifier l'application. Ce document remplace la liste des corrections à prévoir après les premières optimisations. Les problèmes du moteur des occasions ont été traités séparément.

## Ce qui est en place

- Le palmarès utilise les résumés et les tables dédiées aux joueurs/récompenses.
- Les sous-onglets de récompenses préparent leurs tableaux à la demande.
- Les résumés ne contiennent plus les performances de toutes les équipes.
- Une table `teamSeasonPerformances`, indexée par club/saison, est alimentée lors de la migration v5, de l'import et des transitions de saison.
- Le chargement des archives détaillées déduplique les lectures en cours et dispose d'un cache partagé.
- Les deux tests de résumés précédemment en échec passent désormais.

## Corrections prioritaires : fiabilité du palmarès joueurs, étape 2

1. **Vérifier la couverture des saisons, pas seulement si le cache est vide.** La migration v4 crée les tables joueurs sans les alimenter ; la v5 ne les reconstruit pas non plus. Une transition avant la première visite du palmarès remplit seulement la nouvelle saison. Le hook ne reconstruit plus puisque le classement est non vide. Ajouter une version de calcul et la liste des saisons couvertes, et compléter les saisons manquantes. Sources : `cupRepository.ts:199`, `:327`, `usePlayerPalmares.ts:127`.

2. **Rendre la saison active équivalente à une archive.** `extractSeasonPlayerHonors` utilise des statistiques nulles pour une session et considère par défaut tous ses joueurs comme titulaires. Les titres régionaux/départementaux sont absents. Le hook remplace même les lignes de l'année active déjà archivée. Calculer les vrais titulaires et résultats territoriaux, et éviter de remplacer une archive officielle par une extraction incomplète. Sources : `playerPalmaresStorage.ts:153`, `:185`, `usePlayerPalmares.ts:133–145`.

3. **Conserver les vraies identités et afficher le bon club.** La construction persistante fabrique une personne avec âge 28, notes 25, commune de naissance égale au nom du club, département 75 par défaut et retraite false. La lecture normale n'enrichit pas ces objets avec les personnes actuelles. Le dernier club d'une saison récompensée peut aussi être différent du club actuel. Stocker les champs d'identité réellement nécessaires, puis enrichir avec les données actuelles sans perdre les joueurs historiques. Sources : `playerPalmaresStorage.ts:288`, `usePlayerPalmares.ts:152`.

4. **Corriger le préfixe des distinctions de conférence.** Le calcul teste `conf-`, mais les récompenses sont nommées `conference-…`. Le total individuel contient la récompense, mais son compteur spécialisé et ses points de prestige sont faux. Source : `playerPalmaresStorage.ts:370` ; génération dans `seasonAwards.ts:135`.

## Corrections de l'étape 3

5. **Préserver les meilleurs parcours dans les classements des clubs.** `CupAppContext` calcule toujours `teamRecords` depuis les résumés, désormais privés de performances. Le fallback remplace les parcours réels par des tours supposés pour les champions ; les parcours d'autres clubs disparaissent. Reproduction locale : un champion de conférence éliminé en demi-finale passe du tour 13 avec l'archive complète au tour 12 avec le résumé. Cela affecte le meilleur parcours et peut modifier le classement. Alimenter un agrégat léger fiable pour les classements, et lire les performances ciblées pour les détails. Sources : `CupAppContext.tsx:608`, `palmaresSelectors.ts:477–556`.

6. **Synchroniser toutes les voies d'écriture.** `saveArchive` n'alimente aucune des tables dérivées. Pour un club déjà indexé, `loadTeamSeasonPerformances` retourne immédiatement les lignes existantes : une nouvelle archive ou une correction via `saveArchive` peut rester invisible. Centraliser la mise à jour des archives, résumés, performances, honneurs et récompenses. Lors d'un remplacement de saison, supprimer aussi les anciennes lignes disparues, au lieu d'utiliser uniquement `bulkPut`, pour éviter des titres et performances résiduels. Sources : `cupRepository.ts:292`, `:319–335`, `:488`.

7. **Retirer la lecture complète de la fiche club.** `useTeamPerformances` a été ajouté, mais `TeamPage` continue d'appeler `useDetailedArchives` et d'attendre sa fin. La nouvelle lecture ciblée s'ajoute à la lecture de tous les matchs et personnes historiques. Cibler les données par onglet et réserver les détails nécessaires aux parcours/confrontations à leur consultation. Sources : `TeamPage.tsx:151`, `:218`, `:1225`. Ce point représente un gain de performance encore à réaliser, pas une perte de données.

8. **Limiter le pic mémoire de migration.** La migration v5 charge toutes les archives complètes avec `toArray`, puis accumule toutes les performances avant insertion. L'allègement final est utile, mais l'ouverture initiale d'une grosse carrière conserve un pic mémoire important. Traiter les archives par lots ou une par une, sans réintroduire une charge globale. Source : `cupRepository.ts:218`.

## Robustesse complémentaire des étapes 1 et 2

9. **Protéger le cache des anciennes lectures en cours.** L'invalidation remet les variables à zéro mais une promesse lancée avant import/reset peut encore remplir `memoryCache` avec les anciennes archives. Le hook utilise une clé fondée seulement sur nombre, première et dernière saison ; une modification intermédiaire n'est pas représentée, et l'invalidation ne déclenche pas son effet. Utiliser un numéro de génération des données, refuser les résultats obsolètes et faire réagir les vues déjà montées. Source : `useDetailedArchives.ts:15–29`, `:81–103`.

10. **Rafraîchir les données actuelles et rendre les erreurs visibles.** `usePlayerPalmares` dépend d'une clé d'années/champion, pas des changements de personnes/clubs ; les refs seules ne déclenchent pas le recalcul. Son repli peut publier un classement incomplet construit depuis des résumés sans personnes ni performances en masquant l'erreur. `useTeamPerformances` transforme aussi une erreur en historique vide. Préserver les résultats fiables, différencier erreur et absence d'historique, et invalider lors des changements pertinents.

## Vérification

- 51 tests pertinents passent dans historique/stockage, archives entraîneurs et régressions P0 ; 3 tests du hook des performances de club passent également.
- TypeScript passe (`npx tsc --noEmit`).
- La reproduction du meilleur parcours 13 → 12 a été exécutée directement sur le sélecteur.
- Ces tests ne couvrent pas encore la fidélité globale ancien/nouveau classement, les caches partiels ni les remplacements de saison. Le gain réel de chargement n'a pas été mesuré dans le navigateur.

Tests à ajouter : migration d'une carrière existante suivie d'une transition avant première visite ; finale avec réservistes et titres territoriaux ; identités retraitées et changement de club ; récompenses conférence ; comparaison des palmarès clubs/joueurs entre archives complètes et nouvelles tables ; remplacement d'archive ; import/reset pendant une lecture en cours ; absence de lecture globale sur la fiche club quand seul le palmarès est consulté.

Ordre conseillé : points 1, 2 et 5 pour éviter les résultats faux ; points 3, 4 et 6 pour fiabiliser les données ; puis points 7 à 10 pour terminer les gains et la robustesse. Après modification des règles de calcul, reconstruire également les caches déjà enregistrés.
