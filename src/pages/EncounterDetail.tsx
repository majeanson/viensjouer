import { useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
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
import { Icon, kindIcon } from '../components/Icon'
import { MessageBoard } from '../components/MessageBoard'
import { Loading } from '../components/Loading'
import { Rel } from '../components/Rel'
import { QueryError } from '../components/QueryError'

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
  const msgRm = useDeferredRemove()
  const q = useQuery({ queryKey: K.encounter(id), queryFn: () => api<Detail>(`encounters?id=${id}`), refetchInterval: 30_000 })
  const fams = useQuery({ queryKey: K.families, queryFn: () => api<{ families: Family[] }>('families') })
  const health = useQuery({ queryKey: ['health'], queryFn: () => api<{ photos: boolean }>('health'), staleTime: 60_000 })
  const [copied, setCopied] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [addMore, setAddMore] = useState(false)
  const [relaisFor, setRelaisFor] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [postponing, setPostponing] = useState(false)
  // Straight from « Envoyer tout de suite » on the new-rencontre form: say what went out.
  const justSent = (useLocation().state as { sent?: number; skipped?: number } | null) ?? null
  const [flash, setFlash] = useState<string | null>(() => (justSent?.sent ? t.encounters.sentNow(justSent.sent) + (justSent.skipped ? ` ${t.common.mailCapped}` : '') : null))
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: K.encounter(id) })
    void qc.invalidateQueries({ queryKey: K.encounters })
    void qc.invalidateQueries({ queryKey: K.calendar })
  }
  const fail = (e: Error) => setErr(e.message)

  const patch = useMutation({ mutationFn: (body: Record<string, unknown>) => api('encounters', { method: 'PATCH', body: { id, ...body } }), onSuccess: refresh, onError: fail })
  const record = useMutation({ mutationFn: (b: { id: string; reply: 'yes' | 'maybe' | 'no' }) => api('invitations', { method: 'PATCH', body: b }), onSuccess: refresh, onError: fail })
  const reshuffle = useMutation({ mutationFn: (invId: string) => api('invitations', { method: 'PATCH', body: { id: invId, newCode: true } }), onSuccess: refresh, onError: fail })
  const send = useMutation({ mutationFn: (invId: string) => api('invitations', { method: 'POST', body: { id: invId } }), onSuccess: refresh, onError: fail })
  // One tap for the ones still silent: the same single send as « Renvoyer », one family after the other.
  const resendAll = useMutation({
    mutationFn: async (ids: string[]) => {
      for (const invId of ids) await api('invitations', { method: 'POST', body: { id: invId } })
    },
    onSuccess: refresh,
    onError: fail,
  })
  const setScope = useMutation({ mutationFn: (b: { id: string; scope: 'friend' | 'family' }) => api('invitations', { method: 'PATCH', body: b }), onSuccess: refresh, onError: fail })
  const announce = useMutation({
    mutationFn: (reason: string) => api<{ notified: number; notifiedSkipped?: number }>('encounters', { method: 'PATCH', body: { id, announce: true, ...(reason ? { reason } : {}) } }),
    onSuccess: (r) => {
      setFlash((r.notified ? t.edit.savedNotified(r.notified) : t.edit.nothing) + (r.notifiedSkipped ? ` ${t.common.mailCapped}` : ''))
      setTimeout(() => setFlash(null), 6000)
    },
    onError: fail,
  })
  const message = useMutation({ mutationFn: (text: string) => api('messages', { method: 'POST', body: { encounterId: id, text } }), onSuccess: refresh, onError: fail })
  const pin = useMutation({ mutationFn: (b: { id: string; pinned: boolean }) => api('messages', { method: 'PATCH', body: b }), onSuccess: refresh, onError: fail })
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
    mutationFn: (text: string) => api<{ sent: number; skipped?: number }>('thanks', { method: 'POST', body: { encounter: id, text } }),
    onSuccess: (r) => {
      setFlash(t.thanks.sent(r.sent) + (r.skipped ? ` ${t.common.mailCapped}` : ''))
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
  const messageFor = (i: Invitation) => t.share.message({ parent: i.parent_name, host: me.displayName ?? '', friend: i.child_first_name, title: e.title, when: whenLong(e.starts_at, lang), scope: i.scope, link: linkFor(i.token) })
  async function shareMessage(i: Invitation) {
    const text = messageFor(i)
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

  function submitRelais(ev: FormEvent<HTMLFormElement>, invitationId: string) {
    ev.preventDefault()
    relaisSave.mutate({ invitationId, ...Object.fromEntries(new FormData(ev.currentTarget).entries()) })
  }

  if (q.isLoading) return <Loading />
  if (!q.data) return <QueryError error={q.error} onRetry={() => void q.refetch()} />
  const { encounter: e, relais, changes: rawChanges } = q.data
  const messages = msgRm.visible(q.data.messages)
  const invitations = inviteRm.visible(q.data.invitations)
  const souvenirs = photoRm.visible(q.data.souvenirs)
  const bring = bringRm.visible(q.data.bring ?? [])
  // One line the host reads without opening the fold: how many are taken, and what is still missing.
  const open = bring.filter((b) => !b.claimed_label)
  const bringLine = open.length === 0 ? t.bring.allTaken : `${t.bring.taken(bring.length - open.length, bring.length)} · ${t.bring.missing(open.slice(0, 2).map((b) => b.label).join(', ') + (open.length > 2 ? '…' : ''))}`
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
  const silent = invitations.filter((i) => !i.reply)
  // Who can be emailed right now: an address, mail wired, no « ne plus recevoir », no bounce.
  const canMail = (i: Invitation) => !!me.mail && !!i.email && !i.email_bounced_at && !i.mail_stopped_at
  const unsentMail = invitations.filter((i) => !i.reply && !i.sent_at && canMail(i))
  const silentWithMail = invitations.filter((i) => !i.reply && !!i.sent_at && canMail(i))
  const anyEmail = invitations.some(canMail)
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
      <ul className="meta">
        <li><Icon name={kindIcon(e.kind)} />{t.encounters.kind[e.kind]} <span className={`chip chip--${e.status}`}>{t.encounters.status[e.status]}</span></li>
        <li><Icon name="clock" />{whenLong(e.starts_at, lang)}{e.ends_at ? ` → ${timeOnly(e.ends_at, lang)}` : ''}<Rel at={e.starts_at} /></li>
        {e.place && <li><Icon name="pin" />{e.place}{e.map_url && <>{' '}· <a href={e.map_url} target="_blank" rel="noopener noreferrer">{t.reply.openMap}</a></>}</li>}
      </ul>
      {e.note && <p>{e.note}</p>}
      {e.details.planB && <p className="muted"><Icon name="umbrella" />{t.encounters.planB} : {e.details.planB}</p>}
      {e.details.gift && <p className="muted">{t.kinds.birthday.giftIs} : {e.details.gift}</p>}
      {flash && <div className="notice">{flash}</div>}
      {err && <div className="notice notice--err">{err}</div>}
      {editing ? (
        <EncounterEdit
          e={e}
          gift={e.details.gift ?? null}
          planB={e.details.planB ?? null}
          canNotify={!!me.mail && invitations.some((i) => i.email && i.reply !== 'no')}
          onClose={() => setEditing(false)}
          onSaved={(r) => {
            setEditing(false)
            setFlash((r.changed === 0 ? t.edit.nothing : r.notified ? t.edit.savedNotified(r.notified) : t.edit.saved) + (r.notifiedSkipped ? ` ${t.common.mailCapped}` : ''))
            refresh()
            setTimeout(() => setFlash(null), 6000)
          }}
        />
      ) : (
        <p className="cluster" style={{ margin: '0 0 0.75rem' }}>
          {e.status !== 'cancelled' && <button className="btn btn--small" onClick={() => setEditing(true)}><Icon name="edit" />{t.edit.button}</button>}
          <Link to={`/rencontres/nouvelle?from=${e.id}`} className="btn btn--small"><Icon name="repeat" />{t.form.again}</Link>
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
          <h3><Icon name="heart" />{t.thanks.title}</h3>
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

          {/* Until someone answers, « Les invitations » below already says « Sans réponse » for each family: no second list. */}
          {(invitations.length === 0 || invitations.some((i) => i.reply)) && <div className="card" aria-label={t.roster.title}>
            <h3><Icon name="users" />{t.roster.title}</h3>
            <p className="muted small" style={{ margin: '0 0 0.4rem' }}>{e.show_guests === false ? null : t.roster.public}</p>
            {invitations.length === 0 && <p className="muted small" style={{ margin: 0 }}>{t.roster.empty}</p>}
            {groups.filter(([, list]) => list.length > 0).map(([label, list, kind]) => (
              <div key={kind} className="roster__row" data-roster={kind}>
                <strong>{label} ({list.length})</strong>
                <span className="roster__names">{list.map(who).join(', ')}</span>
              </div>
            ))}
            {yes.length > 0 && <p className="muted small" style={{ margin: '0.5rem 0 0' }}>{t.kinds.birthday.summary(totalKids, totalAdults)}</p>}
          </div>}

          <div className="card">
            <h3><Icon name="share" />{t.encounters.links}</h3>
            {invitations.length > 0 && (
              <div className="cluster" style={{ marginBottom: '0.75rem' }} role="group" aria-label={t.encounters.tally}>
                {(['yes', 'maybe', 'no'] as const).map((k) => ({ k, n: invitations.filter((i) => i.reply === k).length })).filter((x) => x.n > 0).map((x) => <span key={x.k} className={`chip chip--${x.k}`}>{t.encounters.reply[x.k]} · {x.n}</span>)}
                {silent.length > 0 && <span className="chip">{t.encounters.reply.none} · {silent.length}</span>}
              </div>
            )}
            {unsentMail.length > 0 && <p style={{ margin: '0 0 0.75rem' }}><button className="btn btn--primary" disabled={resendAll.isPending} onClick={() => resendAll.mutate(unsentMail.map((i) => i.id))}><Icon name="mail" />{t.encounters.sendAll(unsentMail.length)}</button></p>}
            {invitations.map((i) => (
              <div key={i.id} className="linkrow">
                <div className="row">
                  <span className="cluster"><span><strong>{i.child_first_name}</strong> <span className="muted small">· {i.parent_name}</span></span>{i.email_bounced_at && <span className="chip chip--cancelled">{t.families.bounced}</span>}{i.mail_stopped_at && <span className="chip">{t.families.stopped}</span>}{i.sent_at && !i.reply && <span className="chip">{t.encounters.sentChip}</span>}</span>
                  <span className={`chip ${i.reply ? `chip--${i.reply}` : ''}`}>{i.reply ? t.encounters.reply[i.reply] : t.encounters.reply.none}</span>
                </div>
                {i.reply_note && <p className="small" style={{ margin: 0 }}>« {i.reply_note} »</p>}
                {i.allergies && <p className="small" style={{ margin: 0 }}>{t.families.allergies} : {i.allergies}</p>}
                {i.reply === 'yes' && <p className="small muted" style={{ margin: 0 }}>{t.kinds.birthday.theyCome(kidsComing(i.scope, i.kids), i.adults ?? 0)}</p>}
                <div className="cluster">
                  {!i.reply && (canMail(i)
                    ? <button className={`btn btn--small ${i.sent_at ? '' : 'btn--primary'}`} disabled={send.isPending} onClick={() => send.mutate(i.id)}><Icon name="mail" />{i.sent_at ? t.encounters.resend : t.encounters.send}</button>
                    : <button className="btn btn--small btn--primary" onClick={() => void shareMessage(i)}><Icon name="share" />{copied === 's' + i.id ? t.encounters.copied : t.encounters.byText}</button>)}
                  <details className="more">
                    <summary>{t.form.more}</summary>
                    <div className="stack">
                      {canMail(i) && !i.reply && <div><button className="btn btn--small" onClick={() => void shareMessage(i)}><Icon name="share" />{copied === 's' + i.id ? t.encounters.copied : t.encounters.byText}</button></div>}
                      <div>
                        <p className="muted small" style={{ margin: '0 0 0.25rem' }}>{t.share.preview}</p>
                        <blockquote className="msgpreview">{messageFor(i)}</blockquote>
                      </div>
                      <div>
                        <p className="muted small" style={{ margin: '0 0 0.25rem' }}>{t.encounters.theLink}</p>
                        <div className="paper" title={t.encounters.paperHint}>{linkLabel(i.token)}</div>
                        <div className="cluster">
                          <button className="btn btn--small" onClick={() => void copy(i.token)}>{copied === i.token ? t.encounters.copied : t.encounters.copy}</button>
                          {!i.reply && !i.sent_at && <button className="btn btn--small" disabled={reshuffle.isPending} onClick={() => reshuffle.mutate(i.id)}>{t.encounters.reshuffle}</button>}
                        </div>
                      </div>
                      <div>
                        <p className="muted small" style={{ margin: '0 0 0.25rem' }}>{t.scope.label}</p>
                        <div className="seg" role="group" aria-label={t.scope.label}>
                          {(['family', 'friend'] as const).map((s) => (
                            <button key={s} type="button" className={`btn btn--small ${i.scope === s ? 'btn--on' : ''}`} aria-pressed={i.scope === s} onClick={() => i.scope !== s && setScope.mutate({ id: i.id, scope: s })}>{s === 'friend' ? t.scope.chipFriend(i.child_first_name) : t.scope.chipFamily}</button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <p className="muted small" style={{ margin: '0 0 0.25rem' }}>{t.record.label}</p>
                        <div className="seg" role="group" aria-label={t.record.label}>
                          {(['yes', 'maybe', 'no'] as const).map((r) => (
                            <button key={r} type="button" className={`btn btn--small ${i.reply === r ? 'btn--on' : ''}`} aria-pressed={i.reply === r} disabled={record.isPending} onClick={() => record.mutate({ id: i.id, reply: r })}>{t.encounters.reply[r]}</button>
                          ))}
                        </div>
                      </div>
                      <div className="cluster">
                        {e.kind === 'home' && <button className="btn btn--small" onClick={() => setRelaisFor(relaisFor === i.id ? null : i.id)}>{relaisOf(i.id) ? t.kinds.relais.edit : t.kinds.relais.write}</button>}
                        <button
                          className="btn btn--small btn--danger"
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
                    <label className="field"><span><Icon name="moon" />{t.kinds.relais.nap}</span><input className="input" name="nap" maxLength={120} defaultValue={relaisOf(i.id)?.nap ?? ''} placeholder={t.kinds.relais.napPlaceholder} /></label>
                    <label className="field"><span><Icon name="bag" />{t.kinds.relais.ate}</span><input className="input" name="ate" maxLength={160} defaultValue={relaisOf(i.id)?.ate ?? ''} placeholder={t.kinds.relais.atePlaceholder} /></label>
                    <label className="field"><span><Icon name="smile" />{t.kinds.relais.mood}</span><input className="input" name="mood" maxLength={60} defaultValue={relaisOf(i.id)?.mood ?? ''} placeholder={t.kinds.relais.moodPlaceholder} /></label>
                    <label className="field"><span><Icon name="note" />{t.kinds.relais.note}</span><input className="input" name="note" maxLength={400} defaultValue={relaisOf(i.id)?.note ?? ''} /></label>
                    <div className="cluster">
                      <button className="btn btn--primary" disabled={relaisSave.isPending}>{t.kinds.relais.send}</button>
                      {relaisOf(i.id) && <button type="button" className="btn btn--danger" onClick={() => relaisDel.mutate(i.id)}>{t.kinds.relais.remove}</button>}
                    </div>
                  </form>
                )}
              </div>
            ))}
            {silentWithMail.length > 0 && <p style={{ margin: '0.75rem 0 0' }}><button className="btn" disabled={resendAll.isPending} onClick={() => resendAll.mutate(silentWithMail.map((i) => i.id))}><Icon name="mail" />{t.encounters.resendAll(silentWithMail.length)}</button></p>}
            {invitations.length > 0 && silent.length > 0 && (
              <details className="more" open={!anyEmail} style={{ marginTop: '0.75rem' }}>
                <summary>{t.encounters.howTitle}</summary>
                <ul className="small" style={{ margin: '0.5rem 0', paddingLeft: '1.1rem' }}>
                  <li>{t.encounters.howMail}</li>
                  <li>{t.encounters.howText}</li>
                  <li>{t.encounters.howPaper}</li>
                </ul>
                <Link to={`/rencontres/${e.id}/cartes`} className="btn btn--small"><Icon name="note" />{t.cards.title}</Link>
              </details>
            )}
            {notYet.length > 0 && (addMore ? (
              <div className="stack" style={{ marginTop: '0.75rem' }}>
                {notYet.map((f) => (
                  <button key={f.id} className="btn" onClick={() => { patch.mutate({ invite: [f.id] }); setAddMore(false) }}>{f.child_first_name} · {f.parent_name}</button>
                ))}
              </div>
            ) : (
              <button className="btn" style={{ marginTop: '0.75rem' }} onClick={() => setAddMore(true)}>{t.encounters.addFamily}</button>
            ))}
          </div>
        </div>

        <div>
          <details className="fold">
            <summary><span><Icon name="bag" />{t.bring.title}{bring.length > 0 ? ` (${bringLine})` : ''}</span></summary>
            <div>
              <p className="muted small">{t.bring.hint}</p>
              {bring.map((b) => (
                <div key={b.id} className="row linkrow">
                  <span>{b.label} <span className="muted small">· {b.claimed_label ? t.bring.byName(b.claimed_label) : t.bring.nobody}</span></span>
                  <button className="btn btn--small btn--danger" onClick={() => bringRm.remove(b.id, t.undo.removed, async () => { await api('bring', { method: 'DELETE', body: { id: b.id } }); refresh() })}>{t.bring.remove}</button>
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
          {/* The day's photos: offered once the day has started (or when there already are some), not as an empty fold for days before. */}
          {((health.data?.photos && e.starts_at <= nowSecs) || souvenirs.length > 0) && (
            <details className="fold">
              <summary><span><Icon name="camera" />{t.souvenirs.title}{souvenirs.length > 0 ? ` (${souvenirs.length})` : ''}</span></summary>
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

          <MessageBoard
            messages={messages}
            canPost
            posting={message.isPending}
            isHost
            seenKey={`h-${id}`}
            onPost={(text) => message.mutate(text)}
            onPin={(m, pinned) => pin.mutate({ id: m.id, pinned })}
            onDelete={(m) => msgRm.remove(m.id, t.undo.removed, async () => { await api('messages', { method: 'DELETE', body: { id: m.id } }); refresh() })}
          />

          {changes.length > 0 && (
            <details className="fold">
              <summary><span><Icon name="history" />{t.edit.history}</span></summary>
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

      {postponing && e.status !== 'cancelled' && e.status !== 'postponed' && (
        <form
          className="card"
          onSubmit={(ev) => {
            ev.preventDefault()
            const f = new FormData(ev.currentTarget)
            const reason = String(f.get('why') ?? '').trim()
            patch.mutate(
              { status: 'postponed', ...(reason ? { reason } : {}), ...(f.get('series') === 'on' ? { series: true } : {}), notify: f.get('notify') === 'on' },
              { onSuccess: () => setPostponing(false) },
            )
          }}
        >
          <h3><Icon name="umbrella" />{t.encounters.postpone}</h3>
          <p className="muted small">{t.encounters.postponeHint}</p>
          <label className="field"><span>{t.encounters.postponeWhy}</span><input className="input" name="why" maxLength={200} placeholder={t.encounters.postponePlaceholder} /></label>
          {e.series_id && <label className="check"><input type="checkbox" name="series" /><span>{t.encounters.postponeSeries}</span></label>}
          {!!me.mail && invitations.some((i) => i.email && i.reply !== 'no') && <label className="check"><input type="checkbox" name="notify" defaultChecked /><span>{t.edit.notify}</span></label>}
          <div className="cluster">
            <button className="btn btn--primary" disabled={patch.isPending}>{t.encounters.postpone}</button>
            <button type="button" className="btn" onClick={() => setPostponing(false)}>{t.edit.cancel}</button>
          </div>
        </form>
      )}
      {e.status === 'postponed' && <div className="notice" role="status">{t.encounters.postponedHost}</div>}
      {e.status === 'cancelled' && (
        <form
          className="card"
          onSubmit={(ev) => {
            ev.preventDefault()
            const why = String(new FormData(ev.currentTarget).get('why') ?? '').trim()
            const mail = new FormData(ev.currentTarget).get('notify') === 'on'
            if (!why && !mail) return
            if (why) message.mutate(`${t.encounters.status.cancelled} : ${why}`)
            if (mail) announce.mutate(why)
            ev.currentTarget.reset()
          }}
        >
          <h3><Icon name="message" />{t.encounters.whyCancel}</h3>
          <p className="muted small">{t.encounters.whyCancelHint}</p>
          <label className="field"><span className="sr-only">{t.encounters.whyCancel}</span><input className="input" name="why" maxLength={200} placeholder={t.encounters.whyCancelPlaceholder} /></label>
          {!!me.mail && invitations.some((i) => i.email && i.reply !== 'no') && <label className="check"><input type="checkbox" name="notify" /><span>{t.edit.notify}</span></label>}
          <button className="btn btn--primary" disabled={message.isPending}>{t.board.send}</button>
        </form>
      )}
      <div className="endactions">
        {e.status === 'proposed' && <button className="btn btn--primary btn--big" onClick={() => patch.mutate({ status: 'confirmed' })}><Icon name="check" />{t.encounters.confirm}</button>}
        <div className="cluster">
          {e.status !== 'cancelled' && e.status !== 'postponed' && <button className="btn" onClick={() => setPostponing(true)}><Icon name="umbrella" />{t.encounters.postpone}</button>}
          {e.status !== 'cancelled' && <button className="btn btn--danger" onClick={() => cancel(false, e.status)}>{t.encounters.cancel}</button>}
          {e.series_id && e.status !== 'cancelled' && <button className="btn btn--danger" onClick={() => cancel(true, e.status)}>{t.encounters.cancelSeries}</button>}
          <button className="btn btn--danger" onClick={deleteIt}><Icon name="trash" />{t.encounters.delete}</button>
        </div>
      </div>
    </>
  )
}
