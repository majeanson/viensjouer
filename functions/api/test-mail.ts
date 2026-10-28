import { forbidden, ok, serviceUnavailable, tooManyRequests, serverError } from '../_lib/json'
import { authed } from '../_lib/route'
import { overAuthLimit } from '../_lib/rateLimit'
import { escapeHtml, mailEnabled, sendMail } from '../_lib/mail'
import { isDemoEmail } from '../_lib/demo'

// « Courriel d'essai » — POST /api/test-mail. Sends ONE sample email, in the shape of the real ones (an update to a
// rencontre), to the signed-in parent's own address and nobody else's, so the person can see what the families
// will receive before any family receives anything. Limited to a few a day per parent.
export const onRequestPost = authed(async (ctx, actor) => {
  if (isDemoEmail(actor.email)) return forbidden('Pas dans l’essai : crée ton compte d’abord.')
  if (!mailEnabled(ctx.env)) return serviceUnavailable('Les courriels ne sont pas branchés.')
  if (await overAuthLimit(ctx.env, ctx.request, `test-mail:${actor.email}`)) return tooManyRequests()
  const origin = new URL(ctx.request.url).origin
  const name = actor.displayName
  const lines = ['Lieu : Parc → Chez nous', 'Début : samedi 10 h → samedi 11 h']
  try {
    await sendMail(ctx.env, {
      to: actor.email,
      subject: 'Mise à jour : Au parc, samedi 10 h (courriel d’essai)',
      text: `Bonjour ${name},\n\nCeci est un courriel d’essai : voici ce que recevront les familles quand tu modifies une rencontre.\n\n${name} a modifié « Au parc, samedi 10 h » :\n- ${lines.join('\n- ')}\n\nLa page de la rencontre (tu peux y changer ta réponse) :\n${origin}/lune-miel\n\n— Viens jouer`,
      html: `<p>Bonjour ${escapeHtml(name)},</p><p><em>Ceci est un courriel d’essai : voici ce que recevront les familles quand tu modifies une rencontre.</em></p><p>${escapeHtml(name)} a modifié <strong>« Au parc, samedi 10 h »</strong> :</p><ul>${lines.map((l) => `<li>${escapeHtml(l)}</li>`).join('')}</ul><p><a href="${origin}/lune-miel">La page de la rencontre</a> (tu peux y changer ta réponse).</p><p>— Viens jouer</p>`,
    })
  } catch (err) {
    console.error('[mail] test', err)
    return serverError('Le courriel n’est pas parti. Réessaie plus tard.')
  }
  return ok({ to: actor.email })
})
