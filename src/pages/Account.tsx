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
import { AvatarPicker } from '../components/AvatarPicker'
import { useQuery } from '@tanstack/react-query'
import { Icon } from '../components/Icon'

// « Mon compte » — what is kept (link), a download of everything, and « tout effacer ».
export function Account() {
  const t = useT()
  const nav = useNavigate()
  const qc = useQueryClient()
  const { me, refresh } = useAuth()
  const [err, setErr] = useState<string | null>(null)
  const install = useInstall()
  const health = useQuery({ queryKey: ['health'], queryFn: () => api<{ photos: boolean }>('health'), staleTime: 60_000 })
  const [saved, setSaved] = useState(false)
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
      <div className="card">
        <h2><Icon name="user" />{t.profile.title}</h2>
        <AvatarPicker
          name={me.displayName ?? ''}
          colour="var(--ink)"
          src={me.photo ? `/api/avatar/parent/me?v=${me.photo}` : null}
          enabled={!!health.data?.photos && !me.demo}
          label={t.avatar.add}
          onUpload={async (blob) => { await api('avatar?kind=parent', { method: 'POST', body: blob }); await refresh() }}
          onRemove={async () => { await api('avatar', { method: 'DELETE', body: { kind: 'parent' } }); await refresh() }}
        />
        <form
          onSubmit={async (ev) => {
            ev.preventDefault()
            const displayName = String(new FormData(ev.currentTarget).get('displayName') ?? '').trim()
            if (!displayName) return
            setErr(null)
            try {
              await api('profile', { method: 'PATCH', body: { displayName } })
              await refresh()
              setSaved(true)
              setTimeout(() => setSaved(false), 2500)
            } catch (ex) {
              setErr(ex instanceof Error ? ex.message : t.common.error)
            }
          }}
        >
          <label className="field"><span><Icon name="user" />{t.profile.name}</span><input className="input" name="displayName" required maxLength={60} defaultValue={me.displayName ?? ''} autoComplete="given-name" /><span className="small muted" style={{ fontWeight: 400 }}>{t.profile.nameHint}</span></label>
          <button className="btn btn--primary" style={{ marginTop: '0.5rem' }}>{saved ? t.profile.saved : t.profile.save}</button>
        </form>
      </div>
      {!install.installed && (install.canPrompt || install.ios) && (
        <div className="card">
          <h2><Icon name="download" />{t.install.title}</h2>
          <p className="muted small">{install.ios ? t.install.ios : t.install.hint}</p>
          {install.canPrompt && <button className="btn btn--primary" onClick={() => void install.install()}>{t.install.button}</button>}
        </div>
      )}
      <CalendarFeed />
      <div className="card card--nest"><ParentInvite /></div>
      <div className="card card--nest"><HomeCardForm /></div>
      <div className="card" style={{ marginTop: '1.5rem' }}>
        <h2><Icon name="shield" />{t.privacy.title}</h2>
        <p className="muted small">{t.account.keptHint}</p>
        <Link to="/confidentialite" className="btn">{t.privacy.title}</Link>
      </div>
      <div className="card">
        <h2><Icon name="download" />{t.account.exportTitle}</h2>
        <p className="muted small">{t.account.exportHint}</p>
        <a className="btn" href="/api/export" download>{t.account.exportBtn}</a>
      </div>
      <form className="card" onSubmit={erase}>
        <h2><Icon name="trash" />{t.account.deleteTitle}</h2>
        {me.demo ? <p className="muted small">{t.account.demoNote}</p> : <p className="muted small">{t.account.deleteHint}</p>}
        {!me.demo && <label className="field"><span><Icon name="lock" />{t.account.password}</span><input className="input" name="password" type="password" required autoComplete="current-password" /></label>}
        <label className="check"><input type="checkbox" required /><span>{t.account.confirm}</span></label>
        {err && <div className="notice notice--err">{err}</div>}
        <button className="btn btn--danger" disabled={busy}>{busy ? t.auth.working : t.account.deleteBtn}</button>
      </form>
    </>
  )
}
