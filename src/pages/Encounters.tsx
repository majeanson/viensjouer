import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { K } from '../lib/query'
import { useLang, useT } from '../i18n'
import { whenShort } from '../lib/format'
import { Face } from '../components/Face'
import type { Child, Encounter, InvitationSummary } from '../lib/types'

// The host's list: upcoming first, the last two weeks under it. Each card shows the
// faces invited and their answers.
export function Encounters() {
  const t = useT()
  const { lang } = useLang()
  const q = useQuery({ queryKey: K.encounters, queryFn: () => api<{ encounters: Encounter[]; invitations: InvitationSummary[] }>('encounters') })
  const kids = useQuery({ queryKey: K.children, queryFn: () => api<{ children: Child[] }>('children') })
  const now = Math.floor(Date.now() / 1000)
  const all = q.data?.encounters ?? []
  const upcoming = all.filter((e) => (e.ends_at ?? e.starts_at + 7200) >= now)
  const past = all.filter((e) => (e.ends_at ?? e.starts_at + 7200) < now).reverse()
  const byEnc = new Map<string, InvitationSummary[]>()
  for (const i of q.data?.invitations ?? []) byEnc.set(i.encounter_id, [...(byEnc.get(i.encounter_id) ?? []), i])
  const childOf = (id: string) => kids.data?.children.find((c) => c.id === id)

  const Card = ({ e }: { e: Encounter }) => {
    const c = childOf(e.child_id)
    return (
      <Link to={`/rencontres/${e.id}`} className="card card--tap">
        <div className="row">
          <span className="cluster">{c && <Face name={c.first_name} colour={c.colour} />}<strong>{e.title}</strong></span>
          <span className="chip chip--kind">{t.encounters.kind[e.kind]}</span>
        </div>
        <p className="muted small" style={{ margin: '0.35rem 0' }}>{whenShort(e.starts_at, lang)}{e.place ? ` · ${e.place}` : ''}{e.status !== 'proposed' ? ` · ${t.encounters.status[e.status]}` : ''}</p>
        <div className="cluster">
          {(byEnc.get(e.id) ?? []).map((i) => (
            <span key={i.id} className={`chip ${i.reply ? `chip--${i.reply}` : ''}`}>{i.child_first_name} · {i.reply ? t.encounters.reply[i.reply] : t.encounters.reply.none}</span>
          ))}
        </div>
      </Link>
    )
  }

  return (
    <>
      <div className="row">
        <h1>{t.encounters.title}</h1>
        <Link to="/rencontres/nouvelle" className="btn btn--primary">{t.encounters.new}</Link>
      </div>
      {q.isLoading && <p className="muted">{t.common.loading}</p>}
      {q.data && all.length === 0 && <p className="muted">{t.encounters.empty}</p>}
      {upcoming.length > 0 && <h2 className="muted small" style={{ marginTop: '1rem' }}>{t.encounters.upcoming}</h2>}
      {upcoming.map((e) => <Card key={e.id} e={e} />)}
      {past.length > 0 && <h2 className="muted small" style={{ marginTop: '1rem' }}>{t.encounters.past}</h2>}
      {past.map((e) => <Card key={e.id} e={e} />)}
    </>
  )
}
