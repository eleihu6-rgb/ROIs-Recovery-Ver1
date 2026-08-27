import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { ArrowDown, ArrowUp, ChevronDown, ChevronsUpDown, Loader2, Trash2 } from 'lucide-react'
import { AppDialog, Button, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, cn } from '@rois/ui'
import { TextChipInput } from '@/components/common/text-chip-input'
import { useTimezoneStore } from '@/stores/timezone-store'
import { getScenarioGanttStore } from '@/stores/scenario-gantt-store'
import type {
  AssignmentPatch,
  ScenarioGanttAssignment,
  ScenarioGanttData,
  ScenarioGanttGroundItem,
} from '@/types/scenario-gantt'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  data: ScenarioGanttData
}

interface DeleteRow {
  key: string
  source: 'PA' | 'MA' | 'CR' | 'IMP'
  crewId: string
  startDtUtc: string
  rosterActingRank: string | null
  fltNum: string | null
  depArp: string | null
  arvArp: string | null
  assignmentGroup: string
  assignment: string
  pairingLabel: string
  pairingId: number | null
  endDtUtc?: string
}

const ROW_HEIGHT = 34
const OVERSCAN = 10
type SortDir = 'asc' | 'desc'
type SortKey = 'crewId' | 'startDt' | 'rosterActingRank' | 'fltNum' | 'depArp' | 'arvArp' | 'assignmentGroup' | 'assignment' | 'pairingLabel' | 'source'
const sourceOrder: DeleteRow['source'][] = ['CR', 'MA', 'PA', 'IMP']
const sourceLabel = (source: DeleteRow['source']): string => source === 'IMP' ? 'Imported' : source
const isDeletable = (source: DeleteRow['source']): boolean => source === 'CR' || source === 'MA'
const cellText = (value: unknown): string => value == null || value === '' ? '-' : String(value)
const displayDate = (utc: string, timezone: string): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(utc))

const rowForAssignment = (a: ScenarioGanttAssignment, data: ScenarioGanttData): DeleteRow | null => {
  const pairing = data.pairings.find((p) => p.pairingId === a.pairingId)
  if (!pairing) return null
  const segment = data.pairingSegments.find((s) => s.pairingId === a.pairingId)
  const crew = data.crew.find((c) => c.crewId === a.crewId)
  return {
    key: `P:${a.crewId}:${a.pairingId}`,
    source: a.source,
    crewId: a.crewId,
    startDtUtc: pairing.schStrDtUtc,
    rosterActingRank: crew?.rank ?? null,
    fltNum: segment?.fltNum ?? null,
    depArp: segment?.depArp ?? null,
    arvArp: segment?.arvArp ?? null,
    assignmentGroup: pairing.assignmentGroup,
    assignment: pairing.assignment,
    pairingLabel: pairing.pairingLabel ?? String(a.pairingId),
    pairingId: a.pairingId,
    endDtUtc: pairing.schEndDtUtc,
  }
}

const rowForGround = (g: ScenarioGanttGroundItem): DeleteRow => ({
  key: `G:${g.crewId}:${g.schStrDtUtc}:${g.schEndDtUtc}:${g.assignmentGroup}:${g.assignment}`,
  source: g.source,
  crewId: g.crewId,
  startDtUtc: g.schStrDtUtc,
  rosterActingRank: g.actingRank || null,
  fltNum: null,
  depArp: null,
  arvArp: null,
  assignmentGroup: g.assignmentGroup,
  assignment: g.assignment,
  pairingLabel: g.label ?? g.assignment,
  pairingId: null,
  endDtUtc: g.schEndDtUtc,
})

const sortRows = (rows: DeleteRow[], sort: { key: SortKey; dir: SortDir }, timezone: string): DeleteRow[] => {
  const valueFor = (row: DeleteRow): unknown => sort.key === 'startDt' ? displayDate(row.startDtUtc, timezone) : row[sort.key]
  const isBlank = (v: unknown) => v === null || v === undefined || v === ''
  const out = [...rows]
  out.sort((a, b) => {
    const av = valueFor(a)
    const bv = valueFor(b)
    if (isBlank(av) && isBlank(bv)) return 0
    if (isBlank(av)) return 1
    if (isBlank(bv)) return -1
    const cmp = String(av).localeCompare(String(bv), undefined, { numeric: true })
    return sort.dir === 'asc' ? cmp : -cmp
  })
  return out
}

export const ScenarioBulkDeleteDialog = ({ open, onOpenChange, data }: Props) => {
  const timezone = useTimezoneStore((s) => s.timezone)
  const [crewFilter, setCrewFilter] = useState<string[]>([])
  const [appliedCrewFilter, setAppliedCrewFilter] = useState<string[]>([])
  const [selectedGroups, setSelectedGroups] = useState<Set<string>>(new Set())
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set())
  const [scrollTop, setScrollTop] = useState(0)
  const [viewportHeight, setViewportHeight] = useState(420)
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: 'crewId', dir: 'asc' })
  const [deleting, setDeleting] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  const rows = useMemo(() => {
    const paired = data.assignments.map((a) => rowForAssignment(a, data)).filter((r): r is DeleteRow => r != null)
    const start = data.scenarioStrDt.slice(0, 10)
    const end = data.scenarioEndDt.slice(0, 10)
    const crewSet = new Set(appliedCrewFilter.map((id) => id.trim().toUpperCase()).filter(Boolean))
    return [...paired, ...data.groundItems.map(rowForGround)].filter((row) => {
      const localDate = displayDate(row.startDtUtc, timezone)
      return localDate >= start && localDate <= end && (crewSet.size === 0 || crewSet.has(row.crewId.toUpperCase()))
    }).sort((a, b) =>
      sourceOrder.indexOf(a.source) - sourceOrder.indexOf(b.source) ||
      a.assignmentGroup.localeCompare(b.assignmentGroup) ||
      a.assignment.localeCompare(b.assignment) ||
      a.startDtUtc.localeCompare(b.startDtUtc) ||
      a.crewId.localeCompare(b.crewId),
    )
  }, [data, appliedCrewFilter, timezone])

  const groups = useMemo(() => {
    const map = new Map<string, { key: string; source: DeleteRow['source']; assignmentGroup: string; assignment: string; count: number }>()
    for (const row of rows) {
      const key = `${row.source}|${row.assignmentGroup}|${row.assignment}`
      const existing = map.get(key)
      if (existing) existing.count += 1
      else map.set(key, { key, source: row.source, assignmentGroup: row.assignmentGroup || '(blank)', assignment: row.assignment || '(blank)', count: 1 })
    }
    return [...map.values()].sort((a, b) =>
      sourceOrder.indexOf(a.source) - sourceOrder.indexOf(b.source) ||
      a.assignmentGroup.localeCompare(b.assignmentGroup) ||
      a.assignment.localeCompare(b.assignment),
    )
  }, [rows])

  const groupsBySource = useMemo(() => sourceOrder
    .map((source) => ({
      source,
      groups: groups.filter((group) => group.source === source),
    }))
    .filter((group) => group.groups.length > 0), [groups])

  const visibleRows = useMemo(
    () => rows.filter((row) => selectedGroups.has(`${row.source}|${row.assignmentGroup}|${row.assignment}`)),
    [rows, selectedGroups],
  )
  const sortedVisibleRows = useMemo(() => sortRows(visibleRows, sort, timezone), [visibleRows, sort, timezone])
  const selectedDeleteRows = visibleRows.filter((row) => selectedRows.has(row.key) && isDeletable(row.source))
  const deletableVisibleRows = visibleRows.filter((row) => isDeletable(row.source))
  const allSelected = deletableVisibleRows.length > 0 && deletableVisibleRows.every((row) => selectedRows.has(row.key))

  const virtual = useMemo(() => {
    const start = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN)
    const end = Math.min(sortedVisibleRows.length, start + Math.ceil(viewportHeight / ROW_HEIGHT) + OVERSCAN * 2)
    return { start, end, top: start * ROW_HEIGHT, bottom: Math.max(0, (sortedVisibleRows.length - end) * ROW_HEIGHT), items: sortedVisibleRows.slice(start, end) }
  }, [scrollTop, viewportHeight, sortedVisibleRows])

  useEffect(() => {
    if (!open) {
      setSelectedGroups(new Set())
      setSelectedRows(new Set())
      return
    }
    const el = scrollRef.current
    if (!el) return
    const resize = () => setViewportHeight(Math.max(120, el.clientHeight))
    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(el)
    return () => observer.disconnect()
  }, [open])

  const toggleGroup = (key: string) => {
    setSelectedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      setSelectedRows((selected) => {
        const copy = new Set(selected)
        rows.filter((r) => `${r.source}|${r.assignmentGroup}|${r.assignment}` === key).forEach((r) => {
          if (isDeletable(r.source)) copy.add(r.key)
        })
        return next.has(key) ? copy : new Set([...copy].filter((rowKey) =>
          !rows.some((r) => r.key === rowKey && `${r.source}|${r.assignmentGroup}|${r.assignment}` === key)))
      })
      return next
    })
  }

  const toggleRow = (row: DeleteRow) => {
    if (!isDeletable(row.source)) return
    setSelectedRows((prev) => {
      const next = new Set(prev)
      if (next.has(row.key)) next.delete(row.key)
      else next.add(row.key)
      return next
    })
  }

  const toggleAll = () => {
    setSelectedRows(allSelected ? new Set() : new Set(deletableVisibleRows.map((r) => r.key)))
  }

  const refresh = () => {
    setAppliedCrewFilter(crewFilter)
    setSelectedGroups(new Set())
    setSelectedRows(new Set())
    setScrollTop(0)
    if (scrollRef.current) scrollRef.current.scrollTop = 0
  }

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

  const handleDelete = () => {
    if (selectedDeleteRows.length === 0 || deleting) return
    setDeleting(true)
    const patches: AssignmentPatch[] = selectedDeleteRows.map((row) => row.pairingId != null
      ? { op: 'remove', crewId: row.crewId, pairingId: row.pairingId }
      : {
        op: 'remove',
        crewId: row.crewId,
        pairingId: null,
        startDtUtc: row.startDtUtc,
        endDtUtc: row.endDtUtc,
        assignmentGroup: row.assignmentGroup,
        assignment: row.assignment,
      })
    getScenarioGanttStore(data.scenarioId).getState().addPatch(patches[0])
    patches.slice(1).forEach((patch) => getScenarioGanttStore(data.scenarioId).getState().addPatch(patch))
    setDeleting(false)
    onOpenChange(false)
  }

  return (
    <AppDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Scenario Bulk Delete"
      icon={<Trash2 className="h-4 w-4" />}
      className="max-w-[1440px]"
      bodyClassName="max-h-[72vh] overflow-hidden p-0"
      data-testid="scenario-bulk-delete-dialog"
      footer={<>
        <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={deleting}>Close</Button>
        <Button variant="destructive" onClick={handleDelete} disabled={selectedDeleteRows.length === 0 || deleting}>
          {deleting && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
          Delete selected ({selectedDeleteRows.length})
        </Button>
      </>}
    >
      <div className="flex h-[68vh] min-h-0 flex-col">
        <div className="flex shrink-0 items-center gap-2 border-b border-border bg-muted/30 px-3 py-2">
          <span className="text-xs text-muted-foreground">Scenario date range</span>
          <span className="font-mono text-xs">{data.scenarioStrDt.slice(0, 10)} to {data.scenarioEndDt.slice(0, 10)}</span>
          <span className="text-xs font-medium text-muted-foreground">CrewId</span>
          <TextChipInput
            value={crewFilter}
            onChange={setCrewFilter}
            placeholder="All"
            testId="scenario-bulk-delete-crew-id"
            className="min-w-[150px]"
          />
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={refresh} data-testid="scenario-bulk-delete-refresh">
            Refresh
          </Button>
          <span className="ml-auto text-2xs text-muted-foreground">CR / MA can be deleted · PA is read-only</span>
        </div>
        <div className="grid min-h-0 flex-1 grid-cols-[260px_minmax(0,1fr)]">
          <div className="min-h-0 overflow-auto border-r border-border bg-muted/10 p-2">
            {groupsBySource.map(({ source, groups: sourceGroups }) => (
              <div key={source} className="mb-2">
                <div className={`flex items-center gap-1 px-1 py-1 text-2xs font-bold uppercase ${isDeletable(source) ? 'text-foreground' : 'text-muted-foreground/50'}`}>
                  <ChevronDown className="h-3 w-3" />
                  {sourceLabel(source)}
                </div>
                <div className="pl-3">
                  {sourceGroups.map((group) => (
                    <label key={group.key} className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-xs hover:bg-accent">
                      <input type="checkbox" checked={selectedGroups.has(group.key)} onChange={() => toggleGroup(group.key)} className="h-3.5 w-3.5" />
                      <span className="min-w-0 flex-1 truncate">
                        {group.assignmentGroup} / {group.assignment}
                      </span>
                      <span className="rounded bg-muted px-1 text-2xs">{group.count}</span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
            {groups.length === 0 && <div className="p-2 text-xs text-muted-foreground">No scenario tasks.</div>}
          </div>
          <div ref={scrollRef} className="min-h-0 overflow-auto" onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}>
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-background"><TableRow className="border-b border-border bg-muted/50">
                <TableHead className="w-8 px-2 py-1"><input type="checkbox" checked={allSelected} onChange={toggleAll} className="h-3.5 w-3.5" /></TableHead>
                <SortHead column="crewId">CrewId</SortHead><SortHead column="startDt">StartDt</SortHead>
                <SortHead column="rosterActingRank">Rank</SortHead><SortHead column="fltNum">Flight</SortHead>
                <SortHead column="depArp">Dep</SortHead><SortHead column="arvArp">Arr</SortHead>
                <SortHead column="assignmentGroup">Group</SortHead><SortHead column="assignment">Assign</SortHead>
                <SortHead column="pairingLabel" className="min-w-[180px]">PairingLabel</SortHead><SortHead column="source">Source</SortHead>
              </TableRow></TableHeader>
              <TableBody>
                {virtual.top > 0 && <TableRow><TableCell colSpan={11} style={{ height: virtual.top, padding: 0 }} /></TableRow>}
                {virtual.items.map((row) => {
                  const disabled = !isDeletable(row.source)
                  return <TableRow key={row.key} style={{ height: ROW_HEIGHT }} className={cn('border-b border-border/50 hover:bg-accent/50', disabled ? 'text-muted-foreground/45' : selectedRows.has(row.key) ? 'bg-destructive/5' : undefined)}>
                    <TableCell className="px-2 py-1"><input type="checkbox" checked={selectedRows.has(row.key)} onChange={() => toggleRow(row)} disabled={disabled} className="h-3.5 w-3.5" /></TableCell>
                    <TableCell className="whitespace-nowrap px-2 py-1 font-mono text-xs">{row.crewId}</TableCell>
                    <TableCell className="whitespace-nowrap px-2 py-1 font-mono text-xs">{displayDate(row.startDtUtc, timezone)}</TableCell>
                    <TableCell className="whitespace-nowrap px-2 py-1 font-mono text-xs">{cellText(row.rosterActingRank)}</TableCell>
                    <TableCell className="whitespace-nowrap px-2 py-1 font-mono text-xs">{cellText(row.fltNum)}</TableCell>
                    <TableCell className="whitespace-nowrap px-2 py-1 font-mono text-xs">{cellText(row.depArp)}</TableCell>
                    <TableCell className="whitespace-nowrap px-2 py-1 font-mono text-xs">{cellText(row.arvArp)}</TableCell>
                    <TableCell className="whitespace-nowrap px-2 py-1">{cellText(row.assignmentGroup)}</TableCell>
                    <TableCell className="whitespace-nowrap px-2 py-1">{row.assignment || '(blank)'}</TableCell>
                    <TableCell className="max-w-[220px] truncate px-2 py-1">{row.pairingLabel}</TableCell>
                    <TableCell className="whitespace-nowrap px-2 py-1 font-semibold">{sourceLabel(row.source)}</TableCell>
                  </TableRow>
                })}
                {virtual.bottom > 0 && <TableRow><TableCell colSpan={11} style={{ height: virtual.bottom, padding: 0 }} /></TableRow>}
                {selectedGroups.size === 0 && <TableRow><TableCell colSpan={11} className="h-24 text-center text-xs text-muted-foreground">Select an assignment from the left tree.</TableCell></TableRow>}
                {selectedGroups.size > 0 && visibleRows.length === 0 && <TableRow><TableCell colSpan={11} className="h-24 text-center text-xs text-muted-foreground">No rows match the selected assignment.</TableCell></TableRow>}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>
    </AppDialog>
  )
}
