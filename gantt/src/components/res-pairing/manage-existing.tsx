// gantt/src/components/res-pairing/manage-existing.tsx
//
// Manage Existing tab body for the RES Pairing Planner dialog.
// Lists existing PRAM/PRPM/CRAM/CRPM pairings with filter controls,
// supports batch modify (plan values) and batch delete.
import { type ReactNode, useState, useEffect, useCallback, useMemo } from 'react'
import { pairingApi } from '@/services/pairing-api'
import { resApi } from '@/services/res-api'
import { notify } from '@/utils/notify'
import { useReferenceStore } from '@/stores/reference-store'
import { GanttEnglishDatePicker } from '@/components/common/gantt-date-fields'
import type { Pairing } from '@/types'

const FALLBACK_BASES = ['YVR', 'YEG', 'YYZ']

// ── Helpers ─────────────────────────────────────────────────────────────────

/** ISO date for the first day of the current month (YYYY-MM-01). */
const thisMonthStart = (): string => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

/** ISO date for the last day of the current month (YYYY-MM-DD). */
const thisMonthEnd = (): string => {
  const d = new Date()
  const y = d.getFullYear()
  const m = d.getMonth()
  const last = new Date(y, m + 1, 0)
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(last.getDate()).padStart(2, '0')}`
}

/** Collect all unique ranks that appear in a set of pairings, sorted. */
const collectRanks = (pairings: Pairing[]): string[] => {
  const set = new Set<string>()
  for (const p of pairings) {
    for (const slot of p.composition) set.add(slot.rank)
  }
  return [...set].sort()
}

/** Civil date for a pairing: pairingDt if set, else schStrDtUtc first 10 chars. */
const civilDate = (p: Pairing): string =>
  p.pairingDt ?? p.schStrDtUtc.slice(0, 10)

// ── Types ────────────────────────────────────────────────────────────────────

const RES_ASSIGNMENT_TYPES = ['PRAM', 'PRPM', 'CRAM', 'CRPM'] as const
type ResAssignment = (typeof RES_ASSIGNMENT_TYPES)[number]

interface Filters {
  base: string         // 'ALL' or base code
  division: string     // 'ALL', 'P', or 'C'
  startDate: string
  endDate: string
  types: ResAssignment[]
}

/** Aggregate KPI stats for the loaded/filtered RES pairings. */
interface SummaryStats {
  total: number                                          // RES pairings
  byType: { code: string; count: number; isAm: boolean }[] // per call-code (PRAM/PRPM/CRAM/CRPM)
  crewSlots: number                                      // sum of all composition plan values
  bases: number                                          // distinct bases
  dates: number                                          // distinct civil dates
}

// ── SummaryCard: one KPI box (big number + small label) ───────────────────────
const SummaryCard = ({ value, label, testid }: { value: number; label: ReactNode; testid: string }) => (
  <div data-testid={testid} className="min-w-20 rounded-md border border-border bg-background px-3 py-2">
    <div className="text-lg font-bold font-mono tabular-nums text-foreground">{value}</div>
    <div className="text-2xs text-muted-foreground">{label}</div>
  </div>
)

// ── ModifyPanel ──────────────────────────────────────────────────────────────

interface ModifyPanelProps {
  ranks: string[]
  onApply: (plan: { rank: string; value: number }[]) => Promise<void>
  applying: boolean
}

const ModifyPanel = ({ ranks, onApply, applying }: ModifyPanelProps) => {
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(ranks.map((r) => [r, ''])),
  )

  // Reset when ranks change
  useEffect(() => {
    setValues(Object.fromEntries(ranks.map((r) => [r, ''])))
  }, [ranks])

  const handleApply = async () => {
    const plan = ranks
      .filter((r) => values[r] !== '' && !Number.isNaN(Number(values[r])))
      .map((r) => ({ rank: r, value: Number(values[r]) }))
    if (plan.length === 0) return
    await onApply(plan)
  }

  return (
    <div className="mt-1 rounded-md border border-border bg-background p-3 shadow-md">
      <p className="mb-2 text-xs font-medium text-muted-foreground">Set plan value for selected rows</p>
      <div className="flex flex-wrap gap-2">
        {ranks.map((rank) => (
          <div key={rank} className="flex flex-col gap-0.5">
            <label className="text-2xs text-muted-foreground">{rank}</label>
            <input
              type="number"
              min={0}
              data-testid={`res-modify-${rank}`}
              value={values[rank]}
              onChange={(e) => setValues((prev) => ({ ...prev, [rank]: e.target.value }))}
              className="w-16 rounded-sm border border-border bg-background px-2 py-1 text-xs font-mono tabular-nums focus:outline-none focus:ring-1 focus:ring-primary"
              placeholder="—"
            />
          </div>
        ))}
      </div>
      <div className="mt-2 flex justify-end">
        <button
          data-testid="res-modify-apply"
          onClick={handleApply}
          disabled={applying}
          className="rounded-sm bg-primary px-3 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {applying ? 'Applying…' : 'Apply'}
        </button>
      </div>
    </div>
  )
}

// ── ManageExisting ────────────────────────────────────────────────────────────

export const ManageExisting = () => {
  // ── Base list from reference store (mirrors define-workspace.tsx) ─────────
  const referenceBases = useReferenceStore((s) => s.bases)
  const referenceLoad = useReferenceStore((s) => s.load)
  const referenceLoaded = useReferenceStore((s) => s.loaded)

  useEffect(() => {
    if (!referenceLoaded) void referenceLoad()
  }, [referenceLoad, referenceLoaded])

  const bases: string[] = referenceBases.length > 0
    ? referenceBases.map((b) => b.base)
    : FALLBACK_BASES

  // ── Filter state ──────────────────────────────────────────────────────────
  const [filters, setFilters] = useState<Filters>({
    base: 'ALL',
    division: 'ALL',
    startDate: thisMonthStart(),
    endDate: thisMonthEnd(),
    types: [...RES_ASSIGNMENT_TYPES],
  })

  // ── Data state ────────────────────────────────────────────────────────────
  const [pairings, setPairings] = useState<Pairing[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // ── Selection state ───────────────────────────────────────────────────────
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())

  // ── Modify panel state ────────────────────────────────────────────────────
  const [modifyOpen, setModifyOpen] = useState(false)
  const [applying, setApplying] = useState(false)
  const [deleting, setDeleting] = useState(false)

  // ── Dynamic rank columns ──────────────────────────────────────────────────
  const ranks = useMemo(() => collectRanks(pairings), [pairings])

  // ── Default summary: aggregate KPIs for the loaded/filtered rows ─────────────
  const summary = useMemo<SummaryStats>(() => {
    const typeCount = new Map<string, number>()
    const baseSet = new Set<string>()
    const dateSet = new Set<string>()
    let crewSlots = 0
    for (const p of pairings) {
      typeCount.set(p.assignment, (typeCount.get(p.assignment) ?? 0) + 1)
      baseSet.add(p.base)
      dateSet.add(civilDate(p))
      for (const slot of p.composition) crewSlots += slot.plan
    }
    const byType = RES_ASSIGNMENT_TYPES
      .filter((t) => typeCount.has(t))
      .map((t) => ({ code: t, count: typeCount.get(t) ?? 0, isAm: t.endsWith('AM') }))
    return { total: pairings.length, byType, crewSlots, bases: baseSet.size, dates: dateSet.size }
  }, [pairings])

  // ── Fetch ─────────────────────────────────────────────────────────────────
  const fetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    setSelectedIds(new Set())
    setModifyOpen(false)
    try {
      const query = {
        view: 'summary' as const,
        startDate: filters.startDate,
        endDate: filters.endDate,
        assignments: filters.types.length > 0 ? filters.types : [...RES_ASSIGNMENT_TYPES],
        pageSize: 0,
        ...(filters.base !== 'ALL' ? { base: filters.base } : {}),
        ...(filters.division !== 'ALL' ? { division: filters.division } : {}),
      }
      const res = await pairingApi.list(query)
      setPairings(res.items)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load pairings'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }, [filters])

  // Auto-fetch on mount and filter change
  useEffect(() => {
    void fetch()
  }, [fetch])

  // ── Selection helpers ─────────────────────────────────────────────────────
  const allSelected = pairings.length > 0 && selectedIds.size === pairings.length
  const someSelected = selectedIds.size > 0 && selectedIds.size < pairings.length

  const toggleAll = () => {
    if (allSelected) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(pairings.map((p) => p.id)))
    }
  }

  const toggleRow = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  // ── Modify action ─────────────────────────────────────────────────────────
  const handleModify = async (plan: { rank: string; value: number }[]) => {
    setApplying(true)
    try {
      await resApi.batchUpdate({ ids: [...selectedIds], plan })
      notify.success('Plan updated')
      setModifyOpen(false)
      await fetch()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Update failed'
      notify.error(msg)
    } finally {
      setApplying(false)
    }
  }

  // ── Delete action ─────────────────────────────────────────────────────────
  const handleDelete = async () => {
    if (!confirm(`Delete ${selectedIds.size} RES pairing(s)?`)) return
    setDeleting(true)
    try {
      const result = await resApi.batchDelete({ ids: [...selectedIds] })
      if (result.blocked.length > 0) {
        notify.error(`${result.blocked.length} pairing(s) blocked: ${result.blocked.map((b) => b.id).join(', ')}`)
      }
      if (result.deleted > 0) {
        notify.success(`${result.deleted} pairing(s) deleted`)
      }
      await fetch()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Delete failed'
      notify.error(msg)
    } finally {
      setDeleting(false)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-3 p-4">
      {/* Filter bar */}
      <div className="flex flex-wrap items-end gap-2">
        {/* Base */}
        <div className="flex flex-col gap-0.5">
          <label className="text-2xs text-muted-foreground">Base</label>
          <select
            data-testid="manage-filter-base"
            value={filters.base}
            onChange={(e) => setFilters((f) => ({ ...f, base: e.target.value }))}
            className="rounded-sm border border-border bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="ALL">ALL</option>
            {bases.map((b) => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>
        </div>

        {/* Division */}
        <div className="flex flex-col gap-0.5">
          <label className="text-2xs text-muted-foreground">Division</label>
          <select
            data-testid="manage-filter-division"
            value={filters.division}
            onChange={(e) => setFilters((f) => ({ ...f, division: e.target.value }))}
            className="rounded-sm border border-border bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="ALL">ALL</option>
            <option value="P">Pilot</option>
            <option value="C">Cabin</option>
          </select>
        </div>

        {/* Date range */}
        <div className="flex flex-col gap-0.5">
          <label className="text-2xs text-muted-foreground">From</label>
          <GanttEnglishDatePicker
            ariaLabel="Manage existing start date"
            buttonClassName="h-7 rounded-sm font-mono"
            testId="manage-filter-start"
            value={filters.startDate}
            onValueChange={(value) => setFilters((f) => ({ ...f, startDate: value }))}
          />
        </div>
        <div className="flex flex-col gap-0.5">
          <label className="text-2xs text-muted-foreground">To</label>
          <GanttEnglishDatePicker
            ariaLabel="Manage existing end date"
            buttonClassName="h-7 rounded-sm font-mono"
            testId="manage-filter-end"
            value={filters.endDate}
            onValueChange={(value) => setFilters((f) => ({ ...f, endDate: value }))}
          />
        </div>

        {/* Type chips */}
        <div className="flex flex-col gap-0.5">
          <label className="text-2xs text-muted-foreground">Type</label>
          <div className="flex gap-1">
            {RES_ASSIGNMENT_TYPES.map((t) => {
              const active = filters.types.includes(t)
              return (
                <button
                  key={t}
                  onClick={() => {
                    setFilters((f) => ({
                      ...f,
                      types: active
                        ? f.types.filter((x) => x !== t)
                        : [...f.types, t],
                    }))
                  }}
                  className={[
                    'rounded-sm border px-1.5 py-0.5 text-2xs font-medium transition-colors',
                    active
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border text-muted-foreground hover:border-primary/50',
                  ].join(' ')}
                >
                  {t}
                </button>
              )
            })}
          </div>
        </div>

        {/* Load button */}
        <button
          data-testid="manage-filter-load"
          onClick={() => void fetch()}
          disabled={loading}
          className="rounded-sm border border-border bg-muted px-3 py-1 text-xs font-medium hover:bg-muted/80 disabled:opacity-50"
        >
          {loading ? 'Loading…' : 'Load'}
        </button>
      </div>

      {/* Error */}
      {error && (
        <p className="text-xs text-destructive">{error}</p>
      )}

      {/* Default summary — KPI cards (tied to the loaded/filtered rows) */}
      {pairings.length > 0 && (
        <div data-testid="manage-summary" className="flex flex-wrap gap-2">
          <SummaryCard testid="manage-summary-total" value={summary.total} label="RES pairings" />
          {summary.byType.map((t) => (
            <SummaryCard
              key={t.code}
              testid={`manage-summary-type-${t.code}`}
              value={t.count}
              label={
                <>
                  <span className={t.isAm ? 'font-semibold text-blue-600' : 'font-semibold text-purple-600'}>
                    {t.isAm ? 'AM' : 'PM'}
                  </span>{' '}
                  ({t.code})
                </>
              }
            />
          ))}
          <SummaryCard testid="manage-summary-slots" value={summary.crewSlots} label="crew slots (plan)" />
          <SummaryCard testid="manage-summary-bases" value={summary.bases} label="bases" />
          <SummaryCard testid="manage-summary-dates" value={summary.dates} label="dates" />
        </div>
      )}

      {/* Batch action bar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{selectedIds.size} selected</span>
          <button
            data-testid="res-modify"
            onClick={() => setModifyOpen((v) => !v)}
            className="rounded-sm border border-border px-2 py-1 text-xs font-medium hover:bg-muted/80"
          >
            Modify
          </button>
          <button
            data-testid="res-delete"
            onClick={() => void handleDelete()}
            disabled={deleting}
            className="rounded-sm border border-destructive/50 px-2 py-1 text-xs font-medium text-destructive hover:bg-destructive/10 disabled:opacity-50"
          >
            {deleting ? 'Deleting…' : 'Delete'}
          </button>
          {modifyOpen && (
            <ModifyPanel
              ranks={ranks}
              onApply={handleModify}
              applying={applying}
            />
          )}
        </div>
      )}

      {/* Table */}
      <div className="overflow-auto rounded-md border border-border">
        {pairings.length === 0 && !loading ? (
          <p className="p-4 text-xs text-muted-foreground">
            No RES pairings found for the selected filters.
          </p>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-left">
                <th className="w-8 px-2 py-2">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = someSelected
                    }}
                    onChange={toggleAll}
                    className="rounded-sm border-border"
                  />
                </th>
                <th className="px-3 py-2 font-medium text-muted-foreground">Date</th>
                <th className="px-3 py-2 font-medium text-muted-foreground">Base</th>
                <th className="px-3 py-2 font-medium text-muted-foreground">Div</th>
                <th className="px-3 py-2 font-medium text-muted-foreground">Label</th>
                <th className="px-3 py-2 font-medium text-muted-foreground">Type</th>
                {ranks.map((rank) => (
                  <th key={rank} className="px-3 py-2 font-medium text-muted-foreground">
                    {rank}
                  </th>
                ))}
                <th className="px-3 py-2 font-medium text-muted-foreground">Status</th>
              </tr>
            </thead>
            <tbody>
              {pairings.map((p, i) => {
                const date = civilDate(p)
                const selected = selectedIds.has(p.id)
                return (
                  <tr
                    key={p.id}
                    data-testid={`res-row-${i}`}
                    className={[
                      'border-b border-border last:border-0 hover:bg-muted/20',
                      selected ? 'bg-primary/5' : '',
                    ].join(' ')}
                  >
                    <td className="px-2 py-1">
                      <input
                        type="checkbox"
                        data-testid={`res-row-checkbox-${i}`}
                        checked={selected}
                        onChange={() => toggleRow(p.id)}
                        className="rounded-sm border-border"
                      />
                    </td>
                    <td className="px-3 py-1 font-mono tabular-nums">{date}</td>
                    <td className="px-3 py-1">{p.base}</td>
                    <td className="px-3 py-1">{p.division}</td>
                    <td className="px-3 py-1 font-mono">{p.pairingLabel ?? '—'}</td>
                    <td className="px-3 py-1">{p.assignment}</td>
                    {ranks.map((rank) => {
                      const slot = p.composition.find((s) => s.rank === rank)
                      return (
                        <td
                          key={rank}
                          data-testid={`res-pairing-comp-${date}-${p.assignment}-${rank}`}
                          className="px-3 py-1 font-mono tabular-nums"
                        >
                          {slot !== undefined ? String(slot.plan) : '—'}
                        </td>
                      )
                    })}
                    <td className="px-3 py-1">
                      {p.isFull ? (
                        <span className="text-2xs text-green-600">Full</span>
                      ) : (
                        <span className="text-2xs text-amber-600">Open</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Row count summary */}
      {pairings.length > 0 && (
        <p className="text-2xs text-muted-foreground">{pairings.length} pairing(s) loaded</p>
      )}
    </div>
  )
}
