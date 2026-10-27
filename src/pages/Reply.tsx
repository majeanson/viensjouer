import { useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, isStatus } from '../lib/api'
import { K } from '../lib/query'
import { useLang, useT } from '../i18n'
import { whenLong } from '../lib/format'
import type { Encounter, Message, Reply as ReplyKind } from '../lib/types'

interface Card {
  alive: boolean
  encounter: Omit<Encounter, 'address'> & { address: string | null }
  host: { child_first_name: string; parent_name: string; household_name: string; tz: string }
  you: { parent_name: string; email: string | null; phone: string | null; child_first_name: string; allergies: string | null; reply: ReplyKind | null; replyNote: string | null }
  messages: Message[]
}

// THE install-free page. A parent opens it from a text, sees the plan, answers in one
// tap, leaves their details once. No account, no app, no cookie.
export function Reply() {
  // `/r/<code>` or the paper spelling `/<xxxx-xxxx>`; the API forgives the hyphen.
  const { token = '' } = useParams()
  const t = useT()
  const { lang, setLang } = useLang()
  const qc = useQueryClient()
  const q = useQuery({ queryKey: K.reply(token), queryFn: () => api<Card>(`r/${token}`), retry: false, refetchInterval: 30_000 })
  const [reply, setReply] = useState<ReplyKind | null>(null)
  const [editing, setEditing] = useState(false)
  const [done, setDone] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const post = useMutation({
    mutationFn: (body: Record<string, unknown>) => api(`r/${token}`, { method: 'POST', body }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: K.reply(token) })
      setErr(null)
    },
    onError: (e) => setErr(e.message),
  })

  if (q.isLoading) return <p className="shell muted">{t.common.loading}</p>
  if (!q.data) return <div className="shell"><p className="notice notice--err">{isStatus(q.error, 404) ? t.reply.dead : t.common.error}</p></div>
  const { encounter: e, host, you, messages, alive } = q.data
  const chosen = reply ?? you.reply
  const answered = you.reply !== null && !editing

  function submit(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault()
    if (!chosen) return
    const f = new FormData(ev.currentTarget)
    const body: Record<string, unknown> = { reply: chosen, note: f.get('note') || null }
    for (const k of ['parentName', 'email', 'phone', 'allergies'] as const) {
      const v = String(f.get(k) ?? '').trim()
      if (v) body[k] = v
    }
    post.mutate(body, { onSuccess: () => { setDone(true); setEditing(false) } })
  }

  function sendMsg(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault()
    const f = ev.currentTarget
    const text = String(new FormData(f).get('text') ?? '').trim()
    if (!text) return
    post.mutate({ message: text })
    f.reset()
  }

  return (
    <div className="shell">
      <header className="topbar">
        <span className="brand"><i />{t.appName}</span>
        <button className="btn btn--ghost" onClick={() => setLang(lang === 'fr' ? 'en' : 'fr')}>{t.common.lang}</button>
      </header>

      <div className="card">
        <span className="chip chip--kind">{t.encounters.kind[e.kind]}</span>
        <h1 style={{ marginTop: '0.5rem' }}>{t.reply.invites(host.child_first_name, you.child_first_name)}</h1>
        <p className="muted">{t.reply.from(host.parent_name || host.household_name)}</p>
        <h2>{e.title}</h2>
        <p><strong>{whenLong(e.starts_at, lang)}</strong>{e.ends_at ? ` → ${whenLong(e.ends_at, lang)}` : ''}</p>
        {e.place && <p>{e.place}</p>}
        {e.address ? <p>{e.address}</p> : e.kind !== 'park' && <p className="muted small">{t.reply.addressOnYes}</p>}
        {e.note && <p className="muted">{e.note}</p>}
        {e.status === 'cancelled' && <div className="notice notice--err">{t.encounters.status.cancelled}</div>}
        <a className="btn" href={`/api/r/${token}/ics`} download="rencontre.ics">{t.reply.calendar}</a>
      </div>

      {!alive ? (
        <div className="notice">{t.reply.closed}</div>
      ) : answered ? (
        <div className="card">
          {done && <div className="notice">{t.reply.saved}</div>}
          <div className="row">
            <span><span className="muted small">{t.reply.yourReply}</span><br /><strong className={`chip chip--${you.reply}`}>{t.encounters.reply[you.reply!]}</strong>{you.replyNote && <span className="small"> · « {you.replyNote} »</span>}</span>
            <button className="btn btn--ghost" onClick={() => setEditing(true)}>{t.reply.change}</button>
          </div>
        </div>
      ) : (
        <form className="card" onSubmit={submit}>
          <h3>{t.reply.question}</h3>
          <div className="stack">
            <button type="button" className={`btn btn--big ${chosen === 'yes' ? 'btn--yes' : ''}`} onClick={() => setReply('yes')}>{t.reply.yes}</button>
            <div className="seg">
              <button type="button" className={`btn ${chosen === 'maybe' ? 'btn--on' : ''}`} onClick={() => setReply('maybe')}>{t.reply.maybe}</button>
              <button type="button" className={`btn ${chosen === 'no' ? 'btn--on' : ''}`} onClick={() => setReply('no')}>{t.reply.no}</button>
            </div>
          </div>
          <label className="field" style={{ marginTop: '0.75rem' }}><span>{t.reply.note}</span><input className="input" name="note" maxLength={500} placeholder={t.reply.notePlaceholder} defaultValue={you.replyNote ?? ''} /></label>
          <h3 style={{ marginTop: '1rem' }}>{t.reply.you}</h3>
          <p className="muted small">{t.reply.youHint}</p>
          <label className="field"><span>{t.reply.parentName}</span><input className="input" name="parentName" maxLength={60} defaultValue={you.parent_name} autoComplete="given-name" /></label>
          <label className="field"><span>{t.reply.email}</span><input className="input" name="email" type="email" defaultValue={you.email ?? ''} autoComplete="email" /></label>
          <label className="field"><span>{t.reply.phone}</span><input className="input" name="phone" type="tel" defaultValue={you.phone ?? ''} autoComplete="tel" /></label>
          <label className="field"><span>{t.reply.allergies}</span><input className="input" name="allergies" maxLength={300} defaultValue={you.allergies ?? ''} /></label>
          {err && <div className="notice notice--err">{err}</div>}
          <button className="btn btn--primary btn--big" disabled={!chosen || post.isPending}>{t.reply.send}</button>
        </form>
      )}

      <div className="card">
        <h3>{t.reply.thread}</h3>
        {messages.map((m) => (
          <div key={m.id} className={`msg ${m.author_kind === 'host' ? 'msg--host' : ''}`}><b>{m.author_label}</b>{m.text}</div>
        ))}
        {alive && (
          <form className="cluster" onSubmit={sendMsg} style={{ marginTop: '0.5rem' }}>
            <input className="input" name="text" placeholder={t.reply.write} maxLength={1000} style={{ flex: '1 1 12rem' }} />
            <button className="btn" disabled={post.isPending}>{t.reply.sendMsg}</button>
          </form>
        )}
      </div>

      <footer className="footer muted small">
        <p>{t.reply.footer}</p>
        <Link to="/" className="btn btn--ghost">{t.reply.create}</Link>
      </footer>
    </div>
  )
}
