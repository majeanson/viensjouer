import { useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from 'react'
import { Icon } from './Icon'

// A row you can slide with a finger (not a mouse): the row follows the finger and shows what it will do, red with a bin to the left
// (remove), the accent colour with a pencil to the right (edit). It only counts if you let go past the mark; let go before it and the
// row slides back and nothing happens, so it is always on purpose. The icon buttons stay in the row for anyone who does not slide.
const MARK_PX = 110
// Nothing slides back by animation for someone who asked their device for less motion.
const calm = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
const INTERACTIVE = 'button, a, input, textarea, select, label, summary > *:not(span):not(strong)'

export function SwipeRow({ onLeft, onRight, leftLabel, rightLabel, children }: { onLeft?: () => void; onRight?: () => void; leftLabel: string; rightLabel: string; children: ReactNode }) {
  const [dx, setDx] = useState(0)
  const [drag, setDrag] = useState(false)
  const from = useRef<{ x: number; y: number; id: number } | null>(null)
  const locked = useRef(false)
  const swallow = useRef(false)
  const box = useRef<HTMLDivElement>(null)
  const mark = () => Math.min(MARK_PX, (box.current?.clientWidth ?? 300) * 0.4)

  const down = (e: PointerEvent) => {
    if (e.pointerType === 'mouse' || (e.target as HTMLElement).closest(INTERACTIVE)) return
    from.current = { x: e.clientX, y: e.clientY, id: e.pointerId }
    locked.current = false
  }
  const move = (e: PointerEvent) => {
    const s = from.current
    if (!s) return
    const mx = e.clientX - s.x
    const my = e.clientY - s.y
    if (!locked.current) {
      if (Math.abs(my) > 10 && Math.abs(my) > Math.abs(mx)) { from.current = null; return }
      if (Math.abs(mx) < 12 || Math.abs(mx) < Math.abs(my)) return
      locked.current = true
      setDrag(true)
      try { box.current?.setPointerCapture(s.id) } catch { /* a pointer that is already gone: the drag still follows the moves */ }
    }
    const max = box.current?.clientWidth ?? 300
    setDx(Math.max(-max, Math.min(max, mx)))
  }
  const up = () => {
    const was = locked.current
    const m = mark()
    const moved = dx
    from.current = null
    locked.current = false
    setDrag(false)
    setDx(0)
    if (!was) return
    swallow.current = true
    setTimeout(() => { swallow.current = false }, 0)
    if (moved <= -m) onLeft?.()
    else if (moved >= m) onRight?.()
  }

  const m = mark()
  const reach = Math.min(1, Math.abs(dx) / m)
  const left = dx < 0
  const under: CSSProperties = {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: left ? 'flex-end' : 'flex-start',
    gap: '0.5rem',
    padding: '0 1rem',
    fontWeight: 700,
    color: left ? '#fff' : 'var(--accent-ink)',
    background: left ? 'var(--bad)' : 'var(--accent)',
    opacity: dx === 0 ? 0 : 0.35 + 0.65 * reach,
  }
  return (
    <div
      ref={box}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      onClickCapture={(e) => { if (swallow.current) { e.preventDefault(); e.stopPropagation() } }}
      style={{ position: 'relative', overflow: 'hidden', borderRadius: 'var(--r-lg, var(--radius))', touchAction: 'pan-y' }}
    >
      <div aria-hidden="true" style={under}>
        {left ? <>{reach >= 1 ? leftLabel : ''}<Icon name="trash" /></> : <><Icon name="edit" />{reach >= 1 ? rightLabel : ''}</>}
      </div>
      <div style={{ position: 'relative', transform: `translateX(${dx}px)`, transition: drag || calm ? 'none' : 'transform 0.2s ease' }}>{children}</div>
    </div>
  )
}
