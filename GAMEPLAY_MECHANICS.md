# Mécaniques du match — FootGame

Ce document décrit le moteur actuel de match 5 contre 5. Le moteur (`match-engine.js`) est indépendant du navigateur : le canvas affiche son état et ne décide jamais du résultat.

## Simulation déterministe

- Pas fixe de `1/60` seconde.
- Chaque match reçoit une `seed` ; mêmes équipes, tactiques et seed donnent le même résultat en rendu visible ou headless.
- Les vitesses ×1, ×2 et ×4 font avancer davantage de pas de simulation.
- `simulateMatch(config)` et `simulateMatches(configs)` exécutent le véritable moteur sans canvas.

## Attributs et fatigue

Chaque note est bornée entre 0 et 100 : **vitesse**, **endurance**, **passe**, **technique**, **vision**, **tir**, **défense** et **gardien**.

L’endurance (`enduranceStat`) et l’énergie instantanée (`energyCurrent`, bornée entre 0,25 et 1) sont séparées. L’énergie baisse au pressing et remonte hors effort ; elle réduit progressivement vitesse, accélération, précision et qualité de décision.

## IA offensive

Les équipes se décalent avec le ballon et se projettent fortement lorsqu’elles le possèdent :

- le porteur avance vers le but adverse ;
- milieux et attaquants font des appels plus hauts ;
- le pressing cible plus vite le porteur adverse ;
- la sélection de passe favorise l’espace, la vision et la progression vers le but.

La décision et l’exécution sont distinctes. Tous les aléas utilisent une distribution gaussienne déterministe, avec une variance minimale : une excellente note améliore fortement la régularité sans garantir le résultat.

## Conduite, dribble et couloirs

Le porteur prend une décision persistante (`CONDUIRE`, `PROGRESSER`, `DRIBBLER`, `DEBORDER` ou `REPIQUER`) au lieu de réagir à chaque image. Il compare tir, passe, conduite et dribble à partir de l’espace devant lui, de la pression, de ses attributs et de la progression vers le but.

L’évaluation teste l’avant, les diagonales, les côtés et un repli court. Pendant une conduite, le ballon reste devant le joueur et la distance parcourue est comptabilisée. Un dribble déclenche un duel technique/vitesse/vision contre défense/vitesse/vision : réussite nette, réussite partielle ou perte de balle. Une réussite déséquilibre brièvement le défenseur et bloque son tacle immédiat.

Les actions d’aile émettent `WING_RUN_START` ; un mouvement diagonal vers le but émet `CUT_INSIDE`. Les statistiques suivent distance de conduite, conduites progressives, dribbles tentés/réussis/ratés, défenseurs éliminés, débordements, repiquages et pertes en conduite.

## Contrôle, passe, tir et tacle

### Contrôle

La difficulté de réception dépend de la vitesse et de l’angle du ballon, de la pression, de la fatigue et de la qualité de passe. La technique est prépondérante, puis la passe, la vision et l’énergie. Le résultat peut être un contrôle propre, long, repoussé ou raté.

### Passe

L’IA choisit la cible en tenant compte de la vision, de l’espace, de la progression, de la distance, de la pression et des défenseurs sur la trajectoire. L’exécution combine :

```text
passe × 0,65 + technique × 0,25 + vision × 0,10
− pression − difficulté de distance − fatigue + variance
```

Les défenseurs peuvent intercepter la passe. Une passe décisive n’est conservée que pendant une courte possession directe sans récupération adverse.

### Tir et gardien

La qualité d’occasion tient compte de la distance, l’angle, la pression, les obstructions et une éventuelle meilleure passe. L’exécution de frappe combine tir, technique, vision, occasion, fatigue et variance. Les tirs sont classés en cadrés, non cadrés et bloqués.

Le gardien oppose gardien, vision, vitesse, positionnement, difficulté de frappe et fatigue. Il peut capter, repousser ou être battu.

### Tacle

Le duel transforme l’écart entre défenseur et porteur en probabilité bornée entre 12 % et 82 %. Il intègre défense, vitesse, vision, énergie, position, direction d’approche et ballon éloigné du porteur. Un échec déséquilibre le défenseur et impose un délai avant une nouvelle tentative.

## Événements et statistiques

Le moteur émet notamment `PASS_ATTEMPT`, `PASS_COMPLETE`, `INTERCEPTION`, `CONTROL_FAILED`, `SHOT`, `SHOT_ON_TARGET`, `SHOT_BLOCKED`, `SAVE_CAUGHT`, `SAVE_PARRIED`, `TACKLE_WON`, `TACKLE_LOST`, `GOAL`, `KICKOFF` et `MATCH_END`.

Les statistiques suivent les tirs cadrés/non cadrés/bloqués, passes, pertes, interceptions, contrôles ratés, tacles, arrêts captés ou repoussés, possession, buts et passes décisives. Les notes sont bornées entre 5 et 10.

## Debug et équilibrage

Le bouton **DEBUG** montre les derniers événements importants avec compétence, contexte, opposition, fatigue/variance et résultat. `runBalanceSimulation(500)` et `runBalanceSuite(500)` permettent de lancer des séries headless dans la console du navigateur.
