import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { call, inDays, signup } from './helpers'

// Every screen with REAL records behind it (no stubs): a household with children, families, a rencontre with answers, a board, things to
// bring, a window, then each screen in light and dark, at 320 px and at desktop width: no serious accessibility violation, nothing bleeding
// off the screen sideways, and no « undefined » or « [object » on the page.
const WIDTHS = [320, 1280] as const

async function check(page: Page, label: string) {
  await expect(page.locator('h1, h2').first()).toBeVisible()
  const bad = (await new AxeBuilder({ page }).analyze()).violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)
  expect(bad, `${label} accessibility`).toEqual([])
  const over = await page.evaluate(() => {
    const vw = document.documentElement.clientWidth
    return [...document.querySelectorAll<HTMLElement>('body *')]
      .filter((el) => el.offsetParent !== null && !el.closest('[inert]') && getComputedStyle(el).position !== 'fixed')
      .map((el) => ({ tag: el.tagName, cls: el.className?.toString?.() ?? '', right: Math.round(el.getBoundingClientRect().right) }))
      .filter((x) => x.right > vw + 1)
  })
  expect(over, `${label} sideways overflow`).toEqual([])
  const text = await page.locator('body').innerText()
  expect(text, `${label} leaked a raw value`).not.toMatch(/undefined|\[object |NaN/)
}

test('every screen, real data, both themes, narrow and wide', async ({ browser }) => {
  test.setTimeout(600_000)
  const seedCtx = await browser.newContext({ locale: 'fr-CA' })
  await signup(seedCtx, 'Sweep', 'sweep')
  const kid = (await call<{ id: string }>(seedCtx, 'post', 'children', { firstName: 'Noé', birthdate: '2023-05-01' })).body.id
  await call(seedCtx, 'post', 'children', { firstName: 'Alice', birthdate: '2024-08-01' })
  const lea = (await call<{ id: string }>(seedCtx, 'post', 'families', { childFirstName: 'Léa', parentName: 'Julie', email: 'julie@example.test', allergies: 'Arachides', notes: 'Sieste à 13 h' })).body.id
  const max = (await call<{ id: string }>(seedCtx, 'post', 'families', { childFirstName: 'Maximilien-Alexandre', parentName: 'Paul-Antoine de la Rochefoucauld', phone: '514-555-0100' })).body.id
  await call(seedCtx, 'post', 'groups', { name: 'La garderie', families: [lea, max] })
  await call(seedCtx, 'put', 'home-card', { dog: true, pool: true, screens: 'little', nutFree: true, note: 'Chaussons à l’entrée' })
  const made = (await call<{ id: string }>(seedCtx, 'post', 'encounters', { childId: kid, kind: 'home', title: 'Goûter chez nous avec un titre assez long pour vérifier que rien ne déborde', startsAt: inDays(2, 15), endsAt: inDays(2, 17), place: 'Chez nous, un endroit au nom plutôt long', address: '12 rue des Érables, Montréal', note: 'Apportez une collation', scope: 'family', invite: [lea, max], slots: [inDays(3, 15)], details: { planB: 'Dans le salon' } })).body.id
  const detail = (await call<{ invitations: { id: string; token: string; friend_family_id: string }[] }>(seedCtx, 'get', `encounters?id=${made}`)).body
  const forLea = detail.invitations.find((i) => i.friend_family_id === lea)!
  await call(seedCtx, 'patch', 'invitations', { id: forLea.id, reply: 'yes' })
  await call(seedCtx, 'post', 'messages', { encounterId: made, text: 'On sonne à la porte bleue, merci de ne pas klaxonner' })
  await call(seedCtx, 'post', 'bring', { encounter: made, label: 'la collation' })
  await call(seedCtx, 'post', 'windows', { childId: kid, startsAt: inDays(4, 13), endsAt: inDays(4, 16), note: 'Parc ou chez nous', families: [lea] })
  await call(seedCtx, 'post', 'encounters', { childId: kid, kind: 'park', title: 'Le parc du mardi', startsAt: inDays(5, 10), startsAtList: [inDays(5, 10), inDays(12, 10)], place: 'Parc Lafontaine', scope: 'family', invite: [lea] })
  const state = await seedCtx.storageState()
  await seedCtx.close()

  const signedIn = ['/rencontres', '/rencontres/nouvelle', `/rencontres/${made}`, `/rencontres/${made}/cartes`, '/amis', '/compte', '/compte?tab=notifications', '/compte?tab=home', '/compte?tab=calendar', '/compte?tab=security', '/compte?tab=data']
  for (const scheme of ['light', 'dark'] as const) {
    for (const width of WIDTHS) {
      const ctx = await browser.newContext({ storageState: state, viewport: { width, height: width < 500 ? 700 : 900 }, colorScheme: scheme, locale: 'fr-CA' })
      const page = await ctx.newPage()
      for (const path of signedIn) {
        await page.goto(path)
        await check(page, `${path} ${width}px ${scheme}`)
      }
      // the sheets, opened over real data
      await page.goto('/amis')
      await page.locator('details.friend > summary').first().click()
      await page.locator('details.friend').first().getByRole('button', { name: 'Modifier', exact: true }).click()
      await check(page, `friend sheet ${width}px ${scheme}`)
      await page.keyboard.press('Escape')
      // the invitation page, from the family's side, before and after answering
      const guest = await browser.newContext({ viewport: { width, height: 700 }, colorScheme: scheme, locale: 'fr-CA' })
      const gp = await guest.newPage()
      const maxToken = (await call<{ invitations: { token: string; friend_family_id: string }[] }>(await browser.newContext({ storageState: state }), 'get', `encounters?id=${made}`)).body.invitations.find((i) => i.friend_family_id === max)!.token
      await gp.goto(`/${maxToken}`)
      await check(gp, `invitation (unanswered) ${width}px ${scheme}`)
      // answered once (the first pass), then seen answered on every later one
      const ask = gp.getByRole('button', { name: 'Oui, on y sera' })
      if (await ask.count()) {
        await ask.click()
        await expect(gp.getByText('Réponse envoyée. Merci !')).toBeVisible()
      }
      await check(gp, `invitation (answered) ${width}px ${scheme}`)
      await guest.close()
      await ctx.close()
    }
  }
})
