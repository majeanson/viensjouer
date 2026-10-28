import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { AppRoutes } from './router'
import { AuthProvider } from './lib/auth'
import { ToastProvider } from './lib/toast'
import { queryClient } from './lib/query'
import { LangContext, readLang, writeLang, type Lang } from './i18n'
import './styles.css'

function Root() {
  const [lang, setLangState] = useState<Lang>(readLang)
  const setLang = (l: Lang) => {
    writeLang(l)
    setLangState(l)
    document.documentElement.lang = l
  }
  return (
    <LangContext.Provider value={{ lang, setLang }}>
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
