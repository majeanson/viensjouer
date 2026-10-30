import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { K } from '../lib/query'
import { useLang, useT } from '../i18n'
import { ago } from '../lib/format'
import { Icon } from './Icon'

const listStyle = { listStyle: 'none', margin: '0.5rem 0 0', padding: 0 } as const

interface Note {
  id: string
  kind: string
  title: string
  body: string | null
  url: string | null
  created_at: number
  read_at?: number | null
}

// The bell in the header: what happened that you have not seen (someone invited you, a rencontre changed, a family answered, a
// reminder), unread first, then what you already read in the last 30 days so nothing has to be caught in the moment. A dot, never a
// number (calm). It needs no permission and no email: it is the same list the phone notification is made from. A tap opens the thing
// and marks it read.
export function NotificationBell() {
  const t = useT()
  const { lang } = useLang()
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const q = useQuery({ queryKey: K.notificationsAll, queryFn: () => api<{ notifications: Note[] }>('notifications?all=1'), refetchInterval: 60_000 })
  const read = useMutation({
    mutationFn: (b: { id?: string; readAll?: boolean }) => api('notifications', { method: 'POST', body: b }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: K.notifications }),
  })

  // Closes on Escape and on a tap anywhere else.
  useEffect(() => {
    if (!open) return
    const away = (e: Event) => { if (!box.current?.contains(e.target as Node)) setOpen(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('pointerdown', away)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('pointerdown', away)
      document.removeEventListener('keydown', esc)
    }
  }, [open])

  const items = q.data?.notifications ?? []
  const fresh = items.filter((n) => !n.read_at)
  const before = items.filter((n) => n.read_at)
  const label = fresh.length > 0 ? `${t.notif.title} · ${t.notif.hasNew}` : t.notif.title

  const row = (n: Note) => {
    const head = (
      <>
        <strong>{n.title}</strong> <span className="muted small">{ago(n.created_at, lang)}</span>
      </>
    )
    return (
      <li key={n.id} className={`linkrow ${n.read_at ? '' : 'bell--new'}`}>
        {n.url ? <Link to={n.url} onClick={() => { setOpen(false); if (!n.read_at) read.mutate({ id: n.id }) }}>{head}</Link> : <span>{head}</span>}
        {n.body && <p className="muted small" style={{ margin: 0 }}>{n.body}</p>}
      </li>
    )
  }

  return (
    <div className="bell" ref={box}>
      <button type="button" className="tool tool--icon bell__btn" aria-label={label} title={label} aria-expanded={open} aria-controls="bell-panel" onClick={() => setOpen((o) => !o)}>
        <Icon name="bell" />
        {fresh.length > 0 && <i className="bell__dot" aria-hidden="true" />}
      </button>
      {open && (
        <section id="bell-panel" className="bell__panel" aria-label={t.notif.title}>
          <div className="row">
            <h2 style={{ margin: 0 }}>{t.notif.title}</h2>
            {fresh.length > 0 && <button type="button" className="btn btn--small" onClick={() => read.mutate({ readAll: true })}>{t.notif.readAll}</button>}
          </div>
          {items.length === 0 && <p className="muted">{t.notif.none}</p>}
          {fresh.length > 0 && <ul className="list" style={listStyle} aria-label={t.notif.newTitle}>{fresh.map(row)}</ul>}
          {before.length > 0 && (
            <>
              <h3 className="muted small" style={{ margin: '0.9rem 0 0' }}>{t.notif.earlier}</h3>
              <ul className="list" style={listStyle}>{before.map(row)}</ul>
            </>
          )}
        </section>
      )}
    </div>
  )
}
