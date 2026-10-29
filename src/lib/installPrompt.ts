// « Garder sur l'écran d'accueil »: offered once, to a host who keeps coming back (three different days), never to someone
// already running it installed. Pure helpers here; the component holds the browser bits. localStorage is a convenience:
// every read and write is guarded, and without it the offer simply never shows.
const VISITS = 'vj_visits'
const DISMISSED = 'vj_install_dismissed'
export const VISITS_BEFORE_OFFER = 3

export interface Visits {
  n: number
  last: string
}

/** Count today as a visit, once per calendar day. */
export function bumpVisits(prev: Visits | null, today: string): Visits {
  if (prev && prev.last === today) return prev
  return { n: (prev?.n ?? 0) + 1, last: today }
}

export function shouldOffer(v: Visits, dismissed: boolean, standalone: boolean): boolean {
  return !dismissed && !standalone && v.n >= VISITS_BEFORE_OFFER
}

export function readVisits(): Visits | null {
  try {
    const v = JSON.parse(localStorage.getItem(VISITS) ?? 'null') as Visits | null
    return v && typeof v.n === 'number' && typeof v.last === 'string' ? v : null
  } catch {
    return null
  }
}
export function writeVisits(v: Visits): void {
  try {
    localStorage.setItem(VISITS, JSON.stringify(v))
  } catch {
    /* private window: no offer */
  }
}
export function isDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISSED) === '1'
  } catch {
    return true
  }
}
export function dismiss(): void {
  try {
    localStorage.setItem(DISMISSED, '1')
  } catch {
    /* hidden for this visit only */
  }
}
