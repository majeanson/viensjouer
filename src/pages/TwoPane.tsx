import { Suspense, lazy, useEffect, useState, type ReactNode } from 'react'
import { useT } from '../i18n'
import { Loading } from '../components/Loading'

const Encounters = lazy(() => import('./Encounters').then((m) => ({ default: m.Encounters })))

// On a wide screen the Rencontres are a list on the left and the open one on the right, instead of a stretched phone page. On a phone
// or a tablet held upright nothing changes: the list is its own page and so is each rencontre.
const WIDE = '(min-width: 1200px)'

function useWide(): boolean {
  const [wide, setWide] = useState(() => typeof matchMedia === 'function' && matchMedia(WIDE).matches)
  useEffect(() => {
    if (typeof matchMedia !== 'function') return
    const mq = matchMedia(WIDE)
    const on = () => setWide(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return wide
}

export function TwoPane({ children }: { children?: ReactNode }) {
  const t = useT()
  const wide = useWide()
  if (!wide) return children ? <>{children}</> : <Suspense fallback={<Loading />}><Encounters /></Suspense>
  return (
    <div className="twopane" style={{ display: 'grid', gridTemplateColumns: 'minmax(18rem, 22rem) minmax(0, 1fr)', gap: '2rem', alignItems: 'start' }}>
      <aside aria-label={t.encounters.title}>
        <Suspense fallback={<Loading />}><Encounters compact /></Suspense>
      </aside>
      <section>{children ?? <p className="muted" style={{ marginTop: '2rem' }}>{t.encounters.pick}</p>}</section>
    </div>
  )
}
