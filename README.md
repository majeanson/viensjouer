# Viens jouer

Les parents s’organisent pour que les tout-petits se voient. Crée la rencontre — au parc,
chez nous, une fête — envoie le lien ; l’autre parent répond sans compte.

Parents get organized so the little ones can see each other. Create the get-together,
send the link; the other parent answers with no account.

Live at **https://jouer.marcportal.com**. A link looks like `jouer.marcportal.com/h7kq-3wpm`
— short enough to write on a paper at the daycare door.

One Cloudflare Worker (static SPA + `/api/*`) + D1. See [`CLAUDE.md`](./CLAUDE.md) for
the shape and [`STATE.md`](./STATE.md) for where it is.

```bash
npm install
cp .dev.vars.example .dev.vars   # set SESSION_SECRET
npm run db:migrate:local
npm run cf:dev                   # http://localhost:8787
```
