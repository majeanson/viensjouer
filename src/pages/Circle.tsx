import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { K } from '../lib/query'
import { useLang, useT } from '../i18n'
import { ageLabel, whenShort } from '../lib/format'
import { Face } from '../components/Face'

interface Linked {
  linkId: string
  childName: string | null
  childBirthdate: string | null
  parentName: string | null
  householdName: string | null
  lastAt: number | null
  nextAt: number | null
}
interface CircleData {
  children: { child: { id: string; first_name: string; birthdate: string | null; colour: string }; linked: Linked[] }[]
  book: { id: string; parent_name: string; child_first_name: string }[]
}

// « Le cercle » — per child, the friends whose family has an account and a live link
// (faces + the last and next date, never how often), then the book-only friends.
export function Circle() {
  const t = useT()
  const { lang } = useLang()
  const qc = useQueryClient()
  const q = useQuery({ queryKey: K.circle, queryFn: () => api<CircleData>('circle') })
  const cut = useMutation({
    mutationFn: (linkId: string) => api('circle', { method: 'DELETE', body: { linkId } }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: K.circle })
      void qc.invalidateQueries({ queryKey: K.families })
    },
  })
  if (q.isLoading) return <p className="muted">{t.common.loading}</p>
  if (!q.data) return <p className="notice notice--err">{t.common.error}</p>
  const none = q.data.children.every((c) => c.linked.length === 0) && q.data.book.length === 0
  return (
    <>
      <h1>{t.circle.title}</h1>
      <p className="muted small">{t.circle.hint}</p>
      {none && <p className="muted">{t.circle.empty} <Link to="/familles">{t.families.add}</Link></p>}
      {q.data.children.map(({ child, linked }) => (
        <section key={child.id} className="card">
          <h2 className="cluster"><Face name={child.first_name} colour={child.colour} />{child.first_name}</h2>
          {linked.length === 0 && <p className="muted small">{t.circle.noneLinked}</p>}
          {linked.map((l) => (
            <div key={l.linkId} className="linkrow">
              <div className="row">
                <span className="cluster"><Face name={l.childName ?? '?'} /><span><strong>{l.childName}</strong> <span className="muted small">{ageLabel(l.childBirthdate, lang)} · {l.parentName}</span></span></span>
                <button className="btn btn--ghost btn--danger" onClick={() => confirm(t.circle.cutConfirm) && cut.mutate(l.linkId)}>{t.circle.cut}</button>
              </div>
              <p className="muted small" style={{ margin: 0 }}>
                {l.nextAt ? `${t.circle.next} ${whenShort(l.nextAt, lang)}` : l.lastAt ? `${t.circle.last} ${whenShort(l.lastAt, lang)}` : t.circle.never}
              </p>
            </div>
          ))}
        </section>
      ))}
      {q.data.book.length > 0 && (
        <section className="card">
          <h3>{t.circle.bookOnly}</h3>
          <p className="muted small">{t.circle.bookOnlyHint}</p>
          {q.data.book.map((b) => (
            <div key={b.id} className="cluster"><Face name={b.child_first_name} /><span><strong>{b.child_first_name}</strong> <span className="muted small">· {b.parent_name}</span></span></div>
          ))}
        </section>
      )}
    </>
  )
}
