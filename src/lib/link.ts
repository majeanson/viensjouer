// The shareable link, in the shape a parent writes on a paper at the daycare door:
// `jouer.marcportal.com/lune-miel`. Older 8-character codes (« h7kq-3wpm ») still work.
export const CODE_RE = /^([a-z]{3,7}-[a-z]{3,7}|[a-z0-9]{4}-?[a-z0-9]{4})$/i

// How a code is WRITTEN: a new one already is; an old 8-character one gets its hyphen.
export function paperCode(token: string): string {
  if (token.includes('-')) return token
  const t = token.replace(/[^a-z0-9]/gi, '').toLowerCase()
  return t.length === 8 ? `${t.slice(0, 4)}-${t.slice(4)}` : t
}

// `prefix` is 'w' for an open window (/w/<code>); a rencontre has none.
export function linkFor(token: string, prefix = ''): string {
  return `${location.origin}/${prefix ? prefix + '/' : ''}${paperCode(token)}`
}

// What is printed next to it: the host, no scheme.
export function linkLabel(token: string, prefix = ''): string {
  return `${location.host}/${prefix ? prefix + '/' : ''}${paperCode(token)}`
}
