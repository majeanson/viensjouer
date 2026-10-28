// What changed when a rencontre is edited — pure, so it is tested without a database.
// The host's edit form, the change log (migration 0008), the invited page's « Modifié » badges and the
// optional update email all read the same list.
import type { Status } from './encounters'
import { whenLong } from './ids'

export type ChangeField = 'title' | 'starts_at' | 'ends_at' | 'place' | 'address' | 'map_url' | 'note' | 'gift' | 'status'
export const CHANGE_ORDER: ChangeField[] = ['title', 'starts_at', 'ends_at', 'place', 'address', 'map_url', 'note', 'gift', 'status']

export interface Snapshot {
  title: string
  starts_at: number
  ends_at: number | null
  place: string | null
  address: string | null
  map_url: string | null
  note: string | null
  gift: string | null
  status: Status
}

export interface Change {
  field: ChangeField
  old: string | null
  new: string | null
}

// Empty, blank and missing all mean « nothing », so a field that goes from '' to null is not a change.
const text = (v: string | null | undefined): string | null => {
  const t = (v ?? '').trim()
  return t ? t : null
}

export function diffEncounter(before: Snapshot, after: Snapshot): Change[] {
  const out: Change[] = []
  for (const field of CHANGE_ORDER) {
    const a = field === 'starts_at' || field === 'ends_at' ? (before[field] === null ? null : String(before[field])) : text(before[field] as string | null)
    const b = field === 'starts_at' || field === 'ends_at' ? (after[field] === null ? null : String(after[field])) : text(after[field] as string | null)
    if (a === b) continue
    // The address is never written to the log: only the fact that it changed.
    out.push(field === 'address' || field === 'map_url' ? { field, old: null, new: null } : { field, old: a, new: b })
  }
  return out
}

const LABEL_FR: Record<ChangeField, string> = {
  title: 'Titre',
  starts_at: 'Début',
  ends_at: 'Fin',
  place: 'Lieu',
  address: 'Adresse',
  map_url: 'Carte',
  note: 'À savoir',
  gift: 'Idée de cadeau',
  status: 'Statut',
}
const STATUS_FR: Record<string, string> = { proposed: 'proposée', confirmed: 'confirmée', cancelled: 'annulée' }

// One readable French line per change, for the update email.
export function changeLinesFr(changes: Change[], tz: string): string[] {
  const show = (field: ChangeField, v: string | null): string => {
    if (v === null) return '(rien)'
    if (field === 'starts_at' || field === 'ends_at') return whenLong(Number(v), 'fr', tz)
    if (field === 'status') return STATUS_FR[v] ?? v
    return v
  }
  return changes.map((c) => (c.field === 'address' || c.field === 'map_url' ? `${LABEL_FR[c.field]} : mise à jour, à voir sur la page` : `${LABEL_FR[c.field]} : ${show(c.field, c.old)} → ${show(c.field, c.new)}`))
}
