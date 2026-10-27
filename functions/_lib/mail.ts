// The ONE way the app sends an email — Resend's REST API with plain fetch, no SDK.
// OPTIONAL: both vars unset → mailEnabled() is false, the send doors hide and the
// endpoints answer 503, never a half-flow that promises a mail nobody sends.
import type { Env } from './env'

export interface Mail {
  to: string
  subject: string
  text: string
  html?: string
}

export function mailEnabled(env: Env): boolean {
  return !!env.RESEND_API_KEY && !!env.MAIL_FROM
}

/** Send, or throw. Callers decide what a failure means for the person. */
export async function sendMail(env: Env, mail: Mail, fetchImpl: typeof fetch = fetch): Promise<{ id: string }> {
  if (!mailEnabled(env)) throw new Error('mail: RESEND_API_KEY / MAIL_FROM unset')
  const res = await fetchImpl('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from: env.MAIL_FROM, to: [mail.to], subject: mail.subject, text: mail.text, html: mail.html }),
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`mail: resend ${res.status} ${detail.slice(0, 200)}`)
  }
  const body = (await res.json().catch(() => ({}))) as { id?: string }
  return { id: body.id ?? '' }
}

export const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
