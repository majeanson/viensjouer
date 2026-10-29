// A nap time is 'HH:MM' (24 h, the device's wall clock), or null / '' to clear. `undefined` means keep; false means refuse.
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/

export const napValue = (v: unknown): string | null | undefined | false => (v === undefined ? undefined : v === null || v === '' ? null : typeof v === 'string' && TIME_RE.test(v) ? v : false)
