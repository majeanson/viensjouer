import { expect, test } from '@playwright/test'

// A host proposes, an invited parent answers from the link with no account, both write on the board, one
// takes something to bring, the host edits and the invited parent is shown what changed. Real Worker, real
// D1. The sandbox household is seeded by « Essayer sans compte » (it can send no mail, so nothing leaves).
test('the whole walk, host and invited parent, on the real stack', async ({ browser, baseURL }) => {
  const hostCtx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'fr-CA' })
  const host = await hostCtx.newPage()

  // -- the host: the door, the sandbox, a new rencontre
  await host.goto('/')
  await host.getByRole('button', { name: 'Essayer sans compte' }).click()
  await expect(host).toHaveURL(/\/rencontres$/)
  await expect(host.getByRole('heading', { name: 'Rencontres' })).toBeVisible()
  await host.locator('a, button').filter({ hasText: 'Proposer une rencontre' }).first().click()
  await host.getByRole('checkbox', { name: /Léa/ }).check()
  await host.getByLabel('Où').fill('Parc Lafontaine')
  await host.getByRole('button', { name: 'Créer et obtenir les liens' }).click()
  // (not « nouvelle »: the form's own address also matches a bare id pattern)
  await expect(host).toHaveURL(/\/rencontres\/(?!nouvelle)[A-Za-z0-9]+$/)
  const hostUrl = host.url()

  // -- the host adds something to bring, and finds the short link
  await host.getByText(/^À apporter/).click()
  await host.getByLabel('À apporter', { exact: true }).fill('la collation')
  await host.getByRole('button', { name: 'Ajouter', exact: true }).click()
  await expect(host.getByText('la collation')).toBeVisible()
  await host.getByText('Plus de choix').first().click()
  const written = await host.locator('.paper').first().innerText()
  const firstCode = written.match(/([a-z]{3,7}-[a-z]{3,7})$/)?.[1]
  expect(firstCode, `a two-word link in "${written}"`).toBeTruthy()

  // -- two words that read badly can be drawn again; the old ones stop opening the invitation
  await host.getByRole('button', { name: 'Changer les deux mots' }).first().click()
  await expect(host.locator('.paper').first()).not.toHaveText(written)
  const code = (await host.locator('.paper').first().innerText()).match(/([a-z]{3,7}-[a-z]{3,7})$/)?.[1]
  expect(code).toBeTruthy()
  expect(code).not.toBe(firstCode)
  expect((await host.request.get(`/api/r/${firstCode}`)).status()).toBe(404)

  // -- the invited parent, on a phone, with no account
  const guestCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'fr-CA' })
  const guest = await guestCtx.newPage()
  await guest.goto(`${baseURL}/${code}`)
  await expect(guest.getByRole('heading', { name: /invite Léa/ })).toBeVisible()
  await expect(guest).toHaveTitle(/invite Léa · Viens jouer/)
  await guest.getByRole('button', { name: 'Oui, on y sera' }).click()
  await expect(guest.getByText('Marc voit ta réponse', { exact: false }).or(guest.getByText(/voit ta réponse/))).toBeVisible()
  const board = guest.getByLabel('Le tableau', { exact: true })
  await board.getByLabel('Écrire sur le tableau…').fill('On arrive vers 14 h')
  await board.getByRole('button', { name: 'Publier' }).click()
  await expect(board.getByText('On arrive vers 14 h')).toBeVisible()
  await guest.getByRole('button', { name: 'Je l’apporte' }).click()
  await expect(guest.getByText(/apporté par/)).toBeVisible()
  // let the page remember this visit before the host changes anything
  await guest.waitForTimeout(3000)

  // -- back on the host: who is coming, the board, who brings what
  await host.goto(hostUrl)
  const roster = host.getByLabel('Qui vient')
  await expect(roster).toContainText('Viennent (1)')
  await expect(roster).toContainText('Léa')
  await expect(host.getByLabel('Le tableau', { exact: true })).toContainText('On arrive vers 14 h')
  await host.getByText(/^À apporter/).click()
  await expect(host.getByText(/apporté par/)).toBeVisible()

  // -- the host edits the place; the invited parent is shown what changed
  await host.getByRole('button', { name: 'Modifier', exact: true }).click()
  await host.getByLabel('Où').fill('Chez nous')
  await host.getByRole('button', { name: 'Enregistrer les changements' }).click()
  await expect(host.getByText('Modifié. Les familles le verront sur leur page.')).toBeVisible()
  await guest.reload()
  await expect(guest.getByText('Mis à jour depuis ta dernière visite')).toBeVisible()
  await expect(guest.locator('.changed').first()).toBeVisible()

  // -- paper: the printable card carries the family's two words and never the place; an answer given in person is
  // noted by the host and the family's own page shows it (real SQL, same row the family answers on)
  await host.goto(`${hostUrl}/cartes`)
  const paper = host.getByRole('article', { name: 'Pour Léa' })
  await expect(paper).toContainText(code!.split('-').join(' · '))
  await expect(host.locator('.sheet')).not.toContainText('Chez nous')
  await host.goto(hostUrl)
  await host.getByText('Plus de choix').first().click()
  await host.getByRole('group', { name: 'Noter sa réponse' }).getByRole('button', { name: 'Peut-être' }).click()
  await expect.poll(async () => ((await (await guest.request.get(`/api/r/${code}`)).json()) as { you: { reply: string } }).you.reply).toBe('maybe')

  // -- the host's calendar feed and the data export answer for real
  const feed = await host.request.post('/api/cal-link', { data: {}, headers: { 'x-csrf-token': (await hostCtx.cookies()).find((c) => c.name === 'vj_csrf')?.value ?? '' } })
  expect([200, 403]).toContain(feed.status()) // a sandbox may not make a feed: either answer is a real one
  const exported = await host.request.get('/api/export')
  expect(exported.status()).toBe(200)
  expect(JSON.stringify(await exported.json())).toContain('On arrive vers 14 h')
  // the guest's calendar subscription is real calendar text
  const ics = await guest.request.get(`/api/r/${code}/ics?s=1`)
  expect(ics.status()).toBe(200)
  expect(await ics.text()).toContain('BEGIN:VEVENT')

  // -- the English visitor: the lazy dictionary really arrives
  const en = await browser.newContext({ locale: 'en-CA', viewport: { width: 390, height: 844 } })
  const enPage = await en.newPage()
  await enPage.goto(`${baseURL}/${code}`)
  await expect(enPage.getByRole('heading', { name: /invites Léa/ })).toBeVisible()

  // -- pictures: a cover and two faces go up, are served to the right people, and « Tout effacer » removes it all
  const csrf = (await hostCtx.cookies()).find((c) => c.name === 'vj-csrf' || c.name === 'vj_csrf')?.value ?? ''
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')
  const post = (url: string) => host.request.post(url, { data: png, headers: { 'x-csrf-token': csrf, 'content-type': 'image/png' } })
  const encounterId = hostUrl.split('/').pop()!
  const children = (await (await host.request.get('/api/children')).json()) as { children: { id: string }[] }
  expect((await post(`/api/cover?encounter=${encounterId}`)).status()).toBe(201)
  expect((await post(`/api/avatar?kind=child&id=${children.children[0].id}`)).status()).toBe(201)
  expect((await post('/api/avatar?kind=parent')).status()).toBe(201)
  const card = (await (await guest.request.get(`/api/r/${code}`)).json()) as { cover: string | null; host: { childPhoto: string | null; parentPhoto: string | null } }
  expect(card.cover).toBeTruthy()
  expect(card.host.childPhoto).toBeTruthy()
  expect(card.host.parentPhoto).toBeTruthy()
  expect((await guest.request.get(`/api/r/${code}/cover`)).status()).toBe(200)
  expect((await guest.request.get(`/api/r/${code}/avatar/child`)).status()).toBe(200)
  expect((await guest.request.get(`/api/r/${code}/avatar/parent`)).status()).toBe(200)

  // -- the link preview: what a messaging app shows when the link is texted
  const unfurl = async (path: string, lang = 'fr-CA') => (await guest.request.get(path, { headers: { accept: 'text/html', 'accept-language': lang } })).text()
  const page = await unfurl(`/${code}`)
  expect(page).toContain('property="og:title" content="Noé invite Léa"')
  expect(page).toContain('<title>Noé invite Léa · Viens jouer</title>')
  expect(page).toMatch(new RegExp(`property="og:image" content="[^"]*/api/r/${code}/cover\\?v=`))
  // (locally wrangler presents the route's host, so only the shape of the address is asserted)
  expect(page).toMatch(new RegExp(`property="og:url" content="https?://[^"]+/${code}"`))
  expect(page).not.toContain('Camille') // the card tells what the page tells, never more
  expect(await unfurl(`/${code}`, 'en-CA')).toContain('content="Noé invites Léa"')
  // a wrong code gets the plain card, and a crawler cannot tell it from a missing page
  expect(await unfurl('/zzzz-yyyy')).toContain('property="og:title" content="Viens jouer"')
  expect(await unfurl('/rencontres')).toContain('property="og:title" content="Viens jouer"')

  // the sample email is refused in a trial: nothing can leave a sandbox, not even to its own address
  const sample = await host.request.post('/api/test-mail', { data: {}, headers: { 'x-csrf-token': csrf } })
  expect(sample.status()).toBe(403)

  // the history answers for a family of this household, and the reminder switch is a real write
  const fams = (await (await host.request.get('/api/families')).json()) as { families: { id: string }[] }
  const hist = await host.request.get(`/api/family-history?id=${fams.families[0].id}`)
  expect(hist.status()).toBe(200)
  expect(Array.isArray((await hist.json()).past)).toBe(true)
  expect((await host.request.patch('/api/profile', { data: { remindHost: true }, headers: { 'x-csrf-token': csrf } })).status()).toBe(200)

  // -- tenant isolation on the real database: a second household can neither read nor change the first one's rencontre
  const strangerCtx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'fr-CA' })
  const stranger = await strangerCtx.newPage()
  await stranger.goto('/')
  await stranger.getByRole('button', { name: 'Essayer sans compte' }).click()
  await expect(stranger).toHaveURL(/\/rencontres$/)
  const sCsrf = (await strangerCtx.cookies()).find((c) => c.name === 'vj_csrf')?.value ?? ''
  const h = { 'x-csrf-token': sCsrf }
  expect((await stranger.request.get(`/api/encounters?id=${encounterId}`)).status()).toBe(404)
  expect((await stranger.request.patch('/api/encounters', { data: { id: encounterId, title: 'pris' }, headers: h })).status()).toBe(404)
  expect((await stranger.request.delete('/api/encounters', { data: { id: encounterId }, headers: h })).status()).toBe(404)
  expect(JSON.stringify(await (await stranger.request.get('/api/export')).json())).not.toContain('On arrive vers 14 h')
  const strangerFams = JSON.stringify(await (await stranger.request.get('/api/families')).json())
  for (const f of fams.families) expect(strangerFams).not.toContain(f.id)
  // and the first one is untouched by all of it
  expect((await host.request.get(`/api/encounters?id=${encounterId}`)).status()).toBe(200)
  await strangerCtx.close()

  // -- signup never says whether an address has an account: a wrong password gets the neutral answer, the right one signs in
  const addr = `walk-${Date.now()}@example.com`
  const probeCtx = await browser.newContext() // its own cookies: a signup signs its caller in
  const mk = (password: string) => probeCtx.request.post('/api/auth/signup', { data: { email: addr, password, displayName: 'Walk' } })
  expect((await mk('un-bon-mot-de-passe')).status()).toBe(201)
  const again = await mk('pas-le-bon-mot-de-passe')
  expect(again.status()).toBe(409)
  expect(await again.text()).not.toMatch(/existe déjà/)
  expect((await mk('un-bon-mot-de-passe')).status()).toBe(201)
  await probeCtx.close()

  // -- « Me déconnecter partout »: a copy of this session (another device) dies, this one stays signed in
  const other = await browser.newContext({ storageState: await hostCtx.storageState() })
  expect((await (await other.request.get('/api/auth/me')).json()).signedIn).toBe(true)
  expect((await host.request.delete('/api/sessions', { headers: { 'x-csrf-token': csrf } })).status()).toBe(200)
  expect((await (await other.request.get('/api/auth/me')).json()).signedIn).toBe(false)
  expect((await (await host.request.get('/api/auth/me')).json()).signedIn).toBe(true)
  await other.close()
  // the sign-out gave this device a fresh CSRF pair
  const csrf2 = (await hostCtx.cookies()).find((c) => c.name === 'vj_csrf')?.value ?? ''

  const erase = await host.request.delete('/api/household', { data: {}, headers: { 'x-csrf-token': csrf2 } })
  expect(erase.status(), await erase.text()).toBe(200)
  expect((await (await host.request.get('/api/auth/me')).json()).signedIn).toBe(false)
  // everything the invitation pointed at is gone with it
  expect((await guest.request.get(`/api/r/${code}`)).status()).toBe(404)
  expect((await guest.request.get(`/api/r/${code}/cover`)).status()).toBe(404)

  await hostCtx.close()
  await guestCtx.close()
  await en.close()
})
