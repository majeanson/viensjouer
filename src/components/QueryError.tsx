import { useT } from '../i18n'
import { isStatus } from '../lib/api'

// What a screen shows when its read failed. Announced (role=alert) and, unless the thing is simply gone, with a
// way to try again: a parent on one bar of signal must not have to guess that reloading is the fix. `dead` is the
// sentence for a 404 (an expired or wrong link), which no retry can cure.
export function QueryError({ error, onRetry, dead, page = false }: { error: unknown; onRetry: () => void; dead?: string; page?: boolean }) {
  const t = useT()
  const gone = dead !== undefined && isStatus(error, 404)
  const offline = typeof navigator !== 'undefined' && navigator.onLine === false
  const body = (
    <div className="notice notice--err" role="alert">
      <span>{gone ? dead : offline ? t.common.offline : t.common.error}</span>
      {!gone && <button className="btn btn--small" onClick={onRetry}>{t.common.tryAgain}</button>}
    </div>
  )
  return page ? <div className="shell">{body}</div> : body
}
