import { FlaskConical } from 'lucide-react'
import { Icon } from '../ui'
import { useI18n } from '../../i18n'
import './DemoBanner.css'

// On every demo screen (§4.11), under the app bar: what this is, so sample offers are never
// taken for real ones. Plain text, not a live region: it is there from the first paint.
export function DemoBanner() {
  const { t } = useI18n()
  return (
    <p className="demo-banner">
      <Icon icon={FlaskConical} className="demo-banner__icon" />
      {t.demo.banner}
    </p>
  )
}
