import { ok } from '../_lib/json'
import { authed } from '../_lib/route'
import { nowSec, DEFAULT_TZ } from '../_lib/ids'
import { nextBirthday, todayIn } from '../_lib/birthdays'

// « Le calendrier du cercle » — everything dated that concerns this household, next 120
// days: its own rencontres, the ones LINKED families invite it to, open windows it offered,
// and the derived birthdays (own children, linked friends' children, book friends).
// Each family sees only what involves it; nothing is a count.
//   GET /api/calendar → { items: [{ at, kind, title, ... }], birthdays: [{ date, name, turns, whose }] }
const HORIZON_SEC = 120 * 86_400

export const onRequestGet = authed(async (ctx, actor) => {
  const hh = actor.householdId
  const now = nowSec()
  const until = now + HORIZON_SEC
  const h = await ctx.env.DB.prepare('SELECT tz FROM households WHERE id = ?').bind(hh).first<{ tz: string }>()
  const today = todayIn(h?.tz ?? DEFAULT_TZ)

  const [mine, invitedTo, windows, kids, linkedKids, book] = await ctx.env.DB.batch([
    ctx.env.DB.prepare(
      `SELECT e.id, e.title, e.kind, e.starts_at, e.place, e.status FROM encounters e
        WHERE e.household_id = ? AND e.deleted_at IS NULL AND e.status != 'cancelled' AND e.starts_at BETWEEN ? AND ? ORDER BY e.starts_at`,
    ).bind(hh, now - 3600, until),
    // Rencontres I am invited to: by a family LINKED to me (the live link), or simply because the invited family's email is the email
    // of an account of mine (the host typed my address: it shows up without any link; « Lier nos familles » makes it permanent).
    ctx.env.DB.prepare(
      `SELECT e.id, e.title, e.kind, e.starts_at, e.place, e.status, i.token, i.reply,
              (SELECT display_name FROM parents p WHERE p.household_id = e.household_id ORDER BY p.created_at LIMIT 1) AS host_parent
         FROM invitations i
         JOIN friend_families f ON f.id = i.friend_family_id
         JOIN encounters e ON e.id = i.encounter_id
        WHERE e.household_id != ?1 AND e.deleted_at IS NULL AND e.status != 'cancelled' AND e.starts_at BETWEEN ?2 AND ?3 AND f.deleted_at IS NULL
          AND (
            (f.linked_household_id = ?1 AND EXISTS (SELECT 1 FROM child_links l WHERE l.revoked_at IS NULL AND ((l.household_a = e.household_id AND l.household_b = ?1) OR (l.household_b = e.household_id AND l.household_a = ?1))))
            OR (f.email IS NOT NULL AND lower(f.email) IN (SELECT lower(email) FROM parents WHERE household_id = ?1))
          )
        GROUP BY e.id ORDER BY e.starts_at`,
    )
    .bind(hh, now - 3600, until),
    ctx.env.DB.prepare('SELECT id, starts_at, ends_at, note FROM open_windows WHERE household_id = ? AND deleted_at IS NULL AND ends_at > ? AND starts_at < ? ORDER BY starts_at').bind(hh, now, until),
    ctx.env.DB.prepare('SELECT first_name, birthdate FROM children WHERE household_id = ? AND deleted_at IS NULL AND birthdate IS NOT NULL').bind(hh),
    ctx.env.DB.prepare(
      `SELECT c.first_name, c.birthdate FROM child_links l
         JOIN children c ON c.id = CASE WHEN l.household_a = ?1 THEN l.child_b ELSE l.child_a END
        WHERE (l.household_a = ?1 OR l.household_b = ?1) AND l.revoked_at IS NULL AND c.deleted_at IS NULL AND c.birthdate IS NOT NULL`,
    ).bind(hh),
    ctx.env.DB.prepare('SELECT child_first_name AS first_name, child_birthdate AS birthdate FROM friend_families WHERE household_id = ? AND deleted_at IS NULL AND linked_household_id IS NULL AND child_birthdate IS NOT NULL').bind(hh),
  ])

  const items = [
    ...(mine.results as { id: string; title: string; kind: string; starts_at: number; place: string | null; status: string }[]).map((e) => ({ at: e.starts_at, type: 'mine' as const, id: e.id, title: e.title, kind: e.kind, place: e.place, status: e.status })),
    ...(invitedTo.results as { id: string; title: string; kind: string; starts_at: number; place: string | null; token: string; reply: string | null; host_parent: string | null }[]).map((e) => ({
      at: e.starts_at,
      type: 'invited' as const,
      id: e.id,
      title: e.title,
      kind: e.kind,
      place: e.place,
      token: e.token,
      reply: e.reply,
      host: e.host_parent,
    })),
    ...(windows.results as { id: string; starts_at: number; ends_at: number; note: string | null }[]).map((w) => ({ at: w.starts_at, type: 'window' as const, id: w.id, endsAt: w.ends_at, note: w.note })),
  ].sort((a, b) => a.at - b.at)

  const seen = new Set<string>()
  const birthdays: { date: string; name: string; turns: number; whose: 'mine' | 'friend' }[] = []
  const add = (rows: unknown[], whose: 'mine' | 'friend') => {
    for (const r of rows as { first_name: string; birthdate: string }[]) {
      const key = `${r.first_name}|${r.birthdate}`
      if (seen.has(key)) continue
      seen.add(key)
      const nb = nextBirthday(r.birthdate, today)
      if (nb) birthdays.push({ date: nb.date, name: r.first_name, turns: nb.turns, whose })
    }
  }
  add(kids.results, 'mine')
  add(linkedKids.results, 'friend')
  add(book.results, 'friend')
  birthdays.sort((a, b) => a.date.localeCompare(b.date))
  return ok({ items, birthdays: birthdays.slice(0, 40), today })
})
