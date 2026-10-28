import { useT } from '../i18n'

// What a screen shows while its first read is in flight: the word for assistive tech, and the skeleton cards the
// agenda already uses so the page does not jump. `page` wraps it in the narrow `.shell` for screens that render
// before the header (the reply pages).
export function Loading({ page = false }: { page?: boolean }) {
  const t = useT()
  const body = (
    <div aria-busy="true">
      <p className="muted" role="status">{t.common.loading}</p>
      {[0, 1].map((n) => <div key={n} className="card skeleton" aria-hidden="true" />)}
    </div>
  )
  return page ? <div className="shell">{body}</div> : body
}
