// The Worker bindings. Optional ones are guarded at the handler entry (graceful
// degrade), never assumed present.

export interface Env {
  // D1 — required. Every household's state.
  DB: D1Database

  // HMAC key for the session cookie + the CSRF pair. Validated ≥ 32 chars at use
  // (auth.ts): encoding `undefined` would be a publicly known key.
  SESSION_SECRET?: string

  // OPTIONAL R2 bucket for souvenir photos (_lib/photos.ts). Unset: the photo doors 503 and
  // the UI hides them; everything else works.
  PHOTOS?: R2Bucket

  // Signup gate (_lib/signupGate.ts): SIGNUP_OPEN = "1" opens it; otherwise INVITE_CODE,
  // when set, is asked for; neither → open (local dev).
  SIGNUP_OPEN?: string
  INVITE_CODE?: string

  // OPTIONAL outbound email (_lib/mail.ts, Resend's REST API). Both unset → nothing is
  // ever sent: invites are copy-link only and the reminder checkbox hides.
  RESEND_API_KEY?: string
  MAIL_FROM?: string
  // OPTIONAL: the Svix signing secret of the Resend webhook (`whsec_…`). Unset → /api/resend-webhook answers 503 and the
  // « courriel non reçu » mark never appears; nothing else changes.
  RESEND_WEBHOOK_SECRET?: string

  // OPTIONAL rate-limit bindings (wrangler.toml [[ratelimits]]). Unset → allow.
  LIMIT_IP?: RateLimit
  LIMIT_KEY?: RateLimit

  APP_NAME?: string
  // 'development' only in .dev.vars: skips the force-HTTPS redirect locally.
  ENVIRONMENT?: string
}

// The context a handler receives: the Pages-Functions shape, which worker/index.ts
// adapts a Worker request into. Handlers only ever read request / env / params.
export type Ctx = EventContext<Env, string, Record<string, never>>
