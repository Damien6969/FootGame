# Mécaniques du match — FootGame

Ce document décrit le moteur actuel du match 5 contre 5 : les décisions de l'IA, les statistiques individuelles, les calculs de réussite et d'échec, la physique et le mode debug.

## Cadre du match

- Deux équipes de cinq joueurs : un gardien, un défenseur, un milieu et deux attaquants.
- Toutes les décisions sont prises par l'IA ; il n'y a aucun contrôle joueur.
- Un match dure trois minutes de temps simulé.
- Les vitesses `×1`, `×2` et `×4` accélèrent le temps de simulation, et non seulement l'animation.
- Après un but, l'équipe qui a encaissé engage. Un verrou interdit tout second comptage avant l'engagement suivant.

## Attributs individuels

Chaque joueur possède six notes de 0 à 100, visibles dans le panneau **STATS**.

| Attribut | Usage principal |
| --- | --- |
| Vitesse | Vitesse maximale, accélération, résistance à un tacle. |
| Passe | Moment de décision, vitesse de passe, précision et contrôle des ballons reçus. |
| Tir | Portée de frappe, puissance et dispersion de la cible. |
| Défense | Probabilité de réussite des tacles. |
| Gardien | Portée de réaction, zone de capture et contrôle d'une frappe rapide. |
| Endurance | Perte d'énergie en pressing et récupération hors pressing. |

### Déplacement et fatigue

Lorsqu'un joueur presse ou court vers le ballon, son endurance diminue :

```text
perte = dt × (0,075 − endurance × 0,00045)
```

Hors pressing, elle remonte :

```text
récupération = dt × (0,035 + endurance × 0,00035)
```

L'endurance est bornée entre 25 % et 100 %. Elle applique ensuite un facteur de fatigue :

```text
fatigue = 0,76 + endurance_actuelle × 0,24
facteur_vitesse = 0,72 + vitesse / 250
```

La vitesse cible de base est de 216 en pressing et 177 hors pressing pour un joueur de champ, puis est multipliée par ces deux facteurs. Pour un gardien, la base est 185. L'accélération est de `570 + vitesse × 1,7` pour un joueur de champ ; pour un gardien, `690 + gardien × 1,1`.

## Décisions de l'IA

Les joueurs se replacent autour de leur formation. L'équipe se décale avec la position du ballon et avance lorsqu'elle a la possession. Le joueur de champ le plus proche presse un ballon libre ou un adversaire porteur.

### Tir

Un porteur de balle peut tirer s'il est dans l'axe (`|y − centre| < 190`) et dans sa zone de tir :

```text
portée de tir = 245 + tir × 1,55
```

La frappe vise le centre du but avec une composante aléatoire. Plus la note de tir est élevée, plus la dispersion est faible :

```text
imprécision = max(16, 125 − tir)
cible_y = centre_du_but + aléa uniforme [−(58 + imprécision)/2 ; +(58 + imprécision)/2]
puissance = 610 + tir × 2,45 + aléa uniforme [0 ; 45]
```

Une frappe réussit donc par la combinaison de la note de tir, l'angle, la position réelle du gardien, la trajectoire physique, les poteaux et l'éventuel arrêt.

### Passe

Le porteur envisage une passe sous pression (adversaire à moins de 85 unités) ou après un temps de possession qui dépend de sa note de passe :

```text
temps avant passe = 1,8 − passe × 0,009 secondes
```

La cible est un coéquipier noté selon sa progression vers le but, son espace libre et sa distance. La passe reçoit ensuite une erreur aléatoire :

```text
erreur = max(5, (100 − passe) × 1,35)
cible finale = cible prévue + aléa uniforme [−erreur/2 ; +erreur/2] sur x et y
vitesse de passe = 410 + passe × 1,45
```

Une passe est réussie lorsqu'un coéquipier la contrôle. Elle devient une passe décisive si ce receveur marque ensuite sans que l'adversaire ne récupère le ballon.

### Tacle

Lors d'un contact entre le porteur et un adversaire, le défenseur tente un tacle, avec un court délai avant une nouvelle tentative :

```text
chance = clamp(0,18 + défense / 125 + vitesse_relative / 850 − vitesse_du_porteur / 420, 0,18, 0,88)
```

Un tirage aléatoire est comparé à cette chance. En cas de réussite, le ballon est libéré vers l'extérieur et les candidats à l'assist ou au but sont annulés. En cas d'échec, le porteur conserve le ballon.

### Gardien et arrêt

Le gardien suit l'axe de son but et sort lorsqu'un danger entre dans sa portée :

```text
portée de réaction = 115 + gardien × 0,75
```

Pour capter un ballon libre :

```text
rayon de capture = rayon_joueur + 7 + gardien × 0,11
vitesse maximale contrôlable = 530 + gardien × 3
```

Un arrêt est enregistré lorsque le gardien capture une frappe adverse dont la vitesse dépasse 120. Il n'existe pas encore de tirage unique explicite `tir contre gardien` : le duel provient de la frappe calculée, de la position/portée du gardien et de la physique du ballon.

## Physique du ballon

- Le ballon suit sa vitesse horizontale et verticale, ralentit avec la friction et rebondit sur les lignes, poteaux et limites du terrain.
- Il est attaché au porteur lors de la conduite de balle, avec un décalage dans sa direction.
- Les joueurs se repoussent lors des collisions.
- Une frappe traverse le but uniquement dans la zone comprise entre les poteaux.
- Les poteaux réfléchissent la trajectoire ; un choc génère une petite secousse et des particules.

## Buts, succès et échecs

Un but est validé lorsqu'un ballon franchit la ligne derrière le but, entre les poteaux. Le moteur conserve le dernier tireur pour attribuer le but. Il conserve aussi le dernier passeur ayant réussi une passe pour attribuer une passe décisive.

Après validation :

1. le score augmente une seule fois ;
2. le match est figé pendant la célébration ;
3. l'équipe qui a encaissé est préparée pour l'engagement ;
4. le verrou de but est retiré uniquement après la remise en jeu.

Ce mécanisme reste correct en `×2` et `×4`, car le gel et l'engagement utilisent la même horloge simulée.

## Statistiques enregistrées

Chaque joueur suit : buts, passes décisives, tirs, passes tentées, passes réussies, tacles tentés, tacles réussis, arrêts et touches de balle.

La note de match est calculée ainsi, puis bornée entre 5,0 et 10,0 :

```text
note = 6
     + buts × 1,05
     + passes_décisives × 0,62
     + arrêts × 0,16
     + tacles_réussis × 0,13
     + passes_réussies × 0,018
     − passes_ratées × 0,025
     − tacles_ratés × 0,035
```

Les panneaux affichent aussi le score, la possession, les tirs et les totaux de passes de chaque équipe.

## Mode DEBUG

Le bouton **DEBUG** active ou masque deux couches de diagnostic :

- des étiquettes flottantes sur le terrain lors d'une passe, frappe, tacle ou arrêt ;
- un journal `TESTS DE STATS` qui garde les derniers calculs.

Exemples de journal :

- `ELIOTT — TIR 87 · PUISS. 835 · ÉCART ±48`
- `SACHA — PASSE 86 · ERREUR ±9 · VIT. 535`
- `MILO — TACLE 82 · CHANCE 71 % · GAGNÉ`
- `NOA — ARRÊT GK 86 · TIR ADV 89 · CAPTÉ`

Le journal est volontairement limité aux derniers événements pour rester lisible durant un match accéléré.
