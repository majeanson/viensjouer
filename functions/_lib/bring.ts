// « À apporter » — pure rules, tested without a database (bring.test.ts).
export const MAX_BRING = 20

// One short line, no markup, no empty text.
export function cleanLabel(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const t = v.replace(/\s+/g, ' ').trim().slice(0, 60)
  return t ? t : null
}

// Only a family that is coming (or might) takes something; a no or silence does not.
export const canClaim = (reply: string | null): boolean => reply === 'yes' || reply === 'maybe'
