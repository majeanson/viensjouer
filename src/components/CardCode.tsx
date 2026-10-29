import { useRef, useState, type ClipboardEvent, type FormEvent, type KeyboardEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useT } from '../i18n'
import { Icon } from './Icon'
import { CODE_RE } from '../lib/link'

// A paper card carries two words; whoever holds it types one word per box. A space or a hyphen
// jumps to the second box, pasting both words fills both, accents and capitals are forgiven.
const clean = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '')
const split = (s: string) => s.toLowerCase().trim().split(/[\s_.,-]+/).filter(Boolean)

export function CardCode() {
  const t = useT()
  const nav = useNavigate()
  const [a, setA] = useState('')
  const [b, setB] = useState('')
  const [bad, setBad] = useState(false)
  const second = useRef<HTMLInputElement>(null)
  const first = useRef<HTMLInputElement>(null)

  const code = `${clean(a)}-${clean(b)}`
  const ready = CODE_RE.test(code)

  function fill(raw: string, into: 'a' | 'b') {
    setBad(false)
    const parts = split(raw)
    if (parts.length > 1 && /[\s_.,-]/.test(raw.trim())) {
      // Both words arrived in one go (paste, autofill, a typed space): spread them.
      if (into === 'a') {
        setA(parts[0])
        setB(parts.slice(1).join(''))
      } else {
        setB(parts.join(''))
      }
      second.current?.focus()
    } else if (into === 'a') {
      setA(raw)
      if (/\s$/.test(raw) && clean(raw)) {
        setA(clean(raw))
        second.current?.focus()
      }
    } else setB(raw)
  }
  function onPaste(e: ClipboardEvent<HTMLInputElement>, into: 'a' | 'b') {
    const text = e.clipboardData.getData('text')
    if (into === 'a' && split(text).length > 1) {
      e.preventDefault()
      fill(text, 'a')
    }
  }
  function onKey(e: KeyboardEvent<HTMLInputElement>, into: 'a' | 'b') {
    if (into === 'a' && (e.key === ' ' || e.key === '-' || e.key === 'Enter') && clean(a)) {
      e.preventDefault()
      second.current?.focus()
    }
    if (into === 'b' && e.key === 'Backspace' && !b) {
      e.preventDefault()
      first.current?.focus()
    }
  }
  function open(e: FormEvent) {
    e.preventDefault()
    if (ready) nav(`/${code}`)
    else setBad(true)
  }

  const [p1, p2] = t.door.cardPlaceholder.split(' ')
  const common = { className: 'cardcode__in', autoCapitalize: 'none', autoCorrect: 'off', spellCheck: false, maxLength: 24, enterKeyHint: 'go', autoComplete: 'off' } as const
  return (
    <form className={`cardcode ${ready ? 'cardcode--ready' : ''}`} onSubmit={open} aria-label={t.door.cardLabel}>
      <h2><Icon name="note" />{t.door.cardTitle}</h2>
      <p className="muted small">{t.door.cardHint}</p>
      <div className="cardcode__paper">
        <input {...common} ref={first} value={a} aria-label={t.door.cardWord1} placeholder={p1} onChange={(e) => fill(e.target.value, 'a')} onPaste={(e) => onPaste(e, 'a')} onKeyDown={(e) => onKey(e, 'a')} />
        <span className="cardcode__dot" aria-hidden="true" />
        <input {...common} ref={second} value={b} aria-label={t.door.cardWord2} placeholder={p2} onChange={(e) => fill(e.target.value, 'b')} onKeyDown={(e) => onKey(e, 'b')} />
      </div>
      {bad && <div className="notice notice--err" role="alert">{t.door.cardBad}</div>}
      <button className="btn btn--primary btn--big" type="submit">{t.door.cardGo}</button>
    </form>
  )
}
