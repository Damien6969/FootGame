# Marché des transferts

Le mercato est calculé une fois par changement de saison : vieillissement et arrivée des recrues, transferts définitifs, puis attribution des prêts. L'onglet **Transferts** reste disponible pendant la Coupe et permet de retrouver les saisons archivées.

## Réglages de départ

Les paramètres sont regroupés dans `src/config/transferBalance.ts`.

| Situation | Probabilité annuelle |
|---|---:|
| Note au poste au moins 4 points au-dessus du club propriétaire | 20 % |
| Joueur barré sans perspective de dépasser le titulaire | 35 % |
| Au moins 3 saisons consécutives en prêt ou en réserve, sans place à venir | 45 % |
| Joueur barré de 30 ans ou plus | 60 % |
| Joueur en croissance avec une perspective de prendre la place | Au maximum 10 % |

Les probabilités ne s'additionnent pas. Les perspectives comparent les courbes des deux joueurs jusqu'au pic du candidat, avec le déclin et la retraite du titulaire. Les nouvelles recrues ne sont pas transférées immédiatement. Maximum : un départ et une arrivée définitifs par club, et un mouvement par joueur.

## Destinations

La recherche part du **club actuel avant la transition**, y compris le club d'accueil d'un prêt ; les clubs absorbés sont redirigés vers leur entente active. La ville natale n'intervient pas.

| Note à son poste sur 30 | Zone de recherche |
|---|---|
| Moins de 10 | 50 km maximum |
| 10 à moins de 18 | Même région |
| 18 à moins de 24 | Même conférence |
| 24 et plus | France entière |

Un joueur ambitieux peut rejoindre un club plus fort, à au plus 3 points au-dessus de sa note. Les autres candidats privilégient un club comparable ou moins fort. Toutes les destinations offrent une place dans la paire titulaire. Un tirage pondéré favorise les clubs proches et les possibilités sportives parmi trois destinations compatibles. Sans destination, le joueur reste.

## Première nomination d'un entraîneur

Un ancien joueur retraité qui n'a encore jamais entraîné est candidat à sa première nomination. Sa note actuelle d'entraîneur doit être à au plus **5 points sur 30** de la force du club, dans les deux sens.

Le tirage conserve les catégories **dernier club joueur 70 % / autres anciens clubs 20 % / autres clubs 10 %**. Seules les catégories ayant une destination admissible participent ; leurs poids sont renormalisés. Le dernier club, prêt compris, peut remplacer son entraîneur si le nouveau coach est strictement meilleur. Un coach aussi bon ou meilleur rend ce poste inaccessible. Les autres destinations doivent avoir un banc vacant.

Dans les autres anciens clubs, le poids de proximité de niveau et de dynamique sportive est multiplié par le nombre de saisons joueur dans le club (années distinctes, prêts compris), puis par **2 pour le premier club propriétaire**. Les fusions sont résolues avant de compter les saisons et le club d'origine.

La zone géographique suit les seuils ci-dessus depuis le dernier club connu. Pour les clubs où il n'a jamais joué, une destination est aussi admissible depuis sa **commune natale**, selon les mêmes seuils et les coordonnées de cette commune. Cette seconde zone ne s'applique pas aux anciens clubs ni aux entraîneurs ayant déjà exercé. Le recrutement par dynamique sportive ne contourne pas ces règles de première nomination.

Les remplacements sont enregistrés comme limogeages dans le relevé du mercato, avec le délai de retour habituel de 5 à 10 ans. Ces règles s'appliquent à la prochaine transition de saison et ne recalculent pas les nominations passées.

## Affichage et carrière

- Le transfert change le club propriétaire et le club actuel avant la distribution des prêts.
- La carrière annuelle existante est conservée ; aucun second historique individuel n'est créé.
- Le relevé contient les transferts et les nouveaux prêts. Les prêts reconduits dans le même club d'accueil ne créent pas de nouveau mouvement.
- Pour un joueur prêté transféré, le parcours affiche le changement de propriétaire et la distance précise le club d'accueil utilisé lorsque celui-ci diffère.
- Tri initial : note au poste décroissante, sans notion de prix. Recherche joueur/club, filtres par type, choix de saison, pagination de 50 lignes et cartes sur mobile.
- Les relevés survivent à l'archivage, aux résumés légers et aux exports/imports. Les anciennes saisons sans relevé sont indiquées comme non enregistrées ; leur marché n'est jamais recalculé.
