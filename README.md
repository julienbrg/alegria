# Alegria

Course assistants inside the [Edifice](https://edifice.io) ENT. Teachers create and publish assistants; everyone else uses them. Identity comes only from the ENT. See the [ENT module spec](https://julienberanger.com/ent-module-spec).

- `src/` — NestJS backend: Edifice OAuth 2.0 login, session cookie, roles, SQLite storage, optional MCP endpoint
- `web/` — Vite + React + Chakra UI app, served by Nest from `/` in production
- `docs/RESOURCES.md` — legal constraints (cadre d'usage, GDPR, CNIL, AI Act), how Alegria meets them, and resources
- `docs/INTEGRATION_GUIDELINES.md` — registering the connector with an ENT, its env vars, and how ENT profiles map to roles and how to change that
- `docs/TEMPLATING.md` — existing Edifice starters, the generic parts of an ENT connector, and the shape of a reusable template
- `docs/TARGET_WORKFLOWS.md` — how students and teachers will reach Alegria from the ENT, an LLM connector, a custom frontend and a future mobile app, with links to the issues tracking each step

## Install

```sh
pnpm i
cp .env.example .env
```

`pnpm i` builds the better-sqlite3 native module. The database, `data/alegria.db` by default (`DB_PATH`), is created and migrated on first start.

The example config runs locally against the mock ENT, which stands in for Edifice's OAuth endpoints and lets you sign in as a teacher, staff member, student, parent or super-admin.

## Test

```sh
pnpm check                         # Prettier and ESLint
pnpm test                          # unit tests
pnpm test:e2e                      # end-to-end tests against the mock ENT
pnpm --filter alegria-web test    # web app tests
```

## Run

In two terminals:

```sh
pnpm start:dev   # API on :3000
pnpm web:dev     # app on :5173, proxies the API
```

Open http://localhost:5173 and log in; you land on "Welcome, <profile>!".

## Production

Set `NODE_ENV=production`, `ENT_MOCK=false`, the ENT's `ENT_BASE_URL`, client id and secret, the public `ENT_REDIRECT_URI` and `PUBLIC_ORIGIN`, and a fresh `SESSION_SECRET` (`openssl rand -base64 48`). The app refuses to start with the mock or the development secret in production.

## Routes

| Route | Access | |
| --- | --- | --- |
| `GET /auth/login` | public | Starts the OAuth flow; `?next=` is a same-origin path to land on |
| `GET /auth/callback` | public | Checks `state`, opens the session |
| `POST /auth/logout` | public | Clears the session |
| `GET /me` | session | Profile, role, schools, classes, allowed models |
| `GET /context` | session | Assistants visible to the caller, their own first |
| `POST /context` | teacher | Creates a draft assistant; the name is generated, owner and school come from the session |
| `GET /context/:name` | session | One assistant; `404` if hidden from the caller |
| `PATCH /context/:name` | owner | Updates `description`, `model`, `classes`, `published` |
| `DELETE /context/:name` | owner | Deletes the assistant and its conversations |
| `POST /ask` | session | Asks an assistant visible to the caller with its own model; `stream: true` answers as server-sent events. `404` if hidden |
| `DELETE /ask/conversation/:context` | session | Starts a new conversation with the assistant; the next `/ask` gets a fresh session. `404` if hidden |
| `POST /mcp` | Bearer, `MCP_ROLES` | MCP Streamable HTTP, when `MCP_ENABLED=true` |
| `GET /.well-known/oauth-protected-resource/mcp`, `GET /.well-known/oauth-authorization-server` | public | MCP OAuth discovery |
| `POST /register`, `GET /authorize`, `POST /token` | public | MCP OAuth: client registration, authorization with PKCE, token |
| `GET`, `POST /oauth/consent` | session | Consent screen naming the MCP client |
| `GET /api`, `GET /api-json` | public | Swagger UI and the OpenAPI document, when `SWAGGER_ENABLED=true` |

Every route needs a session unless marked `@Public()`. Swagger is mounted outside the guard chain, so `SWAGGER_ENABLED` is its only protection; leave it `false` in production. Requests other than `GET`/`HEAD`/`OPTIONS` must come from `PUBLIC_ORIGIN`.

Teachers get the `teacher` role and can edit; personnel, students, parents and super-admins get `user` and can only use. Guests and unknown profiles are refused. To change this mapping, see [`docs/INTEGRATION_GUIDELINES.md`](docs/INTEGRATION_GUIDELINES.md). An assistant is visible to its owner, or once published to users of its school whose classes match its `classes`, or to the whole school when `classes` is empty. `model` must be one of `ENT_ALLOWED_MODELS`. The session is a signed cookie, `__Host-alegria`, with a 30-minute sliding idle timeout and an 8-hour maximum age.

## MCP

With `MCP_ENABLED=true`, `/mcp` serves a `whoami` tool, and Alegria acts as the OAuth 2.1 authorization server for MCP clients. Sign-in still goes through the ENT.

To connect a client such as claude.ai or Claude Desktop, add a custom connector with the URL `https://<your domain>/mcp`. The client then:

1. discovers the server through `/.well-known/oauth-protected-resource/mcp` and registers itself;
2. opens `/authorize` in your browser, which runs the ENT login, then a consent screen naming the client;
3. receives an access token bound to `/mcp`, valid for `MCP_TOKEN_SECONDS` (1 hour by default). No refresh token is issued: when it expires, the client asks you to sign in again.

Only roles listed in `MCP_ROLES` (`teacher` by default) can connect; others are refused at the consent screen and on `/mcp`. The ENT session cookie is not accepted on `/mcp`, and the ENT access token never reaches the client. Locally, against the mock ENT, use `http://localhost:3000/mcp`.

## Scripts

| Script | |
| --- | --- |
| `pnpm build` | Builds `web/` then the API |
| `pnpm start:prod` | Runs the built API and app on `127.0.0.1:$PORT` |
| `pnpm check` | Prettier and ESLint |
| `pnpm test` | Unit tests |
| `pnpm test:e2e` | End-to-end tests: boots the app against the mock ENT and runs the login flow and assistant routes over HTTP |
| `pnpm --filter alegria-web test` | Web app tests (Vitest, jsdom): loading, login errors, Welcome, logout and the assistants list |

## Contributing

Contributions are welcome. Open or pick an issue first; [`good first issue`](https://github.com/julienbrg/alegria/labels/good%20first%20issue) is a good place to start. Before you open a pull request, run `pnpm check` and the tests. See [CONTRIBUTING.md](CONTRIBUTING.md) for setup, conventions and the review flow.

## Contact

**Julien Béranger** ([GitHub](https://github.com/julienbrg))

- Element: [@julienbrg:matrix.org](https://matrix.to/#/@julienbrg:matrix.org)
- Farcaster: [julien-](https://warpcast.com/julien-)
- Telegram: [@julienbrg](https://t.me/julienbrg)

## License

[AGPL-3.0-or-later](LICENSE).
