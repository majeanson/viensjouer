import { useState, type FormEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { K } from '../lib/query'
import { useT } from '../i18n'
import { Why } from './Why'
import type { Family, Group } from '../lib/types'

// « Qui inviter ? » — the families as checkboxes, with the host's groups on top as one-tap
// shortcuts, and « Nouvelle famille » INLINE: a first-time host has an empty book, and must
// never have to leave the form to add the first friend. Two first names are enough; the email
// is optional (without it the host copies the link). The new family is ticked on the spot.
// Controlled: the parent owns the Set. Shared by the new-rencontre form and the windows.
export function FamilyPicker({ families, groups, selected, onChange }: { families: Family[]; groups: Group[]; selected: Set<string>; onChange: (s: Set<string>) => void }) {
  const t = useT()
  const qc = useQueryClient()
  const [adding, setAdding] = useState(families.length === 0)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const toggle = (id: string) => {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    onChange(next)
  }
  const toggleGroup = (g: Group) => {
    const members = g.families.filter((id) => families.some((f) => f.id === id))
    const all = members.length > 0 && members.every((id) => selected.has(id))
    const next = new Set(selected)
    for (const id of members) {
      if (all) next.delete(id)
      else next.add(id)
    }
    onChange(next)
  }

  async function addFamily(e: FormEvent<HTMLFormElement>) {
    // A nested form would submit the page's own form; this one is a plain fieldset with a button.
    e.preventDefault()
  }
  async function create(box: HTMLElement) {
    const val = (n: string) => (box.querySelector<HTMLInputElement>(`[name=${n}]`)?.value ?? '').trim()
    const childFirstName = val('childFirstName')
    const parentName = val('parentName')
    if (!childFirstName || !parentName) {
      setErr(t.families.bothNames)
      return
    }
    setBusy(true)
    setErr(null)
    try {
      const body: Record<string, string> = { childFirstName, parentName }
      if (val('email')) body.email = val('email')
      const r = await api<{ id: string }>('families', { method: 'POST', body })
      await qc.invalidateQueries({ queryKey: K.families })
      onChange(new Set([...selected, r.id]))
      box.querySelectorAll('input').forEach((i) => (i.value = ''))
      setAdding(false)
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : t.common.error)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      {groups.length > 0 && (
        <div className="cluster" style={{ marginBottom: '0.5rem' }}>
          {groups.map((g) => {
            const on = g.families.length > 0 && g.families.every((id) => selected.has(id))
            return <button type="button" key={g.id} className={`btn ${on ? 'btn--on' : ''}`} onClick={() => toggleGroup(g)}>{g.name}</button>
          })}
        </div>
      )}
      {families.map((f) => (
        <label key={f.id} className="check">
          <input type="checkbox" checked={selected.has(f.id)} onChange={() => toggle(f.id)} />
          <span><strong>{f.child_first_name}</strong> <span className="muted small">· {f.parent_name}</span></span>
        </label>
      ))}
      {families.length === 0 && <p className="muted">{t.encounters.noFamilies}</p>}

      {adding ? (
        <form onSubmit={addFamily} className="card" style={{ marginTop: '0.5rem', background: 'var(--paper)' }}>
          <h3>{t.families.add}</h3>
          <label className="field"><span>{t.families.childFirstName}</span><input className="input" name="childFirstName" maxLength={40} autoComplete="off" /></label>
          <label className="field"><span>{t.families.parentName}</span><input className="input" name="parentName" maxLength={60} autoComplete="off" /></label>
          <label className="field"><span>{t.families.email}</span><input className="input" name="email" type="email" autoComplete="off" /><Why k="friendEmail" /></label>
          {err && <div className="notice notice--err">{err}</div>}
          <div className="cluster">
            <button type="button" className="btn btn--primary" disabled={busy} onClick={(e) => void create((e.currentTarget.closest('form') as HTMLElement))}>{t.families.addAndPick}</button>
            {families.length > 0 && <button type="button" className="btn btn--ghost" onClick={() => setAdding(false)}>{t.encounters.back}</button>}
          </div>
        </form>
      ) : (
        <button type="button" className="linkbtn" style={{ marginTop: '0.5rem' }} onClick={() => setAdding(true)}>{t.families.add}</button>
      )}
    </div>
  )
}
