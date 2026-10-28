import { useT, type Dict } from '../i18n'

// ONE « Pourquoi ? » for a group of optional fields: each line names the field, why it is asked and
// what you lose by skipping it. Same transparency as one note per field, a lot less to scroll past.
export function WhyMany({ items }: { items: [label: string, key: keyof Dict['why']][] }) {
  const t = useT()
  return (
    <details className="why">
      <summary>{t.common.why}</summary>
      <ul className="why__list">
        {items.map(([label, k]) => (
          <li key={k}>
            <strong>{label}</strong> : {t.why[k]}
          </li>
        ))}
      </ul>
    </details>
  )
}
