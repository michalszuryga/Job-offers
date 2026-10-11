import { Logo, Skeleton, SkeletonCard } from '../ui'
import { useI18n } from '../../i18n'
import './AppBar.css'
import './BootSkeleton.css'

const CARDS = [0, 1, 2, 3]

// Card silhouettes where the list will be. The grey shapes are hidden from assistive tech;
// the label says what is loading, once.
export function ListSkeleton({ label }: { label: string }) {
  return (
    <div className="list-skeleton" aria-busy="true">
      <p className="visually-hidden">{label}</p>
      {CARDS.map((card) => (
        <SkeletonCard key={card} />
      ))}
    </div>
  )
}

// One placeholder from first paint until the list (§4.3), in place of the "Loading…" and
// "Checking access…" lines. Markup and CSS only, so P8 can put it in the static HTML too.
export function BootSkeleton() {
  const { t } = useI18n()
  return (
    <div className="boot-skeleton">
      <div className="app-bar" aria-hidden="true">
        <Logo decorative />
        <Skeleton shape="circle" width="var(--control-h)" />
      </div>
      <ListSkeleton label={t.common.loading} />
    </div>
  )
}
