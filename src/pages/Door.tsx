import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { useLang, useT } from '../i18n'

// The front door: the pitch, and sign in / sign up on the same page. A signed-in
// parent is sent straight to their rencontres.
export function Door() {
  const { loading, me, refresh } = useAuth()
  const t = useT()
  const { lang, setLang } = useLang()
  const nav = useNavigate()
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const health = useQuery({ queryKey: ['health'], queryFn: () => api<{ invite: boolean; mail: boolean }>('health'), staleTime: 60_000 })

  useEffect(() => {
    if (!loading && me.signedIn) nav('/rencontres', { replace: true })
  }, [loading, me.signedIn, nav])

  async function tryDemo() {
    setBusy(true)
    setErr(null)
    try {
      await api('demo', { method: 'POST' })
      await refresh()
      nav('/rencontres', { replace: true })
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : t.common.error)
    } finally {
      setBusy(false)
    }
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setBusy(true)
    setErr(null)
    const f = new FormData(e.currentTarget)
    const body = Object.fromEntries(f.entries())
    try {
      await api(mode === 'login' ? 'auth/login' : 'auth/signup', { method: 'POST', body })
      await refresh()
      nav('/rencontres', { replace: true })
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : t.common.error)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="shell">
      <header className="topbar">
        <span className="brand"><i />{t.appName}</span>
        <button className="btn btn--ghost" onClick={() => setLang(lang === 'fr' ? 'en' : 'fr')}>{t.common.lang}</button>
      </header>
      <section className="hero">
        <h1>{t.tagline}</h1>
        <p className="muted">{t.door.pitch}</p>
        <div className="kinds">{t.door.kinds.map((k) => <span key={k} className="chip chip--kind">{k}</span>)}</div>
      </section>
      <form className="card" onSubmit={submit}>
        <div className="seg" style={{ marginBottom: '1rem' }}>
          <button type="button" className={`btn ${mode === 'login' ? 'btn--on' : ''}`} onClick={() => setMode('login')}>{t.door.haveAccount}</button>
          <button type="button" className={`btn ${mode === 'signup' ? 'btn--on' : ''}`} onClick={() => setMode('signup')}>{t.door.noAccount}</button>
        </div>
        {mode === 'signup' && (
          <>
            <label className="field"><span>{t.auth.displayName}</span><input className="input" name="displayName" required maxLength={60} autoComplete="given-name" /></label>
            <label className="field"><span>{t.auth.householdName}</span><input className="input" name="householdName" maxLength={60} placeholder={t.auth.householdHint} /></label>
          </>
        )}
        <label className="field"><span>{t.auth.email}</span><input className="input" name="email" type="email" required autoComplete="email" /></label>
        <label className="field"><span>{t.auth.password}</span><input className="input" name="password" type="password" required minLength={8} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} /></label>
        {mode === 'signup' && health.data?.invite && (
          <label className="field"><span>{t.auth.invite}</span><input className="input" name="invite" required /></label>
        )}
        {err && <div className="notice notice--err">{err}</div>}
        <button className="btn btn--primary btn--big" disabled={busy}>{busy ? t.auth.working : mode === 'login' ? t.auth.submitLogin : t.auth.submitSignup}</button>
        {mode === 'login' && health.data?.mail && <p className="small" style={{ marginTop: '0.75rem' }}><Link to="/oubli">{t.auth.forgot}</Link></p>}
      </form>
      <div className="card" style={{ textAlign: 'center' }}>
        <button type="button" className="btn btn--big" disabled={busy} onClick={() => void tryDemo()}>{t.trial.button}</button>
        <p className="muted small" style={{ margin: '0.5rem 0 0' }}>{t.trial.hint}</p>
      </div>
    </div>
  )
}
