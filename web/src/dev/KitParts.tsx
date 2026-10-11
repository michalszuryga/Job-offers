import type { ReactNode } from 'react'
import { cx } from '../components/ui'

interface SectionProps {
  id: string
  title: string
  // What the family is for, in a sentence.
  lede?: ReactNode
  children: ReactNode
}

// One component family: an h2 and its use, then a panel of specimens.
export function Section({ id, title, lede, children }: SectionProps) {
  const titleId = `${id}-title`
  return (
    <section id={id} className="kit-section" aria-labelledby={titleId}>
      <div className="kit-section__head">
        <h2 id={titleId} className="kit-section__title">
          {title}
        </h2>
        {lede && <p className="kit-section__lede">{lede}</p>}
      </div>
      <div className="kit-panel">{children}</div>
    </section>
  )
}

interface SpecimenProps {
  label: string
  // row: items side by side, wrapping; grid: equal columns (fields); stack: one per line.
  layout?: 'row' | 'grid' | 'stack'
  className?: string
  children: ReactNode
}

// One variant or state of a component, under a small h3.
export function Specimen({ label, layout = 'row', className, children }: SpecimenProps) {
  return (
    <div className={cx('kit-specimen', className)}>
      <h3 className="kit-specimen__label">{label}</h3>
      <div className={cx('kit-specimen__body', `kit-specimen__body--${layout}`)}>{children}</div>
    </div>
  )
}

// A single example with a caption under it, e.g. "Loading" under a button.
export function Example({ caption, children }: { caption: string; children: ReactNode }) {
  return (
    <figure className="kit-example">
      <div className="kit-example__item">{children}</div>
      <figcaption className="kit-example__caption">{caption}</figcaption>
    </figure>
  )
}
