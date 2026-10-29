import { useState } from 'react'
import { useT } from '../i18n'
import { useWhyText, type WhyKey } from '../lib/whyText'

// Under an OPTIONAL field: a quiet « Pourquoi ? » that opens to why it is asked and what you
// do not get if you skip it. Nothing personal is ever required (a name and an email are
// enough for everything core), so each extra says what it buys, one tap away and never in the
// way of the form. The note itself is fetched the first time it is opened.
export function Why({ k }: { k: WhyKey }) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const why = useWhyText(open)
  return (
    <details className="why" onToggle={(e) => e.currentTarget.open && setOpen(true)}>
      <summary>{t.common.why}</summary>
      <p>{why ? why[k] : t.common.loading}</p>
    </details>
  )
}
