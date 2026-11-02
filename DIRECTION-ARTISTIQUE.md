# Habillage de la Guilde — version 0.5.1

Étude et adaptation du 2 novembre 2026, réalisées à partir des sites officiels Capcom.

## Références visuelles

- [Monster Hunter Wilds — Chasse](https://www.monsterhunter.com/wilds/fr/hunting/) : fonds de parchemin brun dans les sections de techniques, motifs circulaires, lignes décoratives fines, titres à empattements et accents dorés. Le site associe ces matières à de grandes images de nature et de chasse.
- [Monster Hunter Rise: Sunbreak — Une expérience de chasse améliorée](https://www.monsterhunter.com/rise-sunbreak/fr/action/) : matières sombres rouge et noir, titres encadrés de filets métalliques, formes rectangulaires et extrémités géométriques.

## Adaptation au jeu de cartes

La proposition conserve l’organisation des écrans et les interactions existantes. Les références servent à choisir les matières et les accents : parchemin clair sur les pages, bleu encre et charbon dans la navigation et sur le plateau, bronze pour les cadres, or pour les actions mises en avant. Cette palette est une adaptation au simulateur, pas une reproduction exacte d’un de ces sites.

Les commandes restent à leur place. Les grilles, tailles des cartes, zones de dépôt, mécanismes d’engagement et fenêtres de jeu ne sont pas modifiés par le thème. Les couleurs des cartes et des biomes, les erreurs et les indications de validité gardent leur sens.

La feuille `dist/theme.css` est chargée après les styles de structure. Les fonds `cartography.svg` et `grain.svg` sont des dessins originaux légers ; aucun chargement externe n’est nécessaire pour afficher l’habillage. Les illustrations des cartes existantes restent utilisées.

## Lisibilité

Les textes courants sont foncés sur parchemin ; les textes du plateau et de la navigation sont clairs sur les matières sombres. Les paires de référence ont les contrastes suivants : texte #282e2c sur panneau #f3ead4, 11,55:1 ; secondaire #655e50 sur panneau #f3ead4, 5,36:1 ; crème #f3ead4 sur bleu #243c43, 9,73:1. Ces mesures décrivent les aplats de référence avant les très légères textures. L’or sur parchemin sert aux décors plutôt qu’au texte courant. Les libellés d’erreur et de suppression sont assombris, avec une couleur rouge conservée. Le focus clavier, les survols et les états sélectionnés restent visibles.
