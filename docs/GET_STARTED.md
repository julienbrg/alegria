---
title: Get started with Alegria
description: What Alegria is, and how an outside contributor installs, runs and tests it locally against the mock ENT, without an Edifice instance.
date: 2026-11-21
locale: en_US
author: Julien Béranger
model: Claude Opus 5.5
---

Version française : [GET_STARTED_FR.md](GET_STARTED_FR.md).

## What Alegria is

Alegria provides course assistants inside a French school's [ENT](https://fr.wikipedia.org/wiki/Espace_num%C3%A9rique_de_travail) (*espace numérique de travail*, the school's [virtual learning environment](https://en.wikipedia.org/wiki/Virtual_learning_environment)). It is added to the ENT as a connector. The first target is [ENT Hauts-de-France](https://enthdf.fr/), which runs on [Edifice](https://edifice.io/).

- Teachers create assistants (instructions, documents, model) and publish them to their school or to some of its classes.
- Staff, students and parents chat with the assistants published to them.
- Nobody creates an account: identity, profile, school and classes come from the ENT, through [OAuth 2.0](https://datatracker.ietf.org/doc/html/rfc6749).

It is one process: a [NestJS](https://nestjs.com/) API in `src/` that also serves a [Vite](https://vite.dev/), [React](https://react.dev/) and [Chakra UI](https://chakra-ui.com/) app from `web/`. Data is stored in a single [SQLite](https://sqlite.org/) file, and assistant documents are kept as Markdown files. The design is in the [technical specification](https://julienberanger.com/ent-module-spec).

**What works today:** ENT login, roles, the assistant routes (`/context`), `/ask` with streaming, per-user daily limits and the optional MCP endpoint. Two screens are missing: the chat screen ([#55](https://github.com/julienbrg/alegria/issues/55)) and the teacher screens ([#56](https://github.com/julienbrg/alegria/issues/56)). Until they land, you create assistants and ask questions through [Swagger UI](https://swagger.io/tools/swagger-ui/), as shown under [Run](#run).

You don't need a real ENT. A **mock ENT** built into the app replaces Edifice's OAuth endpoints and lets you sign in as a teacher, a staff member, a student, a parent or a super-admin.

## Requirements

| What | Why |
| --- | --- |
| [Node.js](https://nodejs.org/) 24 | The version CI runs |
| [pnpm](https://pnpm.io/) 10.23.0 | The version pinned in `packageManager` in `package.json`. Use pnpm only: the repository has no npm or Yarn lockfile |
| [Git](https://git-scm.com/) | To clone the repository |
| A C/C++ toolchain | Only if [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) has no prebuilt binary for your platform: Xcode Command Line Tools on macOS (`xcode-select --install`), `build-essential` and Python 3 on Linux, or [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) on Windows |
| A [Mistral](https://console.mistral.ai/) API key | Optional, only if you want `/ask` to answer. Login, assistants and every test run without it |

The quickest way to get the pinned pnpm is [Corepack](https://nodejs.org/docs/latest-v24.x/api/corepack.html), which ships with Node 24:

```sh
corepack enable
```

Other options are listed on the [pnpm installation page](https://pnpm.io/installation).

The API must be able to listen on port **3000** and the app on port **5173**. The app's dev proxy is hardcoded to `127.0.0.1:3000`, so if something else is using port 3000, stop it rather than changing `PORT`.

## Setup

[Fork the repository](https://docs.github.com/en/get-started/quickstart/fork-a-repo), clone your fork, and copy the example config:

```sh
git clone https://github.com/<you>/alegria.git
cd alegria
cp .env.example .env
```

`.env.example` already works with the mock ENT. Here are the variables you might want to change locally:

| Variable | Default | Change it when |
| --- | --- | --- |
| `ENT_MOCK` | `true` | Never locally. It serves the mock ENT at `/mock-ent` and is refused when `NODE_ENV=production` |
| `MISTRAL_API_KEY` | empty | You want answers from `/ask`. Today, every assistant answers through Mistral, whatever its `model` |
| `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `DEEPSEEK_API_KEY` | empty | You work on these providers |
| `ENT_ALLOWED_MODELS` | `mistral-large-latest,claude-sonnet-5-5` | You want other values for an assistant's `model` |
| `SWAGGER_ENABLED` | `false` | Set it to `true` to create assistants and call `/ask` from Swagger UI |
| `ASK_DAILY_LIMITS` | `Student:30,Parent:30,Personnel:100,Teacher:100` | You hit the daily limit while testing. A profile that isn't listed has no limit |
| `DB_PATH` | `data/alegria.db` | You want a separate database, or `:memory:` to keep nothing on disk |
| `MCP_ENABLED` | `false` | You work on the MCP endpoint |

Never commit `.env`; it is already in `.gitignore`. When you pull new changes, compare your `.env` with `.env.example`, because variables get added and renamed.

## Install

```sh
pnpm install
```

This installs the API and the `web/` workspace, and builds the better-sqlite3 native module. If the build fails, install the toolchain listed under [Requirements](#requirements) and run `pnpm install` again. The [better-sqlite3 troubleshooting guide](https://github.com/WiseLibs/better-sqlite3/blob/master/docs/troubleshooting.md) covers the rest.

There is no database step. `data/alegria.db` is created and migrated the first time the API starts.

## Run

Open two terminals:

```sh
pnpm start:dev   # API on http://localhost:3000, restarts on change
```

```sh
pnpm web:dev     # app on http://localhost:5173, proxies API routes to :3000
```

Always use the app at http://localhost:5173. The session cookie and the origin check are set up for that address.

### Sign in

1. Open http://localhost:5173 and click **Log in with the ENT**.
2. The mock ENT page lists the profiles. Pick one:

   | Profile | Role | School | Classes |
   | --- | --- | --- | --- |
   | Teacher | `teacher`: creates and edits assistants | `0000001A` | 3A, 4B |
   | Personnel | `user`: uses assistants | `0000001A` | none |
   | Student (3A) | `user` | `0000001A` | 3A |
   | Parent | `user` | `0000001A` | none |
   | Super-admin | `user` | `0000001A` | none |
   | Guest (refused) | refused at login | | |

3. You land on "Welcome, <profile>!". The **Assistants** page lists the assistants you can see. Use **Log out** to switch profiles.

### Create an assistant and ask it a question

Set `SWAGGER_ENABLED=true` in `.env` and restart `pnpm start:dev`. Then open http://localhost:5173/api. Swagger UI uses your browser's session cookie, so it acts as whoever is signed in.

1. **As the teacher**, call `POST /context`:

   ```json
   { "title": "SVT 3e", "model": "mistral-large-latest", "classes": ["3A"] }
   ```

   The response contains the generated `name`, for example `hdf-0000001a-svt-3e-x7k2p9`, and `"published": false`. A draft is visible to its owner only.

2. **Give it instructions.** There is no upload route yet ([#56](https://github.com/julienbrg/alegria/issues/56), [#57](https://github.com/julienbrg/alegria/issues/57)), so write the file by hand. Every Markdown file in the assistant's folder is sent to the model:

   ```sh
   mkdir -p data/contexts/<name>
   printf '# Instructions\n\nTu es un assistant de SVT pour une classe de 3e. Réponds en français, en trois phrases au plus.\n' > data/contexts/<name>/instruction-file.md
   ```

3. **Publish it** with `PATCH /context/{name}`:

   ```json
   { "published": true }
   ```

4. **Log out, sign in as Student (3A)**, and open **Assistants**: the assistant is listed. Sign in as Parent instead and it isn't, because it is published to class 3A only.

5. **As the student**, call `POST /ask`:

   ```json
   { "message": "Explique la photosynthèse.", "context": "<name>", "stream": false }
   ```

   With `MISTRAL_API_KEY` set, the response holds the answer, the model used, the token usage and a `sessionId`. With `"stream": true`, the answer arrives as [server-sent events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events). Without a key, a non-streaming call returns `"model": "none"` and no answer, and a streaming call sends an `error` event saying `All models failed`. The API log says why.

6. **Clean up** as the teacher with `DELETE /context/{name}`. It deletes the assistant and its conversations, but leaves `data/contexts/<name>/` on disk, so remove that folder by hand.

To start over from an empty database, stop the API and delete `data/alegria.db`, `data/alegria.db-shm` and `data/alegria.db-wal`.

### Other routes

The full route list, the visibility rules and the MCP setup are in the [README](../README.md#routes). How ENT profiles map to roles is in [INTEGRATION_GUIDELINES.md](INTEGRATION_GUIDELINES.md).

## Test

CI runs these on every pull request. They need no API key and no running server:

```sh
pnpm check                        # Prettier and ESLint; pnpm format and pnpm lint fix what they can
pnpm test                         # API unit tests (Vitest)
pnpm test:e2e                     # boots the app in-process against the mock ENT and calls it over HTTP
pnpm --filter alegria-web test    # web app tests (Vitest, jsdom, Testing Library)
pnpm build                        # typechecks and builds the app, then the API
```

The test runner is [Vitest](https://vitest.dev/). Unit tests sit next to the code as `*.spec.ts`. End-to-end tests are in `test/*.e2e-spec.ts` and use an in-memory database. Web tests are in `web/src/**/*.test.tsx`. New behavior comes with tests.

## Next steps

- Read [CONTRIBUTING.md](../CONTRIBUTING.md) for the issue, branch, commit and pull request conventions.
- Pick an issue labelled [`good first issue`](https://github.com/julienbrg/alegria/labels/good%20first%20issue). The pinned `Track …` issues give the order in which the work is planned.
- Before you open a pull request, run the commands under [Test](#test).

## Further reading

- [Technical specification](https://julienberanger.com/ent-module-spec)
- [Edifice OAuth 2.0 connector documentation](https://edifice-community.atlassian.net/wiki/x/4YCX8)
- [Target workflows](TARGET_WORKFLOWS.md) and [legal resources](RESOURCES.md)
- [NestJS documentation](https://docs.nestjs.com) and [pnpm workspaces](https://pnpm.io/workspaces)
