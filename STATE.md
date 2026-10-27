# STATE.md — where Viens jouer is, what's next, how we work

> The one front door. Asked « what should we work on? » — read this, not the code.
> Update it in the SAME commit as the work it describes. Kept short on purpose: what
> shipped goes to git, what is left stays here.

---

## 1. Snapshot

| | |
| --- | --- |
| **What it is** | Parents coordinate their toddlers' get-togethers — a park meet-up, a play-date at home, a birthday. The host has an account; the invited parent answers from a **link, with no account and no app**. Over time both families have accounts and the app is the hub of a child's social circle. |
| **Stack** | Vite + React SPA, one Cloudflare Worker (`worker/index.ts`: static assets + `/api/*`), D1, Resend for mail (optional). FR-CA first, EN behind `typeof FR`. Same house shape as Babillard and Horizon. |
| **Where** | `../viensjouer/`, its own git repo → `github.com/majeanson/viensjouer`, push to `main`. **Live: https://jouer.marcportal.com** (also `viensjouer.<account>.workers.dev`). D1 `viensjouer` (ENAM). |
| **The link** | `jouer.marcportal.com/xxxx-xxxx` — an 8-char no-lookalike code per invited family (`_lib/ids.ts`), short enough to write on a paper; `/r/<code>` works too; case and hyphen forgiven. |
| **Written** | 2026-10-27, scaffolded from the plan agreed that day (see §4). |

### Health signals (run before quoting)

- `npm run typecheck` · `npm test` · `npm run build` — the three gates; CI runs them and gates the deploy on `main`.
- Build-gating guard: `functions/db/migrations/calm-tenets.test.ts` — no `streak` / `points` / `badge` / `score` / `rank` / `leaderboard` anywhere in the schema. Seeing a friend is never a number.

## 2. Conventions (the law, short form)

- **Reuse before you create.** Read the page you are touching; extend what is there.
- **Every `/api/*` endpoint = a handler under `functions/api/` + a row in `worker/routes.ts`.** Signed-in handlers wrap in `authed()` (`functions/_lib/route.ts`). The reply-link handlers (`functions/api/r/*`) are deliberately NOT: the token in the path is the credential.
- **The SPA reaches the API only through `src/lib/api.ts`** (CSRF echo, credentials, locale).
- **TanStack Query owns server state**; keys in `src/lib/query.ts`.
- **Migrations are forward-only, numbered, filename-locked.** Conventions in `0001_init.sql`'s header: `created_at` / `updated_at` / `deleted_at`, `kind` vs `status`, `position`, `colour`, soft refs commented.
- **Copy is Québécois** (courriel, fête, « on »). Every key in FR must exist in EN or `tsc` fails.
- **Mobile first, the reply page above all** — it is opened from a text message, on a phone, by someone who has never seen the app.
- **Push straight to `main`.** CI is the gate; fix forward.

## 3. What just shipped

### Skeleton — 2026-10-27

Phase 1 of the plan, end to end: signup / login / logout / me (email + password, PBKDF2,
versioned session cookie, CSRF double-submit, rate-limit bindings), children, the friend
families book, rencontres with one invitation link per family, the install-free reply
page (`/r/<token>`: yes / maybe / no + a note + the family's details once, address only
on yes), a per-card thread both sides can write to, `.ics` download, invitation email
through Resend when wired, confirm / cancel / delete. 10 unit tests.

## 4. What still needs doing — the plan, ranked

**The shape (decided 2026-10-27).** Not a one-shot invite tool: a hub that both families
end up living in. The install-free reply page is the on-ramp; the destination is the
child's circle. Calm toned down vs Babillard — ordinary interactions are fine (a
reminder someone asked for, a thread) — but nothing that turns a friendship into a
score. Growth is one family at a time through real invites, never discovery.

- [ ] **Phase 1, finish.** Deployed 2026-10-27 at jouer.marcportal.com (D1 created,
      `SESSION_SECRET` set, migration applied, `RESEND_API_KEY` = a Resend « Sending
      access » key named `viensjouer`, minted that day; `/api/health` says `mail: true`).
      `CLOUDFLARE_API_TOKEN` set on the repo the same evening (a dashboard token named
      `viensjouer-ci`: Workers Scripts · Workers Routes · D1 edit, Account Settings ·
      Zone read) — **push-to-deploy proven green** (run 40576969911). Left: walk it with
      two real emails on two phones.
- [x] **Phase 2 — the link. Shipped 2026-10-27.** `POST /api/r/<code>/claim` turns a reply into a household (origin 'reply'), a child, a bilateral `child_links` row and a reciprocal book entry; `/cercle` shows each child's linked friends (last / next date, never a count) and either side can cut the link; the reminder checkbox sets `remind_at` and an hourly cron (`functions/_lib/reminders.ts`) sends the one email; password reset (`/oubli`, `/reinitialiser`, hash-only token, signs other devices out). Migration 0002.
- [x] **Phase 3 — the rhythm. Shipped 2026-10-27.** Weekly series (up to 12 occurrences, wall time computed in the browser so DST cannot shift it; each week is its own rencontre with its own answer, the reply page lists the following weeks, "annuler toute la série"); "fenêtres ouvertes" (`/fenetres`, family link at `/w/xxxx-xxxx`, dies at its end); groups (private shortcuts in the family picker); the circle calendar (`/calendrier`: mine, the ones linked families invite me to, windows, derived birthdays — Feb 29 on Feb 28). The friend's birthdate is now on the book entry. Migration 0003.
- [x] **Phase 4 — the three kinds. Shipped 2026-10-27.** Home: the home card (`/enfants` ▸ Chez nous; dog · pool · screens · nut-free · a line) shown on the invitation BEFORE the answer, and the relais note (nap · ate · mood · a word, expires in a week, only the family it was written for sees it). Birthday: gift wish, RSVP counts (adults / kids) with a total on the host card, allergies shown per family. Park: « On y est » / « On est partis », only from 3 h before to 6 h after (`hereAllowed`). Souvenirs: photos to R2 (`viensjouer-photos`), shrunk to 1600 px JPEG in the browser, magic-byte checked server-side (no SVG), 12 per rencontre, host or any family that said yes, visible 60 days to the families that said yes, freed when the rencontre is deleted. Migration 0004.
- [x] **Phase 5 — hardening. Shipped 2026-10-27.** The other parent (`/rejoindre?t=…`, one-use, 7 days, 3 open at most, same household); « Essayer sans compte » (`POST /api/demo`: a seeded sandbox household, swept after 24 h at the next mint, capped at 50, never able to send mail or invite a parent; `demo.test.ts` fails the build if a migration table is missing from the sweep); the Playwright walk of the invited parent (`e2e/reply.spec.ts`, iPhone viewport, FR + EN, 320 px per-child overflow bounds, axe serious/critical — the overflow guard was planted red before being trusted). Migration 0005. « Garder ma maisonnée » (`/garder`, `POST /api/demo/claim`) turns a sandbox into a real account IN PLACE (the parents row gets a real email + password, the household flips to kind real so the sweep stops matching it; the old session dies, a new one is issued; same data).
- [ ] **Left for a human:** walk it on two real phones with two real emails; the e2e stubs the API, so the Worker is proven by the wrangler-dev walks, not by Playwright; decide the two Dependabot majors.

**Data rule (Marc, 2026-10-27): nothing personal is required — a name and an email are enough for everything core.** Every optional field (birthdates, address, phone, allergies, notes, home card, relais, photos) shows a « why we ask / what you lose if you skip it » line (`components/Why.tsx`, copy in `i18n.why`), and `/confidentialite` states the purpose, where it is hosted (Cloudflare: Worker + D1 in ENAM + R2; Resend for mail) and how to remove it all. `/compte`: download everything (`GET /api/export`, no secrets) and « Tout effacer » (`DELETE /api/household`, password-gated, immediate, hard delete through `deleteHouseholds` — the same path as the sandbox sweep). **New features follow the rule: no home addresses on a map, no new personal fields; a map would hold public places only.** Soft-deleted rows (a removed child, family or rencontre) stay hidden in D1 until « Tout effacer » — say so, or add a purge.

**Not v1, by decision:** SMS (costs per send; email + copy-link first), a native app,
chat beyond the per-card thread, push notifications, discovery or public profiles,
anything that ranks families or children, a bridge to Babillard (later: a confirmed
rencontre could land on the board as an event).

## 5. Process notes

- A guard that has never been red proves nothing: plant the defect, watch it fail, restore.
- A ledger entry is a verdict from a moment; grep the code before building on it.
