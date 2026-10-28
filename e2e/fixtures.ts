// Shared fixtures for the stubbed browser specs: one place for the shape of a family, an invitation and a
// rencontre, so a change to an API shape is fixed once instead of in every spec.
export const now = Math.floor(Date.now() / 1000)
export const soon = now + 2 * 86_400
export const child = { id: 'c1', first_name: 'Noé', birthdate: null, colour: '#e8922a', position: 0 }
export const fam = (id: string, kid: string, parent: string, over: Record<string, unknown> = {}) => ({ id, parent_name: parent, email: null, phone: null, child_first_name: kid, child_birthdate: null, allergies: null, notes: null, linked_household_id: null, ...over })
export const inv = (id: string, fid: string, kid: string, parent: string, reply: string | null, over: Record<string, unknown> = {}) => ({
  id, friend_family_id: fid, token: `tok-${id}`, reply, reply_note: null, reply_at: null, sent_at: null, parent_name: parent, child_first_name: kid, email: null, allergies: null, adults: null, kids: null, scope: 'family', ...over,
})
export const enc = (over: Record<string, unknown> = {}) => ({ id: 'e1', child_id: 'c1', kind: 'park', title: 'Au parc', starts_at: soon, ends_at: null, place: 'Parc Lafontaine', address: null, map_url: null, note: null, status: 'proposed', series_id: null, details: {}, hereOpen: false, ...over })
export const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')
