# Viens jouer

Les parents s’organisent pour que les tout-petits se voient. Crée la rencontre — au parc,
chez nous, une fête — envoie le lien ; l’autre parent répond sans compte.

Parents get organized so the little ones can see each other. Create the get-together,
send the link; the other parent answers with no account.

One Cloudflare Worker (static SPA + `/api/*`) + D1. See [`CLAUDE.md`](./CLAUDE.md) for
the shape and [`STATE.md`](./STATE.md) for where it is.

```bash
npm install
cp .dev.vars.example .dev.vars   # set SESSION_SECRET
npm run db:migrate:local
npm run cf:dev                   # http://localhost:8787
```
