# Sources géographiques

- `population-2023-france-hors-mayotte.zip` : Insee, populations de référence 2023 dans la géographie communale au 1er janvier 2025. Source : https://www.insee.fr/fr/statistiques/8680726
- `v_commune_2025.csv` : Insee, Code officiel géographique au 1er janvier 2025. Source : https://www.insee.fr/fr/information/8377162
- Mayotte : populations communales 2017, dernier recensement communal officiel disponible au moment de la constitution du référentiel. Source : https://www.insee.fr/fr/statistiques/3291775

Le fichier utilisé par l'application est produit avec :

```powershell
npm run build:data
```

Les communes de moins de 1 000 habitants et les subdivisions qui ne sont pas des communes sont exclues.
