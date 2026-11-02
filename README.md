# MH TCG La Guilde des chasseurs

Version 0.3 du site pour construire ses decks, tester le jeu seul et établir une partie directe entre deux navigateurs. Le site utilise les règles et les cartes actuelles ; l'ancien fichier card_data.json n'est pas utilisé.

Pour récupérer le projet et le publier sur GitHub Pages, suivre le guide [GITHUB.md](GITHUB.md). La configuration de publication automatique est fournie dans `.github/workflows/pages.yml`.

## Ce que contient le site

- Une création de profil avec pseudo et mot de passe, sans email.
- Un deck builder pour les 203 cartes actuelles et les sept Chefs de chasse.
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

## Tester le jeu seul

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
