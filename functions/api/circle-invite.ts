import { badRequest, conflict, forbidden, notFound, ok, readJson, serviceUnavailable, str, tooManyRequests } from '../_lib/json'
import { authed } from '../_lib/route'
import { isDemoEmail } from '../_lib/demo'
import { freshLinkCode, newId, nowSec, paperCode } from '../_lib/ids'
import { mailEnabled, sendMail } from '../_lib/mail'
import { mailLang } from '../_lib/lang'
import { circleMail, withUnsubscribe } from '../_lib/mailCopy'
import { MAIL_CAP_MESSAGE, mailRoom, recordMail } from '../_lib/mailBudget'

// « Inviter dans mon cercle » — a connection invitation with no rencontre: the host asks a family of their book to be linked.
// The family opens the code (the same two-word door as a rencontre card: /<code>), creates an account or signs in, and the two
// households are linked (functions/_lib/linking.ts). Nothing is sent by itself: this makes the code; the host chooses how it travels
// (email from here, a text, or the two words on paper).
//   GET    /api/circle-invite                       → { invites: [{ id, familyId, token, expiresAt }] }  the open ones
//   POST   /api/circle-invite { familyId, childId?, send? } → the open code for that family (made if none), emailed when `send`
//   DELETE /api/circle-invite { id }                → withdraw it
export const CIRCLE_INVITE_TTL_SEC = 14 * 86_400
const MAX_OPEN = 20
const RESEND_COOLDOWN_SEC = 5 * 60

export const onRequestGet = authed(async (ctx, actor) => {
  const { results } = await ctx.env.DB.prepare('SELECT id, friend_family_id AS familyId, token, expires_at AS expiresAt FROM circle_invites WHERE household_id = ? AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > ? ORDER BY created_at DESC')
    .bind(actor.householdId, nowSec())
    .all()
  return ok({ invites: results })
})

export const onRequestPost = authed(async (ctx, actor) => {
  if (isDemoEmail(actor.email)) return forbidden('Pas d’invitation en mode essai : crée d’abord ton compte.')
  const body = await readJson<{ familyId?: string; childId?: string; send?: boolean }>(ctx.request)
  const familyId = str(body?.familyId, 20)
  if (!familyId) return badRequest('familyId requis.')
  const fam = await ctx.env.DB.prepare('SELECT id, parent_name, child_first_name, email, lang, linked_household_id, mail_stopped_at, email_bounced_at FROM friend_families WHERE id = ? AND household_id = ? AND deleted_at IS NULL')
    .bind(familyId, actor.householdId)
    .first<{ id: string; parent_name: string; child_first_name: string; email: string | null; lang: string | null; linked_household_id: string | null; mail_stopped_at: number | null; email_bounced_at: number | null }>()
  if (!fam) return notFound()
  if (fam.linked_household_id) return conflict('Cette famille est déjà dans ton cercle.')
  // Which of MY children this circle is for: the one named, or my only one.
  const { results: mine } = await ctx.env.DB.prepare('SELECT id, first_name FROM children WHERE household_id = ? AND deleted_at IS NULL ORDER BY position, created_at').bind(actor.householdId).all<{ id: string; first_name: string }>()
  const asked = str(body?.childId, 20)
  const child = asked ? mine.find((c) => c.id === asked) : mine.length === 1 ? mine[0] : undefined
  if (!child) return badRequest(mine.length === 0 ? 'Ajoute d’abord ton enfant.' : 'Choisis pour lequel de tes enfants.')

  const now = nowSec()
  let invite = await ctx.env.DB.prepare('SELECT id, token FROM circle_invites WHERE household_id = ? AND friend_family_id = ? AND child_id = ? AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > ? ORDER BY created_at DESC LIMIT 1')
    .bind(actor.householdId, fam.id, child.id, now)
    .first<{ id: string; token: string }>()
  if (!invite) {
    const open = await ctx.env.DB.prepare('SELECT COUNT(*) AS n FROM circle_invites WHERE household_id = ? AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > ?').bind(actor.householdId, now).first<{ n: number }>()
    if ((open?.n ?? 0) >= MAX_OPEN) return conflict('Vingt invitations de cercle ouvertes au plus : retires-en une d’abord.')
    const token = await freshLinkCode(ctx.env.DB, 'invitations')
    const id = newId()
    await ctx.env.DB.prepare('INSERT INTO circle_invites (id, household_id, child_id, friend_family_id, token, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(id, actor.householdId, child.id, fam.id, token, now, now + CIRCLE_INVITE_TTL_SEC).run()
    invite = { id, token }
  }
  let sent = false
  if (body?.send === true) {
    if (!mailEnabled(ctx.env)) return serviceUnavailable('L’envoi de courriels n’est pas branché. Copie le lien.')
    if (!fam.email) return badRequest('Cette famille n’a pas de courriel : copie le lien ou écris les deux mots sur un papier.')
    if (fam.mail_stopped_at) return badRequest('Cette famille ne veut plus de courriels de l’app : copie le lien.')
    if (fam.email_bounced_at) return badRequest('Le dernier courriel à cette adresse n’est pas arrivé : vérifie l’adresse, ou copie le lien.')
    if ((await mailRoom(ctx.env, actor.householdId)) < 1) return tooManyRequests(MAIL_CAP_MESSAGE)
    // One tap, one mail: a second send inside the cooldown is refused (the same guard as the rencontre invitation).
    const claimed = await ctx.env.DB.prepare('UPDATE circle_invites SET sent_at = ? WHERE id = ? AND (sent_at IS NULL OR sent_at < ?)').bind(now, invite.id, now - RESEND_COOLDOWN_SEC).run()
    if (!claimed.meta.changes) return tooManyRequests('Le courriel vient de partir. Attends quelques minutes avant de le renvoyer.')
    const origin = new URL(ctx.request.url).origin
    const lang = mailLang(fam.lang, ctx.request)
    await sendMail(ctx.env, { to: fam.email, fromName: actor.displayName, replyTo: actor.email, ...withUnsubscribe(lang, origin, invite.token, circleMail(lang, { parent: fam.parent_name, host: actor.displayName, hostChild: child.first_name, child: fam.child_first_name, link: `${origin}/${paperCode(invite.token)}` })) })
    await recordMail(ctx.env, actor.householdId)
    sent = true
  }
  return ok({ id: invite.id, token: invite.token, sent })
})

export const onRequestDelete = authed(async (ctx, actor) => {
  const body = await readJson<{ id?: string }>(ctx.request)
  const id = str(body?.id, 20)
  if (!id) return badRequest('id requis.')
  const res = await ctx.env.DB.prepare('UPDATE circle_invites SET revoked_at = ? WHERE id = ? AND household_id = ? AND accepted_at IS NULL AND revoked_at IS NULL').bind(nowSec(), id, actor.householdId).run()
  if (!res.meta.changes) return notFound()
  return ok()
})
