import { useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { useT } from '../i18n'
import { Header } from '../components/Header'

// /rejoindre?t=<token> — the other parent redeems their invitation: own name, email and
// password, added to the inviting household, signed in on the spot.
export function Join() {
  const t = useT()
  const nav = useNavigate()
  const { refresh } = useAuth()
  const [params] = useSearchParams()
  const token = params.get('t') ?? ''
  const q = useQuery({ queryKey: ['join', token], queryFn: () => api<{ household: string; inviter: string | null }>(`join?t=${encodeURIComponent(token)}`), retry: false, enabled: !!token })
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setBusy(true)
    setErr(null)
    try {
      await api('join', { method: 'POST', body: { token, ...Object.fromEntries(new FormData(e.currentTarget).entries()) } })
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
      {!token || q.isError ? (
        <div className="notice notice--err">{t.parent.dead}</div>
      ) : q.data ? (
        <>
          <h1>{t.parent.joinTitle(q.data.household)}</h1>
          <p className="muted">{t.parent.joinHint(q.data.inviter ?? '')}</p>
          <form className="card" onSubmit={submit}>
            <label className="field"><span>{t.auth.displayName}</span><input className="input" name="displayName" required maxLength={60} autoComplete="given-name" /></label>
            <label className="field"><span>{t.auth.email}</span><input className="input" name="email" type="email" required autoComplete="email" /></label>
            <label className="field"><span>{t.auth.password}</span><input className="input" name="password" type="password" required minLength={8} autoComplete="new-password" /></label>
            {err && <div className="notice notice--err">{err}</div>}
            <button className="btn btn--primary btn--big" disabled={busy}>{busy ? t.auth.working : t.parent.joinSend}</button>
          </form>
        </>
      ) : (
        <p className="muted">{t.common.loading}</p>
      )}
    </div>
  )
}
