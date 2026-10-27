import { useT, type Dict } from '../i18n'

// Under an OPTIONAL field: a quiet « Pourquoi ? » that opens to why it is asked and what you
// do not get if you skip it. Nothing personal is ever required (a name and an email are
// enough for everything core), so each extra says what it buys, one tap away and never in the
// way of the form.
export function Why({ k }: { k: keyof Dict['why'] }) {
  const t = useT()
  return (
    <details className="why">
      <summary>{t.common.why}</summary>
      <p>{t.why[k]}</p>
    </details>
  )
}
