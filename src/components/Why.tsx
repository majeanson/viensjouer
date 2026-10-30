import { useState, type ReactNode } from 'react'
import { useT } from '../i18n'
import { useWhyText, type WhyKey } from '../lib/whyText'

// The one « (?) » of the app: a small round help mark that opens to why something is asked and what you do not get if you skip it.
// Nothing personal is ever required (a name and an email are enough for everything core), so each extra says what it buys, one tap
// away and never in the way of the form. The note itself is fetched the first time it is opened. `WhyMany` is the same mark
// for a group of fields.
const round = { width: 36, minHeight: 36, padding: 0, justifyContent: 'center', borderRadius: 999, fontWeight: 700 } as const

export function WhyShell({ onOpen, children }: { onOpen: () => void; children: ReactNode }) {
  const t = useT()
  return (
    <details className="why" onToggle={(e) => e.currentTarget.open && onOpen()}>
      <summary aria-label={t.common.why} title={t.common.why} style={round}>?</summary>
      {children}
    </details>
  )
}

export function Why({ k }: { k: WhyKey }) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const why = useWhyText(open)
  return (
    <WhyShell onOpen={() => setOpen(true)}>
      <p>{why ? why[k] : t.common.loading}</p>
    </WhyShell>
  )
}
