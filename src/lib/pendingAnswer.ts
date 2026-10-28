// One tap on « Oui » must not be lost to a bad signal: when the network is down the answer is kept on this
// device, and sent when the network returns (or the link is opened again). One pending answer per link; storage
// that is blocked just means no queue, never an error.
import type { Reply } from './types'

const key = (token: string) => `vj-pending-reply:${token}`

export function readPending(token: string): Reply | null {
  try {
    const v = localStorage.getItem(key(token))
    return v === 'yes' || v === 'maybe' || v === 'no' ? v : null
  } catch {
    return null
  }
}

export function writePending(token: string, reply: Reply): boolean {
  try {
    localStorage.setItem(key(token), reply)
    return true
  } catch {
    return false
  }
}

export function clearPending(token: string): void {
  try {
    localStorage.removeItem(key(token))
  } catch {
    /* storage blocked */
  }
}
