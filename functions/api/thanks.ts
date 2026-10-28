import { badRequest, conflict, notFound, ok, readJson, str } from '../_lib/json'
import { authed } from '../_lib/route'
import { newId, nowSec, paperCode } from '../_lib/ids'
import { mailEnabled, sendMail } from '../_lib/mail'
import { mailLang, requestLang } from '../_lib/lang'
import { thanksMail } from '../_lib/mailCopy'
import { isDemoEmail } from '../_lib/demo'
import { mailRoom, recordMail } from '../_lib/mailBudget'

// « Dire merci » — once, after a rencontre. The message goes into the thread (so every family sees it on its
// page, email or not) and, when mail is wired, by email to the families that said yes and have an address.
//   POST /api/thanks { encounter, text? }
export const THANKS_WINDOW_SEC = 30 * 86_400

export const onRequestPost = authed(async (ctx, actor) => {
  const body = await readJson<{ encounter?: string; text?: string }>(ctx.request)
  const id = str(body?.encounter, 20)
  if (!id) return badRequest('encounter requis.')
  const e = await ctx.env.DB.prepare('SELECT id, title, starts_at, status, thanked_at FROM encounters WHERE id = ? AND household_id = ? AND deleted_at IS NULL')
    .bind(id, actor.householdId)
    .first<{ id: string; title: string; starts_at: number; status: string; thanked_at: number | null }>()
  if (!e) return notFound()
  const now = nowSec()
  if (e.status === 'cancelled') return badRequest('Cette rencontre est annulée.')
  if (e.starts_at > now) return badRequest('Pas avant la rencontre.')
  if (now - e.starts_at > THANKS_WINDOW_SEC) return badRequest('C’est trop tard pour un merci.')
  if (e.thanked_at) return conflict('Le merci est déjà envoyé.')
  const text = str(body?.text, 500) ?? (requestLang(ctx.request) === 'en' ? 'Thank you for coming!' : 'Merci d’être venus !')
  await ctx.env.DB.batch([
    ctx.env.DB.prepare("INSERT INTO encounter_messages (id, encounter_id, author_kind, author_label, text, created_at) VALUES (?, ?, 'host', ?, ?, ?)").bind(newId(), id, actor.displayName.slice(0, 60), text, now),
    ctx.env.DB.prepare('UPDATE encounters SET thanked_at = ?, updated_at = ? WHERE id = ?').bind(now, now, id),
  ])
  let sent = 0
  let skipped = 0
  if (mailEnabled(ctx.env) && !isDemoEmail(actor.email)) {
    const { results } = await ctx.env.DB.prepare(
      "SELECT i.token, f.email, f.lang, f.parent_name FROM invitations i JOIN friend_families f ON f.id = i.friend_family_id WHERE i.encounter_id = ? AND i.reply = 'yes' AND f.email IS NOT NULL AND f.deleted_at IS NULL LIMIT 40",
    )
      .bind(id)
      .all<{ token: string; email: string; lang: string | null; parent_name: string }>()
    const origin = new URL(ctx.request.url).origin
    // The thank-you is in the thread whatever happens; the emails stop at the day's budget.
    const room = await mailRoom(ctx.env, actor.householdId)
    skipped = Math.max(0, results.length - room)
    for (const r of results.slice(0, room)) {
      const link = `${origin}/${paperCode(r.token)}`
      try {
        await sendMail(ctx.env, { to: r.email, ...thanksMail(mailLang(r.lang, ctx.request), { parent: r.parent_name, host: actor.displayName, title: e.title, text, link }) })
        sent++
      } catch (err) {
        console.error('[mail] thanks', err)
      }
    }
    await recordMail(ctx.env, actor.householdId, sent)
  }
  return ok({ sent, skipped })
})
