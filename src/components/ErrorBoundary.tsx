import { Component, useEffect, useState, type ReactNode } from 'react'
import { useT } from '../i18n'
import { Icon } from './Icon'

// What a person sees when something throws instead of a white page. A page that fails to load because a
// deploy replaced its file while the tab was open ("Failed to fetch dynamically imported module") reloads
// once by itself, which is what the person would do anyway; anything else shows a calm card with a reload.
const STALE = /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i
const RELOADED = 'vj-chunk-reloaded'

function Fallback({ onRetry }: { onRetry: () => void }) {
  const t = useT()
  return (
    <div className="shell" role="alert">
      <div className="card" style={{ marginTop: '4rem' }}>
        <h1 style={{ fontSize: '1.2rem' }}><Icon name="alert" />{t.common.crashed}</h1>
        <p className="muted">{t.common.crashedHint}</p>
        <div className="cluster">
          <button className="btn btn--primary" onClick={() => location.reload()}>{t.common.reload}</button>
          <button className="btn" onClick={onRetry}>{t.common.tryAgain}</button>
        </div>
      </div>
    </div>
  )
}

class Inner extends Component<{ children: ReactNode; resetKey: string }, { error: Error | null }> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error) {
    return { error }
  }
  componentDidCatch(error: Error) {
    console.error('[ui]', error)
    try {
      if (STALE.test(error.message) && !sessionStorage.getItem(RELOADED)) {
        sessionStorage.setItem(RELOADED, '1')
        location.reload()
      }
    } catch {
      /* storage blocked: the card below still offers the reload */
    }
  }
  componentDidUpdate(prev: { resetKey: string }) {
    // Moving to another page clears the error, so one broken page never traps the rest of the app.
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null })
  }
  render() {
    if (this.state.error) return <Fallback onRetry={() => this.setState({ error: null })} />
    return this.props.children
  }
}

export function ErrorBoundary({ children, resetKey }: { children: ReactNode; resetKey: string }) {
  return <Inner resetKey={resetKey}>{children}</Inner>
}

// « Hors ligne »: the pages talk to the server all day, so say so instead of letting taps seem to do nothing.
export function useOnline(): boolean {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine))
  useEffect(() => {
    const up = () => setOnline(true)
    const down = () => setOnline(false)
    addEventListener('online', up)
    addEventListener('offline', down)
    return () => {
      removeEventListener('online', up)
      removeEventListener('offline', down)
    }
  }, [])
  return online
}

export function OfflineNotice() {
  const t = useT()
  const online = useOnline()
  if (online) return null
  return (
    <div className="notice notice--err" role="status">
      {t.common.offline}
    </div>
  )
}
