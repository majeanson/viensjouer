// How much one household may hold. Signup is open and D1 and R2 are rented, so every thing a person can add in
// bulk has a ceiling far above any real family and far below a script. Counted from live (not deleted) rows.
// A ceiling is a bound, not a quota: nothing in the app displays or compares it.
import type { Env } from './env'

export const CEILING = { children: 12, families: 300, encounters: 1000, photos: 400 } as const
export type Thing = keyof typeof CEILING

const COUNT: Record<Thing, string> = {
  children: 'SELECT COUNT(*) AS n FROM children WHERE household_id = ? AND deleted_at IS NULL',
  families: 'SELECT COUNT(*) AS n FROM friend_families WHERE household_id = ? AND deleted_at IS NULL',
  encounters: 'SELECT COUNT(*) AS n FROM encounters WHERE household_id = ? AND deleted_at IS NULL',
  photos: 'SELECT COUNT(*) AS n FROM souvenirs s JOIN encounters e ON e.id = s.encounter_id WHERE e.household_id = ? AND s.deleted_at IS NULL',
}

/** How many more of `thing` this household may add. */
export async function roomFor(env: Env, thing: Thing, householdId: string): Promise<number> {
  const row = await env.DB.prepare(COUNT[thing]).bind(householdId).first<{ n: number }>()
  return Math.max(0, CEILING[thing] - (row?.n ?? 0))
}

export const FULL: Record<Thing, string> = {
  children: 'Douze enfants au plus par famille.',
  families: 'Trois cents familles amies au plus.',
  encounters: 'Mille rencontres au plus : efface les plus anciennes d’abord.',
  photos: 'Le plafond de photos est atteint : retire-en quelques-unes d’abord.',
}
