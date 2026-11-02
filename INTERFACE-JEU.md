# La table de jeu — version 0.5

Le plateau utilise plus de largeur et conserve des cartes lisibles sur ordinateur. Sur un petit écran, le terrain défile horizontalement ; les cartes ne sont pas réduites à des miniatures. L’aperçu agrandi présente l’illustration, le coût, les statistiques et le texte de la carte. Il suit le survol et le focus clavier ; sélectionner une carte permet aussi de la lire au toucher. Les cartes cachées ne sont jamais proposées dans cet aperçu.

## Début du tour

Après les mains de départ, le jeu dégage les ressources, prend une ration dans la réserve de douze et pioche une carte. Chaque début de tour ne reçoit ces automatismes qu’une seule fois, y compris après une sauvegarde.

Les fenêtres de réponse et les capacités de début de tour restent prioritaires. En table libre, une capacité de début de tour présente sur le terrain demande une résolution manuelle, puis le bouton « Continuer : ration et pioche automatiques ». Le mode automatisé conserve les véritables déclenchements et réponses du moteur. La réserve vide ne crée aucune nouvelle ration.

## Jouer et payer

Maintenir le clic sur une carte jouable de la main, puis la glisser vers sa zone : Monstres dans la chasse partagée, Chasseurs dans le Camp, Objets persistants dans leur zone imprimée. Les Techniques et Objets immédiats disposent d’une zone distincte sous la main. Les zones autorisées sont indiquées pendant le geste. Approcher le pointeur des bords fait défiler la table pour atteindre une zone hors écran. Échap ou un dépôt hors zone annule le déplacement.

Le jeu recalcule l’action avant de la valider. Les choix et cibles nécessaires apparaissent avant le paiement. Le coût imprimé engage les rations disponibles, en utilisant d’abord les ressources temporaires éventuelles. Chaque ration engagée se tourne visuellement. Les boutons d’action restent utilisables sans glisser-déposer.

La table libre laisse les capacités et coûts supplémentaires à résoudre manuellement. Glisser une carte y applique l’action « Jouer », sans interpréter ces textes. Les outils « Mettre en jeu par un effet », « Manger », ajout de ration et autres ajustements restent accessibles.

## Pioche et historique

En table libre, cliquer sur son deck pioche une carte quand le joueur a la priorité ; cela sert aux effets manuels. Le bouton d’information séparé indique le nombre de cartes sans piocher. En mode automatisé, le clic ne contourne pas les règles : les pioches viennent du début de tour et des effets programmés.

Le carnet affiche les événements publics récents, avec les pseudos, quantités réellement piochées, rations ajoutées et ressources payées. Il ne cite pas l’identité des cartes piochées. En ligne, l’hôte valide les actions et transmet une vue propre à chaque joueur ; l’ordre des decks et la main adverse restent cachés.

Le test solo permet toujours de piloter les deux camps. Il ne comporte pas d’intelligence artificielle.
