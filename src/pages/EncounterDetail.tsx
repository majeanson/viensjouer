import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { K } from '../lib/query'
import { useAuth } from '../lib/auth'
import { useLang, useT } from '../i18n'
import { timeOnly, whenLong } from '../lib/format'
import { linkFor, linkLabel } from '../lib/link'
import { PhotoGrid } from '../components/PhotoGrid'
import { Why } from '../components/Why'
import { kidsComing } from '../lib/scope'
import type { Encounter, Family, Invitation, Message, Relais, Souvenir } from '../lib/types'

interface Detail {
  encounter: Encounter & { details: Record<string, string>; hereOpen: boolean }
  invitations: Invitation[]
  messages: Message[]
  relais: Relais[]
  souvenirs: Souvenir[]
}

// The host's card: the plan, one link per family (copy / send), what each kind adds (the
// park's « on y est », the birthday's RSVP, the home's relais note), the day's photos, the
// thread, and the three verbs (confirm · cancel · delete).
export function EncounterDetail() {
  const { id = '' } = useParams()
  const t = useT()
  const { lang } = useLang()
  const { me } = useAuth()
  const nav = useNavigate()
  const qc = useQueryClient()
  const q = useQuery({ queryKey: K.encounter(id), queryFn: () => api<Detail>(`encounters?id=${id}`), refetchInterval: 30_000 })
  const fams = useQuery({ queryKey: K.families, queryFn: () => api<{ families: Family[] }>('families') })
  const health = useQuery({ queryKey: ['health'], queryFn: () => api<{ photos: boolean }>('health'), staleTime: 60_000 })
  const [copied, setCopied] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [addMore, setAddMore] = useState(false)
  const [relaisFor, setRelaisFor] = useState<string | null>(null)
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: K.encounter(id) })
    void qc.invalidateQueries({ queryKey: K.encounters })
    void qc.invalidateQueries({ queryKey: K.calendar })
  }
  const fail = (e: Error) => setErr(e.message)

  const patch = useMutation({ mutationFn: (body: Record<string, unknown>) => api('encounters', { method: 'PATCH', body: { id, ...body } }), onSuccess: refresh, onError: fail })
  const del = useMutation({ mutationFn: () => api('encounters', { method: 'DELETE', body: { id } }), onSuccess: () => { refresh(); nav('/rencontres', { replace: true }) }, onError: fail })
  const send = useMutation({ mutationFn: (invId: string) => api('invitations', { method: 'POST', body: { id: invId } }), onSuccess: refresh, onError: fail })
  const setScope = useMutation({ mutationFn: (b: { id: string; scope: 'friend' | 'family' }) => api('invitations', { method: 'PATCH', body: b }), onSuccess: refresh, onError: fail })
  const withdraw = useMutation({ mutationFn: (invId: string) => api('invitations', { method: 'DELETE', body: { id: invId } }), onSuccess: refresh, onError: fail })
  const message = useMutation({ mutationFn: (text: string) => api('messages', { method: 'POST', body: { encounterId: id, text } }), onSuccess: refresh, onError: fail })
  const relaisSave = useMutation({
    mutationFn: (body: Record<string, unknown>) => api('relais', { method: 'POST', body }),
    onSuccess: () => {
      setRelaisFor(null)
      refresh()
    },
    onError: fail,
  })
  const relaisDel = useMutation({ mutationFn: (invitationId: string) => api('relais', { method: 'DELETE', body: { invitationId } }), onSuccess: refresh, onError: fail })
  const photoDel = useMutation({ mutationFn: (pid: string) => api('souvenirs', { method: 'DELETE', body: { id: pid } }), onSuccess: refresh, onError: fail })

  // The ready-to-send message: what the invitation is, who it is for, and the short link. Shared
  // with the phone's own share sheet (texto, WhatsApp…) or copied when there is none.
  async function shareMessage(i: Invitation) {
    const text = t.share.message({ parent: i.parent_name, host: me.displayName ?? '', friend: i.child_first_name, title: e.title, when: whenLong(e.starts_at, lang), scope: i.scope, link: linkFor(i.token) })
    try {
      if (navigator.share && /iPhone|Android/i.test(navigator.userAgent)) {
        await navigator.share({ text })
        return
      }
      await navigator.clipboard.writeText(text)
      setCopied('s' + i.id)
      setTimeout(() => setCopied(null), 1500)
    } catch {
      prompt(t.share.button, text)
    }
  }

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

  function submitRelais(e: FormEvent<HTMLFormElement>, invitationId: string) {
    e.preventDefault()
    relaisSave.mutate({ invitationId, ...Object.fromEntries(new FormData(e.currentTarget).entries()) })
  }

  if (q.isLoading) return <p className="muted">{t.common.loading}</p>
  if (!q.data) return <p className="notice notice--err">{t.common.error}</p>
  const { encounter: e, invitations, messages, relais, souvenirs } = q.data
  const invited = new Set(invitations.map((i) => i.friend_family_id))
  const notYet = (fams.data?.families ?? []).filter((f) => !invited.has(f.id))
  const relaisOf = (invId: string) => relais.find((r) => r.invitation_id === invId)
  // The head-count, read from the families that said yes: one child for a friend-only invitation,
  // what the family said (or one) for a whole-family one.
  const yes = invitations.filter((i) => i.reply === 'yes')
  const totalKids = yes.reduce((n, i) => n + kidsComing(i.scope, i.kids), 0)
  const totalAdults = yes.reduce((n, i) => n + (i.adults ?? 0), 0)

  return (
    <>
      <Link to="/rencontres" className="muted small">← {t.encounters.back}</Link>
      <div className="row" style={{ marginTop: '0.5rem' }}>
        <h1>{e.title}</h1>
        {e.series_id && <span className="chip">{t.encounters.seriesChip}</span>}
      </div>
      <p className="muted">{t.encounters.kind[e.kind]} · {whenLong(e.starts_at, lang)}{e.place ? ` · ${e.place}` : ''} · {t.encounters.status[e.status]}</p>
      {e.note && <p>{e.note}</p>}
      {e.details.gift && <p className="muted">{t.kinds.birthday.giftIs} : {e.details.gift}</p>}
      {err && <div className="notice notice--err">{err}</div>}

      {e.kind === 'park' && e.status !== 'cancelled' && (e.here_at || e.hereOpen) && (
        <div className="card row">
          <span>{e.here_at ? <strong>{t.kinds.park.hereSince(timeOnly(e.here_at, lang))}</strong> : <span className="muted">{t.kinds.park.hint}</span>}</span>
          <button className={`btn ${e.here_at ? '' : 'btn--primary'}`} disabled={patch.isPending} onClick={() => patch.mutate({ here: !e.here_at })}>{e.here_at ? t.kinds.park.gone : t.kinds.park.here}</button>
        </div>
      )}

      {yes.length > 0 && (
        <div className="notice">{t.kinds.birthday.summary(totalKids, totalAdults)}</div>
      )}

      <div className="card">
        <h3>{t.encounters.links}</h3>
        {invitations.map((i) => (
          <div key={i.id} className="linkrow">
            <div className="row">
              <span className="cluster"><span><strong>{i.child_first_name}</strong> <span className="muted small">· {i.parent_name}</span></span></span>
              <span className={`chip ${i.reply ? `chip--${i.reply}` : ''}`}>{i.reply ? t.encounters.reply[i.reply] : t.encounters.reply.none}</span>
            </div>
            <p className="small muted" style={{ margin: 0 }}>{i.scope === 'friend' ? t.scope.chipFriend(i.child_first_name) : t.scope.chipFamily}</p>
            {i.reply_note && <p className="small" style={{ margin: 0 }}>« {i.reply_note} »</p>}
            {i.allergies && <p className="small" style={{ margin: 0 }}>{t.families.allergies} : {i.allergies}</p>}
            {i.reply === 'yes' && <p className="small muted" style={{ margin: 0 }}>{t.kinds.birthday.theyCome(kidsComing(i.scope, i.kids), i.adults ?? 0)}</p>}
            <div className="paper" title={t.encounters.paperHint}>{linkLabel(i.token)}</div>
            {(!i.email || !me.mail) && <p className="muted small" style={{ margin: 0 }}>{t.share.noEmailHint}</p>}
            <div className="cluster">
              {(!i.email || !me.mail) && <button className="btn btn--primary" onClick={() => void shareMessage(i)}>{copied === 's' + i.id ? t.encounters.copied : t.share.button}</button>}
              <button className="btn" onClick={() => void copy(i.token)}>{copied === i.token ? t.encounters.copied : t.encounters.copy}</button>
              {me.mail && i.email && <button className="linkbtn" disabled={send.isPending} onClick={() => send.mutate(i.id)}>{i.sent_at ? t.encounters.resend : t.encounters.send}</button>}
              <button className="linkbtn" onClick={() => setScope.mutate({ id: i.id, scope: i.scope === 'friend' ? 'family' : 'friend' })}>{i.scope === 'friend' ? t.scope.toFamily : t.scope.toFriend}</button>
              {e.kind === 'home' && <button className="linkbtn" onClick={() => setRelaisFor(relaisFor === i.id ? null : i.id)}>{relaisOf(i.id) ? t.kinds.relais.edit : t.kinds.relais.write}</button>}
              <button className="linkbtn linkbtn--danger" onClick={() => withdraw.mutate(i.id)}>{t.encounters.withdraw}</button>
            </div>
            {relaisFor === i.id && (
              <form className="card" onSubmit={(ev) => submitRelais(ev, i.id)}>
                <p className="muted small">{t.kinds.relais.hint}</p>
                <Why k="relais" />
                <label className="field"><span>{t.kinds.relais.nap}</span><input className="input" name="nap" maxLength={120} defaultValue={relaisOf(i.id)?.nap ?? ''} placeholder={t.kinds.relais.napPlaceholder} /></label>
                <label className="field"><span>{t.kinds.relais.ate}</span><input className="input" name="ate" maxLength={160} defaultValue={relaisOf(i.id)?.ate ?? ''} placeholder={t.kinds.relais.atePlaceholder} /></label>
                <label className="field"><span>{t.kinds.relais.mood}</span><input className="input" name="mood" maxLength={60} defaultValue={relaisOf(i.id)?.mood ?? ''} placeholder={t.kinds.relais.moodPlaceholder} /></label>
                <label className="field"><span>{t.kinds.relais.note}</span><input className="input" name="note" maxLength={400} defaultValue={relaisOf(i.id)?.note ?? ''} /></label>
                <div className="cluster">
                  <button className="btn btn--primary" disabled={relaisSave.isPending}>{t.kinds.relais.send}</button>
                  {relaisOf(i.id) && <button type="button" className="btn btn--ghost btn--danger" onClick={() => relaisDel.mutate(i.id)}>{t.kinds.relais.remove}</button>}
                </div>
              </form>
            )}
          </div>
        ))}
        {notYet.length > 0 && (addMore ? (
          <div className="stack" style={{ marginTop: '0.75rem' }}>
            {notYet.map((f) => (
              <button key={f.id} className="btn" onClick={() => { patch.mutate({ invite: [f.id] }); setAddMore(false) }}>{f.child_first_name} · {f.parent_name}</button>
            ))}
          </div>
        ) : (
          <button className="btn btn--ghost" style={{ marginTop: '0.75rem' }} onClick={() => setAddMore(true)}>{t.encounters.addFamily}</button>
        ))}
      </div>

      {(health.data?.photos || souvenirs.length > 0) && (
        <div className="card">
          <h3>{t.souvenirs.title}</h3>
          <p className="muted small">{t.souvenirs.hint}</p>
          <Why k="photos" />
          <PhotoGrid
            items={souvenirs}
            src={(pid) => `/api/souvenirs/${pid}`}
            enabled={!!health.data?.photos && e.status !== 'cancelled'}
            onUpload={async (blob) => {
              await api(`souvenirs?encounter=${id}`, { method: 'POST', body: blob })
              refresh()
            }}
            onDelete={(pid) => photoDel.mutate(pid)}
          />
        </div>
      )}

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
        {e.status !== 'cancelled' && <button className="linkbtn linkbtn--danger" onClick={() => confirm(t.encounters.cancelConfirm) && patch.mutate({ status: 'cancelled' })}>{t.encounters.cancel}</button>}
        {e.series_id && e.status !== 'cancelled' && <button className="linkbtn linkbtn--danger" onClick={() => confirm(t.encounters.cancelSeriesConfirm) && patch.mutate({ status: 'cancelled', series: true })}>{t.encounters.cancelSeries}</button>}
        <button className="linkbtn linkbtn--danger" onClick={() => confirm(t.encounters.deleteConfirm) && del.mutate()}>{t.encounters.delete}</button>
      </div>
    </>
  )
}
