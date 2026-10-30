import { Link, useNavigate, useParams } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { K } from '../lib/query'
import { useLang, useT } from '../i18n'
import { humanWhen, timeOnly, whenShort } from '../lib/format'
import { paperCode } from '../lib/link'
import type { Child, Encounter, Family, InvitationSummary, OpenWindow } from '../lib/types'
import { Icon, BigAction, kindIcon } from '../components/Icon'
import { WindowRow } from '../components/WindowRow'
import { FirstSteps } from '../components/FirstSteps'
import { PartnerNudge, nudgeDue } from '../components/PartnerNudge'
import { useAuth } from '../lib/auth'
import { InstallOffer } from '../components/InstallOffer'

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
export function Encounters({ compact = false }: { compact?: boolean }) {
  const nav = useNavigate()
  const { id: openId } = useParams()
  const { me } = useAuth()
  const t = useT()
  const { lang } = useLang()
  const q = useQuery({ queryKey: K.encounters, queryFn: () => api<{ encounters: Encounter[]; invitations: InvitationSummary[] }>('encounters') })
  const cal = useQuery({ queryKey: K.calendar, queryFn: () => api<Cal>('calendar') })
  const wins = useQuery({ queryKey: K.windows, queryFn: () => api<{ windows: OpenWindow[] }>('windows') })
  const kids = useQuery({ queryKey: K.children, queryFn: () => api<{ children: Child[] }>('children') })
  const fams = useQuery({ queryKey: K.families, queryFn: () => api<{ families: Family[] }>('families') })
  const now = Math.floor(Date.now() / 1000)
  const all = q.data?.encounters ?? []
  const isOver = (e: Encounter) => (e.ends_at ?? e.starts_at + 7200) < now
  const past = all.filter(isOver).reverse()
  const byEnc = new Map<string, InvitationSummary[]>()
  for (const i of q.data?.invitations ?? []) byEnc.set(i.encounter_id, [...(byEnc.get(i.encounter_id) ?? []), i])

  // A recurring rencontre is ONE card: its next date, and « encore N dates » for the rest (they stay reachable from its page).
  const Mine = ({ e, more = 0, hero = false }: { e: Encounter; more?: number; hero?: boolean }) => (
    <Link to={`/rencontres/${e.id}`} className="card card--tap" data-kind={e.kind} aria-current={e.id === openId ? 'page' : undefined} style={e.id === openId ? { boxShadow: '0 0 0 2px var(--accent)' } : undefined}>
      {e.cover && <img className="cover" style={{ height: hero ? '11rem' : '7rem' }} src={`/api/cover/${e.id}?v=${e.cover}`} alt="" loading="lazy" onError={(ev) => { ev.currentTarget.style.display = 'none' }} />}
      <div className="row">
        <strong style={hero ? { fontSize: '1.3rem' } : undefined}><Icon name={kindIcon(e.kind)} />{e.title}</strong>
        {(e.status === 'postponed' || e.status === 'cancelled') && <span className={`chip chip--${e.status}`}>{t.encounters.status[e.status]}</span>}
      </div>
      <p className={hero ? 'meta--row' : 'meta--row muted small'} style={hero ? { fontSize: '1.1rem', fontWeight: 600 } : undefined}>
        <span><Icon name="clock" />{isOver(e) ? whenShort(e.starts_at, lang) : <>{humanWhen(e.starts_at, lang)} · {timeOnly(e.starts_at, lang)}</>}</span>
        {e.place && e.place !== t.encounters.kind[e.kind] && <span><Icon name="pin" />{e.place}</span>}
        {more > 0 && <span>{t.encounters.seriesMore(more)}</span>}
      </p>
      {!isOver(e) && (byEnc.get(e.id) ?? []).length > 0 && (
        <p className="muted small" style={{ margin: '0.35rem 0 0' }}>
          {(['yes', 'maybe', 'no', 'none'] as const).map((k) => ({ k, n: (byEnc.get(e.id) ?? []).filter((i) => (i.reply ?? 'none') === k).length })).filter((x) => x.n > 0).map((x) => `${t.encounters.reply[x.k]} ${x.n}`).join(' · ')}
        </p>
      )}
    </Link>
  )

  // Everything ahead, one list, by date.
  type Entry = { at: number; key: string; node: ReactNode; big?: ReactNode }
  const ahead: Entry[] = []
  const coming = all.filter((x) => !isOver(x))
  const inSeries = (id: string | null | undefined) => (id ? coming.filter((x) => x.series_id === id) : [])
  for (const e of coming) {
    const mates = inSeries(e.series_id)
    // The card of a series is its first date that is not cancelled (the first one when all are).
    const head = mates.find((x) => x.status !== 'cancelled') ?? mates[0]
    if (mates.length > 1 && head.id !== e.id) continue
    ahead.push({ at: e.starts_at, key: `m-${e.id}`, node: <Mine e={e} more={mates.length > 1 ? mates.length - 1 : 0} />, big: <Mine e={e} more={mates.length > 1 ? mates.length - 1 : 0} hero /> })
  }
  for (const it of cal.data?.items ?? []) {
    if (it.type === 'invited') {
      ahead.push({
        at: it.at,
        key: `i-${it.id}`,
        node: (
          <Link to={`/${paperCode(it.token)}`} className="card card--tap" data-kind={it.kind}>
            <div className="row"><strong><Icon name={kindIcon(it.kind)} />{it.title}</strong><span className="chip chip--kind">{t.agenda.invited(it.host ?? '')}</span></div>
            <p className="meta--row muted small">
              <span><Icon name="clock" />{humanWhen(it.at, lang)} · {timeOnly(it.at, lang)}</span>
              {it.place && it.place !== t.encounters.kind[it.kind] && <span><Icon name="pin" />{it.place}</span>}
              <span className={`chip ${it.reply ? `chip--${it.reply}` : ''}`}>{it.reply ? t.encounters.reply[it.reply] : t.encounters.reply.none}</span>
            </p>
          </Link>
        ),
      })
    } else if (it.type === 'window') {
      const w = (wins.data?.windows ?? []).find((x) => x.id === it.id)
      if (w) ahead.push({ at: it.at, key: `w-${it.id}`, node: <WindowRow w={w} /> })
    }
  }
  for (const b of cal.data?.birthdays ?? []) {
    ahead.push({
      at: Math.floor(new Date(b.date + 'T12:00:00').getTime() / 1000),
      key: `b-${b.name}-${b.date}`,
      node: (
        <p className="muted small birthday">
          <Icon name="cake" />{t.agenda.birthday(b.name, b.turns)} · {new Intl.DateTimeFormat(lang === 'fr' ? 'fr-CA' : 'en-CA', { weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(b.date + 'T12:00:00'))}
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
      {compact ? <h2 style={{ marginTop: 0 }}>{t.encounters.title}</h2> : <h1>{t.encounters.title}</h1>}
      <PartnerNudge ready={past.length > 0} />
      <InstallOffer hold={nudgeDue(past.length > 0, me)} />
      {!nothing && <BigAction icon="calendar" href="/rencontres/nouvelle" onClick={() => nav('/rencontres/nouvelle')}>{t.encounters.new}</BigAction>}
      {!ready && <div aria-busy="true" aria-label={t.common.loading}>{[0, 1, 2].map((n) => <div key={n} className="card skeleton" />)}</div>}
      {nothing && <FirstSteps noChild={noChild} noFriend={noFriend} />}
      {ready && !nothing && ahead.length === 0 && <p className="muted">{t.encounters.empty}</p>}
      {ahead.length > 0 && <h2 className="muted small" style={{ marginTop: '1rem' }}>{t.encounters.upcoming}</h2>}
      {ahead.map((x, i) => <div key={x.key}>{i === 0 && x.big ? x.big : x.node}</div>)}
      {past.length > 0 && <h2 className="muted small" style={{ marginTop: '1rem' }}>{t.encounters.past}</h2>}
      {past.map((e) => <Mine key={e.id} e={e} />)}
    </>
  )
}
