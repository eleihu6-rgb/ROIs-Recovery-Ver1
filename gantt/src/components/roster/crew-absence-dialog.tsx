import { useCallback, useEffect, useState } from 'react'
import {
  AppDialog, Button, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@rois/ui'
import { CalendarOff, Search, X } from 'lucide-react'
import { useUiStore } from '@/stores/ui-store'
import { crewAbsenceApi, type CrewAbsence, type CrewAbsenceQuery } from '@/services/crew-absence-api'
import { bringCrewIdsToTop, bringPairingIdToTop } from '@/utils/bring-matches-to-top'

/**
 * Crew Absence records (crew recovery story 101, step 5 — query UI).
 * Opened from the Live roster pane toolbar; lists absences submitted from the
 * crew app. Row click floats the crew to the top of the roster pane; a removed
 * pairing chip loads that (now open) pairing into the Pairing pane.
 */

const HEADERS = ['Crew', 'Name', 'Type', 'Code', 'From', 'To', 'Base', 'Status', 'Removed pairings', 'Note', 'Submitted']

const monthAgo = (): string => {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - 30)
  return d.toISOString().slice(0, 10)
}

const formatSubmitted = (iso: string): string => iso.slice(0, 16).replace('T', ' ') + ' UTC'

export const CrewAbsenceDialog = () => {
  const open = useUiStore((s) => s.crewAbsenceOpen)
  const close = useUiStore((s) => s.closeCrewAbsenceDialog)

  const [crewId, setCrewId] = useState('')
  const [status, setStatus] = useState<'' | 'active' | 'cancelled'>('active')
  const [fromDate, setFromDate] = useState(monthAgo)
  const [toDate, setToDate] = useState('')
  const [rows, setRows] = useState<CrewAbsence[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const search = useCallback(async () => {
    const query: CrewAbsenceQuery = {
      crewId: crewId.trim() || undefined,
      status: status || undefined,
      fromDate: fromDate || undefined,
      toDate: toDate || undefined,
    }
    setLoading(true)
    setError(null)
    try {
      setRows(await crewAbsenceApi.list(query))
    } catch (err) {
      setRows([])
      setError(err instanceof Error ? err.message : 'Unable to load crew absences.')
    } finally {
      setLoading(false)
    }
  }, [crewId, status, fromDate, toDate])

  useEffect(() => {
    if (open) void search()
    // Load on open only; the Search button re-queries with edited inputs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const clear = () => {
    setCrewId('')
    setStatus('active')
    setFromDate(monthAgo())
    setToDate('')
  }

  return (
    <AppDialog
      open={open}
      onOpenChange={(nextOpen) => { if (!nextOpen) close() }}
      data-testid="crew-absence-dialog"
      className="max-h-[calc(100vh-72px)] w-[calc(100vw-2rem)] sm:max-w-[1180px]"
      bodyClassName="flex min-h-0 flex-col overflow-hidden p-0"
      resizable
      icon={<CalendarOff className="h-4 w-4" />}
      title="Crew Absence"
      description="Absence requests submitted from the crew app and the duties they stood down"
      footer={<Button variant="ghost" onClick={close}>Close</Button>}
    >
      <form
        className="flex flex-wrap items-center gap-2 border-b border-border bg-muted/30 px-4 py-2"
        onSubmit={(e) => { e.preventDefault(); void search() }}
      >
        <Input
          data-testid="crew-absence-filter-crew"
          placeholder="Crew ID"
          value={crewId}
          onChange={(e) => setCrewId(e.target.value)}
          className="h-7 w-32 text-xs font-mono"
        />
        <Select value={status || '__all__'} onValueChange={(v) => setStatus(v === '__all__' ? '' : (v as 'active' | 'cancelled'))}>
          <SelectTrigger data-testid="crew-absence-filter-status" className="h-7 w-32 text-xs">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
        <Input
          type="date"
          data-testid="crew-absence-filter-from"
          value={fromDate}
          onChange={(e) => setFromDate(e.target.value)}
          className="h-7 w-36 text-xs"
          title="Absences ending on or after this date"
        />
        <Input
          type="date"
          data-testid="crew-absence-filter-to"
          value={toDate}
          onChange={(e) => setToDate(e.target.value)}
          className="h-7 w-36 text-xs"
          title="Absences starting on or before this date"
        />
        <Button type="submit" size="sm" className="h-7 gap-1.5 text-xs" data-testid="crew-absence-search" disabled={loading}>
          <Search className="h-3.5 w-3.5 shrink-0" />
          Search
        </Button>
        <Button type="button" variant="ghost" size="sm" className="h-7 gap-1.5 text-xs" onClick={clear}>
          <X className="h-3.5 w-3.5 shrink-0" />
          Clear
        </Button>
        <span className="ml-auto text-2xs text-muted-foreground" data-testid="crew-absence-count">
          {loading ? 'Loading…' : `${rows.length} record${rows.length === 1 ? '' : 's'}`}
        </span>
      </form>

      <div className="min-h-0 flex-1 overflow-auto">
        {error ? (
          <div className="px-4 py-6 text-xs text-destructive" data-testid="crew-absence-error">{error}</div>
        ) : !loading && rows.length === 0 ? (
          <div className="px-4 py-6 text-xs text-muted-foreground" data-testid="crew-absence-empty">No absence records match the filter.</div>
        ) : (
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-background">
              <TableRow>
                {HEADERS.map((label) => <TableHead key={label} className="h-8 whitespace-nowrap px-2 py-1 text-2xs">{label}</TableHead>)}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-testid={`crew-absence-row-${row.id}`}
                  className="cursor-pointer text-xs hover:bg-accent/50"
                  onClick={() => void bringCrewIdsToTop([row.crewId], 'main')}
                  title="Click to bring the crew to the top of the roster pane"
                >
                  <TableCell className="whitespace-nowrap px-2 py-1 font-mono tabular-nums">{row.crewId}</TableCell>
                  <TableCell className="whitespace-nowrap px-2 py-1">{row.crewName ?? '—'}</TableCell>
                  <TableCell className="whitespace-nowrap px-2 py-1 capitalize">{row.absenceType}</TableCell>
                  <TableCell className="whitespace-nowrap px-2 py-1 font-mono">{row.assignment}</TableCell>
                  <TableCell className="whitespace-nowrap px-2 py-1 font-mono tabular-nums">{row.fromDate}</TableCell>
                  <TableCell className="whitespace-nowrap px-2 py-1 font-mono tabular-nums">{row.toDate}</TableCell>
                  <TableCell className="whitespace-nowrap px-2 py-1">{row.base}</TableCell>
                  <TableCell className="whitespace-nowrap px-2 py-1">
                    <span className={row.status === 'active' ? 'rounded-sm bg-primary/10 px-1.5 py-0.5 text-2xs font-medium text-primary' : 'rounded-sm bg-muted px-1.5 py-0.5 text-2xs font-medium text-muted-foreground'}>
                      {row.status}
                    </span>
                  </TableCell>
                  <TableCell className="whitespace-nowrap px-2 py-1">
                    {row.removedPairingIds.length === 0 ? (
                      <span className="text-muted-foreground">none</span>
                    ) : (
                      <span className="inline-flex flex-wrap gap-1">
                        {row.removedPairingIds.map((pairingId) => (
                          <button
                            key={pairingId}
                            type="button"
                            data-testid={`crew-absence-pairing-${pairingId}`}
                            className="rounded-sm border border-border bg-background px-1.5 py-0.5 font-mono text-2xs tabular-nums hover:bg-accent"
                            title="Load this open pairing into the Pairing pane"
                            onClick={(e) => { e.stopPropagation(); void bringPairingIdToTop(pairingId) }}
                          >
                            {pairingId}
                          </button>
                        ))}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="max-w-[240px] truncate px-2 py-1" title={row.note}>{row.note || '—'}</TableCell>
                  <TableCell className="whitespace-nowrap px-2 py-1 font-mono tabular-nums">{formatSubmitted(row.createdAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </AppDialog>
  )
}
