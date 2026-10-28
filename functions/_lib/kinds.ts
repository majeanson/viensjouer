// Phase 4 — the rules of the three kinds, pure and tested (phase4.test.ts). The handlers
// only validate with these and store; no rule lives in a handler.
import type { Kind, Reply, Status } from './encounters'

// Kind-specific details kept in `encounters.details` (JSON, NOT NULL default '{}'): only
// the birthday has any today — a soft gift wish, never a registry.
export function cleanDetails(kind: Kind, raw: unknown): Record<string, string> {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  if (kind === 'birthday' && typeof o.gift === 'string') {
    const gift = o.gift.trim().slice(0, 200)
    return gift ? { gift } : {}
  }
  return {}
}
export function parseDetails(json: string | null | undefined): Record<string, string> {
  try {
    const v = JSON.parse(json ?? '{}')
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, string>) : {}
  } catch {
    return {}
  }
}

// The home card: a fixed shape, validated on write so a reader never guards a key.
export interface HomeCard {
  dog: boolean
  pool: boolean
  screens: 'none' | 'little' | 'free' | null
  nutFree: boolean
  note: string
}
export const SCREENS = ['none', 'little', 'free'] as const
export function cleanHomeCard(raw: unknown): HomeCard {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const screens = (SCREENS as readonly unknown[]).includes(o.screens) ? (o.screens as HomeCard['screens']) : null
  return {
    dog: o.dog === true,
    pool: o.pool === true,
    screens,
    nutFree: o.nutFree === true,
    note: typeof o.note === 'string' ? o.note.trim().slice(0, 400) : '',
  }
}
// '{}' (never filled) and an all-empty card both read as « nothing to show ».
export function homeCardOrNull(json: string | null | undefined): HomeCard | null {
  if (!json) return null
  const c = cleanHomeCard(parseDetails(json) as unknown)
  return c.dog || c.pool || c.nutFree || c.screens || c.note ? c : null
}

// « On y est »: only around the rencontre itself — from three hours before the start to
// six after the end — and never on a cancelled one. A host cannot pre-announce Saturday on
// Wednesday, and a stale « on y est » cannot linger.
const HERE_BEFORE_SEC = 3 * 3600
const HERE_AFTER_SEC = 6 * 3600
export function hereAllowed(e: { starts_at: number; ends_at: number | null; status: Status }, now: number): boolean {
  if (e.status === 'cancelled') return false
  return now >= e.starts_at - HERE_BEFORE_SEC && now <= (e.ends_at ?? e.starts_at + 2 * 3600) + HERE_AFTER_SEC
}

// Souvenirs stay reachable to the families that said yes for 60 days — longer than the
// reply link itself, which closes a day after the rencontre.
export const SOUVENIR_WINDOW_SEC = 60 * 24 * 3600
export function souvenirsVisible(e: { starts_at: number; status: Status }, reply: Reply | null, now: number): boolean {
  return reply === 'yes' && e.status !== 'cancelled' && e.starts_at <= now + 3600 && e.starts_at > now - SOUVENIR_WINDOW_SEC
}

// The RSVP count a birthday asks for: small whole numbers, or nothing.
export function cleanCount(v: unknown): number | null {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 20 ? v : null
}

// « Fiche de relais »: four short optional fields, trimmed; null when all are empty.
export const RELAIS_TTL_SEC = 7 * 24 * 3600
export function cleanRelais(raw: unknown): { nap: string | null; ate: string | null; mood: string | null; note: string | null } | null {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const f = (k: string, cap: number) => (typeof o[k] === 'string' && (o[k] as string).trim() ? (o[k] as string).trim().slice(0, cap) : null)
  const r = { nap: f('nap', 120), ate: f('ate', 160), mood: f('mood', 60), note: f('note', 400) }
  return r.nap || r.ate || r.mood || r.note ? r : null
}

// ---- Who an invitation is for ------------------------------------------------------
export type Scope = 'friend' | 'family'
export const isScope = (v: unknown): v is Scope => v === 'friend' || v === 'family'

// A birthday (often paid, a fixed number of seats) starts as « the friend only »; a park or a
// play-date starts as « the whole family ». Only a default: the host can flip either, per family.
export function defaultScope(kind: Kind): Scope {
  return kind === 'birthday' ? 'friend' : 'family'
}

// What an answer's head-count means for the scope. A friend-only invitation never carries a
// number of children (it is one), and only a birthday asks how many adults stay.
export function headcount(kind: Kind, scope: Scope, body: { adults?: unknown; kids?: unknown }): { adults: number | null; kids: number | null } {
  return {
    adults: kind === 'birthday' ? cleanCount(body.adults) : null,
    kids: scope === 'family' ? cleanCount(body.kids) : null,
  }
}

// How many children come, for the host's line: friend-only is exactly one; whole-family is what
// they said, or one when they did not say.
export function kidsComing(scope: Scope, kids: number | null): number {
  return scope === 'friend' ? 1 : kids ?? 1
}
