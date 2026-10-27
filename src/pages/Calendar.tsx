import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { K } from '../lib/query'
import { useLang, useT } from '../i18n'
import { whenShort } from '../lib/format'
import { paperCode } from '../lib/link'
import type { Lang } from '../i18n'

type Item =
  | { at: number; type: 'mine'; id: string; title: string; kind: 'park' | 'home' | 'birthday'; place: string | null; status: string }
  | { at: number; type: 'invited'; id: string; title: string; kind: 'park' | 'home' | 'birthday'; place: string | null; token: string; reply: 'yes' | 'no' | 'maybe' | null; host: string | null }
  | { at: number; type: 'window'; id: string; endsAt: number; note: string | null }
interface Cal {
  items: Item[]
  birthdays: { date: string; name: string; turns: number; whose: 'mine' | 'friend' }[]
  today: string
}

const dayLabel = (ymd: string, lang: Lang) => new Intl.DateTimeFormat(lang === 'fr' ? 'fr-CA' : 'en-CA', { weekday: 'short', day: 'numeric', month: 'long' }).format(new Date(ymd + 'T12:00:00'))

// « Le calendrier du cercle » — the next four months in one list: my rencontres, the ones
// linked families invite me to, my open windows, and the birthdays (derived from the
// birthdates, never stored as events). Nothing counted, nothing ranked.
export function Calendar() {
  const t = useT()
  const { lang } = useLang()
  const q = useQuery({ queryKey: K.calendar, queryFn: () => api<Cal>('calendar') })
  if (q.isLoading) return <p className="muted">{t.common.loading}</p>
  if (!q.data) return <p className="notice notice--err">{t.common.error}</p>
  const { items, birthdays } = q.data
  return (
    <>
      <h1>{t.calendar.title}</h1>
      <p className="muted small">{t.calendar.hint}</p>
      {items.length === 0 && birthdays.length === 0 && <p className="muted">{t.calendar.empty}</p>}

      {items.map((it) => (
        <div key={`${it.type}-${it.id}`} className="card">
          {it.type === 'mine' && (
            <Link to={`/rencontres/${it.id}`} className="card--tap" style={{ textDecoration: 'none' }}>
              <div className="row"><strong>{it.title}</strong><span className="kind">{t.encounters.kind[it.kind]}</span></div>
              <p className="muted small" style={{ margin: '0.3rem 0 0' }}>{whenShort(it.at, lang)}{it.place ? ` · ${it.place}` : ''}</p>
            </Link>
          )}
          {it.type === 'invited' && (
            <Link to={`/${paperCode(it.token)}`} className="card--tap" style={{ textDecoration: 'none' }}>
              <div className="row"><strong>{it.title}</strong><span className="chip chip--kind">{t.calendar.invitedBy(it.host ?? '')}</span></div>
              <p className="muted small" style={{ margin: '0.3rem 0 0' }}>{whenShort(it.at, lang)}{it.place ? ` · ${it.place}` : ''} · {it.reply ? t.encounters.reply[it.reply] : t.encounters.reply.none}</p>
            </Link>
          )}
          {it.type === 'window' && (
            <Link to="/fenetres" className="card--tap" style={{ textDecoration: 'none' }}>
              <div className="row"><strong>{t.calendar.window}</strong><span className="chip">{t.windows.chip}</span></div>
              <p className="muted small" style={{ margin: '0.3rem 0 0' }}>{whenShort(it.at, lang)} → {whenShort(it.endsAt, lang)}{it.note ? ` · ${it.note}` : ''}</p>
            </Link>
          )}
        </div>
      ))}

      {birthdays.length > 0 && (
        <>
          <h2 className="muted small" style={{ marginTop: '1.5rem' }}>{t.calendar.birthdays}</h2>
          {birthdays.map((b) => (
            <div key={`${b.name}-${b.date}`} className="card row">
              <span><strong>{b.name}</strong> <span className="muted small">{t.calendar.turns(b.turns)}</span></span>
              <span className="muted small">{dayLabel(b.date, lang)}</span>
            </div>
          ))}
        </>
      )}
    </>
  )
}
