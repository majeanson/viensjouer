// Session context. The server's cookie is the truth; this caches /api/auth/me.
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { api } from './api'

interface Me {
  signedIn: boolean
  email?: string
  displayName?: string
  household?: { id: string; name: string; tz: string } | null
  mail?: boolean
  demo?: boolean
  photo?: string | null
  remindHost?: boolean
}

interface AuthState {
  loading: boolean
  me: Me
  refresh: () => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthState>({ loading: true, me: { signedIn: false }, refresh: async () => {}, signOut: async () => {} })

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true)
  const [me, setMe] = useState<Me>({ signedIn: false })
  const qc = useQueryClient()

  const refresh = useCallback(async () => {
    try {
      setMe(await api<Me>('auth/me'))
    } catch {
      setMe({ signedIn: false })
    } finally {
      setLoading(false)
    }
  }, [])

  const signOut = useCallback(async () => {
    try {
      await api('auth/logout', { method: 'POST' })
    } finally {
      qc.clear()
      setMe({ signedIn: false })
    }
  }, [qc])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return <AuthContext.Provider value={{ loading, me, refresh, signOut }}>{children}</AuthContext.Provider>
}

export const useAuth = () => useContext(AuthContext)
