import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { useT } from '../i18n'
import { Header } from '../components/Header'
import { Icon } from '../components/Icon'
import { Turnstile } from '../components/Turnstile'
import { Credit } from '../components/Credit'
import { CardCode } from '../components/CardCode'

// The front door: one sentence, sign in or create an account, or try it. A signed-in parent
// is sent straight to their rencontres.
// The zone this device is in: a new household starts there, not in Toronto.
const browserTz = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone
  } catch {
    return undefined
  }
}

export function Door() {
  const { loading, me, refresh } = useAuth()
  const t = useT()
  const nav = useNavigate()
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const health = useQuery({ queryKey: ['health'], queryFn: () => api<{ invite: boolean; mail: boolean; turnstile?: string | null }>('health'), staleTime: 60_000 })

  useEffect(() => {
    if (!loading && me.signedIn) nav('/rencontres', { replace: true })
  }, [loading, me.signedIn, nav])

  const [tsTries, setTsTries] = useState(0)
  async function go(path: string, body?: unknown) {
    setBusy(true)
    setErr(null)
    try {
      await api(path, { method: 'POST', body })
      await refresh()
      nav('/rencontres', { replace: true })
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : t.common.error)
    } finally {
      setBusy(false)
      setTsTries((n) => n + 1) // a token works once: ask for a fresh one whatever happened
    }
  }
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    void go(mode === 'login' ? 'auth/login' : 'auth/signup', { ...Object.fromEntries(new FormData(e.currentTarget).entries()), ...(mode === 'signup' ? { tz: browserTz() } : {}) })
  }

  return (
    <div className="shell">
      <Header />
      <main id="main" tabIndex={-1}>
      <section className="hero">
        <h1>{t.tagline}</h1>
        <p className="muted">{t.door.pitch}</p>
      </section>
      <CardCode />
      <form className="card" onSubmit={submit}>
        <div className="seg" role="tablist" style={{ marginBottom: '1rem' }}>
          <button type="button" role="tab" aria-selected={mode === 'login'} className={`btn btn--small ${mode === 'login' ? 'btn--on' : ''}`} onClick={() => setMode('login')}>{t.door.haveAccount}</button>
          <button type="button" role="tab" aria-selected={mode === 'signup'} className={`btn btn--small ${mode === 'signup' ? 'btn--on' : ''}`} onClick={() => setMode('signup')}>{t.door.noAccount}</button>
        </div>
        {mode === 'signup' && <label className="field"><span><Icon name="user" />{t.auth.displayName}</span><input className="input" name="displayName" required maxLength={60} autoComplete="given-name" /></label>}
        <label className="field"><span><Icon name="mail" />{t.auth.email}</span><input className="input" name="email" type="email" required autoComplete="email" /></label>
        <label className="field"><span><Icon name="lock" />{t.auth.password}</span><input className="input" name="password" type="password" required minLength={8} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} /></label>
        {mode === 'signup' && health.data?.turnstile && <Turnstile siteKey={health.data.turnstile} action="signup" resetKey={tsTries} />}
        {mode === 'signup' && health.data?.invite && <label className="field"><span>{t.auth.invite}</span><input className="input" name="invite" required /></label>}
        {err && <div className="notice notice--err">{err}</div>}
        <button className="btn btn--primary btn--big" disabled={busy}>{busy ? t.auth.working : mode === 'login' ? t.auth.submitLogin : t.auth.submitSignup}</button>
        {mode === 'login' && health.data?.mail && <p className="small" style={{ margin: '0.75rem 0 0' }}><Link to="/oubli">{t.auth.forgot}</Link></p>}
      </form>
      <div className="trial">
        <button type="button" className="btn" disabled={busy} onClick={() => void go('demo')}>{t.trial.button}</button>
        <p className="muted small">{t.trial.hint}</p>
      </div>
      <details className="fold how" aria-label={t.door.how.title}>
        <summary><span>{t.door.how.title}</span></summary>
        <div>
          <ol>{t.door.how.steps.map((x) => <li key={x}>{x}</li>)}</ol>
          <p className="muted small">{t.door.how.note}</p>
        </div>
      </details>
      <p className="small" style={{ textAlign: 'center' }}><Link to="/confidentialite">{t.privacy.link}</Link></p>
      <Credit />
      </main>
    </div>
  )
}
