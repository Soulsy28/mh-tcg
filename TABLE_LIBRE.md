# Table libre

`dist/table.js` expose `window.MHTable` et `module.exports` pour les tests. Ce moteur est indépendant de `MHEngine` et ne prétend pas exécuter les capacités du catalogue complet.

Les deux moteurs ont les mêmes méthodes principales : `createGame(catalog, options)`, `getActions(state, catalog)`, `dispatch(state, action, catalog)`, `stats(state, uid, catalog)`, `validateDeck(deck, catalog)` et `getCard(catalog, id)`. `MHTable` accepte les 203 cartes et les 7 Chefs. Il valide les 50 cartes, trois exemplaires maximum, couleurs du Chef et exclusion des jetons du deck.

L'état comporte `mode: "manual"`, `engine: "MHTable"` et une notice explicite. L'interface doit afficher « Table libre : effets des cartes à résoudre manuellement » durant toute la partie.

## Début et tour

La partie débute par les deux décisions de mulligan. Le début de tour dégage les cartes du joueur, ajoute une ration depuis sa réserve et pioche une carte automatiquement, une seule fois. Surmenage manuel saute le prochain dégagement de la carte. Si une carte publique du joueur possède une capacité de début de tour à résoudre manuellement, la table reste en `phase: "start"` avant la ration et la pioche ; le joueur la résout puis utilise `continue`. Ce délai permet notamment de vérifier une victoire de début de tour avant une éventuelle défaite à la pioche. Une ancienne sauvegarde en phase `start` reprend aussi par cette action canonique.

Les actions normales s'appliquent au joueur de `priorityPlayer`. Le bouton `pass` donne la main à l'autre joueur et permet de répondre. La fin du tour n'est proposée qu'au joueur actif ayant la priorité.

## Paiements et capacités

`play` paie seulement le coût imprimé et place la carte dans sa zone. Les Objets et Techniques immédiats sont défaussés sans exécuter leur texte. Les permanents arrivent dans leur zone ; les Objets arrivent dégagés et les créatures engagées, sauf Préparé explicite en tête du texte. Un sixième Chasseur exige un remplacement qui n'est pas une mort.

`place` fournit une mise en jeu ou une résolution sans paiement automatique, afin de traiter manuellement une réduction de coût, une capacité qui place une carte ou un autre effet. Les joueurs disposent de commandes distinctes de paiement en rations, Manger et ressources temporaires.

Aucun mot-clé conditionnel, déclenchement, effet différé, coût supplémentaire ou condition de victoire de carte n'est appliqué automatiquement. Des commandes explicites permettent d'ajuster les blessures, Force et Cuirasse du tour, marqueurs, états, points, retours en main, sacrifices et jetons. Une victoire par capacité peut être déclarée manuellement après vérification par les joueurs.

## Combat

Le combat de base oppose un Chasseur dégagé à un Monstre de la zone partagée. Il possède une fenêtre d'Interposition, puis une fenêtre avant blessures, chacune fermée par deux passages successifs. Une seule Interposition peut être activée. Les conditions particulières du texte et Provocation sont vérifiées manuellement par les joueurs. Les blessures de Force sont ensuite simultanées. La Cuirasse ajoutée par l'outil manuel réduit les blessures positives jusqu'à un minimum de un.

Les blessures de combat, morts et point des Grands Monstres sont calculés automatiquement. Les capacités de mort et de fin de combat sont à résoudre manuellement. Un départ du terrain interrompt le combat. La Grande bombe baril n'est pas traitée comme une fausse créature : sa séquence peut être reproduite avec engagement manuel du Chasseur, sacrifice de la bombe et blessures d'effet.

## Autorité et informations privées

`dispatch` recalcule les actions proposées avant de vérifier le joueur, la source, les cibles et le choix. Il retourne un nouvel état sans modifier le précédent. Les commandes de main, deck et défausse concernent seulement le joueur ayant la priorité ; aucune identité de carte cachée adverse n'est proposée dans les actions. Les ajustements du terrain public sont accessibles au joueur ayant la priorité pour résoudre ses effets.

En ligne, l'hôte conserve l'état complet et doit filtrer les vues et actions reçues par l'autre navigateur. La table libre suppose des joueurs de confiance ; elle n'est pas un arbitrage automatique des capacités ni un système de compétition contre la triche.

## Vérification

Exécuter `npm test`. Les tests de table et d’automatisation des tours couvrent la validation de tout le catalogue, les identifiants canoniques, le mulligan, les étapes du tour, l’absence de double ration/pioche, les effets de début de tour, la conservation des rations, les limites de Camp, l’arrivée des cartes, le combat simultané, l’Interposition unique, les interruptions, les outils manuels, les jetons, la victoire et la sérialisation.
