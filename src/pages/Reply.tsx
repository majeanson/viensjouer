import './reply.css'
import { ValidForm } from '../components/ValidForm'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiError, api, isStatus } from '../lib/api'
import { clearPending, readPending, writePending } from '../lib/pendingAnswer'
import { K } from '../lib/query'
import { useLang, useT } from '../i18n'
import { humanWhen, timeOnly, whenShort } from '../lib/format'
import { paperCode } from '../lib/link'
import { fromRow, isPrivate, readSeen, seenKey, showValue, writeSeen, type ChangeField, type ChangeRow } from '../lib/changes'
import { useAuth } from '../lib/auth'
import { HomeCardView } from '../components/HomeCard'
import { PhotoGrid } from '../components/PhotoGrid'
import { Why } from '../components/Why'
import { WhyMany } from '../components/WhyMany'
import type { Reply as ReplyKind } from '../lib/types'
import type { ReplyCard as Card } from '../lib/replyCard'
import { Header } from '../components/Header'
import { Loading } from '../components/Loading'
import { QueryError } from '../components/QueryError'
import { Icon } from '../components/Icon'
import { LinkFamilies } from '../components/LinkFamilies'
import { CircleDoor, type CircleInfo } from '../components/CircleDoor'
import { Face } from '../components/Face'
import { MessageBoard } from '../components/MessageBoard'
import { OfflineNotice } from '../components/ErrorBoundary'

// THE install-free page. A parent opens it from a text, sees the plan, answers in one
// tap, leaves their details once. No account, no app, no cookie.
// Keyed by the code: moving between the weeks of a series must not carry one week's
// half-typed answer into the next.
export function Reply() {
  const { token = '' } = useParams()
  return <ReplyInner key={token} />
}

function ReplyInner() {
  // `/r/<code>` or the paper spelling `/<xxxx-xxxx>`; the API forgives the hyphen.
  const { token = '' } = useParams()
  const t = useT()
  const { lang } = useLang()
  const qc = useQueryClient()
  const q = useQuery({ queryKey: K.reply(token), queryFn: () => api<Card & { circle?: CircleInfo }>(`r/${token}`), retry: false, refetchInterval: 30_000 })
  const [justAnswered, setJustAnswered] = useState(false)
  const [editing, setEditing] = useState(false)
  const [done, setDone] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [claiming, setClaiming] = useState(false)
  const questionRef = useRef<HTMLDivElement>(null)
  const [offscreen, setOffscreen] = useState(false)
  const [queued, setQueued] = useState<ReplyKind | null>(() => readPending(token))
  const { me, refresh } = useAuth()
  const nav = useNavigate()
  // When this device last opened this link: what was edited AFTER that is marked as new.
  const [seenAt] = useState<number | null>(() => readSeen(seenKey(token)))
  const loaded = !!q.data
  useEffect(() => {
    if (!loaded) return
    const id = setTimeout(() => writeSeen(seenKey(token), Math.floor(Date.now() / 1000)), 2500)
    return () => clearTimeout(id)
  }, [loaded, token])

  const questionShown = !!q.data && q.data.alive && q.data.you.reply === null
  useEffect(() => {
    const el = questionRef.current
    if (!el || !questionShown || typeof IntersectionObserver === 'undefined') {
      setOffscreen(false)
      return
    }
    const io = new IntersectionObserver(([entry]) => setOffscreen(!entry.isIntersecting))
    io.observe(el)
    return () => io.disconnect()
  }, [questionShown])

  // A kept answer goes out when the network is back, or the next time this link is opened.
  useEffect(() => {
    setQueued(readPending(token))
    const flush = () => {
      const p = readPending(token)
      if (!p) return
      api(`r/${token}`, { method: 'POST', body: { reply: p } })
        .then(() => { clearPending(token); setQueued(null); setJustAnswered(true); void qc.invalidateQueries({ queryKey: K.reply(token) }) })
        // A refusal that will not change (the rencontre is over, the link is gone) drops the answer; a busy server or the
        // rate limit (5xx, 429) keeps it for the next try.
        .catch((e) => { if (e instanceof ApiError && e.status >= 400 && e.status < 500 && e.status !== 429) { clearPending(token); setQueued(null) } })
    }
    flush()
    window.addEventListener('online', flush)
    return () => window.removeEventListener('online', flush)
  }, [token, qc])

  const claim = useMutation({
    mutationFn: (body: Record<string, unknown>) => api(`r/${token}/claim`, { method: 'POST', body }),
    onSuccess: async () => {
      await refresh()
      nav('/amis', { replace: true })
    },
    onError: (e) => setErr(e.message),
  })

  const slotPost = useMutation({
    mutationFn: (b: { slot: string; on: boolean }) => api(`r/${token}/slots`, { method: 'POST', body: b }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: K.reply(token) }),
    onError: (e) => setErr(e.message),
  })
  const bringPost = useMutation({
    mutationFn: (body: Record<string, unknown>) => api(`r/${token}/bring`, { method: 'POST', body }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: K.reply(token) })
      setErr(null)
    },
    onError: (e) => setErr(e.message),
  })
  const post = useMutation({
    mutationFn: (body: Record<string, unknown>) => api(`r/${token}`, { method: 'POST', body }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: K.reply(token) })
      setErr(null)
    },
    onError: (e) => setErr(e.message),
  })

  // The same answer for another child of this parent: it goes to that child's own link, like any answer.
  const alsoFor = useMutation({
    mutationFn: (s: { token: string; reply: ReplyKind }) => api(`r/${s.token}`, { method: 'POST', body: { reply: s.reply } }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: K.reply(token) }),
    onError: (e) => setErr(e.message),
  })

  if (q.isLoading) return <Loading page />
  if (isStatus(q.error, 410)) return <main id="main" className="shell"><div className="notice" role="status">{t.reply.ended((q.error as ApiError).message)}</div></main>
  if (q.data?.circle) return <CircleDoor token={token} info={q.data.circle} />
  if (!q.data) return <QueryError page error={q.error} dead={t.reply.dead} onRetry={() => void q.refetch()} />
  const { encounter: e, host, you, messages, alive, series, homeCard, relais, souvenirs, souvenirsOpen, photos, changes: rawChanges, cover, guests, bring: rawBring, slots: rawSlots } = q.data
  const bring = rawBring ?? []
  const slots = rawSlots ?? []
  const canBring = (you.reply === 'yes' || you.reply === 'maybe') && alive
  const changes = rawChanges ?? []
  const fresh = seenAt === null ? [] : changes.filter((c) => c.created_at > seenAt)
  const freshOf = (...fields: ChangeField[]) => fresh.find((c) => fields.includes(c.field))
  // A « Modifié » mark with what it was before, under the row that changed.
  const mark = (c: ChangeRow | undefined) =>
    c ? (
      <>
        {' '}<span className="changed">{t.edit.changed}</span>
        {!isPrivate(c.field) && <small className="was">{t.edit.before} : {showValue(c.field, c.old_value, lang, t.edit.status, t.edit.empty)}</small>}
      </>
    ) : null
  const answered = you.reply !== null && !editing

  // ONE TAP: the answer is saved at once. Everything else is optional and comes after.
  function answer(r: ReplyKind) {
    clearPending(token) // a tap now replaces any answer still waiting for the network
    post.mutate(
      { reply: r },
      {
        onSuccess: () => { clearPending(token); setQueued(null); setEditing(false); setDone(false); setJustAnswered(true) },
        // No network (not a refusal from the server): keep the answer on this device, it is sent when the network returns.
        onError: (e) => { if (!(e instanceof ApiError) && writePending(token, r)) { setQueued(r); setErr(null) } },
      },
    )
  }

  function saveExtras(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault()
    const f = new FormData(ev.currentTarget)
    const body: Record<string, unknown> = { note: String(f.get('note') ?? '').trim() || null, remind: f.get('remind') === 'on' }
    for (const k of ['parentName', 'email', 'phone', 'allergies'] as const) {
      const v = String(f.get(k) ?? '').trim()
      if (v) body[k] = v
    }
    if (you.reply === 'yes') {
      if (e.kind === 'birthday') body.adults = Number(f.get('adults') ?? 1)
      if (you.scope === 'family') body.kids = Number(f.get('kids') ?? 1)
    }
    post.mutate(body, { onSuccess: () => { setDone(true); setJustAnswered(false) } })
  }

  // While the question is still ahead (or behind) the viewport, a slim bar keeps the three answers one tap away.
  const asking = alive && !answered
  const barShown = asking && offscreen
  // One account form, shown under the answer once there is one (a parent who has just said yes is the one who
  // wants to see the friend again), else in the footer. Never before the question: it must not compete with it.
  const claimForm = (
    <ValidForm className="card" style={{ textAlign: 'left' }} onSubmit={(ev) => { ev.preventDefault(); setErr(null); claim.mutate(Object.fromEntries(new FormData(ev.currentTarget).entries())) }}>
      <h2><Icon name="user" />{t.reply.claimTitle}</h2>
      <p className="muted small">{t.reply.claimHint}</p>
      <label className="field"><span><Icon name="user" />{t.reply.parentName}</span><input className="input" name="displayName" required maxLength={60} defaultValue={you.parent_name} autoComplete="given-name" /></label>
      <label className="field"><span><Icon name="mail" />{t.reply.email}</span><input className="input" name="email" type="email" required defaultValue={you.email ?? ''} autoComplete="email" /></label>
      <label className="field"><span><Icon name="lock" />{t.reply.claimPassword}</span><input className="input" name="password" type="password" required minLength={8} autoComplete="new-password" /></label>
      {err && <div className="notice notice--err" role="alert">{err}</div>}
      <button className="btn btn--primary btn--big" disabled={claim.isPending}>{t.reply.claimSend}</button>
    </ValidForm>
  )
  const offerAccount = answered && alive && !me.signedIn
  const calendarAfterYes = alive && answered && (you.reply === 'yes' || you.reply === 'maybe')

  // What you need once you have answered (or want to dig): map, address, notes, calendar, history. The answer comes first.
  const details = (
    <section className="card">
      <dl className="facts">
            {e.map_url && <div><dt><Icon name="map" />{t.reply.map}</dt><dd><a href={e.map_url} target="_blank" rel="noopener noreferrer">{t.reply.openMap}</a>{mark(freshOf('map_url'))}</dd></div>}
            {e.address ? <div><dt><Icon name="home" />{t.reply.addressLabel}</dt><dd>{e.address}{mark(freshOf('address'))}</dd></div> : e.kind !== 'park' && <div><dt><Icon name="home" />{t.reply.addressLabel}</dt><dd className="muted">{t.reply.addressOnYes}</dd></div>}
            {e.note && <div><dt><Icon name="note" />{t.reply.toKnow}</dt><dd>{e.note}{mark(freshOf('note'))}</dd></div>}
            {e.details?.gift && <div><dt><Icon name="gift" />{t.kinds.birthday.giftIs}</dt><dd>{e.details.gift}{mark(freshOf('gift'))}</dd></div>}
      </dl>
          {changes.length > 0 && (
            <details className="why" style={{ marginTop: '0.75rem' }}>
              <summary>{t.edit.history}</summary>
              <ul className="small" style={{ margin: '0.5rem 0 0' }}>
                {changes.map((c, n) => (
                  <li key={n}>
                    <span className="muted">{whenShort(c.created_at, lang)} · {t.edit.fields[c.field]} :</span>{' '}
                    {isPrivate(c.field) ? t.edit.hidden[c.field] : <><s>{showValue(c.field, fromRow(c).from, lang, t.edit.status, t.edit.empty)}</s> → {showValue(c.field, fromRow(c).to, lang, t.edit.status, t.edit.empty)}</>}
                  </li>
                ))}
              </ul>
            </details>
          )}
    </section>
  )

  return (
    <div className={barShown ? 'shell shell--bar' : 'shell'}>
      <Header />
      <OfflineNotice />
      <main id="main" tabIndex={-1}>

      {fresh.length > 0 && (
        <div className="notice notice--changed" role="status">
          <div>
            <strong>{t.edit.updatedSince}</strong>
            <ul className="small" style={{ margin: '0.25rem 0 0' }}>
              {fresh.map((c, n) => (
                <li key={n}>
                  {isPrivate(c.field) ? t.edit.hidden[c.field] : <><span className="muted">{t.edit.fields[c.field]} :</span> <s>{showValue(c.field, fromRow(c).from, lang, t.edit.status, t.edit.empty)}</s> → <strong>{showValue(c.field, fromRow(c).to, lang, t.edit.status, t.edit.empty)}</strong></>}
                </li>
              ))}
            </ul>
          </div>
          {you.reply && alive && !editing && <button className="btn btn--small" onClick={() => setEditing(true)}>{t.edit.changeAnswer}</button>}
        </div>
      )}
      <section className="card">
        {cover && <img className="cover" src={`/api/r/${token}/cover?v=${cover}`} alt="" />}
        <div className="faces" aria-hidden="true">
          {host.coChild && <Face name={host.coChild} colour="var(--accent)" src={host.coChildPhoto ? `/api/r/${token}/avatar/cochild?v=${host.coChildPhoto}` : null} size="lg" />}
          <Face name={host.child_first_name} colour="var(--accent)" src={host.childPhoto ? `/api/r/${token}/avatar/child?v=${host.childPhoto}` : null} size="lg" />
          <Face name={host.parent_name || host.household_name} colour="var(--host)" src={host.parentPhoto ? `/api/r/${token}/avatar/parent?v=${host.parentPhoto}` : null} size="lg" />
        </div>
        <p className="kind" style={{ margin: 0 }}>{t.reply.invitation} · {t.encounters.kind[e.kind]}</p>
        <h1 style={{ marginTop: '0.25rem' }}>{host.coChild ? t.reply.invitesTwo(host.child_first_name, host.coChild, you.child_first_name) : t.reply.invites(host.child_first_name, you.child_first_name)}</h1>
        <p className="muted">{t.reply.organizer(host.parent_name || host.household_name, host.child_first_name)}</p>
        <p><strong>{you.scope === 'friend' ? t.scope.youFriend(you.child_first_name) : t.scope.youFamily}</strong></p>
        <p className="lead">{humanWhen(e.starts_at, lang)}{mark(freshOf('starts_at', 'ends_at'))}</p>
        <p className="muted" style={{ marginTop: 0 }}>
          {e.title}{mark(freshOf('title'))} · {timeOnly(e.starts_at, lang)}{e.ends_at && <><span aria-hidden="true"> → </span><span className="sr-only"> {t.reply.untilWord} </span>{timeOnly(e.ends_at, lang)}</>}
          {e.place && e.place !== e.title && <> · {e.place}{mark(freshOf('place'))}</>}
        </p>
        {e.details?.planB && <p style={{ marginTop: 0 }}><Icon name="umbrella" /><strong>{t.encounters.planB} :</strong> {e.details.planB}{mark(freshOf('planB'))}</p>}
        {e.hereAt && <div className="notice">{t.kinds.park.hereSince(timeOnly(e.hereAt, lang))}</div>}
        {e.status === 'cancelled' && <div className="notice notice--err">{t.encounters.status.cancelled}</div>}
        {e.status === 'postponed' && alive && <div className="notice" role="status">{t.reply.postponed}</div>}
      </section>

      {!alive ? (
        <div className="notice">{t.reply.closed}</div>
      ) : answered ? (
        <div className="card">
          {(done || justAnswered) && <div className="notice notice--ok" role="status"><Icon name="check" />{t.reply.saved}</div>}
          <div className="row">
            <span><span className="muted small">{t.reply.yourReply}</span><br /><strong className={`chip chip--${you.reply}`}>{t.encounters.reply[you.reply!]}</strong>{you.replyNote && <span className="small"> · « {you.replyNote} »</span>}</span>
            <button className="btn btn--small" onClick={() => setEditing(true)}>{t.reply.change}</button>
          </div>
          {alive && you.reply && (q.data.siblings ?? []).map((s) => s.reply !== null && s.reply === you.reply ? (
            <p key={s.token} className="muted small" style={{ margin: '0.5rem 0 0' }}><Icon name="check" />{t.reply.siblingSame(s.child, t.encounters.reply[s.reply])}</p>
          ) : (
            <button key={s.token} className="btn btn--small" style={{ marginTop: '0.5rem' }} disabled={alsoFor.isPending} onClick={() => alsoFor.mutate({ token: s.token, reply: you.reply! })}>{t.reply.siblingAnswer(s.child, t.encounters.reply[you.reply!])}</button>
          ))}
          {calendarAfterYes && (
            <div style={{ marginTop: '0.75rem' }}>
              <a className="btn btn--primary" href={`/api/r/${token}/ics`} download="rencontre.ics"><Icon name="calendar" />{t.reply.calendar}</a>
              <details className="more" style={{ marginTop: '0.5rem' }}>
                <summary>{t.encounters.moreOptions}</summary>
                <a className="btn btn--small" href={`webcal://${location.host}/api/r/${token}/ics?s=1`}>{t.reply.subscribe}</a>
              </details>
            </div>
          )}
          <details className="why" key={String(justAnswered)} open={justAnswered && you.reply === 'yes' && (e.kind === 'birthday' || you.scope === 'family')} style={{ marginTop: '0.75rem' }}>
            <summary>{t.reply.extras}</summary>
            <ValidForm onSubmit={saveExtras} style={{ marginTop: '0.75rem' }}>
              <label className="field"><span><Icon name="note" />{t.reply.note}</span><input className="input" name="note" maxLength={500} placeholder={t.reply.notePlaceholder} defaultValue={you.replyNote ?? ''} /></label>
              <label className="field"><span><Icon name="user" />{t.reply.parentName}</span><input className="input" name="parentName" maxLength={60} defaultValue={you.parent_name} autoComplete="given-name" /></label>
              <label className="field"><span><Icon name="mail" />{t.reply.email}</span><input className="input" name="email" type="email" defaultValue={you.email ?? ''} autoComplete="email" /></label>
              <label className="field"><span><Icon name="phone" />{t.reply.phone}</span><input className="input" name="phone" type="tel" defaultValue={you.phone ?? ''} autoComplete="tel" /></label>
              <label className="field"><span><Icon name="alert" />{t.reply.allergies}</span><input className="input" name="allergies" maxLength={300} defaultValue={you.allergies ?? ''} /></label>
              {you.reply === 'yes' && (you.scope === 'family' || e.kind === 'birthday') && (
                <div className="cluster" style={{ marginBottom: '0.75rem' }}>
                  {you.scope === 'family' && <label className="field" style={{ flex: 1 }}><span><Icon name="users" />{t.scope.kidsLabel}</span><input className="input" name="kids" type="number" min={0} max={20} defaultValue={you.kids ?? 1} /></label>}
                  {e.kind === 'birthday' && <label className="field" style={{ flex: 1 }}><span><Icon name="users" />{t.kinds.birthday.adults}</span><input className="input" name="adults" type="number" min={0} max={20} defaultValue={you.adults ?? 1} /></label>}
                </div>
              )}
              <label className="check"><input type="checkbox" name="remind" defaultChecked={you.remind} /><span><Icon name="bell" />{t.reply.remind}</span></label>
              <WhyMany
                items={[
                  [t.reply.email, 'replyEmail'],
                  [t.reply.phone, 'replyPhone'],
                  [t.reply.allergies, 'replyAllergies'],
                  ...(you.reply === 'yes' && (you.scope === 'family' || e.kind === 'birthday') ? ([[t.scope.kidsLabel, 'headcount']] as [string, 'headcount'][]) : []),
                ]}
              />
              {err && <div className="notice notice--err" role="alert">{err}</div>}
              <button className="btn btn--primary" disabled={post.isPending} style={{ marginTop: '0.75rem' }}>{t.reply.saveExtras}</button>
            </ValidForm>
          </details>
        </div>
      ) : (
        <section className="card">
          <h2 id="reply-question"><Icon name="help" />{t.reply.question}</h2>
          <div className="stack" role="group" aria-labelledby="reply-question" ref={questionRef}>
            <button type="button" className="btn btn--big btn--yes" disabled={post.isPending} onClick={() => answer('yes')}><Icon name="check" />{t.reply.yes}</button>
            <div className="seg">
              <button type="button" className="btn" disabled={post.isPending} onClick={() => answer('maybe')}><Icon name="help" />{t.reply.maybe}</button>
              <button type="button" className="btn" disabled={post.isPending} onClick={() => answer('no')}><Icon name="x" />{t.reply.no}</button>
            </div>
          </div>
          {queued && <div className="notice" role="status" style={{ marginTop: '0.75rem' }}>{t.reply.queued}</div>}
          {err && <div className="notice notice--err" role="alert" style={{ marginTop: '0.75rem' }}>{err}</div>}
        </section>
      )}
      {alive && slots.length > 1 && (
        <section className="card" aria-label={t.slots.title}>
          <h2><Icon name="calendar" />{t.slots.title}</h2>
          <p className="muted small">{t.slots.hint}</p>
          <div className="stack">
            {slots.map((s) => (
              <button type="button" key={s.id} aria-pressed={s.mine} className={`btn ${s.mine ? 'btn--on' : ''}`} disabled={slotPost.isPending} onClick={() => slotPost.mutate({ slot: s.id, on: !s.mine })}>
                {s.mine && <Icon name="check" />}{humanWhen(s.startsAt, lang)} · {timeOnly(s.startsAt, lang)}
              </button>
            ))}
          </div>
        </section>
      )}

      {me.signedIn && <LinkFamilies token={token} />}

      {/* The invitation is the cover, the when and where, and the answer. Everything else is one tap away, and open once you answered. */}
      <details className="fold" open={answered || fresh.length > 0}>
        <summary><span><Icon name="info" />{t.reply.moreAll}</span></summary>
        <div className="stack">
        {details}
  
        {offerAccount && (claiming ? claimForm : (
          <details className="fold" aria-label={t.reply.moreTitle(host.child_first_name)}>
            <summary><span><Icon name="heart" />{t.reply.moreTitle(host.child_first_name)}</span></summary>
            <div>
              <p className="muted small">{t.reply.moreHint}</p>
              <button className="btn" onClick={() => setClaiming(true)}>{t.reply.create}</button>
            </div>
          </details>
        ))}
  
        {guests && (guests.yes.length > 0 || guests.maybe.length > 0) && (
          <details className="fold guests" aria-label={t.roster.guestsTitle}>
            <summary><span><Icon name="users" />{t.roster.guestsTitle}</span></summary>
            <div>
            {guests.yes.length > 0 && <p><strong>{t.roster.yes} ({guests.yes.length})</strong> : {guests.yes.join(', ')}</p>}
            {guests.maybe.length > 0 && <p><strong>{t.roster.maybe} ({guests.maybe.length})</strong> : {guests.maybe.join(', ')}</p>}
            {guests.waiting > 0 && <p className="muted small">{t.roster.waiting(guests.waiting)}</p>}
            <p className="muted small">{t.roster.public}</p>
            </div>
          </details>
        )}
  
        {(bring.length > 0 || canBring) && (
          <section className="card" aria-label={t.bring.title}>
            <h2><Icon name="bag" />{t.bring.title}</h2>
            {bring.map((b) => (
              <div key={b.id} className="row linkrow">
                <span>{b.label} <span className="muted small">· {b.by ? (b.mine ? t.bring.byName(you.parent_name) : t.bring.byName(b.by)) : t.bring.nobody}</span></span>
                {canBring && !b.by && <button className="btn btn--small" disabled={bringPost.isPending} onClick={() => bringPost.mutate({ claim: b.id })}>{t.bring.take}</button>}
                {canBring && b.mine && <button className="btn btn--small" disabled={bringPost.isPending} onClick={() => bringPost.mutate({ release: b.id })}>{t.bring.release}</button>}
              </div>
            ))}
            {canBring ? (
              <ValidForm
                className="cluster"
                style={{ marginTop: '0.5rem' }}
                onSubmit={(ev) => {
                  ev.preventDefault()
                  const f = ev.currentTarget
                  const add = String(new FormData(f).get('add') ?? '').trim()
                  if (add) bringPost.mutate({ add })
                  f.reset()
                }}
              >
                <input className="input" name="add" maxLength={60} placeholder={t.bring.addMine} aria-label={t.bring.addMine} style={{ flex: '1 1 10rem' }} />
                <button className="btn" disabled={bringPost.isPending}>{t.bring.add}</button>
              </ValidForm>
            ) : (
              <p className="muted small" style={{ margin: '0.5rem 0 0' }}>{t.bring.answerFirst}</p>
            )}
          </section>
        )}
  
        {homeCard && <HomeCardView card={homeCard} />}
        {relais && (
          <div className="card">
            <h2><Icon name="home" />{t.kinds.relais.title}</h2>
            {relais.nap && <p style={{ margin: 0 }}><strong>{t.kinds.relais.nap} :</strong> {relais.nap}</p>}
            {relais.ate && <p style={{ margin: 0 }}><strong>{t.kinds.relais.ate} :</strong> {relais.ate}</p>}
            {relais.mood && <p style={{ margin: 0 }}><strong>{t.kinds.relais.mood} :</strong> {relais.mood}</p>}
            {relais.note && <p style={{ margin: 0 }}>{relais.note}</p>}
          </div>
        )}
  
        {souvenirsOpen && (photos || souvenirs.length > 0) && (
          <div className="card">
            <h2><Icon name="camera" />{t.souvenirs.title}</h2>
            <p className="muted small">{t.souvenirs.hint}</p>
            <Why k="photos" />
            <PhotoGrid
              items={souvenirs}
              src={(pid) => `/api/r/${token}/photo/${pid}`}
              enabled={photos}
              onUpload={async (blob) => {
                await api(`r/${token}/photo`, { method: 'POST', body: blob })
                await qc.invalidateQueries({ queryKey: K.reply(token) })
              }}
            />
          </div>
        )}
  
        {series.length > 0 && (
          <details className="fold">
            <summary><span><Icon name="repeat" />{t.reply.seriesTitle} ({series.length})</span></summary>
            <div>
            {series.map((w) => (
              <Link key={w.token} to={`/${paperCode(w.token)}`} className="row linkrow" style={{ textDecoration: 'none' }}>
                <span>{whenShort(w.starts_at, lang)}</span>
                <span className={`chip ${w.reply ? `chip--${w.reply}` : ''}`}>{w.reply ? t.encounters.reply[w.reply] : t.encounters.reply.none}</span>
              </Link>
            ))}
            </div>
          </details>
        )}
  
        {!answered && (
          <details className="fold" aria-label={t.reply.stepsTitle}>
            <summary><span><Icon name="info" />{t.reply.stepsTitle}</span></summary>
            <div>
              <ol className="steps">
                <li className="now">{t.reply.step1}</li>
                <li>{t.reply.step2(host.parent_name || host.household_name)}</li>
                <li>{t.reply.step3}</li>
              </ol>
            </div>
          </details>
        )}
  
        <MessageBoard
          messages={messages}
          canPost={alive}
          posting={post.isPending}
          isHost={false}
          seenKey={token}
          full
          onPost={(text) => post.mutate({ message: text })}
          onDelete={(m) => post.mutate({ deleteMessage: m.id })}
        />
          </div>
      </details>

      </main>
      <footer className="footer muted small">
        <p>{t.reply.whatIs}</p>
        <p><Link to="/confidentialite">{t.privacy.link}</Link></p>
        <p><Link to={`/stop/${token}`}>{t.stop.confirm}</Link></p>
        {me.signedIn || offerAccount ? null : claiming ? claimForm : <button className="btn" onClick={() => setClaiming(true)}>{t.reply.create}</button>}
      </footer>

      {barShown && (
        <div className="answerbar" role="group" aria-label={t.reply.question}>
          <button type="button" className="btn btn--yes answerbar__yes" aria-label={t.reply.yesShort} disabled={post.isPending} onClick={() => answer('yes')}><Icon name="check" />{t.reply.yesShort}</button>
          <button type="button" className="btn" aria-label={t.reply.maybeShort} disabled={post.isPending} onClick={() => answer('maybe')}>{t.reply.maybe}</button>
          <button type="button" className="btn" aria-label={t.reply.noShort} disabled={post.isPending} onClick={() => answer('no')}>{t.reply.noShort}</button>
        </div>
      )}
    </div>
  )
}
