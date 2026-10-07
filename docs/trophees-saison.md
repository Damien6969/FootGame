# Trophées de fin de saison

## Cérémonie regroupée — 3 octobre 2026

La présentation actuelle regroupe le meilleur défenseur espoir, le meilleur attaquant espoir et le meilleur espoir sur une seule vue, dévoilée par une seule enveloppe. Chaque conférence dispose également d'une seule vue pour son défenseur, son attaquant et son meilleur joueur. Les trois cartes sont côte à côte sur ordinateur et empilées sur mobile ; les autres nommés restent consultables dans chaque carte.

Le déroulé national est conservé : Soulier d’Or, Bouclier d’Or, duo défenseur/attaquant national, puis Ballon d’Or. Pour quatre conférences, la cérémonie passe de 14 à 9 révélations pour les mêmes 20 distinctions individuelles. Le calcul et les lauréats restent identiques. Les anciennes équipes types de six joueurs ne sont pas réintroduites.

La progression locale est versionnée et convertit les anciennes révélations en vues regroupées. Une vue dont seul le duo avait été dévoilé est reprise avec son enveloppe fermée pour ne pas sauter le meilleur joueur encore inédit. Chaque prix figure individuellement dans le récapitulatif dès l'ouverture de sa vue.

Validation : 26 tests sur les trophées réussis ; parcours complet, reprise et rejeu vérifiés dans Chrome à 1440 px et 390 px, sans débordement horizontal ni erreur JavaScript, avec `work/check-compact-awards.mjs` sur la fixture fictive.

Vérification globale de cette modification : 52 fichiers, 317 tests réussis. La génération Vite réussit ; `npm run build` reste bloqué par des erreurs TypeScript dans des fichiers non modifiés par ce changement (`awardPersistence.test.ts`, `seasonAwards.ts`, `CompetitionStatsView.tsx` et ses tests, `MatchBoxScore.test.tsx`). Diagnostics : `work/compact-awards-build.txt`. La revue ciblée n'a trouvé aucun défaut significatif introduit.

Demande du 3 octobre 2026 : cérémonie progressive après la finale, distinctions individuelles nationales et par conférence, équipes types de trois attaquants et trois défenseurs, espoirs strictement âgés de moins de 23 ans, palmarès attaché au club de chaque année.

## Calcul initial — conservé pour les trophées déjà enregistrés

Uniquement les événements individuels réellement attribués aux titulaires, matchs uniques, hors exemptions. Âge, poste effectif et club sont ceux de la saison récompensée.

- Éligibilité performance : au moins `max(3, ceil(25 % du maximum de matchs disputés par un joueur))`. Aucun abaissement du seuil faute de candidat.
- Attaque : `max(0, 6 × buts − 0,25 × tirs manqués + 2 × matchs + 10 × buts / (tirs + 5))`. Aucune statistique défensive.
- Défense : `4 × interventions + 2 × matchs + 4 × interventions / (matchs + 3)`. Aucune statistique offensive.
- Overall : scores offensif et défensif divisés par leurs maxima parmi les joueurs éligibles de la saison, puis 65 % du domaine du poste effectif et 35 % de l'autre. Les maxima nationaux sont communs aux conférences.
- Départage performance : score exact, matchs, puis identifiant stable. Les classements de volume utilisent le total, les matchs, puis l'identifiant ; ils restent accessibles dès un match avec au moins une action.
- Les prix de meilleur buteur et de plus grand nombre d'interventions distinguent le volume des prix de performance.
- Jury : variation déterministe de ±2 % par joueur, édition et prix de performance. Le vote des spécialistes est partagé avec l'équipe type de son périmètre. Aucun aléa sur les prix de volume.

## Pondération des phases et équilibrage — 5 octobre 2026

Le nouveau calcul concerne les prix de performance nationaux, par conférence et espoirs. Soulier d’Or et Bouclier d’Or conservent leurs statistiques brutes, leurs critères d'éligibilité et leurs départages. Les statistiques des fiches et carrières restent également brutes.

Chaque match joué apporte un score offensif et un score défensif. Son coefficient est départemental `0,80`, régional `1,00`, conférence `1,15`, national `1,30`, finale `1,40`. La phase vient de l'identifiant du match ; les numéros de tours habituels servent de secours pour les anciennes données. La finale est le dernier tour de la saison achevée, y compris lorsque les évolutions des clubs décalent le calendrier.

- Buts ajustés dans un match : les trois premiers à pleine valeur, les suivants à 25 %. Les buts réels ne sont pas modifiés.
- Attaque du match : `2 + coefficient × max(0, 6 × buts ajustés − 0,25 × tirs manqués + 10 × buts ajustés / (buts ajustés + tirs manqués + 5))`.
- Défense du match : `2 + coefficient × 5 × interventions`. Les interventions de prolongation restent exclues comme auparavant.
- Pour chaque spécialité : `somme des scores / (matchs joués + 2) × (1 + 0,10 × min(matchs joués / 8, 1))`. Le lissage de deux matchs atténue les petits échantillons ; le bonus explicite de participation plafonne à 10 % après huit matchs.
- Seuil de participation, postes, âge des espoirs, normalisation nationale 65/35 et variation du jury sont conservés. Les exemptions, réservistes et résultats dupliqués restent exclus.

La moyenne pure favorisait trop les parcours courts dans les essais : un seul Ballon d’Or sur 50 revenait à un finaliste. Des lissages de 2, 4 et 6 matchs ont été comparés sur les mêmes éditions ; celui de 2 conserve davantage de chances aux excellents joueurs éliminés en régional. Il ne crée aucun quota de lauréats par phase.

### Mesure sur le moteur réel

Échantillon déterministe : 30 éditions indépendantes avec des effectifs initiaux de 300 joueurs, puis deux carrières de dix saisons avec vieillissement, renouvellement, fusions et sécessions ; 50 éditions et 499 005 matchs uniques. Quatre éditions de la seconde carrière durent quinze tours : la classification utilise leur phase réelle.

| Lauréats nationaux selon leur dernier stade | Régional | Conférence | Demi-finale nationale | Finale |
|---|---:|---:|---:|---:|
| Meilleur attaquant — avant | 1 | 14 | 7 | 28 |
| Meilleur attaquant — après | 11 | 28 | 2 | 9 |
| Meilleur défenseur — avant | 5 | 29 | 6 | 10 |
| Meilleur défenseur — après | 21 | 24 | 1 | 4 |
| Ballon d’Or — avant | 0 | 11 | 8 | 31 |
| Ballon d’Or — après | 17 | 24 | 1 | 8 |

Aucun lauréat de ces trois prix nationaux ne sort en départemental dans cet échantillon ; la règle l'autorise dès que le seuil de participation est atteint. Les lauréats et nommés des deux prix de volume restent identiques dans les 50 éditions. Chaque lauréat de performance respecte le seuil de participation. Ces résultats indiquent un compromis sur cet échantillon, sans garantir cette distribution sur toute carrière.

Reproduction : `npx vitest run --config work/awards-balance.config.ts`, puis `node work/summarize-awards-balance.mjs`. Résultats détaillés dans `work/awards-balance-results.json`, synthèse dans `work/awards-balance-summary.json`. Les copies des moteurs initial et expérimental dans `work/` servent uniquement à la comparaison et ne sont pas utilisées par le jeu.

Les nouveaux snapshots portent `scoringMethod: PHASE_AVERAGE`. Les trophées déjà enregistrés conservent leurs lauréats et l'affichage de leurs règles d'origine ; une ancienne saison sans snapshot est recalculée avec le nouveau barème si ses effectifs et matchs sont disponibles.

Validation : 62 fichiers et 440 tests réussis ; audit des 50 éditions réussi ; règles inspectées dans Chrome à 1440 px et 390 px sans débordement ni erreur JavaScript. La génération Vite réussit. `npm run build` reste bloqué par deux erreurs TypeScript dans les tests existants `coachRecruitment.test.ts:119` (champ `seasonYear`) et `personSelectors.test.ts:3` (import inutilisé), hors fichiers modifiés ici.

## Distinctions et cérémonie

Meilleur attaquant espoir, défenseur espoir, meilleur espoir et équipe espoir ; chaque conférence : attaquant, défenseur, joueur et équipe type ; meilleur buteur, roi des interventions, attaquant national, défenseur national, équipe type nationale ; Ballon d'Or en dernier. Tous les classements sont indépendants. Une équipe peut être incomplète, sans doublon et sans joueur inéligible ajouté pour remplir les places.

La page `/trophees` sélectionne la saison. Avant la finale, elle présente uniquement les règles et un message d'attente. Les noms gagnants apparaissent à la demande avec animation et contrôle suivant ; les équipes se dévoilent joueur par joueur. Le bilan ne montre que les distinctions déjà dévoilées. La progression est conservée localement par édition, la cérémonie peut être rejouée et les animations respectent la réduction des mouvements.

Les récompenses sont enregistrées sous forme de snapshots légers dans la session achevée et les archives, puis dans la carrière lors du changement d'année. Les anciennes archives disposant des effectifs et matchs peuvent être recalculées ; celles sans effectifs ne produisent pas de lauréats inventés. Les résumés d'archives conservent les trophées sans charger tous les matchs.

## Plan d'exécution dans cette session

- [x] Moteur pur et tests : participation, spécialités indépendantes, overall, âge, conférences, équipes, doublons de finale, égalités, saison inachevée.
- [x] Persistance, validation des sauvegardes, archives et carrières ; tests de conservation et de compatibilité.
- [x] Page de cérémonie, navigation depuis la coupe, tests de suspense et de reprise.
- [x] Palmarès individuel et distinctions sur la ligne année/club ; indicateurs dans les classements existants.
- [x] Suite complète, compilation, contrôle visuel desktop/mobile et revue des exigences.

Décision : travailler dans le dossier actuel, qui contient le projet entièrement non commité ; créer un worktree ne préserverait pas ce travail. Aucun commit global des fichiers existants.

## Vérification et revue

- 18 tests ciblés sur les trophées ; couverture de la sauvegarde de fin de finale, du vieillissement 22 → 23 ans, de la conservation du nom de club et des anciennes archives.
- Contrôle navigateur avec `work/check-awards-preview.mjs`, uniquement sur des données fictives : parcours complet jusqu'au Ballon d'Or, équipes progressives, profils, bureau 1440 px et mobile 390 px. Aucun débordement horizontal ni erreur JavaScript.
- Revue indépendante du moteur, de la cérémonie et de la persistance : aucun défaut important confirmé.
- Vérification finale : 50 fichiers de tests, 291 tests réussis ; compilation TypeScript et production Vite réussies. Avertissement de taille de bundle existant conservé.
- Cas ajusté lors de la revue finale : une conférence connue sans joueur participant conserve ses catégories, avec des prix explicitement non attribués.
