import { forbidden, ok, serviceUnavailable, tooManyRequests, serverError } from '../_lib/json'
import { authed } from '../_lib/route'
import { overAuthLimit } from '../_lib/rateLimit'
import { mailEnabled, sendMail } from '../_lib/mail'
import { mailLang } from '../_lib/lang'
import { updateMail } from '../_lib/mailCopy'
import { isDemoEmail } from '../_lib/demo'

// « Courriel d'essai » — POST /api/test-mail. Sends ONE sample email, in the shape of the real ones (an update to a
// rencontre), to the signed-in parent's own address and nobody else's, so the person can see what the families
// will receive before any family receives anything. Limited to a few a day per parent.
export const onRequestPost = authed(async (ctx, actor) => {
  if (isDemoEmail(actor.email)) return forbidden('Pas dans l’essai : crée ton compte d’abord.')
  if (!mailEnabled(ctx.env)) return serviceUnavailable('Les courriels ne sont pas branchés.')
  if (await overAuthLimit(ctx.env, ctx.request, `test-mail:${actor.email}`)) return tooManyRequests()
  const origin = new URL(ctx.request.url).origin
  const lang = mailLang(null, ctx.request)
  const lines = lang === 'en' ? ['Place: Park → Our place', 'Start: Saturday 10 am → Saturday 11 am'] : ['Lieu : Parc → Chez nous', 'Début : samedi 10 h → samedi 11 h']
  const title = lang === 'en' ? 'At the park, Saturday 10 am' : 'Au parc, samedi 10 h'
  try {
    await sendMail(ctx.env, { to: actor.email, ...updateMail(lang, { parent: actor.displayName, host: actor.displayName, title, lines, link: `${origin}/lune-miel`, sample: true }) })
  } catch (err) {
    console.error('[mail] test', err)
    return serverError('Le courriel n’est pas parti. Réessaie plus tard.')
  }
  return ok({ to: actor.email })
})
