// The client's side of « what changed »: the same rule the server keeps (functions/_lib/changes.ts),
// so the host's edit form can PREVIEW exactly what the families will see, and the invited page can
// word each change. Values are display strings; times are unix seconds as text.
import { whenShort } from './format'
import type { Lang } from '../i18n'

export type ChangeField = 'title' | 'starts_at' | 'ends_at' | 'place' | 'address' | 'map_url' | 'note' | 'planB' | 'gift' | 'status'
const ORDER: ChangeField[] = ['title', 'starts_at', 'ends_at', 'place', 'address', 'map_url', 'note', 'planB', 'gift', 'status']

export interface Snap {
  title: string
  starts_at: number
  ends_at: number | null
  place: string | null
  address: string | null
  map_url: string | null
  note: string | null
  planB: string | null
  gift: string | null
  status: string
}

// What the API stores and sends (encounter_changes).
export interface ChangeRow {
  field: ChangeField
  old_value: string | null
  new_value: string | null
  created_at: number
}

export interface Described {
  field: ChangeField
  from: string | null
  to: string | null
}

const blank = (v: string | null | undefined): string | null => {
  const t = (v ?? '').trim()
  return t ? t : null
}

// The fields that differ, in the fixed order. The address changes carry no values, only the fact.
export function clientDiff(before: Snap, after: Snap): Described[] {
  const out: Described[] = []
  for (const f of ORDER) {
    const isTime = f === 'starts_at' || f === 'ends_at'
    const a = isTime ? (before[f] === null ? null : String(before[f])) : blank(before[f] as string | null)
    const b = isTime ? (after[f] === null ? null : String(after[f])) : blank(after[f] as string | null)
    if (a === b) continue
    out.push(f === 'address' || f === 'map_url' ? { field: f, from: null, to: null } : { field: f, from: a, to: b })
  }
  return out
}

// Address and map link are shown as « updated », never with their values (a home must not leak into a log).
export const isPrivate = (f: ChangeField): f is 'address' | 'map_url' => f === 'address' || f === 'map_url'

export const fromRow = (c: ChangeRow): Described => ({ field: c.field, from: c.old_value, to: c.new_value })

// A value as a person reads it: a time in their language, a status in words, text as is, nothing as `empty`.
export function showValue(field: ChangeField, v: string | null, lang: Lang, statusLabels: Record<string, string>, empty: string): string {
  if (v === null) return empty
  if (field === 'starts_at' || field === 'ends_at') return whenShort(Number(v), lang)
  if (field === 'status') return statusLabels[v] ?? v
  return v
}

// When did this device last open this link? Used to mark what is NEW since then. Kept per link, in the
// browser only (a parent without storage simply sees no « Modifié » marks, never an error).
export const seenKey = (token: string) => `vj-seen-${token}`
export function readSeen(key: string): number | null {
  try {
    const v = localStorage.getItem(key)
    return v ? Number(v) : null
  } catch {
    return null
  }
}
export function writeSeen(key: string, sec: number): void {
  try {
    localStorage.setItem(key, String(sec))
  } catch {
    /* storage blocked */
  }
}
