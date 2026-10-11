import { useMemo, type Ref } from 'react'
import { Select, type SelectGroup } from '../../components/ui'
import { useI18n } from '../../i18n'
import { isStatus, STATUS_GROUPS } from '../../lib/status'
import type { Status } from '../../lib/types'

interface Props {
  status: Status | null
  onChange: (status: Status) => void
  className?: string
  ref?: Ref<HTMLSelectElement>
}

// The offer's status, written as soon as it is picked (§4.9): no Save. Labelled "Status" for
// screen readers; where it sits (the details header, the phone action bar) says the rest.
export function StatusSelect({ status, onChange, className, ref }: Props) {
  const { t } = useI18n()
  const options = useMemo<SelectGroup[]>(
    () =>
      STATUS_GROUPS.map((group) => ({
        label: t.statusGroups[group.key],
        options: group.statuses.map((value) => ({ value, label: t.status[value] })),
      })),
    [t],
  )
  return (
    <Select
      ref={ref}
      label={t.details.status}
      hideLabel
      className={className}
      options={options}
      value={status ?? 'TO_REVIEW'}
      onChange={(event) => {
        if (isStatus(event.target.value)) onChange(event.target.value)
      }}
    />
  )
}
