// gantt/src/components/res-pairing/res-entry-panel.tsx
//
// Right-side entry panel: selection mode, assignment multi-select,
// per-assignment window + base×rank plan matrix, Apply.
import { PencilLine } from 'lucide-react'
import { cn } from '@rois/ui'
import {
  useResPlannerStore,
  DIVISION_RANKS,
  type ResDivision,
  type ResPlannerCell,
} from '@/stores/res-planner-store'

const DOW_LABELS: Record<number, string> = {
  0: 'Sun', 1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri', 6: 'Sat',
}

const DOW_ORDER = [1, 2, 3, 4, 5, 6, 0]

const pad = (n: number) => String(n).padStart(2, '0')

function dateKey(year: number, month: number, day: number) {
  return `${year}-${pad(month + 1)}-${pad(day)}`
}

function daysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate()
}

function weekday(year: number, month: number, day: number) {
  return new Date(year, month, day).getDay()
}

interface ResEntryPanelProps {
  year: number
  month: number
}

export const ResEntryPanel = ({ year, month }: ResEntryPanelProps) => {
  const division = useResPlannerStore((s) => s.division)
  const focusBase = useResPlannerStore((s) => s.focusBase)
  const selMode = useResPlannerStore((s) => s.selMode)
  const setSelMode = useResPlannerStore((s) => s.setSelMode)
  const dow = useResPlannerStore((s) => s.dow)
  const setDow = useResPlannerStore((s) => s.setDow)
  const days = useResPlannerStore((s) => s.days)
  const rangeStart = useResPlannerStore((s) => s.rangeStart)
  const rangeEnd = useResPlannerStore((s) => s.rangeEnd)
  const brush = useResPlannerStore((s) => s.brush)
  const setBrushValue = useResPlannerStore((s) => s.setBrushValue)
  const ensureBrushBase = useResPlannerStore((s) => s.ensureBrushBase)
  const mergeCells = useResPlannerStore((s) => s.mergeCells)
  const cells = useResPlannerStore((s) => s.cells)
  const callOptions = useResPlannerStore((s) => s.callOptions)
  const selectedAssignments = useResPlannerStore((s) => s.selectedAssignments)
  const toggleAssignment = useResPlannerStore((s) => s.toggleAssignment)
  const windows = useResPlannerStore((s) => s.windows)
  const setAssignmentWindow = useResPlannerStore((s) => s.setAssignmentWindow)

  const div = division as ResDivision
  const ranks = DIVISION_RANKS[div]
  const options = callOptions[div]

  const matrixBases = focusBase === 'ALL'
    ? [...new Set(
        selectedAssignments.flatMap((code) => Object.keys(brush[div][code] ?? {})),
      )].sort()
    : [focusBase]

  // If no brush bases yet for selected codes, fall back to common bases.
  const bases = matrixBases.length > 0 ? matrixBases : (focusBase === 'ALL' ? ['YVR', 'YEG', 'YYZ'] : [focusBase])

  function selectedKeys(): string[] {
    const keys: string[] = []
    const dim = daysInMonth(year, month)
    for (let d = 1; d <= dim; d++) {
      const key = dateKey(year, month, d)
      const wd = weekday(year, month, d)
      let sel = false
      if (selMode === 'dow') sel = dow.includes(wd)
      else if (selMode === 'day') sel = days.includes(key)
      else if (selMode === 'range' && rangeStart) {
        const lo = rangeStart < (rangeEnd ?? rangeStart) ? rangeStart : (rangeEnd ?? rangeStart)
        const hi = rangeStart < (rangeEnd ?? rangeStart) ? (rangeEnd ?? rangeStart) : rangeStart
        sel = key >= lo && key <= hi
      }
      if (sel) keys.push(key)
    }
    return keys
  }

  function selSummary(): string {
    const keys = selectedKeys()
    let mode = ''
    if (selMode === 'dow') {
      const names = [...dow].sort().map((w) => DOW_LABELS[w]).join(', ')
      mode = `Day of week (${names || 'none'})`
    } else if (selMode === 'range') {
      mode = 'Date range'
    } else {
      mode = 'Individual days'
    }
    return `Selection: ${mode} · ${keys.length} day(s) · ${bases.length} base(s) · ${selectedAssignments.length} assignment(s)`
  }

  function handleApply() {
    const keys = selectedKeys()
    if (!keys.length || selectedAssignments.length === 0) return

    const incoming: ResPlannerCell[] = []
    for (const date of keys) {
      for (const base of bases) {
          for (const assignment of selectedAssignments) {
            ensureBrushBase(assignment, base)
            const win = windows[assignment] ?? { start: '10:00', end: '22:00' }
            const composition = ranks.map((rank) => ({
              rank,
              plan: brush[div][assignment]?.[base]?.[rank] ?? 0,
            }))
            // A zero-plan combination is only an editing default. Do not create
            // a calendar cell for it, otherwise an unconfigured base appears
            // after Apply.
            if (composition.every((entry) => entry.plan <= 0)) continue
            incoming.push({
              date,
              base,
              assignment,
              window: { ...win },
              composition,
            })
        }
      }
    }
    mergeCells(incoming)
  }

  const keys = selectedKeys()
  const configuredPairings = bases.reduce(
    (count, base) => count + selectedAssignments.filter((assignment) =>
      ranks.some((rank) => (brush[div][assignment]?.[base]?.[rank] ?? 0) > 0),
    ).length,
    0,
  )
  const pairings = keys.length * configuredPairings
  const cannotApply = keys.length === 0 || configuredPairings === 0
  const definedDays = new Set(cells.map((c) => c.date)).size

  return (
    <div className="sticky top-2 flex flex-col gap-0 rounded-md border border-border bg-muted/30">
      <div className="flex h-9 shrink-0 items-center gap-2 rounded-t-md bg-primary px-3">
        <PencilLine className="h-4 w-4 shrink-0 text-primary-foreground" />
        <span className="text-sm font-semibold text-primary-foreground">Set RES for selection</span>
      </div>

      <div className="flex flex-col gap-3 p-3">
        <div className="rounded-sm border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-xs text-foreground">
          {selSummary()}
        </div>

        {/* Selection mode */}
        <div className="flex flex-col gap-1.5">
          <span className="text-2xs font-medium uppercase tracking-wide text-muted-foreground">
            Selection mode
          </span>
          <div className="flex rounded-md border border-border">
            {(['day', 'range', 'dow'] as const).map((mode, i) => (
              <button
                key={mode}
                data-testid={`res-mode-${mode}`}
                onClick={() => setSelMode(mode)}
                className={cn(
                  'flex-1 py-1 text-xs font-medium transition-colors',
                  i === 0 ? 'rounded-l-md' : '',
                  i === 2 ? 'rounded-r-md' : '',
                  i < 2 ? 'border-r border-border' : '',
                  selMode === mode
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-background text-muted-foreground hover:bg-accent/60',
                )}
              >
                {mode === 'day' ? 'Day' : mode === 'range' ? 'Range' : 'Day of week'}
              </button>
            ))}
          </div>

          {selMode === 'dow' && (
            <div className="flex flex-col gap-1">
              <div className="flex flex-wrap gap-1">
                {DOW_ORDER.map((wd) => (
                  <button
                    key={wd}
                    data-testid={`res-dow-${wd}`}
                    data-active={dow.includes(wd) ? 'true' : 'false'}
                    onClick={() => {
                      if (dow.includes(wd)) setDow(dow.filter((w) => w !== wd))
                      else setDow([...dow, wd])
                    }}
                    className={cn(
                      'h-6 rounded-sm px-2 text-xs font-medium transition-colors',
                      dow.includes(wd)
                        ? 'bg-primary text-primary-foreground'
                        : 'border border-border bg-background text-muted-foreground hover:bg-accent/60',
                    )}
                  >
                    {DOW_LABELS[wd]}
                  </button>
                ))}
              </div>
            </div>
          )}
          {selMode === 'range' && (
            <p className="text-2xs text-muted-foreground">
              Range: <b>{rangeStart ?? '—'}</b> → <b>{rangeEnd ?? '—'}</b>
            </p>
          )}
          {selMode === 'day' && (
            <p className="text-2xs text-muted-foreground">
              Selected: <b>{days.length}</b> day(s)
            </p>
          )}
        </div>

        {/* Assignment multi-select */}
        <div className="flex flex-col gap-1.5 border-t border-dashed border-border/60 pt-2.5">
          <span className="text-2xs font-medium uppercase tracking-wide text-muted-foreground">
            Assignments (multi-select)
          </span>
          <div className="flex flex-wrap gap-1">
            {options.map((opt) => {
              const active = selectedAssignments.includes(opt.assignment)
              return (
                <button
                  key={opt.assignment}
                  type="button"
                  data-testid={`res-assignment-${opt.assignment}`}
                  data-active={active ? 'true' : 'false'}
                  onClick={() => toggleAssignment(opt.assignment)}
                  className={cn(
                    'h-6 rounded-sm px-2 text-xs font-medium transition-colors',
                    active
                      ? 'bg-primary text-primary-foreground'
                      : 'border border-border bg-background text-muted-foreground hover:bg-accent/60',
                  )}
                >
                  {opt.assignment}
                </button>
              )
            })}
          </div>
          <p className="text-2xs text-muted-foreground">
            Options from RES_CALL_TYPE. Windows default from assignment fixed times (HH:mm).
          </p>
        </div>

        {/* Per-assignment window + plan matrix */}
        {selectedAssignments.map((code) => {
          const win = windows[code] ?? { start: '10:00', end: '22:00' }
          return (
            <div
              key={code}
              className="flex flex-col gap-1.5 border-t border-dashed border-border/60 pt-2.5"
              data-testid={`res-assignment-panel-${code}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-foreground">{code}</span>
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    data-testid={`res-window-start-${code}`}
                    value={win.start}
                    onChange={(e) => setAssignmentWindow(code, { ...win, start: e.target.value })}
                    className="w-14 rounded-sm border border-border bg-background px-1.5 py-0.5 text-center font-mono text-xs tabular-nums focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  <span className="text-2xs text-muted-foreground">–</span>
                  <input
                    type="text"
                    data-testid={`res-window-end-${code}`}
                    value={win.end}
                    onChange={(e) => setAssignmentWindow(code, { ...win, end: e.target.value })}
                    className="w-14 rounded-sm border border-border bg-background px-1.5 py-0.5 text-center font-mono text-xs tabular-nums focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
              </div>

              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr>
                    <th className="border-b border-border bg-background pb-1 pl-1 text-left text-2xs font-medium uppercase tracking-wide text-muted-foreground">
                      Base
                    </th>
                    <th className="border-b border-border bg-background pb-1 text-left text-2xs font-medium uppercase tracking-wide text-muted-foreground">
                      Rk
                    </th>
                    <th className="border-b border-border bg-background pb-1 text-center text-2xs font-medium uppercase tracking-wide text-muted-foreground">
                      Plan
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {bases.map((base) => (
                    ranks.map((rank, ri) => (
                      <tr key={`${base}-${rank}`} className={ri === 0 ? 'border-t-2 border-border/60' : ''}>
                        {ri === 0 && (
                          <td
                            rowSpan={ranks.length}
                            className="border-r border-border bg-background pl-1 font-mono text-xs font-bold text-primary"
                          >
                            {base}
                          </td>
                        )}
                        <td className="border-b border-border/40 py-0.5 pl-1 text-left font-medium text-foreground">
                          {rank}
                        </td>
                        <td className="border-b border-border/40 py-0.5 text-center">
                          <input
                            type="number"
                            min={0}
                            data-testid={`res-plan-${code}-${base}-${rank}`}
                            value={brush[div][code]?.[base]?.[rank] ?? 0}
                            onChange={(e) => {
                              const n = Math.max(0, parseInt(e.target.value, 10) || 0)
                              setBrushValue(div, code, base, rank, n)
                            }}
                            className="w-12 rounded-sm border border-border bg-background px-1 py-px text-center font-mono text-xs tabular-nums focus:outline-none focus:ring-1 focus:ring-primary"
                          />
                        </td>
                      </tr>
                    ))
                  ))}
                </tbody>
              </table>
            </div>
          )
        })}

        {selectedAssignments.length === 0 && (
          <p className="text-2xs text-muted-foreground">Select at least one assignment above.</p>
        )}

        <button
          data-testid="res-apply"
          disabled={cannotApply}
          onClick={handleApply}
          className={cn(
            'flex items-center justify-center rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
            cannotApply
              ? 'cursor-not-allowed bg-primary/40 text-primary-foreground/60'
              : 'bg-primary text-primary-foreground hover:bg-primary/90',
          )}
        >
          Apply to {keys.length} day{keys.length === 1 ? '' : 's'} · {configuredPairings} configured
          {' '}base/assignment pair{configuredPairings === 1 ? '' : 's'} → {pairings} pairings
        </button>

        <p className="text-2xs text-muted-foreground">
          {definedDays} day(s) defined for {div === 'P' ? 'Pilot' : 'Cabin'}
        </p>
      </div>
    </div>
  )
}
