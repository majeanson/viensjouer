import type { Env } from '../../_lib/env'
import { lockedOut, lookupMiss } from '../../_lib/guessLimit'
import { badRequest, ok, readJson, str, tooManyRequests } from '../../_lib/json'
import { overAuthLimit } from '../../_lib/rateLimit'
import { newId, normalizeLinkCode, nowSec } from '../../_lib/ids'
import { MAX_MESSAGES, canDeleteOwn } from '../../_lib/board'
import { addressFor, coverId, isReply, linkAlive, type EncounterRow, type Reply } from '../../_lib/encounters'
import { REMIND_LEAD_SEC } from '../../_lib/reminders'
import { headcount, hereAllowed, homeCardOrNull, parseDetails, souvenirsVisible, type Scope } from '../../_lib/kinds'
import { photosEnabled } from '../../_lib/photos'

// THE install-free side. The token in the path is the whole credential: one card, one
// family. No cookie, no CSRF (worker/index.ts exempts `r/`), rate-limited by address.
//
//   GET  /api/r/<token>  → the card as that family may see it (address only on yes),
//                          their current reply, the thread, their prefilled details
//   POST /api/r/<token>  → { reply?, note?, parentName?, email?, phone?, allergies?,
//                            message? } — any subset; a message appends to the thread

interface Resolved {
  invitation: { id: string; friend_family_id: string; reply: Reply | null; reply_note: string | null; remind_at: number | null; adults: number | null; kids: number | null; scope: Scope }
  encounter: EncounterRow & { household_id: string }
  series_id: string | null
  family: { parent_name: string; email: string | null; phone: string | null; child_first_name: string; allergies: string | null }
  host: { child_first_name: string; parent_name: string; household_name: string; tz: string; childPhoto: string | null; parentPhoto: string | null }
}

async function resolve(env: Env, raw: string | undefined): Promise<Resolved | null> {
  // The code as typed off a paper: hyphen, spaces and case forgiven.
  const token = normalizeLinkCode(raw)
  if (!token) return null
  const row = await env.DB.prepare(
    `SELECT i.id AS inv_id, i.friend_family_id, i.reply, i.reply_note, i.remind_at,
            e.id, e.series_id, e.household_id, e.child_id, e.kind, e.title, e.starts_at, e.ends_at, e.place, e.address, e.map_url, e.cover_key, e.show_guests, e.note, e.status, e.details, e.here_at, i.adults, i.kids, i.scope,
            f.parent_name, f.email, f.phone, f.child_first_name, f.allergies,
            c.first_name AS host_child, c.photo_key AS host_child_photo,
            (SELECT photo_key FROM parents p WHERE p.household_id = e.household_id ORDER BY p.created_at LIMIT 1) AS host_parent_photo, h.name AS household_name, h.tz,
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
    invitation: { id: row.inv_id as string, friend_family_id: row.friend_family_id as string, reply: row.reply as Reply | null, reply_note: row.reply_note as string | null, remind_at: row.remind_at as number | null, adults: row.adults as number | null, kids: row.kids as number | null, scope: row.scope as Scope },
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
      map_url: row.map_url as string | null,
      cover_key: row.cover_key as string | null,
      show_guests: row.show_guests as number,
      note: row.note as string | null,
      status: row.status as EncounterRow['status'],
      details: row.details as string,
      here_at: row.here_at as number | null,
    },
    family: {
      parent_name: row.parent_name as string,
      email: row.email as string | null,
      phone: row.phone as string | null,
      child_first_name: row.child_first_name as string,
      allergies: row.allergies as string | null,
    },
    series_id: row.series_id as string | null,
    host: { child_first_name: row.host_child as string, parent_name: (row.host_parent as string | null) ?? '', household_name: row.household_name as string, tz: row.tz as string, childPhoto: coverId(row.host_child_photo as string | null), parentPhoto: coverId(row.host_parent_photo as string | null) },
  }
}

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  if ((await overAuthLimit(ctx.env, ctx.request)) || (await lockedOut(ctx.env, ctx.request))) return tooManyRequests()
  const r = await resolve(ctx.env, ctx.params.token as string | undefined)
  if (!r) return lookupMiss(ctx.env, ctx.request)
  const alive = linkAlive(r.encounter, nowSec())
  const { results: messages } = await ctx.env.DB.prepare('SELECT id, author_kind, author_label, text, created_at, pinned, invitation_id FROM encounter_messages WHERE encounter_id = ? AND deleted_at IS NULL ORDER BY created_at')
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
  // Phase 4: what each kind adds. A home card is shown BEFORE the answer (it is the
  // point of the card); the relais only to the family it was written for; the day's photos
  // only to a family that said yes.
  const now = nowSec()
  const home = r.encounter.kind === 'home'
    ? await ctx.env.DB.prepare('SELECT details FROM home_cards WHERE household_id = ?').bind(r.encounter.household_id).first<{ details: string }>()
    : null
  const relais = await ctx.env.DB.prepare('SELECT nap, ate, mood, note, expires_at FROM relais WHERE invitation_id = ? AND expires_at > ?').bind(r.invitation.id, now).first()
  const photoRows = souvenirsVisible(r.encounter, r.invitation.reply, now)
    ? (await ctx.env.DB.prepare('SELECT id, author_label FROM souvenirs WHERE encounter_id = ? AND deleted_at IS NULL ORDER BY created_at').bind(r.encounter.id).all()).results
    : []
  // Who is coming, for the families invited too: first names of the children who said yes or maybe
  // (never a no), and how many have not answered. The host can switch it off (show_guests).
  let guests: { yes: string[]; maybe: string[]; waiting: number } | null = null
  if (r.encounter.show_guests !== 0) {
    const { results } = await ctx.env.DB.prepare(
      `SELECT f.child_first_name AS name, i.reply FROM invitations i JOIN friend_families f ON f.id = i.friend_family_id
        WHERE i.encounter_id = ? AND f.deleted_at IS NULL ORDER BY i.reply_at`,
    )
      .bind(r.encounter.id)
      .all<{ name: string; reply: Reply | null }>()
    guests = {
      yes: results.filter((g) => g.reply === 'yes').map((g) => g.name),
      maybe: results.filter((g) => g.reply === 'maybe').map((g) => g.name),
      waiting: results.filter((g) => g.reply === null).length,
    }
  }
  const { results: bringRows } = await ctx.env.DB.prepare('SELECT id, label, claimed_by, claimed_label FROM bring_items WHERE encounter_id = ? ORDER BY created_at')
    .bind(r.encounter.id)
    .all<{ id: string; label: string; claimed_by: string | null; claimed_label: string | null }>()
  const bring = bringRows.map((b) => ({ id: b.id, label: b.label, by: b.claimed_label, mine: b.claimed_by === r.invitation.id }))
  // What was edited since the invitation went out (the address itself is never in the log).
  const { results: changes } = await ctx.env.DB.prepare('SELECT field, old_value, new_value, created_at FROM encounter_changes WHERE encounter_id = ? AND created_at > ? ORDER BY created_at DESC LIMIT 10')
    .bind(r.encounter.id, now - 60 * 86_400)
    .all()
  const { address: _hidden, map_url: _mapHidden, cover_key, show_guests, household_id: _hh, details, here_at, ...card } = r.encounter
  return ok({
    alive,
    encounter: { ...card, address: addressFor(r.invitation.reply, r.encounter.address), map_url: r.encounter.kind === 'park' ? r.encounter.map_url : addressFor(r.invitation.reply, r.encounter.map_url), details: parseDetails(details), hereAt: hereAllowed(r.encounter, now) ? here_at ?? null : null },
    homeCard: home ? homeCardOrNull(home.details) : null,
    relais,
    souvenirs: photoRows,
    changes,
    cover: coverId(cover_key),
    guests,
    bring,
    souvenirsOpen: souvenirsVisible(r.encounter, r.invitation.reply, now),
    photos: photosEnabled(ctx.env),
    host: r.host,
    you: { ...r.family, reply: r.invitation.reply, replyNote: r.invitation.reply_note, remind: r.invitation.remind_at !== null, adults: r.invitation.adults, kids: r.invitation.kids, scope: r.invitation.scope },
    messages: messages.map(({ invitation_id, ...m }) => ({ ...m, mine: invitation_id === r.invitation.id })),
    series: seriesRows,
  })
}

type Body = { deleteMessage?: string; reply?: string; note?: string | null; parentName?: string; email?: string; phone?: string; allergies?: string; message?: string; remind?: boolean; adults?: number; kids?: number }

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  if ((await overAuthLimit(ctx.env, ctx.request)) || (await lockedOut(ctx.env, ctx.request))) return tooManyRequests()
  const r = await resolve(ctx.env, ctx.params.token as string | undefined)
  if (!r) return lookupMiss(ctx.env, ctx.request)
  if (!linkAlive(r.encounter, nowSec())) return badRequest('Cette rencontre est passée ou annulée.')
  const body = await readJson<Body>(ctx.request)
  if (!body) return badRequest('Corps invalide.')
  const ts = nowSec()
  const stmts: D1PreparedStatement[] = []

  if (body.reply !== undefined) {
    if (!isReply(body.reply)) return badRequest('Réponse inconnue.')
    stmts.push(
      ctx.env.DB.prepare('UPDATE invitations SET reply = ?, reply_note = CASE WHEN ? THEN ? ELSE reply_note END, reply_at = ?, updated_at = ? WHERE id = ?').bind(
        body.reply,
        body.note !== undefined ? 1 : 0,
        str(body.note, 500),
        ts,
        ts,
        r.invitation.id,
      ),
    )
  } else if (body.note !== undefined && r.invitation.reply) {
    // The one-tap answer is saved first; the note comes later, on its own.
    stmts.push(ctx.env.DB.prepare('UPDATE invitations SET reply_note = ?, updated_at = ? WHERE id = ?').bind(str(body.note, 500), ts, r.invitation.id))
  }
  // The head-count: how many children come (a whole-family invitation only) and, for a birthday,
  // how many adults stay. A friend-only invitation is one child, so no number is stored.
  if (body.adults !== undefined || body.kids !== undefined) {
    const n = headcount(r.encounter.kind, r.invitation.scope, body)
    stmts.push(ctx.env.DB.prepare('UPDATE invitations SET adults = ?, kids = ?, updated_at = ? WHERE id = ?').bind(n.adults, n.kids, ts, r.invitation.id))
  }
  // The ONE reminder (the hourly cron sends it): a day before, only if still ahead, and
  // only once the family has an email on file (sent now or already in the book).
  if (typeof body.remind === 'boolean') {
    const at = body.remind ? Math.max(r.encounter.starts_at - REMIND_LEAD_SEC, ts) : null
    stmts.push(ctx.env.DB.prepare('UPDATE invitations SET remind_at = ?, reminded_at = NULL, updated_at = ? WHERE id = ?').bind(at, ts, r.invitation.id))
  }
  // Their own details, into the host's book. Only the fields they sent; a blank one is
  // left alone so a reply cannot erase what the host typed, and an email already in the book is never replaced by a
  // link holder (the host mails that address; a forwarded link must not be able to redirect it).
  const parentName = str(body.parentName, 60)
  const email = str(body.email, 120)?.toLowerCase() ?? null
  const phone = str(body.phone, 30)
  const allergies = body.allergies !== undefined ? str(body.allergies, 300) : undefined
  if (parentName || email || phone || allergies !== undefined) {
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return badRequest('Courriel invalide.')
    stmts.push(
      ctx.env.DB.prepare(
        'UPDATE friend_families SET parent_name = COALESCE(?, parent_name), email = COALESCE(email, ?), phone = COALESCE(?, phone), allergies = CASE WHEN ? THEN ? ELSE allergies END, updated_at = ? WHERE id = ?',
      ).bind(parentName, email, phone, allergies !== undefined ? 1 : 0, allergies ?? null, ts, r.invitation.friend_family_id),
    )
  }
  if (body.deleteMessage) {
    const m = await ctx.env.DB.prepare('SELECT id, invitation_id FROM encounter_messages WHERE id = ? AND encounter_id = ? AND deleted_at IS NULL').bind(body.deleteMessage, r.encounter.id).first<{ id: string; invitation_id: string | null }>()
    if (m && canDeleteOwn(m, r.invitation.id)) stmts.push(ctx.env.DB.prepare('UPDATE encounter_messages SET deleted_at = ?, pinned = 0 WHERE id = ?').bind(ts, m.id))
  }
  const message = str(body.message, 1000)
  if (message) {
    const n = await ctx.env.DB.prepare('SELECT COUNT(*) AS n FROM encounter_messages WHERE encounter_id = ? AND deleted_at IS NULL').bind(r.encounter.id).first<{ n: number }>()
    if ((n?.n ?? 0) >= MAX_MESSAGES) return badRequest('Le tableau est plein.')
    stmts.push(
      ctx.env.DB.prepare('INSERT INTO encounter_messages (id, encounter_id, author_kind, author_label, text, created_at, invitation_id) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(
        newId(),
        r.encounter.id,
        'guest',
        parentName ?? r.family.parent_name,
        message,
        ts,
        r.invitation.id,
      ),
    )
  }
  if (!stmts.length) return badRequest('Rien à enregistrer.')
  await ctx.env.DB.batch(stmts)
  return ok()
}
