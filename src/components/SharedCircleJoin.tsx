import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { K } from '../lib/query'
import { useAuth } from '../lib/auth'
import { useT } from '../i18n'
import { Icon } from './Icon'

interface Info {
  state: 'member' | 'used' | 'full' | 'joinable'
  circleName: string
  children: { id: string; first_name: string }[]
}

// « Entrer dans le cercle » on a shared circle's door, for someone ALREADY signed in: one tap, a child picker when there are several.
// Joining links nobody; it only lets the circle's families see each other's first names and invite the whole circle.
export function SharedCircleJoin({ token }: { token: string }) {
  const t = useT()
  const qc = useQueryClient()
  const { me } = useAuth()
  const [childId, setChildId] = useState<string | null>(null)
  const q = useQuery({ queryKey: ['shared-join', token], queryFn: () => api<Info>(`shared-circle-join?code=${token}`), enabled: me.signedIn && !me.demo, retry: false })
  const go = useMutation({
    mutationFn: () => api('shared-circle-join', { method: 'POST', body: { code: token, ...(childId ? { childId } : {}) } }),
    onSuccess: () => {
      for (const k of [['shared-join', token], K.sharedCircles, K.children]) void qc.invalidateQueries({ queryKey: k })
    },
  })
  const i = q.data
  // An answer without a state (an old or odd reply) shows nothing rather than a broken page.
  if (!me.signedIn || me.demo || !i?.state) return null
  const kids = i.children ?? []
  if (i.state === 'member')
    return (
      <p className="small" style={{ margin: '0.75rem 0' }} role="status">
        <Icon name="check" />{t.shared.joined} <Link to="/amis">{t.shared.see}</Link>
      </p>
    )
  if (i.state === 'used') return <div className="notice" role="status">{t.circleDoor.used}</div>
  if (i.state === 'full') return <div className="notice" role="status">{t.shared.full}</div>
  const many = kids.length > 1
  return (
    <section className="card" aria-label={t.shared.join}>
      {many && (
        <label className="field">
          <span>{t.shared.forWhich}</span>
          <select className="input" value={childId ?? ''} onChange={(e) => setChildId(e.target.value || null)}>
            <option value="">…</option>
            {kids.map((c) => <option key={c.id} value={c.id}>{c.first_name}</option>)}
          </select>
        </label>
      )}
      {go.error && <div className="notice notice--err" role="alert">{go.error.message}</div>}
      <button className="btn btn--primary btn--big" disabled={go.isPending || (many && !childId)} onClick={() => go.mutate()}><Icon name="users" />{t.shared.join}</button>
    </section>
  )
}
