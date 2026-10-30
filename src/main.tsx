import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { AppRoutes } from './router'
import { AuthProvider } from './lib/auth'
import { ToastProvider } from './lib/toast'
import { queryClient } from './lib/query'
import { LangContext, readLang, writeLang, type Dict, type Lang } from './i18n'
import './styles.css'

// Each language is two files (the two halves of its dictionary), fetched together and merged.
const loadDict = (l: Lang): Promise<Dict> =>
  l === 'en'
    ? Promise.all([import('./i18n.en'), import('./i18n.en.more')]).then(([a, b]) => ({ ...a.EN, ...b.EN_MORE }))
    : Promise.all([import('./i18n.fr'), import('./i18n.fr.more')]).then(([a, b]) => ({ ...a.FR, ...b.FR_MORE }))

function Root() {
  const [lang, setLangState] = useState<Lang>(readLang)
  // Each dictionary is its own chunk, loaded for the language the visitor needs. The first render waits for it (a blank
  // beat beats a flash of the other language); switching later keeps the page and swaps the words when ready.
  const [dicts, setDicts] = useState<Partial<Record<Lang, Dict>>>({})
  // The page's own language follows the visitor's (screen readers pick their voice from it), also on first load.
  useEffect(() => {
    document.documentElement.lang = lang
  }, [lang])
  useEffect(() => {
    if (dicts[lang]) return
    let live = true
    void loadDict(lang).then((d) => {
      if (live) setDicts((cur) => ({ ...cur, [lang]: d }))
    })
    return () => {
      live = false
    }
  }, [lang, dicts])
  const setLang = (l: Lang) => {
    writeLang(l)
    setLangState(l)
    document.documentElement.lang = l
  }
  const dict = dicts[lang] ?? dicts[lang === 'fr' ? 'en' : 'fr']
  if (!dict) return null
  return (
    <LangContext.Provider value={{ lang, setLang, dict }}>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <BrowserRouter>
            <ToastProvider>
              <AppRoutes />
            </ToastProvider>
          </BrowserRouter>
        </AuthProvider>
      </QueryClientProvider>
    </LangContext.Provider>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)

// Installable, never cached: see public/sw.js.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  addEventListener('load', () => void navigator.serviceWorker.register('/sw.js').catch(() => {}))
}
