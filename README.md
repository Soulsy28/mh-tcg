# MH TCG La Guilde des chasseurs

Version 0.7.1 du site pour construire ses decks, tester le jeu seul et établir une partie directe entre deux navigateurs. Le site utilise les règles et les cartes actuelles ; l'ancien fichier card_data.json n'est pas utilisé.

La carte 202, Silas, utilise les nouvelles illustrations françaises et anglaises fournies par le créateur. Une fois par tour, Manger ou renvoyer une carte du terrain dans la main de son propriétaire déclenche un soin de 1 blessure à un Chasseur ou un Monstre allié ciblé. Son identifiant reste 202 et les decks existants conservent leur Chef.

Pour récupérer le projet et le publier sur GitHub Pages, suivre le guide [GITHUB.md](GITHUB.md). La configuration de publication automatique est fournie dans `.github/workflows/pages.yml`.

## Ce que contient le site

L’habillage de la Guilde emploie un fond parchemin cartographique, des panneaux clairs, des cadres bronze et des boutons bleu encre. Il s’inspire de références officielles Monster Hunter détaillées dans [docs/DIRECTION-ARTISTIQUE.md](docs/DIRECTION-ARTISTIQUE.md). La feuille `dist/theme.css` porte cet habillage ; les fonctions et l’organisation des écrans sont conservées. Les textures SVG sont originales et incluses dans les fichiers du site.

L’accueil présente trois cartes différentes tirées au hasard parmi les cartes numérotées, Chefs compris. Le tirage se fait dans le navigateur à chaque chargement du site. Il reste stable pendant la navigation et le changement de langue ; les images et noms suivent le choix français ou anglais. Les jetons sont exclus de cette présentation.

- Une création de profil avec pseudo et mot de passe, sans email.
- Un deck builder pour les cartes actuelles, avec onglets Cartes, Chefs de chasse et Analyse.
- Une galerie de Chefs avec illustration, capacité, recherche bilingue, filtres par couleur et extension.
- Un deck visible à côté du catalogue, avec contrôles +/−, filtres actifs, pagination et annuler/rétablir.
- Une bibliothèque des cartes, des deux types de jetons et de leurs images finales françaises et anglaises.
- Un bouton FR/EN avec drapeau en haut à droite : langue de l’interface et des cartes mémorisée dans le navigateur.
- Des recherches par nom, type et sous-type, insensibles à la casse et aux accents.
- Des filtres par extension, couleur, type et coût, ainsi que plusieurs tris.
- Un mode test solo dans lequel une personne contrôle les deux camps.
- Une table libre pour employer tout le catalogue, avec résolution manuelle des effets.
- Un mode automatisé pour le sous-ensemble actuellement programmé de 37 cartes et Chefs.
- Une connexion directe WebRTC entre deux joueurs, établie par échange manuel de codes.

## Profils locaux et sauvegardes

Le choix de langue est indépendant du profil et conservé dans le stockage local du navigateur (`mh-tcg.language`). Il s’applique dès l’ouverture du site, y compris avant connexion. Les 205 images par langue sont incluses. Changer de langue pendant une partie conserve la table et les sélections en cours ; chaque joueur peut choisir sa langue. Les noms de profils et de decks restent ceux saisis par leur créateur. Les sauvegardes et les actions réseau utilisent les mêmes identifiants de cartes dans les deux langues.

Les profils existent uniquement dans ce navigateur, sur cet appareil et pour l'adresse du site utilisée. Ils ne créent pas de compte mondial et ne sont pas synchronisés entre appareils. Un même pseudo peut donc appartenir à des personnes différentes dans des navigateurs différents.

Le pseudo compte de 3 à 24 caractères. Le mot de passe comporte au moins huit caractères. Le site conserve un vérificateur PBKDF2 SHA-256 avec un sel propre à chaque profil ; le mot de passe en clair n'est pas enregistré. Il n'existe pas de récupération par email.

Les decks et la dernière partie sont enregistrés dans le stockage local du navigateur, séparément pour chaque profil. Ce stockage est plus adapté aux decks que des cookies. Il n'est pas envoyé à un serveur de comptes. Une nouvelle session peut demander de se reconnecter au profil déjà créé.

L'effacement des données du navigateur supprime ces profils et leurs sauvegardes. Pour conserver une copie ou transférer un deck, utilise les commandes d'export et d'import. L'export des decks ne contient pas les données de connexion. Changer de navigateur, de domaine ou de port local correspond à un autre espace de stockage.

Un profil local protège l'accès dans l'interface, mais ne constitue pas une autorité d'identité contre quelqu'un qui contrôle le navigateur et peut modifier son stockage. Ce point ne dépend pas de la force du mot de passe.

## Construire un deck

Le deck principal contient exactement 50 cartes, avec trois exemplaires maximum par carte et les couleurs autorisées par le Chef choisi. Le Chef reste séparé des 50 cartes. Les jetons ne font pas partie du deck. Douze rations sont préparées automatiquement pour chaque joueur.

Le builder permet de conserver un brouillon incomplet et indique les erreurs qui empêchent de jouer normalement. Toutes les cartes et tous les Chefs du catalogue sont disponibles à la construction ; la mention d'automatisation sert à choisir le mode de jeu, sans retirer les autres cartes du builder.

La recherche porte sur les noms français et anglais, types, sous-types, couleurs et identifiants. Plusieurs mots doivent tous correspondre. Par exemple : `Rathian`, `dragon ancien`, `wyverne volante`, `Lance` ou `Zora forêt`. L'extension actuellement présente dans le catalogue est **MhFG** ; aucun nom d'extension supplémentaire n'est inventé.

## Le nouvel atelier des decks

Un nouveau deck commence par le choix de son Chef dans une galerie ; aucun Chef n’est imposé. Les Chefs proviennent du catalogue, avec pagination de 12 fiches, et la préparation du site vérifie les illustrations sans imposer le nombre initial de sept Chefs. Pour ajouter une carte ou un Chef, il faut toujours mettre à jour les données et les images françaises et anglaises correspondantes.

Avant un changement de Chef qui rend des cartes incompatibles, un bilan compte les exemplaires concernés. Le joueur choisit de garder toutes les cartes en brouillon ou de retirer les incompatibles. Annuler ferme le bilan sans modifier le deck ; le retour arrière de l’atelier restaure aussi le Chef et les quantités précédentes. L’historique conserve 30 modifications de cartes ou de Chef pendant la session et reste séparé entre profils et decks. Le nom personnel du deck est conservé.

Le dernier deck ouvert est mémorisé séparément pour chaque profil. Les cartes du catalogue s’affichent par pages de 24 ; les filtres de construction sont séparés de ceux de la bibliothèque. La recherche accepte les noms français et anglais, types et sous-types ; la galerie des Chefs recherche aussi dans leurs capacités. Les filtres actifs peuvent être retirés individuellement. Le focus et la position de la liste sont conservés après un ajustement de quantité.

L’onglet Analyse affiche les quantités, le coût moyen, la courbe des coûts et la répartition des types. Ces mesures décrivent le deck, sans calculer de puissance ni imposer des ratios stratégiques. Sur petit écran, un bouton fixe donne accès au deck. Les onglets se parcourent avec les flèches et Début/Fin ; Annuler/Rétablir accepte Ctrl+Z/Ctrl+Y hors des champs de saisie.

L’étude et ses références sont disponibles dans [docs/ANALYSE-DECKBUILDER.md](docs/ANALYSE-DECKBUILDER.md).

## Tester le jeu seul

La table agrandie affiche les étapes du tour, des rations sous forme de cartes et un aperçu au survol, au focus ou au clic. Glisser une carte jouable depuis la main vers sa zone utilise la même action et le même paiement que les boutons. Les cibles nécessaires sont demandées avant validation. Le carnet de chasse détaille les pioches, rations et paiements sans annoncer les cartes piochées. Voir [docs/INTERFACE-JEU.md](docs/INTERFACE-JEU.md) pour les commandes et leurs limites.

Un bandeau présente les points des deux joueurs et l'objectif de six points. La zone de pile montre les cartes jouées et les copies de capacités, ces dernières en noir et blanc. Maintenir **F** puis cliquer sur une carte publique propose ses capacités disponibles avec leurs choix et coûts. Après deux passages successifs, le dernier élément se résout ; une nouvelle fenêtre de réponse s'ouvre ensuite. En table libre, les effets non programmés demandent une résolution avec les outils puis une confirmation explicite.

Sur ordinateur, la table occupe l'écran : Camp adverse, chasse partagée, Camp du joueur et main restent visibles. La pile utilise un rail latéral et le panneau de droite réunit l'aperçu, les actions et le carnet. Les cartes se resserrent selon la place disponible ; le survol, la sélection et le bouton de lecture permettent toujours de lire leur texte en grand.

Le carnet commun affiche les actions et les messages de tchat dans leur ordre d'arrivée. Les messages des joueurs portent leur pseudo et une présentation distincte ; leur texte est conservé tel qu'il a été écrit dans les deux langues. Le tchat fonctionne aussi hors priorité, passe par la connexion directe entre les joueurs et reste dans la sauvegarde locale du test solo. Chaque message contient au plus 500 caractères ; seuls les événements récents sont gardés.

Une palette propose les marqueurs **Quête, Spirituel, Chaleur et Charge**. En table libre, glisser un pictogramme sur une carte publique ajoute le marqueur choisi ; le mode Retirer en enlève un. Cliquer sur un pictogramme puis sur une carte offre le même geste sans glisser. Les petits badges en haut à droite des cartes regroupent les marqueurs identiques et affichent leur quantité. En mode automatisé, les effets du moteur règlent les compteurs et la palette les présente en lecture seule.

Le bouton **Flèche**, accompagné d'un pictogramme, permet de relier deux cartes publiques ou éléments de pile. Les flèches contournent les cartes lorsque la place le permet, se partagent en ligne et ne remplacent pas les choix de cibles des règles. Chaque joueur peut conserver six flèches et effacer les siennes. Elles disparaissent lorsque leurs cartes quittent les zones publiques.

Le mode test est une table d'entraînement : tu choisis les actions des deux camps. Il ne s'agit pas encore d'un adversaire informatique qui choisit sa propre stratégie.

En **table libre**, toutes les cartes sont disponibles. Le site prend en charge les zones, les tours, les rations, le combat de base et les compteurs. Les textes de capacités, conditions, coûts supplémentaires et victoires particulières doivent être appliqués manuellement avec les outils de la table. Cette mention reste visible pendant la partie.

En **mode automatisé**, seuls les cartes et Chefs marqués comme automatisés peuvent être utilisés. Le moteur exécute les effets programmés et valide les choix de cibles et les coûts. Les deux decks de départ offrent une base pour ce mode. Voir également `TABLE_LIBRE.md` pour les différences entre les deux tables.

Le joueur actif dispose de la première possibilité de jouer un Réflexe. S'il passe, le joueur non actif peut jouer. Une seule Interposition peut rediriger une même attaque. Le Chef ne peut jamais attaquer ou participer à un combat.

## Jouer en connexion directe

Les deux personnes doivent ouvrir une version compatible du site. Après le chargement, aucun serveur central ne calcule les actions de la partie.

1. L'hôte crée une invitation et transmet le code à l'autre joueur, par le moyen de son choix.
2. L'invité colle le code d'invitation et génère son code de réponse.
3. L'invité transmet la réponse à l'hôte.
4. L'hôte colle ce code de réponse ; les navigateurs établissent ensuite leur liaison directe.

Cet échange manuel remplace un serveur de signalisation. Les codes expirent : une ancienne invitation peut nécessiter une nouvelle création. Les deux navigateurs doivent rester ouverts et connectés pour échanger les actions.

Le mode **Internet** utilise un service STUN pour aider les navigateurs à découvrir une route de connexion. STUN ne stocke pas les comptes ou les decks et ne fait pas tourner le jeu. Le mode **réseau local** n'utilise pas de service STUN.

Une liaison directe n'est pas garantie entre tous les réseaux. Certains routeurs, pare-feu ou réseaux mobiles nécessitent un relais TURN. Le site ne fournit pas de relais de jeu permanent. Le module permet une configuration de relais si un service est disponible, mais une connexion nécessitant ce relais ne sera plus entièrement directe.

L'hôte conserve l'état complet de la partie et transmet à l'invité sa vue autorisée. L'interface protège les informations cachées reçues par l'invité, mais cette architecture entre amis ne remplace pas un arbitre central contre un hôte malveillant. Elle convient aux parties de confiance et évite l'exploitation d'un serveur de partie important.

## Hébergement et ouverture locale

Le site est composé de fichiers statiques dans `dist/`. Un hébergement statique HTTPS suffit pour distribuer le site ; il ne joue pas le rôle d'un serveur de comptes ou de partie. Le HTTPS est nécessaire aux fonctions modernes du navigateur sur Internet. Une adresse `localhost` peut être utilisée pour le développement local.

Avec Node.js installé, depuis ce dossier :

```text
npm run build
npm start
```

Le serveur local sert uniquement `dist/` et écoute sur `http://127.0.0.1:4180`. Il n'expose pas le reste du dossier de travail. On peut aussi lancer directement :

```text
node scripts/build.cjs
node server.cjs --port 4180
```

Les profils et les decks restent liés à cette adresse locale. Pour jouer à distance, chaque personne doit disposer d'une adresse HTTPS accessible du site ; partager simplement son adresse `127.0.0.1` ne donne pas accès au site d'un autre ordinateur.

## Sources du jeu

- Le catalogue des cartes et les règles validés par le créateur.
- Les précisions du créateur sur la priorité Réflexe et l'Interposition unique.
- Les illustrations finales fournies par le créateur, copiées et optimisées en WebP ; les originaux ne sont pas modifiés.

Le dossier statique contient 203 cartes numérotées, sept Chefs compris, et deux types de jetons, avec 410 images au total : 205 françaises et 205 anglaises. Le fichier `dist/version.json`, produit par la préparation, conserve la version du catalogue et le nombre de cartes, sans lien vers les documents privés.

## Vérifier et préparer une version

```text
node --test tests/*.test.cjs
node scripts/build.cjs
```

Les tests couvrent les profils, le stockage, la recherche et la construction des decks, les tables de jeu et le protocole de connexion. Les essais réseau réels et entre navigateurs complètent les tests du protocole ; des tests seuls ne garantissent pas le passage de tous les routeurs.

La préparation vérifie les scripts déclarés par la page et les 410 images, puis génère les métadonnées de version. Si un manifeste d'hébergement `.openai/hosting.json` est présent, il est copié dans `dist/.openai/hosting.json` après vérification qu'il ne contient pas d'identifiant secret. Aucun jeton, mot de passe ou fichier de profil utilisateur ne fait partie de la publication.
