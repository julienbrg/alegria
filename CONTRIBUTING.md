# Contributing

How to set up Alegria, run its checks and get a change merged.

## Prerequisites

- [Node.js](https://nodejs.org/) 24, the version CI runs
- [pnpm](https://pnpm.io/), at the version pinned in `packageManager` in `package.json`. Use pnpm only; the repository has no npm or Yarn lockfile

## Setup

```sh
pnpm install
cp .env.example .env
```

The example config runs against the mock ENT, so you can sign in as a teacher, staff member, student, parent or super-admin without a real Edifice instance. See [Develop](README.md#develop) to run the API and the app.

## Checks

CI runs these on every pull request. Run them before you push:

| Command | |
| --- | --- |
| `pnpm check` | Prettier and ESLint. `pnpm format` and `pnpm lint` fix what they can |
| `pnpm test` | API unit tests |
| `pnpm test:e2e` | End-to-end tests against the mock ENT |
| `pnpm --filter alegria-web test` | Web app tests |
| `pnpm build` | Typecheck and build the app and the API |

New behavior comes with tests.

## Issues

Open or pick an issue before you start, so the work is agreed on first. Issues labelled [`good first issue`](https://github.com/julienbrg/alegria/labels/good%20first%20issue) are a good place to start. The order of the current milestone is in the pinned tracking issue, [#15](https://github.com/julienbrg/alegria/issues/15).

The title starts with an imperative verb: `Add`, `Fix`, `Improve` or `Remove`. The body depends on the kind:

- **Bug** (`bug`): Description, Steps to reproduce, Expected behavior, Actual behavior, Environment
- **Feature** (`enhancement`): Problem, Proposed solution, Alternatives considered, Acceptance criteria as a checklist
- **Docs, chore, refactor, CI** (`documentation` for docs only, otherwise `enhancement`): Summary, Why, Done when as a checklist

## Branches and pull requests

- One branch per issue, created from `main`: `gh issue develop <number> --checkout`
- Give the pull request the same title as the issue. In the body, write a Summary, Changes and How to test, then `Closes #<number>`
- Pull requests are squash-merged once CI is green

## Commits

Keep each commit small and about one thing. Write the title in lowercase and the imperative, with no trailing period, for example `add recovery route`. Add a body only when the change needs explaining.

## Changelog

Add your change to `CHANGELOG.md` under `[Unreleased]`, in the [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) format. Update `README.md` and `docs/` in the same pull request when your change affects them.

## License

By contributing, you agree that your contributions are licensed under [AGPL-3.0-or-later](LICENSE).
