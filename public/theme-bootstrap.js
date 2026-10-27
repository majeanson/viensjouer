// First paint only: set the theme from localStorage, else the OS. src/lib/theme.ts
// owns it after mount.
try {
  var t = localStorage.getItem('vj-theme')
  if (t === 'dark' || (!t && matchMedia('(prefers-color-scheme: dark)').matches)) {
    document.documentElement.dataset.theme = 'dark'
  }
} catch (e) {
  /* storage blocked: the OS default applies through CSS */
}
