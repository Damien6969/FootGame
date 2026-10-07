# Jeu V2 — Plan d'implémentation pour Gemini

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Exécution confiée à Gemini par Damien ; traiter un lot à la fois, sans délégation automatique.

**Goal:** Livrer la pyramide géographique et le championnat national joué, avec une coupe à quinze tours, sur `codex/jeu-v2`.

**Architecture:** Règles métier indépendantes de React, modules ciblés pour divisions, calendrier, classements et transitions. Archives annuelles comme source des historiques ; orchestration commune, statistiques séparées par compétition.

**Tech Stack:** TypeScript, React, Vite, Dexie, Vitest, Playwright déjà présents. Pas de nouvelle dépendance sans besoin démontré.

**Spec:** `docs/superpowers/specs/2026-10-07-jeu-v2-design.md`, à lire intégralement avec ce plan.

## Contraintes globales

- Travailler exclusivement sur `codex/jeu-v2`. Ne pas modifier ni fusionner dans main. Commits ciblés ; ne pas inclure sauvegardes/, scratch/ ou work/.
- Nouvelle partie V2 ; ne pas migrer, effacer ou remplacer une sauvegarde V1. Versionner les données et expliquer une incompatibilité d'import.
- Quatre clubs par championnat, 14 nouvelles régions, 4 conférences, 76 places distinctes. Coupe à 15 tours.
- Championnat national : 6 journées aller-retour, 12 matchs, points 3/1/0, nuls autorisés ; conférence et régional sans matchs propres.
- Comparateur coupe : tour atteint, différence de buts, buts marqués, tirage persistant. Aucun mélange avec les statistiques du championnat.
- Un relégué national : quatrième, sauf s'il gagne la coupe, alors troisième. Finaliser après la finale et avant mercato.
- Un lot à la fois. Documenter les arbitrages ouverts avant d'implémenter la partie qui en dépend. Les propositions ne sont pas des décisions validées.
- Français pour interface/documentation ; anglais pour code. Réutiliser les composants et mécanismes actuels.

## Review Focus

1. Paris vide ou seul au départemental : aucun quota impossible ni match inventé (lot 3).
2. Fusion entre régions/conférences : conservation du meilleur niveau, territoire de rattachement et taille de quatre (lot 4).
3. Match national nul : aucun vainqueur forcé, aucune élimination et points corrects (lot 2).
4. Reprise après simulation partielle : aucun doublon ni changement de tirage (lots 2 et 7).
5. Historique après transfert/prêt : division de l'année et club concerné, pas la division actuelle (lots 1 et 6).

## Lot 1 — Territoires, affectations et nouvelle partie

**Fichiers existants :** `src/features/geography/loadGeography.ts`, `territoryLabels.ts`, `types.ts` ; `src/features/teams/types.ts`, `clubGenerator.ts` ; `src/features/storage/cupRepository.ts`, `validateBackup.ts`, `backupService.ts` ; `src/app/CupAppContext.tsx`.

**Créer :** `src/features/divisions/types.ts`, `divisionInitialization.ts`, `divisionInitialization.test.ts`, `src/features/geography/sportingRegions.ts` et son test.

**Contrat proposé :** `DivisionLevel = 'NATIONAL' | 'CONFERENCE' | 'REGIONAL' | 'DEPARTMENTAL'`; `DivisionAssignment` porte clubId, seasonYear, level, championshipId nullable, sportingRegionId et conferenceId. `initializeDivisions(clubs, seasonYear, seed): DivisionAssignment[]`. Conserver le code administratif séparément. Fixer ces noms dans les lots suivants après inspection des types existants.

- [ ] Lire les parcours d'initialisation/reset/import et exécuter le baseline tests/build ; consigner les échecs préexistants dans `docs/audits/2026-10-07-v2-baseline.md`.
- [ ] Écrire les tests : tous les codes sources couvrent les 14 régions ; national = 4 plus grandes villes ; 16 conférences et 56 régionaux parmi les restants ; aucun doublon ; reste départemental ; seed stable ; import V1 ne crée pas une carrière V2.
- [ ] Exécuter les nouveaux tests et constater leur échec avant implementation.
- [ ] Implémenter affectations, persistance versionnée et nouvelle partie, sans encore remplacer le moteur de coupe.
- [ ] Tests ciblés puis `npm test` et `npm run build` ; expliquer tout écart au baseline. Commit ciblé du lot.

**Livrable :** modèle annuel sauvegardé utilisable par les lots suivants. À population identique, proposer un départage explicite avant de l'intégrer.

## Lot 2 — Championnat national et calendrier commun

**Lire/modifier :** `src/features/match/simulateMatch.ts`, `src/features/cup/CupPage.tsx`, `src/app/CupAppContext.tsx`, stockage et types de match. **Créer :** `src/features/divisions/nationalLeague.ts`, `nationalLeague.test.ts`, `seasonCalendar.ts`, `seasonCalendar.test.ts`.

**Contrats proposés :** `createNationalSchedule(clubIds, seed)` retourne 6 journées de 2 rencontres ; `buildSeasonCalendar()` associe journées et tours ; identifiant de compétition explicite sur chaque rencontre. État de journée et résultats persistants, séparés de l'état de coupe.

- [ ] Présenter pour décision les départages à égalité de points ; utiliser les tours proposés 1, 2, 4, 5, 6, 8 comme réglage documenté.
- [ ] Tests d'abord : chaque paire deux fois avec domicile inversé, six matchs par club, deux par journée, nul = 1 point chacun, victoire = 3/0 ; simulation partielle/reprise idempotente ; aucune statistique de coupe alimentée.
- [ ] Constater l'échec des tests, puis réutiliser le moteur de match avec un mode championnat sans prolongation ni tirs au but. Préserver le mode coupe existant.
- [ ] Brancher « Jouer le tour », lecture manuelle des matchs et simulation rapide sur un même service de calendrier ; ne pas dupliquer les résultats entre les chemins d'interface.
- [ ] Vérifier tests ciblés, tests moteur existants et build ; commit du lot.

## Lot 3 — Coupe, entrées différées et quotas

**Modifier :** `src/features/competition/competition.ts`, `phaseLabels.ts`, `echelonColors.ts`, tests de compétition ; `src/features/cup/FinalBracket.tsx`, `CupPage.tsx`, `src/app/CupAppContext.tsx`. **Créer :** `src/features/competition/cupEntry.ts`, `qualificationQuotas.ts` et leurs tests.

**Interface :** entrée issue de DivisionAssignment ; phase et tour explicites, jamais déduits uniquement du nombre d'équipes. Cibles : 712 départementaux + 56 régionaux ; 12 qualifiés régionaux + 4 entrants par conférence ; 4 qualifiés + 4 nationaux.

- [ ] Faire un audit avec le dataset réel et proposer les quotas entiers par région/département. Ne pas coder un calendrier préliminaire sans décision si quatre tours sont insuffisants.
- [ ] Tests d'abord : entrée unique aux tours 1/5/9/13 ; tableaux régionaux 16q ; Paris zéro/un/plusieurs ; effectifs après fusions/créations ; quarts, demies et finale ; pas de faux exempts avant l'entrée.
- [ ] Constater les échecs, implémenter allocation et exemptions, retirer les hypothèses Final Four et les seuils incompatibles.
- [ ] Vérifier une édition complète sur données réelles, tests ciblés et build ; commit du lot.

## Lot 4 — Classements, titres et transitions

**Modifier :** `src/features/history/palmaresSelectors.ts`, `src/features/teams/interseasonEngine.ts`, stockage, `src/features/cup/InterseasonView.tsx`. **Créer :** `src/features/divisions/cupRanking.ts`, `divisionTransitions.ts` et tests.

**Contrats :** un comparateur coupe partagé, un classement national distinct, une transition produisant affectations de l'année suivante et journal des promotions/descentes/repêchages avec motif. Le tirage d'égalité fait partie de l'archive.

- [ ] Présenter les règles encore ouvertes : sélection départementale, ordre fusion/mouvements/repêchages, cas de dépassement des quatre places.
- [ ] Tests d'abord : trois critères puis tirage stable ; pas de matchs/victoires comme critère ; titres distincts ; quatre cas de descente nationale listés dans la spec ; descentes géographiques 0/1/2 ; fusion interterritoriale, double vacance et nouveau club départemental.
- [ ] Constater les échecs, implémenter après décisions ; conservation de tous les clubs actifs et affectation unique.
- [ ] Vérifier plusieurs transitions avec seed fixe, comparer comptes avant/après et tests/build ; commit du lot.

## Lot 5 — Recrutement, entraîneurs et récompenses

**Modifier :** `src/config/transferBalance.ts`, `src/features/transfers/transferEngine.ts`, `src/features/coaches/coachEngine.ts`, `coachRatings.ts`, `src/features/persons/rosterAndLoans.ts`, `src/features/awards/seasonAwards.ts`, `types.ts` et tests associés.

**Créer :** `src/features/divisions/clubAttractiveness.ts` et tests. **Contrat :** `computeClubAttractiveness` consomme force, nouvelle division et résultats de la saison terminée. Performance de coupe relative au tour d'entrée, championnat national identifié séparément.

- [ ] Proposer à Damien les coefficients, attentes et périmètres des trophées, y compris prix de conférence/espoirs et prix généraux. Pas de bonus inventé ni double bonus coupe/championnat non décidé.
- [ ] Tests d'abord : même force/parcours, avantage division supérieure ; promu évalué dans sa nouvelle division ; épopée valorisée ; quart atteint par entrée tardive sans bonus automatique ; licenciement ajusté ; statistiques nationales distinctes.
- [ ] Constater les échecs puis adapter transferts, prêts, recrues et entraîneurs sans contourner les règles de poste/géographie.
- [ ] Vérifier récompenses sur matchs réellement joués et fixtures contrastées ; tests/build ; commit du lot.

## Lot 6 — Vues et historiques

**Modifier :** `src/app/App.tsx`, `src/features/teams/ClubBadge.tsx`, `TeamLink.tsx`, `TeamsPage.tsx`, `TeamPage.tsx`, `src/features/persons/PersonPage.tsx`, `src/features/transfers/TransfersPage.tsx`, vues de coupe, palmarès, trophées, entraîneurs et CSS concernés. **Créer :** `src/features/divisions/ChampionshipsPage.tsx`, `championshipSelectors.ts` et tests.

- [ ] Tests de sélecteurs d'abord : division de la saison affichée ; prêt propriétaire/accueil ; classement national distinct du parcours de coupe ; relégation provisoire puis définitive.
- [ ] Constater les échecs puis ajouter vues de championnats, six journées, buteurs nationaux, badges de division et historique annuel division/place/mouvement.
- [ ] Auditer tous les usages de couleurs de clubs : les remplacer par la division annuelle sans remplacer les couleurs de phase ; texte lisible en plus de la couleur.
- [ ] Ouvrir et inspecter réellement les pages à 1440px et 390px ; tests UI ciblés/build ; commit du lot.

## Lot 7 — Validation de la V2

**Créer :** tests d'intégration dans les dossiers propriétaires et compte rendu `docs/audits/jeu-v2-validation.md`.

- [ ] Ajouter une simulation multi-saisons seedée incluant Paris, fusions interterritoriales, créations, départages parfaits et quatrième national vainqueur de coupe.
- [ ] Vérifier à chaque saison : 76 places, 4 par championnat, aucun club dupliqué/perdu, entrées uniques, huit nationaux en coupe et douze matchs de championnat.
- [ ] Tester sauvegarde/rechargement à mi-journée, archive annuelle et export/import V2 ; refus explicite de migration V1.
- [ ] Exécuter `npm test`, `npm run build`, inspection navigateur et validation des chemins de simulation rapide/manuelle. Corriger les régressions ; distinguer les erreurs préexistantes.
- [ ] Documenter résultats, limitations et arbitrages ; commit final de validation. Pas de merge/main ni publication sans demande de Damien.

## Prompts des lots suivants

Pour chaque lot N : « Sur codex/jeu-v2, lis la spécification V2 et le plan docs/superpowers/plans/2026-10-07-jeu-v2-gemini.md. Réalise uniquement le lot N, avec ses tests, sa vérification et son commit ciblé. Inspecte le code et les commits précédents avant de modifier. Présente les décisions métier encore ouvertes dont ce lot dépend avant de coder ces règles. Ne touche pas à main et ne passe pas au lot suivant. Termine par les changements, preuves de validation, limites et commit. »

Le prompt de démarrage du lot 1 se trouve dans `docs/superpowers/plans/2026-10-07-gemini-demarrage.md`.
