# Table libre

`dist/table.js` expose `window.MHTable` et `module.exports` pour les tests. Ce moteur est indépendant de `MHEngine` et ne prétend pas exécuter les capacités du catalogue complet.

Les deux moteurs ont les mêmes méthodes principales : `createGame(catalog, options)`, `getActions(state, catalog)`, `dispatch(state, action, catalog)`, `stats(state, uid, catalog)`, `validateDeck(deck, catalog)` et `getCard(catalog, id)`. `MHTable` accepte les 203 cartes et les 7 Chefs. Il valide les 50 cartes, trois exemplaires maximum, couleurs du Chef et exclusion des jetons du deck.

L'état comporte `mode: "manual"`, `engine: "MHTable"` et une notice explicite. L'interface doit afficher « Table libre : effets des cartes à résoudre manuellement » durant toute la partie.

## Début et tour

La partie débute par les deux décisions de mulligan. Le début de tour dégage les cartes du joueur, ajoute une ration depuis sa réserve et pioche une carte automatiquement, une seule fois. Surmenage manuel saute le prochain dégagement de la carte. Si une carte publique du joueur possède une capacité de début de tour à résoudre manuellement, la table reste en `phase: "start"` avant la ration et la pioche ; le joueur la résout puis utilise `continue`. Ce délai permet notamment de vérifier une victoire de début de tour avant une éventuelle défaite à la pioche. Une ancienne sauvegarde en phase `start` reprend aussi par cette action canonique.

Les actions normales s'appliquent au joueur de `priorityPlayer`. Le bouton `pass` donne la main à l'autre joueur et permet de répondre. La fin du tour n'est proposée qu'au joueur actif ayant la priorité.

## Paiements et capacités

`play` paie le coût imprimé et place la carte dans la pile. Après deux passages successifs, un permanent rejoint sa zone : les Objets arrivent dégagés et les créatures engagées, sauf Préparé explicite en tête du texte. Un sixième Chasseur exige un remplacement qui n'est pas une mort. Pour un Objet ou une Technique immédiate, la table suspend la résolution : le joueur applique le texte avec les outils puis utilise `finish-resolution`, qui place la carte en défausse.

`ability` annonce une capacité activée reconnue dans le texte de la carte ; `manual-trigger` déclare un déclenchement dont les joueurs confirment l'événement et les conditions. Les capacités statiques ne deviennent pas activables. F + clic utilise ces mêmes actions canoniques. Une capacité sans Réflexe demande le tour actif, une phase principale, une pile vide et aucun combat. Les capacités Réflexe utilisent les fenêtres de réponse ; le joueur actif obtient la première priorité après une annonce ou une résolution.

Les coûts reconnus avant les deux-points (ressources, engagement, Manger, marqueurs, défausse, sacrifice ou retour en main selon la carte) sont payés à l'annonce, après les choix. Les conditions et coûts avancés restent à vérifier manuellement. L'entrée de pile conserve une copie de sa source : la capacité continue d'exister si cette source quitte le terrain. Les effets sont résolus du dernier au premier, après deux passages successifs ; chaque résolution ouvre une nouvelle fenêtre de réponse. Pendant une résolution manuelle, seules les commandes de résolution restent disponibles, puis `finish-resolution` poursuit le jeu.

Un effet qui contre un élément peut utiliser la commande de contre manuel pendant sa résolution, après vérification du texte. La carte contrée va en défausse ; une capacité est retirée de la pile. Les coûts déjà payés ne sont pas rendus.

`place` fournit une mise en jeu ou une résolution sans paiement automatique, afin de traiter manuellement une réduction de coût, une capacité qui place une carte ou un autre effet. Les joueurs disposent de commandes distinctes de paiement en rations, Manger et ressources temporaires.

Les textes d'effets, mots-clés conditionnels, déclenchements, effets différés et conditions de victoire des cartes ne sont pas exécutés automatiquement. Des commandes explicites permettent d'ajuster les blessures, Force et Cuirasse du tour, marqueurs, états, points, retours en main, sacrifices et jetons. Une victoire par capacité peut être déclarée manuellement après vérification par les joueurs.

## Combat

Le combat de base oppose un Chasseur dégagé à un Monstre de la zone partagée. Il possède une fenêtre d'Interposition, puis une fenêtre avant blessures, chacune fermée par deux passages successifs. Une seule Interposition peut être activée. Les conditions particulières du texte et Provocation sont vérifiées manuellement par les joueurs. Les blessures de Force sont ensuite simultanées. La Cuirasse ajoutée par l'outil manuel réduit les blessures positives jusqu'à un minimum de un.

Les blessures de combat, morts et point des Grands Monstres sont calculés automatiquement. Les capacités de mort et de fin de combat sont à résoudre manuellement. Un départ du terrain interrompt le combat. La Grande bombe baril n'est pas traitée comme une fausse créature : sa séquence peut être reproduite avec engagement manuel du Chasseur, sacrifice de la bombe et blessures d'effet.

## Autorité et informations privées

`dispatch` recalcule les actions proposées avant de vérifier le joueur, la source, les cibles et le choix. Il retourne un nouvel état sans modifier le précédent. Les commandes de main, deck et défausse concernent seulement le joueur ayant la priorité ; aucune identité de carte cachée adverse n'est proposée dans les actions. Les ajustements du terrain public sont accessibles au joueur ayant la priorité pour résoudre ses effets.

En ligne, l'hôte conserve l'état complet et doit filtrer les vues et actions reçues par l'autre navigateur. La table libre suppose des joueurs de confiance ; elle n'est pas un arbitrage automatique des capacités ni un système de compétition contre la triche.

Les copies de capacités sont publiques, mais les snapshots complets ne sont pas envoyés : une carte revenue en main reste cachée. `MHMatch` gère les annotations visuelles séparément des actions de règles, avec six flèches publiques par joueur et retrait des liens dont une extrémité quitte le terrain ou la pile. Les annotations ne modifient jamais la priorité. L'invité attend une confirmation corrélée à son action pour éviter les doubles validations ; une révision reçue pour une autre action ne suffit pas.

## Vérification

Exécuter `npm test`. Les tests de table et d’automatisation des tours couvrent la validation de tout le catalogue, les identifiants canoniques, le mulligan, les étapes du tour, l’absence de double ration/pioche, les effets de début de tour, la conservation des rations, les limites de Camp, l’arrivée des cartes, le combat simultané, l’Interposition unique, les interruptions, les outils manuels, les jetons, la victoire et la sérialisation.
