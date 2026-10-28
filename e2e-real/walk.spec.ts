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
  await host.getByRole('link', { name: 'Proposer une rencontre' }).first().click()
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
  await host.getByText('Plus d’options').first().click()
  const written = await host.locator('.paper').first().innerText()
  const code = written.match(/([a-z]{3,7}-[a-z]{3,7})$/)?.[1]
  expect(code, `a two-word link in "${written}"`).toBeTruthy()

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

  await hostCtx.close()
  await guestCtx.close()
  await en.close()
})
