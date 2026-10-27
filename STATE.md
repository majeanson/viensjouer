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
| **Where** | `../viensjouer/`, its own git repo. No remote yet. **Not deployed.** |
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

- [ ] **Phase 1, finish.** Create the D1 database (`wrangler d1 create viensjouer`, paste
      the id), set `SESSION_SECRET`, deploy to `*.workers.dev`, walk it with two real
      emails on two phones. Decide the public address (`viensjouer.marcportal.com` is
      commented in `wrangler.toml`).
- [ ] **Phase 2 — the link.** « Créer mon compte » from a reply page, prefilled with the
      family's details → a bilateral child link (`friend_families.linked_household_id`
      exists for it). Le cercle de l'enfant as faces. The day-before reminder email
      (`invitations.remind_at` exists; needs a cron). Password reset (copy Babillard's
      `auth/forgot` + `auth/reset`, hash-only token rows).
- [ ] **Phase 3 — the rhythm.** Recurring rencontres (« tous les samedis au parc », each
      family answers per week). « Une fenêtre ouverte » (« on est libres dimanche pm »,
      to chosen families, expires). Groups (the daycare class). The circle calendar with
      derived birthdays.
- [ ] **Phase 4 — the three kinds, finished.** Home: the home card (dog, pool, screens,
      nut-free) attached once; the relais note after a drop-off. Birthday: RSVP count,
      allergies asked, soft gift wish. Park: « on y est » the day of. Souvenirs: a photo
      back to the families who were there (needs R2).
- [ ] **Phase 5 — the stranger walk.** Playwright as the invited parent on a phone, FR
      and EN. A second parent per household (`parents` is already many-per-household).
      Measure the reciprocity door.

**Not v1, by decision:** SMS (costs per send; email + copy-link first), a native app,
chat beyond the per-card thread, push notifications, discovery or public profiles,
anything that ranks families or children, a bridge to Babillard (later: a confirmed
rencontre could land on the board as an event).

## 5. Process notes

- A guard that has never been red proves nothing: plant the defect, watch it fail, restore.
- A ledger entry is a verdict from a moment; grep the code before building on it.
