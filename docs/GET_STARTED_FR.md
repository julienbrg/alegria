---
title: Bien démarrer avec Alegria
description: Ce qu'est Alegria, et comment un contributeur extérieur l'installe, le lance et le teste en local avec l'ENT simulé, sans instance Edifice.
date: 2026-11-21
locale: fr_FR
author: Julien Béranger
model: Claude Opus 5.5
---

English version: [GET_STARTED.md](GET_STARTED.md).

## Ce qu'est Alegria

Alegria fournit des assistants de cours dans l'[ENT](https://fr.wikipedia.org/wiki/Espace_num%C3%A9rique_de_travail) (espace numérique de travail) d'un collège ou d'un lycée. On l'ajoute à l'ENT comme connecteur. La première cible est l'[ENT Hauts-de-France](https://enthdf.fr/), qui repose sur [Edifice](https://edifice.io/).

- Les enseignants créent des assistants (instructions, documents, modèle) et les publient pour leur établissement ou pour certaines de ses classes.
- Les personnels, élèves et parents discutent avec les assistants qui leur sont publiés.
- Personne ne crée de compte : l'identité, le profil, l'établissement et les classes viennent de l'ENT, via [OAuth 2.0](https://datatracker.ietf.org/doc/html/rfc6749).

C'est un seul processus : une API [NestJS](https://nestjs.com/) dans `src/`, qui sert aussi une application [Vite](https://vite.dev/), [React](https://fr.react.dev/) et [Chakra UI](https://chakra-ui.com/) située dans `web/`. Les données sont stockées dans un seul fichier [SQLite](https://sqlite.org/), et les documents des assistants restent des fichiers Markdown. La conception est décrite dans la [spécification technique](https://julienberanger.com/ent-module-spec) (en anglais).

**Ce qui fonctionne aujourd'hui :** la connexion par l'ENT, les rôles, les routes des assistants (`/context`), `/ask` avec streaming, les limites quotidiennes par utilisateur et le point d'accès MCP optionnel. Deux écrans manquent : l'écran de discussion ([#55](https://github.com/julienbrg/alegria/issues/55)) et les écrans enseignant ([#56](https://github.com/julienbrg/alegria/issues/56)). En attendant, on crée les assistants et on leur pose des questions depuis [Swagger UI](https://swagger.io/tools/swagger-ui/), comme décrit dans [Lancer](#lancer).

Inutile d'avoir un vrai ENT. Un **ENT simulé**, intégré à l'application, remplace les points d'accès OAuth d'Edifice et permet de se connecter comme enseignant, personnel, élève, parent ou super-admin.

## Prérequis

| Quoi | Pourquoi |
| --- | --- |
| [Node.js](https://nodejs.org/fr) 24 | La version utilisée par la CI |
| [pnpm](https://pnpm.io/) 10.23.0 | La version fixée par `packageManager` dans `package.json`. N'utilisez que pnpm : le dépôt n'a pas de fichier de verrouillage npm ni Yarn |
| [Git](https://git-scm.com/) | Pour cloner le dépôt |
| Une chaîne de compilation C/C++ | Seulement si [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) n'a pas de binaire précompilé pour votre plateforme : Xcode Command Line Tools sur macOS (`xcode-select --install`), `build-essential` et Python 3 sous Linux, [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) sous Windows |
| Une clé d'API [Mistral](https://console.mistral.ai/) | Facultative, seulement pour que `/ask` réponde. La connexion, les assistants et tous les tests fonctionnent sans |

Le plus simple pour obtenir la bonne version de pnpm est [Corepack](https://nodejs.org/docs/latest-v24.x/api/corepack.html), fourni avec Node 24 :

```sh
corepack enable
```

Les autres méthodes sont sur la [page d'installation de pnpm](https://pnpm.io/installation).

L'API doit pouvoir écouter sur le port **3000** et l'application sur le port **5173**. Le proxy de développement de l'application vise `127.0.0.1:3000` en dur : si un autre programme occupe le port 3000, arrêtez-le plutôt que de changer `PORT`.

## Configuration

[Forkez le dépôt](https://docs.github.com/fr/get-started/quickstart/fork-a-repo), clonez votre fork et copiez la configuration d'exemple :

```sh
git clone https://github.com/<vous>/alegria.git
cd alegria
cp .env.example .env
```

`.env.example` fonctionne déjà avec l'ENT simulé. Voici les variables que vous pourriez vouloir changer en local :

| Variable | Par défaut | À changer quand |
| --- | --- | --- |
| `ENT_MOCK` | `true` | Jamais en local. Elle sert l'ENT simulé sur `/mock-ent` et est refusée quand `NODE_ENV=production` |
| `MISTRAL_API_KEY` | vide | Vous voulez des réponses de `/ask`. Aujourd'hui, tous les assistants répondent via Mistral, quel que soit leur `model` |
| `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `DEEPSEEK_API_KEY` | vide | Vous travaillez sur ces fournisseurs |
| `ENT_ALLOWED_MODELS` | `mistral-large-latest,claude-sonnet-5-5` | Vous voulez d'autres valeurs pour le `model` d'un assistant |
| `SWAGGER_ENABLED` | `false` | Passez-la à `true` pour créer des assistants et appeler `/ask` depuis Swagger UI |
| `ASK_DAILY_LIMITS` | `Student:30,Parent:30,Personnel:100,Teacher:100` | Vous atteignez la limite quotidienne pendant vos tests. Un profil absent de la liste n'a pas de limite |
| `DB_PATH` | `data/alegria.db` | Vous voulez une autre base, ou `:memory:` pour ne rien écrire sur le disque |
| `MCP_ENABLED` | `false` | Vous travaillez sur le point d'accès MCP |

Ne commitez jamais `.env` ; il est déjà dans `.gitignore`. Quand vous récupérez de nouveaux changements, comparez votre `.env` avec `.env.example`, car des variables sont ajoutées ou renommées.

## Installation

```sh
pnpm install
```

Cette commande installe l'API et l'espace de travail `web/`, et compile le module natif better-sqlite3. Si la compilation échoue, installez la chaîne de compilation indiquée dans les [prérequis](#prérequis) et relancez `pnpm install`. Le [guide de dépannage de better-sqlite3](https://github.com/WiseLibs/better-sqlite3/blob/master/docs/troubleshooting.md) (en anglais) couvre les autres cas.

Il n'y a pas d'étape pour la base de données. `data/alegria.db` est créée et migrée au premier démarrage de l'API.

## Lancer

Ouvrez deux terminaux :

```sh
pnpm start:dev   # API sur http://localhost:3000, redémarre à chaque modification
```

```sh
pnpm web:dev     # application sur http://localhost:5173, relaie les routes de l'API vers :3000
```

Utilisez toujours l'application à l'adresse http://localhost:5173. Le cookie de session et la vérification d'origine sont configurés pour cette adresse.

### Se connecter

1. Ouvrez http://localhost:5173 et cliquez sur **Log in with the ENT**.
2. La page de l'ENT simulé liste les profils. Choisissez-en un :

   | Profil | Rôle | Établissement | Classes |
   | --- | --- | --- | --- |
   | Teacher (enseignant) | `teacher` : crée et modifie les assistants | `0000001A` | 3A, 4B |
   | Personnel | `user` : utilise les assistants | `0000001A` | aucune |
   | Student (3A) (élève) | `user` | `0000001A` | 3A |
   | Parent | `user` | `0000001A` | aucune |
   | Super-admin | `user` | `0000001A` | aucune |
   | Guest (refused) (invité) | refusé à la connexion | | |

3. Vous arrivez sur « Welcome, <profil>! ». La page **Assistants** liste les assistants que vous voyez. **Log out** permet de changer de profil.

L'interface est en anglais pour l'instant.

### Créer un assistant et lui poser une question

Passez `SWAGGER_ENABLED=true` dans `.env` et relancez `pnpm start:dev`. Ouvrez ensuite http://localhost:5173/api. Swagger UI utilise le cookie de session du navigateur : il agit au nom de la personne connectée.

1. **Comme enseignant**, appelez `POST /context` :

   ```json
   { "title": "SVT 3e", "model": "mistral-large-latest", "classes": ["3A"] }
   ```

   La réponse contient le `name` généré, par exemple `hdf-0000001a-svt-3e-x7k2p9`, et `"published": false`. Un brouillon n'est visible que de son propriétaire.

2. **Donnez-lui des instructions.** Il n'existe pas encore de route d'envoi de fichiers ([#56](https://github.com/julienbrg/alegria/issues/56), [#57](https://github.com/julienbrg/alegria/issues/57)) : écrivez le fichier à la main. Tous les fichiers Markdown du dossier de l'assistant sont envoyés au modèle :

   ```sh
   mkdir -p data/contexts/<name>
   printf '# Instructions\n\nTu es un assistant de SVT pour une classe de 3e. Réponds en français, en trois phrases au plus.\n' > data/contexts/<name>/instruction-file.md
   ```

3. **Publiez-le** avec `PATCH /context/{name}` :

   ```json
   { "published": true }
   ```

4. **Déconnectez-vous, connectez-vous comme Student (3A)** et ouvrez **Assistants** : l'assistant apparaît. Connecté comme Parent, il n'apparaît pas, car il n'est publié que pour la classe 3A.

5. **Comme élève**, appelez `POST /ask` :

   ```json
   { "message": "Explique la photosynthèse.", "context": "<name>", "stream": false }
   ```

   Avec `MISTRAL_API_KEY` renseignée, la réponse contient le texte, le modèle utilisé, la consommation de tokens et un `sessionId`. Avec `"stream": true`, la réponse arrive en [événements envoyés par le serveur](https://developer.mozilla.org/fr/docs/Web/API/Server-sent_events). Sans clé, un appel sans streaming renvoie `"model": "none"` sans texte, et un appel en streaming envoie un événement `error` indiquant `All models failed`. Le journal de l'API en donne la raison.

6. **Faites le ménage** comme enseignant avec `DELETE /context/{name}`. L'assistant et ses conversations sont supprimés, mais `data/contexts/<name>/` reste sur le disque : supprimez ce dossier à la main.

Pour repartir d'une base vide, arrêtez l'API et supprimez `data/alegria.db`, `data/alegria.db-shm` et `data/alegria.db-wal`.

### Autres routes

La liste complète des routes, les règles de visibilité et la configuration MCP sont dans le [README](../README.md#routes). La correspondance entre profils ENT et rôles est décrite dans [INTEGRATION_GUIDELINES.md](INTEGRATION_GUIDELINES.md). Ces deux documents sont en anglais.

## Tester

La CI lance ces commandes sur chaque pull request. Elles ne demandent ni clé d'API ni serveur lancé :

```sh
pnpm check                        # Prettier et ESLint ; pnpm format et pnpm lint corrigent ce qu'ils peuvent
pnpm test                         # tests unitaires de l'API (Vitest)
pnpm test:e2e                     # démarre l'application en mémoire avec l'ENT simulé et l'appelle en HTTP
pnpm --filter alegria-web test    # tests de l'application web (Vitest, jsdom, Testing Library)
pnpm build                        # vérifie les types et construit l'application, puis l'API
```

Les tests utilisent [Vitest](https://vitest.dev/). Les tests unitaires sont à côté du code, en `*.spec.ts`. Les tests de bout en bout sont dans `test/*.e2e-spec.ts` et utilisent une base en mémoire. Les tests web sont dans `web/src/**/*.test.tsx`. Tout nouveau comportement s'accompagne de tests.

## Et ensuite

- Lisez [CONTRIBUTING.md](../CONTRIBUTING.md) pour les conventions d'issues, de branches, de commits et de pull requests.
- Choisissez une issue marquée [`good first issue`](https://github.com/julienbrg/alegria/labels/good%20first%20issue). Les issues épinglées `Track …` donnent l'ordre prévu du travail.
- Avant d'ouvrir une pull request, lancez les commandes de la section [Tester](#tester).

## Pour aller plus loin

- [Spécification technique](https://julienberanger.com/ent-module-spec)
- [Documentation du connecteur OAuth 2.0 d'Edifice](https://edifice-community.atlassian.net/wiki/x/4YCX8)
- [Parcours cibles](TARGET_WORKFLOWS.md) et [ressources juridiques](RESOURCES.md)
- [Documentation de NestJS](https://docs.nestjs.com) et [espaces de travail pnpm](https://pnpm.io/workspaces)
