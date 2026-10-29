import { useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { K } from '../lib/query'
import { useLang, useT } from '../i18n'
import { whenLong } from '../lib/format'
import { paperCode } from '../lib/link'
import { Icon } from '../components/Icon'
import { Loading } from '../components/Loading'
import { QueryError } from '../components/QueryError'
import type { Child, Encounter, Invitation } from '../lib/types'
import './cards.css'

// « Cartes à imprimer » — one paper card per invited family, four to an A4 sheet: for the cubby at the
// kindergarten, the stroller, the hand of a parent at the park. It carries the two words (the same code as the
// link, so nothing new is a credential), the kind and the date, and NEVER the place or the title (a title is often
// « Au parc Lafontaine »): a card can be read by anyone, the address waits for a « yes » on the reply page.
// The child colours in a box, a drawing frame keeps the little one busy, the parent notes the answer on the host page.
export function Cards() {
  const { id = '' } = useParams()
  const t = useT()
  const { lang } = useLang()
  const q = useQuery({ queryKey: K.encounter(id), queryFn: () => api<{ encounter: Encounter; invitations: Invitation[] }>(`encounters?id=${id}`) })
  const kids = useQuery({ queryKey: K.children, queryFn: () => api<{ children: Child[] }>('children') })
  // `?family=` (from a family's page on Amis) starts with only that family's card ticked; any tick after that is the host's.
  const only = useSearchParams()[0].get('family')
  const [chosenOff, setOff] = useState<Set<string> | null>(null)
  if (q.isLoading) return <Loading />
  if (!q.data) return <QueryError error={q.error} onRetry={() => void q.refetch()} />
  const { encounter: e, invitations } = q.data
  const off = chosenOff ?? new Set(only ? invitations.filter((i) => i.friend_family_id !== only).map((i) => i.id) : [])
  const hostChild = kids.data?.children.find((c) => c.id === e.child_id)?.first_name ?? ''
  const picked = invitations.filter((i) => !off.has(i.id))
  const toggle = (iid: string) => setOff(() => { const n = new Set(off); if (!n.delete(iid)) n.add(iid); return n })

  return (
    <>
      <div className="noprint">
        <Link to={`/rencontres/${e.id}`} className="muted small">← {e.title}</Link>
        <h1>{t.cards.title}</h1>
        <p className="muted">{t.cards.hint}</p>
        {invitations.length === 0 ? (
          <p className="muted">{t.cards.none}</p>
        ) : (
          <>
            <div className="cluster" style={{ margin: '0.5rem 0' }}>
              {invitations.map((i) => (
                <label key={i.id} className="check"><input type="checkbox" checked={!off.has(i.id)} onChange={() => toggle(i.id)} /><span>{i.child_first_name}</span></label>
              ))}
            </div>
            <button className="btn btn--primary" disabled={picked.length === 0} onClick={() => window.print()}><Icon name="note" />{t.cards.print}</button>
          </>
        )}
      </div>
      <div className="sheet">
        {picked.map((i) => (
          <article key={i.id} className="pcard" aria-label={t.cards.forChild(i.child_first_name)}>
            <p className="pcard__for">{t.cards.forChild(i.child_first_name)}</p>
            <h2 className="pcard__title">{t.cards.invites(hostChild)}</h2>
            <p className="pcard__when">{t.encounters.kind[e.kind]} · {whenLong(e.starts_at, lang)}</p>
            <div className="pcard__words">
              <span>{t.cards.where} {location.host}</span>
              <strong>{paperCode(i.token).split('-').join(' · ')}</strong>
              <span>{t.cards.free}</span>
            </div>
            <p className="pcard__label">{t.cards.colour}</p>
            <div className="pcard__boxes">
              {(['yes', 'maybe', 'no'] as const).map((r) => (
                <span key={r}><i aria-hidden="true" />{t.encounters.reply[r]}</span>
              ))}
            </div>
            <div className="pcard__draw"><span>{t.cards.draw(hostChild)}</span></div>
          </article>
        ))}
      </div>
    </>
  )
}
