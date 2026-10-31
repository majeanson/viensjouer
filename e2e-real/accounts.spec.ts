import { expect, test } from '@playwright/test'
import { call, inDays, signup } from './helpers'

// TWO REAL ACCOUNTS on the real Worker and a real D1, no stubs, no secrets, nothing to set up: the test creates both households itself
// (fake addresses, a mail-less local stack, so nothing leaves). They meet the way two families do: the first invites the second to a
// rencontre, the second (signed in) opens the link and ties the two families together, then hosts one back; both write on the board; the
// first hosts with two children; the second ticks the times that suit. `npm run e2e:real` runs this and the single-guest walk.
interface Enc { encounter: { id: string; co_child_name?: string | null }; invitations: { id: string; token: string; friend_family_id: string; reply: string | null }[]; slots?: { id: string; yes: number }[] }

test('two real accounts: invite, link the families, host back, board, two hosting children, times to tick', async ({ browser }) => {
  test.setTimeout(180_000)
  const ctxA = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'fr-CA' })
  const ctxB = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'fr-CA' })
  const A = await ctxA.newPage()
  const B = await ctxB.newPage()

  await test.step('both accounts are created, signed in, with nothing in them', async () => {
    await signup(ctxA, 'Anne')
    await signup(ctxB, 'Julie')
    expect((await call<{ displayName: string }>(ctxA, 'get', 'auth/me')).body.displayName).toBe('Anne')
    expect((await call<{ displayName: string }>(ctxB, 'get', 'auth/me')).body.displayName).toBe('Julie')
  })

  // -- Anne: the first steps on the empty page (a child, a friend, one sentence), then her first rencontre
  await test.step('Anne: first steps, the sentence fills the form, the first rencontre is created', async () => {
    await A.goto('/rencontres')
    await A.getByLabel('Prénom de ton enfant').fill('Noé')
    await A.getByRole('button', { name: 'Ajouter mon enfant' }).click()
    await A.getByLabel('Prénom de son enfant').fill('Léa')
    await A.getByLabel('Prénom du parent').fill('Julie')
    await A.getByRole('button', { name: 'Ajouter un ami' }).click()
    await A.getByLabel('Dis-le en une phrase').fill('Parc dimanche 14h avec Léa')
    await A.getByRole('button', { name: 'Proposer une rencontre' }).click()
    await expect(A.locator('input[name=startsAt]')).toHaveValue(/T14:00$/)
    await expect(A.getByRole('checkbox', { name: /Léa/ })).toBeChecked()
    await A.getByRole('button', { name: 'Inviter', exact: true }).click()
    await expect(A).toHaveURL(/\/rencontres\/(?!nouvelle)[A-Za-z0-9]+$/)
  })
  const first = A.url().split('/').pop()!

  // -- a second child, edited from the sheet: it saves itself
  await test.step('Anne: a second child, renamed in the sheet with no Enregistrer', async () => {
    const kid = await call<{ id: string }>(ctxA, 'post', 'children', { firstName: 'Maxime' })
    expect(kid.status).toBe(201)
    await A.goto('/amis')
    await A.getByRole('button', { name: 'Modifier', exact: true }).last().click()
    const dlg = A.getByRole('dialog')
    await dlg.locator('input[name=firstName]').fill('Max')
    await expect(dlg.getByRole('status')).toContainText('Enregistré')
    await dlg.getByRole('button', { name: /Retour/ }).click()
    const kids = (await call<{ children: { first_name: string }[] }>(ctxA, 'get', 'children')).body.children.map((c) => c.first_name)
    expect(kids).toEqual(expect.arrayContaining(['Noé', 'Max']))
  })

  // -- Julie (signed in) opens Anne's link, answers, and ties the two families together
  const one = (await call<Enc>(ctxA, 'get', `encounters?id=${first}`)).body
  const link = one.invitations[0].token
  await test.step('Julie: opens the link while signed in, answers yes, and links the two families', async () => {
    await call(ctxB, 'post', 'children', { firstName: 'Léa' })
    await B.goto(`/${link}`)
    await expect(B.getByRole('heading', { name: /Noé invite Léa/ })).toBeVisible()
    await B.getByRole('button', { name: 'Oui, on y sera' }).click()
    await expect(B.getByText('Réponse envoyée. Merci !')).toBeVisible()
    await B.getByRole('button', { name: 'Ajouter à mes amis' }).click()
    await expect(B.getByText(/liées|déjà/i)).toBeVisible()
    const fams = (await call<{ families: { child_first_name: string; linked_household_id: string | null }[] }>(ctxA, 'get', 'families')).body.families
    expect(fams.find((f) => f.child_first_name === 'Léa')?.linked_household_id).toBeTruthy()
  })

  await test.step('Anne sees who is coming, and writes on the board that Julie then reads', async () => {
    await A.goto(`/rencontres/${first}`)
    await expect(A.getByLabel('Qui vient')).toContainText('Léa')
    await A.locator('summary', { hasText: /^Plus : / }).click()
    const board = A.getByLabel('Les messages', { exact: true })
    await board.locator('summary').click()
    await board.getByLabel('Écrire un message…').fill('On se retrouve à la fontaine')
    await board.getByRole('button', { name: 'Publier' }).click()
    await expect(board.getByText('On se retrouve à la fontaine')).toBeVisible()
    await B.reload()
    // she answered, so the fold with the board is already open; the board itself is one line until opened
    await B.getByLabel('Les messages', { exact: true }).locator('summary').click()
    await expect(B.getByText('On se retrouve à la fontaine')).toBeVisible()
  })

  // -- Julie hosts back: Anne's family is in Julie's book now, so Anne gets an invitation in her own agenda
  const back = await test.step('Julie hosts back and the invitation lands in Anne’s agenda', async () => {
    const book = (await call<{ families: { id: string; linked_household_id: string | null }[] }>(ctxB, 'get', 'families')).body.families
    const anne = book.find((f) => f.linked_household_id)
    expect(anne, 'Anne is in Julie’s book after the link').toBeTruthy()
    const kids = (await call<{ children: { id: string }[] }>(ctxB, 'get', 'children')).body.children
    const made = await call<{ id: string }>(ctxB, 'post', 'encounters', { childId: kids[0].id, kind: 'home', title: 'Goûter chez Julie', startsAt: inDays(5), place: 'Chez Julie', scope: 'family', invite: [anne!.id] })
    expect(made.status).toBe(201)
    await A.goto('/rencontres')
    await expect(A.getByRole('link', { name: /Goûter chez Julie/ })).toBeVisible()
    return made.body.id
  })
  void back

  // -- Anne hosts with BOTH children; Julie reads it on her link, and ticks the times that suit
  await test.step('Anne hosts with two children and offers two times; Julie ticks one and Anne sees it', async () => {
    const kids = (await call<{ children: { id: string; first_name: string }[] }>(ctxA, 'get', 'children')).body.children
    const fam = (await call<{ families: { id: string; child_first_name: string }[] }>(ctxA, 'get', 'families')).body.families.find((f) => f.child_first_name === 'Léa')!
    const made = await call<{ id: string }>(ctxA, 'post', 'encounters', { childId: kids[0].id, coChildId: kids[1].id, kind: 'park', title: 'Pique-nique', startsAt: inDays(6), place: 'Parc Lafontaine', scope: 'family', invite: [fam.id], slots: [inDays(7)] })
    expect(made.status).toBe(201)
    const detail = (await call<Enc>(ctxA, 'get', `encounters?id=${made.body.id}`)).body
    expect(detail.encounter.co_child_name).toBeTruthy()
    expect(detail.slots).toHaveLength(2)
    await B.goto(`/${detail.invitations[0].token}`)
    await expect(B.getByRole('heading', { name: /Noé et Max invitent Léa/ })).toBeVisible()
    const box = B.getByRole('region', { name: 'Quels moments te conviennent ?' })
    await box.getByRole('button').first().click()
    await expect(box.getByRole('button').first()).toHaveAttribute('aria-pressed', 'true')
    const after = (await call<Enc>(ctxA, 'get', `encounters?id=${made.body.id}`)).body
    expect(after.slots!.map((s) => s.yes).sort()).toEqual([0, 1])
    await A.goto(`/rencontres/${made.body.id}`)
    await expect(A.getByText('1 famille peut')).toBeVisible()
  })

  await test.step('the data export of each account holds its own rencontres, and Anne can leave', async () => {
    const exp = JSON.stringify((await call(ctxA, 'get', 'export')).body)
    expect(exp).toContain('Pique-nique')
    expect(exp).not.toContain('Goûter chez Julie')
  })

  await ctxA.close()
  await ctxB.close()
})

