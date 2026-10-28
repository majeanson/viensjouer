# Viens jouer

Les parents s’organisent pour que les tout-petits se voient. Crée la rencontre — au parc,
chez nous, une fête — envoie le lien ; l’autre parent répond sans compte.

Parents get organized so the little ones can see each other. Create the get-together,
send the link; the other parent answers with no account.

Live at **https://jouer.marcportal.com**. A link looks like `jouer.marcportal.com/lune-miel` (two plain words)
— short enough to write on a paper at the daycare door.

One Cloudflare Worker (static SPA + `/api/*`) + D1. See [`CLAUDE.md`](./CLAUDE.md) for
the shape and [`STATE.md`](./STATE.md) for where it is.

```bash
npm install
cp .dev.vars.example .dev.vars   # set SESSION_SECRET
npm run db:migrate:local
npm run cf:dev                   # http://localhost:8787
```

## What it does

- **Propose** a get-together (park, home, birthday; once or repeating) in four taps; the title writes itself.
- **Invite** families by link or email; the other parent answers with one tap, no account. The host sees who is coming, maybe, not.
- **Everyone writes on the board**, takes something to bring, follows the date in their own calendar (a subscription that updates itself).
- **Faces and a cover picture**, all optional. **A name and an email are enough** for everything; each extra says why it is asked and what skipping it costs.
- Installable on iOS and Android (manifest, icons), French first, English by device setting.

## Checks

```bash
npm run verify     # typecheck, dead code, unit tests, build, bundle budget
npm run e2e:ci     # the browser suite, API stubbed
SHOTS=1 npx playwright test shots   # screenshots for a design review
```
