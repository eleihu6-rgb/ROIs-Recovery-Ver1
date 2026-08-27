import { useEffect } from 'react'
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@rois/ui'
import { useRosterPeriodStore } from '@/stores/roster-period-store'

interface RpSelectProps {
  value: string
  onValueChange: (id: string) => void
  testId: string
  placeholder?: string
  disabled?: boolean
  ariaLabel?: string
  /** Applied to the SelectTrigger (sizing/typography). */
  className?: string
}

/**
 * Shared single-select roster-period dropdown. Items + loading come from
 * roster-period-store (GET /api/roster-periods); the store is fetched once and
 * cached, so multiple RpSelects reuse the same list. The parent owns the selected
 * value and the default-selection policy (isCurrent / date-match).
 */
export function RpSelect({ value, onValueChange, testId, placeholder, disabled, ariaLabel, className }: RpSelectProps) {
  const items = useRosterPeriodStore((s) => s.items)
  const loading = useRosterPeriodStore((s) => s.loading)
  const load = useRosterPeriodStore((s) => s.loadRosterPeriods)
  useEffect(() => {
    void load()
  }, [load])

  return (
    <Select value={value} onValueChange={onValueChange} disabled={disabled || loading || items.length === 0}>
      <SelectTrigger data-testid={testId} aria-label={ariaLabel ?? 'Roster period'} className={className}>
        <SelectValue placeholder={loading ? 'Loading...' : (placeholder ?? 'Select RP')} />
      </SelectTrigger>
      <SelectContent>
        {items.map((rp) => (
          <SelectItem key={rp.id} value={String(rp.id)} className="text-xs">
            <span className="font-mono tabular-nums">{rp.rosterPeriod}</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
