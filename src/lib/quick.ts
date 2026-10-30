import type { Kind } from './types'

// « Parc samedi 10h avec Léa et Noé » -> a draft: kind, day and hour, place, which friends. No server, no guessing at what is not
// said: a part that is not found stays undefined and the form keeps its own default for it.
export interface Quick {
  kind?: Kind
  startsAt?: number
  place?: string
  familyIds: string[]
}

const plain = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const DAYS: [RegExp, number][] = [
  [/\b(dimanche|sunday|sun)\b/, 0], [/\b(lundi|monday|mon)\b/, 1], [/\b(mardi|tuesday|tue)\b/, 2], [/\b(mercredi|wednesday|wed)\b/, 3],
  [/\b(jeudi|thursday|thu)\b/, 4], [/\b(vendredi|friday|fri)\b/, 5], [/\b(samedi|saturday|sat)\b/, 6],
]

const hasWord = (s: string, w: string) => s.split(/[^a-z0-9]+/).includes(w)

export function parseQuick(raw: string, families: { id: string; child_first_name: string; parent_name: string }[], now = new Date()): Quick {
  const s = plain(raw)
  const out: Quick = { familyIds: [] }
  if (/\b(anniv\w*|birthday|fete)\b/.test(s)) out.kind = 'birthday'
  else if (/\b(chez|maison|home|house)\b/.test(s)) out.kind = 'home'
  else if (/\b(parc|park|jardin|piscine|plage|beach)\b/.test(s)) out.kind = 'park'

  // The hour: 10h, 10h30, 10:30, 3pm. « matin » / « après-midi » when only that is said.
  let hour: number | null = null
  let min = 0
  const hm = s.match(/\b(\d{1,2})\s*(?:h|:)\s*(\d{2})?\b/) ?? s.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/)
  if (hm) {
    hour = Number(hm[1])
    min = hm[2] && !/^(am|pm)$/.test(hm[2]) ? Number(hm[2]) : 0
    if (hm[3] === 'pm' && hour < 12) hour += 12
    if (hour > 23) hour = null
  } else if (/\bmatin|morning\b/.test(s)) hour = 10
  else if (/apres-?midi|afternoon/.test(s)) hour = 15

  // The day: aujourd'hui, demain, a weekday (the next one).
  const d = new Date(now)
  let day = false
  if (/\b(aujourd'?hui|today)\b/.test(s)) day = true
  else if (/\b(demain|tomorrow)\b/.test(s)) { d.setDate(d.getDate() + 1); day = true }
  else {
    const w = DAYS.find(([re]) => re.test(s))
    if (w) { d.setDate(d.getDate() + (((w[1] - d.getDay() + 7) % 7) || 7)); day = true }
  }
  if (day || hour !== null) {
    d.setHours(hour ?? 10, min, 0, 0)
    if (!day && d.getTime() <= now.getTime()) d.setDate(d.getDate() + 1)
    out.startsAt = Math.floor(d.getTime() / 1000)
  }

  // The place: « au Parc Lafontaine », « chez Léa » (not a time, not the friends).
  const p = raw.match(/\b(?:au|aux|à|chez|at|in)\s+((?:la |le |l'|les )?[^\d,][^,]*?)(?=\s+(?:avec|with|samedi|dimanche|lundi|mardi|mercredi|jeudi|vendredi|demain|saturday|sunday|monday|tuesday|wednesday|thursday|friday|tomorrow)\b|\s+\d|,|$)/i)
  if (p && !/^(parc|park)$/i.test(p[1].trim())) out.place = /^chez/i.test(p[0]) ? `Chez ${p[1].trim()}` : p[1].trim()

  // The friends: a child's first name or a parent's name said anywhere.
  out.familyIds = families
    .filter((f) => [f.child_first_name, f.parent_name.split(' ')[0]].some((n) => n && hasWord(s, plain(n))))
    .map((f) => f.id)
  return out
}
