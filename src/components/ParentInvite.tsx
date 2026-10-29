import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { useT } from '../i18n'
import { Icon } from './Icon'

// « L'autre parent » — a one-use link that adds a second parent (own email and password) to
// this household. Hidden in a trial: a sandbox is swept after a day.
export function ParentInvite() {
  const t = useT()
  const { me } = useAuth()
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['parent-invites'], queryFn: () => api<{ invites: { id: string; token: string }[] }>('parent-invite'), enabled: !me.demo })
  const [copied, setCopied] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const refresh = () => qc.invalidateQueries({ queryKey: ['parent-invites'] })
  const make = useMutation({ mutationFn: () => api('parent-invite', { method: 'POST' }), onSuccess: () => void refresh(), onError: (e) => setErr(e.message) })
  const drop = useMutation({ mutationFn: (id: string) => api('parent-invite', { method: 'DELETE', body: { id } }), onSuccess: () => void refresh() })
  if (me.demo) return null
  const link = (token: string) => `${location.origin}/rejoindre?t=${token}`
  async function copy(token: string) {
    try {
      await navigator.clipboard.writeText(link(token))
      setCopied(token)
      setTimeout(() => setCopied(null), 1500)
    } catch {
      prompt(t.encounters.copy, link(token))
    }
  }
  return (
    <section style={{ marginTop: '1.5rem' }}>
      <h2><Icon name="users" />{t.parent.title}</h2>
      <p className="muted small">{t.parent.hint}</p>
      {err && <div className="notice notice--err">{err}</div>}
      {(q.data?.invites ?? []).map((i) => (
        <div key={i.id} className="card">
          <div className="paper">{link(i.token)}</div>
          <p className="muted small">{t.parent.expires}</p>
          <div className="cluster">
            <button className="btn" onClick={() => void copy(i.token)}>{copied === i.token ? t.encounters.copied : t.encounters.copy}</button>
            <button className="btn btn--danger" onClick={() => drop.mutate(i.id)}>{t.parent.withdraw}</button>
          </div>
        </div>
      ))}
      <button className="btn" onClick={() => { setErr(null); make.mutate() }} disabled={make.isPending}>{t.parent.make}</button>
    </section>
  )
}
