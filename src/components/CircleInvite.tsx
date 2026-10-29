import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { useT } from '../i18n'
import { linkFor, linkLabel } from '../lib/link'
import type { Child, Family } from '../lib/types'
import { K } from '../lib/query'
import { Icon } from './Icon'

interface Open {
  id: string
  familyId: string
  token: string
}

// « Inviter dans mon cercle » on a family of the book that is not linked yet: a code with NO rencontre behind it. Nothing is sent by
// itself; the host picks how it travels, and each way is said in one plain line: email, text, or the two words on paper. The family
// opens the code (the same door as a rencontre card), makes an account or signs in, and the two households are linked.
export function CircleInvite({ family }: { family: Family }) {
  const t = useT()
  const qc = useQueryClient()
  const { me } = useAuth()
  const open = useQuery({ queryKey: ['circle-invites'], queryFn: () => api<{ invites: Open[] }>('circle-invite'), staleTime: 20_000 })
  const kids = useQuery({ queryKey: K.children, queryFn: () => api<{ children: Child[] }>('children') })
  const [childId, setChildId] = useState('')
  const [note, setNote] = useState<string | null>(null)
  const children = kids.data?.children ?? []
  const mine = (open.data?.invites ?? []).find((i) => i.familyId === family.id)
  const many = children.length > 1
  const refresh = () => qc.invalidateQueries({ queryKey: ['circle-invites'] })

  const make = useMutation({
    mutationFn: (send: boolean) => api<{ token: string; sent: boolean }>('circle-invite', { method: 'POST', body: { familyId: family.id, send, ...(childId ? { childId } : {}) } }),
    onSuccess: (r) => {
      setNote(r.sent ? t.circleInvite.sent : null)
      void refresh()
    },
    onError: (e: Error) => setNote(e.message),
  })
  const withdraw = useMutation({
    mutationFn: (id: string) => api('circle-invite', { method: 'DELETE', body: { id } }),
    onSuccess: () => {
      setNote(null)
      void refresh()
    },
  })

  const canMail = !!me.mail && !!family.email && !family.email_bounced_at && !family.mail_stopped_at
  async function share(token: string) {
    const text = t.circleInvite.message(family.parent_name, me.displayName ?? '', family.child_first_name, linkFor(token))
    try {
      if (navigator.share && /iPhone|Android/i.test(navigator.userAgent)) await navigator.share({ text })
      else {
        await navigator.clipboard.writeText(text)
        setNote(t.encounters.copied)
      }
    } catch {
      /* closed the share sheet */
    }
  }

  return (
    <details className="more" style={{ marginTop: '0.5rem' }}>
      <summary>{t.circleInvite.open}</summary>
      <div className="stack">
        <p className="muted small" style={{ margin: 0 }}>{t.circleInvite.what}</p>
        {many && !mine && (
          <label className="field">
            <span>{t.circleInvite.forWhich}</span>
            <select className="input" value={childId} onChange={(e) => setChildId(e.target.value)}>
              <option value="">…</option>
              {children.map((c) => <option key={c.id} value={c.id}>{c.first_name}</option>)}
            </select>
          </label>
        )}
        {!mine ? (
          <div>
            <button className="btn btn--primary btn--small" disabled={make.isPending || (many && !childId)} onClick={() => make.mutate(false)}><Icon name="heart" />{t.circleInvite.make}</button>
          </div>
        ) : (
          <>
            <div>
              <p className="muted small" style={{ margin: '0 0 0.25rem' }}>{t.circleInvite.paper}</p>
              <div className="paper" title={t.encounters.paperHint}>{linkLabel(mine.token)}</div>
            </div>
            <div className="cluster">
              {canMail && <button className="btn btn--small btn--primary" disabled={make.isPending} onClick={() => make.mutate(true)}><Icon name="mail" />{t.encounters.send}</button>}
              <button className={`btn btn--small ${canMail ? '' : 'btn--primary'}`} onClick={() => void share(mine.token)}><Icon name="share" />{t.encounters.byText}</button>
              <button className="btn btn--small btn--danger" disabled={withdraw.isPending} onClick={() => withdraw.mutate(mine.id)}>{t.circleInvite.withdraw}</button>
            </div>
            <p className="muted small" style={{ margin: 0 }}>{canMail ? t.circleInvite.waysMail : t.circleInvite.waysNoMail}</p>
          </>
        )}
        {note && <p className="small" role="status" style={{ margin: 0 }}>{note}</p>}
      </div>
    </details>
  )
}
