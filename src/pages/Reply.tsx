import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, isStatus } from '../lib/api'
import { K } from '../lib/query'
import { useLang, useT } from '../i18n'
import { timeOnly, whenDay, whenShort } from '../lib/format'
import { paperCode } from '../lib/link'
import { fromRow, isPrivate, readSeen, seenKey, showValue, writeSeen, type ChangeField, type ChangeRow } from '../lib/changes'
import { useAuth } from '../lib/auth'
import { HomeCardView } from '../components/HomeCard'
import { PhotoGrid } from '../components/PhotoGrid'
import { Why } from '../components/Why'
import type { Encounter, HomeCard, Message, Reply as ReplyKind } from '../lib/types'
import { Header } from '../components/Header'

interface Card {
  alive: boolean
  encounter: Omit<Encounter, 'address'> & { address: string | null }
  host: { child_first_name: string; parent_name: string; household_name: string; tz: string }
  you: { parent_name: string; email: string | null; phone: string | null; child_first_name: string; allergies: string | null; reply: ReplyKind | null; replyNote: string | null; remind: boolean; adults: number | null; kids: number | null; scope: 'friend' | 'family' }
  homeCard: HomeCard | null
  relais: { nap: string | null; ate: string | null; mood: string | null; note: string | null } | null
  souvenirs: { id: string; author_label: string }[]
  souvenirsOpen: boolean
  photos: boolean
  messages: Message[]
  series: { token: string; starts_at: number; reply: ReplyKind | null }[]
  changes: ChangeRow[]
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
  const [reply, setReply] = useState<ReplyKind | null>(null)
  const [editing, setEditing] = useState(false)
  const [done, setDone] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [claiming, setClaiming] = useState(false)
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

  const claim = useMutation({
    mutationFn: (body: Record<string, unknown>) => api(`r/${token}/claim`, { method: 'POST', body }),
    onSuccess: async () => {
      await refresh()
      nav('/cercle', { replace: true })
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

  if (q.isLoading) return <p className="shell muted">{t.common.loading}</p>
  if (!q.data) return <div className="shell"><p className="notice notice--err">{isStatus(q.error, 404) ? t.reply.dead : t.common.error}</p></div>
  const { encounter: e, host, you, messages, alive, series, homeCard, relais, souvenirs, souvenirsOpen, photos, changes: rawChanges } = q.data
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
  const chosen = reply ?? you.reply
  const answered = you.reply !== null && !editing

  function submit(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault()
    if (!chosen) return
    const f = new FormData(ev.currentTarget)
    const body: Record<string, unknown> = { reply: chosen, note: f.get('note') || null, remind: f.get('remind') === 'on' }
    for (const k of ['parentName', 'email', 'phone', 'allergies'] as const) {
      const v = String(f.get(k) ?? '').trim()
      if (v) body[k] = v
    }
    if (chosen === 'yes') {
      if (e.kind === 'birthday') body.adults = Number(f.get('adults') ?? 1)
      if (you.scope === 'family') body.kids = Number(f.get('kids') ?? 1)
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
      <Header />

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
        <p className="kind" style={{ margin: 0 }}>{t.reply.invitation} · {t.encounters.kind[e.kind]}</p>
        <h1 style={{ marginTop: '0.25rem' }}>{t.reply.invites(host.child_first_name, you.child_first_name)}</h1>
        <p className="muted">{t.reply.organizer(host.parent_name || host.household_name, host.child_first_name)}</p>
        <p><strong>{you.scope === 'friend' ? t.scope.youFriend(you.child_first_name) : t.scope.youFamily}</strong></p>
        <dl className="facts">
          <div><dt>{t.reply.what}</dt><dd>{e.title}{mark(freshOf('title'))}</dd></div>
          <div><dt>{t.reply.when}</dt><dd>{whenDay(e.starts_at, lang)}, {timeOnly(e.starts_at, lang)}{e.ends_at ? ` → ${timeOnly(e.ends_at, lang)}` : ''}{mark(freshOf('starts_at', 'ends_at'))}</dd></div>
          {e.place && <div><dt>{t.reply.where}</dt><dd>{e.place}{mark(freshOf('place'))}</dd></div>}
          {e.map_url && <div><dt>{t.reply.map}</dt><dd><a href={e.map_url} target="_blank" rel="noopener noreferrer">{t.reply.openMap}</a>{mark(freshOf('map_url'))}</dd></div>}
          {e.address ? <div><dt>{t.reply.addressLabel}</dt><dd>{e.address}{mark(freshOf('address'))}</dd></div> : e.kind !== 'park' && <div><dt>{t.reply.addressLabel}</dt><dd className="muted">{t.reply.addressOnYes}</dd></div>}
          {e.note && <div><dt>{t.reply.toKnow}</dt><dd>{e.note}{mark(freshOf('note'))}</dd></div>}
          {e.details?.gift && <div><dt>{t.kinds.birthday.giftIs}</dt><dd>{e.details.gift}{mark(freshOf('gift'))}</dd></div>}
        </dl>
        {e.hereAt && <div className="notice">{t.kinds.park.hereSince(timeOnly(e.hereAt, lang))}</div>}
        {e.status === 'cancelled' && <div className="notice notice--err">{t.encounters.status.cancelled}</div>}
        <a className="btn" href={`/api/r/${token}/ics`} download="rencontre.ics">{t.reply.calendar}</a>
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

      <section className="card">
        <h2>{t.reply.stepsTitle}</h2>
        <ol className="steps">
          <li className={answered ? 'done' : 'now'}>{t.reply.step1}</li>
          <li className={answered ? 'done' : ''}>{t.reply.step2(host.parent_name || host.household_name)}</li>
          <li className={answered && you.reply === 'yes' ? 'now' : ''}>{t.reply.step3}</li>
        </ol>
      </section>

      {homeCard && <HomeCardView card={homeCard} />}
      {relais && (
        <div className="card">
          <h3>{t.kinds.relais.title}</h3>
          {relais.nap && <p style={{ margin: 0 }}><strong>{t.kinds.relais.nap} :</strong> {relais.nap}</p>}
          {relais.ate && <p style={{ margin: 0 }}><strong>{t.kinds.relais.ate} :</strong> {relais.ate}</p>}
          {relais.mood && <p style={{ margin: 0 }}><strong>{t.kinds.relais.mood} :</strong> {relais.mood}</p>}
          {relais.note && <p style={{ margin: 0 }}>{relais.note}</p>}
        </div>
      )}

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
          <label className="field"><span>{t.reply.email}</span><input className="input" name="email" type="email" defaultValue={you.email ?? ''} autoComplete="email" /><Why k="replyEmail" /></label>
          <label className="field"><span>{t.reply.phone}</span><input className="input" name="phone" type="tel" defaultValue={you.phone ?? ''} autoComplete="tel" /><Why k="replyPhone" /></label>
          <label className="field"><span>{t.reply.allergies}</span><input className="input" name="allergies" maxLength={300} defaultValue={you.allergies ?? ''} /><Why k="replyAllergies" /></label>
          {chosen === 'yes' && (you.scope === 'family' || e.kind === 'birthday') && (
            <div className="cluster" style={{ marginBottom: '0.75rem' }}>
              {you.scope === 'family' && <label className="field" style={{ flex: 1 }}><span>{t.scope.kidsLabel}</span><input className="input" name="kids" type="number" min={0} max={20} defaultValue={you.kids ?? 1} /><Why k="headcount" /></label>}
              {e.kind === 'birthday' && <label className="field" style={{ flex: 1 }}><span>{t.kinds.birthday.adults}</span><input className="input" name="adults" type="number" min={0} max={20} defaultValue={you.adults ?? 1} /></label>}
            </div>
          )}
          <label className="check"><input type="checkbox" name="remind" defaultChecked={you.remind} /><span>{t.reply.remind}</span></label>
          {err && <div className="notice notice--err">{err}</div>}
          <button className="btn btn--primary btn--big" disabled={!chosen || post.isPending}>{t.reply.send}</button>
        </form>
      )}

      {souvenirsOpen && (photos || souvenirs.length > 0) && (
        <div className="card">
          <h3>{t.souvenirs.title}</h3>
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
          <h3>{t.reply.seriesTitle}</h3>
          <p className="muted small">{t.reply.seriesHint}</p>
          {series.map((w) => (
            <Link key={w.token} to={`/${paperCode(w.token)}`} className="row linkrow" style={{ textDecoration: 'none' }}>
              <span>{whenShort(w.starts_at, lang)}</span>
              <span className={`chip ${w.reply ? `chip--${w.reply}` : ''}`}>{w.reply ? t.encounters.reply[w.reply] : t.encounters.reply.none}</span>
            </Link>
          ))}
        </div>
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
        <p>{t.reply.whatIs}</p>
        <p><Link to="/confidentialite">{t.privacy.link}</Link></p>
        {me.signedIn ? null : claiming ? (
          <form className="card" style={{ textAlign: 'left' }} onSubmit={(ev) => { ev.preventDefault(); setErr(null); claim.mutate(Object.fromEntries(new FormData(ev.currentTarget).entries())) }}>
            <h3>{t.reply.claimTitle}</h3>
            <p className="muted small">{t.reply.claimHint}</p>
            <label className="field"><span>{t.reply.parentName}</span><input className="input" name="displayName" required maxLength={60} defaultValue={you.parent_name} autoComplete="given-name" /></label>
            <label className="field"><span>{t.reply.email}</span><input className="input" name="email" type="email" required defaultValue={you.email ?? ''} autoComplete="email" /></label>
            <label className="field"><span>{t.reply.claimPassword}</span><input className="input" name="password" type="password" required minLength={8} autoComplete="new-password" /></label>
            {err && <div className="notice notice--err">{err}</div>}
            <button className="btn btn--primary btn--big" disabled={claim.isPending}>{t.reply.claimSend}</button>
          </form>
        ) : (
          <button className="btn btn--ghost" onClick={() => setClaiming(true)}>{t.reply.create}</button>
        )}
      </footer>
    </div>
  )
}
