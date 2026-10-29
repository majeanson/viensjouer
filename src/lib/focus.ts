// Focus a text field only where that cannot pop a keyboard: a phone or tablet (coarse pointer) lets the person look
// first and tap to type. A mouse-and-keyboard visitor still lands in the field, which is what they expect.
export function focusIfFinePointer(el: HTMLElement | null | undefined): void {
  if (!el || typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
  if (window.matchMedia('(pointer: fine)').matches) el.focus()
}
