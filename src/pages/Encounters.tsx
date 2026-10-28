import { Link } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { K } from '../lib/query'
import { useLang, useT } from '../i18n'
import { whenShort } from '../lib/format'
import { Rel } from '../components/Rel'
import { paperCode } from '../lib/link'
import type { Child, Encounter, Family, InvitationSummary } from '../lib/types'
import { Icon, kindIcon } from '../components/Icon'

type Reply = 'yes' | 'no' | 'maybe' | null
type CalItem =
  | { at: number; type: 'mine'; id: string }
  | { at: number; type: 'invited'; id: string; title: string; kind: 'park' | 'home' | 'birthday'; place: string | null; token: string; reply: Reply; host: string | null }
  | { at: number; type: 'window'; id: string; endsAt: number; note: string | null }
interface Cal {
  items: CalItem[]
  birthdays: { date: string; name: string; turns: number; whose: 'mine' | 'friend' }[]
}

// One agenda. What I host (with the faces invited and their answers), what others invite me to, my
// « je suis libre » moments and the birthdays, in date order. The last two weeks sit below.
export function Encounters() {
  const t = useT()
  const { lang } = useLang()
  const q = useQuery({ queryKey: K.encounters, queryFn: () => api<{ encounters: Encounter[]; invitations: InvitationSummary[] }>('encounters') })
  const cal = useQuery({ queryKey: K.calendar, queryFn: () => api<Cal>('calendar') })
  const kids = useQuery({ queryKey: K.children, queryFn: () => api<{ children: Child[] }>('children') })
  const fams = useQuery({ queryKey: K.families, queryFn: () => api<{ families: Family[] }>('families') })
  const now = Math.floor(Date.now() / 1000)
  const all = q.data?.encounters ?? []
  const isOver = (e: Encounter) => (e.ends_at ?? e.starts_at + 7200) < now
  const past = all.filter(isOver).reverse()
  const byEnc = new Map<string, InvitationSummary[]>()
  for (const i of q.data?.invitations ?? []) byEnc.set(i.encounter_id, [...(byEnc.get(i.encounter_id) ?? []), i])

  const Mine = ({ e }: { e: Encounter }) => (
    <Link to={`/rencontres/${e.id}`} className="card card--tap">
      <div className="row">
        <span className="cluster"><strong>{e.title}</strong></span>
      </div>
      <p className="meta--row muted small">
        <span><Icon name={kindIcon(e.kind)} />{t.encounters.kind[e.kind]}</span>
        <span><Icon name="clock" />{whenShort(e.starts_at, lang)}<Rel at={e.starts_at} /></span>
        {e.place && <span><Icon name="pin" />{e.place}</span>}
        {e.status !== 'proposed' && <span className={`chip chip--${e.status}`}>{t.encounters.status[e.status]}</span>}
      </p>
      <div className="cluster">
        {(byEnc.get(e.id) ?? []).map((i) => (
          <span key={i.id} className={`chip ${i.reply ? `chip--${i.reply}` : ''}`}>{i.child_first_name} · {i.reply ? t.encounters.reply[i.reply] : t.encounters.reply.none}</span>
        ))}
      </div>
    </Link>
  )

  // Everything ahead, one list, by date.
  type Entry = { at: number; key: string; node: ReactNode }
  const ahead: Entry[] = []
  for (const e of all.filter((x) => !isOver(x))) ahead.push({ at: e.starts_at, key: `m-${e.id}`, node: <Mine e={e} /> })
  for (const it of cal.data?.items ?? []) {
    if (it.type === 'invited') {
      ahead.push({
        at: it.at,
        key: `i-${it.id}`,
        node: (
          <Link to={`/${paperCode(it.token)}`} className="card card--tap">
            <div className="row"><strong>{it.title}</strong><span className="chip chip--kind">{t.agenda.invited(it.host ?? '')}</span></div>
            <p className="meta--row muted small">
              <span><Icon name={kindIcon(it.kind)} />{t.encounters.kind[it.kind]}</span>
              <span><Icon name="clock" />{whenShort(it.at, lang)}<Rel at={it.at} /></span>
              {it.place && <span><Icon name="pin" />{it.place}</span>}
              <span className={`chip ${it.reply ? `chip--${it.reply}` : ''}`}>{it.reply ? t.encounters.reply[it.reply] : t.encounters.reply.none}</span>
            </p>
          </Link>
        ),
      })
    } else if (it.type === 'window') {
      ahead.push({
        at: it.at,
        key: `w-${it.id}`,
        node: (
          <Link to="/fenetres" className="card card--tap">
            <div className="row"><strong><Icon name="sparkle" />{t.agenda.free}</strong><span className="chip">{t.windows.chip}</span></div>
            <p className="meta--row muted small">
              <span><Icon name="clock" />{whenShort(it.at, lang)} → {whenShort(it.endsAt, lang)}</span>
              {it.note && <span><Icon name="note" />{it.note}</span>}
            </p>
          </Link>
        ),
      })
    }
  }
  for (const b of cal.data?.birthdays ?? []) {
    ahead.push({
      at: Math.floor(new Date(b.date + 'T12:00:00').getTime() / 1000),
      key: `b-${b.name}-${b.date}`,
      node: (
        <p className="muted small birthday">
          <span aria-hidden="true">◦</span> {t.agenda.birthday(b.name, b.turns)} · {new Intl.DateTimeFormat(lang === 'fr' ? 'fr-CA' : 'en-CA', { weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(b.date + 'T12:00:00'))}
        </p>
      ),
    })
  }
  ahead.sort((a, b) => a.at - b.at)

  const ready = q.data && cal.data && kids.data && fams.data
  const nothing = ready && ahead.length === 0 && past.length === 0
  const noChild = (kids.data?.children ?? []).length === 0
  const noFriend = (fams.data?.families ?? []).length === 0

  return (
    <>
      <div className="row">
        <h1>{t.encounters.title}</h1>
        <Link to="/rencontres/nouvelle" className="btn btn--primary">{t.encounters.new}</Link>
      </div>
      {!ready && <div aria-busy="true" aria-label={t.common.loading}>{[0, 1, 2].map((n) => <div key={n} className="card skeleton" />)}</div>}
      {nothing && (
        <div className="card">
          <h2><Icon name="check" />{t.first.title}</h2>
          <ol className="steps">
            <li className={noChild ? 'now' : 'done'}>{noChild ? t.first.child : t.first.childDone}</li>
            <li className={noChild ? '' : noFriend ? 'now' : 'done'}>{noFriend ? t.first.friend : t.first.friendDone}</li>
            <li className={noChild || noFriend ? '' : 'now'}>{noChild || noFriend ? t.first.later : t.first.go}</li>
          </ol>
          {noChild ? <Link to="/enfants" className="btn btn--primary">{t.first.childBtn}</Link> : noFriend ? <Link to="/amis" className="btn btn--primary">{t.first.friendBtn}</Link> : <Link to="/rencontres/nouvelle" className="btn btn--primary">{t.encounters.new}</Link>}
        </div>
      )}
      {ready && !nothing && ahead.length === 0 && <p className="muted">{t.encounters.empty}</p>}
      {ahead.length > 0 && <h2 className="muted small" style={{ marginTop: '1rem' }}>{t.encounters.upcoming}</h2>}
      {ahead.map((x) => <div key={x.key}>{x.node}</div>)}
      {past.length > 0 && <h2 className="muted small" style={{ marginTop: '1rem' }}>{t.encounters.past}</h2>}
      {past.map((e) => <Mine key={e.id} e={e} />)}
    </>
  )
}
