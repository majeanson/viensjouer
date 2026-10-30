# STATE.md — where Viens jouer is, what's next, how we work

> The one front door. Asked « what should we work on? » — read this, not the code.
> Update it in the SAME commit as the work it describes. Kept short on purpose: what
> shipped goes to git, what is left stays here.

---

## 0. Front door (read this, skip the ledger unless you need the why)

**Where it stands (2026-10-29).** Phases 1 to 5 are shipped and live; the audit, paper-cards and declutter passes are done. Everything between §3 and the end of this file is a dated ledger of *why* things are the way they are: search it (`grep -n "keyword" STATE.md`), do not read it top to bottom.

**Open, in order:**
1. A VoiceOver and a TalkBack pass on the reply page, and walk it on two real phones with two real emails (the only human step left from Phase 1).
2. **Human steps that switch things on** (each is optional, nothing breaks without it): the Resend bounce webhook (`RESEND_WEBHOOK_SECRET`), Turnstile (`TURNSTILE_SITE_KEY` in wrangler.toml + `wrangler secret put TURNSTILE_SECRET`), the owner's mail alert (`ADMIN_EMAIL`). Details in the « Everything else on the list » entry.
3. The same « Bâti par marc.portal » line in the other repos (see memory), and the Babillard export/plan bridge (to discuss first).

**Budgets (`npm run check:bundle`):** entry 85.0 / 86 KB, lazy chunks 12 KB (French dictionary 11.1), stylesheet 5.5 / 6 KB. The dictionary and stylesheet caps were raised on purpose on 2026-10-29 (reasoning in `scripts/check-bundle.mjs`); the entry did not move. Read the output for « exceeded », not only « ok ».

**Don't re-open (decided):** SMS, native app, discovery, ranking, hosts choosing their own two words, a class-wide shared code, the reply page opening offline (an answer tapped with no signal is already kept and sent later; the page itself needs a network).

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

### Declutter pass — 2026-10-29

Amis and groups are CLOSED rows (face, name, one grey line, chevron); tags, contact, Modifier / Retirer, history and the circle invite open on a tap. Rencontres list: the answers are one grey line (« Oui 2 · Peut-être 1 »), upcoming only. Host page: counts and « Il manque » are ONE line; « Refaire pareil » sits under Plus d'options. Reply page: no « un seul toucher » hint, no « [host] voit ta réponse » (the saved notice says it), no calendar buttons before an answer, the other dates of a series are one folded row. Host page: each invited family is a CLOSED row too (face, child, parent, the answer chip; the send / resend / text buttons, the link, who it is for, noting an answer and Retirer open on a tap). Also: the new-rencontre form folds « Qui est invité ? » to its current value; one banner at a time on Rencontres (the partner nudge first); the calendar link keeps its warning and moves Nouveau lien / Désactiver under « Gérer ce lien »; Notifications puts the switch first and the explanations in one fold; a child shows face, name and birthdate with nap and colour under Plus d’options.

### Friends and groups as rows, the bell, recurring as one card — 2026-10-29

No new field. **Amis**: one row per friend like Ma famille (face, child, parent and age, group / « Sur Viens jouer » tags, Modifier and Retirer); email, phone, allergies, notes, « Déjà ensemble », the circle invite and « Couper le lien » sit under a « Détails » fold. Groups use the same row with the members' faces. **The bell** (`NotificationBell`, lazy so the first download is unchanged) replaces the « Nouveau » card: a dot, never a number; unread first, then what was read in the last 30 days (`GET /api/notifications?all=1`). **Tabs**: the chosen `.btn--on` is filled with the accent; tabs are pills. **Rencontres**: a recurring rencontre is one card (its next non-cancelled date, « Récurrente · encore N dates »). **Photos**: decoded through an `<img>` onto white before upload (Safari's `createImageBitmap` could leave the top blank; unconfirmed on the user's phone, re-add the photo to check); a cover that fails to load shows nothing. Also: typing in Les messages no longer remounts every message (rows were an inner component). Gates and `e2e:ci` green; the stylesheet stayed under its 6 KB cap by reusing `.linkrow`.

### Presentation pass: say it the way a parent says it — 2026-10-29

No new feature, no new field. The reply page opens with ONE big line (`humanWhen`: « Samedi matin », « Demain après-midi ») over title, hours and place; the labelled rows sit under « Tous les détails » (open when something was edited since the last visit; the plan B stays outside the fold, it matters when it rains), and « Comment ça marche » is a fold. The agenda uses the same words (hour beside, exact date only in the past). Agenda cards carry a coloured left edge by kind (`data-kind`: park green, home accent, birthday yellow). On the host page the tally keeps yes / maybe / no and the « Pas de réponse » chip is replaced by « Il manque : Camille, Jo » (or « Tout le monde a répondu »). The sticky answer bar already existed. Gates and `e2e:ci` green.

### Household time zone — 2026-10-29

`households.tz` is now written: signup sends the browser's zone (`cleanTz` refuses anything the runtime does not know, default Toronto), and `PATCH /api/profile { tz }` can change it (household-wide), but there is deliberately NO select on the account page: a local playdate app assumes host and guests share a zone. Households created before this stay on Toronto.

### Dead links, mail budget, series, Reporté — 2026-10-29

- **Dead link**: a link whose rencontre the host removed answers 410 with the host's first name (`retiredHost` in `r/[token].ts`) and the page says « Cette rencontre est terminée, écris à Marie ». A purged row or a code that never existed stays a plain 404 and counts as a miss.
- **Cron reminders are in the mail budget**: both reminder jobs read `mailRoom` once per household per run, skip a household with none left UNSTAMPED (a later run sends while the rencontre is ahead) and `recordMail` what left. The cron also logs a warning once the last 24 h pass 80 of Resend's free 100 (`warnIfMailNearFree`, log only).
- **Edit a series in one go**: « Modifier » on a recurring rencontre has a box « Appliquer aussi aux prochaines dates ». PATCH `series: true` edits this occurrence and every later one, each with its own change row; the hour travels as a shift (`shiftOccurrence`), never the day (a day would drift across DST: 400 if the shift is a day or more). The update email goes for the edited occurrence only. Cancel-series now writes the rows too.
- **Reporté / pluie**: status `postponed` (no migration: `status` is free text). « Reporter » on the host page: optional reason (posted on the board of each occurrence concerned, `Reporté : …`), optional email (the reason rides in it), optional whole series. Reminders skip a postponed rencontre; the link stays open and answers stay; the reply page says so. Setting a new start on a postponed one puts it back to « proposée ».
- **Two children, one parent**: the reply card lists the OTHER invitations to the same rencontre whose family has the same email in the same book (`siblings`); « Même réponse pour Léa » posts to that child's own link. Nothing else about another family is ever listed.
- **Host lockout**: `/auth/me` says `soloHost`; once a rencontre is past, Rencontres shows one line « Invite l'autre parent » (`PartnerNudge`), « Plus tard » hides it on that device.
- **Export** now has `childLinks`, the parents' reminder choices (`remind_host`, `notify_answers`) and each invitation's `remind_at`.
- **Budget watch**: `i18n.fr` is 10.4 of 11 KB gzip, entry 84.8 / 86.

### Hygiene — 2026-10-29

`functions/_lib/purge.ts`, run by the hourly `tidy`: a rencontre, window, group, message, photo, family or child removed more than 30 days ago is deleted for good (a family or child still named by a surviving invitation, rencontre or link is kept, its book entry makes the history readable; R2 blobs go with them). Share words of a rencontre or window over for 90 days are retired (`token` becomes `old-<id>`), so the two-word space is reusable while the row and its answer stay. Bounded to 25 / 200 rows per run. `purge.test.ts` runs the real migrations on `node:sqlite` (planted red once). A removed family or child that history still names keeps only its names: email, phone, allergies, notes and birthdates are blanked after the 30 days. Rows are deleted before their blobs, so a failed batch retries with its picture intact. The privacy page says so.

### The night's batch — 2026-10-29

- **Nap times, per child** (migration 0018 `children.nap_start / nap_end`, optional, « Sa sieste habituelle » on the child form with its Pourquoi). The new-rencontre form offers « Avant la sieste, 11 h » / « Après la sieste, 14 h 30 » beside Samedi / Dimanche / Demain and moves only the hour; defaults 10 h and 15 h; before = two hours ahead of the nap start, never earlier than 8 h (`napSlots`). Follows the chosen child.
- **Quiet hours**: both cron reminders (the invited parent's and the host's) are held between 21 h and 7 h in the household's own time zone (`inQuietHours`); held ones are picked up after 7 h, a start before then simply gets none.
- **Plan B** (`details.planB`, every kind, no migration): one optional line (« S'il pleut : chez nous ») on the form, in « Modifier », on the host page, and on the reply page in the first card next to when and where. It is in the change log (`planB`), so « Modifié » marks and the update email carry it.
- **À apporter summary**: the fold title reads « (1 sur 2 pris · il manque : des jus) » without opening it.
- **« Les mêmes familles que la dernière fois »** (`GET /api/last-guests?child=`): ticks the families invited to the child's latest past, live, non-cancelled rencontre (removed families skipped). Ids only: no count, no « usually comes » tag (that would rank families, so it was left out on purpose).
- **A family's card**: « Déjà ensemble » on Amis now also offers « Carte à imprimer pour la prochaine rencontre » (`family-history` returns `next`); `/rencontres/:id/cartes?family=` opens with only that family ticked. **Not a standing code**: a code still dies the day after its date, so a weekly park card is one per week.
- **Screen-reader pass (tree, not a real device)**: the Reply, WindowReply, Door, Privacy, Join, Forgot and Keep pages had no `<main>` (so focus-after-navigation silently missed) and no skip link: both fixed (the skip link now lives in `Header`). Reply: h1 then h2 (was h3), the three answers are a named group, the « → » of a time range is hidden and a « jusqu'à » is spoken, errors are `role=alert`. `e2e/screenreader.spec.ts`. **Still a human step**: one VoiceOver and one TalkBack pass on the reply page.
- **Test tooling**: `functions/_lib/testDb.ts` runs every migration on `node:sqlite` behind the D1 methods, for tests that need real SQL (`purge.test`, `lastGuests.test`). The real walk now reads the new endpoints against real D1.
- **Budget watch**: `i18n.fr` is 10.1 of 11 KB gzip; the next copy needs the dictionary cap looked at on purpose, not a quiet raise.

### French is its own lazy chunk — 2026-10-29

`src/i18n.fr.ts` holds the French dictionary; `src/i18n.ts` keeps only the types, context and language helpers (`Dict` is `typeof FR`, a type-only import, so EN parity still fails `tsc`). `main.tsx` loads the dictionary the visitor needs before the first render. The shared `Icon` chunk fell from 16.3 to 6.4 KB, `i18n.fr` is 9.8 KB, the entry did not move; the chunk cap ratcheted 16.5 → 11 KB. Trade: a French first visit now waits for one small extra request (as English always did). `copyRules.test.ts` reads `FR` from the new file.

### Host page, calmer — 2026-10-29

« Les invitations » opens with the tally (Oui · 2, Peut-être · 1, Pas de réponse · 1) and one button to send again to every silent family that has an address. A family that has answered is one calm line (its send buttons return under « Plus de choix » only when needed). A cancelled rencontre offers « Dis-leur pourquoi »: the note goes on the board the families read. Dark-mode axe sweeps (reply asked and answered, every host screen). `.gitattributes` (LF) ends the CRLF warnings. Five unused icons dropped (bundle: entry 84.8 / 86 KB, shared chunk 16.3 / 16.5 KB: French has since been split out, see below). CI caught that the facts grid and chips overflowed at big text; the test now runs at 250 % (CI fonts are wider than local ones).

### Grandma pass — 2026-10-28

Reply page: the answer sits right under the title, when and where; map, address, notes, calendar and history
come after it in a second card; a green « Réponse envoyée. Merci ! » shows at once after a tap. Plainer words:
Les invitations, Envoyer l'invitation, Plus de choix, Changer les deux mots. The message that will go by text is
shown before it is sent. A day and an hour are two pickers (`WhenInput`). « Publier » is never a dead grey
button: an empty tap says « Écris un mot d'abord. ». « Pourquoi ? » and every ghost button are real buttons now.
The slim answer bar wraps instead of overflowing at large text. Checkbox rows align to the first line.
Door: the trial button sits on its own line. New guards: answer-bar one-line at 320 px, text at 200 %, tap targets
of 36 px on host screens, answer before details. New shots: the three empty states. Not built on purpose: a
nudge to families who did not answer (the hourly reminders are opt-in for the recipient; « Renvoyer » is the host's
own gentle nudge).

### Actions are buttons — 2026-10-28

Every action that was an underlined word (Modifier, Refaire pareil, Renvoyer, Copier, Annuler la rencontre,
Supprimer, board pin / remove, cover change / remove, calendar feed, friends, "Plus d'options") is a real
button. On the rencontre page, Confirmer is one full-width primary under a divider with the destructive
buttons apart. Rule in CLAUDE.md, guarded by `functions/_lib/buttons.test.ts`.

### Screenshot review polish — 2026-10-28

Birthday line on Rencontres uses the cake icon instead of a stray bullet; a card no longer
repeats the place when it equals the kind label ("Chez nous" twice); breathing room around
the plan / free toggle on the new-rencontre form; the reply answer bar keeps "Peut-être" on
one line at 320 px.

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
- [ ] **Left for a human:** walk it on two real phones with two real emails; the e2e stubs the API, so the Worker is proven by the wrangler-dev walks, not by Playwright; (the two Dependabot majors were merged, vitest 5 and happy-dom 21).

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
- **Accessibility basics**: a skip link, a `main` region that takes focus after a navigation, and a real `<title>` per screen (the page's own h1 plus the app name, so a texted invitation's tab reads « Noé invite Léa · Viens jouer »). `src/lib/pageTitle.ts`, held by e2e.
- **Crash and offline**: an error boundary (`components/ErrorBoundary.tsx`) shows a calm card instead of a white page, clears when the person moves on, and reloads by itself once when a deploy replaced a chunk under an open tab. An offline notice sits under the header on the host pages and the invitation.
- **The real walk** (`npm run e2e:real`, `scripts/e2e-real.mjs`, `e2e-real/walk.spec.ts`, a CI job that does not gate the deploy): the built app on the real Worker with a real local D1/R2, a host and an invited parent in two browsers (sandbox, propose, short link, answer, board, bring, edit, « Modifié », export, ICS, English). It stops the server it starts. Everything else in `e2e/` stubs the API; this is what proves the stack agrees with itself.
- The real walk also uploads a cover and two faces, checks they are served to the invited family, then erases the household and checks everything the invitation pointed at is gone. `.github/workflows/stranger.yml` runs it weekly (and on demand, `npm run e2e:prod`) against the deployed app through the sandbox; it passed against production on 2026-10-28.
- **Link previews** (`worker/preview.ts`): a texted invitation link unfurls as « Noé invite Léa », the date and place, and the cover picture (the plain card for a wrong code, a cancelled or long-past rencontre). It goes through the same rate limit and wrong-guess lockout as the page, shows what the page already shows (never the address), is `no-store`, and is held by the real walk. The privacy page says so.
- **« M'envoyer un courriel d'essai »** (account page, `POST /api/test-mail`): one sample update email, in the real shape, to the signed-in parent's own address only; refused in a trial, hidden without mail, rate-limited per parent. It lets the host see what families receive before any family receives anything.
- **« Déjà ensemble »** (Amis, per family, `GET /api/family-history?id=`): the last five past rencontres that family said yes to, opened on demand, dates and places only (never a count or rank), each with « Refaire pareil ».
- **Rappel de l’hôte** (Mon profil, `parents.remind_host`, migration 0014): off unless ticked. The hourly cron (`sendHostReminders`) sends one email under 24 h before a rencontre: time, place and who said yes. `encounters.host_reminded_at` is stamped first so it never doubles.

## Audit pass (2026-10-28): fresh-eyes review against Babillard and Horizon

Two read-only audits produced a ranked list; it is worked through in order, one commit per step. Done so far:

- **The sender is not a relay** (migration 0015 `mail_sends`, `functions/_lib/mailBudget.ts`): a household can cause at most 60 emails a day (invitation, window, update, thank-you); the cron purges the ledger after two days. A re-send to the same family inside 5 minutes is refused. `structure.test.ts` fails the build if a host-caused `sendMail` skips `mailRoom` / `recordMail`.
- **A link holder cannot replace the family's email** on the book entry: a reply only fills a blank (`COALESCE(email, ?)`).
- **Sessions**: `POST /api/password` (asks the current password, bumps `session_version`) and `DELETE /api/sessions` (« Me déconnecter partout ») on the account page. An ordinary logout still only clears this device's cookie; the 60-day cookie is revoked by either of these or a reset.
- The lockout guard in `structure.test.ts` now also covers the calendar feed and the link preview.
- **CSP is what the app uses**: Google Fonts origins and `img-src https:` dropped (nothing loaded them; every picture is our own `/api`). `securityHeaders.test.ts` pins the list, both delivery paths and « no third party ».
- **Theme is one thing** (`color-scheme` on both `:root` blocks, so native controls follow the in-app toggle; `applyTheme` rewrites `theme-color`; one paper colour in the token, `index.html`, the manifest and `theme.ts`, held by `designTokens.test.ts`). The toggle shows the icon of where it goes and the account menu closes on Escape, an outside press and sign out.
- **« Oui » reads in the dark**: new `--ok-ink` (near-black on the light green). axe now runs on the reply page in the dark theme, before and after answering (planted red with the old colour first). Initials on a face pick near-black or white by contrast (`lib/palette.ts`, one palette for Children and the board). `--teal` (undefined) gone; the same test fails on any `var(--x)` with no declaration.
- **Reads fail out loud** (`Loading`, `QueryError`): the reply pages, the host page and children no longer show bare « Chargement… » or a non-live error; a failure is `role=alert` with « Réessayer », an expired link (404) says so and offers no retry (e2e).
- **Stylesheet declared once**: radius, target (44 px), nav height and z-index scales are tokens; the overridden `.btn`/`.card`/`.fold`/`.facts`/`.chip` rules are merged into their first declaration; one global `:focus-visible` ring; small buttons, link buttons and the photo remove button keep a 44 px hit area; `prefers-contrast: more` firms up greys and hairlines; entrance animations no longer fire on every chip or past the sixth row. **Budget raised once, on purpose** (`check-bundle.mjs`: entry 85 → 86 KB, stylesheet 5 → 5.5 KB); the ratchet applies from here.
- `COMPONENTS.md` is the inventory of shared pieces and styles; `components.test.ts` fails the build if a file in `src/components/` has no row.
- **Email speaks the reader's language** (migration 0016, `lang.ts`, `mailCopy.ts`): every email is built from one bilingual set of builders (handlers pass facts, not sentences). A person's language is learned, never asked: the device's `X-Lang` is kept on the friend family when they answer a link and on the parent at sign-up, login and profile save. Order of choice: the recipient's stored language, then the language of whoever is acting now, then French. The cron mails use the stored one. `mailCopy.test.ts` pins both languages (link present, no markup from a name, no French in English).
- **Housekeeping and ceilings**: the hourly cron now runs `tidy` (password-reset and second-parent tokens a week after they die, the mail ledger, aged sandboxes even when nobody mints one); R2 delete failures are logged, no longer swallowed. One household holds at most 12 children, 300 friend families, 1000 rencontres and 400 photos (`ceilings.ts`).
- **Recovery**: D1 Time Travel is on (checked 2026-10-28 with `wrangler d1 time-travel info viensjouer`); to roll back a bad migration, `wrangler d1 time-travel restore viensjouer --timestamp=<ISO time>` (30-day window). No second copy of family data is made on purpose.
- **A red scheduled run is seen**: `scheduled-red.yml` opens (and later closes) an issue when `stranger.yml` fails on its schedule; `structure.test.ts` fails the build if a scheduled workflow is not listed there. The real walk now also proves « Me déconnecter partout » (a copied session dies, this one lives).
- **A tap on Oui survives a bad signal** (`lib/pendingAnswer.ts`): with no network (not a server refusal) the answer is kept on the device, the page says so, and it is sent when the network returns or the link is opened again. Stays small on purpose: one answer per link; the service worker is still a pass-through, so the page itself is not available offline.
- **No door confirms an account exists** (`ACCOUNT_UNAVAILABLE` in `json.ts`, used by signup, join, demo-claim and the reply-link claim; `structure.test.ts` fails on the old sentence). Signup with an existing address and the RIGHT password just signs in (same per-address limit as login); a wrong one gets the neutral answer. Honest limit: the neutral sentence still suggests « sign in or reset », and only an email-verification step would hide existence completely; the real walk pins the behaviour.
- **Decided, not done**: STATE.md stays chronological (a rewrite into a short front door is its own piece of work).
- **The real walk gates the deploy** (`ci.yml`: `deploy` needs `ci` and `real`; `structure.test.ts` holds that) and now includes a stranger household that cannot read, change or delete the first one's rencontre, nor find its families or export (planted red by dropping the household filter on the single-rencontre read, restored).
- **Second look (fresh reader on the whole diff), fixed**: the photo remove button had been knocked out of its corner by a later `position: relative` (a guard now fails on any absolute-then-relative rule); the 44 px hit areas are touch-only; a kept answer is dropped only on a refusal that will not change (4xx but 429), never on 5xx/429; a double tap on « Renvoyer » claims the slot in one conditional write before sending (restored if the send fails); the thank-you and update emails tell the host when the day's budget left families out; the hourly jobs are named and independent (`allSettled`, per-step catch in `tidy`); a saved theme sets the status-bar colour at first paint; the privacy page now says the device language and the mail counter are kept. Cron reminders are deliberately outside the mail budget (one per invitation, asked for by the recipient).
- **The question stays reachable** (reply page, phones): while « Vous venez ? » is out of view a slim bar keeps Oui / Peut-être / Non one tap away (`IntersectionObserver`, gone once the question is on screen, hidden on desktop). After a yes or a maybe, « Ajouter à mon calendrier » moves under the confirmation as the primary action (it used to sit in the facts card, above the fold of the answer).
- **« Me prévenir quand une famille répond »** (migration 0017, `answerNotice.ts`, Mon profil): off unless ticked. One email to the hosting parents who asked, when a family's answer CHANGES, at most one per invitation per ten minutes (`invitations.host_notified_at` is claimed first), in their language, counted in the household's daily mail budget, never to a sandbox; fire-and-forget (`waitUntil`) so the family's answer never looks failed. Not a push, not a count, nothing but « Léa : oui ».
- **Theme has an « auto »** (`lib/theme.ts`): the header button cycles auto → clair → sombre. Auto stores nothing and follows the device live (dusk switches the app without a reload); the icon shows what is chosen, the label says it (`common.themeNow`). e2e plays the OS switching.
- **Dates say how near they are** (`Rel`, `lib/format.ts` `relativeDay`): « · demain », « · dans 3 jours » beside the date on agenda cards, the host page and the reply page, for the coming week only (calendar days on the device).
- **No empty fold for days**: the host's « Souvenirs » appears once the day has started (or when there are photos already). « À apporter » stays (useful beforehand), « Historique » already hides when empty.
- **First run is three steps** (agenda, empty account): child, a friend, the first rencontre, each checked off in turn with one button for the step in front of you (reuses `.steps`).

## Paper, and the way in for an invited parent (2026-10-28)

- **Two words were already the link** (`/lune-miel`, 2051 words, `words.ts`, ~22 bits, the code IS the credential, with the per-address limit and wrong-guess lockout). What was missing was the physical gesture, so nothing new is a credential here.
- **« Cartes à imprimer »** (`/rencontres/:id/cartes`, `pages/Cards.tsx`, its own lazy `cards.css`): one A6 card per invited family, four to an A4 sheet, dashed cut edges, black on white. « Pour Léa », « Noé t'invite », the kind and the date, the two words in large type, a colour-in Oui / Peut-être / Non, a drawing frame. **No place and no title on a card** (a title is often « Au parc Lafontaine », a card in a cubby can be read by anyone; the address waits for a yes). The host unticks a family to leave its card out. e2e plants the title back on the card and goes red.
- **The host can note an answer given in person or on paper** (`PATCH /api/invitations { id, reply }`, « Noter sa réponse » in each family's « Plus d'options »). It is the family's own answer entered by hand: nobody is mailed, and the family can still change it from its link. The real walk proves it through real D1 and the family's page. (Not the relay form: that one is a nap/meal note for a home visit, I had it wrong at first.)
- **« Tu as reçu une carte ? »** on the home page (`CardCode`): a tilted paper card with one big box per word. A space, hyphen or Enter in the first box jumps to the second; typing or pasting both words in the first box spreads them; Backspace on an empty second box goes back; the paper turns green and straight when the shape is right. Capitals and accents forgiven. A wrong shape gets one calm line; guesses are still counted by the same lockout.
- **An invited parent who answered is offered an account, once and calmly** (reply page): « Envie de revoir Noé ? » appears only after an answer (never before the question), says what the account is for and that nothing is required (« ta réponse compte déjà »), and opens the same one-field-set form that used to live only in the footer. The footer button stays for a parent who has not answered yet. Signed-in parents see neither.
- **Budget**: the shared chunk holding the French dictionary went 16 -> 16.5 KB (`check-bundle.mjs`, second raise of the day, documented there). The next growth should make French its own lazy chunk, like English, instead of raising it again.
- **Not done on purpose**: a class-wide card with ONE shared code and children writing their own name (new table, wider exposure; revisit only if typing 20 names turns out to be the pain); NFC tags; stickers.

### Declutter pass (2026-10-28, same evening)

- **« Autres mots »**: if a family's two words read badly, the host draws two others (`PATCH /api/invitations { id, newCode: true }`, `freshLinkCode`). Allowed only while nothing depends on the old ones (not emailed, not answered; the SQL says `reply IS NULL AND sent_at IS NULL`), so no sent link dies silently; the button is hidden otherwise. A link texted by hand cannot be known, hence the label. The real walk proves the old words answer 404 afterwards.
- **A family's fold has four labelled blocks** (« Le lien et ses deux mots », « Qui est invité ? » as a two-choice row instead of a bare « Toute la famille » plus a toggle link, « Noter sa réponse », then the destructive action last). The « Pas de courriel : envoie ce message par texto… » sentence is gone from the fold (the main button already does it; still on the new-rencontre picker).
- **No menu to open**: the header shows your face and name (one tap: your account) and, apart, a sign-out icon. The dropdown, its Escape / outside-press code, its CSS and `--z-menu` are gone. « Ce qu'on garde » moved to the Données tab of the account.
- **Mon compte in five tabs** (Profil, Foyer, Agenda, Sécurité, Données; `?tab=` in the address, `role=tablist`). The headings « Mon profil » and « Sécurité » inside their own tab were dropped (the tab says it). A profile save error is now shown on the Profil tab (before it was only visible near « Tout effacer »).
- **No repeated group titles**: the « Groupes » fold on Amis no longer holds a second « Groupes » heading with the same icon (an e2e counts it).

### Host page: one list of families at a time (2026-10-28)
- « Qui vient » appears only once a family has answered (or when nobody is invited yet). Before that, « Les liens » already shows « Sans réponse » per family, so the same names were listed twice.
- `FamilyPicker`'s « add a family » box was a `<form>` inside the page's own form (invalid, and React warned in the e2e log). It is now a plain group: Enter in a name field adds the family, nothing else. `host.spec` plants the old shape red.

### One main action per page: the tile (2026-10-28)
- `BigAction` (components/BigAction.tsx, `.bigaction`): a wide centred tile with the icon above the words, directly under the h1, on Rencontres (new rencontre), Amis (new family), Enfants (add a child) and Fenêtres (open a window). Everything else stays smaller and lower. Hidden on the empty Rencontres screen, where the first-run steps carry their own button.
- Guard: `cards.spec` « every list page has one big tile … right under the title ». New pages with a main action use `BigAction`, not a `btn--primary` in the title row.
- Bundle trap found the hard way: importing `Link` from react-router-dom into `components/Icon.tsx` (or into a new shared module) made Rollup regroup the shared chunks (entry 84.7 to 71.8 KB, the `Icon-*` chunk 16.3 to 29.3 KB, over its cap). So `BigAction` is a button only; the one page that navigates (Rencontres) calls `navigate()`. The shared chunk is at 16.3 of 16.5 KB: the next growth should make French its own lazy chunk. Read `check:bundle` for « exceeded », not only « ok ».
- The Rencontres tile is a calendar icon and a real link (`BigAction` with `href`: ctrl-click opens a tab, a plain click navigates in the app); the Fenêtres tile is a clock. Tiles have a thick ink focus ring. On « Proposer une rencontre » the floating bar holds only « Créer »; « Retour » is a plain link at the top.

### No keyboard pops by itself — 2026-10-29

Opening a form or tapping a button never focuses a text field: the three `autoFocus` (group, child, family forms) are gone, and the board's refocus after sending or after an empty send goes through `focusIfFinePointer` (`src/lib/focus.ts`), which only focuses with a mouse-and-keyboard pointer. `noAutofocus.test.ts` fails on any `autoFocus` and on a `.focus()` outside the skip link, the route change and `focus.ts` (planted red once).

### Circles: the door, « Ils t'ont invité », « Inviter dans mon cercle » — 2026-10-29

Decided with Marc: circles stay PAIRS (two linked families, each sees only what concerns it); shared named circles of 3+ are a possible later step (consent per member, member list, much more privacy care).
- **One door for every code.** A two-word code (`/<code>`, the front page's « Tu as reçu une carte ? ») is a rencontre invitation OR a circle invitation; `GET /api/r/<code>` answers `{ circle }` for the second kind and the page shows `CircleDoor`. New codes are drawn free in invitations, window_targets AND circle_invites (`freshLinkCode`).
- **`circle_invites`** (migration 0022): host household + which of its children + the book family it is for, a code valid 14 days, `sent_at`, used by whom / when, withdrawn. `POST /api/circle-invite { familyId, childId?, send? }` returns the one open code for that family and child (or makes it), optionally emails it (From « Marc via Viens jouer », Reply-To, unsubscribe, daily budget, five-minute cooldown, never to a stopped or bounced address); `GET` lists the open ones; `DELETE { id }` withdraws. At most 20 open. Nothing is sent by itself.
- **Host side, Amis**: every family that is not linked has a « Inviter dans mon cercle » fold: make the code, then the same three ways as a rencontre invitation in one line each (email if it has an address, text, the two words on paper), and « Retirer le code ».
- **The family side**: no account, a quick one is made on the spot and linked at once (`POST /api/r/<code>/claim` accepts circle codes); already signed in, `LinkFamilies` asks for one tap (`POST /api/link-invitation { code }` accepts circle codes). The host is notified (« est sur Viens jouer ») on both paths.
- **« Ils t'ont invité »** on Amis (`GET /api/invited-by`): hosts who invited me (to a rencontre, or into their circle; by link or by my email) and are not in my circle, one line per host, « Ajouter à mes amis » = the same link in one tap (a child picker when I have several). Nothing shown when nobody.
- **One implementation of linking** (`_lib/linking.ts`, `linkHouseholds`): bilateral `child_links`, the host's book entry marked linked, the host put in my book already linked, the host told. Idempotent.
- **« Pourquoi ? » notes moved to their own lazy chunk** (`i18n.why.*.ts`, loaded the first time one is opened): the French dictionary is 10.3 KB again with room for this feature.
- A crash lesson kept in a test: a list endpoint answering `{}` (the e2e stub's default) must never blank the page; the components read `?? []`.

### Cross links between accounts — 2026-10-29

Your case: one person, two accounts (marc.jeanson92@… invites marc_jeanson@…) saw nothing on the second one.
- **The agenda finds it by email**: a rencontre shows in an account's agenda when the invited family's email is the email of one of that household's parents, with no link and no email sent (`calendar.ts`). It works for invitations already sent. A removed family or a cancelled rencontre drops out.
- **« Lier nos familles »** (`POST /api/link-invitation`, `LinkFamilies` on the invitation page, for someone signed in with their own account): one tap makes the bilateral `child_links` row (host child and the chosen child of mine; my only child automatically, a child made from the invitation when I have none, a picker when I have several), marks the host's book entry as linked and puts the host back in MY book already linked, so I can invite back. The host gets a « Marc_ est sur Viens jouer » notification. Not for the host's own rencontre (400), a family already linked to another account (409), a sandbox (403); pressing twice changes nothing. `GET` says which case applies. Before this, only a brand-new account made through the reply page's « claim » could be linked.
- The header shows the face only (the name is its tooltip and label for a screen reader).
- `testDb.batch` now returns one result per statement like D1 (the calendar handler needs it).

### Simple by default, deeper for the curious — 2026-10-29

The rule: a screen shows the ONE thing it is for; everything else is one tap away (a fold, « Plus d'options », « Plus de choix »), never gone.
- **Host card**: the main thing (when, where, the invitations with their one button, « Confirmer ») is in view. « Qui vient » is a closed fold (the invitations card already says who answered), « Le tableau (n) » is one line that opens by itself when something is new (`MessageBoard` is now a `details`; seen-state as before), the cover picture shows on top but its buttons, « Reporter », « Annuler » and « Supprimer » sit under « Plus d'options ». « Renvoyer aux N » only appears from two families up.
- **List**: one calm card per rencontre: kind icon + title, when, where, and the answers as counts (« Oui · 2 · Peut-être · 1 »), never one chip per family.
- **Reply page**: the three-step explanation only before answering; « Envie de revoir Noé ? » and « Qui vient » are folds; the board is one line.
- **Front page**: the three bullets are gone (« Comment ça marche » says it all, as a fold).
- **Compte**: the three e-mail switches and the test mail are one fold, « Courriels et rappels ».
- **Credit** (« Bâti par marc.portal »): front page and Compte only, no longer under every screen.
- **The card box** (« Tu as reçu une carte ? ") is straight (the −0.8° tilt is gone) and is drawn as a ticket: a half-moon bitten out of each side and a dotted tear line between the two words.
- Tests moved with it (open the fold first); new ones pin the rules (`newthings.spec.ts`).

### Notifications — 2026-10-29 (the « no push » decision was reversed by Marc)

- **In the app, always**: `notifications` (migration 0021) holds what a signed-in parent was told; « Nouveau » on Rencontres lists the unread (`NewForYou`), a tap opens it and marks it read. No permission, no email needed: this is what the second test account was missing.
- **Events** (`_lib/notifyEvents.ts`, words in `notifyCopy.ts`, FR/EN per recipient): invited (new invitation), changed / cancelled / postponed (to invited families that did not say no), answered (every parent of the host household, once per invitation per ten minutes), the day-before reminder (alongside the email, for the same people), and a test one. Only to accounts: the household a friend family is linked to, AND any account whose email equals the friend's email (so a host who typed a registered address reaches it; the same exposure as an email). Never to a sandbox. 50 kept per parent, 30 days.
- **On the phone, optional** (`push_subscriptions`, `_lib/webpush.ts`): Web Push with NO payload. The server wakes the device with an empty push (VAPID ES256, WebCrypto, nothing to encrypt); `public/sw.js` then asks `GET /api/notifications?push=1` with the person's own session and shows it (each push always shows something: a phone refuses silent ones). Nothing readable crosses Apple's or Google's push service. A dead subscription (404/410) is deleted. Compte, Notifications: one switch per device, a test notification, and plain words (iPhone: add to the home screen first). Off until `VAPID_PRIVATE_KEY` is set.
- **Explained on the site**: « Comment ça marche » (four steps + who gets what) at the foot of the front page; the Notifications tab in Compte; one sentence on the privacy page.
- **Privacy page text moved to its own lazy chunk** (`i18n.privacy.fr/en.ts`, loaded by `Privacy.tsx`): the French dictionary fell from 12.1 to 10.6 KB gzip and the chunk cap went back to 11 KB (the 12 KB raise earlier that day was a bridge). `copyRules.test` reads the privacy text too.
- Tests: VAPID signature verified against its public key, push 201/404/410, notify on a real database (language, linked or same-email, no sandbox, dedupe, cap, dead device deleted), the endpoints behind a real session, the create-a-rencontre-inviting-a-registered-account path end to end, `sw.js` run against a stand-in scope, and the browser (Nouveau, Compte, front page).
- **Switched on 2026-10-29**: `VAPID_PRIVATE_KEY` is set on the Worker and a test notification arrived on Marc's phone. Not yet tried: the other platform (iPhone vs Android) and a push for a real invitation between two accounts. Families with only a link stay on email (decided: accounts only).

### Sending invitations made easy — 2026-10-29

- **Nothing is sent on its own**: creating or confirming a rencontre only mints the links. Sending is a choice, now three plain ones.
- **« Envoyer les invitations par courriel tout de suite »**: a tickbox on the new-rencontre form, OFF by default, offered only when a picked family can be emailed (an address, no stop, no bounce); it says how many, or that none can and what to do instead. `POST /api/encounters { sendNow }` emails the FIRST date's families (`_lib/inviteMail.ts`: claim, then send, give the slot back on failure; same From name, Reply-To, unsubscribe and daily budget as the single button); the host page opens with « N invitations envoyées ».
- **One button per family** on the invitations card: « Envoyer par courriel » (primary until sent, then « Renvoyer » and an « Envoyée » chip) or, with no usable address, « Envoyer par texto »; the text option stays under « Plus de choix » for the ones who can be emailed. « Envoyer à N familles par courriel » on top for everyone not yet told; « Renvoyer aux N sans réponse » for the ones told and silent.
- **« Autres façons d'inviter »** (open when nobody has an address): three plain lines, email, text/WhatsApp, paper, with the button to the printable cards.
- Why the other account saw nothing: it was never sent anything (and the app has no notification system yet, see the next entry).

### Everything else on the list — 2026-10-29

- **Credit line**: `Credit` under every screen, « Bâti par marc.portal » linking to https://marcportal.com, as Horizon does; hidden in print.
- **Naps of friends**: `friend_families.nap_start/nap_end` (migration 0020), typed by the host on the friend's form. The new-rencontre slots clear the EARLIEST nap start and the LATEST nap end of the host's child and every family picked (`napSlots` takes a list).
- **Import friends**: « Importer une liste » on Amis (paste « parent, enfant, courriel », or the phone's contact picker where the browser has one). The page reads the paste first and names the lines it cannot read (`src/lib/importList.ts`); `POST /api/families { import: [...] }` re-checks, is all-or-nothing, skips a family already in the book (`_lib/importFamilies.ts`). The first-steps card links straight to it (`/amis?importer=1`).
- **Home-screen offer**: `InstallOffer` on Rencontres after three different days, once (« Plus tard » is final), reusing `lib/install.ts`.
- **CASL**: every email to a friend family ends with « ne plus recevoir » (`withUnsubscribe`: a link to `/stop/<code>` and the one-click `List-Unsubscribe` headers). `friend_families.mail_stopped_at` is set by `POST /api/r/<code>/stop-mail` (an invitation's or a window's code) and undone from the same page. Nothing is emailed to a stopped family or one whose address bounced (invitation, window, update, thanks, reminders); the host sees « Ne veut plus de courriels » / « Courriel non reçu » on the card and on Amis. Editing the address clears the bounce, never the stop.
- **A real From**: mail a host sends to a friend reads « Marc via Viens jouer », with Reply-To set to the host's own sign-in address (so the guest sees it). The sending address is still the app's.
- **Monday digest**: opt-in (Compte, Profil), one email Monday 7 h to 11 h in the household's zone, the coming week with who said what, nothing when the week is empty, counted in the mail budget (`_lib/digest.ts`).
- **Turnstile, finished 2026-10-29**: the site key (public) and `TURNSTILE_HOSTNAMES = jouer.marcportal.com` are in `wrangler.toml`; each widget is rendered with `data-action` `signup` / `forgot` and the server refuses a token whose action or hostname is wrong; the widget is reset after every attempt (a token works once). It stays OFF until the secret is set: `wrangler secret put TURNSTILE_SECRET` (the key without the secret is a half switch).
- **Turnstile**: on signup and forgot-password, only when `TURNSTILE_SITE_KEY` + `TURNSTILE_SECRET` are both set (fails closed when the check cannot be made). The CSP now allows challenges.cloudflare.com (script + frame) and the privacy page says so. **To turn on**: create a Turnstile widget for jouer.marcportal.com, put its site key in `wrangler.toml` [vars], `wrangler secret put TURNSTILE_SECRET`.
- **Ops**: the hourly cron stamps `cron_beats`, `/api/health` reports `cronAgeSec`, and the production check (`stranger.yml`, now nightly) fails when it is over three hours, so GitHub emails you. With `ADMIN_EMAIL` set, the app also emails you once a day when the last 24 h pass 80 of Resend's 100.
- **WebKit in CI**: Playwright has a second project on WebKit (the iPhone engine) running the tests tagged `@webkit` (date pickers, 320 px and 200 % text fits). Locally it cannot reproduce the iOS spill, so those tests also pin the cause.
- **Large text**: the host screens and the reply page are tested at 200 % text on a 375 px screen; the roster row was spilling and is fixed.
- **Shared API shape**: `src/lib/replyCard.ts` is the page's card type plus its key lists; `replyCard.test.ts` runs the real handler and compares.
- **Checked and not done**: « faster unit tests » (the 150 s was summed across parallel workers; the whole suite runs in about ten seconds).
- **Budgets** raised on purpose, see the front door.

### The last four — 2026-10-29

- **Cancel can email**: the cancelled card's reason form has « Prévenir par courriel » (off by default, a send cannot be undone); `PATCH encounters { announce: true, reason? }` sends the current status (cancelled or postponed) with the host's word, within the daily mail budget.
- **Bounce awareness**: `POST /api/resend-webhook` (public on the written list, authenticated by the Svix signature, `_lib/svix.ts`) stamps `friend_families.email_bounced_at` (migration 0019) on `email.bounced` / `email.complained`; the host sees « Courriel non reçu » on the card and on Amis, and editing the address clears it. **Needs the human step**: in Resend, Webhooks, add `https://jouer.marcportal.com/api/resend-webhook` for bounced + complained, then `wrangler secret put RESEND_WEBHOOK_SECRET` with its `whsec_…`. Until then the endpoint answers 503 and nothing shows.
- **Dead window links** say « écris à Marie » too (`_lib/retired.ts` serves both kinds).
- **Browser tests** for the sibling answer, the partner line, Reporter, the cancel email, the bounce mark, the removed link and the postponed reply page.

### Date and time pickers on iOS — 2026-10-29

A native date or time input spilled out of its card on iOS (the « Heure » picker, the birthdate) and the two nap pickers overlapped (bare labels around inputs set to 100 % width). `input[type=date|time]` now has the native chrome off, `min-width: 0`, and a minimum value height so an empty one is not collapsed; the nap pair is a `.when.when--even` grid of two `.field`s. Guards: `dateInputs.test.ts`, and an e2e at 320 and 375 px on the new-rencontre, child and family forms (every picker inside its card and the screen, pickers on one row never overlapping; chromium cannot reproduce the spill, so it also pins the cause: planted red by reverting the CSS). Not tried on a real iPhone: please look once. Stylesheet budget is now 5.4 / 5.5 KB.
- **Stranger walk vs production, 2026-10-29**: it failed at the signup probe, because Turnstile (now on) refuses a bare API signup with 400. The walk now reads `/api/health`: with Turnstile on it asserts the 400 and stops (no real account left behind); without it, it runs the full neutral-answer probe. Passes against production again.
- **Slimmer, 2026-10-29**: on the answered reply page « Changer » is a small button and « Suivre dans mon calendrier » sits under « Plus d'options » (the calendar file stays the one primary action); on Amis a family row keeps Modifier, and « Retirer » / « Couper le lien » moved under « Plus d'options ». `ADMIN_EMAIL` secret is set (the email-limit alert goes to Marc's hotmail address). Turnstile solved by a real person on a phone and push on the second platform both confirmed by Marc.
- **Fewer words, 2026-10-29** (looked at the screenshots first): the first-steps card says « Ajoute ton enfant. / Ajoute un ami. / Propose une rencontre. »; on the new-rencontre form the title moved under « Plus de choix » (it writes itself) and the two hint lines are gone; the answered reply page says only « Marc voit ta réponse. »; the account name field has no hint. Already done earlier, so not redone: cancel and cut have a 6 s undo, notifications lead with the host and the title. Not done on purpose: a different main-button label on the form, pre-filled times (the « Refaire pareil » path already pre-fills).
- **Plain words, 2026-10-29** (the grandma pass): the main button is « Inviter »; the account tab « Foyer » is « Ma famille »; the two kinds are « Je propose une date » / « Je suis libre, qui veut venir ? »; « Le tableau » is « Les messages »; the two « Plus » folds share one name, « Plus d'options »; « Lier nos familles » is « Ajouter à mes amis »; the sign-out arrow carries its word « Quitter » when the screen is wider than 420 px (the existing icon, no new one). Still app words on purpose: « cercle », « Sur Viens jouer ».
