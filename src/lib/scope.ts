// The same one-line rule the server keeps (functions/_lib/kinds.ts kidsComing), so the host's
// card and the API agree: a friend-only invitation is exactly one child; a whole-family one is
// what the family said, or one when it did not say.
export function kidsComing(scope: 'friend' | 'family', kids: number | null): number {
  return scope === 'friend' ? 1 : kids ?? 1
}
