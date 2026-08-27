import { useEffect, useRef } from 'react'
import { Calendar } from 'lucide-react'
import { useRosterPeriodStore } from '@/stores/roster-period-store'
import type { RosterPeriodOption } from '@/services/roster-period-api'

interface Props {
  open: boolean
  x: number
  y: number
  /** Loaded window (ms). When given, only RPs overlapping it are listed. */
  windowStart?: number
  windowEnd?: number
  /** Called with the chosen RP; the owning axis widens the window + zooms. */
  onSelectRp: (rp: RosterPeriodOption) => void
  /** Open day statistics for the day under the right-click pointer. */
  onOpenDailyStatistics?: () => void
  onClose: () => void
}

/**
 * Shared right-click context menu on the time axis — GO TO RPDate.
 * Lists the roster periods that are currently LOADED (overlap the gantt window),
 * not the full dictionary window — "as many RPs as are loaded". Selecting one
 * zooms the viewport to that RP's [rp_start, rp_end] via onSelectRp.
 */
export const TimeAxisRpMenu = ({ open, x, y, windowStart, windowEnd, onSelectRp, onOpenDailyStatistics, onClose }: Props) => {
  const menuRef = useRef<HTMLDivElement>(null)
  const allItems = useRosterPeriodStore((s) => s.items)
  const load = useRosterPeriodStore((s) => s.loadRosterPeriods)

  // Only RPs overlapping the loaded window (or all if no window given).
  const items = windowStart !== undefined && windowEnd !== undefined
    ? allItems.filter((rp) => {
        const s = Date.parse(rp.rpStart + 'T00:00:00.000Z')
        const e = Date.parse(rp.rpEnd + 'T23:59:59.999Z')
        return s <= windowEnd && e >= windowStart
      })
    : allItems

  // Lazy-load the windowed RP list when the menu opens (store caches it).
  useEffect(() => {
    if (open) void load()
  }, [open, load])

  // Close on outside click or Escape.
  useEffect(() => {
    if (!open) return
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose()
    }
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [open, onClose])

  if (!open) return null

  const menuW = 176
  const menuH = items.length * 30 + (onOpenDailyStatistics ? 72 : 40)
  const cx = Math.min(x, window.innerWidth - menuW - 8)
  const cy = Math.min(y, window.innerHeight - menuH - 8)

  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label="GO TO RPDate"
      data-testid="time-axis-rp-menu"
      className="fixed z-50 w-[176px] overflow-hidden rounded-md border border-border/60 bg-popover/98 p-1 shadow-[0_4px_16px_rgba(0,0,0,0.12)] animate-in fade-in-0 zoom-in-95 duration-100"
      style={{ left: cx, top: cy }}
    >
      <div className="flex items-center gap-1.5 px-2 py-1 text-2xs font-semibold uppercase tracking-wider text-muted-foreground/60">
        <Calendar className="h-3 w-3 shrink-0" />
        GO TO RPDate
      </div>
      {onOpenDailyStatistics && (
        <button
          type="button"
          role="menuitem"
          data-testid="time-axis-daily-gantt-statistics"
          className="flex w-full items-center rounded-sm px-2 py-1.5 text-left text-xs text-popover-foreground transition-colors hover:bg-accent/60 active:scale-95"
          onClick={() => {
            onOpenDailyStatistics()
            onClose()
          }}
        >
          Daily Gantt Statistics
        </button>
      )}
      <div className="my-1 border-t border-border/60" />
      {items.map((rp) => (
        <button
          key={rp.id}
          role="menuitem"
          data-testid={`time-axis-rp-${rp.rosterPeriod}`}
          className={[
            'flex w-full items-center gap-1.5 rounded-sm px-2 py-1.5 text-xs transition-all duration-100',
            'text-popover-foreground hover:bg-accent/60 active:scale-95',
            rp.isCurrent ? 'font-semibold text-primary' : '',
          ].join(' ')}
          onClick={() => {
            onSelectRp(rp)
            onClose()
          }}
        >
          <span className="font-mono tabular-nums">{rp.rosterPeriod}</span>
          {rp.isCurrent && <span className="ml-auto text-3xs text-primary/60">now</span>}
        </button>
      ))}
    </div>
  )
}
