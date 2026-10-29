import { expect, test, type Page } from '@playwright/test'
import { child, fam } from './fixtures'

// The 2026-10-29 batch, in the browser, API stubbed: the credit line, nap-aware slots, the friend import, the unsubscribe page,
// the install offer, the bot check. (The Worker side of each is held by its own unit test on a real database.)
type Reply = { status?: number; json: unknown }
type Handler = (body: Record<string, unknown> | null, url: URL) => Reply | undefined
interface Stub {
  calls: { method: string; path: string; body: Record<string, unknown> | null }[]
}

async function host(page: Page, handlers: Record<string, Handler> = {}, signedIn = true): Promise<Stub> {
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
      'auth/me': signedIn ? { signedIn: true, email: 'm@example.com', displayName: 'Marc', household: { id: 'h', name: 'Les Jeanson', tz: 'America/Toronto' }, mail: false, demo: false } : { signedIn: false },
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

test('the foot of the door and of the signed-in screens credits marc.portal with a plain link', async ({ page }) => {
  await host(page, {}, false)
  await page.goto('/')
  await expect(page.locator('.credit').getByRole('link', { name: 'marc.portal', exact: true })).toHaveAttribute('href', 'https://marcportal.com')
  await expect(page.locator('.credit')).toContainText('Bâti par')
  await page.unroute('**/api/**')
  await host(page)
  for (const path of ['/rencontres', '/amis', '/enfants', '/compte']) {
    await page.goto(path)
    await expect(page.locator('h1').first()).toBeVisible()
    await expect(page.locator('.credit').getByRole('link', { name: 'marc.portal', exact: true }), path).toHaveAttribute('href', 'https://marcportal.com')
  }
})

test('the slots clear the nap of every family picked, not only the host’s child', async ({ page }) => {
  await host(page, {
    'GET children': () => ({ json: { children: [{ ...child, nap_start: '13:00', nap_end: '14:30' }] } }),
    'GET families': () => ({ json: { families: [fam('f1', 'Léa', 'Julie', { nap_start: '12:00', nap_end: '15:00' })] } }),
  })
  await page.goto('/rencontres/nouvelle')
  await expect(page.getByRole('button', { name: 'Avant la sieste, 11 h' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Après la sieste, 14 h 30' })).toBeVisible()
  await page.getByRole('checkbox', { name: /Léa/ }).check()
  await expect(page.getByRole('button', { name: 'Avant la sieste, 10 h' })).toBeVisible()
  await page.getByRole('button', { name: 'Après la sieste, 15 h' }).click()
  await expect(page.getByLabel('Heure', { exact: true })).toHaveValue('15:00')
})

test('a friend’s nap is saved from the friends form', async ({ page }) => {
  const stub = await host(page, { 'POST families': () => ({ status: 201, json: { id: 'f9' } }) })
  await page.goto('/amis')
  await page.getByRole('button', { name: 'Nouvelle famille' }).click()
  await page.getByLabel('Prénom de l’ami').fill('Léa')
  await page.getByLabel('Prénom du parent').fill('Julie')
  await page.locator('input[name=napStart]').fill('12:30')
  await page.locator('input[name=napEnd]').fill('14:00')
  await page.getByRole('button', { name: 'Enregistrer' }).click()
  await expect.poll(() => stub.calls.find((c) => c.method === 'POST' && c.path === 'families')?.body).toMatchObject({ napStart: '12:30', napEnd: '14:00' })
})

test('import a list: says what it understood, names the line to fix, then adds the good ones', async ({ page }) => {
  const stub = await host(page, { 'POST families': () => ({ status: 201, json: { added: 2, skipped: 0 } }) })
  await page.goto('/amis')
  await page.getByRole('button', { name: 'Importer une liste' }).click()
  const box = page.getByLabel('Importer une liste de familles')
  await box.fill('Julie, Léa, julie@example.com\nPaul\nSonia; Zoé')
  await expect(page.getByText('2 familles prêtes à ajouter.')).toBeVisible()
  await expect(page.getByText(/Ligne 2 : « Paul » il manque le prénom de l’enfant\./)).toBeVisible()
  await page.getByRole('button', { name: 'Ajouter ces familles' }).click()
  await expect.poll(() => stub.calls.find((c) => c.method === 'POST' && c.path === 'families')?.body).toEqual({
    import: [
      { parentName: 'Julie', childFirstName: 'Léa', email: 'julie@example.com' },
      { parentName: 'Sonia', childFirstName: 'Zoé', email: null },
    ],
  })
  await expect(page.getByText('2 ajoutées.')).toBeVisible()
})

test('the first-steps card offers the import, which opens straight on the importer', async ({ page }) => {
  await host(page)
  await page.goto('/rencontres')
  await page.getByRole('link', { name: 'Importer une liste' }).click()
  await expect(page).toHaveURL(/\/amis\?importer=1$/)
  await expect(page.getByLabel('Importer une liste de familles')).toBeVisible()
})

test('the unsubscribe page asks once, says it is done, and lets the person take it back', async ({ page }) => {
  let stopped = false
  const stub = await host(
    page,
    {
      'GET r/h7kq-3wpm/stop-mail': () => ({ json: { stopped } }),
      'POST r/h7kq-3wpm/stop-mail': (b) => ((stopped = b?.stop !== false), { json: { stopped } }),
    },
    false,
  )
  await page.goto('/stop/h7kq-3wpm')
  await expect(page.getByRole('heading', { name: 'Courriels de Viens jouer' })).toBeVisible()
  await page.getByRole('button', { name: 'Ne plus recevoir de courriels' }).click()
  await expect(page.getByText('C’est fait : tu ne recevras plus de courriels de Viens jouer.')).toBeVisible()
  expect(stub.calls.find((c) => c.method === 'POST')?.body).toEqual({ stop: true })
  await page.getByRole('button', { name: 'Finalement, je veux les recevoir' }).click()
  await expect(page.getByRole('button', { name: 'Ne plus recevoir de courriels' })).toBeVisible()
  expect(stub.calls.filter((c) => c.method === 'POST').at(-1)?.body).toEqual({ stop: false })
})

test('a code that does not exist on the unsubscribe page says the link leads nowhere', async ({ page }) => {
  await host(page, { 'GET r/zzzz-9999/stop-mail': () => ({ status: 404, json: { error: 'x' } }) }, false)
  await page.goto('/stop/zzzz-9999')
  await expect(page.getByText(/Ce lien ne mène nulle part/)).toBeVisible()
})

test('the home-screen offer comes on the third day, once, and « Plus tard » is final', async ({ page }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('vj_visits')) localStorage.setItem('vj_visits', JSON.stringify({ n: 2, last: '2000-01-01' }))
  })
  await host(page)
  await page.goto('/rencontres')
  await expect(page.getByText(/Sur iPhone et iPad/)).toBeVisible()
  await page.getByRole('button', { name: 'Plus tard' }).click()
  await expect(page.getByText(/Sur iPhone et iPad/)).toHaveCount(0)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Rencontres', level: 1 })).toBeVisible()
  await expect(page.getByText(/Sur iPhone et iPad/)).toHaveCount(0)
})

test('no home-screen offer on the first days', async ({ page }) => {
  await host(page)
  await page.goto('/rencontres')
  await expect(page.getByRole('heading', { name: 'Rencontres', level: 1 })).toBeVisible()
  await expect(page.getByText(/Sur iPhone et iPad/)).toHaveCount(0)
})

test('the bot check appears on signup and on forgot-password only when a site key is configured', async ({ page }) => {
  await page.route('https://challenges.cloudflare.com/**', (r) => r.abort())
  await host(page, { 'GET health': () => ({ json: { ok: true, mail: true, photos: false, invite: false, turnstile: '0xSITEKEY' } }) }, false)
  await page.goto('/')
  await expect(page.getByTestId('turnstile')).toHaveCount(0) // login tab: no widget
  await page.getByRole('tab', { name: 'Première fois ici' }).click()
  await expect(page.getByTestId('turnstile')).toHaveCount(1)
  await page.goto('/oubli')
  await expect(page.getByTestId('turnstile')).toHaveCount(1)
  await page.unroute('**/api/**')
  await host(page, {}, false)
  await page.goto('/oubli')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expect(page.getByTestId('turnstile')).toHaveCount(0)
})

test('« envoyer tout de suite » is a tickbox, off by default, only offered when someone can be emailed, and says what went out', async ({ page }) => {
  const MAIL = { signedIn: true, email: 'm@example.com', displayName: 'Marc', household: { id: 'h', name: 'Les Jeanson', tz: 'America/Toronto' }, mail: true, demo: false }
  const stub = await host(page, {
    'GET auth/me': () => ({ json: MAIL }),
    'GET families': () => ({ json: { families: [fam('f1', 'Léa', 'Julie', { email: 'j@example.com' }), fam('f2', 'Max', 'Paul'), fam('f3', 'Zoé', 'Anne', { email: 'a@example.com', mail_stopped_at: 5 })] } }),
    'POST encounters': () => ({ status: 201, json: { id: 'e9', ids: ['e9'], sent: 1, skipped: 0 } }),
    'GET encounters': (_b, url) => (url.searchParams.get('id') ? { json: { encounter: { id: 'e9', child_id: 'c1', kind: 'park', title: 'Au parc', starts_at: Math.floor(Date.now() / 1000) + 86400, ends_at: null, place: null, address: null, map_url: null, note: null, status: 'proposed', series_id: null, details: {}, hereOpen: false }, invitations: [], messages: [], relais: [], souvenirs: [], changes: [] } } : { json: { encounters: [], invitations: [] } }),
  })
  await page.goto('/rencontres/nouvelle')
  await expect(page.getByLabel('Envoyer les invitations par courriel tout de suite')).toHaveCount(0) // nobody picked yet
  await page.getByRole('checkbox', { name: /Max/ }).check()
  await expect(page.getByText(/Aucune famille choisie n’a de courriel/)).toBeVisible() // Max has no address
  await page.getByRole('checkbox', { name: /Zoé/ }).check()
  await expect(page.getByText(/Aucune famille choisie n’a de courriel/)).toBeVisible() // Zoé asked to stop: not counted
  await page.getByRole('checkbox', { name: /Léa/ }).check()
  const box = page.getByLabel('Envoyer les invitations par courriel tout de suite')
  await expect(box).not.toBeChecked()
  await expect(page.getByText('1 famille a un courriel.')).toBeVisible()
  await box.check()
  await page.getByRole('button', { name: 'Créer et obtenir les liens' }).click()
  await expect.poll(() => stub.calls.find((c) => c.method === 'POST' && c.path === 'encounters')?.body).toMatchObject({ sendNow: true })
  await expect(page.getByText('1 invitation envoyée par courriel.')).toBeVisible()
})

test('without ticking it, nothing is asked to be sent', async ({ page }) => {
  const stub = await host(page, {
    'GET auth/me': () => ({ json: { signedIn: true, email: 'm@example.com', displayName: 'Marc', household: { id: 'h', name: 'H', tz: 'America/Toronto' }, mail: true, demo: false } }),
    'GET families': () => ({ json: { families: [fam('f1', 'Léa', 'Julie', { email: 'j@example.com' })] } }),
    'POST encounters': () => ({ status: 201, json: { id: 'e9', ids: ['e9'] } }),
  })
  await page.goto('/rencontres/nouvelle')
  await page.getByRole('checkbox', { name: /Léa/ }).check()
  await page.getByRole('button', { name: 'Créer et obtenir les liens' }).click()
  await expect.poll(() => stub.calls.find((c) => c.method === 'POST' && c.path === 'encounters')?.body).toMatchObject({ sendNow: false })
})

// ---- notifications --------------------------------------------------------------------------------------------------

test('« Nouveau » on Rencontres lists what happened, opens it and marks it read, or marks everything read', async ({ page }) => {
  let list = [
    { id: 'n1', kind: 'invited', title: 'Marc t’invite', body: 'Au parc, samedi', url: '/lune-miel' },
    { id: 'n2', kind: 'answered', title: 'Léa : oui', body: 'Julie · Au parc', url: '/rencontres/e1#i1' },
  ]
  const stub = await host(page, {
    'GET notifications': () => ({ json: { notifications: list } }),
    'POST notifications': (b) => ((list = b?.readAll ? [] : list.filter((n) => n.id !== b?.id)), { json: { ok: true } }),
  })
  await page.goto('/rencontres')
  const card = page.getByRole('region', { name: 'Nouveau' })
  await expect(card).toContainText('Marc t’invite')
  await expect(card).toContainText('Au parc, samedi')
  await expect(card.getByRole('link', { name: 'Marc t’invite' })).toHaveAttribute('href', '/lune-miel')
  await card.getByRole('link', { name: 'Léa : oui' }).click()
  await expect.poll(() => stub.calls.find((c) => c.method === 'POST' && c.path === 'notifications')?.body).toEqual({ id: 'n2' })
  await page.goto('/rencontres')
  await card.getByRole('button', { name: 'Tout marquer comme lu' }).click()
  await expect.poll(() => stub.calls.filter((c) => c.method === 'POST' && c.path === 'notifications').at(-1)?.body).toEqual({ readAll: true })
  await expect(page.getByRole('region', { name: 'Nouveau' })).toHaveCount(0)
})

test('no « Nouveau » card when there is nothing new', async ({ page }) => {
  await host(page, { 'GET notifications': () => ({ json: { notifications: [] } }) })
  await page.goto('/rencontres')
  await expect(page.getByRole('heading', { name: 'Rencontres', level: 1 })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Nouveau' })).toHaveCount(0)
})

test('Compte, Notifications says in plain words what you are told and where, and sends a test', async ({ page }) => {
  const stub = await host(page, { 'GET health': () => ({ json: { ok: true, mail: false, photos: false, invite: false, push: 'BKEY' } }), 'POST push': () => ({ json: { ok: true } }) })
  await page.goto('/compte?tab=notifications')
  await expect(page.getByRole('heading', { name: 'Notifications', level: 2 })).toBeVisible()
  for (const line of ['une famille t’invite à une rencontre', 'une rencontre où tu es invité change, est reportée ou annulée', 'une famille répond à ta rencontre', 'une rencontre approche (le rappel de la veille)']) await expect(page.getByText(line)).toBeVisible()
  await expect(page.getByText(/dans « Nouveau », sans permission/)).toBeVisible()
  await expect(page.getByText(/Rien de lisible ne passe par Apple ou Google/)).toBeVisible()
  await page.getByRole('button', { name: 'M’envoyer une notification d’essai' }).click()
  await expect.poll(() => stub.calls.find((c) => c.method === 'POST' && c.path === 'push')?.body).toEqual({ test: true })
  await expect(page.getByText(/Envoyée : regarde « Nouveau »/)).toBeVisible()
})

test('Compte, Notifications: with phone push not switched on yet, it says so and the app list still works', async ({ page }) => {
  await host(page, { 'GET health': () => ({ json: { ok: true, mail: false, photos: false, invite: false, push: null } }) })
  await page.goto('/compte?tab=notifications')
  await expect(page.getByText('Pas encore branchées sur téléphone. Tout reste dans « Nouveau ».')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Activer sur cet appareil' })).toHaveCount(0)
})

test('the front page explains how it works, including that nothing is sent unless you decide', async ({ page }) => {
  await host(page, {}, false)
  await page.goto('/')
  const how = page.getByRole('region', { name: 'Comment ça marche' })
  await expect(how).toBeVisible()
  await expect(how.getByRole('listitem')).toHaveCount(4)
  await expect(how).toContainText('par courriel, par texto, ou avec une carte à imprimer. Rien n’est envoyé sans que tu le décides.')
  await expect(how).toContainText('Pas de compte, pas d’application à installer.')
  await expect(how).toContainText('reçoit les nouvelles dans l’appli, et sur son téléphone si elle le permet')
})
