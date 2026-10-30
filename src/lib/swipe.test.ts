import { describe, expect, it, vi } from 'vitest'
import { swipe } from './swipe'

const down = (x: number, y = 0, pointerType = 'touch') => ({ pointerType, clientX: x, clientY: y }) as never
const up = (x: number, y = 0) => ({ clientX: x, clientY: y }) as never

describe('swipe', () => {
  it('left and right call their own action, and the tap after a swipe is swallowed', () => {
    const left = vi.fn()
    const right = vi.fn()
    const s = swipe(left, right)
    s.onPointerDown(down(200))
    s.onPointerUp(up(100, 8))
    expect(left).toHaveBeenCalledTimes(1)
    const click = { preventDefault: vi.fn() }
    s.onClick(click as never)
    expect(click.preventDefault).toHaveBeenCalled()
    s.onPointerDown(down(100))
    s.onPointerUp(up(200, 4))
    expect(right).toHaveBeenCalledTimes(1)
  })
  it('ignores a short move, a vertical scroll and a mouse', () => {
    const left = vi.fn()
    const s = swipe(left, left)
    s.onPointerDown(down(200))
    s.onPointerUp(up(170))
    s.onPointerDown(down(200, 0))
    s.onPointerUp(up(100, 120))
    s.onPointerDown(down(200, 0, 'mouse'))
    s.onPointerUp(up(50))
    expect(left).not.toHaveBeenCalled()
    const click = { preventDefault: vi.fn() }
    s.onClick(click as never)
    expect(click.preventDefault).not.toHaveBeenCalled()
  })
})
