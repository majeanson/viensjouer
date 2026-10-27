import { useT, type Dict } from '../i18n'

// Under an OPTIONAL field: why it is asked, and what you do not get if you skip it. Nothing
// personal is ever required — a name and an email are enough to use everything core — so every
// extra says out loud what it buys.
export function Why({ k }: { k: keyof Dict['why'] }) {
  const t = useT()
  return <small className="why">{t.why[k]}</small>
}
