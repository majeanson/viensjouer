import type { Env } from '../../_lib/env'
import { lockedOut, lookupMiss } from '../../_lib/guessLimit'
import { badRequest, conflict, created, ok, readJson, str, tooManyRequests } from '../../_lib/json'
import { overAuthLimit } from '../../_lib/rateLimit'
import { newId, normalizeLinkCode, nowSec } from '../../_lib/ids'
import { linkAlive, type Reply, type Status } from '../../_lib/encounters'
import { MAX_BRING, canClaim, cleanLabel } from '../../_lib/bring'

// POST /api/r/<code>/bring — a family that said yes or maybe takes a line, lets it go, or adds its own.
//   { claim: <id> }    take a line nobody has
//   { release: <id> }  let go of a line I took (a line I added myself is removed)
//   { add: "fruits" }  add a line, already mine
// The parent's first name is shown next to what they bring (the invitation's own name, nothing new).
export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  if ((await overAuthLimit(ctx.env, ctx.request)) || (await lockedOut(ctx.env, ctx.request))) return tooManyRequests()
  const code = normalizeLinkCode(ctx.params.token as string | undefined)
  if (!code) return lookupMiss(ctx.env, ctx.request)
  const row = await ctx.env.DB.prepare(
    `SELECT i.id AS inv_id, i.reply, e.id AS enc_id, e.starts_at, e.ends_at, e.status, f.parent_name
       FROM invitations i JOIN encounters e ON e.id = i.encounter_id JOIN friend_families f ON f.id = i.friend_family_id
      WHERE i.token = ? AND e.deleted_at IS NULL`,
  )
    .bind(code)
    .first<{ inv_id: string; reply: Reply | null; enc_id: string; starts_at: number; ends_at: number | null; status: Status; parent_name: string }>()
  if (!row) return lookupMiss(ctx.env, ctx.request)
  if (!linkAlive(row, nowSec())) return badRequest('Cette rencontre est passée ou annulée.')
  if (!canClaim(row.reply)) return badRequest('Réponds « oui » ou « peut-être » d’abord.')
  const body = await readJson<{ claim?: string; release?: string; add?: string }>(ctx.request)
  const db = ctx.env.DB
  const who = row.parent_name.slice(0, 60)

  if (body?.add !== undefined) {
    const label = cleanLabel(body.add)
    if (!label) return badRequest('Écris ce que tu apportes.')
    const n = await db.prepare('SELECT COUNT(*) AS n FROM bring_items WHERE encounter_id = ?').bind(row.enc_id).first<{ n: number }>()
    if ((n?.n ?? 0) >= MAX_BRING) return conflict('Vingt lignes au plus.')
    const id = newId()
    await db.prepare("INSERT INTO bring_items (id, encounter_id, label, claimed_by, claimed_label, added_by, created_at) VALUES (?, ?, ?, ?, ?, 'guest', ?)").bind(id, row.enc_id, label, row.inv_id, who, nowSec()).run()
    return created({ id })
  }
  const claim = str(body?.claim, 20)
  if (claim) {
    const r = await db.prepare('UPDATE bring_items SET claimed_by = ?, claimed_label = ? WHERE id = ? AND encounter_id = ? AND claimed_by IS NULL').bind(row.inv_id, who, claim, row.enc_id).run()
    if (!r.meta.changes) return conflict('Quelqu’un l’a déjà pris.')
    return ok()
  }
  const release = str(body?.release, 20)
  if (release) {
    const mine = await db.prepare('SELECT id, added_by FROM bring_items WHERE id = ? AND encounter_id = ? AND claimed_by = ?').bind(release, row.enc_id, row.inv_id).first<{ id: string; added_by: string }>()
    if (!mine) return ok()
    if (mine.added_by === 'guest') await db.prepare('DELETE FROM bring_items WHERE id = ?').bind(mine.id).run()
    else await db.prepare('UPDATE bring_items SET claimed_by = NULL, claimed_label = NULL WHERE id = ?').bind(mine.id).run()
    return ok()
  }
  return badRequest('Rien à faire.')
}
