import { useEffect } from 'react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@rois/ui'
import { ChevronDown } from 'lucide-react'
import { useTimezoneStore, type TzOption } from '@/stores/timezone-store'
import { useFilterStore } from '@/stores/filter-store'
import { timezoneApi } from '@/services/timezone-api'
import { calendarDateToUtcMidnight, formatUtcOffset } from '@/components/gantt/gantt-utils'

/**
 * Re-anchor the stored date range to local midnight in the new timezone.
 * Reads the calendar dates from the current range (in the old timezone),
 * then recomputes UTC timestamps using the new timezone.
 */
const reanchorDateRange = (oldTz: string, newTz: string): void => {
  const { start, end } = useFilterStore.getState().dateRange
  const oldFmt = new Intl.DateTimeFormat('en-CA', { timeZone: oldTz })
  const startStr = oldFmt.format(start)
  const endStr = oldFmt.format(end)

  const newStart = calendarDateToUtcMidnight(startStr, newTz)
  // End = midnight of the day after endStr, minus 1 ms
  const [ey, em, ed] = endStr.split('-').map(Number)
  const nextDayStr = new Date(Date.UTC(ey, em - 1, ed + 1)).toISOString().slice(0, 10)
  const newEnd = new Date(calendarDateToUtcMidnight(nextDayStr, newTz).getTime() - 1)

  useFilterStore.getState().setDateRange(newStart, newEnd)
}

export const TimezoneSwitcher = ({ scenarioId }: { scenarioId?: number } = {}) => {
  const timezone = useTimezoneStore((s) => s.timezone)
  const timezoneAirport = useTimezoneStore((s) => s.timezoneAirport)
  const timezoneOptions = useTimezoneStore((s) => s.timezoneOptions)
  const setTimezone = useTimezoneStore((s) => s.setTimezone)
  const setScenarioTimezone = useTimezoneStore((s) => s.setScenarioTimezone)
  const setOptions = useTimezoneStore((s) => s.setOptions)

  useEffect(() => {
    timezoneApi.getOptions()
      .then((opts) => {
        setOptions(opts)
        // Respect the saved selection (localStorage) or the default UTC.
        // Only fall back to UTC if the saved airport no longer exists in the fetched options
        // (e.g., airline base list changed between sessions).
        const { timezone: savedZone, timezoneAirport: savedAirport } = useTimezoneStore.getState()
        const stillValid = opts.some((o) => o.zoneId === savedZone && o.airport === savedAirport)
        if (!stillValid) {
          setTimezone('UTC', 'UTC')
        }
      })
      .catch(() => { /* silently fail, keep default UTC */ })
  }, [setOptions, setTimezone])

  const bases = timezoneOptions.filter((o) => o.isBase)
  const others = timezoneOptions.filter((o) => !o.isBase && o.airport !== 'UTC')
  const utc = timezoneOptions.find((o) => o.airport === 'UTC')

  const select = (opt: TzOption) => {
    if (scenarioId !== undefined) {
      setScenarioTimezone(scenarioId, opt.zoneId, opt.airport)
    } else {
      const currentTz = useTimezoneStore.getState().timezone
      reanchorDateRange(currentTz, opt.zoneId)
      setTimezone(opt.zoneId, opt.airport)
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          data-testid="timezone-switcher"
          className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs text-muted-foreground transition-all duration-100 hover:bg-accent/60 hover:text-foreground data-[state=open]:bg-primary/10 data-[state=open]:text-primary"
        >
          <span className="text-2xs">🕐</span>
          <span className="font-bold text-primary text-2xs">{timezoneAirport}</span>
          <span className="text-2xs text-muted-foreground">{timezone}</span>
          <ChevronDown className="h-2 w-2" />
        </button>
      </DropdownMenuTrigger>

      {/* Portal out of the toolbar overflow/stacking context so every row
          (UTC first) is fully clickable — absolute menus under the h-9
          toolbar were clipped and only a thin top strip received hits. */}
      <DropdownMenuContent
        data-testid="timezone-menu"
        align="start"
        sideOffset={4}
        className="w-[268px] p-0"
      >
        <DropdownMenuLabel className="px-2.5 py-2 text-3xs font-normal uppercase tracking-wider text-muted-foreground">
          Display Timezone
        </DropdownMenuLabel>

        {utc && (
          <div className="py-1">
            <TimezoneOption
              opt={utc}
              selected={utc.zoneId === timezone && utc.airport === timezoneAirport}
              onSelect={select}
            />
          </div>
        )}

        {bases.length > 0 && (
          <>
            <DropdownMenuSeparator className="my-0" />
            <div className="py-1">
              <div className="px-2.5 py-1 text-3xs text-muted-foreground uppercase tracking-wider">★ Airline Bases</div>
              {bases.map((opt) => (
                <TimezoneOption
                  key={opt.airport}
                  opt={opt}
                  selected={opt.zoneId === timezone && opt.airport === timezoneAirport}
                  onSelect={select}
                />
              ))}
            </div>
          </>
        )}

        {others.length > 0 && (
          <>
            <DropdownMenuSeparator className="my-0" />
            <div className="py-1">
              <div className="px-2.5 py-1 text-3xs text-muted-foreground uppercase tracking-wider">✈ Other Airports</div>
              {others.map((opt) => (
                <TimezoneOption
                  key={opt.airport}
                  opt={opt}
                  selected={opt.zoneId === timezone && opt.airport === timezoneAirport}
                  onSelect={select}
                />
              ))}
            </div>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

const TimezoneOption = ({
  opt,
  selected,
  onSelect,
}: {
  opt: TzOption
  selected: boolean
  onSelect: (o: TzOption) => void
}) => (
  <DropdownMenuItem
    data-testid={`timezone-option-${opt.airport}`}
    onSelect={() => onSelect(opt)}
    className={`mx-0 flex cursor-pointer items-center gap-2 rounded-none px-2.5 py-1.5 ${
      selected ? 'bg-primary/10' : ''
    }`}
  >
    <span className="w-4 shrink-0 text-center text-xs">
      {opt.airport === 'UTC' ? '🌐' : opt.isBase ? '★' : '✈'}
    </span>
    <div className="min-w-0 flex-1">
      <div className="flex items-center gap-1.5">
        <span className="text-xs font-bold">{opt.airport}</span>
        <span className="truncate text-2xs text-muted-foreground">{opt.airportName}</span>
      </div>
      <div className="font-mono text-3xs text-muted-foreground">{opt.zoneId}</div>
    </div>
    <span className="shrink-0 text-2xs text-muted-foreground">{formatUtcOffset(opt.utcOffset)}</span>
    {selected && <span className="shrink-0 text-xs text-primary">✓</span>}
  </DropdownMenuItem>
)
