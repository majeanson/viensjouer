import { expect, test } from '@playwright/test'
import { call, signup } from './helpers'

// Two real accounts and the « cercle »: a host asks a friend family (with an account) to be linked with no rencontre behind it; the
// friend opens the two-word code signed in and the two households are tied (each sees the other's child in its circle), then either cuts it.
// Also the trial sandbox: opened with no account, claimed into a real one.
test('the circle: invite a family, link from its code, see each other, cut the link', async ({ browser }) => {
  test.setTimeout(120_000)
  const ctxA = await browser.newContext({ locale: 'fr-CA' })
  const ctxB = await browser.newContext({ locale: 'fr-CA' })
  await signup(ctxA, 'Camille', 'circ')
  const emailB = await signup(ctxB, 'Dominique', 'circ')
  const kidA = (await call<{ id: string }>(ctxA, 'post', 'children', { firstName: 'Zia' })).body.id
  const kidB = (await call<{ id: string }>(ctxB, 'post', 'children', { firstName: 'Tom' })).body.id
  const famA = (await call<{ id: string }>(ctxA, 'post', 'families', { childFirstName: 'Tom', parentName: 'Dominique', email: emailB })).body.id

  const code = await test.step('Camille makes a circle code for the Tom family (nothing is sent by itself)', async () => {
    const made = await call<{ token?: string; invite?: { token: string } }>(ctxA, 'post', 'circle-invite', { familyId: famA, childId: kidA })
    expect(made.status).toBeLessThan(300)
    const open = (await call<{ invites: { familyId: string; token: string }[] }>(ctxA, 'get', 'circle-invite')).body.invites
    const mine = open.find((i) => i.familyId === famA)
    expect(mine, 'an open code for that family').toBeTruthy()
    // asking again gives the same open code, not a second one
    await call(ctxA, 'post', 'circle-invite', { familyId: famA, childId: kidA })
    expect((await call<{ invites: { familyId: string }[] }>(ctxA, 'get', 'circle-invite')).body.invites.filter((i) => i.familyId === famA)).toHaveLength(1)
    return mine!.token
  })

  await test.step('Dominique opens the code signed in: the page says whose circle it is; the family shows under « Ils t’ont invité »', async () => {
    const page = (await (await ctxB.request.get(`/api/r/${code}`)).json()) as { circle?: { hostName: string | null; hostChild: string } }
    expect(page.circle?.hostChild).toBe('Zia')
    const by = (await call<{ hosts: { hostName: string | null; hostChild: string; token: string; kind: string }[] }>(ctxB, 'get', 'invited-by')).body.hosts
    expect(by.some((h) => h.token === code && h.kind === 'circle')).toBe(true)
    const info = (await call<{ state: string; hostChild: string }>(ctxB, 'get', `link-invitation?code=${code}`)).body
    expect(info.hostChild).toBe('Zia')
    expect(info.state).not.toBe('mine')
  })

  await test.step('Dominique links: both households now list the other child in their circle, and the code is spent', async () => {
    expect((await call(ctxB, 'post', 'link-invitation', { code, childId: kidB })).status).toBeLessThan(300)
    const circleA = (await call<{ children: { child: { id: string }; linked: { childName: string; linkId: string }[] }[] }>(ctxA, 'get', 'circle')).body.children
    expect(circleA.find((c) => c.child.id === kidA)?.linked.map((l) => l.childName)).toContain('Tom')
    const circleB = (await call<{ children: { child: { id: string }; linked: { childName: string; linkId: string }[] }[] }>(ctxB, 'get', 'circle')).body.children
    expect(circleB.find((c) => c.child.id === kidB)?.linked.map((l) => l.childName)).toContain('Zia')
    expect(((await call<{ invites: unknown[] }>(ctxA, 'get', 'circle-invite')).body.invites)).toHaveLength(0)
    // each book gained the other family, marked as on the app
    const booksA = (await call<{ families: { linked_household_id: string | null }[] }>(ctxA, 'get', 'families')).body.families
    expect(booksA.some((f) => f.linked_household_id)).toBe(true)
  })

  await test.step('the link is cut from one side and both circles are empty again; the data stays with its owner', async () => {
    const circleA = (await call<{ children: { linked: { linkId: string }[] }[] }>(ctxA, 'get', 'circle')).body.children
    const linkId = circleA.flatMap((c) => c.linked)[0].linkId
    expect((await call(ctxA, 'delete', 'circle', { linkId })).status).toBeLessThan(300)
    expect((await call<{ children: { linked: unknown[] }[] }>(ctxA, 'get', 'circle')).body.children.flatMap((c) => c.linked)).toHaveLength(0)
    expect((await call<{ children: { linked: unknown[] }[] }>(ctxB, 'get', 'circle')).body.children.flatMap((c) => c.linked)).toHaveLength(0)
    expect((await call<{ families: unknown[] }>(ctxB, 'get', 'families')).status).toBe(200)
  })

  await ctxA.close()
  await ctxB.close()
})

test('the trial sandbox: opened with no account, usable at once, then kept as a real account', async ({ browser }) => {
  const ctx = await browser.newContext({ locale: 'fr-CA' })
  const trial = await ctx.request.post('/api/demo', { data: {} })
  expect(trial.status()).toBeLessThan(300)
  const me = (await call<{ signedIn: boolean; demo: boolean; mail: boolean }>(ctx, 'get', 'auth/me')).body
  expect(me).toMatchObject({ signedIn: true, demo: true })
  expect(me.mail).toBe(false) // a trial can send nothing
  const kids = (await call<{ children: unknown[] }>(ctx, 'get', 'children')).body.children
  expect(kids.length).toBeGreaterThan(0)
  const kept = await call(ctx, 'post', 'demo/claim', { email: `kept-${Date.now().toString(36)}@example.test`, password: 'correct-horse-battery-9', displayName: 'Gardée' })
  expect(kept.status).toBeLessThan(300)
  const after = (await call<{ signedIn: boolean; demo: boolean; displayName: string }>(ctx, 'get', 'auth/me')).body
  expect(after).toMatchObject({ signedIn: true, demo: false })
  expect((await call<{ children: unknown[] }>(ctx, 'get', 'children')).body.children.length).toBe(kids.length) // nothing was lost
  await ctx.close()
})
