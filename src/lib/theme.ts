// Light / dark, persisted; public/theme-bootstrap.js applies it before React mounts.
export type Theme = 'light' | 'dark'

// The page background in each theme, for the browser chrome (status bar, address bar). Must equal --paper in
// styles.css and the two <meta name="theme-color"> in index.html: themeColors.test.ts holds the three together.
export const PAPER: Record<Theme, string> = { light: '#faf7f1', dark: '#1b1814' }

export function readTheme(): Theme {
  try {
    const t = localStorage.getItem('vj-theme')
    if (t === 'light' || t === 'dark') return t
  } catch {
    /* storage blocked */
  }
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function applyTheme(t: Theme): void {
  document.documentElement.dataset.theme = t === 'dark' ? 'dark' : ''
  // The in-app choice beats the OS one: the two media-keyed metas collapse into the chosen colour.
  for (const m of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
    m.removeAttribute('media')
    m.content = PAPER[t]
  }
  try {
    localStorage.setItem('vj-theme', t)
  } catch {
    /* storage blocked */
  }
}
