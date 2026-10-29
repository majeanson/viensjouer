import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { useT } from '../i18n'
import { Header } from '../components/Header'
import { Icon } from '../components/Icon'
import { CODE_RE } from '../lib/link'

// The front door: one sentence, sign in or create an account, or try it. A signed-in parent
// is sent straight to their rencontres.
export function Door() {
  const { loading, me, refresh } = useAuth()
  const t = useT()
  const nav = useNavigate()
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [cardErr, setCardErr] = useState(false)
  const health = useQuery({ queryKey: ['health'], queryFn: () => api<{ invite: boolean; mail: boolean }>('health'), staleTime: 60_000 })

  useEffect(() => {
    if (!loading && me.signedIn) nav('/rencontres', { replace: true })
  }, [loading, me.signedIn, nav])

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
    }
  }
  // A paper card carries two words; whoever holds it types them here, with a space or a hyphen, accents or not.
  function openCard(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const code = String(new FormData(e.currentTarget).get('code') ?? '').toLowerCase().trim().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[\s_.,]+/g, '-')
    if (CODE_RE.test(code)) nav(`/${code}`)
    else setCardErr(true)
  }
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    void go(mode === 'login' ? 'auth/login' : 'auth/signup', Object.fromEntries(new FormData(e.currentTarget).entries()))
  }

  return (
    <div className="shell">
      <Header />
      <main id="main" tabIndex={-1}>
      <section className="hero">
        <h1>{t.tagline}</h1>
        <p className="muted">{t.door.pitch}</p>
        <ul className="points">
          <li><Icon name="calendar" /><span>{t.door.points[0]}</span></li>
          <li><Icon name="share" /><span>{t.door.points[1]}</span></li>
          <li><Icon name="check" /><span>{t.door.points[2]}</span></li>
        </ul>
      </section>
      <form className="card" onSubmit={openCard}>
        <h2><Icon name="note" />{t.door.cardTitle}</h2>
        <div className="cluster">
          <input className="input" name="code" aria-label={t.door.cardLabel} placeholder={t.door.cardPlaceholder} autoCapitalize="none" autoCorrect="off" spellCheck={false} required maxLength={40} style={{ flex: '1 1 10rem' }} onChange={() => setCardErr(false)} />
          <button className="btn btn--primary">{t.door.cardGo}</button>
        </div>
        {cardErr && <div className="notice notice--err" role="alert" style={{ marginTop: '0.5rem' }}>{t.door.cardBad}</div>}
      </form>
      <form className="card" onSubmit={submit}>
        <div className="seg" role="tablist" style={{ marginBottom: '1rem' }}>
          <button type="button" role="tab" aria-selected={mode === 'login'} className={`btn btn--small ${mode === 'login' ? 'btn--on' : ''}`} onClick={() => setMode('login')}>{t.door.haveAccount}</button>
          <button type="button" role="tab" aria-selected={mode === 'signup'} className={`btn btn--small ${mode === 'signup' ? 'btn--on' : ''}`} onClick={() => setMode('signup')}>{t.door.noAccount}</button>
        </div>
        {mode === 'signup' && <label className="field"><span><Icon name="user" />{t.auth.displayName}</span><input className="input" name="displayName" required maxLength={60} autoComplete="given-name" /></label>}
        <label className="field"><span><Icon name="mail" />{t.auth.email}</span><input className="input" name="email" type="email" required autoComplete="email" /></label>
        <label className="field"><span><Icon name="lock" />{t.auth.password}</span><input className="input" name="password" type="password" required minLength={8} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} /></label>
        {mode === 'signup' && health.data?.invite && <label className="field"><span>{t.auth.invite}</span><input className="input" name="invite" required /></label>}
        {err && <div className="notice notice--err">{err}</div>}
        <button className="btn btn--primary btn--big" disabled={busy}>{busy ? t.auth.working : mode === 'login' ? t.auth.submitLogin : t.auth.submitSignup}</button>
        {mode === 'login' && health.data?.mail && <p className="small" style={{ margin: '0.75rem 0 0' }}><Link to="/oubli">{t.auth.forgot}</Link></p>}
      </form>
      <div className="trial">
        <button type="button" className="btn" disabled={busy} onClick={() => void go('demo')}>{t.trial.button}</button>
        <p className="muted small">{t.trial.hint}</p>
      </div>
      <p className="small" style={{ textAlign: 'center' }}><Link to="/confidentialite">{t.privacy.link}</Link></p>
      </main>
    </div>
  )
}
