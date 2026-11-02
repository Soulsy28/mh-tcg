# Vérification de la version 0.2

Vérifications du 2 novembre 2026.

98 tests automatisés réussissent : règles de base et cartes du sous-ensemble automatisé, parties complètes, table libre, profils locaux et séparation des sauvegardes, recherche et validation des decks, protocole P2P, droits des joueurs et masquage des cartes cachées.

Les parcours suivants ont également été utilisés dans le navigateur :

- Création de profils distincts avec pseudo et mot de passe, sans email.
- Présence des deux decks de départ sauvegardés.
- Recherche du sous-type Dragon Ancien, renvoyant les six cartes correspondantes du catalogue actuel.
- Lancement d'un test solo, choix des deux mains de départ et début du premier tour.
- Échange réel des codes WebRTC entre deux onglets du navigateur intégré, sans STUN ni serveur de signalisation pour ce test local.
- Ouverture de la table sur les deux onglets, main personnelle distincte et absence de sélecteur pour consulter la main adverse.
- Transmission des décisions de conservation de main, annonce de fin de tour et passages ; les deux onglets affichent le même tour suivant.

Cette vérification locale ne garantit pas une connexion directe entre toutes les connexions Internet. Les réseaux restrictifs peuvent demander un relais TURN. Dans le Chrome de l'environnement de vérification, aucune adresse ICE n'était fournie ; le site signale désormais ce cas et ne produit plus de code inutilisable. Les politiques du navigateur n'ont pas été modifiées.

Le mode automatisé couvre 37 cartes et Chefs. La table libre accepte tout le catalogue mais laisse les capacités particulières à résoudre aux joueurs. Le mode solo permet de piloter les deux camps ; il ne comporte pas d'adversaire informatique.
