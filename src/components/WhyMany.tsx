import { useState } from 'react'
import { useT } from '../i18n'
import { useWhyText, type WhyKey } from '../lib/whyText'

// ONE « Pourquoi ? » for a group of optional fields: each line names the field, why it is asked and
// what you lose by skipping it. Same transparency as one note per field, a lot less to scroll past.
export function WhyMany({ items }: { items: [label: string, key: WhyKey][] }) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const why = useWhyText(open)
  return (
    <details className="why" onToggle={(e) => e.currentTarget.open && setOpen(true)}>
      <summary>{t.common.why}</summary>
      <ul className="why__list">
        {items.map(([label, k]) => (
          <li key={k}>
            <strong>{label}</strong> : {why ? why[k] : t.common.loading}
          </li>
        ))}
      </ul>
    </details>
  )
}
