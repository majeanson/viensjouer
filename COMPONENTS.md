# COMPONENTS.md — what exists, so you reuse it

> Read before writing UI. If a row fits, use it; if it almost fits, extend it. A new shared piece gets a row here
> in the same commit (`functions/_lib/components.test.ts` fails the build if a file in `src/components/` has no row).

## Pieces

| Piece | Use it for | Notes |
| --- | --- | --- |
| `Icon` | A small glyph in front of a label, heading or fold summary | Decorative (`aria-hidden`), never alone, never an emoji. `kindIcon` maps a rencontre kind. `BigAction` (same file, so the bundle splits as before) is the one main action of a page: a wide centred tile, icon above the words, right under the title; the rest of the page stays smaller. |
| `Face` | A person's photo, else their initial | Optional like every photo. Ink on a hex colour comes from `lib/palette.ts` `inkOn` (contrast), tokens set their own. |
| `AvatarPicker` | Choosing a face for a child or parent | Small square JPEG; no bucket, no button. |
| `CoverPicture` | The one cover picture of a rencontre | Host add / change / remove with undo. |
| `PhotoGrid` | Souvenirs: the day's photos | The caller says where bytes come from and how to upload. |
| `MessageBoard` | The board on the host page and the invitation | Pins, own messages, « Nouveau » per device. |
| `Why` / `WhyMany` | « Pourquoi ? » under optional fields | ONE `WhyMany` per group of fields, `Why` for a single field. |
| `WhenInput` | a day and an hour, two pickers, one value | Any rencontre or window time. Never a bare `datetime-local`. |
| `Rel` | « · demain », « · dans 3 jours » beside a date | Only inside the coming week; `lib/format.ts` `relativeDay`. |
| `Loading` | First read in flight | Skeleton cards + a status line. `page` for screens rendered before the header. |
| `QueryError` | A read failed | `role=alert`, a « Réessayer » button; `dead` gives the 404 sentence and drops the button. |
| `ErrorBoundary` / `OfflineNotice` | A thrown render error; no network | Reloads once when a deploy replaced a chunk. |
| `Header` | The sticky top bar on every page | Brand, language, theme, your face and name (one tap to your account) and a separate sign-out button. No dropdown. |
| `Shell` | The signed-in frame: header, tabs, offline notice, main | Tabs are the bottom bar on a phone. |
| `FamilyPicker` | Choosing friend families (and groups) for a rencontre | |
| `Groups` | Private shortcuts in the family picker | |
| `EncounterEdit` | « Modifier » with a live preview of what families see | |
| `HomeCard` | The « Chez nous » card: form and read-only view | |
| `ParentInvite` | Inviting the other parent | |
| `ImportFriends` | Adding many friend families from one paste (or the contact picker) | Says what it understood before saving; a line it cannot read stays a line to fix. |
| `Credit` | The « Bâti par marc.portal » signature: front page and account page only | Plain link out, hidden in print. |
| `InstallOffer` | One card, after three different days of use: keep it on the home screen | Native prompt where the browser has one, the iPhone steps otherwise; « Plus tard » is final. |
| `Turnstile` | The Cloudflare bot check on signup and forgot-password | Mounted only when /api/health reports a site key; hands its token to the form in a hidden `turnstile` field. |
| `NotificationBell` | The bell in the header: what happened (invited, changed, answered, reminder), unread first then what you already read | A dot, never a number. Needs no permission; the same list the phone notification is made from. |
| `NotificationsCard` | Compte, Notifications: what you are told, and the switch for this device | In plain words; on iPhone it says to add the app to the home screen first. |
| `LinkFamilies` | On an invitation page, for someone signed in with their own account: one tap links the two households | Not shown to the host, to a family already linked to another account, or in a trial. |
| `CircleInvite` | On a family of Amis that is not linked: a code with no rencontre, sent by email, text or on paper | Nothing is sent by itself; the code stops working after 14 days. |
| `CircleDoor` | What a two-word code opens when it is a circle invitation | Signed in: one tap (`LinkFamilies`). No account: a quick one is made and linked at once. |
| `InvitedBy` | « Ils t'ont invité » on Amis: hosts who invited you and are not in your circle, one tap to add | Shows nothing when there is nobody to add. |
| `PartnerNudge` | The one line on Rencontres asking a solo host to invite the other parent | |
| `CardCode` | Home page: the two words of a card, one box each (a space jumps, a paste spreads); focus moves only while typing | |
| `CalendarFeed` | The host's secret calendar feed | |

## Styles (`src/styles.css`)

- **Tokens first**: colour (`--paper`, `--ink`, `--accent`, `--ok` + `--ok-ink`, ...), radius scale (`--r-sm/md/lg/pill`), `--target` (44 px),
  `--nav-h`, z-index scale (`--z-*`). A value is declared once; do not override it further down the file.
- **Layout**: `.shell` (page column), `.stack`, `.cluster`, `.row`, `.card`, `.fold`, `.more`.
- **Controls**: `.btn` (+ `--primary`, `--small`, `--ghost`, `--danger`, `--big`, `--yes`), `.linkbtn`, `.input`, `.field`, `.seg`, `.chip`.
  Small controls keep a 44 px hit area through `::after`; one global `:focus-visible` ring.
- **Messages**: `.notice` (+ `--err`), `.skeleton`, toasts via `lib/toast.tsx` (never `confirm()`).
- **Motion** lives under `prefers-reduced-motion: no-preference` and is limited to transform and opacity.
