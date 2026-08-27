import { memo } from 'react'
import { Input } from '@rois/ui'
import { X } from 'lucide-react'
import { GanttEnglishDateRangePicker } from '@/components/common/gantt-date-fields'
import type { NaviFilters } from './flight-navi-filters'

interface FlightNaviFilterBarProps {
  filters: NaviFilters
  onChange: (next: NaviFilters) => void
  /** Distinct aircraft registrations available in the loaded flights. */
  registers: string[]
}

const SELECT_CLASS =
  'h-7 rounded-md border border-input bg-background px-2 text-xs text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring'

type ToggleKey = keyof NaviFilters['toggles']

const TOGGLES: { key: ToggleKey; label: string; title: string }[] = [
  { key: 'dhd', label: 'DHD', title: 'Deadhead flights (carrier ≠ home airline)' },
  { key: 'rc', label: 'R/C', title: 'Roster-covered (has crew)' },
  { key: 'pc', label: 'P/C', title: 'Pairing-covered (used by a pairing)' },
  { key: 'cnl', label: 'CNL', title: 'Cancelled flights' },
]

/** The Flight Navi filter row: date range, registration, coverage, status toggles, DEP/ARR/FLTH, and the fizz box. */
export const FlightNaviFilterBar = memo(({ filters, onChange, registers }: FlightNaviFilterBarProps) => {
  const set = (patch: Partial<NaviFilters>): void => onChange({ ...filters, ...patch })
  const toggle = (key: ToggleKey): void =>
    set({ toggles: { ...filters.toggles, [key]: !filters.toggles[key] } })

  return (
    <div className="flex flex-wrap items-center gap-1.5 border-b border-border px-3 py-2">
      {/* Date range */}
      <GanttEnglishDateRangePicker
        ariaLabel="Flight Navi date range"
        endTestId="flight-navi-date-end"
        endValue={filters.dateEnd ?? ''}
        pickerButtonClassName="w-[8.5rem]"
        separator={<span className="text-2xs text-muted-foreground">→</span>}
        startTestId="flight-navi-date-start"
        startValue={filters.dateStart ?? ''}
        onEndValueChange={(value) => set({ dateEnd: value || undefined })}
        onStartValueChange={(value) => set({ dateStart: value || undefined })}
      />

      {/* Registration */}
      <select
        aria-label="Registration"
        data-testid="flight-navi-reg"
        className={SELECT_CLASS}
        value={filters.register ?? ''}
        onChange={(e) => set({ register: e.target.value || undefined })}
      >
        <option value="">FLT Reg</option>
        {registers.map((r) => (
          <option key={r} value={r}>{r}</option>
        ))}
      </select>

      {/* Coverage */}
      <select
        aria-label="Coverage"
        data-testid="flight-navi-coverage"
        className={SELECT_CLASS}
        value={filters.coverage ?? 'all'}
        onChange={(e) => set({ coverage: e.target.value as NaviFilters['coverage'] })}
      >
        <option value="all">Coverage</option>
        <option value="covered">Covered</option>
        <option value="uncovered">Uncovered</option>
      </select>

      {/* Status toggles */}
      <div className="flex items-center gap-1">
        {TOGGLES.map(({ key, label, title }) => (
          <button
            key={key}
            type="button"
            title={title}
            data-testid={`flight-navi-toggle-${key}`}
            aria-pressed={filters.toggles[key]}
            onClick={() => toggle(key)}
            className={[
              'inline-flex h-7 items-center rounded-md px-2 text-2xs font-medium transition-colors',
              filters.toggles[key]
                ? 'bg-primary text-primary-foreground'
                : 'border border-input bg-background text-muted-foreground hover:text-foreground',
            ].join(' ')}
          >
            {label}
          </button>
        ))}
      </div>

      {/* DEP / ARR / FLTH */}
      <Input
        aria-label="Departure airport"
        data-testid="flight-navi-dep"
        placeholder="DEP"
        className="h-7 w-16 text-xs uppercase"
        value={filters.dep ?? ''}
        onChange={(e) => set({ dep: e.target.value || undefined })}
      />
      <Input
        aria-label="Arrival airport"
        data-testid="flight-navi-arr"
        placeholder="ARR"
        className="h-7 w-16 text-xs uppercase"
        value={filters.arr ?? ''}
        onChange={(e) => set({ arr: e.target.value || undefined })}
      />
      <Input
        type="number"
        min={0}
        step={0.5}
        aria-label="Minimum flight hours"
        data-testid="flight-navi-flth"
        placeholder="FLTH"
        className="h-7 w-16 text-xs"
        value={filters.minBlockHours ?? ''}
        onChange={(e) => set({ minBlockHours: e.target.value === '' ? undefined : Number(e.target.value) })}
      />

      {/* Fizz smart filter — pushed to the right */}
      <div className="relative ml-auto">
        <Input
          aria-label="Smart filter"
          data-testid="flight-navi-fizz"
          placeholder="924 · BKK-HKT · YVR- · -YVR"
          className="h-7 w-56 pr-7 text-xs font-mono"
          value={filters.fizz ?? ''}
          onChange={(e) => set({ fizz: e.target.value || undefined })}
        />
        {filters.fizz && (
          <button
            type="button"
            title="Clear"
            data-testid="flight-navi-fizz-clear"
            onClick={() => set({ fizz: undefined })}
            className="absolute right-1 top-1/2 -translate-y-1/2 inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  )
})

FlightNaviFilterBar.displayName = 'FlightNaviFilterBar'
