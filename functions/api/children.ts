import { napValue } from '../_lib/nap'
import { badRequest, conflict, created, notFound, ok, readJson, str } from '../_lib/json'
import { FULL, roomFor } from '../_lib/ceilings'
import { authed } from '../_lib/route'
import { newId, nowSec } from '../_lib/ids'
import { coverId } from '../_lib/encounters'

// The household's children. GET list · POST create · PATCH edit · DELETE (soft).
// A child's rencontres survive the soft delete (soft ref), they just lose their face.

export interface ChildRow {
  id: string
  first_name: string
  birthdate: string | null
  colour: string
  position: number
  nap_start: string | null
  nap_end: string | null
  photo?: string | null
}

const COLOURS = ['#f2a03d', '#5b9a8b', '#c76b6b', '#7c83c9', '#b98b3a', '#4f8fbf']
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
export const onRequestGet = authed(async (ctx, actor) => {
  const { results } = await ctx.env.DB.prepare(
    'SELECT id, first_name, birthdate, colour, position, nap_start, nap_end, photo_key FROM children WHERE household_id = ? AND deleted_at IS NULL ORDER BY position, created_at',
  )
    .bind(actor.householdId)
    .all<ChildRow & { photo_key: string | null }>()
  return ok({ children: results.map(({ photo_key, ...c }) => ({ ...c, photo: coverId(photo_key) })) })
})

export const onRequestPost = authed(async (ctx, actor) => {
  const body = await readJson<{ firstName?: string; birthdate?: string; colour?: string; napStart?: string | null; napEnd?: string | null }>(ctx.request)
  const firstName = str(body?.firstName, 40)
  if (!firstName) return badRequest('Le prénom est requis.')
  const birthdate = str(body?.birthdate, 10)
  if (birthdate && !DATE_RE.test(birthdate)) return badRequest('Date invalide.')
  const napStart = napValue(body?.napStart)
  const napEnd = napValue(body?.napEnd)
  if (napStart === false || napEnd === false) return badRequest('Heure invalide.')
  if ((await roomFor(ctx.env, 'children', actor.householdId)) < 1) return conflict(FULL.children)
  const count = await ctx.env.DB.prepare('SELECT COUNT(*) AS n FROM children WHERE household_id = ? AND deleted_at IS NULL').bind(actor.householdId).first<{ n: number }>()
  const n = count?.n ?? 0
  const colour = str(body?.colour, 9) ?? COLOURS[n % COLOURS.length]
  const id = newId()
  const ts = nowSec()
  await ctx.env.DB.prepare(
    'INSERT INTO children (id, household_id, first_name, birthdate, colour, position, nap_start, nap_end, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  )
    .bind(id, actor.householdId, firstName, birthdate, colour, n, napStart ?? null, napEnd ?? null, ts, ts)
    .run()
  return created({ id })
})

export const onRequestPatch = authed(async (ctx, actor) => {
  const body = await readJson<{ id?: string; firstName?: string; birthdate?: string | null; colour?: string; napStart?: string | null; napEnd?: string | null }>(ctx.request)
  const id = str(body?.id, 20)
  if (!id) return badRequest('id requis.')
  const firstName = str(body?.firstName, 40)
  if (body?.firstName !== undefined && !firstName) return badRequest('Le prénom est requis.')
  const birthdate = body?.birthdate === null ? null : str(body?.birthdate, 10)
  if (birthdate && !DATE_RE.test(birthdate)) return badRequest('Date invalide.')
  const napStart = napValue(body?.napStart)
  const napEnd = napValue(body?.napEnd)
  if (napStart === false || napEnd === false) return badRequest('Heure invalide.')
  const res = await ctx.env.DB.prepare(
    'UPDATE children SET first_name = COALESCE(?, first_name), birthdate = CASE WHEN ? THEN ? ELSE birthdate END, colour = COALESCE(?, colour), nap_start = CASE WHEN ? THEN ? ELSE nap_start END, nap_end = CASE WHEN ? THEN ? ELSE nap_end END, updated_at = ? WHERE id = ? AND household_id = ? AND deleted_at IS NULL',
  )
    .bind(firstName, body?.birthdate !== undefined ? 1 : 0, birthdate, str(body?.colour, 9), napStart !== undefined ? 1 : 0, napStart ?? null, napEnd !== undefined ? 1 : 0, napEnd ?? null, nowSec(), id, actor.householdId)
    .run()
  return res.meta.changes ? ok() : notFound()
})

export const onRequestDelete = authed(async (ctx, actor) => {
  const body = await readJson<{ id?: string }>(ctx.request)
  const id = str(body?.id, 20)
  if (!id) return badRequest('id requis.')
  const res = await ctx.env.DB.prepare('UPDATE children SET deleted_at = ? WHERE id = ? AND household_id = ? AND deleted_at IS NULL')
    .bind(nowSec(), id, actor.householdId)
    .run()
  return res.meta.changes ? ok() : notFound()
})
