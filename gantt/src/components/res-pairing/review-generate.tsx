// gantt/src/components/res-pairing/review-generate.tsx
//
// Review/generate panel: grouped overview by assignment, conflict policy, Generate.
import { useState, useMemo, useCallback } from 'react'
import { useResPlannerStore } from '@/stores/res-planner-store'
import { resApi } from '@/services/res-api'
import type { ConflictPolicy } from '@/services/res-api'
import { applyGanttFilters } from '@/utils/apply-filters'
import { notify } from '@/utils/notify'

const CONFLICT_OPTIONS: { value: ConflictPolicy; label: string; description: string }[] = [
  { value: 'skip', label: 'Skip', description: 'Leave existing pairings unchanged' },
  { value: 'overwrite', label: 'Overwrite', description: 'Replace existing pairing composition' },
  { value: 'add', label: 'Add', description: 'Insert new pairings alongside existing' },
]

interface SummaryRow {
  base: string
  rank: string
  assignment: string
  dateFrom: string
  dateTo: string
  dateRangeLabel: string
  days: number
  slotsPerDay: number
  totalSlots: number
}

const formatDateRangeLabel = (dateFrom: string, dateTo: string): string =>
  dateFrom === dateTo ? dateFrom : `${dateFrom} - ${dateTo}`

export const buildSummary = (
  cells: ReturnType<typeof useResPlannerStore.getState>['cells'],
): SummaryRow[] => {
  const m = new Map<string, SummaryRow>()
  for (const cell of cells) {
    for (const comp of cell.composition) {
      if (comp.plan <= 0) continue
      const key = `${cell.base}|${comp.rank}|${cell.assignment}`
      const row = m.get(key) ?? {
        base: cell.base,
        rank: comp.rank,
        assignment: cell.assignment,
        dateFrom: cell.date,
        dateTo: cell.date,
        dateRangeLabel: cell.date,
        days: 0,
        slotsPerDay: comp.plan,
        totalSlots: 0,
      }
      if (cell.date < row.dateFrom) row.dateFrom = cell.date
      if (cell.date > row.dateTo) row.dateTo = cell.date
      row.dateRangeLabel = formatDateRangeLabel(row.dateFrom, row.dateTo)
      row.days += 1
      row.totalSlots += comp.plan
      m.set(key, row)
    }
  }
  return [...m.values()].sort((a, b) =>
    a.base.localeCompare(b.base)
    || a.assignment.localeCompare(b.assignment)
    || a.rank.localeCompare(b.rank),
  )
}

export const ReviewGenerate = () => {
  const cells = useResPlannerStore((s) => s.cells)
  const division = useResPlannerStore((s) => s.division)
  const close = useResPlannerStore((s) => s.close)
  const setLastResult = useResPlannerStore((s) => s.setLastResult)

  const [conflictPolicy, setConflictPolicy] = useState<ConflictPolicy>('skip')
  const [generating, setGenerating] = useState(false)

  const summary = useMemo(() => buildSummary(cells), [cells])

  const totalPairings = useMemo(() => {
    const set = new Set<string>()
    for (const cell of cells) {
      if (cell.composition.some((c) => c.plan > 0)) {
        set.add(`${cell.date}|${cell.base}|${cell.assignment}`)
      }
    }
    return set.size
  }, [cells])

  const handleGenerate = useCallback(async () => {
    if (cells.length === 0) return
    setGenerating(true)
    try {
      const result = await resApi.generate({ division, conflictPolicy, cells })

      const codes = [
        ...new Set(
          cells
            .filter((c) => c.composition.some((x) => x.plan > 0))
            .map((c) => c.assignment),
        ),
      ]

      await applyGanttFilters({ forcePairingReload: true })

      setLastResult({ created: result.created, skipped: result.skipped, codes })
      close()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Generate failed'
      notify.error(msg)
    } finally {
      setGenerating(false)
    }
  }, [cells, division, conflictPolicy, close, setLastResult])

  return (
    <div className="flex flex-col gap-4 p-4">
      {summary.length > 0 ? (
        <div className="overflow-auto rounded-md border border-border">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-left">
                <th className="px-3 py-2 font-medium text-muted-foreground">Base</th>
                <th className="px-3 py-2 font-medium text-muted-foreground">Assignment</th>
                <th className="px-3 py-2 font-medium text-muted-foreground">Date range</th>
                <th className="px-3 py-2 font-medium text-muted-foreground">Rank</th>
                <th className="px-3 py-2 font-medium text-muted-foreground">Days</th>
                <th className="px-3 py-2 font-medium text-muted-foreground">Plan/day</th>
                <th className="px-3 py-2 font-medium text-muted-foreground">Total slots</th>
              </tr>
            </thead>
            <tbody>
              {summary.map((row) => (
                <tr
                  key={`${row.base}-${row.assignment}-${row.rank}`}
                  className="border-b border-border last:border-0 hover:bg-muted/20"
                >
                  <td className="px-3 py-1.5 font-mono tabular-nums">{row.base}</td>
                  <td className="px-3 py-1.5 font-mono font-semibold">{row.assignment}</td>
                  <td className="px-3 py-1.5 font-mono tabular-nums">{row.dateRangeLabel}</td>
                  <td className="px-3 py-1.5">{row.rank}</td>
                  <td className="px-3 py-1.5 tabular-nums">{row.days}</td>
                  <td className="px-3 py-1.5 tabular-nums">{row.slotsPerDay}</td>
                  <td className="px-3 py-1.5 tabular-nums">{row.totalSlots}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          No cells defined. Select assignments, set plans, and Apply first.
        </p>
      )}

      {totalPairings > 0 && (
        <p className="text-xs text-muted-foreground">
          Will generate <span className="font-semibold text-foreground">{totalPairings}</span> RES pairings.
        </p>
      )}

      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-muted-foreground">Conflict policy</label>
        <div className="flex gap-2">
          {CONFLICT_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              className={[
                'flex flex-col rounded-md border px-3 py-2 text-xs transition-colors',
                conflictPolicy === opt.value
                  ? 'border-primary bg-primary/5 text-primary'
                  : 'border-border text-muted-foreground hover:border-primary/50 hover:text-foreground',
              ].join(' ')}
              onClick={() => setConflictPolicy(opt.value)}
              title={opt.description}
            >
              <span className="font-medium">{opt.label}</span>
              <span className="text-2xs opacity-70">{opt.description}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex justify-end">
        <button
          data-testid="res-generate"
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
          onClick={handleGenerate}
          disabled={cells.length === 0 || generating}
        >
          {generating ? 'Generating…' : 'Generate'}
        </button>
      </div>
    </div>
  )
}
