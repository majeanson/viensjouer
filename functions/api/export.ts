import { authed } from '../_lib/route'
import { nowSec } from '../_lib/ids'

// « Télécharger mes données » — GET /api/export. Everything this household typed, as one JSON
// file. Deliberately WITHOUT the secrets (password hashes, reply codes) and without the photo
// bytes. Opened as a plain link, so the session cookie is all it needs.
export const onRequestGet = authed(async (ctx, actor) => {
  const hh = actor.householdId
  const db = ctx.env.DB
  const [household, parents, children, families, encounters, invitations, messages, groups, groupMembers, windows, windowTargets, homeCard, souvenirs, bring, changes] = await db.batch([
    db.prepare('SELECT id, name, tz, created_at FROM households WHERE id = ?').bind(hh),
    db.prepare('SELECT email, display_name, created_at FROM parents WHERE household_id = ?').bind(hh),
    db.prepare('SELECT id, first_name, birthdate, colour, created_at FROM children WHERE household_id = ? AND deleted_at IS NULL').bind(hh),
    db.prepare('SELECT id, parent_name, email, phone, child_first_name, child_birthdate, allergies, notes, created_at FROM friend_families WHERE household_id = ? AND deleted_at IS NULL').bind(hh),
    db.prepare('SELECT id, child_id, kind, title, starts_at, ends_at, place, address, note, status, series_id, details, created_at FROM encounters WHERE household_id = ? AND deleted_at IS NULL').bind(hh),
    db.prepare('SELECT i.encounter_id, i.friend_family_id, i.reply, i.reply_note, i.reply_at, i.adults, i.kids, i.scope FROM invitations i JOIN encounters e ON e.id = i.encounter_id WHERE e.household_id = ? AND e.deleted_at IS NULL').bind(hh),
    db.prepare('SELECT m.encounter_id, m.author_kind, m.author_label, m.text, m.created_at FROM encounter_messages m JOIN encounters e ON e.id = m.encounter_id WHERE m.deleted_at IS NULL AND e.household_id = ? AND e.deleted_at IS NULL').bind(hh),
    db.prepare('SELECT id, name FROM friend_groups WHERE household_id = ? AND deleted_at IS NULL').bind(hh),
    db.prepare('SELECT m.group_id, m.friend_family_id FROM friend_group_members m JOIN friend_groups g ON g.id = m.group_id WHERE g.household_id = ? AND g.deleted_at IS NULL').bind(hh),
    db.prepare('SELECT id, child_id, starts_at, ends_at, note FROM open_windows WHERE household_id = ? AND deleted_at IS NULL').bind(hh),
    db.prepare('SELECT t.window_id, t.friend_family_id, t.reply, t.reply_note FROM window_targets t JOIN open_windows w ON w.id = t.window_id WHERE w.household_id = ? AND w.deleted_at IS NULL').bind(hh),
    db.prepare('SELECT details FROM home_cards WHERE household_id = ?').bind(hh),
    db.prepare('SELECT s.encounter_id, s.author_label, s.created_at FROM souvenirs s JOIN encounters e ON e.id = s.encounter_id WHERE e.household_id = ? AND s.deleted_at IS NULL').bind(hh),
    db.prepare('SELECT b.encounter_id, b.label, b.claimed_label FROM bring_items b JOIN encounters e ON e.id = b.encounter_id WHERE e.household_id = ? AND e.deleted_at IS NULL').bind(hh),
    db.prepare('SELECT c.encounter_id, c.field, c.old_value, c.new_value, c.created_at FROM encounter_changes c JOIN encounters e ON e.id = c.encounter_id WHERE e.household_id = ? AND e.deleted_at IS NULL').bind(hh),
  ])
  const body = {
    exportedAt: nowSec(),
    note: 'Tes données Viens jouer. Sans les mots de passe, les codes de lien secrets ni les octets des photos.',
    household: household.results[0] ?? null,
    parents: parents.results,
    children: children.results,
    friendFamilies: families.results,
    encounters: encounters.results,
    invitations: invitations.results,
    messages: messages.results,
    groups: (groups.results as { id: string; name: string }[]).map((g) => ({ ...g, families: groupMembers.results.filter((m) => (m as { group_id: string }).group_id === (g as { id: string }).id).map((m) => (m as { friend_family_id: string }).friend_family_id) })),
    openWindows: (windows.results as { id: string }[]).map((w) => ({ ...w, targets: windowTargets.results.filter((t) => (t as { window_id: string }).window_id === (w as { id: string }).id) })),
    homeCard: homeCard.results[0] ? JSON.parse((homeCard.results[0] as { details: string }).details) : null,
    photos: souvenirs.results,
    changes: changes.results,
    bring: bring.results,
  }
  return new Response(JSON.stringify(body, null, 2), {
    headers: { 'content-type': 'application/json; charset=utf-8', 'content-disposition': 'attachment; filename="viens-jouer-mes-donnees.json"', 'cache-control': 'no-store' },
  })
})
