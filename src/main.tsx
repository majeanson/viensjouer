import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { AppRoutes } from './router'
import { AuthProvider } from './lib/auth'
import { ToastProvider } from './lib/toast'
import { queryClient } from './lib/query'
import { FR, LangContext, readLang, writeLang, type Dict, type Lang } from './i18n'
import './styles.css'

function Root() {
  const [lang, setLangState] = useState<Lang>(readLang)
  // English is its own chunk: loaded the first time a visitor needs it. A first visit in English waits for it
  // (a blank beat beats a flash of French); switching later keeps the page and swaps the words when ready.
  const [en, setEn] = useState<Dict | null>(null)
  const [booted, setBooted] = useState(lang === 'fr')
  useEffect(() => {
    if (lang !== 'en' || en) return
    let live = true
    void import('./i18n.en').then((m) => {
      if (!live) return
      setEn(m.EN)
      setBooted(true)
    })
    return () => {
      live = false
    }
  }, [lang, en])
  const setLang = (l: Lang) => {
    writeLang(l)
    setLangState(l)
    document.documentElement.lang = l
  }
  if (!booted) return null
  return (
    <LangContext.Provider value={{ lang, setLang, dict: lang === 'en' && en ? en : FR }}>
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
