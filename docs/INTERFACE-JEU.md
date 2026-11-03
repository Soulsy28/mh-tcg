# La table de jeu — version 0.6.0

Le plateau utilise plus de largeur et conserve des cartes lisibles sur ordinateur. Sur un petit écran, le terrain défile horizontalement ; les cartes ne sont pas réduites à des miniatures. L’aperçu agrandi présente l’illustration, le coût, les statistiques et le texte de la carte. Il suit le survol et le focus clavier ; sélectionner une carte permet aussi de la lire au toucher. Les cartes cachées ne sont jamais proposées dans cet aperçu.

## Début du tour

Après les mains de départ, le jeu dégage les ressources, prend une ration dans la réserve de douze et pioche une carte. Chaque début de tour ne reçoit ces automatismes qu’une seule fois, y compris après une sauvegarde.

Les fenêtres de réponse et les capacités de début de tour restent prioritaires. En table libre, une capacité de début de tour présente sur le terrain demande une résolution manuelle, puis le bouton « Continuer : ration et pioche automatiques ». Le mode automatisé conserve les véritables déclenchements et réponses du moteur. La réserve vide ne crée aucune nouvelle ration.

## Jouer et payer

Maintenir le clic sur une carte jouable de la main, puis la glisser vers sa zone : Monstres dans la chasse partagée, Chasseurs dans le Camp, Objets persistants dans leur zone imprimée. Les Techniques et Objets immédiats disposent d’une zone distincte sous la main. Les zones autorisées sont indiquées pendant le geste. Approcher le pointeur des bords fait défiler la table pour atteindre une zone hors écran. Échap ou un dépôt hors zone annule le déplacement.

Le jeu recalcule l’action avant de la valider. Les choix et cibles nécessaires apparaissent avant le paiement. Le coût imprimé engage les rations disponibles, en utilisant d’abord les ressources temporaires éventuelles. Chaque ration engagée se tourne visuellement. Les boutons d’action restent utilisables sans glisser-déposer.

En table libre, glisser une carte paie son coût imprimé et la place dans la pile. Elle rejoint sa zone à la résolution, après les réponses. Le texte des effets, les conditions particulières et les coûts que le moteur ne reconnaît pas restent à vérifier et à appliquer manuellement. Les outils « Mettre en jeu par un effet », « Manger », ajout de ration et autres ajustements restent accessibles.

## Pile et capacités

La pile occupe une zone dédiée au-dessus du terrain. L'élément le plus récent apparaît en premier et porte la mention « Prochain à résoudre ». Les cartes jouées conservent leur illustration en couleur. Une capacité utilise une copie de sa carte en noir et blanc, sans modifier l'apparence de la source sur le terrain. Le survol et le clic donnent accès à l'aperçu agrandi.

Maintenir **F** et cliquer sur une carte publique ouvre les capacités qu'elle peut actuellement activer. S'il y en a plusieurs, le joueur choisit laquelle. Les éventuelles cibles et les coûts restent à confirmer avant de l'ajouter à la pile. Le raccourci ignore les champs de texte, les fenêtres déjà ouvertes et les cartes dont aucun effet n'est disponible. Les boutons du panneau d'actions offrent le même parcours sans raccourci clavier.

Le joueur actif reçoit la première priorité. Une capacité sans Réflexe demande son tour, une phase principale, aucun combat et une pile vide. Les capacités Réflexe peuvent répondre dans les fenêtres autorisées. Deux passages successifs résolvent le dernier élément ; chaque résolution redonne la possibilité de répondre. Une capacité annoncée reste dans la pile si sa source quitte le terrain.

Le mode automatisé conserve les seules capacités programmées et vérifie leurs cibles et coûts. En table libre, une résolution d'effet suspend la pile : son contrôleur utilise les outils, puis « Terminer la résolution manuelle ». La déclaration d'un déclenchement demande de vérifier que son événement s'est effectivement produit. Le raccourci ne transforme pas une capacité statique en effet activable.

## Flèches et points

Cliquer sur **Flèche**, puis sur la carte de départ et la carte d'arrivée. Les cartes publiques du terrain et les entrées de pile peuvent être reliées ; les mains et les decks restent exclus. Le tracé laisse les images visibles et cherche un passage autour des autres cartes. Échap annule le geste en cours. Les flèches sont des indications visuelles : elles ne déclenchent aucun effet et ne choisissent aucune cible à la place des boutons du jeu.

En ligne, les deux camps voient les flèches de chacun dans deux couleurs différentes. Chaque camp dispose de six flèches et d'un bouton pour effacer les siennes. Une flèche est retirée si l'une des cartes concernées quitte le terrain ou la pile. Le déplacement horizontal du terrain et les changements de taille recalculent les tracés.

Les deux scores figurent dans un bandeau en haut du plateau, avec l'objectif **6 points** et un repère sur le joueur actif. Le score de chaque zone de joueur reste également affiché.

## Pioche et historique

En table libre, cliquer sur son deck pioche une carte quand le joueur a la priorité ; cela sert aux effets manuels. Le bouton d’information séparé indique le nombre de cartes sans piocher. En mode automatisé, le clic ne contourne pas les règles : les pioches viennent du début de tour et des effets programmés.

Le carnet affiche les événements publics récents, avec les pseudos, quantités réellement piochées, rations ajoutées et ressources payées. Il ne cite pas l’identité des cartes piochées. En ligne, l’hôte valide les actions et transmet une vue propre à chaque joueur ; l’ordre des decks et la main adverse restent cachés.

Le test solo permet toujours de piloter les deux camps. Il ne comporte pas d’intelligence artificielle.
