// First paint only: set the theme from localStorage, else the OS. src/lib/theme.ts
// owns it after mount. A saved choice also wins over the OS for the browser chrome (status bar): the two
// media-keyed theme-color metas collapse into the chosen paper colour (same hex as --paper; designTokens.test.ts).
try {
  var t = localStorage.getItem('vj-theme')
  if (t === 'dark' || (!t && matchMedia('(prefers-color-scheme: dark)').matches)) {
    document.documentElement.dataset.theme = 'dark'
  }
  if (t === 'dark' || t === 'light') {
    var metas = document.querySelectorAll('meta[name="theme-color"]')
    for (var i = 0; i < metas.length; i++) {
      metas[i].removeAttribute('media')
      metas[i].setAttribute('content', t === 'dark' ? '#1b1814' : '#faf7f1')
    }
  }
} catch (e) {
  /* storage blocked: the OS default applies through CSS */
}
