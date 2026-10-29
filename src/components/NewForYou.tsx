import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { K } from '../lib/query'
import { useT } from '../i18n'
import { Icon } from './Icon'

interface Note {
  id: string
  kind: string
  title: string
  body: string | null
  url: string | null
}

// « Nouveau » on Rencontres: what happened that you have not seen (someone invited you, a rencontre changed, a family answered,
// a reminder). It needs no permission and no email: it is the same list the phone notification is made from, so an account that
// never allowed notifications still finds the news here. A tap opens the thing and marks it read.
export function NewForYou() {
  const t = useT()
  const qc = useQueryClient()
  const q = useQuery({ queryKey: K.notifications, queryFn: () => api<{ notifications: Note[] }>('notifications'), refetchInterval: 60_000 })
  const read = useMutation({
    mutationFn: (b: { id?: string; readAll?: boolean }) => api('notifications', { method: 'POST', body: b }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: K.notifications }),
  })
  const items = q.data?.notifications ?? []
  if (!items.length) return null
  return (
    <section className="card" aria-label={t.notif.newTitle}>
      <div className="row">
        <h2 style={{ margin: 0 }}><Icon name="bell" />{t.notif.newTitle}</h2>
        <button type="button" className="btn btn--small" onClick={() => read.mutate({ readAll: true })}>{t.notif.readAll}</button>
      </div>
      <ul className="list" style={{ listStyle: 'none', margin: '0.5rem 0 0', padding: 0 }}>
        {items.map((n) => (
          <li key={n.id} className="linkrow">
            {n.url ? <Link to={n.url} onClick={() => read.mutate({ id: n.id })}><strong>{n.title}</strong></Link> : <strong>{n.title}</strong>}
            {n.body && <p className="muted small" style={{ margin: 0 }}>{n.body}</p>}
          </li>
        ))}
      </ul>
    </section>
  )
}
