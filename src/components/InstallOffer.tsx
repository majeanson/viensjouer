import { useEffect, useState } from 'react'
import { useT } from '../i18n'
import { useInstall } from '../lib/install'
import { bumpVisits, dismiss, isDismissed, readVisits, shouldOffer, writeVisits } from '../lib/installPrompt'
import { Icon } from './Icon'

// One calm card for a host who has opened the app on three different days: keep it on the home screen. Android and desktop
// Chrome hand us a prompt to fire (lib/install.ts, the same one the account page uses); iPhone has none, so it says where
// the button is. « Plus tard » is final. Nothing useful to offer (an installed app, a browser with neither): nothing shown.
export function InstallOffer({ hold = false }: { hold?: boolean }) {
  const t = useT()
  const inst = useInstall()
  const [show, setShow] = useState(false)
  useEffect(() => {
    const v = bumpVisits(readVisits(), new Date().toISOString().slice(0, 10))
    writeVisits(v)
    setShow(shouldOffer(v, isDismissed(), inst.installed))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  if (hold || !show || (!inst.canPrompt && !inst.ios)) return null
  const later = () => {
    dismiss()
    setShow(false)
  }
  return (
    <div className="notice" role="status">
      <span><Icon name="home" />{inst.ios ? t.install.ios : t.install.offer}</span>
      <div className="cluster">
        {inst.canPrompt && <button type="button" className="btn btn--small btn--primary" onClick={() => void inst.install().then(later)}>{t.install.button}</button>}
        <button type="button" className="btn btn--small" onClick={later}>{t.install.later}</button>
      </div>
    </div>
  )
}
