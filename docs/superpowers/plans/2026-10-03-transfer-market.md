# Marché des transferts — plan d'implémentation

> **For agentic workers:** tâches réparties entre agents sur des fichiers distincts ; intégration et vérification par l'agent principal.

**Goal:** calculer un mercato probabiliste avant les prêts et présenter ses mouvements dans un onglet permanent.

**Architecture:** moteur pur avec paramètres regroupés, puis attribution existante des prêts. Les mouvements sont conservés dans la session et ses archives ; la page lit ces données sans recalculer le marché.

**Tech Stack:** TypeScript, React, React Router, Dexie, Vitest.

**Spec:** proposition dans le chat approuvée le 3 octobre 2026, complétée par la demande explicite de coder une page soignée. Correction autoritaire : la recherche géographique part du club actuel avant le retour de prêt, jamais de la ville natale.

## Contraintes

- Probabilités : ambition 20 %, joueur barré 35 %, carrière bloquée depuis 3 saisons 45 %, vétéran barré 60 %, jeune prometteur protégé à 10 %.
- Prendre la probabilité maximale, pas leur somme. Un tirage par joueur ; au maximum une arrivée et un départ définitifs par club.
- Notes à son poste sur 30 ; ambition à partir de 4 points au-dessus du club, destination plus forte à au plus 3 points au-dessus du joueur.
- Portée : moins de 10 → 50 km ; 10–17 → région ; 18–23 → conférence ; 24+ → national.
- Pas de prix ni de budget. L'historique annuel des joueurs reste la source existante de leur carrière.
- Préserver les changements du programme parallèle ; aucune remise à zéro, staging ou commit global.

## Review Focus

- Un joueur prêté recherche autour du club d'accueil précédent, y compris après fusion.
- Un jeune qui peut dépasser le titulaire n'est pas pénalisé par une succession de prêts.
- Un transfert modifie le propriétaire avant la répartition des prêts.
- Archives légères, sauvegardes et anciennes carrières restent compatibles.
- Page accessible avec tri initial par niveau, filtres, pagination et affichage mobile.

## Tâches

- [x] Agent moteur : créer types, réglages, moteur et tests ; ajouter `advancePersonsSeasonWithMarket` sans casser l'API existante.
- [x] Agent interface : créer page, CSS local et tests de tri, filtres, saisons, liens et états vides.
- [x] Agent principal : tester puis intégrer stockage, validation des sauvegardes, archivage, transition et navigation.
- [x] Vérification : tests ciblés, suite complète, compilation, revue indépendante et inspection dans le navigateur sur ordinateur et mobile.

## Vérification du 3 octobre 2026

79 tests ciblés du marché, de la génération, des prêts, de la création et de la transition de saison, de la navigation et des sauvegardes passent. La compilation TypeScript/Vite réussit. Une saison complète réelle a été simulée dans le navigateur sur un serveur de vérification séparé (port 5178), puis son mercato consulté. Recherche, filtres, persistance après rechargement et format mobile de 390 pixels contrôlés.

La revue indépendante a vérifié les destinations finales de 2 270 transferts sur 500 marchés supplémentaires et fait corriger la protection des jeunes par comparaison des deux trajectoires. Les premières suites globales ont rencontré des tests temporairement rouges dans le travail parallèle sur les favoris ; le dernier contrôle ciblé de leurs 4 tests est vert. Aucun de ces fichiers parallèles n'a été modifié pour forcer leur réussite.

Dernière suite complète : **50 fichiers, 291 tests réussis**, aucun échec. Compilation finale réussie.
