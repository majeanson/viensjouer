import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { K } from '../lib/query'
import { useAuth } from '../lib/auth'
import { useLang, useT } from '../i18n'
import { whenShort } from '../lib/format'
import { linkFor, linkLabel } from '../lib/link'
import { useDeferredRemove } from '../lib/toast'
import type { OpenWindow } from '../lib/types'
import { Icon } from './Icon'

// A « fenêtre ouverte » on the Rencontres list: a closed row (the free moment and a chip), and on a tap each family offered it, its answer,
// its link and the send / copy buttons. It used to be a page of its own; it sits in the list now, with everything else that is ahead.
export function WindowRow({ w }: { w: OpenWindow }) {
  const t = useT()
  const { lang } = useLang()
  const { me } = useAuth()
  const qc = useQueryClient()
  const rm = useDeferredRemove()
  const [copied, setCopied] = useState<string | null>(null)
  const send = useMutation({ mutationFn: (targetId: string) => api('windows', { method: 'PUT', body: { targetId } }) })
  if (rm.visible([w]).length === 0) return null
  async function copy(token: string) {
    const link = linkFor(token, 'w')
    try {
      await navigator.clipboard.writeText(link)
      setCopied(token)
      setTimeout(() => setCopied(null), 1500)
    } catch {
      prompt(t.encounters.copy, link)
    }
  }
  return (
    <details className="card friend">
      <summary>
        <span className="friend__who">
          <strong><Icon name="sparkle" />{t.agenda.free}</strong>
          <span className="muted small">{whenShort(w.starts_at, lang)} → {whenShort(w.ends_at, lang)}{w.note ? ` · ${w.note}` : ''}</span>
        </span>
      </summary>
      <div className="stack" style={{ marginTop: '0.75rem' }}>
        {w.targets.map((tg) => (
          <div key={tg.id} className="linkrow">
            <div className="row">
              <span><strong>{tg.child_first_name}</strong> <span className="muted small">· {tg.parent_name}</span></span>
              <span className={`chip ${tg.reply === 'yes' ? 'chip--yes' : tg.reply === 'no' ? 'chip--no' : ''}`}>{tg.reply === 'yes' ? t.windows.yes : tg.reply === 'no' ? t.windows.no : t.encounters.reply.none}</span>
            </div>
            {tg.reply_note && <p className="small" style={{ margin: 0 }}>« {tg.reply_note} »</p>}
            <div className="paper">{linkLabel(tg.token, 'w')}</div>
            <div className="cluster">
              <button className="btn btn--small" onClick={() => void copy(tg.token)}>{copied === tg.token ? t.encounters.copied : t.encounters.copy}</button>
              {me.mail && tg.email && <button className="btn btn--small" disabled={send.isPending} onClick={() => send.mutate(tg.id)}>{t.encounters.send}</button>}
            </div>
          </div>
        ))}
        <div className="cluster">
          <button className="btn btn--small btn--danger" onClick={() => rm.remove(w.id, t.undo.removed, async () => { await api('windows', { method: 'DELETE', body: { id: w.id } }); void qc.invalidateQueries({ queryKey: K.windows }); void qc.invalidateQueries({ queryKey: K.calendar }) })}>{t.encounters.delete}</button>
        </div>
      </div>
    </details>
  )
}
