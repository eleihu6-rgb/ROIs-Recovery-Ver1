// gantt/src/components/res-pairing/res-calendar.tsx
//
// Month-grid calendar for the RES Pairing Planner Define tab.
// Ported from docs/mockups/res-pairing-creator/02-define-workspace.html
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@rois/ui'
import {
  useResPlannerStore,
  DIVISION_RANKS,
  type ResDivision,
} from '@/stores/res-planner-store'

const DOW_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const pad = (n: number) => String(n).padStart(2, '0')

function daysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate()
}

function weekday(year: number, month: number, day: number) {
  return new Date(year, month, day).getDay()
}

function dateKey(year: number, month: number, day: number) {
  return `${year}-${pad(month + 1)}-${pad(day)}`
}

interface ResCalendarProps {
  year: number
  month: number       // 0-based
  onMonthChange: (year: number, month: number) => void
}

export const ResCalendar = ({ year, month, onMonthChange }: ResCalendarProps) => {
  const division = useResPlannerStore((s) => s.division)
  const focusBase = useResPlannerStore((s) => s.focusBase)
  const selMode = useResPlannerStore((s) => s.selMode)
  const dow = useResPlannerStore((s) => s.dow)
  const days = useResPlannerStore((s) => s.days)
  const rangeStart = useResPlannerStore((s) => s.rangeStart)
  const rangeEnd = useResPlannerStore((s) => s.rangeEnd)
  const cells = useResPlannerStore((s) => s.cells)
  const setDays = useResPlannerStore((s) => s.setDays)
  const setDow = useResPlannerStore((s) => s.setDow)
  const setRangeStart = useResPlannerStore((s) => s.setRangeStart)
  const setRangeEnd = useResPlannerStore((s) => s.setRangeEnd)

  // Compute which dates are currently "selected" for highlighting
  const dim = daysInMonth(year, month)
  const first = weekday(year, month, 1)

  function isSelected(key: string): boolean {
    const d = parseInt(key.slice(8), 10)
    const wd = weekday(year, month, d)
    if (selMode === 'dow') return dow.includes(wd)
    if (selMode === 'day') return days.includes(key)
    if (selMode === 'range' && rangeStart) {
      const lo = rangeStart < (rangeEnd ?? rangeStart) ? rangeStart : (rangeEnd ?? rangeStart)
      const hi = rangeStart < (rangeEnd ?? rangeStart) ? (rangeEnd ?? rangeStart) : rangeStart
      return key >= lo && key <= hi
    }
    return false
  }

  function handleCellClick(day: number) {
    const key = dateKey(year, month, day)
    const wd = weekday(year, month, day)

    if (selMode === 'day') {
      if (days.includes(key)) {
        setDays(days.filter((d) => d !== key))
      } else {
        setDays([...days, key])
      }
    } else if (selMode === 'range') {
      if (!rangeStart || rangeEnd) {
        setRangeStart(key)
        setRangeEnd(null)
      } else {
        setRangeEnd(key)
      }
    } else {
      // dow mode — toggle the weekday
      if (dow.includes(wd)) {
        setDow(dow.filter((w) => w !== wd))
      } else {
        setDow([...dow, wd])
      }
    }
  }

  function prevMonth() {
    if (month === 0) onMonthChange(year - 1, 11)
    else onMonthChange(year, month - 1)
  }
  function nextMonth() {
    if (month === 11) onMonthChange(year + 1, 0)
    else onMonthChange(year, month + 1)
  }

  // Gather cell data for this division, visible bases
  const bases = focusBase === 'ALL'
    ? getAllBases(cells)
    : [focusBase]

  const ranks = DIVISION_RANKS[division as ResDivision]

  // Build grid cells
  const totalSlots = Math.ceil((first + dim) / 7) * 7
  const gridDays: (number | null)[] = []
  for (let i = 0; i < first; i++) gridDays.push(null)
  for (let d = 1; d <= dim; d++) gridDays.push(d)
  while (gridDays.length < totalSlots) gridDays.push(null)

  const monthName = new Date(year, month, 1).toLocaleString('en-US', { month: 'long' })

  return (
    <div className="flex min-w-0 flex-col gap-2">
      {/* Month nav */}
      <div className="flex items-center gap-2">
        <button
          onClick={prevMonth}
          className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-accent/60"
        >
          <ChevronLeft className="h-3.5 w-3.5 shrink-0" />
        </button>
        <span className="text-sm font-semibold text-foreground">
          {monthName} {year}
        </span>
        <button
          onClick={nextMonth}
          className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-accent/60"
        >
          <ChevronRight className="h-3.5 w-3.5 shrink-0" />
        </button>
        <span className="ml-auto text-2xs text-muted-foreground">
          {focusBase === 'ALL'
            ? 'per base · per rank — AM/PM'
            : <><span className="font-semibold text-primary">{focusBase}</span> only · per assignment</>}
        </span>
      </div>

      {/* Day-of-week headers */}
      <div className="grid grid-cols-7 gap-px">
        {DOW_LABELS.map((d) => (
          <div key={d} className="py-0.5 text-center text-2xs font-medium text-muted-foreground">
            {d}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <TooltipProvider delayDuration={250}>
        <div className="grid grid-cols-7 gap-px">
          {gridDays.map((day, idx) => {
            if (day === null) {
              return <div key={`blank-${idx}`} className="min-h-[72px] rounded-sm bg-muted/30" />
            }
            const key = dateKey(year, month, day)
            const wd = weekday(year, month, day)
            const isWeekend = wd === 0 || wd === 6
            const sel = isSelected(key)

            // Collect per-base/rank data from cells
            const cellData = getCellData(cells, key, division as ResDivision, bases, ranks)
            const hasData = cellData.some((b) => b.entries.some((e) => e.total > 0))

            return (
              <div
                key={key}
                data-testid={`res-cell-${key}`}
                onClick={() => handleCellClick(day)}
                className={cn(
                  'min-h-[72px] cursor-pointer rounded-sm border p-1 transition-colors',
                  isWeekend ? 'bg-muted/20' : 'bg-background',
                  sel ? 'border-primary/60 ring-1 ring-primary/30' : 'border-border',
                  'hover:bg-accent/30',
                )}
              >
                <div className={cn('text-2xs font-semibold', isWeekend ? 'text-muted-foreground' : 'text-foreground')}>
                  {day}
                </div>
                {sel && (
                  <div className="mt-0.5 h-1 w-1 rounded-full bg-primary" />
                )}
                {hasData ? (
                  <div className="mt-0.5 min-w-0 space-y-0.5">
                    {cellData.map((b) => (
                      <Tooltip key={b.base}>
                        <TooltipTrigger asChild>
                          <div className="flex min-w-0 cursor-help items-start gap-1 leading-tight">
                            <span className="w-7 shrink-0 rounded-sm bg-primary/10 px-0.5 font-mono text-2xs font-bold text-primary">
                              {b.base}
                            </span>
                            <span className="flex min-w-0 flex-wrap gap-x-1 text-2xs text-muted-foreground">
                              {b.entries.map((e) => (
                                <span key={e.assignment} className="whitespace-nowrap">
                                  {e.assignment}
                                  <span className="font-mono font-bold tabular-nums text-primary"> {e.total}</span>
                                </span>
                              ))}
                            </span>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-64 p-2 text-2xs">
                          <div className="font-semibold text-foreground">{key} · {b.base}</div>
                          <div className="mt-1 space-y-1 text-muted-foreground">
                            {b.entries.map((entry) => (
                              <div key={entry.assignment}>
                                <div className="font-medium text-foreground">
                                  {entry.assignment} · {entry.window.start}–{entry.window.end} · {entry.total}
                                </div>
                                <div>{entry.composition.map((plan) => `${plan.rank} ${plan.plan}`).join(' · ')}</div>
                              </div>
                            ))}
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    ))}
                  </div>
                ) : (
                  <div className="mt-1 text-2xs text-muted-foreground/50">—</div>
                )}
              </div>
            )
          })}
        </div>
      </TooltipProvider>

      {/* Calendar hint */}
      <p className="text-2xs text-muted-foreground">
        {focusBase === 'ALL'
          ? 'Showing all bases. Click a base chip to filter the calendar AND matrix to that base only.'
          : `Filtered to ${focusBase} — calendar shows only ${focusBase}. Click "All bases" to see every base.`}
      </p>
    </div>
  )
}

// ── helpers ────────────────────────────────────────────────────────────────

/** Collect distinct base codes mentioned in any cell (for ALL-bases view). */
function getAllBases(cells: { base: string }[]): string[] {
  const seen = new Set<string>()
  const defaults = ['YVR', 'YEG', 'YYZ']
  defaults.forEach((b) => seen.add(b))
  cells.forEach((c) => seen.add(c.base))
  return [...seen]
}

interface BaseCellData {
  base: string
  entries: {
    assignment: string
    total: number
    window: { start: string; end: string }
    composition: { rank: string; plan: number }[]
  }[]
}

function getCellData(
  cells: import('@/stores/res-planner-store').ResPlannerCell[],
  date: string,
  _division: ResDivision,
  bases: string[],
  _ranks: string[],
): BaseCellData[] {
  const result: BaseCellData[] = []
  for (const base of bases) {
    const dayCells = cells.filter((c) => c.date === date && c.base === base)
    if (dayCells.length === 0) continue
    const entries = dayCells.map((c) => ({
      assignment: c.assignment,
      total: c.composition.reduce((sum, x) => sum + x.plan, 0),
      window: c.window,
      composition: c.composition.filter((plan) => plan.plan > 0),
    })).filter((entry) => entry.total > 0)
    if (entries.length > 0) result.push({ base, entries })
  }
  return result
}
