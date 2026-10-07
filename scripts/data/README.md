# Sources du catalogue des identités

`npm run build:names` fabrique `src/features/persons/data/identities.json` et copie les drapeaux locaux.
Le jeu fonctionne ensuite sans réseau et n’importe aucune bibliothèque Faker à l’exécution.

- **Prénoms** : INSEE, fichier des prénoms 2025, naissances masculines 1900–2025 par région. [Page source](https://www.insee.fr/fr/statistiques/8595130?sommaire=8595113). Le ZIP est téléchargé dans `data/names-sources/`, ignoré par Git. Son SHA-256 est conservé dans les métadonnées du catalogue.
- **Patronymes et prénoms complémentaires** : [Faker](https://fakerjs.dev/guide/localization), version du verrou npm, locales française, allemande, espagnole, italienne, portugaise, polonaise, turque et vietnamienne. Licence MIT, copie dans `public/flags/LICENSE-faker.txt`.
- `regional-surnames.json` reprend les patronymes régionaux de l’ancien jeu. Ce catalogue éditorial n’est pas une mesure de leur fréquence.
- `country-names.json` contient des exemples éditoriaux pour l’Algérie, le Maroc, la Tunisie, le Sénégal, le Cameroun et la Côte d’Ivoire. Ils illustrent des profils fictifs ; ils ne constituent pas un registre d’état civil ni un classement de fréquence.
- **Drapeaux** : [flag-icons](https://github.com/lipis/flag-icons), licence MIT, copie dans `public/flags/LICENSE-flag-icons.txt`. Seuls les pays utilisés sont copiés.

## Construction et limites

Les prénoms sont regroupés en cohortes : 1900–1969, 1970–1989, 1990–1999, 2000–2009, 2010–2019 et 2020–2025. Les fréquences INSEE sont arrondies au multiple de cinq et soumises à un seuil de diffusion. Le catalogue conserve au moins 90 % des effectifs publiés de chaque région/cohorte et 98 % de leur agrégation nationale. Ces taux concernent les données publiées, pas l’ensemble des naissances réelles. Les couples indice/effectif sont encodés en base 36 sans perte.

Le tirage des prénoms français mélange 80 % de fréquence régionale et 20 % de fréquence nationale. Une région ou une cohorte régionale absente utilise le catalogue national. Les années postérieures à 2025 utilisent la dernière cohorte connue. Les patronymes restent des catalogues de synthèse : leurs probabilités ne sont pas des statistiques INSEE.

Les profils de nationalité, leurs proportions et leurs variations territoriales sont définis dans `src/config/personIdentity.ts`. Ce sont des réglages narratifs du jeu. Ils ne mesurent ni l’origine des habitants, ni leur citoyenneté réelle. Un prénom n’est jamais analysé pour attribuer une nationalité. Les traits sportifs ne dépendent pas de la nationalité.

Pour reconstruire à l’identique, conserver le ZIP dont l’empreinte est indiquée dans les métadonnées et utiliser le verrou npm. Pour actualiser la source, modifier explicitement l’URL/version dans le script puis reconstruire le catalogue.
