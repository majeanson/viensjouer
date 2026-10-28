// The message board's limits, pure so a test can hold them.
export const MAX_MESSAGES = 300
export const MAX_PINNED = 3

// A family takes back only what it wrote itself.
export const canDeleteOwn = (m: { invitation_id: string | null }, invitationId: string): boolean => m.invitation_id !== null && m.invitation_id === invitationId
