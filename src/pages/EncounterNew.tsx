import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { K } from '../lib/query'
import { useLang, useT } from '../i18n'
import { clockLabel, dayHour, endFromTime, fromLocalInput, nextAt, nextSaturdayTen, napSlots, sameSlotAhead, toLocalInput, toLocalTime } from '../lib/format'
import { WhyMany } from '../components/WhyMany'
import { resizeToJpeg } from '../lib/photo'
import { FREQUENCIES, MAX_OCCURRENCES, repeatTimes, type Frequency } from '../lib/repeat'
import { FamilyPicker } from '../components/FamilyPicker'
import { HomeCardForm } from '../components/HomeCard'
import { Windows } from './Windows'
import type { Child, Encounter, Family, Group, Invitation, Kind } from '../lib/types'
import { WhenInput } from '../components/WhenInput'
import { Icon, kindIcon } from '../components/Icon'
import { BackLink } from '../components/PageHead'
import { Face } from '../components/Face'
import { useAuth } from '../lib/auth'
import { parseQuick } from '../lib/quick'

type Scope = 'friend' | 'family'
// A birthday starts as « the friend only », everything else as « the whole family ».
const defaultScope = (k: Kind): Scope => (k === 'birthday' ? 'friend' : 'family')

const KINDS: Kind[] = ['park', 'home', 'birthday']

// What an earlier rencontre hands to « Refaire pareil ».
interface Source {
  encounter: Encounter & { details: Record<string, string> }
  invitations: Invitation[]
}

// « Proposer » — short on purpose: who, what kind, when. The title writes itself, and everything
// else (end time, repeat, address, map link, note, gift) sits under « Plus de choix ».
export function EncounterNew() {
  const t = useT()
  const { lang } = useLang()
  const { me } = useAuth()
  const nav = useNavigate()
  const qc = useQueryClient()
  const [params] = useSearchParams()
  const from = params.get('from')
  const kids = useQuery({ queryKey: K.children, queryFn: () => api<{ children: Child[] }>('children') })
  const fams = useQuery({ queryKey: K.families, queryFn: () => api<{ families: Family[] }>('families') })
  const grp = useQuery({ queryKey: K.groups, queryFn: () => api<{ groups: Group[] }>('groups') })
  const placesQ = useQuery({ queryKey: ['places'], queryFn: () => api<{ places: { place: string; map_url: string | null; address: string | null; kind: string }[] }>('places'), staleTime: 60_000 })
  const [reused, setReused] = useState(false)
  const health = useQuery({ queryKey: ['health'], queryFn: () => api<{ photos: boolean }>('health'), staleTime: 60_000 })
  const [coverFile, setCoverFile] = useState<File | null>(null)
  const home = useQuery({ queryKey: K.homeCard, queryFn: () => api<{ card: unknown | null }>('home-card') })
  const src = useQuery({ queryKey: ['again', from], queryFn: () => api<Source>(`encounters?id=${from}`), enabled: !!from })
  const [mode, setMode] = useState<'plan' | 'free'>('plan')
  const [kind, setKind] = useState<Kind>('park')
  const [childId, setChildId] = useState<string | null>(null)
  // A second hosting child: « Léa et Noé vous invitent ». The buttons below are tick-able; at least one stays ticked.
  const [coId, setCoId] = useState<string | null>(null)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [scope, setScope] = useState<Scope>('family')
  const [freq, setFreq] = useState<Frequency>('once')
  const [scopeTouched, setScopeTouched] = useState(false)
  const [start, setStart] = useState(() => toLocalInput(nextSaturdayTen()))
  const [err, setErr] = useState<string | null>(null)
  // « Dis-le en une phrase »: the sentence fills the form below, which stays the place to correct it.
  // « Proposer d'autres moments »: up to three more possible times, ticked by the families; the host picks later.
  const [extra, setExtra] = useState<string[]>([])
  const [say, setSay] = useState(params.get('say') ?? '')
  const [sayMiss, setSayMiss] = useState(false)
  const [quickPlace, setQuickPlace] = useState('')
  const [quickN, setQuickN] = useState(0)
  const chooseKind = (k: Kind) => {
    setKind(k)
    if (!scopeTouched) setScope(defaultScope(k))
  }

  // « Refaire pareil »: the same kind, child, families, scope and place, a week on. Applied once.
  const applied = useRef(false)
  useEffect(() => {
    if (!src.data || applied.current) return
    applied.current = true
    const { encounter: e, invitations } = src.data
    setKind(e.kind)
    setChildId(e.child_id)
    setCoId(e.co_child_id ?? null)
    setPicked(new Set(invitations.map((i) => i.friend_family_id)))
    const sc = invitations[0]?.scope ?? defaultScope(e.kind)
    setScope(sc)
    setScopeTouched(true)
    setStart(toLocalInput(sameSlotAhead(e.starts_at)))
  }, [src.data])

  // The links go out by email by themselves (the host page waits a few seconds, with « Annuler »): set when this form is sent.
  const willMail = useRef(false)
  const create = useMutation({
    mutationFn: (body: unknown) => api<{ id: string; ids: string[]; sent?: number; skipped?: number }>('encounters', { method: 'POST', body }),
    onSuccess: async (r) => {
      // The picture is best effort: the rencontre exists either way, and the host page can add it again.
      if (coverFile) {
        try {
          const blob = await resizeToJpeg(coverFile)
          await Promise.all(r.ids.map((id) => api(`cover?encounter=${id}`, { method: 'POST', body: blob })))
        } catch {
          /* shown as missing on the host page */
        }
      }
      void qc.invalidateQueries({ queryKey: K.encounters })
      void qc.invalidateQueries({ queryKey: K.calendar })
      nav(`/rencontres/${r.id}`, { replace: true, state: willMail.current ? { autoSend: true } : undefined })
    },
    onError: (e) => setErr(e.message),
  })

  // Smart default: the place you used last time for this kind, filled in once (never over a sentence, « Refaire pareil » or a choice).
  const placeSeeded = useRef(false)
  useEffect(() => {
    if (placeSeeded.current || !placesQ.data || from || params.get('say')) return
    placeSeeded.current = true
    const last = (placesQ.data.places ?? []).find((p) => p.kind === kind)
    if (last) { setQuickPlace(last.place); setQuickN((n) => n + 1) }
  }, [placesQ.data, from, params, kind])
  const children = kids.data?.children ?? []
  function fill(text = say) {
    const q = parseQuick(text, fams.data?.families ?? [])
    setSayMiss(!q.kind && !q.startsAt && !q.place && q.familyIds.length === 0)
    if (q.kind) chooseKind(q.kind)
    if (q.startsAt) setStart(toLocalInput(q.startsAt))
    if (q.place) { setQuickPlace(q.place); setQuickN((n) => n + 1) }
    if (q.familyIds.length) setPicked((p) => new Set([...p, ...q.familyIds]))
  }
  const chosen = childId ?? children[0]?.id ?? null
  const hostIds = [chosen, coId && coId !== chosen ? coId : null].filter((x): x is string => !!x)
  const toggleHost = (id: string) => {
    const next = hostIds.includes(id) ? (hostIds.length > 1 ? hostIds.filter((x) => x !== id) : hostIds) : [hostIds[0], id]
    setChildId(next[0] ?? null)
    setCoId(next[1] ?? null)
  }
  // « Les mêmes familles que la dernière fois »: not offered when this form is already « Refaire pareil » (it has its own).
  const last = useQuery({ queryKey: K.lastGuests(chosen ?? ''), queryFn: () => api<{ familyIds: string[] }>(`last-guests?child=${chosen}`), enabled: !!chosen && !from })
  const lastIds = (last.data?.familyIds ?? []).filter((id) => (fams.data?.families ?? []).some((f) => f.id === id))
  const prev = src.data?.encounter
  const prevEnd = prev?.ends_at ? toLocalTime(prev.ends_at) : ''

  // A sentence typed on the first-steps card arrives in the address and fills the form once, when the friends are known.
  const sayApplied = useRef(false)
  useEffect(() => {
    if (sayApplied.current || !fams.data || !params.get('say')) return
    sayApplied.current = true
    fill(params.get('say') ?? '')
  }, [fams.data])

  const mailableNow = (fams.data?.families ?? []).some((f) => picked.has(f.id) && f.email && !f.mail_stopped_at && !f.email_bounced_at)
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setErr(null)
    const f = new FormData(e.currentTarget)
    const startsAt = fromLocalInput(String(f.get('startsAt') ?? ''))
    if (!startsAt) return
    const endsRaw = String(f.get('endsAt') ?? '')
    const endsAt = endsRaw ? endFromTime(startsAt, endsRaw) : null
    if (endsRaw && endsAt === null) {
      setErr(t.form.endAfter)
      return
    }
    const count = Number(f.get('count') ?? 4)
    const title = String(f.get('title') ?? '').trim() || `${t.form.autoTitle[kind]}, ${dayHour(startsAt, lang)}`
    willMail.current = !!me.mail && mailableNow
    create.mutate({
      childId: chosen,
      ...(coId && coId !== chosen ? { coChildId: coId } : {}),
      kind,
      title,
      startsAt,
      ...(freq !== 'once' ? { startsAtList: repeatTimes(startsAt, freq, count) } : {}),
      ...(freq === 'once' && extra.length > 0 ? { slots: extra.map(fromLocalInput).filter((x): x is number => !!x) } : {}),
      endsAt,
      place: f.get('place') || undefined,
      mapUrl: f.get('mapUrl') || undefined,
      address: f.get('address') || undefined,
      note: f.get('note') || undefined,
      details: { planB: f.get('planB'), ...(kind === 'birthday' ? { gift: f.get('gift') } : {}) },
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

  const moreOpen = !!(prev && (prev.title || prev.address || prev.note || prev.map_url || prev.ends_at))
  const quick: [string, number][] = [
    [t.form.quick.sat, nextAt(6)],
    [t.form.quick.sun, nextAt(0)],
    [t.form.quick.tomorrow, nextAt(-1)],
  ]

  // Families picked that can be emailed right now (an address, no stop, no bounce).
  const mailable = (fams.data?.families ?? []).filter((f) => picked.has(f.id) && f.email && !f.mail_stopped_at && !f.email_bounced_at).length
  const slots = napSlots([children.find((c) => c.id === chosen) ?? {}, ...(fams.data?.families ?? []).filter((f) => picked.has(f.id))])
  const napChips: [string, string][] = [
    [t.form.quick.beforeNap(clockLabel(slots.before, lang)), slots.before],
    [t.form.quick.afterNap(clockLabel(slots.after, lang)), slots.after],
  ]

  return (
    <>
      <BackLink to="/rencontres">{t.encounters.back}</BackLink>
      <h1>{t.encounters.new}</h1>
      <div className="seg" role="tablist" style={{ margin: '0.9rem 0 1rem' }}>
        <button type="button" role="tab" aria-selected={mode === 'plan'} className={`btn ${mode === 'plan' ? 'btn--on' : ''}`} onClick={() => setMode('plan')}>{t.form.plan}</button>
        <button type="button" role="tab" aria-selected={mode === 'free'} className={`btn ${mode === 'free' ? 'btn--on' : ''}`} onClick={() => setMode('free')}>{t.form.free}</button>
      </div>
      {mode === 'plan' && (
        <div className="card">
          <label className="field">
            <span><Icon name="sparkle" />{t.form.say}</span>
            <input className="input" value={say} maxLength={200} placeholder={t.form.sayExample} onChange={(e) => { setSay(e.target.value); setSayMiss(false) }} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); fill() } }} />
          </label>
          <button type="button" className="btn btn--small" disabled={!say.trim()} onClick={() => fill()}>{t.form.sayGo}</button>
          {sayMiss && <p className="muted small" role="status" style={{ margin: '0.5rem 0 0' }}>{t.form.sayMiss}</p>}
        </div>
      )}
      {mode === 'free' ? (
        <Windows />
      ) : (
        <form onSubmit={submit}>
          {err && <div className="notice notice--err">{err}</div>}
          <div className="card">
            {children.length > 1 && (
              <>
                <h3><Icon name="smile" />{t.encounters.whoInvites}</h3>
                <div className="seg" style={{ marginBottom: '0.75rem' }}>
                  {children.map((c) => (
                    <button type="button" key={c.id} aria-pressed={hostIds.includes(c.id)} className={`btn ${hostIds.includes(c.id) ? 'btn--on' : ''}`} onClick={() => toggleHost(c.id)}><Face name={c.first_name} colour={c.colour} src={c.photo ? `/api/avatar/child/${c.id}?v=${c.photo}` : null} size="sm" />{c.first_name}</button>
                  ))}
                </div>
              </>
            )}
            <details className="more">
              <summary><Icon name={kindIcon(kind)} />{t.encounters.whichKind} : {t.encounters.kind[kind]}</summary>
              <div className="seg">
                {KINDS.map((k) => (
                  <button type="button" key={k} className={`btn ${kind === k ? 'btn--on' : ''}`} onClick={() => chooseKind(k)}><Icon name={kindIcon(k)} />{t.encounters.kind[k]}</button>
                ))}
              </div>
            </details>
          </div>

          <div className="card">
            <h3><Icon name="users" />{t.encounters.invite}</h3>
            {lastIds.length > 0 && !lastIds.every((id) => picked.has(id)) && <button type="button" className="btn btn--small" onClick={() => setPicked((p) => new Set([...p, ...lastIds]))}><Icon name="history" />{t.form.sameAsLast}</button>}
            <FamilyPicker loaded={!!fams.data} families={fams.data?.families ?? []} groups={grp.data?.groups ?? []} selected={picked} onChange={setPicked} />
            {me.mail && picked.size > 0 && (
              <p className="muted small" style={{ margin: '0.75rem 0 0' }}><Icon name={mailable > 0 ? 'mail' : 'note'} />{mailable > 0 ? t.encounters.autoSend(mailable) : t.encounters.sendNowNone}</p>
            )}
            <details className="more" style={{ marginTop: '1rem' }}>
              <summary><Icon name="users" />{t.scope.label} : {t.scope[scope]}</summary>
              <div>
                <div className="seg" role="radiogroup" aria-label={t.scope.label}>
                  {(['friend', 'family'] as Scope[]).map((x) => (
                    <button type="button" key={x} role="radio" aria-checked={scope === x} className={`btn ${scope === x ? 'btn--on' : ''}`} onClick={() => { setScope(x); setScopeTouched(true) }}>{t.scope[x]}</button>
                  ))}
                </div>
                <p className="muted small" style={{ margin: 0 }}>{scope === 'friend' ? t.scope.friendHint : t.scope.familyHint}</p>
              </div>
            </details>
          </div>

          <div className="card" key={`${prev?.id ?? 'fresh'}-${quickN}`}>
            <div className="field">
              <span><Icon name="calendar" />{t.encounters.when}</span>
              <div className="quick">
                {quick.map(([label, at]) => (
                  <button type="button" key={label} className="btn btn--small" onClick={() => setStart(toLocalInput(at))}>{label}</button>
                ))}
                {napChips.map(([label, time]) => (
                  <button type="button" key={label} className="btn btn--small" onClick={() => setStart((s) => `${s.slice(0, 10)}T${time}`)}>{label}</button>
                ))}
              </div>
              <WhenInput name="startsAt" label={t.encounters.when} value={start} onChange={setStart} />
              {freq === 'once' && extra.map((x, i) => (
                <div key={i} className="stack">
                  <WhenInput name={`slot${i}`} label={t.slots.title2} value={x} onChange={(v) => setExtra((l) => l.map((y, j) => (j === i ? v : y)))} />
                  <button type="button" className="btn btn--small" onClick={() => setExtra((l) => l.filter((_, j) => j !== i))}>{t.slots.remove}</button>
                </div>
              ))}
              {freq === 'once' && extra.length < 3 && <button type="button" className="btn btn--small" onClick={() => setExtra((l) => [...l, toLocalInput((fromLocalInput(l.length ? l[l.length - 1] : start) ?? nextSaturdayTen()) + 86_400)])}>{t.slots.add}</button>}
            </div>
            <label className="field"><span><Icon name="pin" />{t.encounters.place}</span><input
              className="input"
              name="place"
              maxLength={120}
              list="past-places"
              autoComplete="off"
              defaultValue={prev?.place ?? quickPlace}
              placeholder={t.encounters.placePlaceholder[kind]}
              onChange={(ev) => {
                // A place used before brings its map link (and, away from the park, its address) back.
                const hit = placesQ.data?.places.find((p) => p.place.toLowerCase() === ev.target.value.trim().toLowerCase())
                const f = ev.target.form
                if (!hit || !f) return setReused(false)
                const map = f.elements.namedItem('mapUrl') as HTMLInputElement | null
                const addr = f.elements.namedItem('address') as HTMLInputElement | null
                let did = false
                if (map && !map.value && hit.map_url) { map.value = hit.map_url; did = true }
                if (addr && !addr.value && hit.address && kind !== 'park') { addr.value = hit.address; did = true }
                setReused(did)
              }}
            /><datalist id="past-places">{(placesQ.data?.places ?? []).map((p) => <option key={p.place} value={p.place} />)}</datalist>{reused && <span className="small muted" style={{ fontWeight: 400 }}>{t.form.reused}</span>}</label>
            <details className="why" open={moreOpen} style={{ marginTop: '0.5rem' }}>
              <summary>{t.form.more}</summary>
              <div style={{ marginTop: '0.75rem' }}>
                <label className="field"><span><Icon name="edit" />{t.encounters.titleField}</span><input className="input" name="title" maxLength={120} defaultValue={prev?.title ?? ''} placeholder={`${t.form.autoTitle[kind]}, ${dayHour(fromLocalInput(start) ?? nextSaturdayTen(), lang)}`} /></label>
                <label className="field"><span><Icon name="clock" />{t.encounters.until}</span><input className="input" name="endsAt" type="time" defaultValue={prevEnd} /></label>
                <label className="field">
                  <span><Icon name="repeat" />{t.encounters.repeat}</span>
                  <select className="input" name="freq" value={freq} onChange={(e) => setFreq(e.target.value as Frequency)}>
                    {FREQUENCIES.map((x) => <option key={x} value={x}>{t.encounters.freq[x]}</option>)}
                  </select>
                </label>
                {freq !== 'once' && (
                  <label className="field">
                    <span><Icon name="repeat" />{t.encounters.repeatCount}</span>
                    <select className="input" name="count" defaultValue="4">
                      {Array.from({ length: MAX_OCCURRENCES - 1 }, (_, i) => i + 2).map((n) => <option key={n} value={n}>{n}</option>)}
                    </select>
                    <span className="small muted" style={{ fontWeight: 400 }}>{t.encounters.repeatHint}</span>
                  </label>
                )}
                {health.data?.photos && <label className="field"><span><Icon name="image" />{t.cover.field}</span><input className="input" type="file" accept="image/*" onChange={(e) => setCoverFile(e.target.files?.[0] ?? null)} /></label>}
                <label className="field"><span><Icon name="map" />{t.encounters.mapUrl}</span><input className="input" name="mapUrl" type="url" autoComplete="off" maxLength={300} defaultValue={prev?.map_url ?? ''} placeholder="https://maps.app.goo.gl/…" /></label>
                {kind !== 'park' && <label className="field"><span><Icon name="home" />{t.encounters.address}</span><input className="input" name="address" maxLength={200} autoComplete="street-address" defaultValue={prev?.address ?? ''} /></label>}
                {kind === 'birthday' && <label className="field"><span><Icon name="gift" />{t.kinds.birthday.gift}</span><input className="input" name="gift" maxLength={200} defaultValue={prev?.details?.gift ?? ''} placeholder={t.kinds.birthday.giftPlaceholder} /></label>}
                <label className="field"><span><Icon name="umbrella" />{t.encounters.planB}</span><input className="input" name="planB" maxLength={200} defaultValue={prev?.details?.planB ?? ''} placeholder={t.encounters.planBPlaceholder} /></label>
                <label className="field"><span><Icon name="note" />{t.encounters.note}</span><textarea className="input" name="note" maxLength={1000} defaultValue={prev?.note ?? ''} placeholder={t.encounters.notePlaceholder} /></label>
                <WhyMany
                  items={[
                    ...(health.data?.photos ? ([[t.cover.field, 'cover']] as [string, 'cover'][]) : []),
                    [t.encounters.mapUrl, 'mapUrl'],
                    [t.encounters.planB, 'planB'],
                    ...(kind !== 'park' ? ([[t.encounters.address, 'address']] as [string, 'address'][]) : []),
                    ...(kind === 'birthday' ? ([[t.kinds.birthday.gift, 'gift']] as [string, 'gift'][]) : []),
                  ]}
                />
              </div>
            </details>
          </div>

          <div className="cluster sticky-actions">
            <button className="btn btn--primary btn--big" disabled={create.isPending || !chosen}>{t.encounters.create}</button>
          </div>

        </form>
      )}
      {mode === 'plan' && kind === 'home' && home.data && home.data.card === null && (
        <details className="fold">
          <summary>{t.form.homeCard}</summary>
          <div><HomeCardForm bare /></div>
        </details>
      )}

    </>
  )
}
