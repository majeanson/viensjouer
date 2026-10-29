import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { PALETTE } from '../lib/palette'
import { useLang, useT } from '../i18n'
import { whenShort } from '../lib/format'
import { Face } from './Face'
import { Icon } from './Icon'
import type { Lang } from '../i18n'

// « Le tableau » — the rencontre's message board, for everyone who is invited: where to meet, what to
// bring, a photo to come and see. It exists as soon as the rencontre does and stays readable afterwards,
// so people can come back to it. The host pins what matters (three at most) and can remove anything; a
// family removes only its own. What is new since your last visit on THIS device is marked; nothing is
// counted, ranked or pushed (calm).
export interface BoardMessage {
  id: string
  author_kind: 'host' | 'guest'
  author_label: string
  text: string
  created_at: number
  pinned?: number | boolean
  mine?: boolean
}

const colourOf = (name: string) => PALETTE[[...name].reduce((n, c) => n + c.charCodeAt(0), 0) % PALETTE.length]

const rtf = new Map<Lang, Intl.RelativeTimeFormat>()
export function ago(sec: number, lang: Lang, now = Math.floor(Date.now() / 1000)): string {
  const diff = sec - now
  const abs = Math.abs(diff)
  if (abs >= 7 * 86_400) return whenShort(sec, lang)
  let f = rtf.get(lang)
  if (!f) rtf.set(lang, (f = new Intl.RelativeTimeFormat(lang === 'fr' ? 'fr-CA' : 'en-CA', { numeric: 'auto' })))
  if (abs < 60) return f.format(0, 'second')
  if (abs < 3600) return f.format(Math.round(diff / 60), 'minute')
  if (abs < 86_400) return f.format(Math.round(diff / 3600), 'hour')
  return f.format(Math.round(diff / 86_400), 'day')
}

// Plain text with http(s) links made clickable — built as React nodes, never as HTML.
export function linkify(text: string): ReactNode[] {
  const out: ReactNode[] = []
  const re = /https?:\/\/[^\s<>"]+[^\s<>".,;:!?)\]]/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index))
    out.push(<a key={m.index} href={m[0]} target="_blank" rel="noopener noreferrer nofollow">{m[0]}</a>)
    last = m.index + m[0].length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

const SEEN = (key: string) => `vj-board-${key}`
const readSeen = (key: string): number | null => {
  try {
    const v = localStorage.getItem(SEEN(key))
    return v ? Number(v) : null
  } catch {
    return null
  }
}
const writeSeen = (key: string, sec: number) => {
  try {
    localStorage.setItem(SEEN(key), String(sec))
  } catch {
    /* storage blocked: no « new » marks, never an error */
  }
}

export function MessageBoard({
  messages,
  canPost,
  posting,
  onPost,
  onDelete,
  onPin,
  isHost,
  seenKey,
  full,
}: {
  messages: BoardMessage[]
  canPost: boolean
  posting: boolean
  onPost: (text: string) => void
  onDelete?: (m: BoardMessage) => void
  onPin?: (m: BoardMessage, pinned: boolean) => void
  isHost: boolean
  seenKey: string
  full?: boolean
}) {
  const t = useT()
  const { lang } = useLang()
  const [seenAt] = useState<number | null>(() => readSeen(seenKey))
  const [text, setText] = useState('')
  const area = useRef<HTMLTextAreaElement>(null)
  const last = messages.reduce((n, m) => Math.max(n, m.created_at), 0)

  // Mark everything seen a moment after the board is on screen.
  useEffect(() => {
    if (!last) return
    const id = setTimeout(() => writeSeen(seenKey, last), 2500)
    return () => clearTimeout(id)
  }, [last, seenKey])

  const isNew = (m: BoardMessage) => seenAt !== null && m.created_at > seenAt && !m.mine && !(isHost && m.author_kind === 'host')
  const pinned = useMemo(() => messages.filter((m) => m.pinned), [messages])
  const rest = useMemo(() => messages.filter((m) => !m.pinned), [messages])
  const fresh = messages.filter(isNew).length

  function submit(ev: FormEvent) {
    ev.preventDefault()
    const v = text.trim()
    if (!v || posting) return
    onPost(v)
    setText('')
    requestAnimationFrame(() => area.current?.focus())
  }

  const Row = ({ m }: { m: BoardMessage }) => (
    <li className={`bmsg ${m.author_kind === 'host' ? 'bmsg--host' : ''} ${isNew(m) ? 'bmsg--new' : ''}`}>
      <Face name={m.author_label} colour={m.author_kind === 'host' ? 'var(--host)' : colourOf(m.author_label)} size="sm" />
      <div className="bmsg__body">
        <div className="bmsg__head">
          <strong>{m.author_label}</strong>
          {m.author_kind === 'host' && <span className="chip chip--kind">{t.board.host}</span>}
          {m.mine && <span className="chip chip--kind">{t.board.mine}</span>}
          <span className="muted small" title={whenShort(m.created_at, lang)}>{ago(m.created_at, lang)}</span>
          {isNew(m) && <span className="changed">{t.board.new}</span>}
        </div>
        <p className="bmsg__text">{linkify(m.text)}</p>
        {(onPin || onDelete) && (isHost || m.mine) && (
          <div className="cluster bmsg__tools">
            {isHost && onPin && (
              <button type="button" className="btn btn--small" onClick={() => onPin(m, !m.pinned)}>
                <Icon name="pushpin" />{m.pinned ? t.board.unpin : t.board.pin}
              </button>
            )}
            {onDelete && (isHost || m.mine) && (
              <button type="button" className="btn btn--small btn--danger" onClick={() => onDelete(m)}>
                <Icon name="trash" />{t.board.remove}
              </button>
            )}
          </div>
        )}
      </div>
    </li>
  )

  return (
    <section className={`card board ${full ? 'board--full' : ''}`} aria-label={t.board.title}>
      <div className="row" style={{ alignItems: 'center' }}>
        <h3 style={{ margin: 0 }}><Icon name="message" />{t.board.title}{messages.length > 0 ? ` (${messages.length})` : ''}</h3>
        {fresh > 0 && <span className="changed" aria-live="polite">{t.board.newCount(fresh)}</span>}
      </div>
      <p className="muted small" style={{ margin: '0.25rem 0 0.75rem' }}>{t.board.hint}</p>

      {pinned.length > 0 && (
        <ul className="blist blist--pinned" aria-label={t.board.pinned}>
          {pinned.map((m) => <Row key={m.id} m={m} />)}
        </ul>
      )}
      {messages.length === 0 ? (
        <p className="board__empty muted">{canPost ? t.board.empty : t.board.closedEmpty}</p>
      ) : (
        <ul className="blist">{rest.map((m) => <Row key={m.id} m={m} />)}</ul>
      )}

      {canPost ? (
        <form className="board__form" onSubmit={submit}>
          <label className="sr-only" htmlFor={`board-${seenKey}`}>{t.board.placeholder}</label>
          <textarea
            id={`board-${seenKey}`}
            ref={area}
            className="input"
            rows={2}
            maxLength={1000}
            value={text}
            placeholder={t.board.placeholder}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) submit(e)
            }}
          />
          <div className="row" style={{ alignItems: 'center' }}>
            <span className="muted small">{text.length > 800 ? `${text.length}/1000` : ''}</span>
            <button className="btn btn--primary" disabled={posting || !text.trim()}><Icon name="message" />{t.board.send}</button>
          </div>
        </form>
      ) : (
        messages.length > 0 && <p className="muted small" style={{ margin: '0.75rem 0 0' }}>{t.board.closed}</p>
      )}
    </section>
  )
}
