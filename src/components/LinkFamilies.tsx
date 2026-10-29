import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { K } from '../lib/query'
import { useAuth } from '../lib/auth'
import { useT } from '../i18n'
import { Icon } from './Icon'

interface Info {
  state: 'own' | 'linked' | 'taken' | 'linkable'
  hostName: string | null
  hostChild: string
  familyChild: string
  children: { id: string; first_name: string }[]
}

// « Lier nos familles » on an invitation page, for someone who is ALREADY signed in with an account of their own: one tap links the
// two households (each in the other's circle, this rencontre in the agenda, a way to invite back). Shown only when it applies: not
// to the host of this rencontre, not to a family already linked to another account, not to someone with no account.
export function LinkFamilies({ token }: { token: string }) {
  const t = useT()
  const qc = useQueryClient()
  const { me } = useAuth()
  const [childId, setChildId] = useState<string | null>(null)
  const q = useQuery({ queryKey: ['link', token], queryFn: () => api<Info>(`link-invitation?code=${token}`), enabled: me.signedIn && !me.demo, retry: false })
  const link = useMutation({
    mutationFn: () => api('link-invitation', { method: 'POST', body: { code: token, ...(childId ? { childId } : {}) } }),
    onSuccess: () => {
      for (const k of [['link', token], K.calendar, K.circle, K.families, K.encounters]) void qc.invalidateQueries({ queryKey: k })
    },
  })
  const i = q.data
  if (!me.signedIn || me.demo || !i || i.state === 'own' || i.state === 'taken') return null
  if (i.state === 'linked')
    return (
      <p className="small" style={{ margin: '0.75rem 0' }}>
        <Icon name="check" />{link.isSuccess ? t.link.done : t.link.already} <Link to="/rencontres">{t.link.agenda}</Link>
      </p>
    )
  const many = i.children.length > 1
  return (
    <section className="card" aria-label={t.link.title}>
      <h2><Icon name="heart" />{t.link.title}</h2>
      <p className="muted small">{t.link.hint(i.hostName ?? '', i.hostChild)}</p>
      {many && (
        <label className="field">
          <span>{t.link.pick}</span>
          <select className="input" value={childId ?? ''} onChange={(e) => setChildId(e.target.value || null)}>
            <option value="">…</option>
            {i.children.map((c) => <option key={c.id} value={c.id}>{c.first_name}</option>)}
          </select>
        </label>
      )}
      {link.error && <div className="notice notice--err" role="alert">{link.error.message}</div>}
      <button className="btn btn--primary" disabled={link.isPending || (many && !childId)} onClick={() => link.mutate()}>{t.link.go}</button>
    </section>
  )
}
