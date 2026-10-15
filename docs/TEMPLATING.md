# ENT connector template

How Alegria relates to the starters Edifice already publishes, which of its parts any external ENT connector needs, and how those parts can become a reusable template.

## Two kinds of ENT modules

An application can join an [ENT](https://fr.wikipedia.org/wiki/Espace_num%C3%A9rique_de_travail) in two ways:

- **Internal module**: runs inside the platform, deployed by the platform operator, built on its framework and frontend libraries.
- **External connector**: runs on its own server and reaches the ENT through single sign-on. The ENT only lists it and vouches for the user.

Alegria is an external connector. It relies on the ENT for identity alone and keeps its own stack, hosting and release cycle.

## Existing starters

[Edifice](https://edifice.io/) publishes its platform, [entcore](https://github.com/edificeio/entcore), and a few starters on [GitHub](https://github.com/edificeio). None is flagged as a [template repository](https://docs.github.com/en/repositories/creating-and-managing-repositories/creating-a-template-repository).

| Repository | What it is | Last push |
| --- | --- | --- |
| [skeletons](https://github.com/edificeio/skeletons) | ODE app and widget generator (`./build.sh createApplication`) | 2019 |
| [edifice-react-boilerplate](https://github.com/edificeio/edifice-react-boilerplate) | React frontend for an Edifice app, [AGPL-3.0](https://www.gnu.org/licenses/agpl-3.0.html) | 2026 |
| [springboard](https://github.com/edificeio/springboard) | Configures and runs the Edifice apps and portal | 2026 |

All three are for internal modules: [Vert.x](https://vertx.io/) and Java on the backend, Edifice's own frontend libraries.

For external connectors, Edifice documents the protocol but ships no code. The [OAuth 2.0 connector page](https://edifice-community.atlassian.net/wiki/x/4YCX8) describes the admin console fields (client id, URL, scope, `code` mode, secret) and the `/auth/oauth2/auth`, `/auth/oauth2/token` and `/auth/oauth2/userinfo` endpoints.

Other platforms used by French schools are in the same position: [Skolengo](https://skolengo.com/en/why-skolengo/skolengo-interconnects-with-over-70-business-connectors) supports CAS and SAML connectors, and the [GAR](https://gar.education.fr/) publishes registration files, but neither offers a starter.

## Generic parts

Any external connector has to build these. In Alegria they live in their own modules:

| Piece | Where |
| --- | --- |
| Edifice OAuth 2.0 authorization code flow, with a `state` cookie | `src/ent/ent-oauth.service.ts`, `src/ent/ent.controller.ts` |
| Signed `__Host-` session cookie, 30-minute idle and 8-hour maximum age | `src/ent/session.service.ts` |
| Edifice profile mapping, guests refused | `src/ent/roles.ts` |
| Deny-by-default guard with `@Public()` opt-out | `src/ent/ent-auth.guard.ts`, `src/ent/public.decorator.ts` |
| Origin check on non-GET requests | `src/ent/origin.middleware.ts` |
| Mock ENT for local development, one login per profile | `src/mock-ent/` |
| Environment validation that refuses the mock and the dev secret in production | `src/config/env.validation.ts` |
| [Vite](https://vite.dev/) app served by [NestJS](https://nestjs.com/), same origin, [Helmet](https://helmet.js.org/) CSP | `src/main.ts`, `web/` |
| Optional [MCP](https://modelcontextprotocol.io/) endpoint behind the ENT session | `src/mcp/` |

## Rukh-specific parts

- The `teacher` and `user` roles in `roleFromProfile`: another application may need different rights per profile. [INTEGRATION_GUIDELINES.md](INTEGRATION_GUIDELINES.md#changing-the-mapping) shows how to change them.
- The features from the [spec](https://julienberanger.com/ent-module-spec): assistants, `/ask`, contexts, visibility by school and class, the model provider layer.
- The licence: Alegria is [AGPL-3.0](https://www.gnu.org/licenses/agpl-3.0.html).

A template made from Alegria itself would carry these into every project built from it, so the template belongs in its own repository, with Alegria as one project built on it.

## Template shape

- **Contents**: `src/ent/`, `src/mock-ent/`, `src/mcp/`, `src/config/`, `src/main.ts` and `web/`, with a welcome page as the only screen.
- **Roles as configuration**: a table from ENT profile to application role, defaulting to a single role for every accepted profile.
- **Provider interface**: authorize URL, token exchange, userinfo to profile. Edifice is the first implementation; Skolengo, CAS or GAR adapters can follow without touching the session layer.
- **Licence**: with no Rukh code inside, the template is free to use a permissive licence such as [MIT](https://choosealicense.com/licenses/mit/).
- **Updates**: projects pull template changes with a sync step that keeps local changes, as projects built on [genji](https://github.com/w3hc/genji) do.

The split is cheapest while the generic layer is still most of the code. Each feature added to Alegria beforehand makes it harder.

## Further reading

- [Edifice technical documentation](https://edifice-community.atlassian.net/wiki/spaces/PUBLIC/pages/1184923821/Documentation+technique)
- [OAuth 2.0, RFC 6749](https://datatracker.ietf.org/doc/html/rfc6749)
- [Alegria technical specification](https://julienberanger.com/ent-module-spec)
