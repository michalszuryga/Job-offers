import { lazy, Suspense } from 'react'
import { useI18n } from '../../i18n'
import { HOW_IT_WORKS_ID } from './anchors'

// The model itself (lib/score.ts and its formatting) is below the fold: its own chunk.
const ScoreModel = lazy(() => import('./ScoreModel').then((m) => ({ default: m.ScoreModel })))

// §4.2 "How the score works", the nav's "How it works" target.
export function HowScoreWorks() {
  const { t } = useI18n()
  const copy = t.landing.how
  return (
    <section id={HOW_IT_WORKS_ID} className="landing-section how" aria-labelledby="how-title">
      <div className="landing-section__head">
        <h2 id="how-title" className="landing-section__title">
          {copy.heading}
        </h2>
        <p className="landing-section__lead">{copy.intro}</p>
      </div>
      <Suspense fallback={<div className="how__pending" />}>
        <ScoreModel />
      </Suspense>
    </section>
  )
}
