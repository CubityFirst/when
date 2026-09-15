# Contributing

## Setup

```bash
npm install
npm run db:local          # apply schema.sql to the local D1
npx wrangler dev          # worker + assets on :8787
npm run dev               # optional: Vite HMR on :5173, proxying /api to :8787
```

## Tests

The test scripts drive a running worker over HTTP rather than mocking it, and they
default to `127.0.0.1:8788` — not the `:8787` that plain `npx wrangler dev` uses. Start
the worker on the port they expect, then run them against it:

```bash
npx wrangler dev --port 8788
node scripts/test-events.mjs     # each file is standalone
```

Every script but `test-events.mjs` takes a base URL as `argv[2]`, so you can point one
at another instance. They create their own events and clean up after themselves, so
they're safe to re-run. Anything touching the API should come with a script here.

Before opening a pull request, `npm run build` must pass — it runs `tsc -b` across the
app, worker and shared configs, so a type error anywhere fails the build.

## Commits

This project uses [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/).
Each message is `type(scope): subject`, where the scope is optional:

```
feat(event): list who has replied under the reply count
fix(worker): stop maybe votes counting twice towards quorum
docs: explain the 8788 port the tests expect
```

Types used here:

| Type       | For                                                            |
| ---------- | -------------------------------------------------------------- |
| `feat`     | a new capability someone using the site would notice            |
| `fix`      | a bug fix                                                       |
| `docs`     | documentation only                                              |
| `style`    | formatting with no change in behaviour                          |
| `refactor` | restructuring that neither fixes a bug nor adds a feature       |
| `perf`     | a change made for performance                                   |
| `test`     | adding or correcting test scripts                               |
| `build`    | build setup, dependencies, Wrangler or Vite config              |
| `chore`    | anything else that doesn't touch `src/`, `worker/` or `shared/` |

Useful scopes: `event`, `group`, `vote`, `worker`, `db`, `ui`.

Write the subject in the imperative and lower case, with no full stop — "add", not
"added" or "Adds". Keep it under about 72 characters; put the reasoning in the body,
separated by a blank line.

A breaking change takes a `!` before the colon (`feat(api)!: drop the legacy vote
route`) and a `BREAKING CHANGE:` paragraph in the body explaining the migration.

Schema changes belong in their own commit alongside the `migrations/` file that applies
them, so a deploy can be matched to the migration it needs.
