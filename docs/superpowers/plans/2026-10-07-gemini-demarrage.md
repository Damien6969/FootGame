# Prompt de démarrage Gemini — lot 1

Copier le texte ci-dessous dans Gemini. Choisir son modèle de code le plus capable disponible avec un raisonnement approfondi si ce réglage existe ; aucune version précise n'est imposée.

---

Tu interviens sur le projet Coupe des communes, dépôt https://github.com/Damien6969/FootGame. La branche main conserve la V1. Tout le travail V2 doit se faire sur codex/jeu-v2.

Commence par vérifier la branche, l'état Git et les instructions AGENTS.md applicables. Si des changements locaux sont présents, conserve-les ; ne fais pas de reset, clean ou écrasement. Ne crée pas un projet neuf et ne réinstalle pas les dépendances si elles sont déjà présentes.

Lis intégralement :
1. docs/superpowers/specs/2026-10-07-jeu-v2-design.md
2. docs/superpowers/plans/2026-10-07-jeu-v2-gemini.md

Réalise uniquement le LOT 1 : nouvelles régions sportives, modèle annuel des divisions, initialisation par population et persistance d'une nouvelle partie V2. Ne code pas encore le championnat national joué, la nouvelle coupe, les promotions ou le mercato.

Les 14 nouvelles régions remplacent les regroupements sportifs, avec conservation séparée des codes administratifs sources. Il faut quatre clubs nationaux, puis quatre clubs par conférence parmi les restants, puis quatre clubs par nouvelle région parmi les restants : 76 clubs distincts, tous les autres au départemental. Une seule équipe par commune à l'initialisation. La V2 commence par une nouvelle partie, sans migration ni effacement des sauvegardes V1.

Inspecte les flux existants avant de choisir les changements. Exécute les tests/build initiaux et consigne les échecs préexistants. Ajoute des tests métier d'abord, constate leur échec, puis implémente. Si deux communes ont exactement la même population à une limite de sélection, propose un départage explicite avant de l'intégrer. Les autres règles ouvertes de la spec ne bloquent pas la modélisation du lot 1 ; ne les invente pas.

Valide l'initialisation sur les données réelles, les comptes 4/16/56, l'unicité d'appartenance, la géographie, la stabilité et sauvegarde/rechargement. Lance les vérifications du lot. Fais un commit ciblé sur codex/jeu-v2, sans inclure sauvegardes/, scratch/ ou work/ et sans modifier main. Ne passe pas au lot 2.

Termine par un compte rendu bref : fichiers/règles modifiés, commandes réellement exécutées et résultats, erreurs préexistantes ou nouvelles, décisions en attente et hash du commit.
