import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { ArrowDown, ArrowUp, ChevronRight, ChevronsUpDown, Loader2, Trash2 } from 'lucide-react'
import {
  AppDialog,
  Button,
  cn,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@rois/ui'
import { RpSelect } from '@/components/common/rp-select'
import { MultiSelectDropdown } from '@/components/common/multi-select-dropdown'
import { TextChipInput } from '@/components/common/text-chip-input'
import { referenceApi } from '@/services/reference-api'
import { rosterApi, type RosterBulkDeleteCandidate, type RosterBulkDeleteGroup, type RosterBulkDeleteProgress } from '@/services/roster-api'
import { getHttpErrorStatus } from '@/services/http-client'
import { useRosterPeriodStore } from '@/stores/roster-period-store'
import { notify } from '@/utils/notify'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
}

type GroupMode = RosterBulkDeleteGroup['mode']
type SortDir = 'asc' | 'desc'
type SortKey = 'crewId' | 'startDt' | 'rosterActingRank' | 'fltNum' | 'depArp' | 'arvArp' | 'assignmentGroup' | 'assignment' | 'pairingLabel' | 'source'

const ROW_HEIGHT = 34
const OVERSCAN = 10
const SOURCE_OPTIONS = [
  { value: 'IMP', label: 'IMP - Imported' },
  { value: 'MA', label: 'MA - Manual' },
  { value: 'CR', label: 'CR - Optimizer' },
]

const assignmentKey = (assignment: string | null | undefined): string => assignment ?? ''
const assignmentLabel = (assignment: string | null | undefined): string => assignment && assignment.trim() ? assignment : '(blank)'
const modeLabel = (mode: GroupMode): string => mode === 'PAIRED' ? 'With Pairing ID' : 'No Pairing ID'
const modeSort = (mode: GroupMode): number => mode === 'PAIRED' ? 0 : 1
const stageOrder = ['deleting', 'rechecking', 'recomputing-manday', 'broadcasting'] as const
const stageLabels: Record<typeof stageOrder[number], string> = {
  deleting: 'Deleting',
  rechecking: 'Rechecking',
  'recomputing-manday': 'Manday',
  broadcasting: 'Broadcasting',
}
const formatElapsed = (elapsedMs: number): string => `${(Math.max(0, elapsedMs) / 1000).toFixed(1)}s`

const groupKey = (group: Pick<RosterBulkDeleteGroup, 'mode' | 'assignmentGroup' | 'assignment'>): string =>
  `${group.mode}\u001f${encodeURIComponent(group.assignmentGroup)}\u001f${encodeURIComponent(group.assignment)}`

const rowSelectKey = (row: RosterBulkDeleteCandidate): string =>
  row.pairingId && row.pairingId > 0 ? `P:${row.pairingId}:${row.crewId}` : `R:${row.id}`

const cellText = (value: unknown): string => value == null || value === '' ? '-' : String(value)

const sortRows = (rows: RosterBulkDeleteCandidate[], sort: { key: SortKey; dir: SortDir }): RosterBulkDeleteCandidate[] => {
  const isBlank = (v: unknown) => v === null || v === undefined || v === ''
  const out = [...rows]
  out.sort((a, b) => {
    const av = a[sort.key]
    const bv = b[sort.key]
    if (isBlank(av) && isBlank(bv)) return 0
    if (isBlank(av)) return 1
    if (isBlank(bv)) return -1
    const cmp = String(av).localeCompare(String(bv), undefined, { numeric: true })
    return sort.dir === 'asc' ? cmp : -cmp
  })
  return out
}

export const RosterBulkDeleteDialog = ({ open, onOpenChange }: Props) => {
  const rpItems = useRosterPeriodStore((s) => s.items)
  const loadRosterPeriods = useRosterPeriodStore((s) => s.loadRosterPeriods)
  const [selectedRpId, setSelectedRpId] = useState('')
  const [selectedDivisions, setSelectedDivisions] = useState<string[]>([])
  const [selectedBases, setSelectedBases] = useState<string[]>([])
  const [selectedCrewIds, setSelectedCrewIds] = useState<string[]>([])
  const [selectedSources, setSelectedSources] = useState<string[]>([])
  const [divisionOptions, setDivisionOptions] = useState<Array<{ value: string; label: string }>>([])
  const [baseOptions, setBaseOptions] = useState<Array<{ value: string; label: string }>>([])
  const [groups, setGroups] = useState<RosterBulkDeleteGroup[]>([])
  const [rows, setRows] = useState<RosterBulkDeleteCandidate[]>([])
  const [selectedGroupKeys, setSelectedGroupKeys] = useState<Set<string>>(new Set())
  const [selectedRowKeys, setSelectedRowKeys] = useState<Set<string>>(new Set())
  const [loadingGroups, setLoadingGroups] = useState(false)
  const [loadingRows, setLoadingRows] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteProgress, setDeleteProgress] = useState<RosterBulkDeleteProgress | null>(null)
  const [progressSyncAt, setProgressSyncAt] = useState(0)
  const [progressNow, setProgressNow] = useState(Date.now())
  const [scrollTop, setScrollTop] = useState(0)
  const [viewportHeight, setViewportHeight] = useState(420)
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: 'crewId', dir: 'asc' })
  const tableScrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    void loadRosterPeriods()
    void Promise.all([referenceApi.listDivisions(), referenceApi.listBases()])
      .then(([divisions, bases]) => {
        setDivisionOptions(divisions.map((item) => ({
          value: item.division,
          label: item.description ? `${item.division} - ${item.description}` : item.division,
        })))
        setBaseOptions(bases.map((item) => ({
          value: item.base,
          label: item.name ? `${item.base} - ${item.name}` : item.base,
        })))
      })
      .catch((err) => notify.error(err instanceof Error ? err.message : 'Failed to load Division/Base options'))
  }, [open, loadRosterPeriods])

  useEffect(() => {
    if (!open || selectedRpId || rpItems.length === 0) return
    const current = rpItems.find((rp) => rp.isCurrent) ?? rpItems[0]
    setSelectedRpId(String(current.id))
  }, [open, selectedRpId, rpItems])

  const selectedRp = useMemo(
    () => rpItems.find((rp) => String(rp.id) === selectedRpId) ?? null,
    [rpItems, selectedRpId],
  )

  const loadGroups = useCallback(async () => {
    if (!selectedRp) return
    setLoadingGroups(true)
    setRows([])
    setSelectedGroupKeys(new Set())
    setSelectedRowKeys(new Set())
    try {
      const result = await rosterApi.getBulkDeleteCandidates({
        startDate: selectedRp.rpStart,
        endDate: selectedRp.rpEnd,
        divisions: selectedDivisions,
        bases: selectedBases,
        crewIds: selectedCrewIds,
        sources: selectedSources,
      })
      setGroups(result.groups)
    } catch (err) {
      notify.error(err instanceof Error ? err.message : 'Failed to load roster flight groups')
    } finally {
      setLoadingGroups(false)
    }
  }, [selectedRp, selectedDivisions, selectedBases, selectedCrewIds, selectedSources])

  const loadRows = useCallback(async (keys: Set<string>) => {
    if (!selectedRp || keys.size === 0) {
      setRows([])
      setSelectedRowKeys(new Set())
      return
    }
    setLoadingRows(true)
    try {
      const result = await rosterApi.getBulkDeleteCandidates({
        startDate: selectedRp.rpStart,
        endDate: selectedRp.rpEnd,
        groupKeys: [...keys],
        divisions: selectedDivisions,
        bases: selectedBases,
        crewIds: selectedCrewIds,
        sources: selectedSources,
      })
      setRows(result.rows)
      setSelectedRowKeys(new Set(result.rows.map(rowSelectKey)))
      setScrollTop(0)
      if (tableScrollRef.current) tableScrollRef.current.scrollTop = 0
    } catch (err) {
      notify.error(err instanceof Error ? err.message : 'Failed to load roster flights')
    } finally {
      setLoadingRows(false)
    }
  }, [selectedRp, selectedDivisions, selectedBases, selectedCrewIds, selectedSources])

  useEffect(() => {
    if (!open || !selectedRp) return
    void loadGroups()
  }, [open, selectedRp, loadGroups])

  useEffect(() => {
    const el = tableScrollRef.current
    if (!el) return
    const resize = () => setViewportHeight(Math.max(120, el.clientHeight))
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(el)
    return () => ro.disconnect()
  }, [open])

  useEffect(() => {
    if (!deleting || !deleteProgress) return
    const id = window.setInterval(() => setProgressNow(Date.now()), 250)
    return () => window.clearInterval(id)
  }, [deleting, deleteProgress])

  const groupedTree = useMemo(() => {
    const tree = new Map<GroupMode, Map<string, RosterBulkDeleteGroup[]>>()
    for (const group of groups) {
      const byAssignmentGroup = tree.get(group.mode) ?? new Map<string, RosterBulkDeleteGroup[]>()
      const assignmentGroup = group.assignmentGroup || '(blank group)'
      const items = byAssignmentGroup.get(assignmentGroup) ?? []
      items.push(group)
      byAssignmentGroup.set(assignmentGroup, items)
      tree.set(group.mode, byAssignmentGroup)
    }
    return [...tree.entries()].sort((a, b) => modeSort(a[0]) - modeSort(b[0]))
  }, [groups])

  const selectedIds = useMemo(
    () => rows.filter((row) => selectedRowKeys.has(rowSelectKey(row))).map((row) => row.id),
    [rows, selectedRowKeys],
  )

  const selectedPairingCrewKeys = useMemo(() => {
    const map = new Map<string, { pairingId: number; crewId: string }>()
    for (const row of rows) {
      if (!row.pairingId || row.pairingId <= 0 || !selectedRowKeys.has(rowSelectKey(row))) continue
      map.set(`${row.pairingId}:${row.crewId}`, { pairingId: row.pairingId, crewId: row.crewId })
    }
    return [...map.values()]
  }, [rows, selectedRowKeys])

  const allVisibleSelected = rows.length > 0 && rows.every((row) => selectedRowKeys.has(rowSelectKey(row)))

  const sortedRows = useMemo(() => sortRows(rows, sort), [rows, sort])

  const virtual = useMemo(() => {
    const start = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN)
    const count = Math.ceil(viewportHeight / ROW_HEIGHT) + OVERSCAN * 2
    const end = Math.min(sortedRows.length, start + count)
    return {
      start,
      end,
      topPad: start * ROW_HEIGHT,
      bottomPad: Math.max(0, (sortedRows.length - end) * ROW_HEIGHT),
      items: sortedRows.slice(start, end),
    }
  }, [sortedRows, scrollTop, viewportHeight])

  const toggleSort = (key: SortKey) => {
    setSort((prev) => prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' })
  }

  const SortHead = ({ column, children, className }: { column: SortKey; children: ReactNode; className?: string }) => {
    const active = sort.key === column
    const SortIcon = !active ? ChevronsUpDown : sort.dir === 'asc' ? ArrowUp : ArrowDown
    return (
      <TableHead
        aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
        className={cn('cursor-pointer select-none whitespace-nowrap px-2 py-1 text-2xs font-semibold uppercase text-muted-foreground hover:text-foreground', className)}
        onClick={() => toggleSort(column)}
      >
        <span className="flex items-center gap-1">
          {children}
          <SortIcon className={cn('h-3 w-3 shrink-0', active ? 'text-foreground' : 'text-muted-foreground/40')} />
        </span>
      </TableHead>
    )
  }

  const toggleGroup = (group: RosterBulkDeleteGroup) => {
    const key = groupKey(group)
    const next = new Set(selectedGroupKeys)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    setSelectedGroupKeys(next)
    void loadRows(next)
  }

  const toggleRowGroup = (row: RosterBulkDeleteCandidate) => {
    const key = rowSelectKey(row)
    setSelectedRowKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const toggleAllRows = () => {
    setSelectedRowKeys(allVisibleSelected ? new Set() : new Set(rows.map(rowSelectKey)))
  }

  const handleDelete = async () => {
    if (selectedIds.length === 0 || deleting) return
    setDeleting(true)
    setDeleteProgress(null)
    try {
      const ids = selectedIds
      const task = await rosterApi.bulkDelete({ ids, pairingCrewKeys: selectedPairingCrewKeys })
      let result: { deleted: number; crewIds: string[]; durationMs: number } | null = null
      while (!result) {
        const status = await rosterApi.getBulkDeleteTaskStatus(task.taskId)
        setProgressSyncAt(Date.now())
        setDeleteProgress(status.progress)
        if (status.state === 'failed') throw new Error(status.error ?? 'Bulk delete failed')
        if (status.state === 'completed') {
          result = status.result
          break
        }
        await new Promise((resolve) => setTimeout(resolve, 500))
      }
      if (!result) throw new Error('Bulk delete completed without a result')
      notify.success(`Deleted ${result.deleted} roster flight(s) in ${(result.durationMs / 1000).toFixed(1)}s`)
      setSelectedRowKeys(new Set())
      await loadGroups()
      // No active refresh here: the worker already broadcast roster-updated + manday-updated
      // (and the legality child publishes violations.updated when it finishes), so the gantt
      // refreshes via WS push — the same contract as every other roster mutation path.
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Bulk delete failed'
      if (getHttpErrorStatus(err) === 409) notify.warning(message)
      else notify.error(message)
    } finally {
      setDeleting(false)
    }
  }

  const progressElapsedMs = useMemo(() => {
    if (!deleteProgress) return 0
    if (!deleting || deleteProgress.stage === 'completed' || deleteProgress.stage === 'failed') return deleteProgress.elapsedMs
    return deleteProgress.elapsedMs + Math.max(0, progressNow - progressSyncAt)
  }, [deleteProgress, deleting, progressNow, progressSyncAt])

  const stageTimings = useMemo(() => {
    const byStage = new Map(deleteProgress?.stages?.map((stage) => [stage.stage, stage]) ?? [])
    return stageOrder.map((stage) => {
      const item = byStage.get(stage)
      const elapsedMs = item?.status === 'active'
        ? (item.elapsedMs + Math.max(0, progressNow - progressSyncAt))
        : (item?.elapsedMs ?? 0)
      return {
        stage,
        label: stageLabels[stage],
        status: item?.status ?? 'pending',
        elapsedMs,
        message: item?.message,
      }
    })
  }, [deleteProgress, progressNow, progressSyncAt])

  return (
    <AppDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Bulk Delete Roster Flights"
      icon={<Trash2 className="h-4 w-4" />}
      className="max-w-[1440px]"
      bodyClassName="max-h-[72vh] overflow-hidden p-0"
      data-testid="roster-bulk-delete-dialog"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={deleting}>Close</Button>
          <Button variant="destructive" onClick={handleDelete} disabled={selectedIds.length === 0 || deleting}>
            {deleting && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            Delete selected ({selectedIds.length})
          </Button>
        </>
      }
    >
      <div className="flex h-[68vh] min-h-0 flex-col">
        {deleting && deleteProgress && (
          <div className="shrink-0 border-b border-border bg-muted/20 px-3 py-2 text-xs" data-testid="roster-bulk-delete-progress">
            <div className="flex items-center gap-3">
              <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
                <div className="h-full bg-primary transition-[width]" style={{ width: `${deleteProgress.percent}%` }} />
              </div>
              <span className="w-12 text-right tabular-nums">{deleteProgress.percent}%</span>
              <span className="w-20 text-right tabular-nums text-muted-foreground" data-testid="roster-bulk-delete-elapsed">
                {formatElapsed(progressElapsedMs)}
              </span>
              <span className="w-36 text-muted-foreground">{stageLabels[deleteProgress.stage as keyof typeof stageLabels] ?? deleteProgress.stage}</span>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2 lg:grid-cols-4" data-testid="roster-bulk-delete-stage-timings">
              {stageTimings.map((item) => (
                <div
                  key={item.stage}
                  className={cn(
                    'min-w-0 rounded-md border border-border/70 bg-background/80 px-2 py-1',
                    item.status === 'active' && 'border-primary/60 bg-primary/5',
                    item.status === 'failed' && 'border-destructive/60 bg-destructive/5',
                  )}
                  data-status={item.status}
                  data-testid={`roster-bulk-delete-stage-${item.stage}`}
                  title={item.message}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-medium text-foreground">{item.label}</span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">{formatElapsed(item.elapsedMs)}</span>
                  </div>
                  <div className="mt-0.5 truncate text-2xs capitalize text-muted-foreground">{item.status}</div>
                </div>
              ))}
            </div>
          </div>
        )}
        <div className="flex shrink-0 items-center gap-2 border-b border-border bg-muted/30 px-3 py-2">
          <span className="text-xs font-medium text-muted-foreground">RP</span>
          <RpSelect
            value={selectedRpId}
            onValueChange={setSelectedRpId}
            testId="roster-bulk-delete-rp"
            className="h-7 w-40 text-xs"
          />
          <span className="text-xs font-medium text-muted-foreground">Division</span>
          <MultiSelectDropdown
            options={divisionOptions}
            selected={selectedDivisions}
            onChange={setSelectedDivisions}
            placeholder="All"
            testId="roster-bulk-delete-division"
            triggerClassName="h-7 min-w-[130px] text-xs"
          />
          <span className="text-xs font-medium text-muted-foreground">Base</span>
          <MultiSelectDropdown
            options={baseOptions}
            selected={selectedBases}
            onChange={setSelectedBases}
            placeholder="All"
            testId="roster-bulk-delete-base"
            triggerClassName="h-7 min-w-[150px] text-xs"
          />
          <span className="text-xs font-medium text-muted-foreground">CrewId</span>
          <TextChipInput
            value={selectedCrewIds}
            onChange={setSelectedCrewIds}
            placeholder="All"
            testId="roster-bulk-delete-crew-id"
            className="min-w-[150px]"
          />
          <span className="text-xs font-medium text-muted-foreground">Source</span>
          <MultiSelectDropdown
            options={SOURCE_OPTIONS}
            selected={selectedSources}
            onChange={setSelectedSources}
            placeholder="All"
            testId="roster-bulk-delete-source"
            triggerClassName="h-7 min-w-[130px] text-xs"
          />
          {selectedRp && (
            <span className="text-2xs text-muted-foreground">
              {selectedRp.rpStart} to {selectedRp.rpEnd}
            </span>
          )}
          <Button variant="outline" size="sm" className="ml-auto h-7 text-xs" onClick={loadGroups} disabled={!selectedRp || loadingGroups || loadingRows}>
            {(loadingGroups || loadingRows) && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            Refresh
          </Button>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-[260px_minmax(0,1fr)]">
          <div className="min-h-0 overflow-auto border-r border-border bg-muted/10 p-2" data-testid="roster-bulk-delete-tree">
            {loadingGroups ? (
              <div className="flex h-24 items-center justify-center text-xs text-muted-foreground">Loading...</div>
            ) : groupedTree.length === 0 ? (
              <div className="p-2 text-xs text-muted-foreground">No roster flights in this RP.</div>
            ) : groupedTree.map(([mode, byAssignmentGroup]) => (
              <div key={mode} className="mb-3">
                <div className="flex items-center gap-1 px-1 py-1 text-2xs font-bold uppercase text-muted-foreground">
                  <ChevronRight className="h-3 w-3" />
                  {modeLabel(mode)}
                </div>
                {[...byAssignmentGroup.entries()].map(([assignmentGroup, items]) => (
                  <div key={`${mode}-${assignmentGroup}`} className="mb-1 pl-3">
                    <div className="px-1 py-1 text-2xs font-semibold uppercase text-muted-foreground">{assignmentGroup}</div>
                    {items.map((item) => {
                      const key = groupKey(item)
                      return (
                        <label key={key} className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-xs hover:bg-accent">
                          <input
                            type="checkbox"
                            checked={selectedGroupKeys.has(key)}
                            onChange={() => toggleGroup(item)}
                            className="h-3.5 w-3.5"
                          />
                          <span className="min-w-0 flex-1 truncate font-medium">{assignmentLabel(item.assignment)}</span>
                          <span className="rounded bg-muted px-1 text-2xs text-muted-foreground">{item.count}</span>
                        </label>
                      )
                    })}
                  </div>
                ))}
              </div>
            ))}
          </div>

          <div
            ref={tableScrollRef}
            className="min-h-0 overflow-auto"
            onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
          >
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-background">
                <TableRow className="border-b border-border bg-muted/50">
                  <TableHead className="w-8 px-2 py-1">
                    <input type="checkbox" checked={allVisibleSelected} onChange={toggleAllRows} className="h-3.5 w-3.5" />
                  </TableHead>
                  <SortHead column="crewId">CrewId</SortHead>
                  <SortHead column="startDt">StartDt</SortHead>
                  <SortHead column="rosterActingRank">Rank</SortHead>
                  <SortHead column="fltNum">Flight</SortHead>
                  <SortHead column="depArp">Dep</SortHead>
                  <SortHead column="arvArp">Arr</SortHead>
                  <SortHead column="assignmentGroup">Group</SortHead>
                  <SortHead column="assignment">Assign</SortHead>
                  <SortHead column="pairingLabel" className="min-w-[180px]">PairingLabel</SortHead>
                  <SortHead column="source">Source</SortHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {virtual.topPad > 0 && (
                  <TableRow>
                    <TableCell colSpan={11} style={{ height: virtual.topPad, padding: 0 }} />
                  </TableRow>
                )}
                {virtual.items.map((row) => {
                  const selected = selectedRowKeys.has(rowSelectKey(row))
                  return (
                    <TableRow key={row.id} style={{ height: ROW_HEIGHT }} className={cn('border-b border-border/50 hover:bg-accent/50', selected ? 'bg-destructive/5' : undefined)}>
                      <TableCell className="px-2 py-1">
                        <input type="checkbox" checked={selected} onChange={() => toggleRowGroup(row)} className="h-3.5 w-3.5" />
                      </TableCell>
                      <TableCell className="whitespace-nowrap px-2 py-1 font-mono text-xs">{row.crewId}</TableCell>
                      <TableCell className="whitespace-nowrap px-2 py-1 font-mono text-xs">{row.startDt}</TableCell>
                      <TableCell className="whitespace-nowrap px-2 py-1 font-mono text-xs">{cellText(row.rosterActingRank)}</TableCell>
                      <TableCell className="whitespace-nowrap px-2 py-1 font-mono text-xs">{cellText(row.fltNum)}</TableCell>
                      <TableCell className="whitespace-nowrap px-2 py-1 font-mono text-xs">{cellText(row.depArp)}</TableCell>
                      <TableCell className="whitespace-nowrap px-2 py-1 font-mono text-xs">{cellText(row.arvArp)}</TableCell>
                      <TableCell className="whitespace-nowrap px-2 py-1">{cellText(row.assignmentGroup)}</TableCell>
                      <TableCell className="whitespace-nowrap px-2 py-1">{assignmentLabel(row.assignment)}</TableCell>
                      <TableCell className="max-w-[220px] truncate px-2 py-1">{cellText(row.pairingLabel)}</TableCell>
                      <TableCell className="whitespace-nowrap px-2 py-1 font-semibold">{cellText(row.source)}</TableCell>
                    </TableRow>
                  )
                })}
                {virtual.bottomPad > 0 && (
                  <TableRow>
                    <TableCell colSpan={11} style={{ height: virtual.bottomPad, padding: 0 }} />
                  </TableRow>
                )}
                {!loadingRows && selectedGroupKeys.size === 0 && (
                  <TableRow>
                    <TableCell colSpan={11} className="h-24 text-center text-xs text-muted-foreground">
                      Select one or more assignments from the left tree.
                    </TableCell>
                  </TableRow>
                )}
                {!loadingRows && selectedGroupKeys.size > 0 && rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={11} className="h-24 text-center text-xs text-muted-foreground">
                      No rows match the selected assignments.
                    </TableCell>
                  </TableRow>
                )}
                {loadingRows && (
                  <TableRow>
                    <TableCell colSpan={11} className="h-24 text-center text-xs text-muted-foreground">
                      Loading details...
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>
    </AppDialog>
  )
}
