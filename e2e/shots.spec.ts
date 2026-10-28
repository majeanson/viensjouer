import { test, type Page } from '@playwright/test'

// ON-DEMAND screenshots for a design review: `SHOTS=1 npx playwright test shots` → screenshots/.
// Every screen at a phone and a desktop width, with realistic stubbed data. Skipped otherwise.
test.skip(!process.env.SHOTS, 'on-demand: SHOTS=1')

const now = Math.floor(Date.now() / 1000)
const kid = { id: 'c1', first_name: 'Noé', birthdate: '2023-04-10', colour: '#f2a03d', position: 0 }
const fams = [
  { id: 'f1', parent_name: 'Julie', email: 'julie@example.com', phone: null, child_first_name: 'Léa', child_birthdate: '2023-12-24', allergies: 'arachides', notes: null, linked_household_id: null },
  { id: 'f2', parent_name: 'Paul', email: null, phone: null, child_first_name: 'Max', child_birthdate: null, allergies: null, notes: 'Un chien', linked_household_id: null },
]
const enc = (id: string, title: string, kind: string, at: number) => ({ id, child_id: 'c1', kind, title, starts_at: at, ends_at: at + 7200, place: 'Parc Lafontaine', address: null, note: 'Apporte une collation', status: 'proposed', series_id: null })
const encounters = [enc('e1', 'Au parc Lafontaine', 'park', now + 86400), enc('e2', 'Chez nous après la sieste', 'home', now + 3 * 86400), enc('e3', 'La fête de Noé — 3 ans !', 'birthday', now + 9 * 86400)]

async function stubAll(page: Page) {
  await page.route('**/api/**', async (r) => {
    const u = new URL(r.request().url())
    const p = u.pathname.replace('/api/', '')
    const j = (json: unknown) => r.fulfill({ json })
    if (p === 'health') return j({ ok: true, mail: true, photos: true, invite: false })
    if (p === 'auth/me') return j({ signedIn: true, email: 'marc@example.com', displayName: 'Marc', household: { id: 'h', name: 'Les Jeanson', tz: 'America/Toronto' }, mail: true, demo: false })
    if (p === 'children') return j({ children: [kid] })
    if (p === 'families') return j({ families: fams })
    if (p === 'groups') return j({ groups: [{ id: 'g1', name: 'Garderie', families: ['f1', 'f2'] }] })
    if (p === 'home-card') return j({ card: { dog: true, pool: false, screens: 'little', nutFree: true, note: 'Le chien est doux' } })
    if (p === 'parent-invite') return j({ invites: [] })
    if (p === 'encounters' && u.searchParams.get('id')) {
      return j({
        encounter: { ...encounters[1], details: {}, hereOpen: false, here_at: null },
        invitations: [
          { id: 'i1', friend_family_id: 'f1', token: 'h7kq3wpm', reply: 'yes', reply_note: 'On arrive vers 14 h', reply_at: now, sent_at: now, parent_name: 'Julie', child_first_name: 'Léa', email: 'julie@example.com', allergies: 'arachides', adults: null, kids: null },
          { id: 'i2', friend_family_id: 'f2', token: 'k3m9xqta', reply: null, reply_note: null, reply_at: null, sent_at: null, parent_name: 'Paul', child_first_name: 'Max', email: null, allergies: null, adults: null, kids: null },
        ],
        messages: [{ id: 'm1', author_kind: 'guest', author_label: 'Julie', text: 'Merci pour l’invitation !', created_at: now }],
        relais: [],
        souvenirs: [],
      })
    }
    if (p === 'encounters') return j({ encounters, invitations: [{ encounter_id: 'e1', id: 'i1', reply: 'yes', parent_name: 'Julie', child_first_name: 'Léa' }, { encounter_id: 'e1', id: 'i2', reply: null, parent_name: 'Paul', child_first_name: 'Max' }, { encounter_id: 'e2', id: 'i3', reply: 'maybe', parent_name: 'Julie', child_first_name: 'Léa' }] })
    if (p === 'circle') return j({ children: [{ child: kid, linked: [{ linkId: 'l1', childName: 'Léa', childBirthdate: '2023-12-24', parentName: 'Julie', householdName: 'La famille de Julie', lastAt: now - 9 * 86400, nextAt: now + 86400 }] }], book: [{ id: 'f2', parent_name: 'Paul', child_first_name: 'Max' }] })
    if (p === 'calendar') return j({ items: [{ at: now + 86400, type: 'mine', id: 'e1', title: 'Au parc Lafontaine', kind: 'park', place: 'Parc Lafontaine', status: 'proposed' }, { at: now + 3 * 86400, type: 'invited', id: 'e9', title: 'Cabane à sucre', kind: 'park', place: null, token: 'aaaabbbb', reply: null, host: 'Julie' }], birthdays: [{ date: '2026-12-24', name: 'Léa', turns: 3, whose: 'friend' }], today: '2026-10-27' })
    if (p === 'windows') return j({ windows: [{ id: 'w1', child_id: 'c1', starts_at: now + 4 * 86400, ends_at: now + 4 * 86400 + 10800, note: 'Parc ou chez nous', targets: [{ id: 't1', window_id: 'w1', token: 'zzzzyyyy', reply: 'yes', reply_note: null, parent_name: 'Julie', child_first_name: 'Léa', email: 'julie@example.com' }] }] })
    if (p.startsWith('r/')) {
      return j({
        alive: true,
        encounter: { ...encounters[1], address: null, details: {}, hereAt: null, note: 'Sieste à 13 h, on garde les souliers à l’entrée' },
        host: { child_first_name: 'Noé', parent_name: 'Marc', household_name: 'Les Jeanson', tz: 'America/Toronto' },
        you: { parent_name: 'Julie', email: null, phone: null, child_first_name: 'Léa', allergies: null, reply: null, replyNote: null, remind: false, adults: null, kids: null, scope: 'family' },
        homeCard: { dog: true, pool: false, screens: 'little', nutFree: true, note: 'Le chien est doux' },
        relais: null, souvenirs: [], souvenirsOpen: false, photos: false, messages: [], series: [],
      })
    }
    return j({})
  })
}

const SCREENS: [string, string][] = [
  ['door', '/'],
  ['reply', '/lune-miel'],
  ['encounters', '/rencontres'],
  ['new', '/rencontres/nouvelle'],
  ['detail', '/rencontres/e2'],
  ['calendar', '/calendrier'],
  ['windows', '/fenetres'],
  ['circle', '/cercle'],
  ['children', '/enfants'],
  ['families', '/familles'],
  ['account', '/compte'],
  ['privacy', '/confidentialite'],
]

for (const [name, path] of SCREENS) {
  for (const [label, size] of [['phone', { width: 390, height: 844 }], ['desktop', { width: 1280, height: 800 }]] as const) {
    test(`${name} ${label}`, async ({ page }) => {
      await page.setViewportSize(size)
      await stubAll(page)
      if (name === 'door' || name === 'reply') await page.route('**/api/auth/me', (r) => r.fulfill({ json: { signedIn: false } }))
      await page.goto(path)
      await page.waitForTimeout(500)
      await page.screenshot({ path: `screenshots/${name}-${label}.png`, fullPage: true })
    })
  }
}
