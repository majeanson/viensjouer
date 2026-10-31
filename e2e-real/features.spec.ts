import { expect, test } from '@playwright/test'
import { PASSWORD, PNG, addressOf, call, csrf, inDays, signup, type Detail } from './helpers'

// One host, one real stack, every feature that does not need a second account, through the real API with a real session: sign-in and
// out, password, groups, the shared home card, bring, the notes back, thanks, photos, notifications, places, the calendar feed, an open
// window and its answer, the other parent, the data export and erasing it all. Each step names what a person would do.
test('one host, every feature, on the real stack', async ({ browser }) => {
  test.setTimeout(240_000)
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'fr-CA' })
  const guest = await browser.newContext({ locale: 'fr-CA' }) // a parent with no account: only the links
  const host = 'Hugo'
  const email = await signup(ctx, host, 'feat')

  const kid = (await call<{ id: string }>(ctx, 'post', 'children', { firstName: 'Noé', birthdate: '2023-05-01' })).body.id
  const fam = async (child: string, parent: string, mail?: string) => (await call<{ id: string }>(ctx, 'post', 'families', { childFirstName: child, parentName: parent, ...(mail ? { email: mail } : {}) })).body.id
  const lea = await fam('Léa', 'Julie', 'julie@example.test')
  const max = await fam('Max', 'Paul')

  await test.step('sign out, sign in with the right password, refuse the wrong one, and say nothing about which addresses exist', async () => {
    expect((await call(ctx, 'post', 'auth/logout')).status).toBe(200)
    expect((await call<{ signedIn: boolean }>(ctx, 'get', 'auth/me')).body.signedIn).toBe(false)
    const wrong = await ctx.request.post('/api/auth/login', { data: { email, password: 'not-the-password' } })
    const unknown = await ctx.request.post('/api/auth/login', { data: { email: addressOf('nobody'), password: 'not-the-password' } })
    expect(wrong.status()).toBe(unknown.status())
    expect(await wrong.text()).toBe(await unknown.text())
    const right = await ctx.request.post('/api/auth/login', { data: { email, password: PASSWORD } })
    expect(right.status()).toBe(200)
    expect((await call<{ displayName: string }>(ctx, 'get', 'auth/me')).body.displayName).toBe(host)
  })

  await test.step('the forgotten-password door answers the same for any address (and says plainly when no mail is wired, as here)', async () => {
    const mine = await ctx.request.post('/api/auth/forgot', { data: { email } })
    const other = await ctx.request.post('/api/auth/forgot', { data: { email: addressOf('ghost') } })
    expect([200, 503]).toContain(mine.status()) // 503: this local stack has no email service
    expect(other.status()).toBe(mine.status())
    expect(await other.text()).toBe(await mine.text())
  })

  await test.step('groups: made, renamed, given other members, removed', async () => {
    const g = (await call<{ id: string }>(ctx, 'post', 'groups', { name: 'La garderie', families: [lea] })).body.id
    let list = (await call<{ groups: { id: string; name: string; families: string[] }[] }>(ctx, 'get', 'groups')).body.groups
    expect(list.find((x) => x.id === g)?.families).toEqual([lea])
    await call(ctx, 'patch', 'groups', { id: g, name: 'Les cousins', families: [lea, max] })
    list = (await call<{ groups: { id: string; name: string; families: string[] }[] }>(ctx, 'get', 'groups')).body.groups
    expect(list.find((x) => x.id === g)).toMatchObject({ name: 'Les cousins' })
    expect(list.find((x) => x.id === g)!.families.sort()).toEqual([lea, max].sort())
    await call(ctx, 'delete', 'groups', { id: g })
    expect(((await call<{ groups: { id: string }[] }>(ctx, 'get', 'groups')).body.groups).some((x) => x.id === g)).toBe(false)
  })

  await test.step('the home card is written once and read back', async () => {
    expect((await call<{ card: unknown }>(ctx, 'get', 'home-card')).body.card).toBeNull()
    const put = await call(ctx, 'put', 'home-card', { dog: true, pool: false, screens: 'little', nutFree: true, note: 'Chaussons à l’entrée' })
    expect(put.status).toBe(200)
    expect((await call<{ card: { dog: boolean; nutFree: boolean; note: string } }>(ctx, 'get', 'home-card')).body.card).toMatchObject({ dog: true, nutFree: true, note: 'Chaussons à l’entrée' })
  })

  // A rencontre at home, a few hours ago: the day has started, so the thanks, the notes back and the photos are open.
  const made = (await call<{ id: string }>(ctx, 'post', 'encounters', { childId: kid, kind: 'home', title: 'Goûter chez nous', startsAt: Math.floor(Date.now() / 1000) - 3 * 3600, place: 'Chez nous', scope: 'family', invite: [lea, max], details: { planB: 'Dans le salon' } })).body.id
  const detail = async () => (await call<Detail>(ctx, 'get', `encounters?id=${made}`)).body
  let d = await detail()
  const forLea = d.invitations.find((i) => i.friend_family_id === lea)!
  const forMax = d.invitations.find((i) => i.friend_family_id === max)!

  await test.step('a family answers from its link; the host is told, reads it, and marks it read', async () => {
    const page = (await guest.request.get(`/api/r/${forLea.token}`)).status()
    expect(page).toBe(200)
    expect((await guest.request.post(`/api/r/${forLea.token}`, { data: { reply: 'yes', parentName: 'Julie' } })).status()).toBe(200)
    d = await detail()
    expect(d.invitations.find((i) => i.id === forLea.id)?.reply).toBe('yes')
    const n = (await call<{ notifications: { id: string; kind: string }[] }>(ctx, 'get', 'notifications')).body.notifications
    expect(n.length).toBeGreaterThan(0)
    await call(ctx, 'post', 'notifications', { id: n[0].id })
    expect(((await call<{ notifications: { id: string }[] }>(ctx, 'get', 'notifications')).body.notifications).some((x) => x.id === n[0].id)).toBe(false)
    const all = (await call<{ notifications: { id: string; read_at: number | null }[] }>(ctx, 'get', 'notifications?all=1')).body.notifications
    expect(all.find((x) => x.id === n[0].id)?.read_at).toBeTruthy()
    await call(ctx, 'post', 'notifications', { readAll: true })
    expect(((await call<{ notifications: unknown[] }>(ctx, 'get', 'notifications')).body.notifications)).toHaveLength(0)
  })

  await test.step('a new two-word link while nobody has answered; the host notes an answer given in person, and then the words stay', async () => {
    expect((await call(ctx, 'patch', 'invitations', { id: forMax.id, newCode: true })).status).toBe(200)
    const fresh = (await detail()).invitations.find((i) => i.id === forMax.id)!
    expect(fresh.token).not.toBe(forMax.token)
    expect((await guest.request.get(`/api/r/${forMax.token}`)).status()).toBe(404)
    expect((await guest.request.get(`/api/r/${fresh.token}`)).status()).toBe(200)
    expect((await call(ctx, 'patch', 'invitations', { id: forMax.id, reply: 'maybe' })).status).toBe(200)
    expect((await detail()).invitations.find((i) => i.id === forMax.id)?.reply).toBe('maybe')
    expect((await call(ctx, 'patch', 'invitations', { id: forMax.id, scope: 'friend' })).status).toBe(200)
    expect((await call(ctx, 'patch', 'invitations', { id: forMax.id, newCode: true })).status).toBe(400) // answered: the words no longer change
  })

  await test.step('what to bring: the host adds, the family takes and lets go, the host sees who', async () => {
    const item = (await call<{ id: string }>(ctx, 'post', 'bring', { encounter: made, label: 'la collation' })).body.id
    expect((await guest.request.post(`/api/r/${forLea.token}/bring`, { data: { claim: item } })).status()).toBe(200)
    expect((await detail()).bring.find((b) => b.id === item)?.claimed_label).toBe('Julie')
    expect((await guest.request.post(`/api/r/${forLea.token}/bring`, { data: { release: item } })).status()).toBe(200)
    expect((await detail()).bring.find((b) => b.id === item)?.claimed_label).toBeNull()
    expect((await guest.request.post(`/api/r/${forLea.token}/bring`, { data: { add: 'des fruits' } })).status()).toBe(201)
    expect((await detail()).bring.map((b) => b.label)).toEqual(expect.arrayContaining(['la collation', 'des fruits']))
    await call(ctx, 'delete', 'bring', { id: item })
    expect((await detail()).bring.map((b) => b.label)).not.toContain('la collation')
  })

  await test.step('the board: the host writes and pins, the family writes, each removes only its own', async () => {
    const m1 = (await call<{ id: string }>(ctx, 'post', 'messages', { encounterId: made, text: 'On sonne à la porte bleue' })).body.id
    expect((await call(ctx, 'patch', 'messages', { id: m1, pinned: true })).status).toBe(200)
    expect((await guest.request.post(`/api/r/${forLea.token}`, { data: { message: 'Merci, on arrive' } })).status()).toBe(200)
    const msgs = (await detail()).messages
    expect(msgs.find((m) => m.id === m1)?.pinned).toBeTruthy()
    const theirs = msgs.find((m) => m.text === 'Merci, on arrive')!
    expect((await call(ctx, 'delete', 'messages', { id: theirs.id })).status).toBe(200)
    expect((await detail()).messages.some((m) => m.text === 'Merci, on arrive')).toBe(false)
  })

  await test.step('a note back to the family after the drop-off, which the family then reads', async () => {
    expect((await call(ctx, 'post', 'relais', { invitationId: forLea.id, nap: '13 h à 14 h 30', ate: 'tout', mood: 'content', note: 'Très bien' })).status).toBe(200)
    expect((await detail()).relais.find((r) => r.invitation_id === forLea.id)?.nap).toBe('13 h à 14 h 30')
    const card = (await (await guest.request.get(`/api/r/${forLea.token}`)).json()) as { relais: { nap: string } | null; homeCard: { dog: boolean } | null }
    expect(card.relais?.nap).toBe('13 h à 14 h 30')
    expect(card.homeCard?.dog).toBe(true) // the home card rides on the invitation to a home rencontre
    expect((await call(ctx, 'delete', 'relais', { invitationId: forLea.id })).status).toBe(200)
  })

  await test.step('photos of the day: the host adds one, the family adds one, both are served and removable', async () => {
    const mine = await ctx.request.post(`/api/souvenirs?encounter=${made}`, { data: PNG, headers: { 'content-type': 'image/png', 'x-csrf-token': await csrf(ctx) } })
    expect(mine.status()).toBe(201)
    const theirs = await guest.request.post(`/api/r/${forLea.token}/photo`, { data: PNG, headers: { 'content-type': 'image/png' } })
    expect(theirs.status()).toBe(201)
    const list = (await call<{ souvenirs?: { id: string }[] } | { id: string }[]>(ctx, 'get', `souvenirs?encounter=${made}`)).body
    const rows = (Array.isArray(list) ? list : (list.souvenirs ?? [])) as { id: string }[]
    expect(rows.length).toBe(2)
    expect((await ctx.request.get(`/api/souvenirs/${rows[0].id}`)).status()).toBe(200)
    expect((await guest.request.get(`/api/r/${forLea.token}/photo/${rows[0].id}`)).status()).toBe(200)
    expect((await call(ctx, 'delete', 'souvenirs', { id: rows[0].id })).status).toBe(200)
  })

  await test.step('« dire merci » goes once into the thread', async () => {
    const thanks = await call<{ sent?: number }>(ctx, 'post', 'thanks', { encounter: made, text: 'Merci d’être venus !' })
    expect(thanks.status).toBe(200)
    expect((await detail()).messages.some((m) => m.text.includes('Merci d’être venus'))).toBe(true)
    expect((await call(ctx, 'post', 'thanks', { encounter: made, text: 'Encore' })).status).toBeGreaterThanOrEqual(400) // only once
  })

  await test.step('places remembered: where we met before comes back first', async () => {
    const places = (await call<{ places: { place: string }[] }>(ctx, 'get', 'places')).body.places
    expect(places.map((p) => p.place)).toContain('Chez nous')
  })

  await test.step('the calendar feed: a secret link, real calendar text, a new link kills the old one, switched off it is gone', async () => {
    expect((await call<{ token: string | null }>(ctx, 'get', 'cal-link')).body.token).toBeNull()
    const t1 = (await call<{ token: string }>(ctx, 'post', 'cal-link', {})).body.token
    const feed = await guest.request.get(`/api/feed/${t1}`)
    expect(feed.status()).toBe(200)
    const text = await feed.text()
    expect(text).toContain('BEGIN:VCALENDAR')
    expect(text).toContain('Goûter chez nous')
    const t2 = (await call<{ token: string }>(ctx, 'post', 'cal-link', {})).body.token
    expect(t2).not.toBe(t1)
    expect((await guest.request.get(`/api/feed/${t1}`)).status()).toBe(404)
    expect((await guest.request.get(`/api/feed/${t2}`)).status()).toBe(200)
    await call(ctx, 'delete', 'cal-link')
    expect((await guest.request.get(`/api/feed/${t2}`)).status()).toBe(404)
  })

  await test.step('an open window: offered to a family, answered from its link, seen by the host, removed', async () => {
    const w = await call<{ id: string }>(ctx, 'post', 'windows', { childId: kid, startsAt: inDays(2, 13), endsAt: inDays(2, 16), note: 'Parc ou chez nous', families: [lea] })
    expect(w.status).toBe(201)
    let wins = (await call<{ windows: { id: string; targets: { token: string; reply: string | null }[] }[] }>(ctx, 'get', 'windows')).body.windows
    const mine = wins.find((x) => x.id === w.body.id)!
    const token = mine.targets[0].token
    expect((await guest.request.get(`/api/w/${token}`)).status()).toBe(200)
    expect((await guest.request.post(`/api/w/${token}`, { data: { reply: 'yes', note: 'Avec plaisir' } })).status()).toBe(200)
    wins = (await call<{ windows: { id: string; targets: { reply: string | null }[] }[] }>(ctx, 'get', 'windows')).body.windows as typeof wins
    expect(wins.find((x) => x.id === w.body.id)!.targets[0].reply).toBe('yes')
    const calendar = (await call<{ items: { type: string }[] }>(ctx, 'get', 'calendar')).body.items
    expect(calendar.some((i) => i.type === 'window')).toBe(true)
    await call(ctx, 'delete', 'windows', { id: w.body.id })
    expect((await guest.request.get(`/api/w/${token}`)).status()).toBeGreaterThanOrEqual(400)
  })

  await test.step('the page of a rencontre can be changed, postponed and cancelled, and the family sees the change', async () => {
    expect((await call(ctx, 'patch', 'encounters', { id: made, place: 'Au parc' })).status).toBe(200)
    const card = (await (await guest.request.get(`/api/r/${forLea.token}`)).json()) as { changes: { field: string }[]; encounter: { place: string } }
    expect(card.encounter.place).toBe('Au parc')
    expect(card.changes.some((c) => c.field === 'place')).toBe(true)
    expect((await call(ctx, 'patch', 'encounters', { id: made, status: 'postponed', reason: 'Il pleut' })).status).toBe(200)
    expect((await detail()).encounter.status).toBe('postponed')
    expect((await call(ctx, 'patch', 'encounters', { id: made, status: 'cancelled' })).status).toBe(200)
    expect((await detail()).encounter.status).toBe('cancelled')
    const gone = (await (await guest.request.get(`/api/r/${forLea.token}`)).json()) as { encounter: { status: string } }
    expect(gone.encounter.status).toBe('cancelled')
  })

  await test.step('a repeating rencontre is a series, and « toute la série » moves every date', async () => {
    const s = await call<{ ids: string[] }>(ctx, 'post', 'encounters', { childId: kid, kind: 'park', title: 'Le parc du mardi', startsAt: inDays(3, 10), startsAtList: [inDays(3, 10), inDays(10, 10), inDays(17, 10)], place: 'Parc Lafontaine', scope: 'family', invite: [lea] })
    expect(s.body.ids).toHaveLength(3)
    expect((await call(ctx, 'patch', 'encounters', { id: s.body.ids[0], series: true, title: 'Le parc du mercredi' })).status).toBe(200)
    const titles = await Promise.all(s.body.ids.map(async (id) => ((await call<Detail & { encounter: { title: string } }>(ctx, 'get', `encounters?id=${id}`)).body.encounter as { title: string }).title))
    expect(titles).toEqual(['Le parc du mercredi', 'Le parc du mercredi', 'Le parc du mercredi'])
  })

  await test.step('the other parent joins the same household with their own address and password, and sees the same children', async () => {
    const invite = (await call<{ token?: string; id?: string }>(ctx, 'post', 'parent-invite', {})).body
    const open = (await call<{ invites: { id: string; token: string }[] }>(ctx, 'get', 'parent-invite')).body.invites
    const token = invite.token ?? open[0].token
    const other = await browser.newContext({ locale: 'fr-CA' })
    expect((await other.request.get(`/api/join?t=${token}`)).status()).toBe(200)
    const joined = await other.request.post('/api/join', { data: { token, displayName: 'Hélène', email: addressOf('Helene', 'feat'), password: PASSWORD } })
    expect(joined.status()).toBe(201)
    const kids = (await call<{ children: { first_name: string }[] }>(other, 'get', 'children')).body.children.map((c) => c.first_name)
    expect(kids).toContain('Noé')
    expect((await other.request.post('/api/join', { data: { token, displayName: 'X', email: addressOf('X', 'feat'), password: PASSWORD } })).status()).toBeGreaterThanOrEqual(400) // spent
    await other.close()
  })

  await test.step('the password changes: the old one stops working, the new one signs in', async () => {
    expect((await call(ctx, 'post', 'password', { current: 'wrong-current', next: 'another-long-password-1' })).status).toBeGreaterThanOrEqual(400)
    expect((await call(ctx, 'post', 'password', { current: PASSWORD, next: 'another-long-password-1' })).status).toBe(200)
    const fresh = await browser.newContext({ locale: 'fr-CA' })
    expect((await fresh.request.post('/api/auth/login', { data: { email, password: PASSWORD } })).status()).toBeGreaterThanOrEqual(400)
    expect((await fresh.request.post('/api/auth/login', { data: { email, password: 'another-long-password-1' } })).status()).toBe(200)
    await fresh.close()
  })

  await test.step('the whole export holds what was made, and « tout effacer » removes the household for good', async () => {
    const exported = JSON.stringify((await call(ctx, 'get', 'export')).body)
    for (const word of ['Goûter chez nous', 'Le parc du mercredi', 'Léa', 'Noé']) expect(exported).toContain(word)
    expect((await call(ctx, 'delete', 'household', { password: 'wrong-password-here' })).status).toBeGreaterThanOrEqual(400)
    expect((await call(ctx, 'delete', 'household', { password: 'another-long-password-1' })).status).toBe(200)
    expect((await guest.request.get(`/api/r/${forLea.token}`)).status()).toBe(404) // the links died with it
    expect((await call<{ signedIn: boolean }>(ctx, 'get', 'auth/me')).body.signedIn).toBe(false)
  })

  await ctx.close()
  await guest.close()
})
