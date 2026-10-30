import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { K } from '../lib/query'
import { useT } from '../i18n'
import { useInstall } from '../lib/install'
import { disablePush, enablePush, isSubscribed, pushPermission, pushSupported } from '../lib/push'
import { Icon } from './Icon'

// Compte, « Notifications »: what you are told and where, in plain words, with the one switch for THIS device. The in-app list
// (the bell in the header) needs no permission and is always there; the phone notification is the optional extra.
export function NotificationsCard() {
  const t = useT()
  const qc = useQueryClient()
  const inst = useInstall()
  const health = useQuery({ queryKey: ['health'], queryFn: () => api<{ push?: string | null }>('health'), staleTime: 60_000 })
  const [on, setOn] = useState(false)
  const [perm, setPerm] = useState(pushPermission())
  const [err, setErr] = useState<string | null>(null)
  const [tested, setTested] = useState(false)
  useEffect(() => {
    void isSubscribed().then(setOn)
  }, [])

  const toggle = useMutation({
    mutationFn: async () => {
      if (on) await disablePush()
      else await enablePush(health.data!.push!)
    },
    onSuccess: async () => {
      setOn(await isSubscribed())
      setPerm(pushPermission())
      setErr(null)
    },
    onError: (e: Error) => {
      setPerm(pushPermission())
      setErr(e.message === 'denied' ? t.notif.denied : t.common.error)
    },
  })
  const test = useMutation({
    mutationFn: () => api('push', { method: 'POST', body: { test: true } }),
    onSuccess: () => {
      setTested(true)
      void qc.invalidateQueries({ queryKey: K.notifications })
    },
    onError: (e: Error) => setErr(e.message),
  })

  const key = health.data?.push
  let device: React.ReactNode
  if (!key) device = <p className="muted small">{t.notif.off}</p>
  else if (inst.ios && !inst.installed && !pushSupported()) device = <p className="small">{t.notif.iosFirst}</p>
  else if (!pushSupported()) device = <p className="muted small">{t.notif.unsupported}</p>
  else if (perm === 'denied') device = <p className="small">{t.notif.denied}</p>
  else
    device = (
      <div className="cluster">
        <button type="button" className={`btn ${on ? '' : 'btn--primary'}`} disabled={toggle.isPending} onClick={() => toggle.mutate()}>
          <Icon name="bell" />{on ? t.notif.disable : t.notif.enable}
        </button>
        {on && <span className="small" role="status">{t.notif.on}</span>}
      </div>
    )

  return (
    <div className="card">
      <h2><Icon name="bell" />{t.notif.title}</h2>
      <p>{t.notif.intro}</p>
      <ul className="small" style={{ margin: '0.25rem 0 0.75rem', paddingLeft: '1.1rem' }}>
        {t.notif.events.map((x) => <li key={x}>{x}</li>)}
      </ul>
      <p className="muted small">{t.notif.inApp}</p>
      <h3>{t.notif.deviceTitle}</h3>
      {device}
      {err && <div className="notice notice--err" role="alert" style={{ marginTop: '0.5rem' }}>{err}</div>}
      <div style={{ marginTop: '1rem' }}>
        <button type="button" className="btn btn--small" disabled={test.isPending} onClick={() => { setTested(false); test.mutate() }}>{t.notif.test}</button>
        {tested && <span className="small" role="status" style={{ marginLeft: '0.5rem' }}>{t.notif.tested}</span>}
      </div>
      <p className="muted small" style={{ marginTop: '1rem' }}>{t.notif.privacy}</p>
    </div>
  )
}
