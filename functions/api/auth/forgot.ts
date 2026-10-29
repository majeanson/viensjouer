import type { Env } from '../../_lib/env'
import { badRequest, ok, readJson, serviceUnavailable, tooManyRequests } from '../../_lib/json'
import { clientIp, overAuthLimit } from '../../_lib/rateLimit'
import { TURNSTILE_MESSAGE, turnstilePasses } from '../../_lib/turnstile'
import { mailEnabled, sendMail } from '../../_lib/mail'
import { mailLang } from '../../_lib/lang'
import { resetMail } from '../../_lib/mailCopy'
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
  const body = await readJson<{ email?: string; turnstile?: string }>(ctx.request)
  if (!(await turnstilePasses(ctx.env, body?.turnstile, clientIp(ctx.request)))) return badRequest(TURNSTILE_MESSAGE)
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
    await sendMail(ctx.env, { to: email, ...resetMail(mailLang(null, ctx.request), { link }) })
  } catch (err) {
    console.error('[mail] reset', err)
  }
  return ok()
}
