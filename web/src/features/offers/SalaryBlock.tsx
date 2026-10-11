import { CircleCheck, CircleMinus } from 'lucide-react'
import { Icon } from '../../components/ui'
import { useI18n } from '../../i18n'
import { formatApproxMonthly, formatNumber, formatSalary } from '../../lib/format'
import type { SalaryConfig } from '../../lib/salary'
import type { Offer } from '../../lib/types'
import type { Threshold } from './match'
import './SalaryBlock.css'

interface Props {
  offer: Offer
  salaryCfg: SalaryConfig
  // From the offer's salary_assessment, once the details have loaded; null meanwhile or when
  // the salary couldn't be compared.
  threshold: Threshold | null
}

// The range as listed, the monthly PLN estimate unless it is already PLN a month, and how it
// compares with the threshold the score used (§4.8).
export function SalaryBlock({ offer, salaryCfg, threshold }: Props) {
  const { t, lang } = useI18n()
  const salary = formatSalary(offer, lang)
  const approx = salary ? formatApproxMonthly(offer, lang, salaryCfg) : null
  const amount = threshold ? formatNumber(threshold.threshold, lang) : ''

  return (
    <div className="salary-block">
      <p className={salary ? 'salary-block__amount' : 'salary-block__none'}>{salary || t.salary.notListed}</p>
      {approx && <p className="salary-block__estimate">{t.salary.estimated(approx)}</p>}
      {threshold && (
        <p className={threshold.above ? 'salary-block__threshold salary-block__threshold--above' : 'salary-block__threshold'}>
          {/* The words carry it; the icon only repeats them. */}
          <Icon icon={threshold.above ? CircleCheck : CircleMinus} className="salary-block__icon" />
          {threshold.above ? t.salary.above(amount) : t.salary.below(amount)}
        </p>
      )}
    </div>
  )
}
