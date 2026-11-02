import { badRequest, conflict, forbidden, notFound, ok, readJson, serviceUnavailable, str, tooManyRequests } from '../_lib/json'
import { authed } from '../_lib/route'
import { isDemoEmail } from '../_lib/demo'
import { freshLinkCode, newId, nowSec, paperCode } from '../_lib/ids'
import { mailEnabled, sendMail } from '../_lib/mail'
import { mailLang } from '../_lib/lang'
import { sharedCircleMail, withUnsubscribe } from '../_lib/mailCopy'
import { MAIL_CAP_MESSAGE, mailRoom, recordMail } from '../_lib/mailBudget'
import { SHARED_INVITE_TTL_SEC, isMember } from '../_lib/sharedCircles'

// « Inviter une famille dans le cercle »: any member asks a family of THEIR OWN book to join a shared circle. A code, the same two-word
// door as everything else (circle_invites with shared_circle_id set); the family accepts on its own, with a new account or the one it
// has. Nothing is sent by itself: this makes the code; the member chooses how it travels (email from here, a text, paper).
//   POST   /api/shared-circle-invite { circleId, familyId, send? } → the open code for that family (made if none), emailed when `send`
//   DELETE /api/shared-circle-invite { id }                        → withdraw it
// The open codes are listed by GET /api/shared-circles, under each circle.
const MAX_OPEN = 20
const RESEND_COOLDOWN_SEC = 5 * 60

export const onRequestPost = authed(async (ctx, actor) => {
  if (isDemoEmail(actor.email)) return forbidden('Pas d’invitation en mode essai : crée d’abord ton compte.')
  const body = await readJson<{ circleId?: string; familyId?: string; send?: boolean }>(ctx.request)
  const circleId = str(body?.circleId, 20)
  const familyId = str(body?.familyId, 20)
  if (!circleId || !familyId) return badRequest('circleId et familyId requis.')
  const member = await isMember(ctx.env, circleId, actor.householdId)
  if (!member) return notFound()
  const circle = await ctx.env.DB.prepare('SELECT name FROM shared_circles WHERE id = ?').bind(circleId).first<{ name: string }>()
  // Only a family of MY visible book: a hidden entry (someone met through another circle) is not mine to pass on.
  const fam = await ctx.env.DB.prepare(
    'SELECT id, parent_name, email, lang, linked_household_id, mail_stopped_at, email_bounced_at FROM friend_families WHERE id = ? AND household_id = ? AND deleted_at IS NULL AND shared_circle_id IS NULL',
  )
    .bind(familyId, actor.householdId)
    .first<{ id: string; parent_name: string; email: string | null; lang: string | null; linked_household_id: string | null; mail_stopped_at: number | null; email_bounced_at: number | null }>()
  if (!fam || !circle) return notFound()
  if (fam.linked_household_id && (await isMember(ctx.env, circleId, fam.linked_household_id))) return conflict('Cette famille est déjà dans ce cercle.')

  const now = nowSec()
  let invite = await ctx.env.DB.prepare('SELECT id, token FROM circle_invites WHERE household_id = ? AND friend_family_id = ? AND shared_circle_id = ? AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > ? ORDER BY created_at DESC LIMIT 1')
    .bind(actor.householdId, fam.id, circleId, now)
    .first<{ id: string; token: string }>()
  if (!invite) {
    const open = await ctx.env.DB.prepare('SELECT COUNT(*) AS n FROM circle_invites WHERE household_id = ? AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > ?').bind(actor.householdId, now).first<{ n: number }>()
    if ((open?.n ?? 0) >= MAX_OPEN) return conflict('Vingt invitations de cercle ouvertes au plus : retires-en une d’abord.')
    const token = await freshLinkCode(ctx.env.DB, 'invitations')
    const id = newId()
    await ctx.env.DB.prepare('INSERT INTO circle_invites (id, household_id, child_id, friend_family_id, token, created_at, expires_at, shared_circle_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(id, actor.householdId, member.child_id, fam.id, token, now, now + SHARED_INVITE_TTL_SEC, circleId)
      .run()
    invite = { id, token }
  }
  let sent = false
  if (body?.send === true) {
    if (!mailEnabled(ctx.env)) return serviceUnavailable('L’envoi de courriels n’est pas branché. Copie le lien.')
    if (!fam.email) return badRequest('Cette famille n’a pas de courriel : copie le lien ou écris les deux mots sur un papier.')
    if (fam.mail_stopped_at) return badRequest('Cette famille ne veut plus de courriels de l’app : copie le lien.')
    if (fam.email_bounced_at) return badRequest('Le dernier courriel à cette adresse n’est pas arrivé : vérifie l’adresse, ou copie le lien.')
    if ((await mailRoom(ctx.env, actor.householdId)) < 1) return tooManyRequests(MAIL_CAP_MESSAGE)
    const claimed = await ctx.env.DB.prepare('UPDATE circle_invites SET sent_at = ? WHERE id = ? AND (sent_at IS NULL OR sent_at < ?)').bind(now, invite.id, now - RESEND_COOLDOWN_SEC).run()
    if (!claimed.meta.changes) return tooManyRequests('Le courriel vient de partir. Attends quelques minutes avant de le renvoyer.')
    const origin = new URL(ctx.request.url).origin
    const lang = mailLang(fam.lang, ctx.request)
    // The member and this family already know each other (it is the member's own book), so Reply-To is the member, as everywhere else.
    await sendMail(ctx.env, { to: fam.email, fromName: actor.displayName, replyTo: actor.email, ...withUnsubscribe(lang, origin, invite.token, sharedCircleMail(lang, { parent: fam.parent_name, host: actor.displayName, circle: circle.name, link: `${origin}/${paperCode(invite.token)}` })) })
    await recordMail(ctx.env, actor.householdId)
    sent = true
  }
  return ok({ id: invite.id, token: invite.token, sent })
})

export const onRequestDelete = authed(async (ctx, actor) => {
  const body = await readJson<{ id?: string }>(ctx.request)
  const id = str(body?.id, 20)
  if (!id) return badRequest('id requis.')
  const res = await ctx.env.DB.prepare('UPDATE circle_invites SET revoked_at = ? WHERE id = ? AND household_id = ? AND shared_circle_id IS NOT NULL AND accepted_at IS NULL AND revoked_at IS NULL').bind(nowSec(), id, actor.householdId).run()
  return res.meta.changes ? ok() : notFound()
})
