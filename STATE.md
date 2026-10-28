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
- [x] **Phase 3 — the rhythm. Shipped 2026-10-27.** Recurring series: once, every week, every 2 weeks or every month (up to 12 occurrences, wall time computed in the browser so DST cannot shift it; each week is its own rencontre with its own answer, the reply page lists the following weeks, "annuler toute la série"); "fenêtres ouvertes" (`/fenetres`, family link at `/w/xxxx-xxxx`, dies at its end); groups (private shortcuts in the family picker); the circle calendar (`/calendrier`: mine, the ones linked families invite me to, windows, derived birthdays — Feb 29 on Feb 28). The friend's birthdate is now on the book entry. Migration 0003.
- [x] **Phase 4 — the three kinds. Shipped 2026-10-27.** Home: the home card (`/enfants` ▸ Chez nous; dog · pool · screens · nut-free · a line) shown on the invitation BEFORE the answer, and the relais note (nap · ate · mood · a word, expires in a week, only the family it was written for sees it). Birthday: gift wish, RSVP counts (adults / kids) with a total on the host card, allergies shown per family. Park: « On y est » / « On est partis », only from 3 h before to 6 h after (`hereAllowed`). Souvenirs: photos to R2 (`viensjouer-photos`), shrunk to 1600 px JPEG in the browser, magic-byte checked server-side (no SVG), 12 per rencontre, host or any family that said yes, visible 60 days to the families that said yes, freed when the rencontre is deleted. Migration 0004.
- [x] **Phase 5 — hardening. Shipped 2026-10-27.** The other parent (`/rejoindre?t=…`, one-use, 7 days, 3 open at most, same household); « Essayer sans compte » (`POST /api/demo`: a seeded sandbox household, swept after 24 h at the next mint, capped at 50, never able to send mail or invite a parent; `demo.test.ts` fails the build if a migration table is missing from the sweep); the Playwright walk of the invited parent (`e2e/reply.spec.ts`, iPhone viewport, FR + EN, 320 px per-child overflow bounds, axe serious/critical — the overflow guard was planted red before being trusted). Migration 0005. « Garder ma maisonnée » (`/garder`, `POST /api/demo/claim`) turns a sandbox into a real account IN PLACE (the parents row gets a real email + password, the household flips to kind real so the sweep stops matching it; the old session dies, a new one is issued; same data).
- [ ] **Left for a human:** walk it on two real phones with two real emails; the e2e stubs the API, so the Worker is proven by the wrangler-dev walks, not by Playwright; decide the two Dependabot majors.

**UI pass (2026-10-27): mobile first, desktop friendly, plain.** One shared `Header` on EVERY page (brand · EN/FR · theme · account menu), sticky, so the language switch is always in the same corner; four tabs (Rencontres · Calendrier · Le cercle · Ma famille), with Fenêtres reached from Rencontres and Familles amies from Le cercle; flat cards, square-ish buttons, text tabs, one accent; no emoji, no em-dashes in copy, no initial circles except the child colour on Ma famille; the host's card has ONE primary action per family and quiet text links for the rest; every optional field has a collapsed « Pourquoi ? ». `SHOTS=1 npx playwright test shots` writes phone + desktop screenshots of every screen to `screenshots/` (gitignored) for the next review: look at them, do not reason about it.

**Who an invitation is for (2026-10-27, migration 0006):** each invitation has a scope, `friend` (the invited child only, e.g. a paid birthday) or `family` (siblings welcome, e.g. the park). Picked when creating the rencontre (default: birthday → friend, everything else → family), flippable per family on the host card (`PATCH /api/invitations`), and a family added later takes the rencontre's default. The reply page says it plainly (« Invitation pour Léa seulement » / « Toute la famille est la bienvenue ») and only a whole-family answer is asked how many children come; the host's line counts one child for a friend-only family. The invitation email says it too.

**Share links are two plain words (2026-10-27):** `jouer.marcportal.com/lune-miel`, drawn from 2,051 hand-picked French words (`functions/_lib/words.ts`: written by category, spell-checked against a French dictionary, read end to end, slang/insults/weapons/religious buildings/names/obscure words out; the header says how to remake it). Said, written on a paper and typed back in any case, with spaces or dots; older 8-character codes keep working. **Honest trade:** 2,051 × 2,050 ≈ 4.2 million links, about 22 bits, against ≈ 40 for the old random code — chosen over a number suffix because Marc wanted two words only. What makes that acceptable, in order: **a wrong-guess lockout** (`_lib/guessLimit.ts`, migration 0007: an address that misses 12 times in an hour is refused before any lookup, even for a correct code; the counter keeps only a salted hash and is deleted after two hours; it fails open); the 30 a minute per-address limit; a code is the only credential for ONE rencontre and ONE family and dies the day after the date; and a guess reaches only a first name, a time and a place (the address waits for a yes). `freshLinkCode` retries a clash so a UNIQUE violation never reaches a parent. **Limits to know:** a botnet of many addresses can still search 4.2 million, and codes are never reused while their rows exist, so the space slowly fills; if either worries you, add a third word (`newLinkCode` and the two shape regexes are the only places that know) or purge old invitations. Hosts choosing their own two words was declined: a memorable word pair is a guessable one.

**Language:** French first; English only when the device's own preference list puts it before French (`pickLang`). **A family with no email** gets a primary « Partager le lien » on the host card: a ready message (who, what, when, who it is for, the short link) through the phone's share sheet, or copied. **The shared page** (`/lune-pain-482`) opens with « Invitation · genre », who organizes it, who it is for, the facts as labelled rows (Quoi · Quand · Où · Adresse · À savoir), a three-step « Comment ça marche » with the current step highlighted, and says the host can already see the answer once given.

**Data rule (Marc, 2026-10-27): nothing personal is required — a name and an email are enough for everything core.** Every optional field (birthdates, address, phone, allergies, notes, home card, relais, photos) shows a « why we ask / what you lose if you skip it » line (`components/Why.tsx`, copy in `i18n.why`), and `/confidentialite` states the purpose, where it is hosted (Cloudflare: Worker + D1 in ENAM + R2; Resend for mail) and how to remove it all. `/compte`: download everything (`GET /api/export`, no secrets) and « Tout effacer » (`DELETE /api/household`, password-gated, immediate, hard delete through `deleteHouseholds` — the same path as the sandbox sweep). **New features follow the rule: no home addresses on a map, no new personal fields; a map would hold public places only.** Soft-deleted rows (a removed child, family or rencontre) stay hidden in D1 until « Tout effacer » — say so, or add a purge.

**Not v1, by decision:** SMS (costs per send; email + copy-link first), a native app,
chat beyond the per-card thread, push notifications, discovery or public profiles,
anything that ranks families or children, a bridge to Babillard (later: a confirmed
rencontre could land on the board as an event).

## 5. Process notes

- A guard that has never been red proves nothing: plant the defect, watch it fail, restore.
- A ledger entry is a verdict from a moment; grep the code before building on it.

## Modifier une rencontre (2026-10-27)

- **Edit**: « Modifier » on the host card opens a form with a live preview of exactly what the families will see change. Migration 0008 `encounter_changes` logs one row per changed field. Address and map link are logged as « mis à jour » only, never their values.
- **Invited page**: a device that opened the link before sees « Mis à jour depuis ta dernière visite » plus « Modifié » marks with the old value; everyone gets a collapsed « Historique des modifications ». « Prévenir par courriel » is optional and only reaches families with an address who did not say no. A moved start re-arms the day-before reminder.
- **Map link** (migration 0009 `map_url`): optional, https only (`cleanMapUrl`), standard `type=url` input. Same privacy as the address: park = everyone, home/birthday = after a yes.
- **« Jusqu'à »** is now a standard time input on the day of « Quand » (nothing runs past midnight: the end must be after the start, same day).
- Simplification batch: built, see the next section.

## Simplification batch (2026-10-27)

- **Qui vient**: each rencontre shows Viennent / Peut-être / Ne viennent pas / Sans réponse with names, plus the head-count.
- **Nothing runs past midnight**: « Jusqu'à » must be after the start on the same day; the form says so, the server refuses it too.
- **One-tap answer**: Oui / Peut-être / Non saves at once (reply alone). Name, courriel, téléphone, allergies, head-count, reminder and note come after, under « Ajouter mes coordonnées (facultatif) », saved separately. A later answer keeps the note.
- **Short form**: who, kind, families, when (quick chips Samedi / Dimanche / Demain), where, title (written for you if empty). Everything else under « Plus d'options ». The home card is asked the first time someone proposes « Chez nous ».
- **Refaire pareil**: the link `/rencontres/nouvelle?from=ID` copies kind, child, families, scope, place, note and the same weekday and time, a week on.
- **First run**: an empty agenda says the next step (add a child, add a friend, propose).
- **Three tabs**: Rencontres (agenda with birthdays, invitations and « je suis libre » mixed in), Amis (families, groups as tags, « Sur Viens jouer » badge, the circle folded in), Ma famille (children only). The old addresses /calendrier, /cercle and /familles redirect.
- **Undo, not confirm()** (`src/lib/toast.tsx`): cancel is immediate with an undo; deletes (rencontre, friend, child, group, window, photo, invitation, circle link) hide at once and run after 6 s unless undone, flushed if the tab closes. A browser dialog now fails the build's e2e.
- **One Pourquoi per section** (`WhyMany`), naming each field and what skipping it costs.
- **Host card**: one line per family (Partager, with the rest under « Plus d'options »), messages and photos folded, two columns from 900 px.
- **Moved**: « Je suis libre, sans plan » is the second choice at the top of Proposer. The other parent and « Chez nous » (home card) live on the account page.

## Cover picture and public « qui vient » (2026-10-27)

- **Who is coming is visible to the invited families** (`r/[token]` returns `guests`): first names of the children who said yes or maybe, how many have not answered, never a decline. The host can turn it off per rencontre (`encounters.show_guests`, migration 0010; checkbox in « Modifier »). The line is also on the privacy page and under the host's « Qui vient ». Reply page says it plainly before anyone answers.
- **Cover picture** (`encounters.cover_key`, migration 0010): one per rencontre, host page (add / change / remove with undo) or the « Plus d'options » of the new form. `POST/DELETE /api/cover`, served to the host at `/api/cover/<encounterId>` and to any family holding a live code at `/api/r/<code>/cover` (it is the invitation's picture, not private). Optional like all photos (no R2 bucket, no picture). Replacing frees the old blob; « Tout effacer » and the demo sweep delete covers too.

## Calendar, bring list, thank-you, install, places (2026-10-27)

- **Calendar**: the ICS now has a stable UID, `SEQUENCE` that grows with each edit, `STATUS` and folded lines, so a calendar that already has the event UPDATES it. The invited page offers the download AND `webcal://…/api/r/<code>/ics?s=1` (a subscription; cancelled stays in the feed as `STATUS:CANCELLED`). The address is in the file only after a yes. The host gets one secret feed of every rencontre (`GET /api/feed/<24 chars>`, secret in `households.cal_token`, set/rotate/off from « Mon compte » ▸ « Mon calendrier »; rotating asks inline, no browser dialog).
- **À apporter** (`bring_items`, migration 0011): the host adds lines, a family that said yes or maybe takes one (its parent's first name shows beside it) or adds its own; max 20. A family that has not answered only reads.
- **Dire merci**: one message after a rencontre (30 days max), manual, from the host page. It goes into the thread (every family sees it) and by email to the yes-families with an address (`encounters.thanked_at`). No cron, nothing sent unasked.
- **Installable**: `public/manifest.webmanifest`, PNG icons (any, maskable, apple-touch, favicon) and a link-preview image drawn by `scripts/make-icons.mjs`, iOS meta tags, safe-area padding, `theme-color`, and `X-Robots-Tag: noindex`. `public/sw.js` is a pass-through (caches nothing, so it cannot go stale); it only makes Chrome treat the app as installable. « Mon compte » has an install card: a button where the browser offers one, the two iOS taps otherwise.
- **Places**: `GET /api/places` (this household's own places, most used first). « Où » completes from them (a standard `datalist`); picking one brings its map link and address back, never over something already typed.

## In progress (2026-10-27 night): faces, icons, message board, 2026 layout

Done so far: the icon set (`components/Icon.tsx`, in front of labels, headings and fold summaries), the server for faces (`/api/avatar`, `/api/profile`, migration 0012) and for the message board (pin, delete, own messages; migration 0013). Next: the face picker, the board component, bottom tab bar, meta rows with icons, screenshots, e2e.

## Faces, icons, board, phone layout (2026-10-27 night) — done, then what is left

- **Faces**: a photo for each child and each parent (`/api/avatar`, migration 0012), cropped to a small square in the browser, shown on the children page, the header, the new-rencontre child chooser and the invitation. « Mon profil » on the account page also edits the first name (`/api/profile`). No photo storage, no button.
- **Icons**: `components/Icon.tsx`, in front of labels, headings and fold summaries; decorative only.
- **Message board** (migration 0013): `components/MessageBoard.tsx` on the host page and the invitation. Pin (3 max), the host removes anything, a family removes its own, « Nouveau » marks per device, links clickable, readable after the rencontre.
- **Layout**: tabs at the thumb on phones (bottom bar, icons), 44 px targets, the invitation asks « Vous venez ? » first, skeleton loading, safe areas.
- **Guard**: `export.test.ts` pins query aliases (a real export bug was caught by the smoke and fixed).
- **Left**: the screenshot pass should be re-run (`SHOTS=1 npx playwright test shots`) and eyeballed once more; the Door page points and the account cards were not re-viewed; ideas not started: dynamic link previews per invitation, Babillard/Horizon-style audit pass.

## Overnight standards pass (2026-10-28)

- **Routes are lazy** (`src/router.tsx`): the first download fell from 136 KB to 83 KB gzip; each page is its own chunk. `scripts/check-bundle.mjs` (`npm run check:bundle`, in CI and `verify`) holds the entry, every chunk and the stylesheet to a ratcheting budget, and fails if Reply, the host card or the door fold back into the entry.
- **CI e2e runs in the authoritative shape** (`npm run e2e:ci`: one worker, no retries), as in Babillard and Horizon.
- Found by CI, fixed: at 320 px with a wider font the header overflowed; the name now gives way to the face, and the 320 px test uses a long name so it cannot pass by luck.
- Ideas not done: split the English dictionary into its own lazy chunk (the shared chunk is 23 KB gzip), a knip dead-code gate, dynamic link previews per invitation.
- **English is its own chunk** (`src/i18n.en.ts`, loaded by `main.tsx` only for an English device or after pressing EN): the shared French chunk fell from 23 KB to 15 KB gzip. A first visit in English waits a beat rather than flashing French; switching later keeps the page. Both dictionaries are still held by `Dict` (tsc) and `copyRules.test.ts`.
- **Knip** gates dead exports (`npm run knip`); **copy rules** gate dead keys, em-dashes and emoji.
