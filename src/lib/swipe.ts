import type { MouseEvent, PointerEvent } from 'react'

// A swipe on a row (a finger, not a mouse): left and right each do one thing, and the tap that follows a swipe is swallowed so the row
// does not also open. The row keeps real buttons for anyone who does not swipe (a mouse, a keyboard, a screen reader).
// One gesture at a time on a phone, so the state is module-wide.
let from: { x: number; y: number } | null = null
let swiped = false

export function swipe(onLeft?: () => void, onRight?: () => void) {
  return {
    style: { touchAction: 'pan-y' } as const,
    onPointerDown: (e: PointerEvent) => {
      if (e.pointerType === 'mouse') return
      from = { x: e.clientX, y: e.clientY }
      swiped = false
    },
    onPointerUp: (e: PointerEvent) => {
      const s = from
      from = null
      if (!s) return
      const dx = e.clientX - s.x
      const dy = e.clientY - s.y
      if (Math.abs(dx) > 70 && Math.abs(dx) > 2 * Math.abs(dy)) {
        swiped = true
        ;(dx < 0 ? onLeft : onRight)?.()
      }
    },
    onPointerCancel: () => {
      from = null
    },
    onClick: (e: MouseEvent) => {
      if (swiped) {
        e.preventDefault()
        swiped = false
      }
    },
  }
}
