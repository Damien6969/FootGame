---
statut: conception
decisions_ouvertes: true
---

# Coupe des communes V2 — Championnats et coupe

Source : brainstorming avec Damien, 7 octobre 2026. Les décisions prises ci-dessous sont validées en conversation. Les propositions et arbitrages restants sont explicitement distingués. Ce document doit être relu avant le plan d'implémentation.

## Intention

Conserver la coupe comme unique compétition jouée, tout en donnant aux clubs une position durable dans une pyramide géographique. Les championnats n'organisent pas de matchs supplémentaires : leur classement provient du parcours en coupe. Ils déterminent le tour d'entrée, les titres et les mouvements entre saisons.

## Décisions prises

### Territoires et championnats

Un championnat national de quatre clubs, quatre championnats de conférence de quatre clubs chacun, quatorze championnats régionaux de quatre clubs chacun. Soit 76 places, sans doublon d'appartenance. Les autres clubs constituent la base départementale, sans championnat de quatre clubs à ce niveau.

Les nouvelles régions remplacent les anciens regroupements pour toutes les règles du jeu : tirages, recrutement géographique, classements, filtres et titres. Conserver séparément les codes administratifs de la source pour la traçabilité.

| Conférence | Nouvelles régions |
|---|---|
| Nord | Île-de-France ; Hauts-de-France ; Grand Est |
| Ouest | Bretagne ; Pays de la Loire ; Normandie ; Centre-Val de Loire ; Antilles–Guyane (Guadeloupe, Martinique, Guyane) |
| Sud-Ouest | Nouvelle-Aquitaine ; Occitanie |
| Sud-Est | Auvergne-Rhône-Alpes ; Bourgogne-Franche-Comté ; PACA–Corse ; Réunion–Mayotte |

### Initialisation

Au départ, un club par commune du référentiel. Population municipale de la commune pour la sélection. Affecter successivement les quatre plus grandes communes au national, puis les quatre plus grandes communes restantes de chaque conférence à son championnat, puis les quatre plus grandes communes restantes de chaque nouvelle région à son championnat. Tous les autres commencent au départemental. Cette affectation par population n'est pas répétée chaque saison.

### Classements et titres

Appartenance fixée pour la saison, indépendante des changements à l'intersaison suivante. Ordre : tour atteint, différence de buts totale de la coupe, buts marqués, tirage au sort enregistré. Aucun critère de matchs joués, de victoires ou de population. Les buts encaissés sont redondants une fois différence et buts marqués fixés. Le calcul précis des buts et du rang du vainqueur doit être partagé avec les règles de score existantes.

Vainqueur de coupe : gagnant de la finale. Champion national : premier des quatre membres du championnat national. Champions de conférence et régionaux : premiers des quatre membres de leur championnat. Champion départemental : meilleur parcours parmi les clubs du département qui ne sont membres d'aucun championnat. Un territoire sans club éligible n'a pas de champion départemental. Un club régional vainqueur de coupe peut cumuler coupe et titre régional, sans recevoir le titre national.

### Montées, descentes et fusions

Parmi les premiers des championnats directement inférieurs rattachés au même championnat supérieur, le meilleur parcours monte selon le comparateur commun. Pas de saut de niveau, même en cas de victoire en coupe. Chaque championnat accueille au moins un promu du niveau inférieur. La taille reste fixe ; seul le nombre de descentes s'ajuste aux mouvements géographiques.

Hors fusions et autres vacances : descentes vers le dessous = promus reçus du dessous + relégués reçus du dessus − promus partis au dessus. Les sorties sont prises en bas de classement. Le nombre peut être nul ou supérieur à un.

Une entente conserve le niveau le plus élevé des clubs fusionnés. Sa ville de rattachement détermine son département, sa nouvelle région et sa conférence, y compris pour une fusion transfrontalière. Les places libérées sont comblées par les meilleurs clubs éligibles du niveau inférieur. Un nouveau club commence toujours au départemental.

### Coupe et calendrier

Quinze tours comme calendrier de base. Les quatre membres d'un championnat entrent ensemble au premier tour de leur niveau. Ils restent hors des tirages précédents, sans être comptés comme exempts de ces tours.

| Phase | Tours | Entrants et cibles proposés |
|---|---|---|
| Départementale | 1 à 4 | Clubs hors championnat → 712 qualifiés |
| Régionale | 5 à 8 | 712 qualifiés + 56 entrants = 768 ; 192 par conférence → 12 qualifiés par conférence |
| Conférence | 9 à 12 | Par conférence : 12 qualifiés + 4 entrants = 16 → 8 → 4 → 2 → 1 |
| Nationale | 13 à 15 | 4 qualifiés + 4 entrants = 8 → 4 → 2 → vainqueur |

Les volumes sont une proposition arithmétique à vérifier avec les données réelles, pas une garantie de faisabilité départementale. Pour une région fournissant q qualifiés à sa conférence, tableau régional initial de 16q clubs, dont 4 entrants de championnat : 16q − 4 places départementales. Somme des q par conférence = 12, chacun au moins 1. Répartition par population à préciser. Aucun croisement hors région pour corriger une parité sans règle explicite.

Paris doit fonctionner avec zéro, un ou plusieurs clubs départementaux éligibles. Aucun quota pour un département vide ; aucun match fictif pour un club seul. Les exemptions et quotas sont calculés sur les clubs actifs réellement disponibles.

### Recrutement et dynamique

Attractivité combinant force actuelle du club, division au moment du recrutement et parcours de la coupe précédente. La division donne un avantage durable ; une épopée peut le compenser partiellement. Affectations et mouvements sportifs réglés avant le mercato.

Différencier résultat absolu (classements, titres, promotions) et performance relative (recrutement, départs, licenciements, évaluation des entraîneurs). La performance relative tient compte du tour d'entrée et de la force attendue ; une entrée en quarts ne constitue pas un beau parcours automatique. Une victoire en coupe reste une réussite majeure.

Réexaminer les transferts définitifs, prêts, nouveaux joueurs et nominations d'entraîneurs. Réviser les bonus actuels de champions en distinguant vainqueur de coupe et champion national. Les formules et probabilités ne sont pas encore décidées.

### Interfaces et historiques

Afficher la division du club partout où elle aide à comprendre sa situation : tableaux de coupe, listes, fiches clubs, classements, mercato et historiques. Les couleurs de club indiquent sa division de la saison affichée ; les couleurs de phase décrivent séparément la phase de coupe. Fournir un libellé ou badge en complément de la couleur.

Vues des championnats avec quatre membres, classement, critères de départage et mouvements. Fiches clubs : historique annuel de la division, du championnat, de la place finale, du parcours en coupe, des titres et mouvements. Historiques joueurs et entraîneurs : division et place du club de cette année. Pour un joueur prêté, distinguer propriétaire et club où il joue. Ne jamais reconstruire un historique à partir de l'appartenance actuelle.

## Conséquences techniques à couvrir dans le plan

Séparer référentiel administratif et territoire sportif ; affectations annuelles ; comparateur de parcours partagé ; tirage de départage stable ; quotas et entrées par phase ; résolution des mouvements et vacances ; attractivité et performance relative ; archives et présentation.

Le moteur actuel déduit des phases du nombre de survivants et plusieurs vues utilisent des numéros de tours fixes. Ces hypothèses deviennent invalides avec les entrées différées. Auditer tous les consommateurs des tours et des anciens titres : statistiques, palmarès, fusions, créations de rivaux, entraîneurs, récompenses individuelles, exports/imports et résumés archivés.

Chaque archive conserve règles de version, affectations de la saison, classements finaux et départages. Les anciennes saisons ne doivent pas recevoir des divisions inventées ou des titres recalculés selon la V2.

## Décisions ouvertes

- [ ] Choisir la politique de sauvegardes V1 : lecture historique conservée et nouvelle partie V2, ou migration d'une carrière existante avec affectation initiale explicite.
- [ ] Définir précisément la sélection départemental → régional et le repêchage si le premier candidat est déjà promu ou a disparu dans une fusion.
- [ ] Fixer la répartition entière des quotas régionaux et la solution si quatre tours départementaux sont insuffisants : tour préliminaire exceptionnel ou autre ajustement du calendrier.
- [ ] Définir les situations extrêmes où l'obligation d'accueillir un promu et une arrivée géographique importante dépassent quatre places. Une descente de tous les membres ou un candidat déjà fusionné impose une règle cohérente ; aucun club ne doit occuper deux divisions ou disparaître silencieusement.
- [ ] Fixer l'ordre exact des fusions, promotions ordinaires, reclassements territoriaux et repêchages, pour éviter de libérer deux fois la même place.
- [ ] Définir les formules d'attractivité, les attentes selon le tour d'entrée et les licenciements ; traiter les très faibles nombres de matchs nationaux pour les joueurs et trophées.
- [ ] Fixer le départage de communes de population identique à l'initialisation et les règles de cumul des bonus de titres.

## Vérifications à effectuer

- Simuler l'initialisation réelle : 4 + 16 + 56 clubs distincts, toutes les communes affectées à une nouvelle région et une conférence.
- Vérifier les quotas par département et région, les tableaux régionaux 16q et les douze qualifiés par conférence.
- Vérifier les quinze tours, les trois entrées différées et les huit clubs nationaux ; examiner Paris sans participant local.
- Tester les fusions dans et entre niveaux/territoires, créations, trous, relégations concentrées et plusieurs saisons consécutives.
- Vérifier conservation des clubs, unicité d'appartenance, taille de quatre, promotions minimales et déterminisme après rechargement/export/import.
- Vérifier les historiques annuels après transferts, prêts et fusions ; couleur de la bonne saison dans toutes les vues.
- Tester les performances relatives d'un national éliminé en quarts, d'un départemental arrivé en quarts et d'un vainqueur issu de chaque niveau.
- Valider dans un navigateur les vues modifiées sur ordinateur et mobile, puis types, tests métier et build.

## État Git constaté

Le 7 octobre 2026, le dépôt local était initialisé sans commit ni distant ; package.json affiche 0.0.0. Le dépôt GitHub Damien6969/FootGame a ensuite été relié comme origin. Son ancien contenu sur main a été remplacé par l'état actuel de Coupe des communes, avec conservation de l'historique Git. main constitue le point de départ V1 ; codex/jeu-v2 porte cette conception et les futurs changements. L'identité Git locale reprend celle de l'ancien dépôt : Damien6969 et son adresse GitHub noreply. Aucune implémentation V2 n'a encore été réalisée.
