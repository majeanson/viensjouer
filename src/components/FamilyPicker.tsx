import { useT } from '../i18n'
import type { Family, Group } from '../lib/types'

// « Qui inviter ? » — the families as checkboxes, with the host's groups on top as
// one-tap shortcuts (tap « La garderie » → its members tick; tap again → they untick).
// Controlled: the parent owns the Set. Shared by the new-rencontre form and the windows.
export function FamilyPicker({ families, groups, selected, onChange }: { families: Family[]; groups: Group[]; selected: Set<string>; onChange: (s: Set<string>) => void }) {
  const t = useT()
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
  return (
    <div>
      {groups.length > 0 && (
        <div className="cluster" style={{ marginBottom: '0.5rem' }}>
          {groups.map((g) => {
            const on = g.families.length > 0 && g.families.every((id) => selected.has(id))
            return (
              <button type="button" key={g.id} className={`btn ${on ? 'btn--on' : ''}`} onClick={() => toggleGroup(g)}>{g.name}</button>
            )
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
    </div>
  )
}
