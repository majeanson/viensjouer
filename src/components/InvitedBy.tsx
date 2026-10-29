import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { K } from '../lib/query'
import { useLang, useT } from '../i18n'
import { whenShort } from '../lib/format'
import type { Child } from '../lib/types'
import { Icon } from './Icon'

interface Host {
  hostName: string | null
  hostChild: string
  title: string | null
  startsAt: number | null
  token: string
  kind: 'rencontre' | 'circle'
}

// « Ils t'ont invité » on Amis: families that invited you (to a rencontre or into their circle) and are not in your circle yet, one tap
// to add them: the same link as « Lier nos familles » (they land in your book already linked, so you can invite back). Shows nothing when
// there is nobody to add.
export function InvitedBy() {
  const t = useT()
  const { lang } = useLang()
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['invited-by'], queryFn: () => api<{ hosts: Host[] }>('invited-by'), staleTime: 30_000 })
  const kids = useQuery({ queryKey: K.children, queryFn: () => api<{ children: Child[] }>('children') })
  const [childId, setChildId] = useState('')
  const children = kids.data?.children ?? []
  const add = useMutation({
    mutationFn: (token: string) => api('link-invitation', { method: 'POST', body: { code: token, ...(childId ? { childId } : {}) } }),
    onSuccess: () => {
      for (const k of [['invited-by'], K.families, K.circle, K.calendar]) void qc.invalidateQueries({ queryKey: k })
    },
  })
  const hosts = q.data?.hosts ?? []
  if (!hosts.length) return null
  const many = children.length > 1
  return (
    <section className="card" aria-label={t.invitedBy.title}>
      <h2><Icon name="mail" />{t.invitedBy.title}</h2>
      <p className="muted small">{t.invitedBy.hint}</p>
      {many && (
        <label className="field">
          <span>{t.link.pick}</span>
          <select className="input" value={childId} onChange={(e) => setChildId(e.target.value)}>
            <option value="">…</option>
            {children.map((c) => <option key={c.id} value={c.id}>{c.first_name}</option>)}
          </select>
        </label>
      )}
      {add.error && <div className="notice notice--err" role="alert">{add.error.message}</div>}
      {hosts.map((h) => (
        <div key={h.token} className="row linkrow">
          <span>
            <strong>{h.hostName ?? t.invitedBy.someone}</strong> <span className="muted small">· {h.hostChild}</span>
            <br />
            <span className="muted small">{h.kind === 'circle' ? t.invitedBy.circle : `${h.title ?? ''}${h.startsAt ? ` · ${whenShort(h.startsAt, lang)}` : ''}`}</span>
          </span>
          <button className="btn btn--small btn--primary" disabled={add.isPending || (many && !childId)} onClick={() => add.mutate(h.token)}>{t.invitedBy.add}</button>
        </div>
      ))}
    </section>
  )
}
