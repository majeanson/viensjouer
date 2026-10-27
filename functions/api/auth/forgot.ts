import type { Env } from '../../_lib/env'
import { badRequest, ok, readJson, serviceUnavailable, tooManyRequests } from '../../_lib/json'
import { overAuthLimit } from '../../_lib/rateLimit'
import { mailEnabled, sendMail } from '../../_lib/mail'
import { newId, nowSec, sha256Hex } from '../../_lib/ids'
import { EMAIL_RE } from './signup'

// POST /api/auth/forgot { email } — ALWAYS 200 once the input parses, whether or not the
// address has an account: this door says nothing about which emails exist. At most three
// open tokens per email; 30 minutes to live; the row keeps only the hash. CSRF-exempt.
const RESET_TTL_SEC = 30 * 60
const RESET_MAX_OPEN = 3

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  if (!mailEnabled(ctx.env)) return serviceUnavailable('L’envoi de courriels n’est pas branché.')
  if (await overAuthLimit(ctx.env, ctx.request)) return tooManyRequests()
  const body = await readJson<{ email?: string }>(ctx.request)
  const email = body?.email?.trim().toLowerCase()
  if (!email || !EMAIL_RE.test(email)) return badRequest('Courriel invalide.')
  if (await overAuthLimit(ctx.env, ctx.request, `forgot:${email}`)) return tooManyRequests()

  const now = nowSec()
  const row = await ctx.env.DB.prepare('SELECT email FROM parents WHERE email = ?').bind(email).first()
  if (!row) return ok()
  const open = await ctx.env.DB.prepare('SELECT COUNT(*) AS n FROM password_resets WHERE email = ? AND used_at IS NULL AND expires_at > ?').bind(email, now).first<{ n: number }>()
  if ((open?.n ?? 0) >= RESET_MAX_OPEN) return ok()

  const token = newId(32)
  await ctx.env.DB.prepare('INSERT INTO password_resets (id, token_hash, email, expires_at, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(newId(), await sha256Hex(token), email, now + RESET_TTL_SEC, now)
    .run()
  const link = `${new URL(ctx.request.url).origin}/reinitialiser?t=${encodeURIComponent(token)}`
  try {
    await sendMail(ctx.env, {
      to: email,
      subject: 'Viens jouer — un nouveau mot de passe',
      text: `Quelqu'un (toi, on espère) a demandé un nouveau mot de passe pour Viens jouer.\n\nOuvre ce lien dans les 30 prochaines minutes pour en choisir un :\n${link}\n\nSi ce n'était pas toi, ignore ce courriel — rien ne change.`,
      html: `<p>Quelqu'un (toi, on espère) a demandé un nouveau mot de passe pour Viens jouer.</p><p><a href="${link}">Choisir un nouveau mot de passe</a> — le lien est bon 30 minutes.</p><p>Si ce n'était pas toi, ignore ce courriel : rien ne change.</p>`,
    })
  } catch (err) {
    console.error('[mail] reset', err)
  }
  return ok()
}
