import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { useT } from '../i18n'
import { Header } from '../components/Header'
import { Icon } from '../components/Icon'

// « Mot de passe oublié » (/oubli) and its other half (/reinitialiser?t=<token>): one
// file, two small forms. The request always says « si un compte existe… » so the page
// reveals nothing about which addresses exist.
export function Forgot() {
  const t = useT()
  const [sent, setSent] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setBusy(true)
    setErr(null)
    try {
      await api('auth/forgot', { method: 'POST', body: { email: new FormData(e.currentTarget).get('email') } })
      setSent(true)
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : t.common.error)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="shell">
      <Header />
      <main id="main" tabIndex={-1}>
      <h1>{t.auth.forgotTitle}</h1>
      {sent ? (
        <div className="notice">{t.auth.forgotSent}</div>
      ) : (
        <form className="card" onSubmit={submit}>
          <label className="field"><span><Icon name="mail" />{t.auth.email}</span><input className="input" name="email" type="email" required autoComplete="email" /></label>
          {err && <div className="notice notice--err">{err}</div>}
          <button className="btn btn--primary btn--big" disabled={busy}>{busy ? t.auth.working : t.auth.forgotSend}</button>
        </form>
      )}
      <p className="small"><Link to="/">{t.encounters.back}</Link></p>
      </main>
    </div>
  )
}

export function Reset() {
  const t = useT()
  const nav = useNavigate()
  const { refresh } = useAuth()
  const [params] = useSearchParams()
  const token = params.get('t') ?? ''
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setBusy(true)
    setErr(null)
    try {
      await api('auth/reset', { method: 'POST', body: { token, password: new FormData(e.currentTarget).get('password') } })
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
      <Header />
      <main id="main" tabIndex={-1}>
      <h1>{t.auth.resetTitle}</h1>
      <form className="card" onSubmit={submit}>
        <label className="field"><span><Icon name="lock" />{t.auth.newPassword}</span><input className="input" name="password" type="password" required minLength={8} autoComplete="new-password" /></label>
        {err && <div className="notice notice--err">{err}</div>}
        <button className="btn btn--primary btn--big" disabled={busy || !token}>{busy ? t.auth.working : t.auth.resetSend}</button>
      </form>
      </main>
    </div>
  )
}
