// The six colours a child (and a board author) can have. Stored per child as a hex string, so they are data, not
// theme tokens; what adapts is the INK drawn on them: `inkOn` picks near-black or white, whichever reads better.
export const PALETTE = ['#f2a03d', '#5b9a8b', '#c76b6b', '#7c83c9', '#b98b3a', '#4f8fbf'] as const

/** A stable colour for someone with no colour of their own (a board author, a friend's child): the same name always gets the same one. */
export const colourOf = (name: string): string => PALETTE[[...name].reduce((n, c) => n + c.charCodeAt(0), 0) % PALETTE.length]

const DARK = '#1b1814'
const LIGHT = '#ffffff'

function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16)
  const ch = (v: number) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * ch((n >> 16) & 255) + 0.7152 * ch((n >> 8) & 255) + 0.0722 * ch(n & 255)
}

export const contrast = (a: string, b: string): number => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

/** The text colour for a face on `bg`: a hex that reads at least as well as the alternative; undefined for a CSS token, which sets its own. */
export function inkOn(bg: string | undefined): string | undefined {
  if (!bg || !/^#[0-9a-f]{6}$/i.test(bg)) return undefined
  return contrast(bg, LIGHT) >= contrast(bg, DARK) ? LIGHT : DARK
}
