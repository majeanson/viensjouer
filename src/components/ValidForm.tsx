import type { ComponentProps, FocusEvent } from 'react'
import { useT } from '../i18n'

// A form whose mistakes are said in words right under the field (and announced), not as the browser's own bubble: the same plain sentences
// everywhere, in the language of the page. Fields keep their ordinary attributes (required, type="email", minLength…); this only changes
// how a wrong one is shown: when you leave it, and for every wrong one when you try to send. Nothing is sent while a field is wrong.
type Field = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement

export function ValidForm({ onSubmit, onBlur, ...rest }: ComponentProps<'form'>) {
  const t = useT()
  const words = (el: Field): string => {
    const v = el.validity
    if (v.valueMissing) return t.errors.required
    if (v.typeMismatch && el.getAttribute('type') === 'email') return t.errors.email
    if (v.tooShort) return t.errors.short(Number(el.getAttribute('minlength')))
    if (v.tooLong) return t.errors.long(Number(el.getAttribute('maxlength')))
    return el.validationMessage
  }
  // The sentence lives in the field's own label (or the element around it), after the control, and goes away as soon as it is right.
  const show = (el: Field) => {
    const host = el.closest('label') ?? el.parentElement
    host?.querySelector(':scope > .field__err')?.remove()
    if (el.validity.valid || !el.willValidate) return el.removeAttribute('aria-invalid')
    const msg = document.createElement('span')
    msg.className = 'field__err'
    msg.setAttribute('role', 'alert')
    msg.textContent = words(el)
    host?.append(msg)
    el.setAttribute('aria-invalid', 'true')
  }
  const leave = (e: FocusEvent<HTMLFormElement>) => {
    const el = e.target
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) show(el)
    onBlur?.(e)
  }
  const send = (e: Parameters<NonNullable<ComponentProps<'form'>['onSubmit']>>[0]) => {
    const fields = [...e.currentTarget.elements].filter((x): x is Field => x instanceof HTMLInputElement || x instanceof HTMLTextAreaElement || x instanceof HTMLSelectElement)
    fields.forEach(show)
    const wrong = fields.find((f) => !f.validity.valid && f.willValidate)
    if (wrong) {
      e.preventDefault()
      wrong.scrollIntoView({ block: 'center' })
      return
    }
    onSubmit?.(e)
  }
  // `noValidate` keeps the browser's bubble away; the checks above are the same ones, said our way.
  return <form noValidate onSubmit={send} onBlur={leave} {...rest} />
}
