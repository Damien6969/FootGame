# Identité des clubs

Sur une fiche club, **Personnaliser le club** permet d’importer un logo (PNG, JPG, WebP, 5 Mo maximum), de choisir deux couleurs par sélecteur ou code hexadécimal, ou d’utiliser une palette assortie. Trois écussons fictifs sont proposés pour les essais. Les modifications ne sont appliquées qu’après enregistrement ; retirer le logo ou revenir à l’identité par défaut reste possible dans ce panneau.

Les logos sont redimensionnés à 256 pixels maximum, avec leurs proportions et leur transparence. Sans image, un écusson d’initiales utilise une palette stable liée à l’identifiant du club. Les textes sur les couleurs choisies utilisent le noir ou le blanc selon le meilleur contraste ; les liens du bandeau sont éclaircis si nécessaire. Les fonds de lecture restent sombres et légèrement teintés.

L’identité est un champ optionnel `Club.identity`, conservé dans la carrière, les archives complètes et les exports existants. Les anciennes sauvegardes utilisent la palette par défaut sans migration. Une fusion conserve l’identité du club siège ; les nouveaux clubs disposent de leur propre palette. La fiche d’un joueur suit son club d’affectation actuel, y compris pendant un prêt.

Modules : `clubIdentity.ts` (palettes, validation, contraste), `importClubLogo.ts` (import), `ClubBadge.tsx` (écusson), `ClubIdentityEditor.tsx` (édition), `club-identity.css` (présentation). Aucun changement des règles de simulation.
