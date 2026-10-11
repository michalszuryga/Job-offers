import type { CSSProperties } from 'react'
import { cx } from './cx'
import './Skeleton.css'

export type SkeletonShape = 'block' | 'line' | 'circle'

interface Props {
  shape?: SkeletonShape
  // CSS lengths; numbers are px. A circle takes `width` for both sides.
  width?: number | string
  height?: number | string
  className?: string
}

// Placeholder shapes, hidden from assistive tech: the loading view announces itself once
// (e.g. aria-busy plus a visually hidden "Loading…"), not once per grey bar.
export function Skeleton({ shape = 'line', width, height, className }: Props) {
  const style: CSSProperties = { inlineSize: width, blockSize: shape === 'circle' ? width : height }
  return <span className={cx('ui-skeleton', `ui-skeleton--${shape}`, className)} style={style} aria-hidden="true" />
}

// The OfferCard silhouette (§4.5): ring in column 1, then title + age, meta, salary + pill.
// Rows take the real line heights so swapping in the cards shifts nothing.
export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div className={cx('ui-skeleton-card', className)} aria-hidden="true">
      <Skeleton shape="circle" width={44} />
      <div className="ui-skeleton-card__body">
        <div className="ui-skeleton-card__row ui-skeleton-card__row--title">
          <Skeleton width="68%" />
          <Skeleton width={32} height={10} />
        </div>
        <div className="ui-skeleton-card__row ui-skeleton-card__row--meta">
          <Skeleton width="54%" height={10} />
        </div>
        <div className="ui-skeleton-card__row ui-skeleton-card__row--salary">
          <Skeleton width="36%" height={10} />
          <Skeleton shape="block" width={72} height={20} className="ui-skeleton-card__pill" />
        </div>
      </div>
    </div>
  )
}
