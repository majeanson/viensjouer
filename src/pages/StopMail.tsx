import { useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { useT } from '../i18n'
import { Header } from '../components/Header'
import { Loading } from '../components/Loading'
import { QueryError } from '../components/QueryError'

// « Ne plus recevoir de courriels » (/stop/<code>), opened from the foot of an email to a friend family. No account: the
// code is the credential. It says what will happen, asks once, and lets the person take it back.
export function StopMail() {
  const { token = '' } = useParams()
  const t = useT()
  const qc = useQueryClient()
  const key = ['stop', token]
  const q = useQuery({ queryKey: key, queryFn: () => api<{ stopped: boolean }>(`r/${token}/stop-mail`) })
  const set = useMutation({
    mutationFn: (stop: boolean) => api<{ stopped: boolean }>(`r/${token}/stop-mail`, { method: 'POST', body: { stop } }),
    onSuccess: (r) => qc.setQueryData(key, r),
  })
  if (q.isLoading) return <Loading page />
  if (!q.data) return <QueryError page error={q.error} dead={t.reply.dead} onRetry={() => void q.refetch()} />
  const stopped = q.data.stopped
  return (
    <div className="shell">
      <Header />
      <main id="main" tabIndex={-1}>
        <h1>{t.stop.title}</h1>
        <div className="card">
          <p>{stopped ? t.stop.done : t.stop.body}</p>
          {set.error && <div className="notice notice--err" role="alert">{set.error.message}</div>}
          <button className={`btn ${stopped ? '' : 'btn--primary'}`} disabled={set.isPending} onClick={() => set.mutate(!stopped)}>{stopped ? t.stop.undo : t.stop.confirm}</button>
          <p className="muted small">{t.stop.hint}</p>
        </div>
      </main>
    </div>
  )
}
