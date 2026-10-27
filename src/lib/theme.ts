// Light / dark, persisted; public/theme-bootstrap.js applies it before React mounts.
export type Theme = 'light' | 'dark'

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
  try {
    localStorage.setItem('vj-theme', t)
  } catch {
    /* storage blocked */
  }
}
