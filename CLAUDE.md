# when

Group availability polling on a Cloudflare Worker + D1, served from `when.cubityfir.st`.
See `README.md` for what it does and `CONTRIBUTING.md` for setup and tests.

## Commits

Use [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) —
`type(scope): subject`, imperative and lower case, no trailing full stop:

```
feat(event): list who has replied under the reply count
fix(worker): stop maybe votes counting twice towards quorum
```

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `chore`.
Scopes in use: `event`, `group`, `vote`, `worker`, `db`, `ui`. Breaking changes take a
`!` before the colon and a `BREAKING CHANGE:` paragraph in the body. The full convention
is in `CONTRIBUTING.md`.

## Gotchas

- Invoke Wrangler as `npx wrangler`, never a global `wrangler`.
- The test scripts in `scripts/` expect a worker on port **8788**, but plain
  `npx wrangler dev` serves **8787** — start it with `--port 8788` before running them.
- `npm run build` runs `tsc -b` over the app, worker and shared configs; treat it as the
  typecheck.
- Schema changes need both a `migrations/` file and the matching edit to `schema.sql`,
  which is the full schema for a fresh database.
