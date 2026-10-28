import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { useT } from '../i18n'
import { ParentInvite } from '../components/ParentInvite'
import { HomeCardForm } from '../components/HomeCard'
import { useInstall } from '../lib/install'
import { CalendarFeed } from '../components/CalendarFeed'

// « Mon compte » — what is kept (link), a download of everything, and « tout effacer ».
export function Account() {
  const t = useT()
  const nav = useNavigate()
  const qc = useQueryClient()
  const { me, refresh } = useAuth()
  const [err, setErr] = useState<string | null>(null)
  const install = useInstall()
  const [busy, setBusy] = useState(false)
  async function erase(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setBusy(true)
    setErr(null)
    try {
      await api('household', { method: 'DELETE', body: { password: String(new FormData(e.currentTarget).get('password') ?? '') } })
      qc.clear()
      await refresh()
      nav('/', { replace: true })
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : t.common.error)
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      <h1>{t.account.title}</h1>
      <p className="muted small">{me.email}</p>
      {!install.installed && (install.canPrompt || install.ios) && (
        <div className="card">
          <h2>{t.install.title}</h2>
          <p className="muted small">{install.ios ? t.install.ios : t.install.hint}</p>
          {install.canPrompt && <button className="btn btn--primary" onClick={() => void install.install()}>{t.install.button}</button>}
        </div>
      )}
      <CalendarFeed />
      <ParentInvite />
      <HomeCardForm />
      <div className="card" style={{ marginTop: '1.5rem' }}>
        <h2>{t.privacy.title}</h2>
        <p className="muted small">{t.account.keptHint}</p>
        <Link to="/confidentialite" className="btn">{t.privacy.title}</Link>
      </div>
      <div className="card">
        <h2>{t.account.exportTitle}</h2>
        <p className="muted small">{t.account.exportHint}</p>
        <a className="btn" href="/api/export" download>{t.account.exportBtn}</a>
      </div>
      <form className="card" onSubmit={erase}>
        <h2>{t.account.deleteTitle}</h2>
        {me.demo ? <p className="muted small">{t.account.demoNote}</p> : <p className="muted small">{t.account.deleteHint}</p>}
        {!me.demo && <label className="field"><span>{t.account.password}</span><input className="input" name="password" type="password" required autoComplete="current-password" /></label>}
        <label className="check"><input type="checkbox" required /><span>{t.account.confirm}</span></label>
        {err && <div className="notice notice--err">{err}</div>}
        <button className="btn btn--danger" disabled={busy}>{busy ? t.auth.working : t.account.deleteBtn}</button>
      </form>
    </>
  )
}
