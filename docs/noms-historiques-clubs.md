# Noms de clubs dans les carrières

Le nom d'un club dans une carrière doit correspondre à la saison affichée. Un renommage ou une fusion ultérieure ne doit pas remplacer rétroactivement ce nom.

La résolution partagée des carrières applique cette priorité :

1. Instantané du club dans l'archive exacte de la saison, sinon nom des performances de cette archive.
2. Pour la saison active non archivée, nom du club de la session actuelle.
3. Sans instantané fiable, historique enregistré et règles de reconstitution des anciennes fusions.

Les noms d'alliances historiques sont conservés comme les autres noms. Le résultat fournit également un objet club portant ce nom daté, afin que les liens affichent le même libellé que les textes.

La règle s'applique aux carrières et parcours des personnes, aux détails de titres calculés depuis ces carrières et aux noms des clubs propriétaires lors des prêts. Le club prêteur est résolu par son identifiant et sa saison ; le lieu de naissance du joueur ne doit pas intervenir dans cette résolution.

À la transition entre saisons, les noms du club joué et du club propriétaire sont enregistrés depuis l'archive terminée avant d'utiliser les clubs de la nouvelle saison. Les archives anciennes ne sont pas réécrites.

Les anciennes sauvegardes sans nom ni instantané daté peuvent nécessiter une reconstitution ; aucun nom absent ne peut être garanti. Les autres vues historiques doivent également utiliser leur instantané de saison, plutôt que le catalogue actuel des clubs. Ce correctif n'introduit pas une nouvelle table de noms ni une migration des résumés de palmarès.
