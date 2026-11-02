# Mettre MH TCG sur GitHub et tester le site en ligne

Le dossier livré contient tout le code du site, les 410 images de cartes françaises et anglaises, l’illustration des rations, les tests et la publication automatique sur GitHub Pages. Il ne nécessite aucun serveur de comptes ou de jeu. Les fichiers HTML, CSS et JavaScript de `dist/` sont les sources modifiables du site ; il n'y a pas de compilation cachée ni de service payant à installer.

## 1. Préparer le dossier

Extraire l'archive `MH-TCG-code-GitHub-v0.5.zip` dans un dossier de ton choix. Ouvrir le dossier `MH-TCG-GitHub` extrait : tu dois y voir directement `README.md`, `package.json`, `dist`, `scripts`, `tests` et `.github`.

Le dossier `.github` contient la publication automatique. Ne pas l'oublier lors de l'envoi à GitHub. Il faut envoyer les fichiers extraits, pas le ZIP lui-même.

Le dossier exporté est indépendant de la publication actuelle du site. Il ne contient pas d'ancien dépôt Git ni de réglages de connexion à l'hébergement précédent.

## 2. Envoyer les fichiers avec GitHub Desktop

C'est la méthode conseillée pour envoyer tout le projet et conserver les dossiers commençant par un point.

1. Installer [GitHub Desktop](https://desktop.github.com/), l'ouvrir et se connecter à ton compte GitHub.
2. Choisir **File → New repository…**.
3. Donner le nom **mh-tcg** au dépôt, puis choisir un dossier vide pour le créer. Ne pas ajouter de licence automatiquement.
4. Ouvrir ce nouveau dossier avec **Repository → Show in Explorer**. Y copier tout le contenu du dossier `MH-TCG-GitHub` extrait. `dist` et `.github` doivent être directement à la racine du dépôt, sans dossier intermédiaire.
5. Dans GitHub Desktop, saisir le résumé **Première version du simulateur**, puis cliquer sur **Commit to main**.
6. Cliquer sur **Publish repository**. Pour GitHub Pages avec un compte gratuit, décocher **Keep this code private** : le dépôt sera public. Cliquer sur **Publish repository**.

GitHub Pages est disponible pour un dépôt public avec GitHub Free. L'utilisation d'un dépôt privé pour Pages dépend de l'abonnement GitHub. Aucun choix de licence de redistribution n'est imposé par cette livraison.

## 3. Activer GitHub Pages

1. Ouvrir le dépôt sur GitHub avec **Repository → View on GitHub** dans GitHub Desktop.
2. Dans le dépôt, ouvrir **Settings → Pages**.
3. Sous **Build and deployment → Source**, choisir **GitHub Actions**. Ne pas choisir une publication depuis la branche : le site se trouve dans `dist/` et le fichier fourni s'occupe de le publier.
4. Ouvrir l'onglet **Actions**, puis **Publier MH TCG sur GitHub Pages**.
5. Cliquer sur **Run workflow**, choisir la branche **main**, puis confirmer **Run workflow**. Si une première exécution avait échoué avant l'activation de Pages, relancer simplement la publication.
6. Attendre la coche verte. Le lien du site apparaît dans le résultat de la publication et dans **Settings → Pages**.

Avec le compte `Soulsy28` et le nom de dépôt `mh-tcg`, l'adresse attendue sera :

<https://soulsy28.github.io/mh-tcg/>

Cette adresse fonctionne seulement après une publication réussie. Si le nom du dépôt ou du compte est différent, utiliser le lien affiché par GitHub.

## 4. Tester et retrouver ses decks

Sur la nouvelle adresse, créer un profil local, ouvrir le deck builder et lancer une partie de test. Pour jouer à deux, ouvrir cette même adresse sur les deux appareils, puis utiliser l'échange de codes du mode de connexion directe.

**Les sauvegardes dépendent de l'adresse du site.** Avant de quitter l'adresse actuelle, exporter tes decks depuis celle-ci. Sur l'adresse GitHub Pages, créer ton profil local puis importer les decks. Les profils et mots de passe ne sont pas transférés par l'export des decks.

GitHub héberge les fichiers du site ; les profils et decks restent dans les navigateurs. Les limites actuelles du simulateur restent les mêmes : toutes les cartes sont disponibles sur la table libre, 37 cartes et Chefs sont automatisés et le test solo permet de contrôler les deux camps. La connexion directe dépend aussi des réseaux des joueurs.

## 5. Publier une modification

Modifier les fichiers dans ton dépôt local. Le code principal de l'interface est dans `dist/site.js`, son apparence dans `dist/site.css`, les cartes dans `dist/catalog.js`, le moteur automatisé dans `dist/engine.js` et la table libre dans `dist/table.js`.

Dans GitHub Desktop, écrire un résumé, cliquer sur **Commit to main**, puis **Push origin**. GitHub exécutera les tests et publiera la nouvelle version automatiquement. Si les tests échouent, la précédente version publiée reste accessible.

Pour tester sur ton ordinateur avec [Node.js](https://nodejs.org/) installé, ouvrir un terminal dans le dépôt et lancer :

```text
npm test
npm run build
npm start
```

Ouvrir ensuite <http://127.0.0.1:4180>. Aucune installation de dépendances avec `npm install` n'est nécessaire pour cette version.

## Si quelque chose bloque

- **L'adresse affiche 404** : vérifier que la publication est verte, que Pages utilise GitHub Actions et que l'adresse finit bien par `/mh-tcg/` si c'est le nom du dépôt.
- **Le workflow n'apparaît pas** : vérifier que `.github/workflows/pages.yml` est bien présent dans le dépôt GitHub, directement à sa racine.
- **La publication échoue sur la configuration de Pages** : activer **Settings → Pages → GitHub Actions**, puis relancer le workflow.
- **GitHub demande une autorisation pour Actions** : autoriser les actions GitHub officielles utilisées par le fichier `pages.yml` dans les paramètres Actions du dépôt.
- **La page fonctionne mais mes decks sont absents** : ils sont toujours liés à l'ancienne adresse ; les exporter puis les importer.
- **Les profils ne fonctionnent pas avec un fichier ouvert directement** : utiliser l'adresse HTTPS du site ou le serveur local décrit ci-dessus.

## Documentation officielle

- [Publier avec un workflow GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)
- [Choisir la source de publication de Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)
- [Créer un premier dépôt avec GitHub Desktop](https://docs.github.com/en/desktop/overview/creating-your-first-repository-using-github-desktop)
