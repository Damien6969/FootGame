# Audit des retraites et du mercato des entraîneurs

Audit du 5 octobre 2026, réalisé initialement sans modification du code ni des sauvegardes. Le correctif de code a ensuite été autorisé et appliqué ; les sauvegardes restent inchangées.

## Constats vérifiés dans la sauvegarde

Source : `sauvegardes/coupe-des-communes-carriere-Saison-2037-2026-10-05_15h49m12.json.gz`, lue sans import ni réécriture. Malgré le nom du fichier, la session exportée est déjà en 2038.

- L'archive 2037 contient 167 entraîneurs, tous retraités de leur carrière de joueur, âgés d'au moins 34 ans.
- La session 2038 contient 213 personnes de rôle COACH, dont 27 avec `isRetired: false`.
- Parmi ces 27 personnes, 22 ont moins de 34 ans. Le minimum est 16 ans.
- Max Simões (`p-468`) a 16 ans, zéro saison de carrière et `coachStartAge: 16` : c'est une nouvelle recrue devenue entraîneur immédiatement.
- 17 nouvelles nominations de véritables retraités en 2038 dépassent la zone autorisée par leur note, en prenant leur dernier club de carrière comme point de départ et lorsque celui-ci existe encore dans la session. Exemple : note 8, Ancenis-Saint-Géréon vers Pélissanne, environ 646 km.
- Aucun doublon de banc n'a été trouvé dans cette session. Le moteur permet néanmoins d'en produire dans un cas contrôlé.

## Causes

### 1. Le recrutement par dynamique sportive sélectionne des joueurs actifs

Dans `src/features/coaches/coachEngine.ts`, la boucle de recherche des candidats parcourt toutes les personnes. La branche avec un club ne vérifie ni `primaryRole === 'COACH'`, ni la retraite sportive, ni la retraite du métier d'entraîneur.

Les joueurs possèdent déjà `coachSkill` à leur génération : cette note est un potentiel de reconversion. La branche la traite comme une compétence d'entraîneur en exercice, puis remplace le rôle par COACH. Elle conserve `isRetired: false`.

Les règles normales de retraite dans `personGenerator.ts` sont distinctes : aucune retraite avant 34 ans, probabilités de 15 %, 35 %, 60 % et 85 % entre 34 et 37 ans, retraite obligatoire à 38 ans. Le problème observé est un contournement de ces règles par le recrutement.

### 2. La recherche de l'entraîneur en poste peut trouver un joueur

La recherche `find(p => p.currentClubId === dynClub.id)` ne filtre pas le rôle. Selon l'ordre des personnes, elle prend un joueur pour l'entraîneur titulaire : mauvais niveau de référence et libération de la mauvaise personne. Un véritable entraîneur peut alors rester en poste pendant qu'un second est recruté.

### 3. Les sans-club échappent aux filtres géographiques et sportifs stricts

Le recrutement des sans-club par dynamique sportive et le remplissage final des bancs n'appliquent pas `withinSearchArea`. Le remplissage final privilégie le dernier club joueur (70 %), les autres anciens clubs joueurs (20 %) ou les autres clubs (10 %), parmi les catégories disponibles.

Ces poids sont des préférences, pas des restrictions. Le dernier club et les anciens clubs peuvent donc être hors zone. Pour un entraîneur ayant déjà exercé, cette phase utilise encore son histoire de joueur plutôt que son dernier banc comme point géographique.

La proximité de niveau est seulement pondérée : aucun plafond sportif strict n'exclut un club inaccessible dans cette phase. Les clubs en dynamique reçoivent un bonus de poids de 2, alors que le poids de proximité de niveau vaut au plus 1.

### 4. Les données incohérentes ont des conséquences sur les saisons suivantes

`isActiveCoach` vérifie le rôle, le club, l'âge maximal et l'absence de retraite d'entraîneur, mais pas la retraite de joueur. Les personnes mal converties peuvent donc être considérées comme entraîneurs actifs.

Le vieillissement des anciens joueurs ne s'applique qu'à `isRetired: true`. Les faux entraîneurs suivent alors le traitement des joueurs actifs, avec remise à jour des affectations et retraite sportive entre 34 et 38 ans. L'affectation des effectifs réinitialise elle aussi les personnes non retraitées vers leur club parent. Une simple correction du recrutement ne répare pas les personnes déjà touchées.

## Comparaison géographique avec les joueurs

La règle partagée actuelle est :

| Note actuelle | Zone autorisée |
| --- | --- |
| Moins de 10 | Rayon de 50 km ; distance inconnue : refus |
| De 10 à moins de 18 | Même région |
| De 18 à moins de 24 | Même conférence |
| À partir de 24 | Toute la France |

Les transferts des joueurs et les départs ambitieux des entraîneurs en poste utilisent cette règle. Le débauchage d'un entraîneur avec club l'utilise également, mais son filtre de rôle est incorrect. Les nominations de sans-club et les reconversions ne l'utilisent pas.

Les joueurs sont évalués depuis leur localisation connue avant le mercato. Leurs destinations sont filtrées avant tirage selon la zone, l'opportunité de jouer et la progression sportive possible. Pour les entraîneurs, le même ordre doit s'appliquer : admissibilité d'abord, préférence ensuite.

## Proposition de correction à valider

Correction ciblée du système existant, sans nouvelle mécanique :

1. Restreindre le débauchage aux véritables entraîneurs en activité. Identifier le titulaire par son rôle, jamais uniquement par son club. Une reconversion exige une retraite sportive réelle ; conserver la fenêtre normale de retraite des joueurs et la retraite d'entraîneur à 65 ans.
2. Appliquer les seuils géographiques ci-dessus à toutes les voies de recrutement, depuis le dernier banc pour un entraîneur sans club, ou le dernier club joueur pour une reconversion. Résoudre les fusions. Si l'ancrage est inconnu, ne pas inventer une localisation permettant un déplacement. Les préférences pour les anciens clubs et la dynamique sportive restent à l'intérieur des destinations admissibles.
3. Appliquer un plafond sportif cohérent aux bancs vacants, fondé sur la note actuelle d'entraîneur et la marge d'aspiration déjà utilisée. Les exceptions existantes liées aux champions doivent rester bornées ; elles ne doivent pas lever la restriction géographique. Un banc peut rester vacant s'il n'existe aucun candidat admissible.
4. Garantir un seul entraîneur par banc et maintenir la séparation entre joueurs actifs, retraités candidats, entraîneurs en activité et entraîneurs retraités.

La réparation de la sauvegarde est un travail distinct : les 27 personnes encore non retraitées peuvent être identifiées, mais leur club et leurs affectations antérieurs doivent être récupérés dans les archives ou les sauvegardes. Ne pas simplement les déclarer retraitées, ni augmenter leur âge pour masquer le bug. Ne pas réécrire automatiquement les anciennes saisons.

## Validation effectuée et prévue

### Correctif de code appliqué après validation

- Le débauchage et l'identification du titulaire exigent un véritable entraîneur actif, retraité de sa carrière de joueur. Le sélecteur des entraîneurs actifs exige également la retraite sportive.
- Toutes les voies du mercato appliquent la fonction géographique existante des joueurs, depuis le club connu avant le mercato ou la dernière saison en club. Les fusions sont résolues et une origine inconnue n'est pas remplacée par une origine inventée.
- Un entraîneur recruté n'enchaîne pas un second transfert d'ambition pendant le même mercato.
- Les probabilités de retraite, les préférences 70/20/10, les interdictions de retour après limogeage et les coefficients sportifs restent inchangés. Aucun nouveau plafond sportif n'est ajouté : Damien a demandé de conserver les mécanismes existants.
- Les tests de non-régression permanents sont dans `src/features/coaches/coachRecruitment.test.ts`. Les anciennes fixtures d'entraîneurs sont complétées avec leur retraite sportive et leur dernier club connu.
- Validation finale : 427 tests réussis dans 61 fichiers, dont 21 nouveaux cas de recrutement ; `npm run build` réussi. Relecture indépendante sans problème actionnable. Le build signale seulement la taille de certains bundles ; jsdom émet un avertissement de navigation pendant les tests.

### Résultats de l'audit initial

Exécuté : 45 tests existants réussis dans `coaches.test.ts`, `coachArchives.test.ts` et `transferEngine.test.ts`.

Trois tests temporaires de diagnostic ont confirmé les anomalies actuelles : promotion d'un joueur actif de 16 ans, recrutement d'un retraité de niveau local à plusieurs centaines de kilomètres, confusion du titulaire créant deux entraîneurs sur un banc. Le fichier temporaire a été retiré après exécution.

Pour le correctif : tests de non-régression sur ces trois scénarios, limites géographiques 10/18/24, dernier banc d'un sans-club, reconversion normale à la retraite, âge de 65 ans, fusions, ancrage absent, banc vacant sans candidat, compatibilité sportive et déterminisme. Vérifier ensuite les suites de transition de saison et de sauvegarde, puis le build.
