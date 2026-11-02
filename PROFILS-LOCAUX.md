# Profils locaux du navigateur

Le module `dist/profiles.js` expose `MHProfiles.createStore()` et le même export en CommonJS pour les tests. Il ne communique avec aucun serveur et n'utilise pas l'ancien catalogue JSON du jeu.

Un pseudo est normalisé en NFKC et comparé sans distinction de casse. Les accents sont conservés. Les mots de passe comportent au moins huit caractères ; ils ne sont pas normalisés. Un vérificateur PBKDF2 SHA-256 à 310 000 itérations est enregistré avec un sel aléatoire de seize octets propre au profil. Le mot de passe en clair n'est jamais conservé par le module.

Les profils, leurs decks et leur dernière partie sont stockés dans `localStorage`. Chaque modification remplace une seule valeur JSON et relit les données existantes avant de les écrire. Une session contient l'identifiant du profil dans `sessionStorage` : elle permet de retrouver la connexion dans le même onglet, et une nouvelle session nécessite de se reconnecter. L'inscription connecte immédiatement le nouveau profil.

Ces profils sont un confort local, pas une autorité d'authentification distante. La personne contrôlant le navigateur peut inspecter ou modifier son stockage local. Ce mécanisme ne garantit pas l'identité d'un adversaire en ligne et ne crée pas une unicité mondiale des pseudos. Les jeux en réseau doivent vérifier leur protocole indépendamment de ce module.

L'effacement des données du navigateur supprime profils, decks et parties. Le module ne propose pas de récupération de mot de passe et ne synchronise pas les comptes entre appareils. L'export des decks permet de conserver une copie ; il ne contient ni vérificateur de mot de passe, ni sel, ni session, ni partie sauvegardée.

## API

- `createStore({storage, sessionStorage, crypto})` accepte des dépendances facultatives pour les tests. Par défaut, il utilise celles du navigateur.
- `register(username, password)` et `login(username, password)` sont asynchrones et retournent `{id, username, createdAt}`. Ils ouvrent la session.
- `current()` retourne ce profil public ou `null` ; `logout()` ferme la session.
- `listDecks()`, `saveDeck(deck)`, `deleteDeck(id)` agissent seulement sur le profil connecté.
- `saveDeck` attend `{id?, name, chiefId, cards}` et retourne `{id, name, chiefId, cards, createdAt, updatedAt}`. Les brouillons de zéro à cent cartes sont acceptés. La légalité de jeu, les couleurs et la limite d'exemplaires sont vérifiées par le deck builder et le moteur, pas par le stockage.
- `getGame()`, `saveGame(state)`, `clearGame()` gèrent une dernière partie par profil. La partie doit être un objet JSON valide de moins de trois méga-caractères.
- `exportProfile()` produit `{format:'mh-tcg-profile-decks', version:1, username, exportedAt, decks}`.
- `importDecks(array)` valide toute la liste avant écriture et ajoute des copies avec de nouveaux identifiants. Aucun deck existant n'est écrasé. Deux cents decks maximum sont permis par profil.

Toutes les erreurs destinées à l'interface sont formulées en français. Des données de profils illisibles ou incompatibles sont conservées sans être automatiquement réinitialisées.
