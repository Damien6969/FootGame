# FootGame — Match 5v5

Simulation de football 2D centrée sur un match rapide en **5 contre 5**, gardiens inclus. Les deux équipes sont entièrement dirigées par l'IA : l'utilisateur regarde le match sans contrôler de joueur.

## Lancer le jeu

```powershell
npm start
```

Puis ouvrir <http://localhost:3000>.

## Commandes spectateur

- bouton `×1 / ×2 / ×4` : vitesse de simulation
- `P` ou `Échap` : pause

Le match dure trois minutes. L'IA gère les dix joueurs, les formations, le pressing, les passes, les tirs et les gardiens.

## Moteur de simulation

`match-engine.js` est utilisable sans DOM ni canvas, aussi bien pour le rendu visible que pour les simulations en arrière-plan :

```js
const { simulateMatch } = require('./match-engine');
const resultat = simulateMatch({ seed: 42 });
```

Le moteur utilise un pas fixe et une graine déterministe. Dans la console du navigateur, `runBalanceSimulation(500)` et `runBalanceSuite(500)` lancent les séries d’équilibrage avec ce même moteur.
