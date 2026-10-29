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
| `CalendarFeed` | The host's secret calendar feed | |

## Styles (`src/styles.css`)

- **Tokens first**: colour (`--paper`, `--ink`, `--accent`, `--ok` + `--ok-ink`, ...), radius scale (`--r-sm/md/lg/pill`), `--target` (44 px),
  `--nav-h`, z-index scale (`--z-*`). A value is declared once; do not override it further down the file.
- **Layout**: `.shell` (page column), `.stack`, `.cluster`, `.row`, `.card`, `.fold`, `.more`.
- **Controls**: `.btn` (+ `--primary`, `--small`, `--ghost`, `--danger`, `--big`, `--yes`), `.linkbtn`, `.input`, `.field`, `.seg`, `.chip`.
  Small controls keep a 44 px hit area through `::after`; one global `:focus-visible` ring.
- **Messages**: `.notice` (+ `--err`), `.skeleton`, toasts via `lib/toast.tsx` (never `confirm()`).
- **Motion** lives under `prefers-reduced-motion: no-preference` and is limited to transform and opacity.
