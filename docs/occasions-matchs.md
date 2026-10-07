# Occasions, tirs et défense — moteur v2

Le moteur utilise la force effective des clubs pour répartir les 7 à 13 occasions réglementaires. Les ajustements existants des titulaires, entraîneurs et postes vacants sont conservés.

Avant chaque tir, il sélectionne le tireur et son opposition défensive. Le collectif est toujours disponible, même sans personne nommée ; son niveau est la force de base du club (avant les bonus des joueurs).

- Part du titulaire principal : `min(78 %, 65 % × (note / force de base du club)²)`.
- Part du titulaire secondaire : `min(12 %, 8 % × (note / force de base du club)²)`.
- Le reste appartient au collectif, soit au moins 10 %. Un poste vacant ne transfère pas automatiquement sa part à l'autre joueur.
- En attaque, la note utilisée est l'attaque ; en défense, c'est la défense. Le titulaire principal est respectivement l'attaquant ou le défenseur.
- Conversion du tir : `22 % × (attaque du tireur / défense de l'opposant)⁰·⁶⁵`, bornée entre 4 % et 55 %. Les notes et forces utilisées ont un plancher de 1.

Un faible joueur dans un grand club reçoit donc peu d'occasions et convertit moins bien contre une bonne défense. Une opposition faible augmente sa réussite. Le collectif continue à produire des buts pour son équipe. Un excellent joueur dans un petit club peut recevoir une grande part des occasions, sans dépasser le plafond.

Parmi les tirs qui ne deviennent pas des buts, 65 % sont classés comme interventions défensives et 35 % comme tirs non cadrés. Seules les interventions attribuées donnent un arrêt au joueur ; une intervention collective ne crédite aucun joueur. Ce partage est un réglage initial, pas une mesure de réalisme footballistique.

Les événements gardent `kind: GOAL | CHANCE` et ajoutent `shotOutcome: GOAL | STOPPED | OFF_TARGET`. Ce champ est facultatif pour lire les anciennes sauvegardes. La feuille de match distingue désormais les arrêts collectifs des tirs non cadrés. Les arrêts en prolongation comptent dans la feuille de match et les statistiques individuelles, comme les buts.

Une influence des joueurs explicitement fixée à zéro désactive aussi leur attribution et leur contribution au duel : seules les forces collectives interviennent. La graine du nouveau moteur porte le suffixe `match-v2`. Les matchs déjà enregistrés gardent leurs événements et leurs scores ; les futurs matchs sont déterministes selon le nouveau modèle. Les statistiques recalculées d'anciens matchs incluent désormais leurs interventions de prolongation.

Validation : tests déterministes sur des lots de 2 000 matchs couvrant joueur faible/grand club, adversaire faible, défenseur faible/fort, star/petit club, clubs sans joueurs et cohérence scores/événements. Tests d'intégration pour la feuille de match, le décompte individuel et les statistiques de compétition. Ces contrôles vérifient les tendances ; un suivi des saisons jouées reste utile pour affiner les coefficients.
