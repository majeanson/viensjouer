import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { K } from '../lib/query'
import { useAuth } from '../lib/auth'
import { useLang, useT } from '../i18n'
import { timeOnly, whenLong, whenShort } from '../lib/format'
import { linkFor, linkLabel } from '../lib/link'
import { PhotoGrid } from '../components/PhotoGrid'
import { EncounterEdit } from '../components/EncounterEdit'
import { CoverPicture } from '../components/CoverPicture'
import { fromRow, isPrivate, showValue, type ChangeRow } from '../lib/changes'
import { Why } from '../components/Why'
import { kidsComing } from '../lib/scope'
import { useDeferredRemove, useToast } from '../lib/toast'
import type { Encounter, Family, Invitation, Message, Relais, Souvenir } from '../lib/types'

interface Detail {
  encounter: Encounter & { details: Record<string, string>; hereOpen: boolean }
  invitations: Invitation[]
  messages: Message[]
  relais: Relais[]
  souvenirs: Souvenir[]
  changes: ChangeRow[]
  bring: { id: string; label: string; claimed_label: string | null; added_by: string }[]
}

// The host's card. Left: the plan, WHO IS COMING, and one calm line per family (share, with the rest
// under « Plus »). Right: the talk and the photos, folded. Undo instead of « are you sure ? ».
export function EncounterDetail() {
  const { id = '' } = useParams()
  const t = useT()
  const { lang } = useLang()
  const { me } = useAuth()
  const nav = useNavigate()
  const qc = useQueryClient()
  const toast = useToast()
  const inviteRm = useDeferredRemove()
  const photoRm = useDeferredRemove()
  const bringRm = useDeferredRemove()
  const q = useQuery({ queryKey: K.encounter(id), queryFn: () => api<Detail>(`encounters?id=${id}`), refetchInterval: 30_000 })
  const fams = useQuery({ queryKey: K.families, queryFn: () => api<{ families: Family[] }>('families') })
  const health = useQuery({ queryKey: ['health'], queryFn: () => api<{ photos: boolean }>('health'), staleTime: 60_000 })
  const [copied, setCopied] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [addMore, setAddMore] = useState(false)
  const [relaisFor, setRelaisFor] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [flash, setFlash] = useState<string | null>(null)
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: K.encounter(id) })
    void qc.invalidateQueries({ queryKey: K.encounters })
    void qc.invalidateQueries({ queryKey: K.calendar })
  }
  const fail = (e: Error) => setErr(e.message)

  const patch = useMutation({ mutationFn: (body: Record<string, unknown>) => api('encounters', { method: 'PATCH', body: { id, ...body } }), onSuccess: refresh, onError: fail })
  const send = useMutation({ mutationFn: (invId: string) => api('invitations', { method: 'POST', body: { id: invId } }), onSuccess: refresh, onError: fail })
  const setScope = useMutation({ mutationFn: (b: { id: string; scope: 'friend' | 'family' }) => api('invitations', { method: 'PATCH', body: b }), onSuccess: refresh, onError: fail })
  const message = useMutation({ mutationFn: (text: string) => api('messages', { method: 'POST', body: { encounterId: id, text } }), onSuccess: refresh, onError: fail })
  const relaisSave = useMutation({
    mutationFn: (body: Record<string, unknown>) => api('relais', { method: 'POST', body }),
    onSuccess: () => {
      setRelaisFor(null)
      refresh()
    },
    onError: fail,
  })
  const addBring = useMutation({ mutationFn: (label: string) => api('bring', { method: 'POST', body: { encounter: id, label } }), onSuccess: refresh, onError: fail })
  const thank = useMutation({
    mutationFn: (text: string) => api<{ sent: number }>('thanks', { method: 'POST', body: { encounter: id, text } }),
    onSuccess: (r) => {
      setFlash(t.thanks.sent(r.sent))
      refresh()
      setTimeout(() => setFlash(null), 6000)
    },
    onError: fail,
  })
  const relaisDel = useMutation({ mutationFn: (invitationId: string) => api('relais', { method: 'DELETE', body: { invitationId } }), onSuccess: refresh, onError: fail })

  // Cancelling happens now and can be taken back; deleting waits a few seconds behind the undo bar.
  function cancel(series: boolean, prev: Encounter['status']) {
    patch.mutate({ status: 'cancelled', ...(series ? { series: true } : {}) })
    toast.done(series ? t.undo.cancelledSeries : t.undo.cancelled, () => patch.mutate({ status: prev === 'cancelled' ? 'proposed' : prev, ...(series ? { series: true } : {}) }))
  }
  function deleteIt() {
    qc.setQueryData<{ encounters: Encounter[] } | undefined>(K.encounters, (d) => (d ? { ...d, encounters: d.encounters.filter((x) => x.id !== id) } : d))
    nav('/rencontres', { replace: true })
    toast.later(
      t.undo.deleted,
      async () => {
        await api('encounters', { method: 'DELETE', body: { id } })
        refresh()
      },
      () => void qc.invalidateQueries({ queryKey: K.encounters }),
    )
  }

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

  function sendMsg(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault()
    const f = ev.currentTarget
    const text = String(new FormData(f).get('text') ?? '').trim()
    if (!text) return
    message.mutate(text)
    f.reset()
  }

  function submitRelais(ev: FormEvent<HTMLFormElement>, invitationId: string) {
    ev.preventDefault()
    relaisSave.mutate({ invitationId, ...Object.fromEntries(new FormData(ev.currentTarget).entries()) })
  }

  if (q.isLoading) return <p className="muted">{t.common.loading}</p>
  if (!q.data) return <p className="notice notice--err">{t.common.error}</p>
  const { encounter: e, messages, relais, changes: rawChanges } = q.data
  const invitations = inviteRm.visible(q.data.invitations)
  const souvenirs = photoRm.visible(q.data.souvenirs)
  const bring = bringRm.visible(q.data.bring ?? [])
  const nowSecs = Math.floor(Date.now() / 1000)
  const canThank = e.status !== 'cancelled' && e.starts_at <= nowSecs && nowSecs - e.starts_at <= 30 * 86_400 && !e.thanked_at
  const changes = rawChanges ?? []
  const invited = new Set(invitations.map((i) => i.friend_family_id))
  const notYet = (fams.data?.families ?? []).filter((f) => !invited.has(f.id))
  const relaisOf = (invId: string) => relais.find((r) => r.invitation_id === invId)
  // The head-count, read from the families that said yes: one child for a friend-only invitation,
  // what the family said (or one) for a whole-family one.
  const yes = invitations.filter((i) => i.reply === 'yes')
  const totalKids = yes.reduce((n, i) => n + kidsComing(i.scope, i.kids), 0)
  const totalAdults = yes.reduce((n, i) => n + (i.adults ?? 0), 0)
  const groups: [string, Invitation[], string][] = [
    [t.roster.yes, yes, 'yes'],
    [t.roster.maybe, invitations.filter((i) => i.reply === 'maybe'), 'maybe'],
    [t.roster.no, invitations.filter((i) => i.reply === 'no'), 'no'],
    [t.roster.none, invitations.filter((i) => !i.reply), 'none'],
  ]
  const who = (i: Invitation) => `${i.child_first_name} (${i.parent_name})`

  return (
    <>
      <Link to="/rencontres" className="muted small">← {t.encounters.back}</Link>
      <div style={{ marginTop: '0.5rem' }}>
        <CoverPicture encounterId={e.id} cover={e.cover ?? null} enabled={!!health.data?.photos && e.status !== 'cancelled'} onChanged={refresh} />
      </div>
      <div className="row">
        <h1>{e.title}</h1>
        {e.series_id && <span className="chip">{t.encounters.seriesChip}</span>}
      </div>
      <p className="muted">{t.encounters.kind[e.kind]} · {whenLong(e.starts_at, lang)}{e.place ? ` · ${e.place}` : ''} · {t.encounters.status[e.status]}</p>
      {e.map_url && <p style={{ margin: '0 0 0.5rem' }}><a href={e.map_url} target="_blank" rel="noopener noreferrer">{t.reply.openMap}</a></p>}
      {e.note && <p>{e.note}</p>}
      {e.details.gift && <p className="muted">{t.kinds.birthday.giftIs} : {e.details.gift}</p>}
      {flash && <div className="notice">{flash}</div>}
      {err && <div className="notice notice--err">{err}</div>}
      {editing ? (
        <EncounterEdit
          e={e}
          gift={e.details.gift ?? null}
          canNotify={!!me.mail && invitations.some((i) => i.email && i.reply !== 'no')}
          onClose={() => setEditing(false)}
          onSaved={(r) => {
            setEditing(false)
            setFlash(r.changed === 0 ? t.edit.nothing : r.notified ? t.edit.savedNotified(r.notified) : t.edit.saved)
            refresh()
            setTimeout(() => setFlash(null), 6000)
          }}
        />
      ) : (
        <p className="cluster" style={{ margin: '0 0 0.75rem' }}>
          {e.status !== 'cancelled' && <button className="linkbtn" onClick={() => setEditing(true)}>{t.edit.button}</button>}
          <Link to={`/rencontres/nouvelle?from=${e.id}`} className="linkbtn">{t.form.again}</Link>
        </p>
      )}

      {canThank && yes.length > 0 && (
        <form
          className="card"
          onSubmit={(ev) => {
            ev.preventDefault()
            thank.mutate(String(new FormData(ev.currentTarget).get('text') ?? ''))
          }}
        >
          <h3>{t.thanks.title}</h3>
          <p className="muted small">{t.thanks.hint}</p>
          <textarea className="input" name="text" maxLength={500} defaultValue={t.thanks.default} aria-label={t.thanks.title} />
          <button className="btn btn--primary" style={{ marginTop: '0.5rem' }} disabled={thank.isPending}>{t.thanks.send}</button>
        </form>
      )}
      {e.thanked_at && <p className="muted small">{t.thanks.done}</p>}

      <div className="cols">
        <div>
          {e.kind === 'park' && e.status !== 'cancelled' && (e.here_at || e.hereOpen) && (
            <div className="card row">
              <span>{e.here_at ? <strong>{t.kinds.park.hereSince(timeOnly(e.here_at, lang))}</strong> : <span className="muted">{t.kinds.park.hint}</span>}</span>
              <button className={`btn ${e.here_at ? '' : 'btn--primary'}`} disabled={patch.isPending} onClick={() => patch.mutate({ here: !e.here_at })}>{e.here_at ? t.kinds.park.gone : t.kinds.park.here}</button>
            </div>
          )}

          <div className="card" aria-label={t.roster.title}>
            <h3>{t.roster.title}</h3>
            <p className="muted small" style={{ margin: '0 0 0.4rem' }}>{e.show_guests === false ? null : t.roster.public}</p>
            {invitations.length === 0 && <p className="muted small" style={{ margin: 0 }}>{t.roster.empty}</p>}
            {groups.filter(([, list]) => list.length > 0).map(([label, list, kind]) => (
              <div key={kind} className="roster__row" data-roster={kind}>
                <strong>{label} ({list.length})</strong>
                <span className="roster__names">{list.map(who).join(', ')}</span>
              </div>
            ))}
            {yes.length > 0 && <p className="muted small" style={{ margin: '0.5rem 0 0' }}>{t.kinds.birthday.summary(totalKids, totalAdults)}</p>}
          </div>

          <div className="card">
            <h3>{t.encounters.links}</h3>
            {invitations.map((i) => (
              <div key={i.id} className="linkrow">
                <div className="row">
                  <span className="cluster"><span><strong>{i.child_first_name}</strong> <span className="muted small">· {i.parent_name}</span></span></span>
                  <span className={`chip ${i.reply ? `chip--${i.reply}` : ''}`}>{i.reply ? t.encounters.reply[i.reply] : t.encounters.reply.none}</span>
                </div>
                {i.reply_note && <p className="small" style={{ margin: 0 }}>« {i.reply_note} »</p>}
                {i.allergies && <p className="small" style={{ margin: 0 }}>{t.families.allergies} : {i.allergies}</p>}
                {i.reply === 'yes' && <p className="small muted" style={{ margin: 0 }}>{t.kinds.birthday.theyCome(kidsComing(i.scope, i.kids), i.adults ?? 0)}</p>}
                <div className="cluster">
                  <button className={`btn btn--small ${!i.email || !me.mail ? 'btn--primary' : ''}`} onClick={() => void shareMessage(i)}>{copied === 's' + i.id ? t.encounters.copied : t.share.button}</button>
                  {me.mail && i.email && <button className="linkbtn" disabled={send.isPending} onClick={() => send.mutate(i.id)}>{i.sent_at ? t.encounters.resend : t.encounters.send}</button>}
                  <details className="more">
                    <summary>{t.form.more}</summary>
                    <div>
                      <p className="small muted" style={{ margin: 0 }}>{i.scope === 'friend' ? t.scope.chipFriend(i.child_first_name) : t.scope.chipFamily}</p>
                      <div className="paper" title={t.encounters.paperHint}>{linkLabel(i.token)}</div>
                      {(!i.email || !me.mail) && <p className="muted small" style={{ margin: 0 }}>{t.share.noEmailHint}</p>}
                      <div className="cluster">
                        <button className="linkbtn" onClick={() => void copy(i.token)}>{copied === i.token ? t.encounters.copied : t.encounters.copy}</button>
                        <button className="linkbtn" onClick={() => setScope.mutate({ id: i.id, scope: i.scope === 'friend' ? 'family' : 'friend' })}>{i.scope === 'friend' ? t.scope.toFamily : t.scope.toFriend}</button>
                        {e.kind === 'home' && <button className="linkbtn" onClick={() => setRelaisFor(relaisFor === i.id ? null : i.id)}>{relaisOf(i.id) ? t.kinds.relais.edit : t.kinds.relais.write}</button>}
                        <button
                          className="linkbtn linkbtn--danger"
                          onClick={() => inviteRm.remove(i.id, t.undo.removed, async () => { await api('invitations', { method: 'DELETE', body: { id: i.id } }); refresh() })}
                        >
                          {t.encounters.withdraw}
                        </button>
                      </div>
                    </div>
                  </details>
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
        </div>

        <div>
          <details className="fold">
            <summary><span>{t.bring.title}{bring.length > 0 ? ` (${bring.length})` : ''}</span></summary>
            <div>
              <p className="muted small">{t.bring.hint}</p>
              {bring.map((b) => (
                <div key={b.id} className="row linkrow">
                  <span>{b.label} <span className="muted small">· {b.claimed_label ? t.bring.byName(b.claimed_label) : t.bring.nobody}</span></span>
                  <button className="linkbtn linkbtn--danger" onClick={() => bringRm.remove(b.id, t.undo.removed, async () => { await api('bring', { method: 'DELETE', body: { id: b.id } }); refresh() })}>{t.bring.remove}</button>
                </div>
              ))}
              <form
                className="cluster"
                style={{ marginTop: '0.5rem' }}
                onSubmit={(ev) => {
                  ev.preventDefault()
                  const f = ev.currentTarget
                  const label = String(new FormData(f).get('label') ?? '').trim()
                  if (label) addBring.mutate(label)
                  f.reset()
                }}
              >
                <input className="input" name="label" maxLength={60} placeholder={t.bring.placeholder} aria-label={t.bring.title} style={{ flex: '1 1 10rem' }} />
                <button className="btn" disabled={addBring.isPending}>{t.bring.add}</button>
              </form>
            </div>
          </details>
          {(health.data?.photos || souvenirs.length > 0) && (
            <details className="fold">
              <summary><span>{t.souvenirs.title}{souvenirs.length > 0 ? ` (${souvenirs.length})` : ''}</span></summary>
              <div>
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
                  onDelete={(pid) => photoRm.remove(pid, t.undo.removed, async () => { await api('souvenirs', { method: 'DELETE', body: { id: pid } }); refresh() })}
                />
              </div>
            </details>
          )}

          <details className="fold">
            <summary><span>{t.encounters.thread}{messages.length > 0 ? ` (${messages.length})` : ''}</span></summary>
            <div>
              {messages.map((m) => (
                <div key={m.id} className={`msg ${m.author_kind === 'host' ? 'msg--host' : ''}`}><b>{m.author_label}</b>{m.text}</div>
              ))}
              <form className="cluster" onSubmit={sendMsg} style={{ marginTop: '0.5rem' }}>
                <input className="input" name="text" placeholder={t.encounters.write} maxLength={1000} style={{ flex: '1 1 12rem' }} />
                <button className="btn" disabled={message.isPending}>{t.encounters.sendMsg}</button>
              </form>
            </div>
          </details>

          {changes.length > 0 && (
            <details className="fold">
              <summary><span>{t.edit.history}</span></summary>
              <div>
                <ul className="small" style={{ margin: 0 }}>
                  {changes.map((c, n) => {
                    const d = fromRow(c)
                    return (
                      <li key={n}>
                        <span className="muted">{whenShort(c.created_at, lang)} · {t.edit.fields[c.field]} :</span>{' '}
                        {isPrivate(c.field) ? t.edit.hidden[c.field] : <><s>{showValue(c.field, d.from, lang, t.edit.status, t.edit.empty)}</s> → {showValue(c.field, d.to, lang, t.edit.status, t.edit.empty)}</>}
                      </li>
                    )
                  })}
                </ul>
              </div>
            </details>
          )}
        </div>
      </div>

      <div className="cluster">
        {e.status === 'proposed' && <button className="btn btn--primary" onClick={() => patch.mutate({ status: 'confirmed' })}>{t.encounters.confirm}</button>}
        {e.status !== 'cancelled' && <button className="linkbtn linkbtn--danger" onClick={() => cancel(false, e.status)}>{t.encounters.cancel}</button>}
        {e.series_id && e.status !== 'cancelled' && <button className="linkbtn linkbtn--danger" onClick={() => cancel(true, e.status)}>{t.encounters.cancelSeries}</button>}
        <button className="linkbtn linkbtn--danger" onClick={deleteIt}>{t.encounters.delete}</button>
      </div>
    </>
  )
}
