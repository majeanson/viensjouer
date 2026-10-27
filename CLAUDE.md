# CLAUDE.md — Viens jouer

> **Asked « what should we work on? » — read [`STATE.md`](./STATE.md) first.** It holds
> the snapshot, the ranked plan and the conventions. This file is the short law.

## What this is

Parents coordinate their toddlers' get-togethers: a park meet-up, a play-date at home, a
birthday. The host has an account; **the invited parent answers from a link with no
account** (`/r/<token>`). Over time both families join and it becomes the hub of a
child's circle. Sibling of Babillard (`../PlannerOrSomething`) and Horizon
(`../horizon`), same house stack, own repo.

## Commands

```bash
npm run dev              # Vite, HMR on :5173, /api proxied to :8787
npm run cf:dev           # wrangler dev on :8787 (SPA + Worker + local D1)
npm run db:migrate:local # apply migrations to local D1 (before cf:dev the first time)
npm run typecheck · npm test · npm run build   # the three gates
npm run deploy           # build + wrangler deploy (CI does this on main)
```

Local needs `.dev.vars` (copy `.dev.vars.example`; `SESSION_SECRET` ≥ 32 chars).

## Architecture in six lines

- `worker/index.ts` — the only deploy target. Non-`/api/*` → `ASSETS` (SPA fallback);
  `/api/*` → `worker/routes.ts` table → a handler under `functions/api/`. CSRF gate inline.
- `functions/_lib/route.ts` `authed()` — the structural guard for signed-in endpoints.
- `functions/_lib/auth.ts` — versioned HMAC session cookie + CSRF pair. One credential kind.
- `functions/api/r/[token].ts` — the install-free side; the token IS the credential.
- `src/lib/api.ts` — the only path to `/api/*`. `src/lib/query.ts` — the keys.
- `src/i18n.ts` — FR first, `typeof FR` is the EN parity contract.

## Rules

- **Adding an endpoint needs BOTH** the handler file AND a row in `worker/routes.ts`.
- Writes go through `api()`; reads through TanStack Query with a key from `query.ts`.
- New migration = next number, forward-only, follows `0001_init.sql`'s header conventions.
- Calm, toned down: ordinary interactions are fine; **no score, streak, rank or badge**
  — `calm-tenets.test.ts` fails the build on any of them in the schema.
- Other people's children: no photos in v1, no discovery, no public profile; the
  address shows only on a yes.
- Mobile first; the reply page is the surface most people ever see.
- Push straight to `main`; CI gates the deploy; fix forward. Update `STATE.md` in the
  same commit as the work.
