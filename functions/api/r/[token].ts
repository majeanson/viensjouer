import type { Env } from '../../_lib/env'
import { badRequest, notFound, ok, readJson, str, tooManyRequests } from '../../_lib/json'
import { overAuthLimit } from '../../_lib/rateLimit'
import { newId, normalizeLinkCode, nowSec } from '../../_lib/ids'
import { addressFor, isReply, linkAlive, type EncounterRow, type Reply } from '../../_lib/encounters'
import { REMIND_LEAD_SEC } from '../../_lib/reminders'

// THE install-free side. The token in the path is the whole credential: one card, one
// family. No cookie, no CSRF (worker/index.ts exempts `r/`), rate-limited by address.
//
//   GET  /api/r/<token>  → the card as that family may see it (address only on yes),
//                          their current reply, the thread, their prefilled details
//   POST /api/r/<token>  → { reply?, note?, parentName?, email?, phone?, allergies?,
//                            message? } — any subset; a message appends to the thread

interface Resolved {
  invitation: { id: string; friend_family_id: string; reply: Reply | null; reply_note: string | null; remind_at: number | null }
  encounter: EncounterRow & { household_id: string }
  series_id: string | null
  family: { parent_name: string; email: string | null; phone: string | null; child_first_name: string; allergies: string | null }
  host: { child_first_name: string; parent_name: string; household_name: string; tz: string }
}

async function resolve(env: Env, raw: string | undefined): Promise<Resolved | null> {
  // The code as typed off a paper: hyphen, spaces and case forgiven.
  const token = normalizeLinkCode(raw)
  if (!token) return null
  const row = await env.DB.prepare(
    `SELECT i.id AS inv_id, i.friend_family_id, i.reply, i.reply_note, i.remind_at,
            e.id, e.series_id, e.household_id, e.child_id, e.kind, e.title, e.starts_at, e.ends_at, e.place, e.address, e.note, e.status,
            f.parent_name, f.email, f.phone, f.child_first_name, f.allergies,
            c.first_name AS host_child, h.name AS household_name, h.tz,
            (SELECT display_name FROM parents p WHERE p.household_id = e.household_id ORDER BY p.created_at LIMIT 1) AS host_parent
       FROM invitations i
       JOIN encounters e ON e.id = i.encounter_id
       JOIN friend_families f ON f.id = i.friend_family_id
       JOIN children c ON c.id = e.child_id
       JOIN households h ON h.id = e.household_id
      WHERE i.token = ? AND e.deleted_at IS NULL`,
  )
    .bind(token)
    .first<Record<string, unknown>>()
  if (!row) return null
  return {
    invitation: { id: row.inv_id as string, friend_family_id: row.friend_family_id as string, reply: row.reply as Reply | null, reply_note: row.reply_note as string | null, remind_at: row.remind_at as number | null },
    encounter: {
      id: row.id as string,
      household_id: row.household_id as string,
      child_id: row.child_id as string,
      kind: row.kind as EncounterRow['kind'],
      title: row.title as string,
      starts_at: row.starts_at as number,
      ends_at: row.ends_at as number | null,
      place: row.place as string | null,
      address: row.address as string | null,
      note: row.note as string | null,
      status: row.status as EncounterRow['status'],
    },
    family: {
      parent_name: row.parent_name as string,
      email: row.email as string | null,
      phone: row.phone as string | null,
      child_first_name: row.child_first_name as string,
      allergies: row.allergies as string | null,
    },
    series_id: row.series_id as string | null,
    host: { child_first_name: row.host_child as string, parent_name: (row.host_parent as string | null) ?? '', household_name: row.household_name as string, tz: row.tz as string },
  }
}

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  if (await overAuthLimit(ctx.env, ctx.request)) return tooManyRequests()
  const r = await resolve(ctx.env, ctx.params.token as string | undefined)
  if (!r) return notFound('Ce lien ne mène nulle part.')
  const alive = linkAlive(r.encounter, nowSec())
  const { results: messages } = await ctx.env.DB.prepare('SELECT id, author_kind, author_label, text, created_at FROM encounter_messages WHERE encounter_id = ? ORDER BY created_at')
    .bind(r.encounter.id)
    .all()
  // The other upcoming occurrences of the same weekly series for THIS family, each with
  // its own link: a family answers every week from one page.
  const { results: seriesRows } = r.series_id
    ? await ctx.env.DB.prepare(
        `SELECT i.token, e.starts_at, i.reply FROM invitations i JOIN encounters e ON e.id = i.encounter_id
          WHERE e.series_id = ? AND i.friend_family_id = ? AND e.deleted_at IS NULL AND e.status != 'cancelled' AND e.starts_at > ? AND e.id != ? ORDER BY e.starts_at`,
      )
        .bind(r.series_id, r.invitation.friend_family_id, nowSec(), r.encounter.id)
        .all<{ token: string; starts_at: number; reply: Reply | null }>()
    : { results: [] as { token: string; starts_at: number; reply: Reply | null }[] }
  const { address: _hidden, household_id: _hh, ...card } = r.encounter
  return ok({
    alive,
    encounter: { ...card, address: addressFor(r.invitation.reply, r.encounter.address) },
    host: r.host,
    you: { ...r.family, reply: r.invitation.reply, replyNote: r.invitation.reply_note, remind: r.invitation.remind_at !== null },
    messages,
    series: seriesRows,
  })
}

type Body = { reply?: string; note?: string | null; parentName?: string; email?: string; phone?: string; allergies?: string; message?: string; remind?: boolean }

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  if (await overAuthLimit(ctx.env, ctx.request)) return tooManyRequests()
  const r = await resolve(ctx.env, ctx.params.token as string | undefined)
  if (!r) return notFound('Ce lien ne mène nulle part.')
  if (!linkAlive(r.encounter, nowSec())) return badRequest('Cette rencontre est passée ou annulée.')
  const body = await readJson<Body>(ctx.request)
  if (!body) return badRequest('Corps invalide.')
  const ts = nowSec()
  const stmts: D1PreparedStatement[] = []

  if (body.reply !== undefined) {
    if (!isReply(body.reply)) return badRequest('Réponse inconnue.')
    stmts.push(
      ctx.env.DB.prepare('UPDATE invitations SET reply = ?, reply_note = ?, reply_at = ?, updated_at = ? WHERE id = ?').bind(
        body.reply,
        str(body.note, 500),
        ts,
        ts,
        r.invitation.id,
      ),
    )
  }
  // The ONE reminder (the hourly cron sends it): a day before, only if still ahead, and
  // only once the family has an email on file (sent now or already in the book).
  if (typeof body.remind === 'boolean') {
    const at = body.remind ? Math.max(r.encounter.starts_at - REMIND_LEAD_SEC, ts) : null
    stmts.push(ctx.env.DB.prepare('UPDATE invitations SET remind_at = ?, reminded_at = NULL, updated_at = ? WHERE id = ?').bind(at, ts, r.invitation.id))
  }
  // Their own details, into the host's book. Only the fields they sent; a blank one is
  // left alone so a reply cannot erase what the host typed.
  const parentName = str(body.parentName, 60)
  const email = str(body.email, 120)?.toLowerCase() ?? null
  const phone = str(body.phone, 30)
  const allergies = body.allergies !== undefined ? str(body.allergies, 300) : undefined
  if (parentName || email || phone || allergies !== undefined) {
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return badRequest('Courriel invalide.')
    stmts.push(
      ctx.env.DB.prepare(
        'UPDATE friend_families SET parent_name = COALESCE(?, parent_name), email = COALESCE(?, email), phone = COALESCE(?, phone), allergies = CASE WHEN ? THEN ? ELSE allergies END, updated_at = ? WHERE id = ?',
      ).bind(parentName, email, phone, allergies !== undefined ? 1 : 0, allergies ?? null, ts, r.invitation.friend_family_id),
    )
  }
  const message = str(body.message, 1000)
  if (message) {
    stmts.push(
      ctx.env.DB.prepare('INSERT INTO encounter_messages (id, encounter_id, author_kind, author_label, text, created_at) VALUES (?, ?, ?, ?, ?, ?)').bind(
        newId(),
        r.encounter.id,
        'guest',
        parentName ?? r.family.parent_name,
        message,
        ts,
      ),
    )
  }
  if (!stmts.length) return badRequest('Rien à enregistrer.')
  await ctx.env.DB.batch(stmts)
  return ok()
}
