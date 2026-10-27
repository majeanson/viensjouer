// The shareable link, in the shape a parent writes on a paper at the daycare door:
// `jouer.marcportal.com/h7kq-3wpm`. The hyphen is for the eye; the server forgives it.
export const CODE_RE = /^[a-z0-9]{4}-?[a-z0-9]{4}$/i

export function paperCode(token: string): string {
  const t = token.replace(/[^a-z0-9]/gi, '').toLowerCase()
  return t.length === 8 ? `${t.slice(0, 4)}-${t.slice(4)}` : t
}

export function linkFor(token: string): string {
  return `${location.origin}/${paperCode(token)}`
}

// What is printed next to it: the host, no scheme, no `/r/`.
export function linkLabel(token: string): string {
  return `${location.host}/${paperCode(token)}`
}
