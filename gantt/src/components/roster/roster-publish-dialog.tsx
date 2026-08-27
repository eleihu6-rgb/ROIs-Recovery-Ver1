import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Loader2, Send, Search, RotateCcw } from 'lucide-react'
import {
  AppDialog,
  Badge,
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  cn,
} from '@rois/ui'
import { MultiSelectDropdown, type SelectOption } from '@/components/common/multi-select-dropdown'
import { RpSelect } from '@/components/common/rp-select'
import { useRosterPeriodStore } from '@/stores/roster-period-store'
import {
  rosterPublishApi,
  type RosterPublishDiffRequest,
  type RosterPublishDiffResponse,
  type RosterPublishDiffRow,
  type RosterPublishStatus,
} from '@/services/roster-publish-api'
import { useAirportTzStore } from '@/stores/airport-tz-store'
import { useReferenceStore } from '@/stores/reference-store'
import { formatTime } from '@/stores/timezone-store'
import { notify } from '@/utils/notify'

interface RosterPublishDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

type StatusFilter = 'CHANGES' | RosterPublishStatus

interface Filters {
  rosterPeriodId: string
  divisions: string[]
  crewFleets: string[]
  bases: string[]
  crewId: string
  pairingId: string
  pairingLabel: string
  status: StatusFilter
}

const TABLE_COLUMN_COUNT = 15
const TABLE_HEAD_CLASS = 'sticky top-0 z-20 whitespace-nowrap border-b border-border bg-card/95 text-2xs'
const VIRTUAL_ROW_HEIGHT = 36
const VIRTUAL_OVERSCAN_ROWS = 10
const VIRTUAL_VIEWPORT_HEIGHT = 620

const EMPTY_SUMMARY: RosterPublishDiffResponse['summary'] = {
  add: 0,
  update: 0,
  delete: 0,
  noChange: 0,
  actionable: 0,
}

const defaultFilters = (): Filters => ({
  rosterPeriodId: '',
  divisions: ['P'],
  crewFleets: [],
  bases: [],
  crewId: '',
  pairingId: '',
  pairingLabel: '',
  status: 'CHANGES',
})

const statusList = (status: StatusFilter): RosterPublishStatus[] | undefined => {
  if (status === 'CHANGES') return ['ADD', 'UPDATE', 'DELETE', 'NO_CHANGE']
  return [status]
}

const fmtDateOnly = (iso: string | null): string => {
  if (!iso) return '-'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toISOString().slice(0, 10)
}

const rowActionable = (row: RosterPublishDiffRow): boolean => row.status !== 'NO_CHANGE'

const statusLabel = (status: RosterPublishStatus): string => {
  if (status === 'ADD') return 'Add'
  if (status === 'UPDATE') return 'Update'
  if (status === 'DELETE') return 'Delete'
  return 'No change'
}

const statusClass = (status: RosterPublishStatus): string => {
  if (status === 'ADD') return 'border-blue-500/40 bg-blue-500/10 text-blue-600 dark:text-blue-300'
  if (status === 'UPDATE') return 'border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-300'
  if (status === 'DELETE') return 'border-destructive/40 bg-destructive/10 text-destructive'
  return 'border-border bg-muted/40 text-muted-foreground'
}

const Field = ({
  label,
  children,
  className,
}: {
  label: string
  children: ReactNode
  className?: string
}): ReactNode => (
  <div className={cn('flex min-w-0 items-center gap-1.5', className)}>
    <span className="w-10 shrink-0 text-right text-2xs font-medium leading-none text-muted-foreground">{label}</span>
    <span className="min-w-0 flex-1">{children}</span>
  </div>
)

const buildRequest = (filters: Filters, page: number): RosterPublishDiffRequest | null => {
  const rosterPeriodId = Number(filters.rosterPeriodId)
  if (!Number.isFinite(rosterPeriodId) || rosterPeriodId <= 0) return null
  const pairingId = filters.pairingId.trim() ? Number(filters.pairingId.trim()) : undefined
  return {
    rosterPeriodId,
    divisions: filters.divisions,
    crewFleets: filters.crewFleets,
    bases: filters.bases,
    crewId: filters.crewId.trim() || undefined,
    pairingId: Number.isFinite(pairingId) && pairingId ? pairingId : undefined,
    pairingLabel: filters.pairingLabel.trim() || undefined,
    statuses: statusList(filters.status),
    page,
    pageSize: 0,
  }
}

export const RosterPublishDialog = ({ open, onOpenChange }: RosterPublishDialogProps): ReactNode => {
  const zoneIdForAirport = useAirportTzStore((s) => s.zoneIdFor)
  const loadAirportTz = useAirportTzStore((s) => s.load)
  const bases = useReferenceStore((s) => s.bases)
  const fleets = useReferenceStore((s) => s.fleets)
  const divisions = useReferenceStore((s) => s.divisions)
  const referencesLoading = useReferenceStore((s) => s.loading)
  const loadReferences = useReferenceStore((s) => s.load)

  const periods = useRosterPeriodStore((s) => s.items)
  const periodsLoading = useRosterPeriodStore((s) => s.loading)
  const [filters, setFilters] = useState<Filters>(() => defaultFilters())
  const [lastRequest, setLastRequest] = useState<RosterPublishDiffRequest | null>(null)
  const [rows, setRows] = useState<RosterPublishDiffRow[]>([])
  const [summary, setSummary] = useState<RosterPublishDiffResponse['summary']>(EMPTY_SUMMARY)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const tableScrollRef = useRef<HTMLDivElement | null>(null)
  const [tableScrollTop, setTableScrollTop] = useState(0)

  useEffect(() => {
    if (!open) return
    void loadReferences()
    void loadAirportTz()
  }, [open, loadReferences, loadAirportTz])

  // Default to the current RP (or first) once the windowed list is available.
  useEffect(() => {
    if (!open || filters.rosterPeriodId || periods.length === 0) return
    const current = periods.find((p) => p.isCurrent) ?? periods[0]
    if (current) setFilters((prev) => ({ ...prev, rosterPeriodId: String(current.id) }))
  }, [open, filters.rosterPeriodId, periods])

  useEffect(() => {
    if (!open) {
      setConfirming(false)
    }
  }, [open])

  const selectedPeriod = useMemo(
    () => periods.find((period) => String(period.id) === filters.rosterPeriodId) ?? null,
    [periods, filters.rosterPeriodId],
  )

  const fleetOptions: SelectOption[] = useMemo(
    () => fleets.map((fleet) => ({
      value: fleet.fleet,
      label: fleet.description && fleet.description !== fleet.fleet ? `${fleet.fleet} - ${fleet.description}` : fleet.fleet,
    })),
    [fleets],
  )

  const baseOptions: SelectOption[] = useMemo(
    () => bases.map((base) => ({
      value: base.base,
      label: base.name && base.name !== base.base ? `${base.base} - ${base.name}` : base.base,
    })),
    [bases],
  )

  const divisionOptions: SelectOption[] = useMemo(
    () => divisions.map((division) => ({
      value: division.division,
      label: division.description && division.description !== division.division
        ? `${division.division} - ${division.description}`
        : division.division,
    })),
    [divisions],
  )

  const zoneIdForBase = (base: string | null): string => {
    const baseCode = base?.split(' | ')[0]?.trim() ?? ''
    return zoneIdForAirport(baseCode) ?? 'UTC'
  }

  const updateDropdownFilters = (patch: Partial<Filters>): void => {
    const next = { ...filters, ...patch }
    setFilters(next)
    const request = buildRequest(next, 1)
    if (!open || !request || periodsLoading || publishing) return
    void runSearch(1, request)
  }

  const selectedRows = useMemo(
    () => rows.filter((row) => rowActionable(row) && selectedKeys.has(row.key)),
    [rows, selectedKeys],
  )

  const selectedBreakdown = useMemo(() => ({
    add: selectedRows.filter((row) => row.status === 'ADD').length,
    update: selectedRows.filter((row) => row.status === 'UPDATE').length,
    delete: selectedRows.filter((row) => row.status === 'DELETE').length,
  }), [selectedRows])

  const runSearch = async (nextPage = 1, requestOverride?: RosterPublishDiffRequest): Promise<void> => {
    const request = requestOverride ?? buildRequest(filters, nextPage)
    if (!request) {
      notify.warning('Select a roster period first')
      return
    }
    setLoading(true)
    setLoadError(null)
    try {
      const result = await rosterPublishApi.diff({ ...request, page: nextPage })
      setRows(result.items)
      setSummary(result.summary)
      setTotal(result.total)
      setPage(result.page)
      setLastRequest({ ...request, page: result.page })
      setSelectedKeys(new Set(result.items.filter(rowActionable).map((row) => row.key)))
      setTableScrollTop(0)
      if (tableScrollRef.current) tableScrollRef.current.scrollTop = 0
      setConfirming(false)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load publish diff'
      setLoadError(message)
      notify.error(message)
    } finally {
      setLoading(false)
    }
  }

  const resetFilters = (): void => {
    setFilters((prev) => ({
      ...defaultFilters(),
      rosterPeriodId: prev.rosterPeriodId,
    }))
  }

  const toggleOne = (row: RosterPublishDiffRow): void => {
    if (!rowActionable(row)) return
    setSelectedKeys((prev) => {
      const next = new Set(prev)
      next.has(row.key) ? next.delete(row.key) : next.add(row.key)
      return next
    })
  }

  const toggleVisible = (): void => {
    const actionable = rows.filter(rowActionable)
    if (actionable.length === 0) return
    const allSelected = actionable.every((row) => selectedKeys.has(row.key))
    setSelectedKeys((prev) => {
      const next = new Set(prev)
      for (const row of actionable) {
        if (allSelected) next.delete(row.key)
        else next.add(row.key)
      }
      return next
    })
  }

  const applySelected = async (): Promise<void> => {
    if (!lastRequest || selectedRows.length === 0) return
    setPublishing(true)
    try {
      const result = await rosterPublishApi.apply({
        rosterPeriodId: lastRequest.rosterPeriodId,
        keys: selectedRows.map((row) => row.key),
      })
      notify.success(`Published ${result.applied} change(s)`)
      setConfirming(false)
      await runSearch(page, lastRequest)
    } catch (err) {
      notify.error(err instanceof Error ? err.message : 'Publish failed')
    } finally {
      setPublishing(false)
    }
  }

  const visibleActionable = rows.filter(rowActionable)
  const allVisibleSelected = visibleActionable.length > 0 && visibleActionable.every((row) => selectedKeys.has(row.key))

  const virtualRange = useMemo(() => {
    const start = Math.max(0, Math.floor(tableScrollTop / VIRTUAL_ROW_HEIGHT) - VIRTUAL_OVERSCAN_ROWS)
    const end = Math.min(
      rows.length,
      Math.ceil((tableScrollTop + VIRTUAL_VIEWPORT_HEIGHT) / VIRTUAL_ROW_HEIGHT) + VIRTUAL_OVERSCAN_ROWS,
    )
    return {
      start,
      end,
      topHeight: start * VIRTUAL_ROW_HEIGHT,
      bottomHeight: Math.max(0, (rows.length - end) * VIRTUAL_ROW_HEIGHT),
    }
  }, [rows.length, tableScrollTop])

  const visibleRows = useMemo(
    () => rows.slice(virtualRange.start, virtualRange.end),
    [rows, virtualRange],
  )

  const summaryBadges = (
    <div className="flex flex-wrap items-center gap-1.5">
      <Badge variant="outline" className="border-blue-500/40 bg-blue-500/10 text-blue-600">Add {summary.add}</Badge>
      <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 text-amber-600">Update {summary.update}</Badge>
      <Badge variant="outline" className="border-destructive/40 bg-destructive/10 text-destructive">Delete {summary.delete}</Badge>
      <Badge variant="outline" className="text-muted-foreground">No change {summary.noChange}</Badge>
    </div>
  )

  const footer = (
    <div className="flex w-full items-center gap-3">
      <div className="mr-auto flex min-w-0 flex-wrap items-center gap-3">
        {summaryBadges}
        <span data-testid="roster-publish-selected-count" className="text-xs text-muted-foreground">
          Selected: {selectedRows.length}/{total}
        </span>
        {loadError && <span className="text-xs text-destructive">{loadError}</span>}
      </div>
      {confirming && (
        <span className="text-xs text-muted-foreground">
          Publish {selectedRows.length}: {selectedBreakdown.add} Add, {selectedBreakdown.update} Update, {selectedBreakdown.delete} Delete
        </span>
      )}
      <Button variant="ghost" size="sm" disabled={publishing} onClick={() => confirming ? setConfirming(false) : onOpenChange(false)}>
        {confirming ? 'Back' : 'Close'}
      </Button>
      <Button
        size="sm"
        disabled={selectedRows.length === 0 || publishing || loading}
        onClick={() => { confirming ? void applySelected() : setConfirming(true) }}
        data-testid={confirming ? 'roster-publish-confirm' : 'roster-publish-apply'}
      >
        {publishing ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Send className="mr-1.5 h-3.5 w-3.5" />}
        {confirming ? 'Publish' : 'Publish Selected'}
      </Button>
    </div>
  )

  return (
    <AppDialog
      open={open}
      onOpenChange={(next) => { if (!publishing) onOpenChange(next) }}
      title="Publish Roster"
      icon={<Send className="h-4 w-4" />}
      data-testid="roster-publish-dialog"
      className="max-h-[calc(100vh-72px)] w-[calc(100vw-2rem)] sm:max-w-[min(1480px,calc(100vw-32px))]"
      bodyClassName="flex min-h-0 flex-col overflow-hidden p-0"
      dismissable={!publishing}
      footer={footer}
    >
      <div
        className="shrink-0 space-y-1.5 border-b border-border bg-muted/15 px-4 py-2"
        data-testid="roster-publish-filters"
      >
        <div className="grid grid-cols-[150px_145px_135px_165px_165px_175px_175px] items-center gap-2">
          <Field label="RP">
            <RpSelect
              testId="roster-publish-period"
              value={filters.rosterPeriodId}
              onValueChange={(value) => updateDropdownFilters({ rosterPeriodId: value })}
              disabled={publishing}
              className="h-7 min-w-0 flex-1 text-xs"
            />
          </Field>
          <Field label="Start">
            <Input className="h-7 min-w-0 flex-1 text-xs" value={selectedPeriod?.rpStart ?? ''} readOnly disabled data-testid="roster-publish-start-date" />
          </Field>
          <Field label="End">
            <Input className="h-7 min-w-0 flex-1 text-xs" value={selectedPeriod?.rpEnd ?? ''} readOnly disabled data-testid="roster-publish-end-date" />
          </Field>
          <Field label="Status">
            <Select
              value={filters.status}
              onValueChange={(value) => updateDropdownFilters({ status: value as StatusFilter })}
            >
              <SelectTrigger data-testid="roster-publish-status" className="h-7 min-w-0 flex-1 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="CHANGES">All changes</SelectItem>
                <SelectItem value="ADD">Add</SelectItem>
                <SelectItem value="UPDATE">Update</SelectItem>
                <SelectItem value="DELETE">Delete</SelectItem>
                <SelectItem value="NO_CHANGE">No change</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Div">
            <MultiSelectDropdown
              options={divisionOptions}
              selected={filters.divisions}
              onChange={(divisionValues) => updateDropdownFilters({ divisions: divisionValues })}
              placeholder={referencesLoading ? 'Loading divisions' : 'All divisions'}
              testId="roster-publish-division"
            />
          </Field>
          <Field label="Fleet">
            <MultiSelectDropdown
              options={fleetOptions}
              selected={filters.crewFleets}
              onChange={(crewFleets) => updateDropdownFilters({ crewFleets })}
              placeholder={referencesLoading ? 'Loading fleets' : 'All fleets'}
              testId="roster-publish-fleet"
            />
          </Field>
          <Field label="Base">
            <MultiSelectDropdown
              options={baseOptions}
              selected={filters.bases}
              onChange={(basesValue) => updateDropdownFilters({ bases: basesValue })}
              placeholder={referencesLoading ? 'Loading bases' : 'All bases'}
              testId="roster-publish-bases"
            />
          </Field>
        </div>
        <div className="grid grid-cols-[150px_150px_260px_168px] items-center gap-2">
          <Field label="Crew">
            <Input
              data-testid="roster-publish-crew-id"
              className="h-7 min-w-0 flex-1 text-xs"
              value={filters.crewId}
              onChange={(event) => setFilters((prev) => ({ ...prev, crewId: event.target.value }))}
            />
          </Field>
          <Field label="PID">
            <Input
              data-testid="roster-publish-pairing-id"
              className="h-7 min-w-0 flex-1 text-xs"
              inputMode="numeric"
              value={filters.pairingId}
              onChange={(event) => setFilters((prev) => ({ ...prev, pairingId: event.target.value.replace(/[^\d]/g, '') }))}
            />
          </Field>
          <Field label="Label">
            <Input
              data-testid="roster-publish-pairing-label"
              className="h-7 min-w-0 flex-1 text-xs"
              value={filters.pairingLabel}
              onChange={(event) => setFilters((prev) => ({ ...prev, pairingLabel: event.target.value }))}
            />
          </Field>
          <div className="flex items-center gap-1.5">
            <Button
              size="sm"
              className="h-7 flex-1 gap-1.5 px-2.5 text-xs"
              disabled={loading || periodsLoading || publishing}
              onClick={() => { void runSearch(1) }}
              data-testid="roster-publish-search"
            >
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
              Search
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 flex-1 gap-1.5 px-2.5 text-xs"
              disabled={loading || publishing}
              onClick={resetFilters}
              data-testid="roster-publish-reset"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset
            </Button>
          </div>
        </div>
      </div>

      <div
        ref={tableScrollRef}
        className="min-h-0 flex-1 overflow-auto [&>div]:overflow-visible"
        data-testid="roster-publish-table-scroll"
        onScroll={(event) => setTableScrollTop(event.currentTarget.scrollTop)}
      >
        <Table data-testid="roster-publish-table">
          <TableHeader className="bg-card">
            <TableRow>
              <TableHead className={cn(TABLE_HEAD_CLASS, 'w-9 px-3')}>
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5 accent-primary"
                  checked={allVisibleSelected}
                  disabled={visibleActionable.length === 0}
                  onChange={toggleVisible}
                  aria-label="Select all changes"
                />
              </TableHead>
              <TableHead className={TABLE_HEAD_CLASS}>Date</TableHead>
              <TableHead className={TABLE_HEAD_CLASS}>Crew ID</TableHead>
              <TableHead className={TABLE_HEAD_CLASS}>Crew Name</TableHead>
              <TableHead className={TABLE_HEAD_CLASS}>Crew Fleet</TableHead>
              <TableHead className={TABLE_HEAD_CLASS}>Base</TableHead>
              <TableHead className={TABLE_HEAD_CLASS}>Pairing ID</TableHead>
              <TableHead className={TABLE_HEAD_CLASS}>Pairing Label</TableHead>
              <TableHead className={TABLE_HEAD_CLASS}>Assignment</TableHead>
              <TableHead className={TABLE_HEAD_CLASS}>Acting Rank</TableHead>
              <TableHead className={TABLE_HEAD_CLASS}>Start</TableHead>
              <TableHead className={TABLE_HEAD_CLASS}>End</TableHead>
              <TableHead className={TABLE_HEAD_CLASS}>Status</TableHead>
              <TableHead className={TABLE_HEAD_CLASS}>Source</TableHead>
              <TableHead className={TABLE_HEAD_CLASS}>NOC</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && (
              <TableRow>
                <TableCell colSpan={TABLE_COLUMN_COUNT} className="h-40 text-center text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />Loading publish differences...</span>
                </TableCell>
              </TableRow>
            )}
            {!loading && rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={TABLE_COLUMN_COUNT} className="h-40 text-center text-xs text-muted-foreground">
                  Click Search to compare live roster with published roster.
                </TableCell>
              </TableRow>
            )}
            {!loading && virtualRange.topHeight > 0 && (
              <TableRow aria-hidden="true">
                <TableCell colSpan={TABLE_COLUMN_COUNT} className="p-0" style={{ height: virtualRange.topHeight }} />
              </TableRow>
            )}
            {!loading && visibleRows.map((row) => {
              const selected = selectedKeys.has(row.key)
              const actionable = rowActionable(row)
              return (
                <TableRow
                  key={row.key}
                  data-testid={`roster-publish-row-${row.key}`}
                  style={{ height: VIRTUAL_ROW_HEIGHT }}
                  className={cn(
                    actionable ? 'cursor-pointer' : 'bg-muted/30 text-muted-foreground',
                    selected && 'bg-primary/5',
                  )}
                  onClick={() => toggleOne(row)}
                >
                  <TableCell className="px-3">
                    <input
                      type="checkbox"
                      className="h-3.5 w-3.5 accent-primary disabled:opacity-40"
                      checked={actionable && selected}
                      disabled={!actionable}
                      onClick={(event) => event.stopPropagation()}
                      onChange={() => toggleOne(row)}
                    />
                  </TableCell>
                  <TableCell className="whitespace-nowrap font-mono text-xs tabular-nums">{fmtDateOnly(row.schStrDtUtc)}</TableCell>
                  <TableCell className="whitespace-nowrap font-mono text-xs tabular-nums">{row.crewId}</TableCell>
                  <TableCell className="whitespace-nowrap text-xs">{row.crewName || '-'}</TableCell>
                  <TableCell className="whitespace-nowrap text-xs">{row.crewFleet || '-'}</TableCell>
                  <TableCell className="whitespace-nowrap text-xs">{row.base || '-'}</TableCell>
                  <TableCell className="whitespace-nowrap font-mono text-xs tabular-nums">{row.pairingId ?? '-'}</TableCell>
                  <TableCell className="whitespace-nowrap font-mono text-xs">{row.pairingLabel || '-'}</TableCell>
                  <TableCell className="whitespace-nowrap text-xs">{row.assignment || row.assignmentGroup || '-'}</TableCell>
                  <TableCell className="whitespace-nowrap text-xs">{row.actingRank || '-'}</TableCell>
                  <TableCell className="whitespace-nowrap font-mono text-xs tabular-nums">{row.schStrDtUtc ? formatTime(row.schStrDtUtc, zoneIdForBase(row.base)) : '-'}</TableCell>
                  <TableCell className="whitespace-nowrap font-mono text-xs tabular-nums">{row.schEndDtUtc ? formatTime(row.schEndDtUtc, zoneIdForBase(row.base)) : '-'}</TableCell>
                  <TableCell className="whitespace-nowrap text-xs">
                    <Badge variant="outline" className={cn('text-2xs', statusClass(row.status))}>
                      {statusLabel(row.status)}
                    </Badge>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{row.source ?? '-'}</TableCell>
                  <TableCell className="whitespace-nowrap text-2xs">
                    {row.noc === 'Pending' && (
                      <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-300">Pending</Badge>
                    )}
                    {row.noc === 'Success' && (
                      <Badge variant="outline" className="border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300">Success</Badge>
                    )}
                    {row.noc === 'Ignore' && <span className="text-muted-foreground">Ignore</span>}
                    {row.noc == null && <span className="text-muted-foreground">-</span>}
                  </TableCell>
                </TableRow>
              )
            })}
            {!loading && virtualRange.bottomHeight > 0 && (
              <TableRow aria-hidden="true">
                <TableCell colSpan={TABLE_COLUMN_COUNT} className="p-0" style={{ height: virtualRange.bottomHeight }} />
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </AppDialog>
  )
}
