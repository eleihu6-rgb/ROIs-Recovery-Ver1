import { useEffect, useMemo } from 'react'
import { CalendarRange } from 'lucide-react'
import { MultiSelectDropdown } from '@/components/common/multi-select-dropdown'
import { useRosterPeriodStore } from '@/stores/roster-period-store'
import { useFilterStore } from '@/stores/filter-store'
import { useGanttViewStore } from '@/stores/gantt-view-store'
import { useTimezoneStore } from '@/stores/timezone-store'
import { applyMaxSpan } from '@/utils/rp-span'
import { calendarDateToUtcMidnight, endOfCalendarDayUtc } from '@/components/gantt/gantt-utils'

const DAY_MS = 86_400_000
const rpStartMs = (rp: { rpStart: string }, timezone: string): number => calendarDateToUtcMidnight(rp.rpStart, timezone).getTime()
const rpEndMs = (rp: { rpEnd: string }, timezone: string): number => endOfCalendarDayUtc(rp.rpEnd, timezone).getTime()

/** 'YYYY-MM-DD' → 'MM-DD' for the per-option hint. */
const shortRange = (start: string, end: string): string => `${start.slice(5)} ~ ${end.slice(5)}`

/** Shift a 'YYYY-MM-DD' string by whole days (UTC) → 'YYYY-MM-DD'. */
const shiftDate = (dateStr: string, days: number): string => {
  const d = new Date(`${dateStr}T00:00:00.000Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/**
 * Live-toolbar RP multi-select. Replaces the free-form date-range picker: the user
 * picks one or more roster periods; the Gantt window becomes
 * [min(rp_start) − 7d, max(rp_end) + 7d]. Selecting an RP only updates the filter
 * conditions (selection + date range) — it does NOT auto-requery; the toolbar shows
 * a "No data loaded / RP Date changed — apply filters to pull data" hint and the
 * query runs on the explicit Apply (applyGanttFilters). Selection span is capped at
 * maxSpan (default 6); a click that would exceed it drops the selected endpoint farther
 * from the clicked RP via applyMaxSpan. Older (historical) RPs load incrementally through
 * "Load earlier RPs".
 */
export function RpMultiSelect() {
  const items = useRosterPeriodStore((s) => s.items)
  const maxSpan = useRosterPeriodStore((s) => s.maxSpan)
  const hasOlder = useRosterPeriodStore((s) => s.hasOlder)
  const loadingMore = useRosterPeriodStore((s) => s.loadingMore)
  const load = useRosterPeriodStore((s) => s.loadRosterPeriods)
  const loadOlder = useRosterPeriodStore((s) => s.loadOlderRosterPeriods)
  const timezone = useTimezoneStore((s) => s.timezone)
  const selected = useFilterStore((s) => s.selectedRosterPeriodIds)
  const setSelectedRosterPeriodSelection = useFilterStore((s) => s.setSelectedRosterPeriodSelection)

  useEffect(() => {
    void load()
  }, [load])

  // Default to the RP containing now() so the selection + gantt window match on first load.
  // Sets the range but does not apply — the normal open / Apply flow loads the window.
  useEffect(() => {
    if (selected.length > 0 || items.length === 0) return
    const current = items.find((rp) => rp.isCurrent) ?? items[0]
    if (!current) return
    const rpStart = rpStartMs(current, timezone)
    const rpEnd = rpEndMs(current, timezone)
    setSelectedRosterPeriodSelection([String(current.id)], { startMs: rpStart, endMs: rpEnd })
    useFilterStore.getState().setDateRange(new Date(rpStart - 7 * DAY_MS), new Date(rpEnd + 7 * DAY_MS))
    const store = useGanttViewStore.getState()
    const width = store.viewportWidth || undefined
    store.zoomToRp(rpStart, rpEnd, new Date(rpStart - 7 * DAY_MS), width)
  }, [items, selected.length, setSelectedRosterPeriodSelection, timezone])

  const options = useMemo(
    () => items.map((rp) => ({
      value: String(rp.id),
      label: rp.rosterPeriod,
      hint: shortRange(rp.rpStart, rp.rpEnd),
    })),
    [items],
  )

  // Merged loaded window for the current selection: [min(rp_start)−7d, max(rp_end)+7d].
  // YYYY-MM-DD strings compare lexically = chronologically.
  const summary = useMemo(() => {
    if (selected.length === 0) return undefined
    const chosen = items.filter((rp) => selected.includes(String(rp.id)))
    if (chosen.length === 0) return undefined
    let start = chosen[0].rpStart
    let end = chosen[0].rpEnd
    for (const rp of chosen) {
      if (rp.rpStart < start) start = rp.rpStart
      if (rp.rpEnd > end) end = rp.rpEnd
    }
    return `${shiftDate(start, -7)} ~ ${shiftDate(end, 7)}`
  }, [items, selected])

  const handleChange = (next: string[]): void => {
    if (next.length === 0) {
      setSelectedRosterPeriodSelection([], null)
      return
    }
    const adjusted = applyMaxSpan(next, selected, items, maxSpan)
    const chosen = items.filter((rp) => adjusted.includes(String(rp.id)))
    if (chosen.length === 0) return
    const selectedStart = Math.min(...chosen.map((rp) => rpStartMs(rp, timezone)))
    const selectedEnd = Math.max(...chosen.map((rp) => rpEndMs(rp, timezone)))
    setSelectedRosterPeriodSelection(adjusted, { startMs: selectedStart, endMs: selectedEnd })
    const start = selectedStart - 7 * DAY_MS
    const end = selectedEnd + 7 * DAY_MS
    useFilterStore.getState().setDateRange(new Date(start), new Date(end))
    // Zoom to the selected RP range immediately so the viewport lands on the RP(s)
    // before data loads and does not jump after Apply (Apply never moves the view).
    const store = useGanttViewStore.getState()
    store.zoomToRp(selectedStart, selectedEnd, new Date(start), store.viewportWidth || undefined)
    // RP 选择只更新筛选条件，不自动触发查询 —— 工具栏会显示
    // 「No data loaded / RP Date changed — apply filters to pull data」提示，
    // 由用户点击 Apply Filters 后才真正拉取数据（避免选 RP 时整条加载管线重复触发）。
  }

  return (
    <div className="flex items-center">
      <CalendarRange className="mr-1 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <MultiSelectDropdown
        options={options}
        selected={selected}
        onChange={handleChange}
        placeholder="Select RPs"
        testId="toolbar-rp-multiselect"
        triggerClassName="min-w-[160px]"
        triggerTooltip="Select up to 6 roster periods (max span, for performance)"
        summary={summary}
        summaryTestId="toolbar-rp-multiselect-range"
        loadMoreAvailable={hasOlder}
        onLoadMore={() => void loadOlder()}
        loadingMore={loadingMore}
        loadMoreLabel="Load earlier RPs"
        loadMoreTestId="toolbar-rp-multiselect-load-more"
        footerHint="Max 6 RPs span (performance)"
        summaryOnly
        dropdownMinWidth={240}
      />
    </div>
  )
}
