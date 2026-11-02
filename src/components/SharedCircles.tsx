import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { K } from '../lib/query'
import { useAuth } from '../lib/auth'
import { useT } from '../i18n'
import { linkFor, linkLabel } from '../lib/link'
import { useDeferredRemove } from '../lib/toast'
import type { Child, Family, SharedCircle } from '../lib/types'
import { Icon } from './Icon'

// « Cercles partagés » on Amis (migration 0025): named circles of several families. Each circle is a CLOSED row (its name, one grey line
// of the children's first names); open, it shows who is in it (first names only), « Inviter une famille » from MY book (a code, the
// same three ways as everywhere: email, text, paper), « Renommer » and « Quitter le cercle » (6 s undo). Nothing more is known of
// another member: no face, no email, no phone.
export function SharedCircles({ families }: { families: Family[] }) {
  const t = useT()
  const qc = useQueryClient()
  const q = useQuery({ queryKey: K.sharedCircles, queryFn: () => api<{ circles: SharedCircle[] }>('shared-circles') })
  const kids = useQuery({ queryKey: K.children, queryFn: () => api<{ children: Child[] }>('children') })
  const rm = useDeferredRemove()
  const [starting, setStarting] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const refresh = () => qc.invalidateQueries({ queryKey: K.sharedCircles })
  const children = kids.data?.children ?? []
  const start = useMutation({
    mutationFn: (body: Record<string, unknown>) => api('shared-circles', { method: 'POST', body }),
    onSuccess: () => {
      setStarting(false)
      setErr(null)
      void refresh()
    },
    onError: (e: Error) => setErr(e.message),
  })
  const circles = rm.visible(q.data?.circles ?? [])
  const leave = (c: SharedCircle) => rm.remove(c.id, t.shared.left, async () => { await api('shared-circles', { method: 'DELETE', body: { id: c.id } }); void refresh(); void qc.invalidateQueries({ queryKey: K.calendar }) })

  return (
    <section style={{ marginTop: '1.5rem' }}>
      <h2><Icon name="users" />{t.shared.title}</h2>
      {circles.length === 0 && <p className="muted small">{t.shared.hint}</p>}
      <div className="stack">
        {circles.map((c) => <CircleRow key={c.id} circle={c} families={families} onLeave={() => leave(c)} />)}
      </div>
      {starting ? (
        <form
          className="card"
          style={{ marginTop: '0.75rem' }}
          onSubmit={(e) => {
            e.preventDefault()
            const f = new FormData(e.currentTarget)
            start.mutate({ name: f.get('name'), ...(f.get('childId') ? { childId: f.get('childId') } : {}) })
          }}
        >
          <label className="field"><span><Icon name="tag" />{t.shared.name}</span><input className="input" name="name" required maxLength={60} placeholder={t.shared.namePlaceholder} /></label>
          {children.length > 1 && (
            <label className="field">
              <span>{t.shared.forWhich}</span>
              <select className="input" name="childId" required defaultValue="">
                <option value="">…</option>
                {children.map((k) => <option key={k.id} value={k.id}>{k.first_name}</option>)}
              </select>
            </label>
          )}
          {err && <div className="notice notice--err" role="alert">{err}</div>}
          <div className="cluster">
            <button className="btn btn--primary" disabled={start.isPending}><Icon name="plus" />{t.shared.start}</button>
            <button type="button" className="btn" onClick={() => setStarting(false)}>{t.encounters.back}</button>
          </div>
        </form>
      ) : (
        <button type="button" className="btn btn--small" style={{ marginTop: '0.75rem' }} onClick={() => setStarting(true)}><Icon name="plus" />{t.shared.start}</button>
      )}
    </section>
  )
}

function CircleRow({ circle: c, families, onLeave }: { circle: SharedCircle; families: Family[]; onLeave: () => void }) {
  const t = useT()
  const qc = useQueryClient()
  const { me } = useAuth()
  const [familyId, setFamilyId] = useState('')
  const [renaming, setRenaming] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const refresh = () => qc.invalidateQueries({ queryKey: K.sharedCircles })
  const inCircle = new Set(c.members.map((m) => m.familyId).filter(Boolean))
  // My book's families that are not in this circle yet and have no open code for it.
  const pending = new Set(c.invites.map((i) => i.familyId))
  const candidates = families.filter((f) => !inCircle.has(f.id) && !pending.has(f.id))
  const make = useMutation({
    mutationFn: (p: { familyId: string; send: boolean }) => api<{ sent: boolean }>('shared-circle-invite', { method: 'POST', body: { circleId: c.id, ...p } }),
    onSuccess: (r) => {
      setNote(r.sent ? t.circleInvite.sent : null)
      setFamilyId('')
      void refresh()
    },
    onError: (e: Error) => setNote(e.message),
  })
  const withdraw = useMutation({
    mutationFn: (id: string) => api('shared-circle-invite', { method: 'DELETE', body: { id } }),
    onSuccess: () => void refresh(),
  })
  const rename = useMutation({
    mutationFn: (name: string) => api('shared-circles', { method: 'PATCH', body: { id: c.id, name } }),
    onSuccess: () => {
      setRenaming(false)
      void refresh()
    },
    onError: (e: Error) => setNote(e.message),
  })
  const famOf = (id: string) => families.find((f) => f.id === id)
  async function share(token: string, f: Family | undefined) {
    const text = t.shared.message(f?.parent_name ?? '', me.displayName ?? '', c.name, linkFor(token))
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
    <details className="card friend" style={{ marginBottom: 0 }}>
      <summary>
        <span className="friend__who">
          <strong><Icon name="users" />{c.name}</strong>
          <span className="muted small">{c.members.map((m) => m.childName).join(', ')}</span>
        </span>
      </summary>
      <div className="stack" style={{ marginTop: '0.75rem' }}>
        <ul className="meta">
          {c.members.map((m) => <li key={m.key}><Icon name="smile" />{m.childName} · {m.me ? t.shared.you : m.parentName}</li>)}
        </ul>

        <details className="more">
          <summary>{t.shared.invite}</summary>
          <div className="stack">
            <p className="muted small" style={{ margin: 0 }}>{t.shared.inviteWhat}</p>
            {candidates.length > 0 ? (
              <div className="cluster">
                <label className="field" style={{ margin: 0 }}>
                  <span>{t.shared.pickFamily}</span>
                  <select className="input" value={familyId} onChange={(e) => setFamilyId(e.target.value)}>
                    <option value="">…</option>
                    {candidates.map((f) => <option key={f.id} value={f.id}>{f.child_first_name} · {f.parent_name}</option>)}
                  </select>
                </label>
                <button className="btn btn--primary btn--small" disabled={!familyId || make.isPending} onClick={() => make.mutate({ familyId, send: false })}><Icon name="heart" />{t.shared.make}</button>
              </div>
            ) : (
              c.invites.length === 0 && <p className="muted small" style={{ margin: 0 }}>{t.shared.noFamily}</p>
            )}
            {c.invites.length > 0 && <p className="muted small" style={{ margin: 0 }}>{t.shared.waiting}</p>}
            {c.invites.map((i) => {
              const f = famOf(i.familyId)
              const canMail = !!me.mail && !!f?.email && !f.email_bounced_at && !f.mail_stopped_at
              return (
                <div key={i.id} className="stack">
                  <strong className="small">{f ? `${f.child_first_name} · ${f.parent_name}` : ''}</strong>
                  <div className="paper" title={t.encounters.paperHint}>{linkLabel(i.token)}</div>
                  <div className="cluster">
                    {canMail && <button className="btn btn--small btn--primary" disabled={make.isPending} onClick={() => make.mutate({ familyId: i.familyId, send: true })}><Icon name="mail" />{t.encounters.send}</button>}
                    <button className={`btn btn--small ${canMail ? '' : 'btn--primary'}`} onClick={() => void share(i.token, f)}><Icon name="share" />{t.encounters.byText}</button>
                    <button className="btn btn--small btn--danger" disabled={withdraw.isPending} onClick={() => withdraw.mutate(i.id)}>{t.circleInvite.withdraw}</button>
                  </div>
                </div>
              )
            })}
            {note && <p className="small" role="status" style={{ margin: 0 }}>{note}</p>}
          </div>
        </details>

        {renaming ? (
          <form className="cluster" onSubmit={(e) => { e.preventDefault(); rename.mutate(String(new FormData(e.currentTarget).get('name') ?? '')) }}>
            <label className="field" style={{ margin: 0 }}><span>{t.shared.name}</span><input className="input" name="name" required maxLength={60} defaultValue={c.name} /></label>
            <button className="btn btn--small btn--primary" disabled={rename.isPending}>{t.shared.save}</button>
          </form>
        ) : (
          <div className="cluster">
            <button className="btn btn--small" onClick={() => setRenaming(true)}><Icon name="edit" />{t.shared.rename}</button>
            <button className="btn btn--small btn--danger" onClick={onLeave}>{t.shared.leave}</button>
          </div>
        )}
      </div>
    </details>
  )
}
