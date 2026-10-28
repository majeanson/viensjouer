import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

// The host's day-to-day flows: the agenda, who is coming, undo instead of « êtes-vous sûr ? », the short
// form, « Refaire pareil », the friends list. The API is stubbed, like the other specs.
const now = Math.floor(Date.now() / 1000)
const soon = now + 2 * 86_400

const child = { id: 'c1', first_name: 'Noé', birthdate: null, colour: '#e8922a', position: 0 }
const fam = (id: string, kid: string, parent: string, over: Record<string, unknown> = {}) => ({ id, parent_name: parent, email: null, phone: null, child_first_name: kid, child_birthdate: null, allergies: null, notes: null, linked_household_id: null, ...over })
const inv = (id: string, fid: string, kid: string, parent: string, reply: string | null, over: Record<string, unknown> = {}) => ({
  id, friend_family_id: fid, token: `tok-${id}`, reply, reply_note: null, reply_at: null, sent_at: null, parent_name: parent, child_first_name: kid, email: null, allergies: null, adults: null, kids: null, scope: 'family', ...over,
})
const enc = (over: Record<string, unknown> = {}) => ({ id: 'e1', child_id: 'c1', kind: 'park', title: 'Au parc', starts_at: soon, ends_at: null, place: 'Parc Lafontaine', address: null, map_url: null, note: null, status: 'proposed', series_id: null, details: {}, hereOpen: false, ...over })

type Reply = { status?: number; json: unknown }
type Handler = (body: Record<string, unknown> | null, url: URL) => Reply | undefined
interface Stub {
  calls: { method: string; path: string; body: Record<string, unknown> | null }[]
}

async function host(page: Page, handlers: Record<string, Handler> = {}): Promise<Stub> {
  const stub: Stub = { calls: [] }
  await page.route('**/api/**', async (r) => {
    const req = r.request()
    const url = new URL(req.url())
    const path = url.pathname.replace('/api/', '')
    const body = req.postData() && (req.headers()['content-type'] ?? '').includes('json') ? (req.postDataJSON() as Record<string, unknown>) : null
    stub.calls.push({ method: req.method(), path, body })
    const custom = handlers[`${req.method()} ${path}`]?.(body, url)
    if (custom) return r.fulfill({ status: custom.status ?? 200, json: custom.json })
    const defaults: Record<string, unknown> = {
      health: { ok: true, mail: false, photos: false, invite: false },
      'auth/me': { signedIn: true, email: 'm@example.com', displayName: 'Marc', household: { id: 'h', name: 'Les Jeanson', tz: 'America/Toronto' }, mail: false, demo: false },
      children: { children: [child] },
      families: { families: [] },
      groups: { groups: [] },
      encounters: { encounters: [], invitations: [] },
      calendar: { items: [], birthdays: [], today: '2030-01-01' },
      circle: { children: [], book: [] },
      'home-card': { card: null },
      windows: { windows: [] },
    }
    return r.fulfill({ json: defaults[path] ?? {} })
  })
  return stub
}

const detail = (invitations: unknown[] = [], over: Record<string, unknown> = {}) => ({ encounter: enc(over), invitations, messages: [], relais: [], souvenirs: [], changes: [] })

test('three tabs only, and a brand-new host is told the next step each time', async ({ page }) => {
  await host(page, { 'GET children': () => ({ json: { children: [] } }) })
  await page.goto('/rencontres')
  const nav = page.getByRole('navigation', { name: 'Navigation' })
  await expect(nav.getByRole('link')).toHaveText(['Rencontres', 'Amis', 'Ma famille'])
  await expect(page.getByText('Commence par ajouter ton enfant')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Ajouter mon enfant' })).toBeVisible()

  await page.unrouteAll({ behavior: 'ignoreErrors' })
  await host(page)
  await page.goto('/rencontres')
  await expect(page.getByText('Ajoute un ami à inviter')).toBeVisible()

  await page.unrouteAll({ behavior: 'ignoreErrors' })
  await host(page, { 'GET families': () => ({ json: { families: [fam('f1', 'Léa', 'Julie')] } }) })
  await page.goto('/rencontres')
  await expect(page.getByText('Tout est prêt.')).toBeVisible()
})

test('the agenda mixes my rencontres, invitations, free moments and birthdays by date', async ({ page }) => {
  await host(page, {
    'GET encounters': () => ({ json: { encounters: [enc({ id: 'm1', title: 'Parc du samedi', starts_at: now + 3 * 86_400 })], invitations: [] } }),
    'GET calendar': () => ({
      json: {
        items: [
          { at: now + 1 * 86_400, type: 'invited', id: 'x1', title: 'Fête de Max', kind: 'birthday', place: null, token: 'ours-miel', reply: null, host: 'Paul' },
          { at: now + 5 * 86_400, type: 'window', id: 'w1', endsAt: now + 5 * 86_400 + 7200, note: null },
        ],
        birthdays: [{ date: new Date((now + 2 * 86_400) * 1000).toISOString().slice(0, 10), name: 'Léa', turns: 3, whose: 'friend' }],
        today: '2030-01-01',
      },
    }),
    'GET families': () => ({ json: { families: [fam('f1', 'Léa', 'Julie')] } }),
  })
  await page.goto('/rencontres')
  await expect(page.getByText('Je suis libre').first()).toBeVisible()
  await expect(page.getByText('Parc du samedi')).toBeVisible()
  const order = await page.locator('.shell').first().locator('.card, .birthday').allTextContents()
  const joined = order.join(' | ')
  expect(joined.indexOf('Fête de Max')).toBeGreaterThan(-1)
  expect(joined.indexOf('Fête de Max')).toBeLessThan(joined.indexOf('Anniversaire de Léa'))
  expect(joined.indexOf('Anniversaire de Léa')).toBeLessThan(joined.indexOf('Parc du samedi'))
  expect(joined.indexOf('Parc du samedi')).toBeLessThan(joined.indexOf('Je suis libre'))
})

test('each rencontre shows who is coming, who is maybe, who is not and who has not answered', async ({ page }) => {
  await host(page, {
    'GET encounters': () => ({
      json: detail([
        inv('i1', 'f1', 'Léa', 'Julie', 'yes', { kids: 2, adults: 1 }),
        inv('i2', 'f2', 'Max', 'Paul', 'maybe'),
        inv('i3', 'f3', 'Zoé', 'Anne', 'no'),
        inv('i4', 'f4', 'Eli', 'Sam', null),
      ]),
    }),
  })
  await page.goto('/rencontres/e1')
  const roster = page.getByLabel('Qui vient')
  await expect(roster.locator('[data-roster=yes]')).toContainText('Viennent (1)')
  await expect(roster.locator('[data-roster=yes]')).toContainText('Léa (Julie)')
  await expect(roster.locator('[data-roster=maybe]')).toContainText('Peut-être (1)')
  await expect(roster.locator('[data-roster=maybe]')).toContainText('Max (Paul)')
  await expect(roster.locator('[data-roster=no]')).toContainText('Zoé (Anne)')
  await expect(roster.locator('[data-roster=none]')).toContainText('Sans réponse (1)')
})

test('cancelling a rencontre happens at once and can be taken back from the undo bar', async ({ page }) => {
  const stub = await host(page, { 'GET encounters': () => ({ json: detail([inv('i1', 'f1', 'Léa', 'Julie', 'yes')]) }) })
  await page.goto('/rencontres/e1')
  await page.getByRole('button', { name: 'Annuler la rencontre' }).click()
  await expect.poll(() => stub.calls.filter((c) => c.method === 'PATCH').length).toBe(1)
  expect(stub.calls.find((c) => c.method === 'PATCH')!.body).toMatchObject({ id: 'e1', status: 'cancelled' })
  const bar = page.locator('.toast')
  await expect(bar).toContainText('Rencontre annulée.')
  await bar.getByRole('button', { name: 'Annuler' }).click()
  await expect.poll(() => stub.calls.filter((c) => c.method === 'PATCH').length).toBe(2)
  expect(stub.calls.filter((c) => c.method === 'PATCH')[1].body).toMatchObject({ id: 'e1', status: 'proposed' })
})

test('deleting waits behind the undo bar: undone, nothing is ever sent; left alone, it is', async ({ page }) => {
  const stub = await host(page, { 'GET encounters': () => ({ json: detail([]) }) })
  await page.goto('/rencontres/e1')
  await page.getByRole('button', { name: 'Supprimer', exact: true }).click()
  await expect(page).toHaveURL(/\/rencontres$/)
  await expect(page.locator('.toast')).toContainText('Rencontre supprimée.')
  await page.locator('.toast').getByRole('button', { name: 'Annuler' }).click()
  await page.waitForTimeout(6500)
  expect(stub.calls.filter((c) => c.method === 'DELETE')).toHaveLength(0)

  await page.goto('/rencontres/e1')
  await page.getByRole('button', { name: 'Supprimer', exact: true }).click()
  await expect.poll(() => stub.calls.filter((c) => c.method === 'DELETE').length, { timeout: 9000 }).toBe(1)
  expect(stub.calls.find((c) => c.method === 'DELETE')!.body).toEqual({ id: 'e1' })
})

test('removing a friend is undoable too: no browser dialog anywhere', async ({ page }) => {
  page.on('dialog', (d) => {
    throw new Error(`a browser dialog appeared: ${d.message()}`)
  })
  const stub = await host(page, { 'GET families': () => ({ json: { families: [fam('f1', 'Léa', 'Julie')] } }) })
  await page.goto('/amis')
  await page.getByRole('button', { name: 'Retirer', exact: true }).click()
  await expect(page.getByText('Léa')).toHaveCount(0)
  await page.locator('.toast').getByRole('button', { name: 'Annuler' }).click()
  await expect(page.getByText('Léa').first()).toBeVisible()
  await page.waitForTimeout(6500)
  expect(stub.calls.filter((c) => c.method === 'DELETE')).toHaveLength(0)
})

test('the short form writes the title itself, and refuses an end time that is not after the start', async ({ page }) => {
  const stub = await host(page, { 'GET families': () => ({ json: { families: [fam('f1', 'Léa', 'Julie')] } }), 'POST encounters': () => ({ status: 201, json: { id: 'e9', ids: ['e9'] } }) })
  await page.goto('/rencontres/nouvelle')
  // the long list of options is folded away
  await expect(page.getByLabel('Jusqu’à (facultatif)')).toBeHidden()
  await page.getByRole('checkbox', { name: /Léa/ }).check()
  // quick dates
  await page.getByRole('button', { name: 'Dimanche 10 h' }).click()
  await expect(page.getByLabel('Quand', { exact: true })).toHaveValue(/T10:00$/)
  // an end time before the start is refused, with the reason
  await page.getByText('Plus d’options').click()
  await page.getByLabel('Jusqu’à (facultatif)').fill('09:00')
  await page.getByRole('button', { name: 'Créer et obtenir les liens' }).click()
  await expect(page.getByText('La fin doit venir après le début, le même jour.')).toBeVisible()
  expect(stub.calls.filter((c) => c.method === 'POST' && c.path === 'encounters')).toHaveLength(0)
  // a good one goes, same day, with an automatic title
  await page.getByLabel('Jusqu’à (facultatif)').fill('12:00')
  await page.getByRole('button', { name: 'Créer et obtenir les liens' }).click()
  await expect.poll(() => stub.calls.filter((c) => c.method === 'POST' && c.path === 'encounters').length).toBe(1)
  const body = stub.calls.find((c) => c.method === 'POST' && c.path === 'encounters')!.body!
  expect(String(body.title)).toMatch(/^Au parc, dimanche 10 h$/)
  expect((body.endsAt as number) - (body.startsAt as number)).toBe(2 * 3600)
  expect(body.invite).toEqual(['f1'])
})

test('« Refaire pareil » opens the form with the same kind, place, families and scope, a week on', async ({ page }) => {
  const past = now - 3 * 86_400
  await host(page, {
    'GET families': () => ({ json: { families: [fam('f1', 'Léa', 'Julie'), fam('f2', 'Max', 'Paul')] } }),
    'GET encounters': () => ({ json: detail([inv('i1', 'f1', 'Léa', 'Julie', 'yes', { scope: 'friend' })], { id: 'old', kind: 'home', title: 'Après la sieste', place: 'Chez nous', starts_at: past, note: 'Collation' }) }),
  })
  await page.goto('/rencontres/old')
  await page.getByRole('link', { name: 'Refaire pareil' }).click()
  await expect(page).toHaveURL(/nouvelle\?from=old/)
  await expect(page.getByRole('checkbox', { name: /Léa/ })).toBeChecked()
  await expect(page.getByRole('checkbox', { name: /Max/ })).not.toBeChecked()
  await expect(page.getByLabel('Où')).toHaveValue('Chez nous')
  await expect(page.getByLabel('Titre')).toHaveValue('Après la sieste')
  await expect(page.getByRole('radio', { name: /seulement/i }).first()).toHaveAttribute('aria-checked', 'true')
  const when = await page.getByLabel('Quand', { exact: true }).inputValue()
  expect(new Date(when).getTime()).toBeGreaterThan(Date.now())
  expect(new Date(when).getDay()).toBe(new Date(past * 1000).getDay())
})

test('« Chez nous » asks the home card the first time, right where it is needed', async ({ page }) => {
  await host(page)
  await page.goto('/rencontres/nouvelle')
  await expect(page.getByText('Chez nous : dis-le une fois (facultatif)')).toHaveCount(0)
  await page.getByRole('button', { name: 'Chez nous', exact: true }).click()
  await expect(page.getByText('Chez nous : dis-le une fois (facultatif)')).toBeVisible()
})

test('the friends list is one list: groups as tags, the app badge, and the circle folded in', async ({ page }) => {
  await host(page, {
    'GET families': () => ({ json: { families: [fam('f1', 'Léa', 'Julie', { linked_household_id: 'hh2', email: 'j@example.com' }), fam('f2', 'Max', 'Paul')] } }),
    'GET groups': () => ({ json: { groups: [{ id: 'g1', name: 'La garderie', families: ['f1'] }] } }),
    'GET circle': () => ({ json: { children: [{ child: { id: 'c1' }, linked: [{ linkId: 'l1', otherHousehold: 'hh2', childName: 'Léa', parentName: 'Julie', lastAt: null, nextAt: soon }] }], book: [] } }),
  })
  await page.goto('/amis')
  const lea = page.locator('.card', { hasText: 'Léa' }).first()
  await expect(lea.getByText('La garderie')).toBeVisible()
  await expect(lea.getByText('Sur Viens jouer')).toBeVisible()
  await expect(page.locator('.card', { hasText: 'Max' }).getByText('Sur Viens jouer')).toHaveCount(0)
  // old addresses still land here
  await page.goto('/cercle')
  await expect(page).toHaveURL(/\/amis$/)
  await page.goto('/calendrier')
  await expect(page).toHaveURL(/\/rencontres$/)
})

test('the host screens have no serious accessibility violation and nothing bleeds off a 320px screen', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 })
  await host(page, {
    'GET families': () => ({ json: { families: [fam('f1', 'Léa', 'Julie', { linked_household_id: 'hh2', email: 'j@example.com' })] } }),
    'GET groups': () => ({ json: { groups: [{ id: 'g1', name: 'La garderie', families: ['f1'] }] } }),
    'GET circle': () => ({ json: { children: [{ child: { id: 'c1' }, linked: [{ linkId: 'l1', otherHousehold: 'hh2', childName: 'Léa', parentName: 'Julie', lastAt: null, nextAt: soon }] }], book: [] } }),
    'GET encounters': (_b, url) => (url.searchParams.get('id') ? { json: detail([inv('i1', 'f1', 'Léa', 'Julie', 'yes'), inv('i2', 'f2', 'Max', 'Paul', null)], { map_url: 'https://maps.app.goo.gl/x' }) } : { json: { encounters: [enc()], invitations: [{ encounter_id: 'e1', id: 'i1', reply: 'yes', parent_name: 'Julie', child_first_name: 'Léa' }] } }),
  })
  for (const path of ['/rencontres', '/rencontres/e1', '/rencontres/nouvelle', '/amis', '/enfants', '/compte']) {
    await page.goto(path)
    await expect(page.locator('h1').first()).toBeVisible()
    const over = await page.evaluate(() => {
      const vw = document.documentElement.clientWidth
      return [...document.querySelectorAll<HTMLElement>('body *')]
        .filter((el) => el.offsetParent !== null && !el.closest('.toasts'))
        .map((el) => ({ tag: el.tagName, cls: el.className?.toString?.() ?? '', right: Math.round(el.getBoundingClientRect().right) }))
        .filter((x) => x.right > vw + 1)
    })
    expect(over, path).toEqual([])
    const { violations } = await new AxeBuilder({ page }).analyze()
    const bad = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
    expect(bad.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`), path).toEqual([])
  }
})

test('the host adds a cover picture, and turns « qui vient » off from the edit form', async ({ page }) => {
  const stub = await host(page, {
    'GET health': () => ({ json: { ok: true, mail: false, photos: true, invite: false } }),
    'GET encounters': () => ({ json: detail([inv('i1', 'f1', 'Léa', 'Julie', 'yes')], { cover: null, show_guests: true }) }),
    'POST cover': () => ({ status: 201, json: { cover: 'zzz' } }),
    'PATCH encounters': () => ({ json: { changed: 0, notified: 0 } }),
  })
  await page.goto('/rencontres/e1')
  await expect(page.getByLabel('Qui vient')).toContainText('Les familles invitées voient les prénoms des enfants qui viennent')
  // a real image so the browser can shrink it before sending
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')
  await page.locator('input[type=file]').first().setInputFiles({ name: 'p.png', mimeType: 'image/png', buffer: png })
  await expect.poll(() => stub.calls.filter((c) => c.method === 'POST' && c.path === 'cover').length).toBe(1)

  await page.getByRole('button', { name: 'Modifier', exact: true }).click()
  await page.getByRole('checkbox', { name: /Montrer aux familles invitées qui vient/ }).uncheck()
  await page.getByRole('button', { name: 'Enregistrer les changements' }).click()
  await expect.poll(() => stub.calls.filter((c) => c.method === 'PATCH').length).toBe(1)
  expect(stub.calls.find((c) => c.method === 'PATCH')!.body).toMatchObject({ id: 'e1', showGuests: false })
  await expect(page.getByText('Modifié. Les familles le verront sur leur page.')).toBeVisible()
})
