import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
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

// « Mon compte » — one tab at a time, kept in the address (?tab=) so a link or a refresh lands on it:
// who I am, my household, my calendar and the app, my security, my data (what is kept, a download, « tout effacer »).
const TABS = ['profile', 'home', 'calendar', 'security', 'data'] as const
type Tab = (typeof TABS)[number]

export function Account() {
  const t = useT()
  const nav = useNavigate()
  const qc = useQueryClient()
  const { me, refresh } = useAuth()
  const [params, setParams] = useSearchParams()
  const asked = params.get('tab')
  const tab: Tab = TABS.find((x) => x === asked) ?? 'profile'
  const [err, setErr] = useState<string | null>(null)
  const install = useInstall()
  const health = useQuery({ queryKey: ['health'], queryFn: () => api<{ photos: boolean }>('health'), staleTime: 60_000 })
  const [saved, setSaved] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testSent, setTestSent] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [secNote, setSecNote] = useState<string | null>(null)
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
      <div className="seg" role="tablist" aria-label={t.account.title} style={{ marginBottom: '1rem' }}>
        {TABS.map((x) => (
          <button key={x} type="button" role="tab" id={`tab-${x}`} aria-selected={tab === x} aria-controls="account-panel" className={`btn btn--small ${tab === x ? 'btn--on' : ''}`} onClick={() => { setErr(null); setParams(x === 'profile' ? {} : { tab: x }, { replace: true }) }}>
            {t.account.tabs[x]}
          </button>
        ))}
      </div>
      <div role="tabpanel" id="account-panel" aria-labelledby={`tab-${tab}`}>
        {tab === 'profile' && (
          <div className="card">
            <AvatarPicker
              name={me.displayName ?? ''}
              colour="var(--host)"
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
            {err && <div className="notice notice--err" style={{ marginTop: '0.75rem' }}>{err}</div>}
            {me.mail && !me.demo && (
              <>
                {([
                  ['remindHost', !!me.remindHost, t.profile.remindHost, t.profile.remindHostHint],
                  ['notifyAnswers', !!me.notifyAnswers, t.profile.notifyAnswers, t.profile.notifyAnswersHint],
                ] as const).map(([key, on, label, hint]) => (
                  <label key={key} className="check" style={{ marginTop: '1rem' }}>
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={async (ev) => {
                        setErr(null)
                        try {
                          await api('profile', { method: 'PATCH', body: { [key]: ev.currentTarget.checked } })
                          await refresh()
                        } catch (ex) {
                          setErr(ex instanceof Error ? ex.message : t.common.error)
                        }
                      }}
                    />
                    <span>{label}<span className="small muted" style={{ display: 'block', fontWeight: 400 }}>{hint}</span></span>
                  </label>
                ))}
                <div style={{ marginTop: '1rem' }}>
                  <p className="muted small" style={{ margin: '0 0 0.4rem' }}>{t.profile.testMailHint}</p>
                  <button
                    className="btn"
                    disabled={testing}
                    onClick={async () => {
                      setTesting(true)
                      setErr(null)
                      try {
                        const r = await api<{ to: string }>('test-mail', { method: 'POST', body: {} })
                        setTestSent(t.profile.testMailSent(r.to))
                      } catch (ex) {
                        setErr(ex instanceof Error ? ex.message : t.common.error)
                      } finally {
                        setTesting(false)
                      }
                    }}
                  >
                    <Icon name="mail" />{t.profile.testMail}
                  </button>
                  {testSent && <p className="small" role="status" style={{ margin: '0.4rem 0 0' }}>{testSent}</p>}
                </div>
              </>
            )}
          </div>
        )}

        {tab === 'home' && (
          <>
            <div className="card card--nest"><ParentInvite /></div>
            <div className="card card--nest"><HomeCardForm /></div>
          </>
        )}

        {tab === 'calendar' && (
          <>
            <CalendarFeed />
            {!install.installed && (install.canPrompt || install.ios) && (
              <div className="card">
                <h2><Icon name="download" />{t.install.title}</h2>
                <p className="muted small">{install.ios ? t.install.ios : t.install.hint}</p>
                {install.canPrompt && <button className="btn btn--primary" onClick={() => void install.install()}>{t.install.button}</button>}
              </div>
            )}
          </>
        )}

        {tab === 'security' && (
          <div className="card">
            <form
              onSubmit={async (e: FormEvent<HTMLFormElement>) => {
                e.preventDefault()
                const form = e.currentTarget
                const f = new FormData(form)
                setSecNote(null)
                try {
                  await api('password', { method: 'POST', body: { current: String(f.get('current') ?? ''), next: String(f.get('next') ?? '') } })
                  form.reset()
                  setSecNote(t.account.security.changed)
                } catch (ex) {
                  setSecNote(ex instanceof Error ? ex.message : t.common.error)
                }
              }}
            >
              <label className="field"><span>{t.account.security.current}</span><input className="input" name="current" type="password" required autoComplete="current-password" /></label>
              <label className="field"><span>{t.account.security.next}</span><input className="input" name="next" type="password" required minLength={8} autoComplete="new-password" /></label>
              <button className="btn">{t.account.security.change}</button>
            </form>
            <p className="muted small" style={{ margin: '0.8rem 0 0.4rem' }}>{t.account.security.everywhereHint}</p>
            <button
              className="btn"
              onClick={async () => {
                setSecNote(null)
                try {
                  await api('sessions', { method: 'DELETE' })
                  setSecNote(t.account.security.everywhereDone)
                } catch (ex) {
                  setSecNote(ex instanceof Error ? ex.message : t.common.error)
                }
              }}
            >
              <Icon name="logout" />{t.account.security.everywhere}
            </button>
            {secNote && <p className="small" role="status" style={{ margin: '0.5rem 0 0' }}>{secNote}</p>}
          </div>
        )}

        {tab === 'data' && (
          <>
            <div className="card">
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
        )}
      </div>
    </>
  )
}
