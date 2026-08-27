import { memo, useEffect, useRef, useState } from 'react'
import type { Flight } from '@/types'
import type { NaviRow } from './flight-navi-filters'

interface FlightNaviTableProps {
  rows: NaviRow[]
  /** Navigate to the pairings that use this flight. */
  onPtnsClick: (flight: Flight) => void
  /** Navigate to the crew flying this flight. */
  onRosterClick: (flight: Flight) => void
  /** Open the flight detail card. */
  onCofClick: (flight: Flight) => void
}

/** UTC HH:mm from an ISO string; the stored timestamps are UTC so we slice rather than reparse. */
const hhmm = (iso: string | null): string => (iso && iso.length >= 16 ? iso.slice(11, 16) : '—')

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const dow = (fltDt: string): string => {
  if (!fltDt) return '—'
  const d = new Date(`${fltDt.slice(0, 10)}T00:00:00Z`)
  return Number.isNaN(d.getTime()) ? '—' : DOW[d.getUTCDay()]
}

/** Column header + fixed width (table-fixed keeps header/body aligned and immune to windowing). */
const COLS: { label: string; w: number }[] = [
  { label: 'STS', w: 48 }, { label: 'Carrier', w: 56 }, { label: 'Date', w: 92 }, { label: 'Dow', w: 44 },
  { label: 'Flight No.', w: 80 }, { label: 'DEP', w: 48 }, { label: 'STD', w: 56 }, { label: 'ATD', w: 56 },
  { label: 'ARR', w: 48 }, { label: 'STA', w: 56 }, { label: 'ATA', w: 56 }, { label: 'A/C', w: 56 },
  { label: 'SubFleet', w: 84 }, { label: 'Registration', w: 100 }, { label: 'Assignment', w: 88 },
  { label: 'PTNs', w: 56 }, { label: 'Roster', w: 60 }, { label: 'COF', w: 56 }, { label: 'Composition', w: 110 },
]

/** Fixed row height (px) used for windowing math; enforced on each rendered row. */
const ROW_H = 28
/** Extra rows rendered above/below the viewport to avoid blank edges while scrolling. */
const OVERSCAN = 10

const TD = 'truncate px-2 py-1 text-xs text-foreground'
const TD_MONO = `${TD} font-mono tabular-nums`

const NaviRowView = memo(({ row, onPtnsClick, onRosterClick, onCofClick }: {
  row: NaviRow
  onPtnsClick: (f: Flight) => void
  onRosterClick: (f: Flight) => void
  onCofClick: (f: Flight) => void
}) => {
  const { flight: f, pairingCount, crewCount } = row
  return (
    <tr data-testid={`flight-navi-row-${f.id}`} style={{ height: ROW_H }} className="border-b border-border/60 hover:bg-accent/40">
      <td className={TD}>
        {f.isCancelled
          ? <span className="rounded bg-destructive/15 px-1 text-2xs font-medium text-destructive">CNL</span>
          : <span className="text-2xs text-muted-foreground">OK</span>}
      </td>
      <td className={TD_MONO}>{f.airline}</td>
      <td className={TD_MONO}>{f.fltDt?.slice(0, 10) || '—'}</td>
      <td className={`${TD} text-muted-foreground`}>{dow(f.fltDt)}</td>
      <td className={TD_MONO} data-testid={`navi-fltnum-${f.id}`}>{f.fltNum}</td>
      <td className={TD_MONO} data-testid={`navi-dep-${f.id}`}>{f.depArp}</td>
      <td className={TD_MONO}>{hhmm(f.schDepDtUtc)}</td>
      <td className={`${TD_MONO} text-muted-foreground`}>{hhmm(f.actDepDtUtc)}</td>
      <td className={TD_MONO} data-testid={`navi-arr-${f.id}`}>{f.arvArp}</td>
      <td className={TD_MONO}>{hhmm(f.schArvDtUtc)}</td>
      <td className={`${TD_MONO} text-muted-foreground`}>{hhmm(f.actArvDtUtc)}</td>
      <td className={TD_MONO}>{f.fleet || '—'}</td>
      {/* SubFleet not carried by the flight list response — deferred backend field. */}
      <td className={`${TD} text-muted-foreground`}>—</td>
      <td className={TD_MONO} data-testid={`navi-reg-${f.id}`}>{f.register || '—'}</td>
      <td className={TD}>{f.flightFlag || '—'}</td>

      {/* Navi cells */}
      <td className={TD}>
        <button
          type="button"
          data-testid={`navi-ptns-${f.id}`}
          disabled={pairingCount === 0}
          onClick={() => onPtnsClick(f)}
          className="font-mono tabular-nums text-primary hover:underline disabled:text-muted-foreground disabled:no-underline"
          title="Bring these pairings to the top of the pairing pane"
        >
          {pairingCount}
        </button>
      </td>
      <td className={TD}>
        <button
          type="button"
          data-testid={`navi-roster-${f.id}`}
          disabled={crewCount === 0}
          onClick={() => onRosterClick(f)}
          className="font-mono tabular-nums text-primary hover:underline disabled:text-muted-foreground disabled:no-underline"
          title="Bring this flight's crew to the top of the roster pane"
        >
          {crewCount}
        </button>
      </td>
      <td className={TD}>
        <button
          type="button"
          data-testid={`navi-cof-${f.id}`}
          onClick={() => onCofClick(f)}
          className="text-primary hover:underline"
          title="Open flight detail"
        >
          COF
        </button>
      </td>
      {/* Composition needs per-flight crew data — deferred backend field. */}
      <td className={`${TD} text-muted-foreground`}>—</td>
    </tr>
  )
})
NaviRowView.displayName = 'NaviRowView'

/**
 * The Flight Navi grid. Row-windowed (only the visible slice + overscan is in the DOM) so a
 * full month of flights renders instantly instead of mounting thousands of <tr> nodes. The
 * header and body share a fixed colgroup so columns stay aligned regardless of the window.
 */
export const FlightNaviTable = memo(({ rows, onPtnsClick, onRosterClick, onCofClick }: FlightNaviTableProps) => {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [viewportH, setViewportH] = useState(600)

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setViewportH(el.clientHeight))
    ro.observe(el)
    setViewportH(el.clientHeight)
    return () => ro.disconnect()
  }, [])

  const total = rows.length
  const start = Math.max(0, Math.floor(scrollTop / ROW_H) - OVERSCAN)
  const end = Math.min(total, start + Math.ceil(viewportH / ROW_H) + OVERSCAN * 2)
  const visible = rows.slice(start, end)
  const topPad = start * ROW_H
  const bottomPad = Math.max(0, (total - end) * ROW_H)

  return (
    <div
      ref={scrollRef}
      className="flex-1 overflow-auto"
      data-testid="flight-navi-table"
      onScroll={(e) => setScrollTop((e.target as HTMLDivElement).scrollTop)}
    >
      <table className="w-full table-fixed border-collapse">
        <colgroup>
          {COLS.map((c) => <col key={c.label} style={{ width: c.w }} />)}
        </colgroup>
        <thead className="sticky top-0 z-10 bg-muted">
          <tr>
            {COLS.map((c) => (
              <th key={c.label} className="truncate border-b border-border px-2 py-1.5 text-left text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {topPad > 0 && <tr style={{ height: topPad }} aria-hidden><td colSpan={COLS.length} /></tr>}
          {visible.map((row) => (
            <NaviRowView
              key={row.flight.id}
              row={row}
              onPtnsClick={onPtnsClick}
              onRosterClick={onRosterClick}
              onCofClick={onCofClick}
            />
          ))}
          {bottomPad > 0 && <tr style={{ height: bottomPad }} aria-hidden><td colSpan={COLS.length} /></tr>}
        </tbody>
      </table>
      {total === 0 && (
        <div className="py-10 text-center text-xs text-muted-foreground" data-testid="flight-navi-empty">
          No flights match the current filters.
        </div>
      )}
    </div>
  )
})
FlightNaviTable.displayName = 'FlightNaviTable'
