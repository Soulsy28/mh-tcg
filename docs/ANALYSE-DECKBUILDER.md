# Refonte du deck builder MH TCG

Analyse du 2 novembre 2026. Périmètre : construction et gestion des decks, choix du Chef de chasse, recherche, lisibilité, accessibilité et comportement lorsque le catalogue s’agrandit.

## Décision proposée

Remplacer la liste déroulante des Chefs par une galerie accessible depuis une carte « Chef de chasse » et un bouton « Choisir / Changer ». Chaque Chef doit pouvoir être reconnu par son illustration, ses couleurs et son texte, puis sélectionné par une action explicite. La galerie possède sa propre recherche et ses filtres ; le nombre de Chefs affichés par page reste borné.

La sélection du Chef n’est qu’une partie du problème. Les gains les plus utiles viennent aussi de la conservation du contexte : voir son deck pendant la recherche, ajuster les quantités à proximité des cartes, comprendre les restrictions, annuler une modification et garder ses filtres, son défilement et son focus.

Il n’existe pas de disposition universellement « la plus intuitive ». Les décisions ci-dessous sont des hypothèses de conception motivées par l’audit et les références ; leur bénéfice doit être confirmé par des essais avec de vrais joueurs. Aucun gain chiffré de rapidité n’est annoncé sans mesure.

## Ce qui est observé dans la version actuelle

L’audit porte sur les fonctions `builder`, `filters`, `filtered`, `tile`, `mutateDeck` et `newDeck` de `dist/site.js`, ainsi que les règles de construction de `dist/deck-tools.js`.

| Observation dans le code actuel | Conséquence probable pour le joueur | Priorité |
| --- | --- | --- |
| Le choix du Chef est une liste de noms. Son illustration n’apparaît qu’après sélection. | Il faut connaître les noms ou modifier le deck pour découvrir un Chef. La difficulté augmente avec le catalogue. | P0 |
| Un nouveau deck reçoit automatiquement le Chef `202`. | Un débutant peut croire que ce Chef est imposé ou ne pas comprendre pourquoi certaines cartes sont masquées. | P0 |
| Le changement de Chef est appliqué immédiatement. Les cartes sont conservées, mais l’incompatibilité n’est expliquée qu’ensuite. | Le joueur découvre les conséquences après l’action ; corriger plusieurs cartes demande des recherches supplémentaires. | P0 |
| La liste du deck propose un retrait, tandis que l’ajout d’un exemplaire se fait depuis le catalogue. | Ajuster une carte déjà présente demande de changer de zone ou de la rechercher de nouveau. | P1 |
| Un ajout ou retrait sauvegarde puis reconstruit le contenu de la page. | Risque de perte de focus, de défilement ou de repère ; la lenteur effective reste à mesurer. | P1 |
| Recherche, couleur, type, coût, extension, tri et compatibilité occupent simultanément la zone de filtres. | Le point d’entrée le plus fréquent peut se perdre parmi les options. | P1 |
| Les filtres n’ont pas de résumé de sélection ni de remise à zéro visible. | Un résultat vide peut être interprété comme une carte manquante. | P1 |
| Certaines commandes sont de très petits boutons, en particulier sur mobile. | Retraits et ajouts peuvent être difficiles à viser. | P1 |
| La courbe des coûts et la validation existent déjà. | Les conserver et mieux les hiérarchiser apporte plus de valeur que d’ajouter des graphiques décoratifs. | P1 |
| Les règles empêchent déjà plus de 50 cartes, plus de trois exemplaires et les ajouts incompatibles avec le Chef. | Garder ces protections, tout en expliquant pourquoi un ajout est indisponible. | P0 |
| Le script de préparation exige exactement 203 cartes, sept Chefs et 205 images par langue. | Ajouter un huitième Chef aux données ferait échouer la publication, même avec une galerie extensible. | P0 technique |

Les conséquences de la deuxième colonne sont des inférences UX, pas les résultats d’une étude utilisateur déjà menée.

## Références comparées et portée de la recherche

Archidekt documente une recherche simple complétée par des réglages détaillés, un ajout rapide, la sauvegarde automatique et plusieurs présentations / groupements du deck. Pour MH TCG, cela justifie plusieurs moyens cohérents d’ajuster un deck sans imposer tous les réglages dès l’ouverture. Cela ne justifie pas de copier ses règles de Commander, ses catégories économiques ou ses ratios de cartes. [FAQ officielle Archidekt](https://archidekt.com/faq).

Moxfield présente officiellement la construction de decks, la recherche et plusieurs formats, dont Commander. Cette page confirme l’intérêt d’organiser l’outil autour du format joué ; elle ne permet pas d’affirmer le fonctionnement précis de tous ses écrans d’édition. Aucun comportement détaillé non observé de Moxfield n’est utilisé comme preuve ici. [Présentation officielle Moxfield](https://moxfield.com/).

Les heuristiques de Nielsen Norman Group recommandent des retours visibles, la reconnaissance des options, la prévention des erreurs et la possibilité d’annuler. Notre application : Chefs illustrés, total de cartes visible, conséquences d’un changement annoncées et retour arrière disponible. Ce sont des principes généraux, pas une preuve que notre nouveau dessin serait supérieur avant essai. [Heuristiques d’utilisabilité](https://www.nngroup.com/articles/ten-usability-heuristics/).

La présentation progressive réserve les fonctions moins fréquentes à un second niveau. Ici, la recherche, la compatibilité du Chef et le type restent proches du catalogue ; les réglages secondaires peuvent être regroupés dans une zone dépliable clairement nommée. Les filtres actifs restent visibles, même lorsque ce panneau est refermé. [Progressive Disclosure, Nielsen Norman Group](https://www.nngroup.com/articles/progressive-disclosure/).

## Parcours recommandé

### 1. Créer son deck

Le joueur donne un nom et choisit son Chef dans la galerie, ou reste dans un brouillon clairement signalé. Une préférence implicite pour le Chef `202` ne doit plus être présentée comme une décision du joueur. Les deux decks de départ restent un point d’entrée distinct pour découvrir le jeu.

La carte du Chef sélectionné reste visible dans le constructeur : illustration, nom, couleurs autorisées et bouton « Changer ». Son texte complet est consultable sans changer le Chef. Les couleurs doivent aussi être écrites ; sept pastilles seules ne suffisent pas à communiquer leur signification.

### 2. Explorer les Chefs

La galerie combine recherche bilingue par nom ou texte, filtre couleur et filtre extension. Les filtres se combinent ; une commande rétablit toutes les options. L’état vide indique les filtres actifs et permet de les retirer.

L’illustration seule ne révèle pas la capacité à un nouveau joueur. Une fiche d’aperçu présente donc le texte du Chef, les couleurs et son statut actuel d’automatisation. Ce dernier renseigne le mode de test disponible ; il ne retire jamais du choix les Chefs jouables sur table libre.

Pour anticiper l’agrandissement du catalogue, les Chefs sont issus des données, sans liste codée en dur. Une pagination ou un chargement par groupes garde un nombre borné de cartes dans le document. Revenir d’un aperçu conserve recherche, filtres et page. La pagination est un choix d’implémentation proposé, pas une obligation issue des références.

Cette extensibilité doit aussi concerner la préparation du site. Les limites historiques du catalogue initial doivent devenir des contrôles de cohérence des données : identifiants uniques, au moins un Chef, illustrations françaises et anglaises pour chaque carte et nombre d’images cohérent avec le catalogue. Les compteurs de l’interface sont calculés à partir des données. Le catalogue actuel reste inchangé ; les Chefs fictifs utilisés pour éprouver la croissance ne doivent pas être publiés.

### 3. Changer de Chef sans perdre son travail

Choisir un Chef dans la galerie ouvre un bilan avant toute modification si le deck contient des cartes incompatibles : nouveau Chef, nouvelles couleurs, nombre d’exemplaires concernés et liste des cartes.

Deux issues restent compréhensibles : conserver toutes les cartes dans un brouillon désormais incomplet, ou retirer explicitement les cartes incompatibles. Annuler ne change rien. Le libellé de confirmation précise la conséquence choisie ; aucun nettoyage silencieux n’est acceptable. Une action de retour arrière restaure le Chef et les quantités.

Le total de cartes affiché après retrait tient compte des exemplaires, pas uniquement du nombre de références : retirer trois exemplaires d’une carte enlève trois cartes du deck.

### 4. Construire et ajuster

Sur ordinateur, conserver catalogue et deck dans deux zones lisibles. La zone du deck expose le Chef, le total /50, l’état de sauvegarde, les erreurs de légalité utiles et la liste regroupée par type. Sur petit écran, une navigation claire entre catalogue et deck évite d’écraser les cartes dans des colonnes étroites ; le total et l’accès au deck restent faciles à retrouver.

Chaque carte présente des commandes + et − explicites et une quantité /3, dans le catalogue et la liste du deck. Le clic sur l’image sert à lire la carte ; il ne doit pas ajouter un exemplaire par surprise. Les raisons de blocage sont visibles : deck plein, maximum atteint ou couleurs incompatibles. La vue reste à la même position après une modification.

La recherche accepte les noms français et anglais, types et sous-types. La recherche dans le texte des capacités peut être ajoutée comme option identifiable ; elle ne doit pas élargir silencieusement les résultats lorsqu’un joueur cherche un nom précis. Le nombre de résultats, les filtres actifs et une action « Réinitialiser » expliquent un résultat vide.

La répartition des types et la courbe des coûts décrivent le deck. Elles ne prétendent pas calculer sa puissance. Aucun ratio « idéal » de Chasseurs, Monstres ou Objets n’est défini sans données de parties et validation du créateur.

## Accessibilité et interactions à conserver

Une galerie de cartes n’a pas besoin d’un rôle ARIA `grid` si elle consiste en boutons et fiches ordinaires. Utiliser des boutons HTML conserve une interaction clavier familière. Les commandes doivent avoir un nom explicite, un focus visible et un ordre de tabulation logique ; après une fermeture, le focus revient au contrôle d’ouverture. [W3C : interface clavier](https://www.w3.org/WAI/ARIA/apg/practices/keyboard-interface/).

Si le choix du Chef est un dialogue modal, le focus entre dans le dialogue, Tab y reste contenu, Échap permet de fermer et le reste de la page est inactif. Le titre est associé au dialogue. Un aperçu ne doit pas créer un empilement de fenêtres dont on ne sait plus sortir. [W3C : modèle de dialogue modal](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/).

Le minimum WCAG 2.2 pour une cible de pointage est de 24 × 24 pixels CSS, avec des exceptions, notamment d’espacement. Pour cet outil, viser des commandes principales de 36 à 44 pixels est une décision de confort tactile au-delà du strict minimum ; ce n’est pas une promesse de conformité complète. [W3C : taille des cibles](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html).

Les messages de sauvegarde, de résultat et d’erreur doivent être accessibles aux lecteurs d’écran sans forcer un déplacement du focus. Une petite région `role="status"` est adaptée aux confirmations utiles ; annoncer chaque modification de chaque compteur rendrait l’outil trop bavard. [W3C : messages d’état](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html).

Le changement FR/EN conserve le deck, les champs saisis et le contexte de la galerie. Les libellés et images suivent la langue ; identifiants de cartes, règles, sauvegardes et noms personnels ne sont pas traduits.

## Priorités de réalisation

| Priorité | Travail | Critère de réussite |
| --- | --- | --- |
| P0 | Galerie de Chefs issue du catalogue | Tout Chef ajouté aux données devient sélectionnable sans modifier l’interface. |
| P0 | Bilan avant changement incompatible | Annuler préserve exactement Chef, identifiants et quantités. Aucun retrait implicite. |
| P0 | Protections de construction conservées | Un 51e ajout, un quatrième exemplaire, un jeton et un ajout incompatible sont bloqués avec explication. |
| P1 | Ajustement direct du deck | Ajouter ou retirer un exemplaire depuis la liste du deck sans devoir le rechercher. |
| P1 | Recherche et filtres compréhensibles | Recherche bilingue, résumé des filtres, réinitialisation en une action. |
| P1 | Annuler et rétablir | Une modification ordinaire et un changement de Chef peuvent être restaurés sans changer les autres decks. |
| P1 | Conservation du contexte | Ajouter, retirer, changer de langue ou fermer un aperçu ne renvoie pas en haut du catalogue. |
| P1 | Contrôles accessibles | Parcours principal réalisable au clavier, focus visible, Échap ferme les dialogues ouverts. |
| P2 | Mesures sur catalogues agrandis | Recherche et rendu mesurés avec 7, 100 et 1 000 Chefs fictifs, sans publier ces données d’essai. |
| P2 | Statistiques plus détaillées | Ajouter uniquement celles dont l’interprétation est claire pour les joueurs. |

## Vérification et mesure

Ces critères sont des objectifs à vérifier pendant le développement et les essais, pas des résultats déjà obtenus par cette analyse.

1. **Nouveau joueur** : créer un deck, repérer les couleurs de son Chef, ajouter une carte et retrouver sa quantité sans tutoriel externe. Noter les hésitations et le nombre de demandes d’aide.
2. **Chef connu** : retrouver un Chef en français puis en anglais ; répéter avec 100 et 1 000 Chefs de test. Aucun parcours ne doit dépendre d’un long défilement d’une liste de noms.
3. **Changement de couleurs** : depuis un deck de 50 cartes, prévisualiser un Chef incompatible, annuler, puis confirmer en conservant le brouillon. Vérifier ensuite l’option de retrait explicite et son annulation.
4. **Quantités limites** : passer de deux à trois exemplaires, tenter le quatrième, retirer puis réajouter. À 50 cartes, expliquer le blocage ; après retrait, l’ajout redevient disponible.
5. **Recherche vide** : cumuler couleur, type et coût pour ne trouver aucun résultat ; identifier puis supprimer le filtre responsable sans perdre le deck.
6. **Retour arrière** : retirer une carte, annuler, rétablir, changer de deck puis revenir. Aucun historique ne doit modifier un autre deck ou un autre profil.
7. **Clavier** : ouvrir la galerie, rechercher, parcourir les choix, consulter un texte, choisir ou annuler, puis retrouver le contrôle d’ouverture.
8. **FR/EN** : changer la langue pendant une construction et dans la galerie. Quantités, filtre, page et nom personnel restent cohérents.
9. **Petit écran** : vérifier à 360 et 390 pixels de large que les commandes principales restent accessibles sans débordement horizontal de la page. Les illustrations conservent leur ratio.
10. **Sauvegarde** : recharger après une modification, vérifier la persistance exacte ; simuler un stockage indisponible et s’assurer que l’interface n’annonce pas une sauvegarde qui a échoué.

Objectifs de performance à mesurer sur un appareil de référence documenté : retour visuel d’une commande ordinaire inférieur à 200 ms dans le cas courant, recherche perçue sans blocage de saisie, et absence de reconstruction de milliers de vignettes lors d’un simple changement de quantité. Ces seuils sont des objectifs internes proposés ; ils ne constituent pas un benchmark issu des sources.

Pour comparer avant / après, reprendre les mêmes tâches avec quelques joueurs débutants et habitués, sur leurs appareils. Relever réussite sans aide, temps, erreurs, actions annulées, perte de repère et compréhension du changement de Chef. Les préférences déclarées complètent ces observations ; elles ne suffisent pas seules à prouver que le nouveau constructeur est plus efficace.

## Ce qui reste volontairement hors périmètre

Une recommandation stratégique automatique demanderait des parties représentatives et une modélisation fiable de toutes les capacités. L’affichage d’un score de « force du deck », de ratios prétendument optimaux ou de synergies garanties serait trompeur à ce stade. La priorité est une construction fiable, compréhensible et rapide, tout en conservant les règles actuelles : 50 cartes hors Chef, trois exemplaires maximum et couleurs autorisées par le Chef.

Les documents privés du créateur et leurs liens ne sont pas nécessaires à la publication de cette analyse.


## Réalisation et vérification de la version 0.4

Les recommandations prioritaires ont été mises en œuvre : galerie et recherche des Chefs, choix explicite à la création, bilan du changement, catalogue et deck côte à côte, contrôles de quantité, retour arrière, filtres actifs, pagination et statistiques descriptives. Les noms personnels, les identifiants, les règles et les decks existants sont préservés. La dernière sélection de deck est mémorisée par profil.

Les essais navigateur couvrent les deux langues, un deck existant de 50 cartes, un nouveau deck, les limites de quantité, la recherche de decks, le retour arrière après changement de Chef, et le retrait explicitement confirmé de cartes incompatibles. Le modèle et le rendu affichent 12 fiches par page dans un catalogue synthétique de 1 000 Chefs. Le test de préparation ajoute un Chef et ses deux images dans une copie isolée : le site n’impose plus sept Chefs. Ce test synthétique n’ajoute aucun contenu fictif au catalogue livré.

La nouvelle interface a été vérifiée sur grand écran et sur un affichage de 390 pixels : aucun débordement horizontal observé, commande d’accès au deck et navigation clavier opérationnelles. Les 126 tests automatisés complètent ces parcours. Les limites et le détail des contrôles se trouvent dans VERIFICATIONS.md.

Il s’agit d’une expertise de l’interface et d’une vérification fonctionnelle. Aucune étude avec plusieurs joueurs n’a encore démontré un gain de temps ou une baisse du taux d’erreur. Les scénarios et mesures proposés plus haut servent à vérifier ces hypothèses avec de vrais utilisateurs.
