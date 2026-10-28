// Which language an email is written in. Two supported (the SPA's own): the language a person's device announced
// (X-Lang) is remembered on their row, and used for what is sent to them later by the cron or by someone else.
export type MailLang = 'fr' | 'en'

export const isLang = (v: unknown): v is MailLang => v === 'fr' || v === 'en'

/** The language the SPA announced on this request, if it announced a supported one. */
export function requestLang(request: Request): MailLang | null {
  const v = request.headers.get('X-Lang')
  return isLang(v) ? v : null
}

/** The stored language of the recipient, else the language of whoever is acting now, else French. */
export function mailLang(stored: string | null | undefined, request?: Request): MailLang {
  if (isLang(stored)) return stored
  return (request && requestLang(request)) || 'fr'
}
