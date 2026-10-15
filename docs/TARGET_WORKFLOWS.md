# Target workflows

How students and teachers will reach Alegria in three ways: from the ENT, from their LLM client, and from a custom frontend, with a mobile app as a possible fourth. All of them sign in through the ENT. These flows are planned, not built: each step that depends on unbuilt work links to its issue.

## Common ground

- **Identity comes only from the ENT.** Whatever the entry point, the user signs in on the ENT's login page, and Alegria reads their profile, school and classes from it. Nobody creates an account.
- **Same rules everywhere.** Teachers create and edit assistants; staff, students and parents use the assistants published to their school or class. Every entry point calls the same services with the same checks (see [INTEGRATION_GUIDELINES.md](INTEGRATION_GUIDELINES.md#how-roles-are-dispatched)).
- **One conversation per user and assistant.** The server owns it ([#54](https://github.com/julienbrg/alegria/issues/54)), so a student can start in the ENT and continue in Claude or on a teacher's site.
- **Shared limits.** The per-user rate limit ([#45](https://github.com/julienbrg/alegria/issues/45)) and the per-school budget ([#46](https://github.com/julienbrg/alegria/issues/46)) count every entry point together. Each call is logged with its entry point ([#40](https://github.com/julienbrg/alegria/issues/40)).

## 1. ENT

Tracked in [#70](https://github.com/julienbrg/alegria/issues/70).

### Before anything

The school's ENT administrator has registered Alegria as an OAuth 2.0 connector (see [INTEGRATION_GUIDELINES.md](INTEGRATION_GUIDELINES.md#register-the-connector)). Whether the ENT opens it in a new tab or an iframe is still to be checked on enthdf.fr ([#58](https://github.com/julienbrg/alegria/issues/58)).

### Student

1. In the ENT, the student clicks the Rukh tile.
2. Alegria opens. The ENT session is already open, so there is no login page and no consent screen.
3. The home page lists the assistants published to their school or class ([#55](https://github.com/julienbrg/alegria/issues/55)).
4. They pick one and chat. Answers stream in, built from the teacher's instructions and documents ([#53](https://github.com/julienbrg/alegria/issues/53)). The page shows which provider receives their messages.
5. "New conversation" starts afresh.

### Teacher

Same entry, plus:

1. "New assistant": title, model, classes ([#56](https://github.com/julienbrg/alegria/issues/56)).
2. Instructions, links, then documents: they upload a PDF or office file, review the Markdown draft, and save it ([#57](https://github.com/julienbrg/alegria/issues/57)).
3. "Publish" makes the assistant visible to the chosen classes, or to the whole school.

### Expiry and logout

The session lasts 30 minutes of inactivity, 8 hours at most. After that, the next click goes back through the ENT, silently if the ENT session is still open. "Log out" clears the Alegria session only.

### Data

The browser talks to Alegria only. Alegria sends the question and the assistant's context to the model provider chosen by the teacher.

## 2. LLM connector

Tracked in [#71](https://github.com/julienbrg/alegria/issues/71).

### Before anything

- The school allows MCP for the user's role ([#61](https://github.com/julienbrg/alegria/issues/61)). Teachers by default; students only if the school decides so, after reading the guidance on minors ([#69](https://github.com/julienbrg/alegria/issues/69)).
- The user has an account on the LLM client, and a plan that allows custom connectors. Claude's consumer terms require users to be 18 or older; ChatGPT allows 13 and older with parental consent.

### One-time setup

1. In the LLM client, the user adds a custom connector with the URL `https://<domain>/mcp`:
   - Claude: Settings → Connectors → Add custom connector ([#64](https://github.com/julienbrg/alegria/issues/64))
   - Le Chat: Connectors → Add connector ([#65](https://github.com/julienbrg/alegria/issues/65))
   - ChatGPT: depends on plan and developer mode ([#66](https://github.com/julienbrg/alegria/issues/66))
2. They click Connect. A browser tab opens on Alegria.
3. The tab goes to the ENT login page, skipped if the ENT session is already open.
4. Alegria shows a consent screen naming the client, for example: "Claude wants to use Rukh as Jeanne D., student, 2nde B." They click Allow.
5. The tab returns to the client, which shows the connector as connected.

### Student

1. They write: "Ask my SVT assistant to explain photosynthesis."
2. The client calls `list_assistants`, which returns only the assistants visible to them, then `ask_assistant` ([#62](https://github.com/julienbrg/alegria/issues/62)). Clients usually ask the user to allow each tool the first time.
3. Alegria answers from the assistant's context. The client relays the answer, often rephrased.
4. Follow-up questions continue the same Alegria conversation.

### Teacher

Same setup. They can also ask the client to create an assistant, update its settings, add a document or a link ([#63](https://github.com/julienbrg/alegria/issues/63)). Ownership is checked as in the ENT interface.

### Expiry and disconnection

The token lasts one hour (`MCP_TOKEN_SECONDS`) and has no refresh token. When it expires, the client shows "Reconnect" and the user goes through steps 2 to 5 again: two clicks if the ENT session is open. Removing the connector in the client stops further calls; the current token stays valid until it expires.

### Data

The question goes from the user to the LLM provider, which calls Alegria; Alegria calls the assistant's model provider and returns the answer to the LLM provider. Two providers see the exchange, and the school chooses only the second one. The ENT access token never leaves Alegria.

## 3. Custom UI

Tracked in [#71](https://github.com/julienbrg/alegria/issues/71).

A custom UI is a frontend on another origin, such as a teacher's website or a mobile app, that uses the Alegria API.

### Before anything

The operator registers the frontend as a client: name, origin and redirect URL ([#67](https://github.com/julienbrg/alegria/issues/67)). Only registered origins can call the API from a browser.

### Student

1. They open the teacher's site, for example `svt-martin.fr`, and click "Sign in with the ENT".
2. The browser goes to Alegria, then to the ENT login page, skipped if the ENT session is open.
3. Alegria shows a consent screen naming the site: "Mme Martin's site wants to use Rukh as you." They click Allow.
4. Back on the site, the page receives an access token and a refresh token ([#68](https://github.com/julienbrg/alegria/issues/68)).
5. The page lists the assistants, possibly only Mme Martin's, and chats with them through the API.

### Teacher

The same sign-in. What a teacher can do depends on what the frontend offers; the API applies the same role and ownership checks as the ENT interface.

### Expiry and logout

The refresh token keeps the user signed in without prompts until it expires or they log out. Logging out on the site revokes it.

### Data

The browser talks to Alegria directly. The site's server sees neither the messages nor the tokens, unless the site is built to relay them.

## 4. Mobile app (future)

Not planned yet: no issue tracks it. A native iOS or Android app would be a custom UI that is not a web page, and would reuse the same API tokens ([#67](https://github.com/julienbrg/alegria/issues/67)) and refresh tokens ([#68](https://github.com/julienbrg/alegria/issues/68)).

### Sign-in

1. The user opens the app and taps "Sign in with the ENT".
2. The app opens Alegria in the system browser sheet (`ASWebAuthenticationSession` on iOS, Custom Tabs on Android), never in an embedded web view, as [RFC 8252](https://www.rfc-editor.org/rfc/rfc8252) requires. If the user is already signed in to the ENT in that browser, the login page is skipped.
3. Consent screen naming the app, then back to the app through a claimed HTTPS link (universal link or app link).
4. The app keeps the refresh token in the Keychain or Keystore, so the user stays signed in across launches.

### What differs from a web frontend

- **Registration.** The app is a public client like a web frontend, but registered with a claimed HTTPS redirect URL instead of an origin. CORS does not apply.
- **Origin check.** A native app sends no `Origin` header, so token requests must not go through the origin check on writes, which only applies to cookie requests.
- **Distribution.** App store age ratings and privacy labels add their own requirements for an app aimed at minors, to read alongside [RESOURCES.md](RESOURCES.md).
- **Possible additions.** Push notifications, for example when a teacher publishes an assistant to a class, would need a new consent and new data, and are out of scope for now.

## At a glance

| | ENT | LLM connector | Custom UI |
| --- | --- | --- | --- |
| Entry | Rukh tile in the ENT | Custom connector in Claude, Le Chat or ChatGPT | Sign-in button on another site |
| Sign-in | ENT session, no prompt | ENT login, then consent | ENT login, then consent |
| Credential | Session cookie | Access token for `/mcp`, 1 hour | Access token for the API, plus refresh token |
| Staying signed in | 30 minutes idle, 8 hours max | Reconnect every hour | Silent refresh |
| Who decides access | Role mapping | School, per role ([#61](https://github.com/julienbrg/alegria/issues/61)) | Operator registers the site |
| Providers seeing questions | Assistant's model provider | LLM provider and assistant's model provider | Assistant's model provider |
| Status | [#70](https://github.com/julienbrg/alegria/issues/70) | [#71](https://github.com/julienbrg/alegria/issues/71); OAuth server and `whoami` done | [#71](https://github.com/julienbrg/alegria/issues/71) |

## Open design points

Discussed in [#60](https://github.com/julienbrg/alegria/issues/60#issuecomment-6111946820):

- **Token scope for custom UIs.** A frontend's token carries everything the user can do, so a teacher's site could call any assistant visible to the student, not only that teacher's. Option: bind each registered frontend to an owner.
- **Remembered consent.** A registered frontend shows the consent screen on every sign-in. Option: remember consent per user and client.

## Issues

- [#70](https://github.com/julienbrg/alegria/issues/70) Track core: `/ask`, chat and teacher screens: [#53](https://github.com/julienbrg/alegria/issues/53), [#54](https://github.com/julienbrg/alegria/issues/54), [#45](https://github.com/julienbrg/alegria/issues/45), [#55](https://github.com/julienbrg/alegria/issues/55), [#56](https://github.com/julienbrg/alegria/issues/56), [#57](https://github.com/julienbrg/alegria/issues/57), [#58](https://github.com/julienbrg/alegria/issues/58), [#59](https://github.com/julienbrg/alegria/issues/59)
- [#71](https://github.com/julienbrg/alegria/issues/71) Track access from LLM clients and frontends: [#60](https://github.com/julienbrg/alegria/issues/60), [#72](https://github.com/julienbrg/alegria/issues/72), [#61](https://github.com/julienbrg/alegria/issues/61), [#62](https://github.com/julienbrg/alegria/issues/62), [#63](https://github.com/julienbrg/alegria/issues/63), [#64](https://github.com/julienbrg/alegria/issues/64), [#65](https://github.com/julienbrg/alegria/issues/65), [#66](https://github.com/julienbrg/alegria/issues/66), [#67](https://github.com/julienbrg/alegria/issues/67), [#68](https://github.com/julienbrg/alegria/issues/68), [#69](https://github.com/julienbrg/alegria/issues/69)
- [#52](https://github.com/julienbrg/alegria/issues/52) Track usage cost controls: [#40](https://github.com/julienbrg/alegria/issues/40), [#41](https://github.com/julienbrg/alegria/issues/41), [#42](https://github.com/julienbrg/alegria/issues/42), [#43](https://github.com/julienbrg/alegria/issues/43), [#44](https://github.com/julienbrg/alegria/issues/44), [#46](https://github.com/julienbrg/alegria/issues/46), [#47](https://github.com/julienbrg/alegria/issues/47), [#48](https://github.com/julienbrg/alegria/issues/48), [#49](https://github.com/julienbrg/alegria/issues/49), [#50](https://github.com/julienbrg/alegria/issues/50), [#51](https://github.com/julienbrg/alegria/issues/51)
