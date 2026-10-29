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
npm run typecheck · npm run knip · npm test · npm run build · npm run check:bundle   # the gates (npm run verify runs them all)
npm run e2e:ci           # Playwright in CI shape (one worker, no retries). API stubbed
SHOTS=1 npx playwright test shots   # screenshots of every screen, phone/small/desktop, light/dark -> screenshots/
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
- Faces are optional and ours only: a photo for the household's own children and parents (shown to invited families on their link's page, nowhere else). Never a photo of another family's child, no discovery, no public profile; the address shows only on a yes.
- Mobile first; the reply page is the surface most people ever see.
- Push straight to `main`; CI gates the deploy; fix forward. Update `STATE.md` in the
  same commit as the work.

## Reuse before you write (the shared pieces)

- **Icons**: `components/Icon.tsx` (no emoji, ever: a build test fails on one). Always beside words, decorative.
- **A group of optional fields**: ONE `WhyMany` (each field named, why it is asked, what skipping costs). A single field: `Why`.
- **Actions are buttons**: `btn` (`btn--small` in a row, `btn--danger` for cancel/delete, `btn--primary btn--big` for the one main action, kept apart from the destructive ones). Never an underlined word: `buttons.test.ts` fails on `linkbtn` outside the undo bar. Plain text links are for going elsewhere (a map, a policy page).
- **A day and an hour**: `WhenInput` (two pickers, one value). Never a bare `datetime-local`. **No see-through buttons**: `btn--ghost` is gone, `buttons.test.ts` guards both.
- **Never `confirm()`**: `lib/toast.tsx` (`done` for reversible, `later`/`useDeferredRemove` for deletes, 6 s undo). An e2e fails on a browser dialog.
- **Faces / pictures**: `Face`, `AvatarPicker` (small square JPEG, server cap 400 KB), `CoverPicture`. All optional; no bucket means no button.
- **The board**: `MessageBoard` on the host page and the invitation. **Rows of choices**: the `.seg` family. **A fold**: `.fold` / `.more`.
- **Copy**: French first, EN parity is a type. `functions/_lib/copyRules.test.ts`: no dead key, no em-dash, no emoji.
- **Pages are lazy** (`src/router.tsx`); `scripts/check-bundle.mjs` holds the first download to a ratcheting budget.

## Guards worth knowing (plant the violation before trusting a new one)

`calm-tenets` (schema) · `demo.test` (every table in the sweep) · `export.test` (query aliases) · `structure.test` (every handler routed, authed or on the written public list, codes rate-limited, client writes only through api(), no confirm()) · `copyRules` · `knip` · `check:bundle` · the e2e a11y + 320 px overflow sweeps · `e2e:real` (the real Worker, no stubs).
