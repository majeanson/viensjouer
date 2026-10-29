import { useEffect, useState } from 'react'
import { useLang, type Lang } from '../i18n'
import type { WHY_FR } from '../i18n.why.fr'

// The « Pourquoi ? » notes live in their own chunk (src/i18n.why.*.ts): fetched the first time someone opens one, then kept.
export type WhyText = typeof WHY_FR
export type WhyKey = keyof WhyText

const cache: Partial<Record<Lang, WhyText>> = {}

export function useWhyText(wanted: boolean): WhyText | null {
  const { lang } = useLang()
  const [text, setText] = useState<WhyText | null>(cache[lang] ?? null)
  useEffect(() => {
    if (cache[lang]) {
      setText(cache[lang]!)
      return
    }
    if (!wanted) return
    let live = true
    void (lang === 'fr' ? import('../i18n.why.fr').then((m) => m.WHY_FR) : import('../i18n.why.en').then((m) => m.WHY_EN)).then((x) => {
      cache[lang] = x
      if (live) setText(x)
    })
    return () => {
      live = false
    }
  }, [wanted, lang])
  return text
}
