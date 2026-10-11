# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- NestJS backend with environment validation for the ENT module variables
- Edifice OAuth 2.0 login: `/auth/login`, `/auth/callback` with a `state` cookie, `/auth/logout`
- Signed session cookie `__Host-rukh` with a 30-minute sliding idle timeout and an 8-hour maximum age
- Edifice profile to role mapping: Teacher to `teacher` (can edit); Personnel, Student, Parent and Super-admin to `user` (can only use); others refused
- Global deny-by-default session guard with `@Public()` opt-out, and an Origin check on non-GET requests
- `GET /me` returning role, schools, classes and allowed models
- Optional MCP Streamable HTTP endpoint on `/mcp` with a `whoami` tool, behind `MCP_ENABLED` and `MCP_ROLES`
- Mock ENT OAuth provider on `/mock-ent` for development, behind `ENT_MOCK`; `.env.example` runs against it out of the box
- Vite, React, React Router and Chakra UI app in `web/`, served by Nest in production, with Helmet CSP
- "Welcome, <profile>!" landing page; the assistants page moves to `/assistants`
- `docs/RESOURCES.md`: legal constraints for a classroom AI assistant in French schools, how Rukh meets each one, and resources
- Black background, white text and `#45a2f8` links across the app and the mock ENT page
- Log out button on the Welcome page; buttons use a `#8c1c84` background
- `profile` (Teacher, Personnel, Student, Parent or Super-admin) in the session, `/me` and the MCP `whoami` tool
- Technical specification in `.claude/spec.md`, referenced from `.claude/CLAUDE.md`
- `publish` workflow that syncs `.claude/spec.md` to julienberanger.com/ent-module-spec on push to `main`, with a dry-run diff on pull requests
- `docs/TEMPLATING.md`: existing Edifice starters, the parts of Rukh ENT any external ENT connector needs, and the shape of a reusable connector template
- End-to-end auth tests (`pnpm test:e2e`, run in CI) against the mock ENT: login for each profile, refused profiles, `state` and Origin checks, logout, and a test that every route without `@Public()` returns 401
- `guest` mock ENT profile, refused at login
- `docs/INTEGRATION_GUIDELINES.md`: registering the connector with an ENT, env vars, the OAuth callback and `PUBLIC_ORIGIN`; how ENT profiles map to roles, where roles are enforced, and how to change the mapping with what each change exposes. Linked from `README.md` and `docs/TEMPLATING.md`
- Vitest and Testing Library in `web/` (`pnpm --filter rukh-ent-web test`, run in CI), with tests for the app's auth states: loading spinner, Login on 401, `?error=refused` and `?error=state` messages, Welcome with the profile, and Log out
- `CONTRIBUTING.md`: setup, checks, issue, branch, commit and pull request conventions, and licensing of contributions; linked from the README
- Swagger UI on `/api` and the OpenAPI document on `/api-json` when `SWAGGER_ENABLED=true`, with the `__Host-rukh` session cookie as the default security scheme, `@Public()` routes marked anonymous and the mock ENT left out; e2e tests for both settings
- SQLite storage on better-sqlite3: `data/rukh-ent.db` (`DB_PATH`, `:memory:` in tests) in WAL mode with foreign keys on, and numbered `.sql` migrations tracked with `PRAGMA user_version`, applied at startup in one transaction so a failed migration stops startup and leaves the database unchanged
- `assistants` and `conversations` tables; assistant documents stay as Markdown under `data/contexts/<name>/`
- Assistants module: `GET /context` lists the assistants visible to the caller, `POST /context` creates a draft (teachers only, name generated as `hdf-<uai>-<slug>-<6 chars>`, owner and school from the session), and `GET`, `PATCH` and `DELETE /context/:name`. Visible to the owner, or once published to the same school with a matching or empty class list; hidden assistants return 404. Only the owning teacher edits or deletes; `model` must be one of `ENT_ALLOWED_MODELS`
- `/assistants` page lists the visible assistants with their model, classes and a draft badge
- README `Test` section
- OAuth 2.1 authorization server for MCP clients, on the MCP SDK auth router: discovery metadata, dynamic client registration, `/authorize` with S256 PKCE, and `/token`. Sign-in goes through the ENT login, then a consent screen naming the client. Access tokens are bound to `/mcp`, carry the ENT user id, profile and role, last `MCP_TOKEN_SECONDS` (1 hour by default) and come without refresh tokens
- `oauth_clients` and `oauth_codes` tables; codes are single-use, stored hashed and expire after 60 seconds
- `docs/RESOURCES.md`: GAR requirements for resource providers from the GAR contract (v2026), with Rukh ENT's answer or what is missing for each, and links to the GAR documentation
- `next` parameter on `/auth/login`: a same-origin path to land on after login
- README section on connecting an MCP client
- `docs/TARGET_WORKFLOWS.md`: the three target ways in, from the ENT, an LLM connector (Claude, Le Chat, ChatGPT) and a custom frontend, step by step for students and teachers, with expiry, data flow, a comparison table, a possible future mobile app, open design points and links to the tracking issues; linked from the README

### Changed

- `main.ts` setup (Helmet, cookie parser, validation pipe) moved to `configureApp()` in `src/app.setup.ts`, shared with the e2e tests
- License switched from LGPL-3.0-or-later to [AGPL-3.0-or-later](LICENSE)
- `.claude/spec.md` roles aligned with the code: `teacher` (Teacher, can edit) and `user` (Personnel, Student, Parent, Super-admin, can only use); the session snippet carries `profile`
- `docs/notes/` is ignored by git, for local research notes
- API unit and end-to-end tests run on Vitest instead of Jest, with SWC for decorator metadata; `--experimental-vm-modules` is no longer needed
- `/mcp` accepts only Bearer tokens from the MCP OAuth flow, and returns 401 with `WWW-Authenticate` otherwise; the ENT session cookie no longer works there. `MCP_ROLES` is enforced on the token's role, and `whoami` returns the token's user
