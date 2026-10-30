import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { api } from '../lib/api'
import { K } from '../lib/query'
import { useLang, useT } from '../i18n'
import { ageLabel, whenShort } from '../lib/format'
import { colourOf } from '../lib/palette'
import { Face } from '../components/Face'
import { WhyMany } from '../components/WhyMany'
import { Why } from '../components/Why'
import { ImportFriends } from '../components/ImportFriends'
import { InvitedBy } from '../components/InvitedBy'
import { CircleInvite } from '../components/CircleInvite'
import { Groups } from '../components/Groups'
import { useDeferredRemove } from '../lib/toast'
import type { Family, Group } from '../lib/types'
import { Icon, BigAction, type IconName } from '../components/Icon'

interface Linked {
  linkId: string
  otherHousehold: string
  childName: string | null
  parentName: string | null
  lastAt: number | null
  nextAt: number | null
}
interface CircleData {
  children: { child: { id: string }; linked: Linked[] }[]
}

interface Past {
  id: string
  title: string
  startsAt: number
  place: string | null
}

// « Déjà ensemble » — the last few rencontres this family came to, opened on demand. Dates and places only: never
// how often, never who is ahead. « Refaire pareil » starts from any of them.
function Together({ familyId }: { familyId: string }) {
  const t = useT()
  const { lang } = useLang()
  const [open, setOpen] = useState(false)
  const q = useQuery({ queryKey: ['family-history', familyId], queryFn: () => api<{ past: Past[]; next: { id: string; startsAt: number } | null }>(`family-history?id=${familyId}`), enabled: open })
  return (
    <details className="fold" onToggle={(e) => setOpen(e.currentTarget.open)} style={{ marginTop: '0.35rem' }}>
      <summary><span><Icon name="calendar" />{t.friends.together}</span></summary>
      <div>
        {q.data?.next && <p className="small" style={{ margin: '0.25rem 0' }}>{whenShort(q.data.next.startsAt, lang)} <Link to={`/rencontres/${q.data.next.id}/cartes?family=${familyId}`} className="btn btn--small"><Icon name="note" />{t.friends.printCard}</Link></p>}
        {q.data && q.data.past.length === 0 && <p className="muted small">{t.friends.togetherNone}</p>}
        {q.data?.past.map((p) => (
          <p key={p.id} className="small" style={{ margin: '0.25rem 0' }}>
            {whenShort(p.startsAt, lang)} · {p.title}{p.place ? ` · ${p.place}` : ''} <Link to={`/rencontres/nouvelle?from=${p.id}`} className="btn btn--small">{t.form.again}</Link>
          </p>
        ))}
      </div>
    </details>
  )
}

// « Amis » — ONE list. Every family you invite, with the groups it belongs to as small tags and a
// « Sur Viens jouer » badge when their parents have an account (with the last and next date, never how
// often). Add by hand here, or let a reply fill it. Groups fold underneath.
export function Friends() {
  const t = useT()
  const { lang } = useLang()
  const qc = useQueryClient()
  const rm = useDeferredRemove()
  const cutRm = useDeferredRemove()
  const q = useQuery({ queryKey: K.families, queryFn: () => api<{ families: Family[] }>('families') })
  const grp = useQuery({ queryKey: K.groups, queryFn: () => api<{ groups: Group[] }>('groups') })
  const circle = useQuery({ queryKey: K.circle, queryFn: () => api<CircleData>('circle') })
  const [editing, setEditing] = useState<Family | 'new' | null>(null)
  // « Importer une liste » can be opened straight from the first-steps card (/amis?importer=1).
  const [params] = useSearchParams()
  const [importing, setImporting] = useState(params.get('importer') === '1')
  const [err, setErr] = useState<string | null>(null)
  const invalidate = () => qc.invalidateQueries({ queryKey: K.families })

  const save = useMutation({
    mutationFn: (body: Record<string, string | null>) => api('families', { method: body.id ? 'PATCH' : 'POST', body }),
    onSuccess: () => {
      setEditing(null)
      setErr(null)
      void invalidate()
    },
    onError: (e) => setErr(e.message),
  })

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const body = Object.fromEntries(new FormData(e.currentTarget).entries()) as Record<string, string | null>
    if (body.childBirthdate === '') body.childBirthdate = null
    if (editing && editing !== 'new') body.id = editing.id
    save.mutate(body)
  }

  const fams = rm.visible(q.data?.families ?? [])
  const groups = grp.data?.groups ?? []
  const linked = (circle.data?.children ?? []).flatMap((c) => c.linked).filter((l) => !cutRm.hidden.has(l.linkId))
  const byHh = new Map(linked.map((l) => [l.otherHousehold, l]))
  const known = new Set(fams.map((f) => f.linked_household_id).filter(Boolean))
  const others = linked.filter((l) => !known.has(l.otherHousehold))
  const tagsOf = (id: string) => groups.filter((g) => g.families.includes(id))
  const cur = editing && editing !== 'new' ? editing : null

  const cutLink = (l: Linked) =>
    cutRm.remove(l.linkId, t.undo.cut, async () => {
      await api('circle', { method: 'DELETE', body: { linkId: l.linkId } })
      void qc.invalidateQueries({ queryKey: K.circle })
      void qc.invalidateQueries({ queryKey: K.families })
    })
  const dates = (l: Linked) => (l.nextAt ? `${t.circle.next} ${whenShort(l.nextAt, lang)}` : l.lastAt ? `${t.circle.last} ${whenShort(l.lastAt, lang)}` : null)

  return (
    <>
      <h1>{t.friends.title}</h1>
      {!editing && !importing && <BigAction icon="users" onClick={() => setEditing('new')}>{t.families.add}</BigAction>}
      {!editing && !importing && <button type="button" className="btn btn--small" onClick={() => setImporting(true)}>{t.families.importOpen}</button>}
      {importing && <ImportFriends onClose={() => setImporting(false)} />}
      {q.data && fams.length === 0 && <p className="muted small">{t.friends.hint}</p>}
      {err && <div className="notice notice--err">{err}</div>}

      {editing && (
        <form className="card" onSubmit={submit} key={cur?.id ?? 'new'}>
          <label className="field"><span><Icon name="smile" />{t.families.childFirstName}</span><input className="input" name="childFirstName" required maxLength={40} defaultValue={cur?.child_first_name} /></label>
          <label className="field"><span><Icon name="user" />{t.families.parentName}</span><input className="input" name="parentName" required maxLength={60} defaultValue={cur?.parent_name} /></label>
          <label className="field"><span><Icon name="mail" />{t.families.email}</span><input className="input" name="email" type="email" defaultValue={cur?.email ?? ''} /></label>
          <label className="field"><span><Icon name="cake" />{t.families.birthdate}</span><input className="input" name="childBirthdate" type="date" defaultValue={cur?.child_birthdate ?? ''} /></label>
          <label className="field"><span><Icon name="phone" />{t.families.phone}</span><input className="input" name="phone" type="tel" defaultValue={cur?.phone ?? ''} /></label>
          <div className="field">
            <span><Icon name="clock" />{t.children.nap}</span>
            <div className="when when--even">
              <label className="field"><span>{t.children.napFrom}</span><input className="input" name="napStart" type="time" step={900} defaultValue={cur?.nap_start ?? ''} /></label>
              <label className="field"><span>{t.children.napTo}</span><input className="input" name="napEnd" type="time" step={900} defaultValue={cur?.nap_end ?? ''} /></label>
            </div>
            <Why k="nap" />
          </div>
          <label className="field"><span><Icon name="alert" />{t.families.allergies}</span><input className="input" name="allergies" maxLength={300} defaultValue={cur?.allergies ?? ''} /></label>
          <label className="field"><span><Icon name="note" />{t.families.notes}</span><input className="input" name="notes" maxLength={1000} defaultValue={cur?.notes ?? ''} /></label>
          <WhyMany
            items={[
              [t.families.email, 'friendEmail'],
              [t.families.birthdate, 'friendBirthdate'],
              [t.families.phone, 'phone'],
              [t.families.allergies, 'allergies'],
              [t.families.notes, 'notes'],
            ]}
          />
          <div className="cluster" style={{ marginTop: '0.75rem' }}>
            <button className="btn btn--primary" disabled={save.isPending}>{t.families.save}</button>
            <button type="button" className="btn" onClick={() => setEditing(null)}>{t.encounters.back}</button>
          </div>
        </form>
      )}

      {!editing && !importing && <InvitedBy />}
      {q.data && fams.length === 0 && !editing && <p className="muted">{t.families.empty}</p>}
      <div className="stack">
        {fams.map((f) => {
          const l = f.linked_household_id ? byHh.get(f.linked_household_id) : undefined
          const tags = tagsOf(f.id)
          const info: [IconName, string | null][] = [
            ['mail', f.email],
            ['phone', f.phone],
            ['alert', f.allergies ? `${t.families.allergies} : ${f.allergies}` : null],
            ['note', f.notes],
            ['calendar', l ? dates(l) : null],
          ]
          const age = ageLabel(f.child_birthdate, lang)
          return (
            <details key={f.id} className="card friend">
              <summary>
                <Face name={f.child_first_name} colour={colourOf(f.child_first_name)} size="lg" />
                <span className="friend__who">
                  <strong>{f.child_first_name}{f.email_bounced_at && <span className="chip chip--cancelled" style={{ marginLeft: '0.5rem' }}>{t.families.bounced}</span>}</strong>
                  <span className="muted small">{[f.parent_name, age].filter(Boolean).join(' · ')}</span>
                </span>
              </summary>
              <div className="stack" style={{ marginTop: '0.75rem' }}>
                {(tags.length > 0 || l || f.mail_stopped_at) && (
                  <div className="cluster">
                    {tags.map((g) => <span key={g.id} className="chip chip--kind">{g.name}</span>)}
                    {l && <span className="chip chip--yes">{t.friends.onApp}</span>}
                    {f.mail_stopped_at && <span className="chip">{t.families.stopped}</span>}
                  </div>
                )}
                {f.email_bounced_at && <p className="small" style={{ margin: 0 }}>{t.families.bouncedHint}</p>}
                <ul className="meta">
                  {info.filter(([, v]) => v).map(([icon, v]) => <li key={icon}><Icon name={icon} />{v}</li>)}
                  {info.every(([, v]) => !v) && <li className="muted small">{t.friends.noDetails}</li>}
                </ul>
                <div className="cluster">
                  <button className="btn btn--small" onClick={() => setEditing(f)}>{t.encounters.edit}</button>
                  <button className="btn btn--small btn--danger" onClick={() => rm.remove(f.id, t.undo.removed, async () => { await api('families', { method: 'DELETE', body: { id: f.id } }); void invalidate() })}>{t.families.remove}</button>
                  {l && <button className="btn btn--small btn--danger" onClick={() => cutLink(l)}>{t.friends.cutLink}</button>}
                </div>
                <Together familyId={f.id} />
                {!f.linked_household_id && <CircleInvite family={f} />}
              </div>
            </details>
          )
        })}
      </div>

      {others.length > 0 && (
        <section style={{ marginTop: '1.25rem' }}>
          <h2><Icon name="users" />{t.friends.othersTitle}</h2>
          <p className="muted small">{t.friends.othersHint}</p>
          {others.map((l) => (
            <div key={l.linkId} className="card row">
              <span><strong>{l.childName}</strong> <span className="muted small">· {l.parentName} {dates(l) ? `· ${dates(l)}` : ''}</span></span>
              <button className="btn btn--small btn--danger" onClick={() => cutLink(l)}>{t.circle.cut}</button>
            </div>
          ))}
        </section>
      )}

      <details className="fold" style={{ marginTop: '1.25rem' }}>
        <summary><span><Icon name="tag" />{t.friends.groupsFold}{groups.length > 0 ? ` (${groups.length})` : ''}</span></summary>
        <div><Groups families={q.data?.families ?? []} /></div>
      </details>
    </>
  )
}
