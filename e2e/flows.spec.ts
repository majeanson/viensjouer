import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

// The host's day-to-day flows: the agenda, who is coming, undo instead of « êtes-vous sûr ? », the short
// form, « Refaire pareil », the friends list. The API is stubbed, like the other specs.
import { child, enc, fam, inv, now, soon } from './fixtures'

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

test('three tabs and the account, and a brand-new host is told the next step each time', async ({ page }) => {
  await host(page, { 'GET children': () => ({ json: { children: [] } }) })
  await page.goto('/rencontres')
  const nav = page.getByRole('navigation', { name: 'Navigation' })
  await expect(nav.getByRole('link')).toHaveText(['Rencontres', 'Proches', 'Compte'])
  await expect(page.getByText('Ajoute ton enfant.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Ajouter mon enfant' })).toBeVisible()
  // three steps, the first is the one to do
  await expect(page.locator('.steps li')).toHaveCount(3)
  await expect(page.locator('.steps li.now')).toHaveText(/Ajoute ton enfant/)

  await page.unrouteAll({ behavior: 'ignoreErrors' })
  await host(page)
  await page.goto('/rencontres')
  await expect(page.getByText('Ajoute un ami.')).toBeVisible()

  await page.unrouteAll({ behavior: 'ignoreErrors' })
  await host(page, { 'GET families': () => ({ json: { families: [fam('f1', 'Léa', 'Julie')] } }) })
  await page.goto('/rencontres')
  await expect(page.getByText('Tout est prêt.')).toBeVisible()
  // both earlier steps are checked off, the last one is next
  await expect(page.locator('.steps li.done')).toHaveCount(2)
  await expect(page.locator('.steps li.now')).toHaveText(/Tout est prêt/)
})

test('a recurring rencontre is one card: its next date, and how many more', async ({ page }) => {
  const week = (n: number, over: Record<string, unknown> = {}) => enc({ id: `s${n}`, title: 'Parc du mardi', series_id: 'ser1', starts_at: now + n * 7 * 86_400, ...over })
  await host(page, { 'GET encounters': () => ({ json: { encounters: [week(1, { status: 'cancelled' }), week(2), week(3), week(4)], invitations: [] } }) })
  await page.goto('/rencontres')
  await expect(page.getByRole('link', { name: /Parc du mardi/ })).toHaveCount(1)
  await expect(page.getByRole('link', { name: /Parc du mardi/ })).toHaveAttribute('href', '/rencontres/s2')
  await expect(page.getByText('Récurrente · encore 3 dates')).toBeVisible()
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
    'GET windows': () => ({ json: { windows: [{ id: 'w1', child_id: 'c1', starts_at: now + 5 * 86_400, ends_at: now + 5 * 86_400 + 7200, note: null, targets: [] }] } }),
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
  await page.getByText('Plus d’options', { exact: true }).last().click()
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
  await page.getByText('Plus d’options', { exact: true }).click()
  await page.getByRole('button', { name: 'Supprimer', exact: true }).click()
  await expect(page).toHaveURL(/\/rencontres$/)
  await expect(page.locator('.toast')).toContainText('Rencontre supprimée.')
  await page.locator('.toast').getByRole('button', { name: 'Annuler' }).click()
  await page.waitForTimeout(6500)
  expect(stub.calls.filter((c) => c.method === 'DELETE')).toHaveLength(0)

  await page.goto('/rencontres/e1')
  await page.getByText('Plus d’options', { exact: true }).click()
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
  await page.locator('.friend > summary').click()
  await page.locator('details.friend').getByRole('button', { name: 'Retirer', exact: true }).click()
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
  await expect(page.locator('input[name=startsAt]')).toHaveValue(/T10:00$/)
  // an end time before the start is refused, with the reason
  await page.getByText('Plus d’options').click()
  await page.getByLabel('Jusqu’à (facultatif)').fill('09:00')
  await page.getByRole('button', { name: 'Inviter', exact: true }).click()
  await expect(page.getByText('La fin doit venir après le début, le même jour.')).toBeVisible()
  expect(stub.calls.filter((c) => c.method === 'POST' && c.path === 'encounters')).toHaveLength(0)
  // a good one goes, same day, with an automatic title
  await page.getByLabel('Jusqu’à (facultatif)').fill('12:00')
  await page.getByRole('button', { name: 'Inviter', exact: true }).click()
  await expect.poll(() => stub.calls.filter((c) => c.method === 'POST' && c.path === 'encounters').length).toBe(1)
  const body = stub.calls.find((c) => c.method === 'POST' && c.path === 'encounters')!.body!
  expect(String(body.title)).toMatch(/^Au parc, dimanche 10 h$/)
  expect((body.endsAt as number) - (body.startsAt as number)).toBe(2 * 3600)
  expect(body.invite).toEqual(['f1'])
})

test('first steps: the child, then a friend, then one sentence, each right on the empty Rencontres page', async ({ page }) => {
  let kids: unknown[] = []
  let friends: unknown[] = []
  const stub = await host(page, {
    'GET children': () => ({ json: { children: kids } }),
    'POST children': () => ((kids = [{ id: 'c1', first_name: 'Noé', birthdate: null, colour: '#ccc', position: 0 }]), { status: 201, json: { id: 'c1' } }),
    'GET families': () => ({ json: { families: friends } }),
    'POST families': () => ((friends = [fam('f1', 'Léa', 'Julie')]), { status: 201, json: { id: 'f1' } }),
    'GET encounters': () => ({ json: { encounters: [], invitations: [] } }),
  })
  await page.goto('/rencontres')
  await page.getByLabel('Prénom de ton enfant').fill('Noé')
  await page.getByRole('button', { name: 'Ajouter mon enfant' }).click()
  await expect.poll(() => stub.calls.find((c) => c.method === 'POST' && c.path === 'children')?.body).toMatchObject({ firstName: 'Noé' })
  await page.getByLabel('Prénom de son enfant').fill('Léa')
  await page.getByLabel('Prénom du parent').fill('Julie')
  await page.getByRole('button', { name: 'Ajouter un ami' }).click()
  await expect.poll(() => stub.calls.find((c) => c.method === 'POST' && c.path === 'families')?.body).toMatchObject({ childFirstName: 'Léa', parentName: 'Julie' })
  await page.getByLabel('Dis-le en une phrase').fill('Parc dimanche 14h avec Léa')
  await page.getByRole('button', { name: 'Proposer une rencontre' }).click()
  await expect(page).toHaveURL(/nouvelle[?]say=/)
  await expect(page.locator('input[name=startsAt]')).toHaveValue(/T14:00$/)
  await expect(page.getByRole('checkbox', { name: /Léa/ })).toBeChecked()
})

test('editing a friend opens a full-screen sheet with Retour and Enregistrer in its bar', async ({ page }) => {
  const stub = await host(page, { 'GET families': () => ({ json: { families: [fam('f1', 'Léa', 'Julie')] } }), 'PATCH families': () => ({ json: { ok: true } }) })
  await page.goto('/amis')
  await page.locator('details.friend > summary').first().click()
  await page.locator('details.friend').getByRole('button', { name: 'Modifier', exact: true }).click()
  const sheet = page.getByRole('dialog', { name: 'Léa' })
  await expect(sheet).toBeVisible()
  const box = await sheet.boundingBox()
  expect(box!.width).toBeGreaterThanOrEqual(page.viewportSize()!.width - 1)
  await sheet.getByRole('button', { name: /Retour/ }).click()
  await expect(sheet).toHaveCount(0)
  await page.locator('details.friend').getByRole('button', { name: 'Modifier', exact: true }).click()
  await page.getByRole('dialog').locator('input[name=parentName]').fill('Julie T')
  await page.getByRole('dialog').getByRole('button', { name: 'Enregistrer' }).click()
  await expect.poll(() => stub.calls.filter((c) => c.method === 'PATCH' && c.path === 'families').length).toBe(1)
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('one sentence fills the form: kind, day, hour, place and the friend', async ({ page }) => {
  const stub = await host(page, { 'GET families': () => ({ json: { families: [fam('f1', 'Léa', 'Julie')] } }), 'POST encounters': () => ({ status: 201, json: { id: 'e9', ids: ['e9'] } }) })
  await page.goto('/rencontres/nouvelle')
  await page.getByLabel('Dis-le en une phrase').fill('Chez nous dimanche 14h avec Léa')
  await page.getByLabel('Dis-le en une phrase').press('Enter')
  await expect(page.locator('input[name=startsAt]')).toHaveValue(/T14:00$/)
  await expect(page.getByRole('checkbox', { name: /Léa/ })).toBeChecked()
  await expect(page.locator('input[name=place]')).toHaveValue('Chez nous')
  await page.getByLabel('Dis-le en une phrase').fill('blabla')
  await page.getByRole('button', { name: 'Remplir' }).click()
  await expect(page.getByText('Rien compris')).toBeVisible()
  expect(stub.calls.filter((c) => c.method === 'POST')).toHaveLength(0)
})

test('offering other times sends them with the rencontre; the host picks one and the rencontre moves to it', async ({ page }) => {
  const stub = await host(page, { 'GET families': () => ({ json: { families: [fam('f1', 'Léa', 'Julie')] } }), 'POST encounters': () => ({ status: 201, json: { id: 'e9', ids: ['e9'] } }) })
  await page.goto('/rencontres/nouvelle')
  await page.getByRole('button', { name: 'Proposer d’autres moments' }).click()
  await page.getByRole('button', { name: 'Inviter', exact: true }).click()
  await expect.poll(() => stub.calls.filter((c) => c.method === 'POST' && c.path === 'encounters').length).toBe(1)
  const body = stub.calls.find((c) => c.method === 'POST' && c.path === 'encounters')!.body!
  expect((body.slots as number[]).length).toBe(1)
  expect((body.slots as number[])[0]).toBeGreaterThan(body.startsAt as number)
})

test('the host page says the next step in one line', async ({ page }) => {
  const a = now + 4 * 86_400
  await host(page, { 'GET encounters': () => ({ json: detail([inv('i1', 'f1', 'Léa', 'Julie', null)], { id: 'e1', starts_at: a }) }) })
  await page.goto('/rencontres/e1')
  await expect(page.getByRole('status').filter({ hasText: /Prochaine étape|En attente|Tout le monde/ })).toBeVisible()
})

test('the host sees how many families can make each time and picks one', async ({ page }) => {
  const a = now + 4 * 86_400
  const stub = await host(page, {
    'GET encounters': () => ({ json: { ...detail([inv('i1', 'f1', 'Léa', 'Julie', null)], { id: 'e1', starts_at: a }), slots: [{ id: 's1', starts_at: a, yes: 1 }, { id: 's2', starts_at: a + 86_400, yes: 0 }] } }),
    'PATCH encounters': () => ({ json: { ok: true } }),
    'DELETE slots': () => ({ json: { ok: true } }),
  })
  await page.goto('/rencontres/e1')
  const box = page.getByRole('region', { name: 'Moments proposés' })
  await expect(box.getByText('1 famille peut')).toBeVisible()
  await expect(box.getByText('Personne encore')).toBeVisible()
  await box.getByRole('button', { name: 'Choisir' }).first().click()
  await expect.poll(() => stub.calls.filter((c) => c.method === 'DELETE' && c.path === 'slots').length).toBe(1)
  expect(stub.calls.find((c) => c.method === 'PATCH' && c.path === 'encounters')!.body).toMatchObject({ id: 'e1', startsAt: a })
})

test('« Refaire pareil » opens the form with the same kind, place, families and scope, a week on', async ({ page }) => {
  const past = now - 3 * 86_400
  await host(page, {
    'GET families': () => ({ json: { families: [fam('f1', 'Léa', 'Julie'), fam('f2', 'Max', 'Paul')] } }),
    'GET encounters': () => ({ json: detail([inv('i1', 'f1', 'Léa', 'Julie', 'yes', { scope: 'friend' })], { id: 'old', kind: 'home', title: 'Après la sieste', place: 'Chez nous', starts_at: past, note: 'Collation' }) }),
  })
  await page.goto('/rencontres/old')
  await page.getByText('Plus d’options', { exact: true }).last().click()
  await page.getByRole('link', { name: 'Refaire pareil' }).click()
  await expect(page).toHaveURL(/nouvelle\?from=old/)
  await expect(page.getByRole('checkbox', { name: /Léa/ })).toBeChecked()
  await expect(page.getByRole('checkbox', { name: /Max/ })).not.toBeChecked()
  await expect(page.getByLabel('Où')).toHaveValue('Chez nous')
  await expect(page.getByLabel('Titre')).toHaveValue('Après la sieste')
  await expect(page.locator('details.more > summary', { hasText: 'Qui est invité' })).toContainText(/seulement/i)
  await page.locator('details.more > summary', { hasText: 'Qui est invité' }).click()
  await expect(page.getByRole('radio', { name: /seulement/i }).first()).toHaveAttribute('aria-checked', 'true')
  const when = await page.locator('input[name=startsAt]').inputValue()
  expect(new Date(when).getTime()).toBeGreaterThan(Date.now())
  expect(new Date(when).getDay()).toBe(new Date(past * 1000).getDay())
})

test('« Chez nous » asks the home card the first time, right where it is needed', async ({ page }) => {
  await host(page)
  await page.goto('/rencontres/nouvelle')
  await expect(page.getByText('Chez nous : dis-le une fois (facultatif)')).toHaveCount(0)
  await page.getByText('Quel genre ?').click() // the kind is folded to its current value
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
  await lea.locator('summary').first().click()
  await expect(lea.getByText('La garderie')).toBeVisible()
  await expect(lea.getByText('Sur Viens jouer')).toBeVisible()
  await page.locator('.card', { hasText: 'Max' }).locator('summary').first().click()
  await expect(page.locator('.card', { hasText: 'Max' }).getByText('Sur Viens jouer')).toHaveCount(0)
  // old addresses still land here
  await page.goto('/cercle')
  await expect(page).toHaveURL(/\/amis$/)
  await page.goto('/calendrier')
  await expect(page).toHaveURL(/\/rencontres$/)
})

test('the host screens have no serious accessibility violation and nothing bleeds off a 320px screen @webkit', async ({ page }) => {
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

test('« À apporter »: the host adds a line and sees who took what', async ({ page }) => {
  const stub = await host(page, {
    'GET encounters': () => ({ json: { ...detail([inv('i1', 'f1', 'Léa', 'Julie', 'yes')]), bring: [{ id: 'b1', label: 'la collation', claimed_label: 'Julie', added_by: 'host' }, { id: 'b2', label: 'des jus', claimed_label: null, added_by: 'host' }] } }),
    'POST bring': () => ({ status: 201, json: { id: 'b3' } }),
  })
  await page.goto('/rencontres/e1')
  await page.locator('summary', { hasText: /^Plus : / }).click() // the host page keeps the rest in one fold
  // The fold's title already says how many are taken and what is missing.
  await expect(page.getByText('À apporter (1 sur 2 pris · il manque : des jus)')).toBeVisible()
  await page.getByText('À apporter (1 sur 2 pris').click()
  await expect(page.getByText('apporté par Julie')).toBeVisible()
  await expect(page.getByText('personne encore')).toBeVisible()
  await page.getByLabel('À apporter', { exact: true }).fill('des fruits')
  await page.getByRole('button', { name: 'Ajouter', exact: true }).click()
  await expect.poll(() => stub.calls.filter((c) => c.method === 'POST' && c.path === 'bring').length).toBe(1)
  expect(stub.calls.find((c) => c.path === 'bring')!.body).toEqual({ encounter: 'e1', label: 'des fruits' })
})

test('« Dire merci » appears only after the rencontre, once, and sends the message', async ({ page }) => {
  const past = now - 86_400
  const stub = await host(page, {
    'GET encounters': () => ({ json: detail([inv('i1', 'f1', 'Léa', 'Julie', 'yes')], { starts_at: past }) }),
    'POST thanks': () => ({ json: { sent: 1 } }),
  })
  await page.goto('/rencontres/e1')
  await expect(page.getByRole('heading', { name: 'Dire merci' })).toBeVisible()
  await expect(page.getByLabel('Dire merci')).toHaveValue('Merci d’être venus !')
  await page.getByRole('button', { name: 'Envoyer le merci' }).click()
  await expect.poll(() => stub.calls.filter((c) => c.path === 'thanks').length).toBe(1)
  expect(stub.calls.find((c) => c.path === 'thanks')!.body).toEqual({ encounter: 'e1', text: 'Merci d’être venus !' })
  await expect(page.getByText('Merci envoyé. 1 courriel parti.')).toBeVisible()

  // before the rencontre, and after it was thanked: nothing to offer
  await page.unrouteAll({ behavior: 'ignoreErrors' })
  await host(page, { 'GET encounters': () => ({ json: detail([inv('i1', 'f1', 'Léa', 'Julie', 'yes')]) }) })
  await page.goto('/rencontres/e1')
  await expect(page.getByRole('heading', { name: 'Dire merci' })).toHaveCount(0)
  await page.unrouteAll({ behavior: 'ignoreErrors' })
  await host(page, { 'GET encounters': () => ({ json: detail([inv('i1', 'f1', 'Léa', 'Julie', 'yes')], { starts_at: past, thanked_at: now }) }) })
  await page.goto('/rencontres/e1')
  await expect(page.getByRole('heading', { name: 'Dire merci' })).toHaveCount(0)
  await expect(page.getByText('Merci envoyé.')).toBeVisible()
})

test('« Où » remembers the places used before and brings the map link back', async ({ page }) => {
  await host(page, {
    'GET families': () => ({ json: { families: [fam('f1', 'Léa', 'Julie')] } }),
    'GET places': () => ({ json: { places: [{ place: 'Parc Lafontaine', map_url: 'https://maps.app.goo.gl/abc', address: null, kind: 'park' }, { place: 'Chez nous', map_url: null, address: '12 rue X', kind: 'home' }] } }),
  })
  await page.goto('/rencontres/nouvelle')
  await expect(page.locator('#past-places option')).toHaveCount(2)
  await page.getByLabel('Où').fill('parc lafontaine')
  await expect(page.getByText('Lien de carte et adresse repris de la dernière fois.')).toBeVisible()
  await page.getByText('Plus d’options').click()
  await expect(page.locator('input[name=mapUrl]')).toHaveValue('https://maps.app.goo.gl/abc')
  // a link already typed is never overwritten
  await page.locator('input[name=mapUrl]').fill('https://maps.app.goo.gl/mine')
  await page.getByLabel('Où').fill('')
  await page.getByLabel('Où').fill('Parc Lafontaine')
  await expect(page.locator('input[name=mapUrl]')).toHaveValue('https://maps.app.goo.gl/mine')
})

test('« Mon calendrier »: get a secret link, copy it, rotate it only after a second tap', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  let token: string | null = null
  const stub = await host(page, {
    'GET cal-link': () => ({ json: { token } }),
    'POST cal-link': () => {
      token = token ? 'B'.repeat(24) : 'A'.repeat(24)
      return { json: { token } }
    },
    'DELETE cal-link': () => {
      token = null
      return { json: { ok: true } }
    },
  })
  await page.goto('/compte')
  await page.locator('summary', { hasText: 'Agenda' }).click()
  await expect(page.getByRole('heading', { name: 'Mon calendrier' })).toBeVisible()
  await page.getByRole('button', { name: 'Obtenir mon lien' }).click()
  await expect(page.getByText('ne le partage pas')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Ouvrir dans mon calendrier' })).toHaveAttribute('href', new RegExp(`^webcal://.+/api/feed/${'A'.repeat(24)}$`))
  await page.getByRole('button', { name: 'Copier le lien' }).click()
  expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(new RegExp(`/api/feed/${'A'.repeat(24)}$`))
  // rotating asks first, inline, with no browser dialog (under « Gérer ce lien »)
  await page.getByText('Gérer ce lien').click()
  await page.getByRole('button', { name: 'Nouveau lien' }).click()
  await expect(page.getByText('L’ancien lien cessera de marcher.')).toBeVisible()
  expect(stub.calls.filter((c) => c.method === 'POST' && c.path === 'cal-link')).toHaveLength(1)
  await page.getByRole('button', { name: 'Oui, un nouveau lien' }).click()
  await expect(page.getByRole('link', { name: 'Ouvrir dans mon calendrier' })).toHaveAttribute('href', new RegExp('B{24}$'))
  await page.getByRole('button', { name: 'Désactiver' }).click()
  await expect(page.getByRole('button', { name: 'Obtenir mon lien' })).toBeVisible()
})

test('the app is installable: manifest, icons, iOS tags, and no caching service worker', async ({ page, request }) => {
  await host(page)
  await page.goto('/rencontres')
  const manifestHref = await page.locator('link[rel=manifest]').getAttribute('href')
  expect(manifestHref).toBe('/manifest.webmanifest')
  const manifest = await (await request.get(manifestHref!)).json()
  expect(manifest).toMatchObject({ name: 'Viens jouer', display: 'standalone', start_url: '/rencontres', lang: 'fr-CA' })
  for (const icon of manifest.icons as { src: string; purpose: string }[]) {
    const r = await request.get(icon.src)
    expect(r.status(), icon.src).toBe(200)
  }
  expect((manifest.icons as { purpose: string }[]).some((i) => i.purpose === 'maskable')).toBe(true)
  expect(await page.locator('link[rel=apple-touch-icon]').getAttribute('href')).toBe('/apple-touch-icon.png')
  expect((await request.get('/apple-touch-icon.png')).status()).toBe(200)
  expect(await page.locator('meta[name=apple-mobile-web-app-capable]').getAttribute('content')).toBe('yes')
  expect(await page.locator('meta[property="og:image"]').getAttribute('content')).toMatch(/og-image\.png$/)
  // the service worker caches nothing
  const sw = await (await request.get('/sw.js')).text()
  expect(sw).not.toMatch(/caches\.|cache\.put|respondWith/)
})

test('on an iPhone the account page explains « Sur l’écran d’accueil »', async ({ browser }) => {
  const ctx = await browser.newContext({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1' })
  const page = await ctx.newPage()
  await host(page)
  await page.goto('/compte')
  await page.locator('summary', { hasText: 'Agenda' }).click()
  await expect(page.getByRole('heading', { name: 'Sur l’écran d’accueil' })).toBeVisible()
  await expect(page.getByText(/bouton Partager de Safari/)).toBeVisible()
  await ctx.close()
})

test('« Nouvelle famille » stays closed for a host who already has friends, even while they load', async ({ page }) => {
  await host(page, { 'GET families': () => ({ json: { families: [fam('f1', 'Léa', 'Julie')] } }) })
  await page.goto('/rencontres/nouvelle')
  await expect(page.getByRole('checkbox', { name: /Léa/ })).toBeVisible()
  await expect(page.getByLabel('Prénom de l’ami')).toHaveCount(0)
  await page.getByRole('button', { name: 'Nouvelle famille' }).click()
  await expect(page.getByLabel('Prénom de l’ami')).toBeVisible()
})

test('English is its own chunk: a French visitor never downloads it, an English-first device gets English at once', async ({ browser }) => {
  const seen: Record<string, string[]> = { fr: [], en: [] }
  for (const [name, locale] of [['fr', 'fr-CA'], ['en', 'en-CA']] as const) {
    const ctx = await browser.newContext({ locale, viewport: { width: 390, height: 844 } })
    const page = await ctx.newPage()
    page.on('request', (r) => { if (/i18n\.en/.test(r.url())) seen[name].push(r.url()) })
    await host(page)
    await page.goto('/rencontres')
    if (name === 'en') {
      await expect(page.getByRole('button', { name: 'Add a friend' })).toBeVisible()
    } else {
      await expect(page.getByRole('button', { name: 'Ajouter un ami' })).toBeVisible()
      expect(seen.fr, 'a French visitor must not download the English chunk').toHaveLength(0)
      // switching later keeps the page and swaps the words once the chunk is in
      await page.getByRole('button', { name: /^Menu/ }).click()
      await page.getByRole('button', { name: 'EN (English)' }).click()
      await expect(page.getByRole('button', { name: 'Add a friend' })).toBeVisible()
    }
    await ctx.close()
  }
  expect(seen.en.length).toBeGreaterThan(0)
  // the French visitor only asked for it after pressing EN
  expect(seen.fr.length).toBeGreaterThan(0)
})

test('every screen has its own title, there is a skip link, and focus follows a navigation', async ({ page }) => {
  await host(page)
  await page.goto('/rencontres')
  await expect(page).toHaveTitle('Rencontres · Viens jouer')
  // the skip link is the first thing a keyboard reaches, and it lands on the main region
  await page.keyboard.press('Tab')
  const skip = page.getByRole('link', { name: 'Aller au contenu' })
  await expect(skip).toBeFocused()
  await expect(skip).toBeVisible()
  await page.keyboard.press('Enter')
  await expect(page.locator('main#main')).toBeFocused()
  // a navigation changes the title and moves focus to the new page's region
  await page.getByRole('navigation', { name: 'Navigation' }).getByRole('link', { name: 'Proches' }).click()
  await expect(page).toHaveTitle('Proches · Viens jouer')
  await expect(page.locator('main#main')).toBeFocused()
  await page.getByRole('navigation', { name: 'Navigation' }).getByRole('link', { name: 'Compte' }).click()
  await expect(page).toHaveTitle('Mon compte · Viens jouer')
})

test('the invitation tab is titled with who invites', async ({ page }) => {
  await page.route('**/api/**', (r) => {
    const p = new URL(r.request().url()).pathname
    if (p.endsWith('/auth/me')) return r.fulfill({ json: { signedIn: false } })
    if (p.endsWith('/health')) return r.fulfill({ json: { ok: true, mail: false, photos: false, invite: false } })
    return r.fulfill({ json: { alive: true, encounter: { id: 'e1', child_id: 'c1', kind: 'park', title: 'Au parc', starts_at: now + 86400, ends_at: null, place: null, address: null, map_url: null, note: null, status: 'proposed', details: {}, hereAt: null }, host: { child_first_name: 'Noé', parent_name: 'Marc', household_name: 'H', tz: 'America/Toronto' }, you: { parent_name: 'Julie', email: null, phone: null, child_first_name: 'Léa', allergies: null, reply: null, replyNote: null, remind: false, adults: null, kids: null, scope: 'family' }, homeCard: null, relais: null, souvenirs: [], souvenirsOpen: false, photos: false, series: [], changes: [], cover: null, guests: null, bring: [], messages: [] } })
  })
  await page.goto('/lune-miel')
  await expect(page).toHaveTitle('Noé invite Léa · Viens jouer')
})

test('a page that crashes shows a calm card, and moving on clears it', async ({ page }) => {
  await host(page, { 'GET encounters': (_c, url) => (url.searchParams.get('id') ? { json: { encounter: enc(), invitations: null, messages: [], relais: [], souvenirs: [], changes: [], bring: [] } } : undefined) })
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('/rencontres/e1')
  await expect(page.getByRole('alert')).toContainText('Quelque chose a cassé')
  await expect(page.getByRole('button', { name: 'Recharger' })).toBeVisible()
  // one broken page never traps the rest of the app
  await page.goto('/amis')
  await expect(page.getByRole('heading', { name: 'Proches' })).toBeVisible()
})

test('going offline says so, and coming back clears it', async ({ page }) => {
  await host(page)
  await page.goto('/rencontres')
  await expect(page.getByRole('heading', { name: 'Rencontres' })).toBeVisible()
  await expect(page.getByText('Hors ligne')).toHaveCount(0)
  await page.evaluate(() => dispatchEvent(new Event('offline')))
  await expect(page.getByText(/Hors ligne/)).toBeVisible()
  await page.evaluate(() => dispatchEvent(new Event('online')))
  await expect(page.getByText('Hors ligne')).toHaveCount(0)
})

test('the page language attribute follows the device, and the toggle', async ({ browser }) => {
  const ctx = await browser.newContext({ locale: 'en-CA' })
  const page = await ctx.newPage()
  await host(page)
  await page.goto('/rencontres')
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  await page.getByRole('button', { name: /^Menu/ }).click()
  await page.getByRole('button', { name: 'FR (français)' }).click()
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr')
  await ctx.close()
})

test('every button on the host screens is a real tap target (36px tall or more) on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await host(page, {
    'GET families': () => ({ json: { families: [fam('f1', 'Léa', 'Julie', { linked_household_id: 'hh2', email: 'j@example.com' })] } }),
    'GET groups': () => ({ json: { groups: [] } }),
    'GET circle': () => ({ json: { children: [], book: [] } }),
    'GET encounters': (_b, url) => (url.searchParams.get('id') ? { json: detail([inv('i1', 'f1', 'Léa', 'Julie', 'yes'), inv('i2', 'f2', 'Max', 'Paul', null)], { map_url: 'https://maps.app.goo.gl/x' }) } : { json: { encounters: [enc()], invitations: [] } }),
  })
  for (const path of ['/rencontres', '/rencontres/e1', '/rencontres/nouvelle', '/amis', '/enfants']) {
    await page.goto(path)
    await expect(page.locator('h1').first()).toBeVisible()
    const small = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('button, a.btn, summary')]
        .filter((el) => el.offsetParent !== null && !el.closest('.toasts'))
        .map((el) => ({ text: (el.textContent ?? '').trim().slice(0, 30), h: Math.round(el.getBoundingClientRect().height) }))
        .filter((x) => x.h < 35),
    )
    expect(small, path).toEqual([])
  }
})

test('the new-rencontre form takes a day and an hour as two pickers and sends one start', async ({ page }) => {
  const stub = await host(page, {
    'GET families': () => ({ json: { families: [fam('f1', 'Léa', 'Julie')] } }),
    'GET groups': () => ({ json: { groups: [] } }),
    'POST encounters': () => ({ status: 201, json: { id: 'e9', ids: ['e9'] } }),
  })
  await page.goto('/rencontres/nouvelle')
  await page.getByLabel('Jour', { exact: true }).fill('2030-05-04')
  await page.getByLabel('Heure', { exact: true }).fill('09:30')
  await expect(page.locator('input[name=startsAt]')).toHaveValue('2030-05-04T09:30')
  await page.getByRole('button', { name: 'Demain 10 h' }).click() // a quick chip moves both pickers
  await expect(page.getByLabel('Heure', { exact: true })).toHaveValue('10:00')
  await page.getByLabel('Jour', { exact: true }).fill('2030-05-04')
  await page.getByLabel('Heure', { exact: true }).fill('09:30')
  await page.getByRole('checkbox').first().check()
  await page.getByRole('button', { name: 'Inviter', exact: true }).click()
  await expect.poll(() => stub.calls.filter((c) => c.method === 'POST' && c.path === 'encounters').length).toBe(1)
  const body = stub.calls.find((c) => c.method === 'POST' && c.path === 'encounters')!.body as { startsAt: number }
  expect(body.startsAt).toBe(Math.floor(new Date('2030-05-04T09:30').getTime() / 1000))
})

test('the new-rencontre form sends the plan B inside details', async ({ page }) => {
  const stub = await host(page, {
    'GET families': () => ({ json: { families: [fam('f1', 'Léa', 'Julie')] } }),
    'POST encounters': () => ({ status: 201, json: { id: 'e9', ids: ['e9'] } }),
  })
  await page.goto('/rencontres/nouvelle')
  await page.getByText('Plus d’options').click()
  await page.getByLabel('Plan B').fill('S’il pleut : chez nous')
  await page.getByRole('checkbox').first().check()
  await page.getByRole('button', { name: 'Inviter', exact: true }).click()
  await expect.poll(() => stub.calls.filter((c) => c.method === 'POST' && c.path === 'encounters').length).toBe(1)
  expect(stub.calls.find((c) => c.method === 'POST' && c.path === 'encounters')!.body).toMatchObject({ details: { planB: 'S’il pleut : chez nous' } })
})

test('« Les mêmes familles que la dernière fois » ticks last time’s families and vanishes once they are all ticked', async ({ page }) => {
  await host(page, {
    'GET families': () => ({ json: { families: [fam('f1', 'Léa', 'Julie'), fam('f2', 'Max', 'Paul')] } }),
    'GET last-guests': () => ({ json: { familyIds: ['f1'] } }),
  })
  await page.goto('/rencontres/nouvelle')
  const btn = page.getByRole('button', { name: 'Les mêmes familles que la dernière fois' })
  await expect(btn).toBeVisible()
  await expect(page.getByRole('checkbox', { name: /Léa/ })).not.toBeChecked()
  await btn.click()
  await expect(page.getByRole('checkbox', { name: /Léa/ })).toBeChecked()
  await expect(page.getByRole('checkbox', { name: /Max/ })).not.toBeChecked()
  await expect(btn).toHaveCount(0)
})

test('the nap chips follow the chosen child: defaults, then their own nap time', async ({ page }) => {
  await host(page, { 'GET families': () => ({ json: { families: [fam('f1', 'Léa', 'Julie')] } }) })
  await page.goto('/rencontres/nouvelle')
  await page.getByLabel('Jour', { exact: true }).fill('2030-05-04')
  await page.getByRole('button', { name: 'Après la sieste, 15 h' }).click()
  await expect(page.getByLabel('Heure', { exact: true })).toHaveValue('15:00')
  await expect(page.getByLabel('Jour', { exact: true })).toHaveValue('2030-05-04') // only the hour moves
  await page.getByRole('button', { name: 'Avant la sieste, 10 h' }).click()
  await expect(page.getByLabel('Heure', { exact: true })).toHaveValue('10:00')
})

test('a nap set on the child shows up on the chips', async ({ page }) => {
  await host(page, {
    'GET children': () => ({ json: { children: [{ ...child, nap_start: '13:00', nap_end: '14:30' }] } }),
    'GET families': () => ({ json: { families: [fam('f1', 'Léa', 'Julie')] } }),
  })
  await page.goto('/rencontres/nouvelle')
  await page.getByRole('button', { name: 'Après la sieste, 14 h 30' }).click()
  await expect(page.getByLabel('Heure', { exact: true })).toHaveValue('14:30')
  await expect(page.getByRole('button', { name: 'Avant la sieste, 11 h' })).toBeVisible()
})

test('the child form saves a nap and clears it with empty times', async ({ page }) => {
  const stub = await host(page, {
    'GET children': () => ({ json: { children: [{ ...child, nap_start: '13:00', nap_end: '14:30' }] } }),
    'PATCH children': () => ({ json: {} }),
  })
  await page.goto('/enfants')
  await page.getByRole('button', { name: 'Modifier' }).click()
  await expect(page.locator('input[name=napStart]')).toHaveValue('13:00')
  await page.locator('input[name=napStart]').fill('')
  await page.locator('input[name=napEnd]').fill('15:15')
  await page.getByRole('button', { name: 'Enregistrer' }).click()
  await expect.poll(() => stub.calls.filter((c) => c.method === 'PATCH' && c.path === 'children').length).toBe(1)
  expect(stub.calls.find((c) => c.method === 'PATCH')!.body).toMatchObject({ napStart: null, napEnd: '15:15' })
})

test('the host screens have no serious accessibility violation in dark mode', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.addInitScript(() => { try { localStorage.setItem('vj-theme', 'dark') } catch { /* ignore */ } })
  await host(page, {
    'GET families': () => ({ json: { families: [fam('f1', 'Léa', 'Julie', { linked_household_id: 'hh2', email: 'j@example.com' })] } }),
    'GET groups': () => ({ json: { groups: [{ id: 'g1', name: 'La garderie', families: ['f1'] }] } }),
    'GET circle': () => ({ json: { children: [{ child: { id: 'c1' }, linked: [{ linkId: 'l1', otherHousehold: 'hh2', childName: 'Léa', parentName: 'Julie', lastAt: null, nextAt: soon }] }], book: [] } }),
    'GET encounters': (_b, url) => (url.searchParams.get('id') ? { json: detail([inv('i1', 'f1', 'Léa', 'Julie', 'yes'), inv('i2', 'f2', 'Max', 'Paul', null)], { map_url: 'https://maps.app.goo.gl/x' }) } : { json: { encounters: [enc()], invitations: [{ encounter_id: 'e1', id: 'i1', reply: 'yes', parent_name: 'Julie', child_first_name: 'Léa' }] } }),
  })
  for (const path of ['/rencontres', '/rencontres/e1', '/rencontres/nouvelle', '/amis', '/enfants', '/compte']) {
    await page.goto(path)
    await expect(page.locator('h1').first()).toBeVisible()
    const { violations } = await new AxeBuilder({ page }).analyze()
    const bad = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
    expect(bad.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`), path).toEqual([])
  }
})

const MAIL_ME = { signedIn: true, email: 'm@example.com', displayName: 'Marc', household: { id: 'h', name: 'Les Jeanson', tz: 'America/Toronto' }, mail: true, demo: false }

test('the host sees where the answers stand, emails every family not yet told in one tap', async ({ page }) => {
  const stub = await host(page, {
    'GET auth/me': () => ({ json: MAIL_ME }),
    'POST invitations': () => ({ json: { ok: true } }),
    'GET encounters': (_b, url) =>
      url.searchParams.get('id')
        ? { json: detail([inv('i1', 'f1', 'Léa', 'Julie', 'yes'), inv('i2', 'f2', 'Max', 'Paul', null, { email: 'p@example.com' }), inv('i3', 'f3', 'Zoé', 'Anne', null, { email: 'a@example.com' }), inv('i4', 'f4', 'Eli', 'Sam', null)]) }
        : { json: { encounters: [enc()], invitations: [] } },
  })
  await page.goto('/rencontres/e1')
  await expect(page.getByText(/Oui 1 · Il manque :/)).toBeVisible()
  // Nobody has been told yet: ONE primary button emails the two who have an address (Eli has none: text or card).
  await page.getByRole('button', { name: 'Envoyer à 2 familles par courriel' }).click()
  await expect.poll(() => stub.calls.filter((c) => c.method === 'POST' && c.path === 'invitations').map((c) => c.body?.id)).toEqual(['i2', 'i3'])
  await expect(page.getByRole('button', { name: /^Renvoyer aux/ })).toHaveCount(0)
})

test('once they were emailed, the silent ones can be nudged in one tap, and a family that stopped or bounced is never offered the email', async ({ page }) => {
  const stub = await host(page, {
    'GET auth/me': () => ({ json: MAIL_ME }),
    'POST invitations': () => ({ json: { ok: true } }),
    'GET encounters': (_b, url) =>
      url.searchParams.get('id')
        ? {
            json: detail([
              inv('i2', 'f2', 'Max', 'Paul', null, { email: 'p@example.com', sent_at: now - 3600 }),
              inv('i3', 'f3', 'Zoé', 'Anne', null, { email: 'a@example.com', sent_at: now - 3600 }),
              inv('i4', 'f4', 'Eli', 'Sam', null, { email: 's@example.com', mail_stopped_at: now - 100 }),
              inv('i5', 'f5', 'Noa', 'Dan', null, { email: 'd@example.com', email_bounced_at: now - 100 }),
            ]),
          }
        : { json: { encounters: [enc()], invitations: [] } },
  })
  await page.goto('/rencontres/e1')
  await expect(page.getByRole('button', { name: /^Envoyer à \d+ famille/ })).toHaveCount(0) // nobody is left to tell
  await page.getByRole('button', { name: 'Renvoyer aux 2 familles sans réponse' }).click()
  await expect.poll(() => stub.calls.filter((c) => c.method === 'POST' && c.path === 'invitations').map((c) => c.body?.id)).toEqual(['i2', 'i3'])
  // Eli stopped the emails and Noa's address bounced: for both the one button is the text message, never the email.
  for (const s of await page.locator('.linkrow.friend > summary').all()) await s.click()
  await expect(page.getByRole('button', { name: 'Envoyer par texto' })).toHaveCount(2)
})

test('an answered family is one calm line: no send buttons until it is needed', async ({ page }) => {
  await host(page, {
    'GET encounters': (_b, url) => (url.searchParams.get('id') ? { json: detail([inv('i1', 'f1', 'Léa', 'Julie', 'yes'), inv('i2', 'f2', 'Max', 'Paul', null)]) } : { json: { encounters: [enc()], invitations: [] } }),
  })
  await page.goto('/rencontres/e1')
  await expect(page.locator('.linkrow.friend')).toHaveCount(2)
  await expect(page.getByRole('button', { name: 'Envoyer par texto' })).toHaveCount(0) // the rows are closed
  for (const s of await page.locator('.linkrow.friend > summary').all()) await s.click()
  await expect(page.getByRole('button', { name: 'Envoyer par texto' })).toHaveCount(1) // only Max, who has not answered (no email: the text message is his one button)
  await expect(page.getByText('Plus d’options', { exact: true })).toHaveCount(3) // one per family, one for the card
})

test('after cancelling, the host can tell the families why, on the board they see', async ({ page }) => {
  const stub = await host(page, {
    'GET encounters': (_b, url) => (url.searchParams.get('id') ? { json: detail([inv('i1', 'f1', 'Léa', 'Julie', 'yes')], { status: 'cancelled' }) } : { json: { encounters: [enc({ status: 'cancelled' })], invitations: [] } }),
    'POST messages': () => ({ status: 201, json: { id: 'm1' } }),
  })
  await page.goto('/rencontres/e1')
  await page.getByPlaceholder('La pluie, un rhume, on se reprend…').fill('La pluie, on se reprend samedi')
  await page.locator('form', { hasText: 'Dis-leur pourquoi' }).getByRole('button', { name: 'Publier' }).click()
  await expect.poll(() => stub.calls.find((c) => c.method === 'POST' && c.path === 'messages')?.body).toMatchObject({ text: 'Annulée : La pluie, on se reprend samedi' })
})

// iOS draws a date or time input at its own width and let it spill out of its card (and the two nap pickers overlap).
// Chromium cannot reproduce the spill, so this pins the cause (native chrome off, free to shrink) AND the outcome
// (every picker inside its card and the screen, side-by-side pickers never overlapping), at two phone widths.
for (const width of [320, 375]) {
  test(`date and time pickers stay inside their card at ${width}px @webkit`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 })
    await host(page)
    const check = async (where: string) => {
      const r = await page.evaluate(() => {
        const vw = document.documentElement.clientWidth
        const inputs = [...document.querySelectorAll<HTMLInputElement>('input[type="date"], input[type="time"]')].filter((el) => el.offsetParent !== null)
        const boxes = inputs.map((el) => {
          const b = el.getBoundingClientRect()
          const card = (el.closest('.card') ?? document.body).getBoundingClientRect()
          const cs = getComputedStyle(el)
          return { name: el.name || el.type, left: b.left, right: b.right, cardRight: card.right, cardLeft: card.left, appearance: cs.appearance, minWidth: cs.minWidth, vw }
        })
        return boxes
      })
      expect(r.length, where).toBeGreaterThan(0)
      for (const b of r) {
        expect(b.appearance, `${where} ${b.name} appearance`).toBe('none')
        expect(b.minWidth, `${where} ${b.name} min-width`).toBe('0px')
        expect(b.right, `${where} ${b.name} past its card`).toBeLessThanOrEqual(b.cardRight + 0.5)
        expect(b.left, `${where} ${b.name} before its card`).toBeGreaterThanOrEqual(b.cardLeft - 0.5)
        expect(b.right, `${where} ${b.name} past the screen`).toBeLessThanOrEqual(b.vw + 0.5)
      }
      // Neighbours on one row (day|hour, nap from|to) never overlap.
      const sorted = [...r].sort((a, b) => a.left - b.left)
      for (let i = 1; i < sorted.length; i++) if (Math.abs(sorted[i].left - sorted[i - 1].left) > 1 && sorted[i].left < sorted[i - 1].right - 0.5 && sorted[i].left > sorted[i - 1].left + 1) expect(sorted[i].left, `${where} overlap`).toBeGreaterThanOrEqual(sorted[i - 1].right - 0.5)
    }
    await page.goto('/rencontres/nouvelle')
    await expect(page.getByText('Quand', { exact: true }).first()).toBeVisible()
    await check('nouvelle rencontre')
    await page.goto('/enfants')
    await page.getByRole('button', { name: 'Ajouter un enfant' }).click()
    await check('enfant')
    await page.goto('/amis')
    await page.getByRole('button', { name: 'Nouvelle famille' }).click()
    await check('famille')
  })
}

const MAILING = { signedIn: true, email: 'm@example.com', displayName: 'Marc', household: { id: 'h', name: 'Les Jeanson', tz: 'America/Toronto' }, mail: true, demo: false }

test('a host with no second parent is asked once, after a first rencontre has passed, and « Plus tard » sticks', async ({ page }) => {
  await host(page, {
    'GET auth/me': () => ({ json: { ...MAILING, mail: false, soloHost: true } }),
    'GET encounters': () => ({ json: { encounters: [enc({ starts_at: now - 5 * 86_400 })], invitations: [] } }),
  })
  await page.goto('/rencontres')
  await expect(page.getByText(/Invite l’autre parent/)).toBeVisible()
  await expect(page.getByRole('link', { name: 'Inviter' })).toHaveAttribute('href', '/compte')
  await page.getByRole('button', { name: 'Plus tard' }).click()
  await expect(page.getByText(/Invite l’autre parent/)).toHaveCount(0)
  await page.reload()
  await expect(page.getByText(/Invite l’autre parent/)).toHaveCount(0)
})

test('no partner line when there is a second parent, or before any rencontre has passed', async ({ page }) => {
  await host(page, {
    'GET auth/me': () => ({ json: { ...MAILING, mail: false, soloHost: false } }),
    'GET encounters': () => ({ json: { encounters: [enc({ starts_at: now - 5 * 86_400 })], invitations: [] } }),
  })
  await page.goto('/rencontres')
  await expect(page.getByRole('heading', { name: 'Rencontres', level: 1 })).toBeVisible()
  await expect(page.getByText(/Invite l’autre parent/)).toHaveCount(0)
})

test('Reporter asks for a reason, sends it with the email choice, and the card says it is postponed', async ({ page }) => {
  let status = 'proposed'
  const stub = await host(page, {
    'GET auth/me': () => ({ json: MAILING }),
    'GET encounters': () => ({ json: detail([inv('i1', 'f1', 'Léa', 'Julie', 'yes', { email: 'j@example.com' })], { status }) }),
    'PATCH encounters': (b) => { status = String(b?.status ?? status); return { json: { changed: 1, notified: 1 } } },
  })
  await page.goto('/rencontres/e1')
  await page.getByText('Plus d’options', { exact: true }).last().click()
  await page.getByRole('button', { name: 'Reporter', exact: true }).click()
  const form = page.locator('form', { hasText: 'Les réponses restent' })
  await form.getByLabel('Pourquoi ? (facultatif)').fill('Il pleut')
  await expect(form.getByLabel('Prévenir par courriel les familles qui ont une adresse')).toBeChecked()
  await form.getByRole('button', { name: 'Reporter', exact: true }).click()
  await expect.poll(() => stub.calls.find((c) => c.method === 'PATCH')?.body).toMatchObject({ id: 'e1', status: 'postponed', reason: 'Il pleut', notify: true })
  await expect(page.getByText(/Reportée : change la date/)).toBeVisible()
  // postponed already: no second « Reporter »
  await expect(page.getByRole('button', { name: 'Reporter', exact: true })).toHaveCount(0)
})

test('cancelled: the reason can go out by email, and an empty form sends nothing', async ({ page }) => {
  const stub = await host(page, {
    'GET auth/me': () => ({ json: MAILING }),
    'GET encounters': () => ({ json: detail([inv('i1', 'f1', 'Léa', 'Julie', 'yes', { email: 'j@example.com' })], { status: 'cancelled' }) }),
    'PATCH encounters': () => ({ json: { notified: 1 } }),
  })
  await page.goto('/rencontres/e1')
  const form = page.locator('form', { hasText: 'Dis-leur pourquoi' })
  await form.getByRole('button', { name: 'Publier' }).click()
  expect(stub.calls.filter((c) => c.method === 'PATCH' || (c.method === 'POST' && c.path === 'messages'))).toEqual([])
  await form.getByPlaceholder('La pluie, un rhume, on se reprend…').fill('Un rhume')
  await form.getByLabel('Prévenir par courriel les familles qui ont une adresse').check()
  await form.getByRole('button', { name: 'Publier' }).click()
  await expect.poll(() => stub.calls.find((c) => c.method === 'PATCH')?.body).toEqual({ id: 'e1', announce: true, reason: 'Un rhume' })
  await expect(page.getByText(/1 courriel envoyé/)).toBeVisible()
})

test('a family whose email bounced is marked on the card and in the friends list', async ({ page }) => {
  await host(page, {
    'GET families': () => ({ json: { families: [fam('f1', 'Léa', 'Julie', { email: 'j@example.com', email_bounced_at: now })] } }),
    'GET encounters': (_b, url) => (url.searchParams.get('id') ? { json: detail([inv('i1', 'f1', 'Léa', 'Julie', null, { email: 'j@example.com', email_bounced_at: now })]) } : { json: { encounters: [enc()], invitations: [] } }),
  })
  await page.goto('/rencontres/e1')
  await expect(page.getByText('Courriel non reçu')).toBeVisible()
  await page.goto('/amis')
  await expect(page.getByText('Courriel non reçu')).toBeVisible()
  await page.locator('.friend > summary').click()
  await expect(page.getByText('Vérifie l’adresse, ou envoie-lui le lien par texto.')).toBeVisible()
});

// Large text: people set their phone's text to 200 % and the app must still fit its screen (nothing past the right edge,
// no sideways scroll). Emulated by doubling the root font size, which every rem in the stylesheet follows.
test('the host screens still fit a 375px screen with the text at 200% @webkit', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 })
  await host(page, {
    'GET families': () => ({ json: { families: [fam('f1', 'Léa', 'Julie', { email: 'j@example.com' })] } }),
    'GET encounters': (_b, url) => (url.searchParams.get('id') ? { json: detail([inv('i1', 'f1', 'Léa', 'Julie', 'yes', { email: 'j@example.com' })]) } : { json: { encounters: [enc()], invitations: [] } }),
  })
  const stretch = () => page.addStyleTag({ content: 'html { font-size: 200% !important; }' })
  const overflowing = () =>
    page.evaluate(() => {
      const vw = document.documentElement.clientWidth
      return [...document.querySelectorAll<HTMLElement>('body *')]
        .filter((el) => el.offsetParent !== null && !el.closest('.toasts') && !el.closest('.nav'))
        .map((el) => ({ tag: el.tagName, cls: el.className?.toString?.() ?? '', right: Math.round(el.getBoundingClientRect().right) }))
        .filter((x) => x.right > vw + 1)
    })
  for (const path of ['/rencontres', '/rencontres/e1', '/rencontres/nouvelle', '/amis', '/enfants', '/compte']) {
    await page.goto(path)
    await expect(page.locator('h1').first()).toBeVisible()
    await stretch()
    expect(await overflowing(), path).toEqual([])
  }
  await page.goto('/amis')
  await page.getByRole('button', { name: 'Nouvelle famille' }).click()
  await stretch()
  expect(await overflowing(), 'amis form').toEqual([])
  await page.goto('/enfants')
  await page.getByRole('button', { name: 'Ajouter un enfant' }).click()
  await stretch()
  expect(await overflowing(), 'enfants form').toEqual([])
});
