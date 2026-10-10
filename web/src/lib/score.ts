// Score bands (plan §2.3). Fixed product constants that match the Min score presets.
export type ScoreBand = 'top' | 'strong' | 'fair' | 'low' | 'none'

// Lowest score in each band; anything below `fair` is `low`.
export const BAND_THRESHOLDS = { top: 80, strong: 65, fair: 50 } as const

export function scoreBand(score: number | null): ScoreBand {
  if (score == null || Number.isNaN(score)) return 'none'
  // Banded on the rounded value so the colour always agrees with the number shown.
  const value = Math.round(score)
  if (value >= BAND_THRESHOLDS.top) return 'top'
  if (value >= BAND_THRESHOLDS.strong) return 'strong'
  if (value >= BAND_THRESHOLDS.fair) return 'fair'
  return 'low'
}
