import { QueryClient } from '@tanstack/react-query'

// TanStack Query owns all server state. Keys live here so one is never spelled twice.
export const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 15_000, retry: 1, refetchOnWindowFocus: true } },
})

export const K = {
  me: ['me'] as const,
  children: ['children'] as const,
  families: ['families'] as const,
  encounters: ['encounters'] as const,
  encounter: (id: string) => ['encounter', id] as const,
  reply: (token: string) => ['reply', token] as const,
}
