# Vérification de la version 0.6.1

## Correction de Silas, carte 202

Les deux illustrations fournies le 3 novembre 2026 remplacent les versions précédentes. Elles ont été converties en WebP sans perte : les 744 × 1039 pixels décodés correspondent exactement aux PNG. Les nouveaux noms de fichiers empêchent une ancienne illustration conservée en cache de réapparaître. L'identifiant 202 est conservé ; le catalogue possède une nouvelle version pour les parties utilisant cet effet corrigé.

Le moteur automatisé déclenche maintenant le soin après Manger ou un retour du terrain dans la main du propriétaire, pour le joueur responsable de ce retour. Les deux événements partagent une seule utilisation par tour. Les Chasseurs et Monstres alliés sont des cibles légales, revérifiées à la résolution ; l'ancien soin après dégagement est supprimé. Les 215 tests passent, dont les nouveaux cas sur les deux événements, leur limite commune, les cibles, les changements de contrôle et les informations cachées après le retour d'Eva. La préparation du site valide toujours 203 cartes et 410 illustrations.

Dans le navigateur, la recherche Silas ouvre la nouvelle carte et le texte corrigé. Le passage FR/EN charge respectivement `assets/cards/202-r2.webp` et `assets/cards/en/202-r2.webp`, deux images décodées à 744 × 1039. Les textes correspondent aux deux versions fournies.

## Pile, flèches et points

Le 3 novembre 2026, les 203 tests et la préparation du site passent. Les nouveaux cas couvrent l'ordre LIFO, les deux passages, les fenêtres de réponse renouvelées, les coûts d'activation, les sources qui quittent le terrain, les contres sans remboursement, la reprise en pleine résolution et les confirmations réseau corrélées. Ils vérifient aussi les copies publiques de pile, les cartes cachées, les annotations, les raccourcis clavier et les traductions des nouvelles commandes.

Essai réel dans le navigateur : carte jouée dans la pile, résolution après deux passages, F + clic sur Eva, paiement par engagement et retour en main, copie grisée conservée, pause de résolution manuelle puis retrait de l'entrée. La flèche vers cette entrée est retirée avec elle. La version anglaise conserve la même partie et utilise les illustrations anglaises ; certaines descriptions avancées conservent leur clause canonique française, avec confirmation et aperçu de carte traduits.

Deux navigateurs reliés par WebRTC en mode réseau local ont partagé les mains de départ, une carte jouée, les passages, une copie de déclenchement, sa résolution manuelle, les rations et les scores. Les flèches se partagent dans deux couleurs, même hors priorité ; chaque camp n'efface que les siennes. Aucune erreur de console n'a été observée. Ce test local ne prétend pas valider une liaison entre deux réseaux Internet distincts.

À 390 px, le bandeau conserve les deux scores lisibles et la page ne déborde pas horizontalement ; le terrain et les étapes gardent leur défilement dédié. Le raccourci a été testé avec la touche F effectivement maintenue pendant le clic, puis en anglais. Les 410 illustrations de cartes restent présentes et validées.

Vérifications du 2 novembre 2026.

Accueil aléatoire vérifié le 3 novembre 2026 : trois images distinctes chargées ; aller-retour à la bibliothèque et bascule FR/EN conservent les trois identifiants et leur ordre ; les noms et images sont traduits. Une actualisation produit un nouveau tirage. Aucun changement de disposition, aucun nouveau stockage ni appel réseau de tirage. Les 161 tests existants et la préparation du site passent.

Publication vérifiée le 3 novembre 2026 : le workflow rétablit dans son dossier de construction les 24 fichiers de la mise à jour 0.5.1 envoyés à la racine du dépôt. La réparation compare les empreintes exactes, valide toutes les sources avant copie et préserve toute édition ultérieure à son emplacement normal. Sur une copie exacte des 475 fichiers distants, les 161 tests et la préparation passent. La publication GitHub Actions [41660360597](https://github.com/Soulsy28/mh-tcg/actions/runs/41660360597), commit `b7a2ff93170ad35aa90ce91f6e163f1bed24314d`, réussit. Le site GitHub Pages a été ouvert dans Chrome : `play.css` et `theme.css` chargés, accueil complet avec nouveau thème, aucune erreur de console. Le lien portant `?v=b7a2ff9` renouvelle la page conservée en cache. Les copies déposées à la racine restent dans le dépôt ; leur remise aux chemins attendus se fait dans la construction publiée.

Version 0.5.1 : habillage visuel ajouté dans une feuille séparée, textures SVG originales locales, boutons et panneaux harmonisés. Comparaison des fichiers : les douze modules JavaScript et les quatre feuilles de structure sont identiques à la version 0.5. Les 161 tests existants passent et la préparation vérifie aussi la présence des deux textures. L’accueil, la galerie des Chefs, la reprise d’une partie, les états de sélection et les libellés FR/EN ont été inspectés dans le navigateur. À 390 px, l’accueil et le builder ne débordent pas horizontalement ; la commande mobile du deck reste disponible. Les références officielles et les choix de contraste sont décrits dans `docs/DIRECTION-ARTISTIQUE.md`.

Version 0.5 : pioche au clic sur le deck en table libre, début du premier tour et passage au tour suivant avec ration et pioche uniques, déplacement réel à la souris d’un Petit Monstre vers la chasse, engagement visuel de la ration correspondante et historique du paiement vérifiés dans le navigateur. L’aperçu montre l’image, le texte et les statistiques ; la bascule FR/EN conserve la partie et charge l’illustration traduite. Vérifications d’affichage à 1440 px et à 390 px : aucune largeur supplémentaire sur la page mobile, terrain défilant à l’intérieur du plateau et cartes conservant leur taille.

Les nouveaux tests couvrent les gestes souris et tactiles, les mauvaises zones, les coûts insuffisants, les cibles de remplacement, les annulations, les mises à jour distantes, les sauvegardes anciennes, les effets prioritaires de début de tour, la conservation des douze rations et les événements publics en ligne. Le clic sur un deck ne crée aucune pioche libre dans le moteur automatisé. La liaison sur Internet entre deux réseaux distincts n’a pas été retestée pour cette version ; les contrôles d’autorité, de révision et de confidentialité passent dans les tests de protocole.

161 tests automatisés passent pour cette version, y compris le défilement pendant un déplacement et l’arrêt de toutes ses animations lors d’une annulation. La préparation finale du site réussit avec les 410 images de cartes et la nouvelle image de ration, sans modifier le catalogue des decks.

Version 0.4 : galerie des Chefs, recherche/couleurs/extensions, création sans Chef imposé, bilan des incompatibilités, conservation ou retrait explicite, annuler/rétablir, quantités +/−, limites à 50 cartes et 3 exemplaires, gestion/recherche des decks et reprise du dernier deck vérifiés dans le navigateur. Interface FR/EN et recherche conservée après changement de langue. Navigation clavier des onglets et affichage de 390 px sans débordement horizontal vérifiés ; le bouton mobile place le focus sur le deck. Le modèle et le rendu de galerie ont été éprouvés avec 1 000 Chefs synthétiques, avec seulement 12 fiches affichées par page. Une préparation isolée accepte un Chef supplémentaire avec ses deux images, refuse les images absentes et les identifiants en double, et renouvelle les adresses des ressources modifiées.

126 tests automatisés réussissent : règles de base et cartes du sous-ensemble automatisé, parties complètes, table libre, profils locaux et séparation des sauvegardes, recherche et validation des decks, protocole P2P, droits des joueurs, masquage des cartes cachées et langue de présentation.

La version 0.3 a été vérifiée dans le navigateur : passage FR/EN et retour, langue conservée après rechargement, chargement des illustrations anglaises, recherche « elder dragon » renvoyant les six cartes attendues, détails anglais d’une carte, conservation des noms personnels de profil et de deck (« Accueil » reste « Accueil »), début d’une partie automatisée et conservation de la même carte sélectionnée lors d’un changement de langue. Les 205 illustrations anglaises ont été décodées et vérifiées, en plus des 205 françaises. Les textes de règles anglais viennent du catalogue validé ; certains messages avancés du moteur sans traduction dédiée restent en français.

Les parcours suivants avaient également été utilisés dans le navigateur pour la version 0.2 ; ils restent couverts par les tests de cette mise à jour :

- Création de profils distincts avec pseudo et mot de passe, sans email.
- Présence des deux decks de départ sauvegardés.
- Recherche du sous-type Dragon Ancien, renvoyant les six cartes correspondantes du catalogue actuel.
- Lancement d'un test solo, choix des deux mains de départ et début du premier tour.
- Échange réel des codes WebRTC entre deux onglets du navigateur intégré, sans STUN ni serveur de signalisation pour ce test local.
- Ouverture de la table sur les deux onglets, main personnelle distincte et absence de sélecteur pour consulter la main adverse.
- Transmission des décisions de conservation de main, annonce de fin de tour et passages ; les deux onglets affichent le même tour suivant.

Cette vérification locale ne garantit pas une connexion directe entre toutes les connexions Internet. Les réseaux restrictifs peuvent demander un relais TURN. Dans le Chrome de l'environnement de vérification, aucune adresse ICE n'était fournie ; le site signale désormais ce cas et ne produit plus de code inutilisable. Les politiques du navigateur n'ont pas été modifiées.

Le mode automatisé couvre 37 cartes et Chefs. La table libre accepte tout le catalogue mais laisse les capacités particulières à résoudre aux joueurs. Le mode solo permet de piloter les deux camps ; il ne comporte pas d'adversaire informatique.
