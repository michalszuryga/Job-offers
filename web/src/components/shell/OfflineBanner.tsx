import { WifiOff } from 'lucide-react'
import { useSyncExternalStore } from 'react'
import { Icon } from '../ui'
import { useI18n } from '../../i18n'
import './OfflineBanner.css'

function subscribe(onChange: () => void) {
  addEventListener('online', onChange)
  addEventListener('offline', onChange)
  return () => {
    removeEventListener('online', onChange)
    removeEventListener('offline', onChange)
  }
}

const isOnline = () => navigator.onLine
const assumeOnline = () => true

// §4.4. A polite live region kept mounted, so the text is announced when it appears; no
// role=status, since a view's one status region belongs to its own content (§4.2).
export function OfflineBanner() {
  const { t } = useI18n()
  const online = useSyncExternalStore(subscribe, isOnline, assumeOnline)
  return (
    <div className="offline-banner" aria-live="polite">
      {!online && (
        <p className="offline-banner__text">
          <Icon icon={WifiOff} className="offline-banner__icon" />
          {t.offline.message}
        </p>
      )}
    </div>
  )
}
