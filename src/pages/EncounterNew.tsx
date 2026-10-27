import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { K } from '../lib/query'
import { useT } from '../i18n'
import { fromLocalInput, nextSaturdayTen, toLocalInput } from '../lib/format'
import { Face } from '../components/Face'
import type { Child, Family, Kind } from '../lib/types'

const KINDS: Kind[] = ['park', 'home', 'birthday']

// One form, one card. Who invites → what kind → title/when/where → tick the families.
export function EncounterNew() {
  const t = useT()
  const nav = useNavigate()
  const qc = useQueryClient()
  const kids = useQuery({ queryKey: K.children, queryFn: () => api<{ children: Child[] }>('children') })
  const fams = useQuery({ queryKey: K.families, queryFn: () => api<{ families: Family[] }>('families') })
  const [kind, setKind] = useState<Kind>('park')
  const [childId, setChildId] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const create = useMutation({
    mutationFn: (body: unknown) => api<{ id: string }>('encounters', { method: 'POST', body }),
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: K.encounters })
      nav(`/rencontres/${r.id}`, { replace: true })
    },
    onError: (e) => setErr(e.message),
  })

  const children = kids.data?.children ?? []
  const picked = childId ?? children[0]?.id ?? null

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const startsAt = fromLocalInput(String(f.get('startsAt') ?? ''))
    const endsRaw = String(f.get('endsAt') ?? '')
    create.mutate({
      childId: picked,
      kind,
      title: f.get('title'),
      startsAt,
      endsAt: endsRaw ? fromLocalInput(endsRaw) : null,
      place: f.get('place') || undefined,
      address: f.get('address') || undefined,
      note: f.get('note') || undefined,
      invite: f.getAll('invite').map(String),
    })
  }

  if (kids.data && children.length === 0) {
    return (
      <>
        <h1>{t.encounters.new}</h1>
        <p className="muted">{t.children.empty}</p>
        <Link to="/enfants" className="btn btn--primary">{t.children.add}</Link>
      </>
    )
  }

  return (
    <form onSubmit={submit}>
      <h1>{t.encounters.new}</h1>
      {err && <div className="notice notice--err">{err}</div>}
      <div className="card">
        <h3>{t.encounters.whoInvites}</h3>
        <div className="seg">
          {children.map((c) => (
            <button type="button" key={c.id} className={`btn ${picked === c.id ? 'btn--on' : ''}`} onClick={() => setChildId(c.id)}><Face name={c.first_name} colour={c.colour} /> {c.first_name}</button>
          ))}
        </div>
      </div>
      <div className="card">
        <h3>{t.encounters.whichKind}</h3>
        <div className="seg">
          {KINDS.map((k) => (
            <button type="button" key={k} className={`btn ${kind === k ? 'btn--on' : ''}`} onClick={() => setKind(k)}>{t.encounters.kind[k]}</button>
          ))}
        </div>
      </div>
      <div className="card">
        <label className="field"><span>{t.encounters.titleField}</span><input className="input" name="title" required maxLength={120} placeholder={t.encounters.titlePlaceholder[kind]} /></label>
        <label className="field"><span>{t.encounters.when}</span><input className="input" name="startsAt" type="datetime-local" required defaultValue={toLocalInput(nextSaturdayTen())} /></label>
        <label className="field"><span>{t.encounters.until}</span><input className="input" name="endsAt" type="datetime-local" /></label>
        <label className="field"><span>{t.encounters.place}</span><input className="input" name="place" maxLength={120} placeholder={t.encounters.placePlaceholder[kind]} /></label>
        {kind !== 'park' && <label className="field"><span>{t.encounters.address}</span><input className="input" name="address" maxLength={200} autoComplete="street-address" /></label>}
        <label className="field"><span>{t.encounters.note}</span><textarea className="input" name="note" maxLength={1000} placeholder={t.encounters.notePlaceholder} /></label>
      </div>
      <div className="card">
        <h3>{t.encounters.invite}</h3>
        <p className="muted small">{t.encounters.inviteHint}</p>
        {fams.data && fams.data.families.length === 0 && <p className="muted">{t.encounters.noFamilies} <Link to="/familles">{t.families.add}</Link></p>}
        {(fams.data?.families ?? []).map((f) => (
          <label key={f.id} className="check"><input type="checkbox" name="invite" value={f.id} /><Face name={f.child_first_name} /><span><strong>{f.child_first_name}</strong> <span className="muted small">· {f.parent_name}</span></span></label>
        ))}
      </div>
      <div className="cluster">
        <button className="btn btn--primary btn--big" disabled={create.isPending || !picked}>{t.encounters.create}</button>
        <Link to="/rencontres" className="btn btn--ghost">{t.encounters.back}</Link>
      </div>
    </form>
  )
}
