import { test, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'

// ON-DEMAND screenshots for a design review: `SHOTS=1 npx playwright test shots` → screenshots/ (gitignored).
// Every screen at a phone (390), a small phone (320) and a desktop (1280) width, light and dark, with
// realistic stubbed data: faces, a cover picture, the board, a bring list. Skipped otherwise.
test.skip(!process.env.SHOTS, 'on-demand: SHOTS=1')

const now = Math.floor(Date.now() / 1000)
const FACE = readFileSync('public/icon-512.png')
const COVER = readFileSync('public/og-image.png')

const kid = { id: 'c1', first_name: 'Noé', birthdate: '2023-04-10', colour: '#f2a03d', position: 0, photo: 'p1' }
const kid2 = { id: 'c2', first_name: 'Alice', birthdate: '2025-01-05', colour: '#5b9a8b', position: 1, photo: null }
const fams = [
  { id: 'f1', parent_name: 'Julie', email: 'julie@example.com', phone: null, child_first_name: 'Léa', child_birthdate: '2023-12-24', allergies: 'arachides', notes: null, linked_household_id: 'hh2' },
  { id: 'f2', parent_name: 'Paul', email: null, phone: null, child_first_name: 'Max', child_birthdate: null, allergies: null, notes: 'Un chien', linked_household_id: null },
  { id: 'f3', parent_name: 'Anne', email: 'anne@example.com', phone: '514 555 0101', child_first_name: 'Zoé', child_birthdate: null, allergies: null, notes: null, linked_household_id: null },
]
const enc = (id: string, title: string, kind: string, at: number, over: Record<string, unknown> = {}) => ({ id, child_id: 'c1', kind, title, starts_at: at, ends_at: at + 7200, place: 'Parc Lafontaine', address: null, map_url: 'https://maps.app.goo.gl/x', note: 'Apporte une collation', status: 'proposed', series_id: null, ...over })
const encounters = [enc('e1', 'Au parc Lafontaine', 'park', now + 86400), enc('e2', 'Chez nous après la sieste', 'home', now + 3 * 86400, { place: 'Chez nous', status: 'confirmed' }), enc('e3', 'La fête de Noé, 3 ans !', 'birthday', now + 9 * 86400, { place: 'Salle communautaire' })]
const inv = (id: string, fid: string, kidName: string, parent: string, reply: string | null, over: Record<string, unknown> = {}) => ({ id, friend_family_id: fid, token: `tok${id}`, reply, reply_note: null, reply_at: reply ? now : null, sent_at: now, parent_name: parent, child_first_name: kidName, email: null, allergies: null, adults: null, kids: null, scope: 'family', ...over })
const board = [
  { id: 'm1', author_kind: 'host', author_label: 'Marc', text: 'On se retrouve à la fontaine, côté jeux d’eau. Apportez un maillot !', created_at: now - 7200, pinned: 1 },
  { id: 'm2', author_kind: 'guest', author_label: 'Julie', text: 'Super ! Léa a hâte. On arrive vers 14 h.', created_at: now - 3600, pinned: 0 },
  { id: 'm3', author_kind: 'guest', author_label: 'Paul', text: 'Je peux apporter des fruits. Voici le plan : https://maps.app.goo.gl/abc', created_at: now - 600, pinned: 0 },
]

async function stubAll(page: Page, signedIn = true) {
  await page.route('**/api/**', async (r) => {
    const u = new URL(r.request().url())
    const p = u.pathname.replace('/api/', '')
    const j = (json: unknown) => r.fulfill({ json })
    if (/^(avatar|r\/[^/]+\/avatar)/.test(p)) return r.fulfill({ body: FACE, contentType: 'image/png' })
    if (/^(cover|r\/[^/]+\/cover)/.test(p)) return r.fulfill({ body: COVER, contentType: 'image/png' })
    if (p === 'health') return j({ ok: true, mail: true, photos: true, invite: false })
    if (p === 'auth/me') return j(signedIn ? { signedIn: true, photo: 'me1', email: 'marc@example.com', displayName: 'Marc', household: { id: 'h', name: 'Les Jeanson', tz: 'America/Toronto' }, mail: true, demo: false } : { signedIn: false })
    if (p === 'children') return j({ children: [kid, kid2] })
    if (p === 'families') return j({ families: fams })
    if (p === 'groups') return j({ groups: [{ id: 'g1', name: 'Garderie', families: ['f1', 'f2'] }] })
    if (p === 'home-card') return j({ card: { dog: true, pool: false, screens: 'little', nutFree: true, note: 'Le chien est doux' } })
    if (p === 'parent-invite') return j({ invites: [] })
    if (p === 'cal-link') return j({ token: 'A'.repeat(24) })
    if (p === 'places') return j({ places: [{ place: 'Parc Lafontaine', map_url: 'https://maps.app.goo.gl/x', address: null, kind: 'park' }] })
    if (p === 'encounters' && u.searchParams.get('id')) {
      return j({
        encounter: { ...encounters[0], title: 'Au parc Lafontaine', details: {}, hereOpen: false, here_at: null, cover: 'cv1', show_guests: true, thanked_at: null },
        invitations: [inv('i1', 'f1', 'Léa', 'Julie', 'yes', { reply_note: 'On arrive vers 14 h', email: 'julie@example.com', kids: 2 }), inv('i2', 'f2', 'Max', 'Paul', 'maybe'), inv('i3', 'f3', 'Zoé', 'Anne', null, { email: 'anne@example.com' })],
        messages: board,
        relais: [],
        souvenirs: [],
        changes: [{ field: 'place', old_value: 'Parc', new_value: 'Parc Lafontaine', created_at: now - 86400 }],
        bring: [{ id: 'b1', label: 'la collation', claimed_label: 'Julie', added_by: 'host' }, { id: 'b2', label: 'des jus', claimed_label: null, added_by: 'host' }],
      })
    }
    if (p === 'encounters') return j({ encounters, invitations: [{ encounter_id: 'e1', id: 'i1', reply: 'yes', parent_name: 'Julie', child_first_name: 'Léa' }, { encounter_id: 'e1', id: 'i2', reply: 'maybe', parent_name: 'Paul', child_first_name: 'Max' }, { encounter_id: 'e2', id: 'i4', reply: null, parent_name: 'Julie', child_first_name: 'Léa' }] })
    if (p === 'circle') return j({ children: [{ child: kid, linked: [{ linkId: 'l1', otherHousehold: 'hh2', childName: 'Léa', childBirthdate: '2023-12-24', parentName: 'Julie', householdName: 'La famille de Julie', lastAt: now - 6 * 86400, nextAt: now + 86400 }] }], book: [] })
    if (p === 'calendar') return j({ items: [{ at: now + 2 * 86400, type: 'invited', id: 'x1', title: 'Cabane à sucre', kind: 'park', place: 'Érablière', token: 'ours-miel', reply: null, host: 'Julie' }], birthdays: [{ date: new Date((now + 5 * 86400) * 1000).toISOString().slice(0, 10), name: 'Léa', turns: 3, whose: 'friend' }], today: '2030-01-01' })
    if (p === 'windows') return j({ windows: [] })
    if (p.startsWith('r/')) {
      return j({
        alive: true,
        encounter: { ...encounters[1], address: null, details: {}, hereAt: null, note: 'Sieste à 13 h, on garde les souliers à l’entrée', place: 'Chez nous' },
        host: { child_first_name: 'Noé', parent_name: 'Marc', household_name: 'Les Jeanson', tz: 'America/Toronto', childPhoto: 'p1', parentPhoto: 'me1' },
        you: { parent_name: 'Julie', email: null, phone: null, child_first_name: 'Léa', allergies: null, reply: u.searchParams.get('answered') ? 'yes' : null, replyNote: null, remind: false, adults: null, kids: null, scope: 'family' },
        homeCard: { dog: true, pool: false, screens: 'little', nutFree: true, note: 'Le chien est doux' },
        relais: null, souvenirs: [], souvenirsOpen: false, photos: false, series: [], changes: [],
        messages: board.map((m, n) => ({ ...m, mine: n === 1 })),
        cover: 'cv1',
        guests: { yes: ['Max', 'Zoé'], maybe: ['Eli'], waiting: 2 },
        bring: [{ id: 'b1', label: 'la collation', by: null, mine: false }, { id: 'b2', label: 'des jus', by: 'Paul', mine: false }],
      })
    }
    return j({})
  })
}

const SCREENS: [string, string, boolean?][] = [
  ['door', '/', false],
  ['reply', '/lune-miel', false],
  ['reply-answered', '/lune-miel?answered=1', false],
  ['encounters', '/rencontres'],
  ['new', '/rencontres/nouvelle'],
  ['detail', '/rencontres/e1'],
  ['friends', '/amis'],
  ['children', '/enfants'],
  ['account', '/compte'],
  ['privacy', '/confidentialite', false],
]
const SIZES = [
  ['phone', { width: 390, height: 844 }],
  ['small', { width: 320, height: 640 }],
  ['desktop', { width: 1280, height: 800 }],
] as const

for (const [name, path, signed] of SCREENS) {
  for (const [label, size] of SIZES) {
    for (const scheme of ['light', 'dark'] as const) {
      if (scheme === 'dark' && label === 'small') continue
      test(`${name} ${label} ${scheme}`, async ({ browser }) => {
        const ctx = await browser.newContext({ viewport: size, colorScheme: scheme, locale: 'fr-CA', deviceScaleFactor: label === 'desktop' ? 1 : 2 })
        const page = await ctx.newPage()
        await stubAll(page, signed !== false)
        await page.addInitScript((s) => { try { localStorage.setItem('vj-theme', s) } catch { /* ignore */ } }, scheme)
        await page.goto(path)
        await page.waitForTimeout(600)
        await page.screenshot({ path: `screenshots/${name}-${label}-${scheme}.png`, fullPage: true })
        await ctx.close()
      })
    }
  }
}
