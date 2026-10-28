// Light / dark / auto, persisted; public/theme-bootstrap.js applies it before React mounts.
// « auto » (nothing stored) follows the device, live: when the OS switches at dusk the app follows.
export type Theme = 'light' | 'dark'
export type ThemeChoice = 'auto' | Theme

// The page background in each theme, for the browser chrome (status bar, address bar). Must equal --paper in
// styles.css and the two <meta name="theme-color"> in index.html: designTokens.test.ts holds them together.
export const PAPER: Record<Theme, string> = { light: '#faf7f1', dark: '#1b1814' }

export const OS_DARK = '(prefers-color-scheme: dark)'

export function readChoice(): ThemeChoice {
  try {
    const t = localStorage.getItem('vj-theme')
    if (t === 'light' || t === 'dark') return t
  } catch {
    /* storage blocked */
  }
  return 'auto'
}

export const resolveTheme = (c: ThemeChoice): Theme => (c === 'auto' ? (matchMedia(OS_DARK).matches ? 'dark' : 'light') : c)

/** The order the header button cycles through. */
export const nextChoice = (c: ThemeChoice): ThemeChoice => (c === 'auto' ? 'light' : c === 'light' ? 'dark' : 'auto')

export function applyChoice(c: ThemeChoice): Theme {
  const t = resolveTheme(c)
  document.documentElement.dataset.theme = t === 'dark' ? 'dark' : ''
  // The chosen colour for the browser chrome: the two media-keyed metas collapse into it.
  for (const m of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
    m.removeAttribute('media')
    m.content = PAPER[t]
  }
  try {
    if (c === 'auto') localStorage.removeItem('vj-theme')
    else localStorage.setItem('vj-theme', c)
  } catch {
    /* storage blocked */
  }
  return t
}
