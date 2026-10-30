import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

// Opening a section or tapping a button must never pop the phone keyboard: people look first, then tap to type.
// No `autoFocus`, and `.focus()` only on the page container (skip link, route change) or through focusIfFinePointer.
// Sheet.tsx focuses the sheet's own box (a div: no keyboard) when it opens and gives the focus back to what opened it, never a field.
const ALLOWED_FOCUS = ['src/components/Sheet.tsx', 'src/components/Header.tsx', 'src/components/CardCode.tsx', 'src/lib/pageTitle.ts', 'src/lib/focus.ts']
const walk = (d: string): string[] => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : /\.tsx?$/.test(f) ? [join(d, f).replaceAll('\\', '/')] : []))

describe('no keyboard pops by itself', () => {
  const files = walk('src')
  it('has no autoFocus', () => {
    expect(files.filter((f) => /autoFocus|autofocus/.test(readFileSync(f, 'utf8')))).toEqual([])
  })
  it('calls .focus() only where it is allowed', () => {
    expect(files.filter((f) => /\.focus\(/.test(readFileSync(f, 'utf8')) && !ALLOWED_FOCUS.includes(f))).toEqual([])
  })
});
