import { useRef, useState, type FormEvent } from 'react'
import { useMutation } from '@tanstack/react-query'
import { api } from '../lib/api'
import { useLang, useT } from '../i18n'
import { endFromTime, fromLocalInput, toLocalInput, toLocalTime } from '../lib/format'
import { clientDiff, isPrivate, showValue, type Snap } from '../lib/changes'
import type { Encounter } from '../lib/types'

// « Modifier la rencontre » — change the title, time, place, address, note (and the gift idea for a
// birthday). While you edit, a preview lists exactly what the families will be shown as changed, and an
// optional email tells the ones who have an address. Replies stay: a time change does not erase an answer.
export function EncounterEdit({
  e,
  gift,
  canNotify,
  onClose,
  onSaved,
}: {
  e: Encounter
  gift: string | null
  canNotify: boolean
  onClose: () => void
  onSaved: (r: { changed: number; notified: number }) => void
}) {
  const t = useT()
  const { lang } = useLang()
  const [form, setForm] = useState<HTMLFormElement | null>(null)
  const [tick, setTick] = useState(0)
  const guestsWas = useRef(e.show_guests !== false)
  const [err, setErr] = useState<string | null>(null)
  const guestsChangedNow = useRef(false)
  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) => api<{ changed: number; notified: number }>('encounters', { method: 'PATCH', body: { id: e.id, ...body } }),
    onSuccess: (r) => onSaved(guestsChangedNow.current && r.changed === 0 ? { ...r, changed: 1 } : r),
    onError: (x) => setErr(x.message),
  })

  const before: Snap = { title: e.title, starts_at: e.starts_at, ends_at: e.ends_at, place: e.place, address: e.address, map_url: e.map_url, note: e.note, gift, status: e.status }

  // The form's current values as a Snap (so the preview and the PATCH read the same thing).
  function read(f: HTMLFormElement | null): { snap: Snap; body: Record<string, unknown> } {
    const v = (n: string) => (f ? String((f.elements.namedItem(n) as HTMLInputElement | null)?.value ?? '') : '')
    // The input has no seconds: untouched, it keeps the exact stored instant (no phantom change).
    const start = v('startsAt') === toLocalInput(e.starts_at) ? e.starts_at : (fromLocalInput(v('startsAt')) ?? before.starts_at)
    const endRaw = v('endsAt')
    // « Jusqu'à » is a time on the day of « Quand »; untouched, it keeps the exact stored end.
    const end = !endRaw ? null : e.ends_at && endRaw === toLocalTime(e.ends_at) && start === e.starts_at ? e.ends_at : endFromTime(start, endRaw)
    const snap: Snap = {
      title: v('title').trim() || before.title,
      starts_at: start,
      ends_at: end,
      place: f ? v('place') : before.place,
      address: f && e.kind !== 'park' ? v('address') : before.address,
      map_url: f ? v('mapUrl') : before.map_url,
      note: f ? v('note') : before.note,
      gift: f && e.kind === 'birthday' ? v('gift') : before.gift,
      status: before.status,
    }
    const body: Record<string, unknown> = { title: v('title'), startsAt: start, endsAt: end, place: v('place'), mapUrl: v('mapUrl'), note: v('note') }
    if (e.kind !== 'park') body.address = v('address')
    if (e.kind === 'birthday') body.details = { gift: v('gift') }
    body.showGuests = f ? (f.elements.namedItem('showGuests') as HTMLInputElement | null)?.checked !== false : guestsWas.current
    return { snap, body }
  }

  const changes = form ? clientDiff(before, read(form).snap) : []
  const guestsChanged = !!form && read(form).body.showGuests !== guestsWas.current
  void tick

  function submit(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault()
    setErr(null)
    const endRaw = String((ev.currentTarget.elements.namedItem('endsAt') as HTMLInputElement | null)?.value ?? '')
    if (endRaw && read(ev.currentTarget).snap.ends_at === null) {
      setErr(t.form.endAfter)
      return
    }
    guestsChangedNow.current = read(ev.currentTarget).body.showGuests !== guestsWas.current
    const notify = canNotify && (ev.currentTarget.elements.namedItem('notify') as HTMLInputElement | null)?.checked === true
    save.mutate({ ...read(ev.currentTarget).body, notify })
  }

  return (
    <form ref={setForm} className="card" onSubmit={submit} onInput={() => setTick((n) => n + 1)}>
      <h3>{t.edit.title}</h3>
      {e.series_id && <p className="muted small">{t.edit.seriesOnly}</p>}
      <label className="field"><span>{t.encounters.titleField}</span><input className="input" name="title" required maxLength={120} defaultValue={e.title} /></label>
      <label className="field"><span>{t.encounters.when}</span><input className="input" name="startsAt" type="datetime-local" required defaultValue={toLocalInput(e.starts_at)} /></label>
      <label className="field"><span>{t.encounters.until}</span><input className="input" name="endsAt" type="time" defaultValue={e.ends_at ? toLocalTime(e.ends_at) : ''} /><span className="small muted" style={{ fontWeight: 400 }}>{t.encounters.untilHint}</span></label>
      <label className="field"><span>{t.encounters.place}</span><input className="input" name="place" maxLength={120} defaultValue={e.place ?? ''} /></label>
      <label className="field"><span>{t.encounters.mapUrl}</span><input className="input" name="mapUrl" type="url" autoComplete="off" maxLength={300} defaultValue={e.map_url ?? ''} /></label>
      {e.kind !== 'park' && <label className="field"><span>{t.encounters.address}</span><input className="input" name="address" maxLength={200} autoComplete="street-address" defaultValue={e.address ?? ''} /></label>}
      <label className="field"><span>{t.encounters.note}</span><textarea className="input" name="note" maxLength={1000} defaultValue={e.note ?? ''} /></label>
      {e.kind === 'birthday' && <label className="field"><span>{t.kinds.birthday.gift}</span><input className="input" name="gift" maxLength={200} defaultValue={gift ?? ''} /></label>}

      <label className="check"><input type="checkbox" name="showGuests" defaultChecked={guestsWas.current} /><span>{t.roster.showToggle}</span></label>
      <div className="changes-preview" aria-live="polite">
        <strong>{t.edit.willChange}</strong>
        {changes.length === 0 && !guestsChanged ? (
          <p className="muted small" style={{ margin: '0.25rem 0 0' }}>{t.edit.nothing}</p>
        ) : (
          <ul>
            {changes.map((c) => (
              <li key={c.field}>
                {isPrivate(c.field) ? (
                  t.edit.hidden[c.field]
                ) : (
                  <>
                    <span className="muted">{t.edit.fields[c.field]} :</span> <s>{showValue(c.field, c.from, lang, t.edit.status, t.edit.empty)}</s> → <strong>{showValue(c.field, c.to, lang, t.edit.status, t.edit.empty)}</strong>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
        <p className="muted small" style={{ margin: '0.25rem 0 0' }}>{t.edit.visible}</p>
      </div>

      {canNotify && changes.length > 0 && <label className="check"><input type="checkbox" name="notify" defaultChecked /><span>{t.edit.notify}</span></label>}
      {err && <div className="notice notice--err">{err}</div>}
      <div className="cluster">
        <button className="btn btn--primary" disabled={save.isPending || (changes.length === 0 && !guestsChanged)}>{t.edit.save}</button>
        <button type="button" className="btn btn--ghost" onClick={onClose}>{t.edit.cancel}</button>
      </div>
    </form>
  )
}
