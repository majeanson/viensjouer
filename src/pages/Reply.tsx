import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiError, api } from '../lib/api'
import { clearPending, readPending, writePending } from '../lib/pendingAnswer'
import { K } from '../lib/query'
import { useLang, useT } from '../i18n'
import { timeOnly, whenDay, whenShort } from '../lib/format'
import { paperCode } from '../lib/link'
import { fromRow, isPrivate, readSeen, seenKey, showValue, writeSeen, type ChangeField, type ChangeRow } from '../lib/changes'
import { useAuth } from '../lib/auth'
import { HomeCardView } from '../components/HomeCard'
import { PhotoGrid } from '../components/PhotoGrid'
import { Why } from '../components/Why'
import { WhyMany } from '../components/WhyMany'
import type { Encounter, HomeCard, Message, Reply as ReplyKind } from '../lib/types'
import { Header } from '../components/Header'
import { Loading } from '../components/Loading'
import { QueryError } from '../components/QueryError'
import { Icon } from '../components/Icon'
import { Face } from '../components/Face'
import { MessageBoard } from '../components/MessageBoard'
import { OfflineNotice } from '../components/ErrorBoundary'

interface Card {
  alive: boolean
  encounter: Omit<Encounter, 'address'> & { address: string | null }
  host: { child_first_name: string; parent_name: string; household_name: string; tz: string; childPhoto?: string | null; parentPhoto?: string | null }
  you: { parent_name: string; email: string | null; phone: string | null; child_first_name: string; allergies: string | null; reply: ReplyKind | null; replyNote: string | null; remind: boolean; adults: number | null; kids: number | null; scope: 'friend' | 'family' }
  homeCard: HomeCard | null
  relais: { nap: string | null; ate: string | null; mood: string | null; note: string | null } | null
  souvenirs: { id: string; author_label: string }[]
  souvenirsOpen: boolean
  photos: boolean
  messages: Message[]
  series: { token: string; starts_at: number; reply: ReplyKind | null }[]
  changes: ChangeRow[]
  cover: string | null
  guests: { yes: string[]; maybe: string[]; waiting: number } | null
  bring: { id: string; label: string; by: string | null; mine: boolean }[]
}

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
  const q = useQuery({ queryKey: K.reply(token), queryFn: () => api<Card>(`r/${token}`), retry: false, refetchInterval: 30_000 })
  const [justAnswered, setJustAnswered] = useState(false)
  const [editing, setEditing] = useState(false)
  const [done, setDone] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [claiming, setClaiming] = useState(false)
  const questionRef = useRef<HTMLElement>(null)
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

  if (q.isLoading) return <Loading page />
  if (!q.data) return <QueryError page error={q.error} dead={t.reply.dead} onRetry={() => void q.refetch()} />
  const { encounter: e, host, you, messages, alive, series, homeCard, relais, souvenirs, souvenirsOpen, photos, changes: rawChanges, cover, guests, bring: rawBring } = q.data
  const bring = rawBring ?? []
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
  const calendarAfterYes = alive && answered && (you.reply === 'yes' || you.reply === 'maybe')

  return (
    <div className={barShown ? 'shell shell--bar' : 'shell'}>
      <Header />
      <OfflineNotice />

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
          <Face name={host.child_first_name} colour="var(--accent)" src={host.childPhoto ? `/api/r/${token}/avatar/child?v=${host.childPhoto}` : null} size="lg" />
          <Face name={host.parent_name || host.household_name} colour="var(--host)" src={host.parentPhoto ? `/api/r/${token}/avatar/parent?v=${host.parentPhoto}` : null} size="lg" />
        </div>
        <p className="kind" style={{ margin: 0 }}>{t.reply.invitation} · {t.encounters.kind[e.kind]}</p>
        <h1 style={{ marginTop: '0.25rem' }}>{t.reply.invites(host.child_first_name, you.child_first_name)}</h1>
        <p className="muted">{t.reply.organizer(host.parent_name || host.household_name, host.child_first_name)}</p>
        <p><strong>{you.scope === 'friend' ? t.scope.youFriend(you.child_first_name) : t.scope.youFamily}</strong></p>
        <dl className="facts">
          <div><dt><Icon name="tag" />{t.reply.what}</dt><dd>{e.title}{mark(freshOf('title'))}</dd></div>
          <div><dt><Icon name="calendar" />{t.reply.when}</dt><dd>{whenDay(e.starts_at, lang)}, {timeOnly(e.starts_at, lang)}{e.ends_at ? ` → ${timeOnly(e.ends_at, lang)}` : ''}{mark(freshOf('starts_at', 'ends_at'))}</dd></div>
          {e.place && <div><dt><Icon name="pin" />{t.reply.where}</dt><dd>{e.place}{mark(freshOf('place'))}</dd></div>}
          {e.map_url && <div><dt><Icon name="map" />{t.reply.map}</dt><dd><a href={e.map_url} target="_blank" rel="noopener noreferrer">{t.reply.openMap}</a>{mark(freshOf('map_url'))}</dd></div>}
          {e.address ? <div><dt><Icon name="home" />{t.reply.addressLabel}</dt><dd>{e.address}{mark(freshOf('address'))}</dd></div> : e.kind !== 'park' && <div><dt><Icon name="home" />{t.reply.addressLabel}</dt><dd className="muted">{t.reply.addressOnYes}</dd></div>}
          {e.note && <div><dt><Icon name="note" />{t.reply.toKnow}</dt><dd>{e.note}{mark(freshOf('note'))}</dd></div>}
          {e.details?.gift && <div><dt><Icon name="gift" />{t.kinds.birthday.giftIs}</dt><dd>{e.details.gift}{mark(freshOf('gift'))}</dd></div>}
        </dl>
        {e.hereAt && <div className="notice">{t.kinds.park.hereSince(timeOnly(e.hereAt, lang))}</div>}
        {e.status === 'cancelled' && <div className="notice notice--err">{t.encounters.status.cancelled}</div>}
        {!calendarAfterYes && (
          <div className="cluster">
            <a className="btn" href={`/api/r/${token}/ics`} download="rencontre.ics">{t.reply.calendar}</a>
            <a className="linkbtn" href={`webcal://${location.host}/api/r/${token}/ics?s=1`}>{t.reply.subscribe}</a>
          </div>
        )}
        {changes.length > 0 && (
          <details className="why" style={{ marginTop: '0.75rem' }}>
            <summary>{t.edit.history}</summary>
            <ul className="small" style={{ margin: '0.4rem 0 0' }}>
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

      {!alive ? (
        <div className="notice">{t.reply.closed}</div>
      ) : answered ? (
        <div className="card">
          {done && <div className="notice">{t.reply.saved}</div>}
          <div className="row">
            <span><span className="muted small">{t.reply.yourReply}</span><br /><strong className={`chip chip--${you.reply}`}>{t.encounters.reply[you.reply!]}</strong>{you.replyNote && <span className="small"> · « {you.replyNote} »</span>}</span>
            <button className="btn btn--ghost" onClick={() => setEditing(true)}>{t.reply.change}</button>
          </div>
          <p className="muted small" style={{ margin: '0.5rem 0 0' }}>{t.reply.hostKnows(host.parent_name || host.household_name)}</p>
          {calendarAfterYes && (
            <div className="cluster" style={{ marginTop: '0.75rem' }}>
              <a className="btn btn--primary" href={`/api/r/${token}/ics`} download="rencontre.ics"><Icon name="calendar" />{t.reply.calendar}</a>
              <a className="linkbtn" href={`webcal://${location.host}/api/r/${token}/ics?s=1`}>{t.reply.subscribe}</a>
            </div>
          )}
          <details className="why" key={String(justAnswered)} open={justAnswered && you.reply === 'yes' && (e.kind === 'birthday' || you.scope === 'family')} style={{ marginTop: '0.75rem' }}>
            <summary>{t.reply.extras}</summary>
            <form onSubmit={saveExtras} style={{ marginTop: '0.75rem' }}>
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
              {err && <div className="notice notice--err">{err}</div>}
              <button className="btn btn--primary" disabled={post.isPending} style={{ marginTop: '0.75rem' }}>{t.reply.saveExtras}</button>
            </form>
          </details>
        </div>
      ) : (
        <section className="card" ref={questionRef}>
          <h3><Icon name="help" />{t.reply.question}</h3>
          <div className="stack">
            <button type="button" className="btn btn--big btn--yes" disabled={post.isPending} onClick={() => answer('yes')}><Icon name="check" />{t.reply.yes}</button>
            <div className="seg">
              <button type="button" className="btn" disabled={post.isPending} onClick={() => answer('maybe')}><Icon name="help" />{t.reply.maybe}</button>
              <button type="button" className="btn" disabled={post.isPending} onClick={() => answer('no')}><Icon name="x" />{t.reply.no}</button>
            </div>
          </div>
          {queued && <div className="notice" role="status" style={{ marginTop: '0.75rem' }}>{t.reply.queued}</div>}
          {err && <div className="notice notice--err" style={{ marginTop: '0.75rem' }}>{err}</div>}
          <p className="muted small" style={{ margin: '0.75rem 0 0' }}>{t.reply.oneTap}</p>
        </section>
      )}

      {guests && (guests.yes.length > 0 || guests.maybe.length > 0) && (
        <section className="card guests" aria-label={t.roster.guestsTitle}>
          <h3><Icon name="users" />{t.roster.guestsTitle}</h3>
          {guests.yes.length > 0 && <p><strong>{t.roster.yes} ({guests.yes.length})</strong> : {guests.yes.join(', ')}</p>}
          {guests.maybe.length > 0 && <p><strong>{t.roster.maybe} ({guests.maybe.length})</strong> : {guests.maybe.join(', ')}</p>}
          {guests.waiting > 0 && <p className="muted small">{t.roster.waiting(guests.waiting)}</p>}
          <p className="muted small">{t.roster.public}</p>
        </section>
      )}

      {(bring.length > 0 || canBring) && (
        <section className="card" aria-label={t.bring.title}>
          <h3><Icon name="bag" />{t.bring.title}</h3>
          {bring.map((b) => (
            <div key={b.id} className="row linkrow">
              <span>{b.label} <span className="muted small">· {b.by ? (b.mine ? t.bring.byName(you.parent_name) : t.bring.byName(b.by)) : t.bring.nobody}</span></span>
              {canBring && !b.by && <button className="btn btn--small" disabled={bringPost.isPending} onClick={() => bringPost.mutate({ claim: b.id })}>{t.bring.take}</button>}
              {canBring && b.mine && <button className="linkbtn" disabled={bringPost.isPending} onClick={() => bringPost.mutate({ release: b.id })}>{t.bring.release}</button>}
            </div>
          ))}
          {canBring ? (
            <form
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
            </form>
          ) : (
            <p className="muted small" style={{ margin: '0.5rem 0 0' }}>{t.bring.answerFirst}</p>
          )}
        </section>
      )}

      {homeCard && <HomeCardView card={homeCard} />}
      {relais && (
        <div className="card">
          <h3><Icon name="home" />{t.kinds.relais.title}</h3>
          {relais.nap && <p style={{ margin: 0 }}><strong>{t.kinds.relais.nap} :</strong> {relais.nap}</p>}
          {relais.ate && <p style={{ margin: 0 }}><strong>{t.kinds.relais.ate} :</strong> {relais.ate}</p>}
          {relais.mood && <p style={{ margin: 0 }}><strong>{t.kinds.relais.mood} :</strong> {relais.mood}</p>}
          {relais.note && <p style={{ margin: 0 }}>{relais.note}</p>}
        </div>
      )}

      {souvenirsOpen && (photos || souvenirs.length > 0) && (
        <div className="card">
          <h3><Icon name="camera" />{t.souvenirs.title}</h3>
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
        <div className="card">
          <h3><Icon name="repeat" />{t.reply.seriesTitle}</h3>
          <p className="muted small">{t.reply.seriesHint}</p>
          {series.map((w) => (
            <Link key={w.token} to={`/${paperCode(w.token)}`} className="row linkrow" style={{ textDecoration: 'none' }}>
              <span>{whenShort(w.starts_at, lang)}</span>
              <span className={`chip ${w.reply ? `chip--${w.reply}` : ''}`}>{w.reply ? t.encounters.reply[w.reply] : t.encounters.reply.none}</span>
            </Link>
          ))}
        </div>
      )}

      <section className="card">
        <h2><Icon name="info" />{t.reply.stepsTitle}</h2>
        <ol className="steps">
          <li className={answered ? 'done' : 'now'}>{t.reply.step1}</li>
          <li className={answered ? 'done' : ''}>{t.reply.step2(host.parent_name || host.household_name)}</li>
          <li className={answered && you.reply === 'yes' ? 'now' : ''}>{t.reply.step3}</li>
        </ol>
      </section>

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

      <footer className="footer muted small">
        <p>{t.reply.whatIs}</p>
        <p><Link to="/confidentialite">{t.privacy.link}</Link></p>
        {me.signedIn ? null : claiming ? (
          <form className="card" style={{ textAlign: 'left' }} onSubmit={(ev) => { ev.preventDefault(); setErr(null); claim.mutate(Object.fromEntries(new FormData(ev.currentTarget).entries())) }}>
            <h3><Icon name="user" />{t.reply.claimTitle}</h3>
            <p className="muted small">{t.reply.claimHint}</p>
            <label className="field"><span><Icon name="user" />{t.reply.parentName}</span><input className="input" name="displayName" required maxLength={60} defaultValue={you.parent_name} autoComplete="given-name" /></label>
            <label className="field"><span><Icon name="mail" />{t.reply.email}</span><input className="input" name="email" type="email" required defaultValue={you.email ?? ''} autoComplete="email" /></label>
            <label className="field"><span><Icon name="lock" />{t.reply.claimPassword}</span><input className="input" name="password" type="password" required minLength={8} autoComplete="new-password" /></label>
            {err && <div className="notice notice--err">{err}</div>}
            <button className="btn btn--primary btn--big" disabled={claim.isPending}>{t.reply.claimSend}</button>
          </form>
        ) : (
          <button className="btn btn--ghost" onClick={() => setClaiming(true)}>{t.reply.create}</button>
        )}
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
