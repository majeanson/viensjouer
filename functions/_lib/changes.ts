// What changed when a rencontre is edited — pure, so it is tested without a database.
// The host's edit form, the change log (migration 0008), the invited page's « Modifié » badges and the
// optional update email all read the same list.
import type { Status } from './encounters'
import { whenLong } from './ids'
import type { MailLang } from './lang'

export type ChangeField = 'title' | 'starts_at' | 'ends_at' | 'place' | 'address' | 'map_url' | 'note' | 'planB' | 'gift' | 'status'
export const CHANGE_ORDER: ChangeField[] = ['title', 'starts_at', 'ends_at', 'place', 'address', 'map_url', 'note', 'planB', 'gift', 'status']

export interface Snapshot {
  title: string
  starts_at: number
  ends_at: number | null
  place: string | null
  address: string | null
  map_url: string | null
  note: string | null
  planB: string | null
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

const LABEL: Record<MailLang, Record<ChangeField, string>> = {
  fr: { title: 'Titre', starts_at: 'Début', ends_at: 'Fin', place: 'Lieu', address: 'Adresse', map_url: 'Carte', note: 'À savoir', planB: 'Plan B', gift: 'Idée de cadeau', status: 'Statut' },
  en: { title: 'Title', starts_at: 'Start', ends_at: 'End', place: 'Place', address: 'Address', map_url: 'Map', note: 'Good to know', planB: 'Plan B', gift: 'Gift idea', status: 'Status' },
}
const STATUS: Record<MailLang, Record<string, string>> = {
  fr: { proposed: 'proposée', confirmed: 'confirmée', postponed: 'reportée', cancelled: 'annulée' },
  en: { proposed: 'proposed', confirmed: 'confirmed', postponed: 'postponed', cancelled: 'cancelled' },
}

// One readable line per change, for the update email, in the reader's language.
export function changeLines(changes: Change[], tz: string, lang: MailLang = 'fr'): string[] {
  const show = (field: ChangeField, v: string | null): string => {
    if (v === null) return lang === 'fr' ? '(rien)' : '(nothing)'
    if (field === 'starts_at' || field === 'ends_at') return whenLong(Number(v), lang, tz)
    if (field === 'status') return STATUS[lang][v] ?? v
    return v
  }
  return changes.map((c) =>
    c.field === 'address' || c.field === 'map_url'
      ? `${LABEL[lang][c.field]} : ${lang === 'fr' ? 'mise à jour, à voir sur la page' : 'updated, see the page'}`
      : `${LABEL[lang][c.field]} : ${show(c.field, c.old)} → ${show(c.field, c.new)}`,
  )
}

// « Toute la série »: how the edited occurrence's new start travels to the later ones. `duration` is the new length when
// the edit set an end (null: no end; undefined: the edit left the end alone, so each keeps its own length).
export interface Shift {
  delta: number
  duration: number | null | undefined
}
export function shiftOccurrence(startsAt: number, endsAt: number | null, s: Shift): { starts_at: number; ends_at: number | null } {
  const starts_at = startsAt + s.delta
  if (s.duration === null) return { starts_at, ends_at: null }
  if (typeof s.duration === 'number') return { starts_at, ends_at: starts_at + s.duration }
  return { starts_at, ends_at: endsAt === null ? null : endsAt + s.delta }
}
