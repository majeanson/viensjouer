// « Proposer plusieurs moments » — the rules in one place. At most four times on offer, all ahead.
export const MAX_SLOTS = 4

// Clean a list of times from the browser: whole seconds, ahead of `now`, no repeats, soonest first, at most MAX_SLOTS.
export function cleanSlots(raw: unknown, now: number): number[] {
  if (!Array.isArray(raw)) return []
  const ok = raw.filter((v): v is number => typeof v === 'number' && Number.isFinite(v)).map(Math.floor).filter((v) => v > now)
  return [...new Set(ok)].sort((a, b) => a - b).slice(0, MAX_SLOTS)
}
