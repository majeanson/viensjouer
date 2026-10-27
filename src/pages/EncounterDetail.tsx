import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { K } from '../lib/query'
import { useAuth } from '../lib/auth'
import { useLang, useT } from '../i18n'
import { whenLong } from '../lib/format'
import { Face } from '../components/Face'
import { linkFor, linkLabel } from '../lib/link'
import type { Encounter, Family, Invitation, Message } from '../lib/types'

// The host's card: the plan, one link per family (copy / send), the thread, and the
// three verbs (confirm · cancel · delete).
export function EncounterDetail() {
  const { id = '' } = useParams()
  const t = useT()
  const { lang } = useLang()
  const { me } = useAuth()
  const nav = useNavigate()
  const qc = useQueryClient()
  const q = useQuery({ queryKey: K.encounter(id), queryFn: () => api<{ encounter: Encounter; invitations: Invitation[]; messages: Message[] }>(`encounters?id=${id}`), refetchInterval: 30_000 })
  const fams = useQuery({ queryKey: K.families, queryFn: () => api<{ families: Family[] }>('families') })
  const [copied, setCopied] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [addMore, setAddMore] = useState(false)
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: K.encounter(id) })
    void qc.invalidateQueries({ queryKey: K.encounters })
  }

  const patch = useMutation({ mutationFn: (body: Record<string, unknown>) => api('encounters', { method: 'PATCH', body: { id, ...body } }), onSuccess: refresh, onError: (e) => setErr(e.message) })
  const del = useMutation({ mutationFn: () => api('encounters', { method: 'DELETE', body: { id } }), onSuccess: () => { refresh(); nav('/rencontres', { replace: true }) }, onError: (e) => setErr(e.message) })
  const send = useMutation({ mutationFn: (invId: string) => api('invitations', { method: 'POST', body: { id: invId } }), onSuccess: refresh, onError: (e) => setErr(e.message) })
  const withdraw = useMutation({ mutationFn: (invId: string) => api('invitations', { method: 'DELETE', body: { id: invId } }), onSuccess: refresh, onError: (e) => setErr(e.message) })
  const message = useMutation({ mutationFn: (text: string) => api('messages', { method: 'POST', body: { encounterId: id, text } }), onSuccess: refresh, onError: (e) => setErr(e.message) })

  async function copy(token: string) {
    const link = linkFor(token)
    try {
      if (navigator.share && /iPhone|Android/i.test(navigator.userAgent)) {
        await navigator.share({ url: link })
        return
      }
      await navigator.clipboard.writeText(link)
      setCopied(token)
      setTimeout(() => setCopied(null), 1500)
    } catch {
      prompt(t.encounters.copy, link)
    }
  }

  function sendMsg(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = e.currentTarget
    const text = String(new FormData(f).get('text') ?? '').trim()
    if (!text) return
    message.mutate(text)
    f.reset()
  }

  if (q.isLoading) return <p className="muted">{t.common.loading}</p>
  if (!q.data) return <p className="notice notice--err">{t.common.error}</p>
  const { encounter: e, invitations, messages } = q.data
  const invited = new Set(invitations.map((i) => i.friend_family_id))
  const notYet = (fams.data?.families ?? []).filter((f) => !invited.has(f.id))

  return (
    <>
      <Link to="/rencontres" className="muted small">← {t.encounters.back}</Link>
      <div className="row" style={{ marginTop: '0.5rem' }}>
        <h1>{e.title}</h1>
        <span className="cluster"><span className="chip chip--kind">{t.encounters.kind[e.kind]}</span>{e.series_id && <span className="chip">{t.encounters.seriesChip}</span>}</span>
      </div>
      <p className="muted">{whenLong(e.starts_at, lang)}{e.place ? ` · ${e.place}` : ''} · {t.encounters.status[e.status]}</p>
      {e.note && <p>{e.note}</p>}
      {err && <div className="notice notice--err">{err}</div>}

      <div className="card">
        <h3>{t.encounters.links}</h3>
        {invitations.map((i) => (
          <div key={i.id} className="linkrow">
            <div className="row">
              <span className="cluster"><Face name={i.child_first_name} /><span><strong>{i.child_first_name}</strong> <span className="muted small">· {i.parent_name}</span></span></span>
              <span className={`chip ${i.reply ? `chip--${i.reply}` : ''}`}>{i.reply ? t.encounters.reply[i.reply] : t.encounters.reply.none}</span>
            </div>
            {i.reply_note && <p className="small" style={{ margin: 0 }}>« {i.reply_note} »</p>}
            <div className="paper" title={t.encounters.paperHint}>{linkLabel(i.token)}</div>
            <div className="cluster">
              <button className="btn" onClick={() => void copy(i.token)}>{copied === i.token ? t.encounters.copied : t.encounters.copy}</button>
              {me.mail && (i.email ? (
                <button className="btn" disabled={send.isPending} onClick={() => send.mutate(i.id)}>{i.sent_at ? t.encounters.resend : t.encounters.send}</button>
              ) : (
                <span className="muted small">{t.encounters.noEmail}</span>
              ))}
              <button className="btn btn--ghost btn--danger" onClick={() => withdraw.mutate(i.id)}>{t.encounters.withdraw}</button>
            </div>
          </div>
        ))}
        {notYet.length > 0 && (addMore ? (
          <div className="stack" style={{ marginTop: '0.75rem' }}>
            {notYet.map((f) => (
              <button key={f.id} className="btn" onClick={() => { patch.mutate({ invite: [f.id] }); setAddMore(false) }}><Face name={f.child_first_name} /> {f.child_first_name} · {f.parent_name}</button>
            ))}
          </div>
        ) : (
          <button className="btn btn--ghost" style={{ marginTop: '0.75rem' }} onClick={() => setAddMore(true)}>{t.encounters.addFamily}</button>
        ))}
      </div>

      <div className="card">
        <h3>{t.encounters.thread}</h3>
        {messages.map((m) => (
          <div key={m.id} className={`msg ${m.author_kind === 'host' ? 'msg--host' : ''}`}><b>{m.author_label}</b>{m.text}</div>
        ))}
        <form className="cluster" onSubmit={sendMsg} style={{ marginTop: '0.5rem' }}>
          <input className="input" name="text" placeholder={t.encounters.write} maxLength={1000} style={{ flex: '1 1 12rem' }} />
          <button className="btn" disabled={message.isPending}>{t.encounters.sendMsg}</button>
        </form>
      </div>

      <div className="cluster">
        {e.status === 'proposed' && <button className="btn btn--primary" onClick={() => patch.mutate({ status: 'confirmed' })}>{t.encounters.confirm}</button>}
        {e.status !== 'cancelled' && <button className="btn btn--danger" onClick={() => confirm(t.encounters.cancelConfirm) && patch.mutate({ status: 'cancelled' })}>{t.encounters.cancel}</button>}
        {e.series_id && e.status !== 'cancelled' && <button className="btn btn--danger" onClick={() => confirm(t.encounters.cancelSeriesConfirm) && patch.mutate({ status: 'cancelled', series: true })}>{t.encounters.cancelSeries}</button>}
        <button className="btn btn--ghost btn--danger" onClick={() => confirm(t.encounters.deleteConfirm) && del.mutate()}>{t.encounters.delete}</button>
      </div>
    </>
  )
}
