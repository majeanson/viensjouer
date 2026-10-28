import { badRequest, conflict, created, notFound, ok, readJson, str } from '../_lib/json'
import { FULL, roomFor } from '../_lib/ceilings'
import { authed } from '../_lib/route'
import { newId, nowSec } from '../_lib/ids'

// « Les familles amies » — the book. GET list · POST add · PATCH edit · DELETE (soft).
// A reply on a link also updates the family's contact fields (functions/api/r/[token]).

export interface FamilyRow {
  id: string
  parent_name: string
  email: string | null
  phone: string | null
  child_first_name: string
  child_birthdate: string | null
  allergies: string | null
  notes: string | null
  linked_household_id: string | null
}

const FIELDS = 'id, parent_name, email, phone, child_first_name, child_birthdate, allergies, notes, linked_household_id'

export const onRequestGet = authed(async (ctx, actor) => {
  const { results } = await ctx.env.DB.prepare(`SELECT ${FIELDS} FROM friend_families WHERE household_id = ? AND deleted_at IS NULL ORDER BY child_first_name`)
    .bind(actor.householdId)
    .all<FamilyRow>()
  return ok({ families: results })
})

type Body = { id?: string; parentName?: string; email?: string; phone?: string; childFirstName?: string; childBirthdate?: string | null; allergies?: string; notes?: string }

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
function cleanDate(v: unknown): string | null {
  const d = str(v, 10)
  return d && DATE_RE.test(d) ? d : null
}

function cleanEmail(v: unknown): string | null {
  const e = str(v, 120)?.toLowerCase() ?? null
  return e && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e) ? e : null
}

export const onRequestPost = authed(async (ctx, actor) => {
  const body = await readJson<Body>(ctx.request)
  const parentName = str(body?.parentName, 60)
  const childFirstName = str(body?.childFirstName, 40)
  if (!parentName || !childFirstName) return badRequest('Le prénom du parent et celui de l’enfant sont requis.')
  if ((await roomFor(ctx.env, 'families', actor.householdId)) < 1) return conflict(FULL.families)
  const id = newId()
  const ts = nowSec()
  await ctx.env.DB.prepare(
    'INSERT INTO friend_families (id, household_id, parent_name, email, phone, child_first_name, child_birthdate, allergies, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  )
    .bind(id, actor.householdId, parentName, cleanEmail(body?.email), str(body?.phone, 30), childFirstName, cleanDate(body?.childBirthdate), str(body?.allergies, 300), str(body?.notes, 1000), ts, ts)
    .run()
  return created({ id })
})

export const onRequestPatch = authed(async (ctx, actor) => {
  const body = await readJson<Body>(ctx.request)
  const id = str(body?.id, 20)
  if (!id) return badRequest('id requis.')
  const res = await ctx.env.DB.prepare(
    `UPDATE friend_families SET
       parent_name = COALESCE(?, parent_name),
       child_first_name = COALESCE(?, child_first_name),
       email = CASE WHEN ? THEN ? ELSE email END,
       phone = CASE WHEN ? THEN ? ELSE phone END,
       child_birthdate = CASE WHEN ? THEN ? ELSE child_birthdate END,
       allergies = CASE WHEN ? THEN ? ELSE allergies END,
       notes = CASE WHEN ? THEN ? ELSE notes END,
       updated_at = ?
     WHERE id = ? AND household_id = ? AND deleted_at IS NULL`,
  )
    .bind(
      str(body?.parentName, 60),
      str(body?.childFirstName, 40),
      body?.email !== undefined ? 1 : 0,
      cleanEmail(body?.email),
      body?.phone !== undefined ? 1 : 0,
      str(body?.phone, 30),
      body?.childBirthdate !== undefined ? 1 : 0,
      cleanDate(body?.childBirthdate),
      body?.allergies !== undefined ? 1 : 0,
      str(body?.allergies, 300),
      body?.notes !== undefined ? 1 : 0,
      str(body?.notes, 1000),
      nowSec(),
      id,
      actor.householdId,
    )
    .run()
  return res.meta.changes ? ok() : notFound()
})

export const onRequestDelete = authed(async (ctx, actor) => {
  const body = await readJson<{ id?: string }>(ctx.request)
  const id = str(body?.id, 20)
  if (!id) return badRequest('id requis.')
  const res = await ctx.env.DB.prepare('UPDATE friend_families SET deleted_at = ? WHERE id = ? AND household_id = ? AND deleted_at IS NULL')
    .bind(nowSec(), id, actor.householdId)
    .run()
  return res.meta.changes ? ok() : notFound()
})
