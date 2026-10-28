import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { K } from '../lib/query'
import { useT } from '../i18n'
import { fromLocalInput, nextSaturdayTen, toLocalInput } from '../lib/format'
import { Why } from '../components/Why'
import { FamilyPicker } from '../components/FamilyPicker'
import type { Child, Family, Group, Kind } from '../lib/types'

type Scope = 'friend' | 'family'
// A birthday starts as « the friend only », everything else as « the whole family ».
const defaultScope = (k: Kind): Scope => (k === 'birthday' ? 'friend' : 'family')

const KINDS: Kind[] = ['park', 'home', 'birthday']
const REPEATS = [0, 4, 8, 12]

// The occurrences of a weekly series, computed HERE in the browser's own zone so the wall
// time stays put across a DST change (setDate keeps the clock; +7*86400 would drift an hour).
export function weeklyTimes(startsAt: number, weeks: number): number[] {
  return Array.from({ length: weeks }, (_, i) => {
    const d = new Date(startsAt * 1000)
    d.setDate(d.getDate() + 7 * i)
    return Math.floor(d.getTime() / 1000)
  })
}

// One form, one card. Who invites → what kind → title/when/where → repeat? → tick the families.
export function EncounterNew() {
  const t = useT()
  const nav = useNavigate()
  const qc = useQueryClient()
  const kids = useQuery({ queryKey: K.children, queryFn: () => api<{ children: Child[] }>('children') })
  const fams = useQuery({ queryKey: K.families, queryFn: () => api<{ families: Family[] }>('families') })
  const grp = useQuery({ queryKey: K.groups, queryFn: () => api<{ groups: Group[] }>('groups') })
  const [kind, setKind] = useState<Kind>('park')
  const [childId, setChildId] = useState<string | null>(null)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [scope, setScope] = useState<Scope>('family')
  const [scopeTouched, setScopeTouched] = useState(false)
  const chooseKind = (k: Kind) => {
    setKind(k)
    if (!scopeTouched) setScope(defaultScope(k))
  }
  const [err, setErr] = useState<string | null>(null)

  const create = useMutation({
    mutationFn: (body: unknown) => api<{ id: string }>('encounters', { method: 'POST', body }),
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: K.encounters })
      void qc.invalidateQueries({ queryKey: K.calendar })
      nav(`/rencontres/${r.id}`, { replace: true })
    },
    onError: (e) => setErr(e.message),
  })

  const children = kids.data?.children ?? []
  const chosen = childId ?? children[0]?.id ?? null

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const startsAt = fromLocalInput(String(f.get('startsAt') ?? ''))
    const endsRaw = String(f.get('endsAt') ?? '')
    const weeks = Number(f.get('repeat') ?? 0)
    create.mutate({
      childId: chosen,
      kind,
      title: f.get('title'),
      startsAt,
      ...(weeks > 0 && startsAt ? { startsAtList: weeklyTimes(startsAt, weeks) } : {}),
      endsAt: endsRaw ? fromLocalInput(endsRaw) : null,
      place: f.get('place') || undefined,
      address: f.get('address') || undefined,
      note: f.get('note') || undefined,
      ...(kind === 'birthday' && f.get('gift') ? { details: { gift: f.get('gift') } } : {}),
      scope,
      invite: [...picked],
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
            <button type="button" key={c.id} className={`btn ${chosen === c.id ? 'btn--on' : ''}`} onClick={() => setChildId(c.id)}>{c.first_name}</button>
          ))}
        </div>
      </div>
      <div className="card">
        <h3>{t.encounters.whichKind}</h3>
        <div className="seg">
          {KINDS.map((k) => (
            <button type="button" key={k} className={`btn ${kind === k ? 'btn--on' : ''}`} onClick={() => chooseKind(k)}>{t.encounters.kind[k]}</button>
          ))}
        </div>
      </div>
      <div className="card">
        <label className="field"><span>{t.encounters.titleField}</span><input className="input" name="title" required maxLength={120} placeholder={t.encounters.titlePlaceholder[kind]} /></label>
        <label className="field"><span>{t.encounters.when}</span><input className="input" name="startsAt" type="datetime-local" required defaultValue={toLocalInput(nextSaturdayTen())} /></label>
        <label className="field"><span>{t.encounters.until}</span><input className="input" name="endsAt" type="datetime-local" /></label>
        <label className="field">
          <span>{t.encounters.repeat}</span>
          <select className="input" name="repeat" defaultValue="0">
            {REPEATS.map((n) => <option key={n} value={n}>{n === 0 ? t.encounters.repeatNone : t.encounters.repeatWeeks(n)}</option>)}
          </select>
          <span className="small muted" style={{ fontWeight: 400 }}>{t.encounters.repeatHint}</span>
        </label>
        <label className="field"><span>{t.encounters.place}</span><input className="input" name="place" maxLength={120} placeholder={t.encounters.placePlaceholder[kind]} /></label>
        {kind !== 'park' && <label className="field"><span>{t.encounters.address}</span><input className="input" name="address" maxLength={200} autoComplete="street-address" /><Why k="address" /></label>}
        {kind === 'birthday' && <label className="field"><span>{t.kinds.birthday.gift}</span><input className="input" name="gift" maxLength={200} placeholder={t.kinds.birthday.giftPlaceholder} /><Why k="gift" /></label>}
        <label className="field"><span>{t.encounters.note}</span><textarea className="input" name="note" maxLength={1000} placeholder={t.encounters.notePlaceholder} /></label>
      </div>
      <div className="card">
        <h3>{t.scope.label}</h3>
        <div className="seg" role="radiogroup" aria-label={t.scope.label}>
          {(['friend', 'family'] as Scope[]).map((x) => (
            <button type="button" key={x} role="radio" aria-checked={scope === x} className={`btn ${scope === x ? 'btn--on' : ''}`} onClick={() => { setScope(x); setScopeTouched(true) }}>{t.scope[x]}</button>
          ))}
        </div>
        <p className="muted small" style={{ margin: '0.5rem 0 1rem' }}>{scope === 'friend' ? t.scope.friendHint : t.scope.familyHint}</p>
        <h3>{t.encounters.invite}</h3>
        <p className="muted small">{t.encounters.inviteHint}</p>
        <FamilyPicker families={fams.data?.families ?? []} groups={grp.data?.groups ?? []} selected={picked} onChange={setPicked} />
        {fams.data && fams.data.families.length === 0 && <p><Link to="/familles">{t.families.add}</Link></p>}
      </div>
      <div className="cluster">
        <button className="btn btn--primary btn--big" disabled={create.isPending || !chosen}>{t.encounters.create}</button>
        <Link to="/rencontres" className="btn btn--ghost">{t.encounters.back}</Link>
      </div>
    </form>
  )
}
