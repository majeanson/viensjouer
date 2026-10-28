import { useLang } from '../i18n'
import { relativeDay } from '../lib/format'

// « · demain », « · dans 3 jours »: how near a date is, beside the date itself, for the coming week only.
export function Rel({ at }: { at: number }) {
  const { lang } = useLang()
  const r = relativeDay(at, lang)
  return r ? <span className="rel">· {r}</span> : null
}
