import { useState } from 'react'
import { ValidForm } from './ValidForm'
import { Link, useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { useT } from '../i18n'
import { Header } from './Header'
import { Icon } from './Icon'
import { LinkFamilies } from './LinkFamilies'

export interface CircleInfo {
  hostName: string | null
  hostChild: string
  familyChild: string
  used: boolean
}

// The page a two-word code opens when it is a CIRCLE invitation (« Inviter dans mon cercle »): no rencontre, just « would you like to be
// linked with us ». Signed in with an account of your own: one tap (LinkFamilies). No account yet: a quick one is made on the spot, linked
// to the host from the first second (the same claim as a rencontre's reply page). Never anything more than first names.
export function CircleDoor({ token, info }: { token: string; info: CircleInfo }) {
  const t = useT()
  const nav = useNavigate()
  const { me, refresh } = useAuth()
  const [err, setErr] = useState<string | null>(null)
  const claim = useMutation({
    mutationFn: (body: Record<string, unknown>) => api(`r/${token}/claim`, { method: 'POST', body }),
    onSuccess: async () => {
      await refresh()
      nav('/amis', { replace: true })
    },
    onError: (e: Error) => setErr(e.message),
  })
  const host = info.hostName ?? ''
  return (
    <div className="shell">
      <Header />
      <main id="main" tabIndex={-1}>
        <section className="card">
          <p className="kind" style={{ margin: 0 }}>{t.circleDoor.kind}</p>
          <h1 style={{ marginTop: '0.25rem' }}>{t.circleDoor.title(host)}</h1>
          <p className="muted">{t.circleDoor.hint(info.hostChild, info.familyChild)}</p>
        </section>
        {info.used && !me.signedIn ? (
          <div className="notice" role="status">{t.circleDoor.used} <Link to="/">{t.circleDoor.signIn}</Link></div>
        ) : me.signedIn ? (
          <LinkFamilies token={token} />
        ) : (
          <>
            <ValidForm className="card" onSubmit={(ev) => { ev.preventDefault(); setErr(null); claim.mutate(Object.fromEntries(new FormData(ev.currentTarget).entries())) }}>
              <h2><Icon name="user" />{t.circleDoor.create}</h2>
              <label className="field"><span><Icon name="user" />{t.reply.parentName}</span><input className="input" name="displayName" required maxLength={60} autoComplete="given-name" /></label>
              <label className="field"><span><Icon name="mail" />{t.reply.email}</span><input className="input" name="email" type="email" required autoComplete="email" /></label>
              <label className="field"><span><Icon name="lock" />{t.reply.claimPassword}</span><input className="input" name="password" type="password" required minLength={8} autoComplete="new-password" /></label>
              {err && <div className="notice notice--err" role="alert">{err}</div>}
              <button className="btn btn--primary btn--big" disabled={claim.isPending}>{t.reply.claimSend}</button>
            </ValidForm>
            <p className="small">{t.circleDoor.haveAccount} <Link to="/">{t.circleDoor.signIn}</Link></p>
          </>
        )}
      </main>
    </div>
  )
}
