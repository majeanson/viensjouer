import { useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { useT } from '../i18n'

// « Garder ma maisonnée » (/garder) — a trial parent turns the sandbox into a real account
// in place: same children, families and rencontres, a real email and password.
export function Keep() {
  const t = useT()
  const nav = useNavigate()
  const { me, refresh, loading } = useAuth()
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  if (loading) return <p className="shell muted">{t.common.loading}</p>
  if (!me.demo) return <Navigate to={me.signedIn ? '/rencontres' : '/'} replace />
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setBusy(true)
    setErr(null)
    try {
      await api('demo/claim', { method: 'POST', body: Object.fromEntries(new FormData(e.currentTarget).entries()) })
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
      <h1>{t.trial.keepTitle}</h1>
      <p className="muted">{t.trial.keepHint}</p>
      <form className="card" onSubmit={submit}>
        <label className="field"><span>{t.auth.displayName}</span><input className="input" name="displayName" required maxLength={60} autoComplete="given-name" /></label>
        <label className="field"><span>{t.auth.email}</span><input className="input" name="email" type="email" required autoComplete="email" /></label>
        <label className="field"><span>{t.auth.password}</span><input className="input" name="password" type="password" required minLength={8} autoComplete="new-password" /></label>
        {err && <div className="notice notice--err">{err}</div>}
        <button className="btn btn--primary btn--big" disabled={busy}>{busy ? t.auth.working : t.trial.keepSend}</button>
      </form>
    </div>
  )
}
