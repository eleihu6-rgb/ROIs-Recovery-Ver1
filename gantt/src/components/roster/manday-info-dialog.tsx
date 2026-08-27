import { useEffect, useMemo, useState } from 'react'
import { AppDialog, Button } from '@rois/ui'
import { CalendarClock } from 'lucide-react'
import { useUiStore } from '@/stores/ui-store'
import { crewApi, type MandayDailyDay } from '@/services/crew-api'
import {
  enumerateYmdRange,
  formatMandayMinutes,
  resolveViewportMonthBounds,
} from '@/utils/resolve-viewport-month'

interface Row {
  date: string
  creditMin: number
  blhMin: number
  dpMin: number
}

/**
 * Manday Info — daily Credit + BH + DP for the viewport leftmost calendar month.
 * Opened from Live / Scenario roster name-cell context menu.
 */
export const MandayInfoDialog = () => {
  const open = useUiStore((s) => s.mandayInfoOpen)
  const crewId = useUiStore((s) => s.mandayInfoCrewId)
  const scenarioId = useUiStore((s) => s.mandayInfoScenarioId)
  const close = useUiStore((s) => s.closeMandayInfoDialog)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [yearMonth, setYearMonth] = useState('')
  const [base, setBase] = useState('')
  const [rows, setRows] = useState<Row[]>([])

  useEffect(() => {
    if (!open || !crewId) return
    let cancelled = false
    const bounds = resolveViewportMonthBounds(scenarioId)
    setYearMonth(bounds.yearMonth)
    setLoading(true)
    setError(null)
    setRows([])
    void crewApi
      .getMandayDaily(crewId, bounds.start, bounds.end, scenarioId)
      .then((res) => {
        if (cancelled) return
        setBase(res.base)
        const byDate = new Map<string, MandayDailyDay>()
        for (const d of res.days) byDate.set(d.date, d)
        const filled = enumerateYmdRange(bounds.start, bounds.end).map((date) => {
          const hit = byDate.get(date)
          return {
            date,
            creditMin: hit?.creditMin ?? 0,
            blhMin: hit?.blhMin ?? 0,
            dpMin: hit?.dpMin ?? 0,
          }
        })
        setRows(filled)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Failed to load manday')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, crewId, scenarioId])

  const title = useMemo(() => {
    if (!crewId) return 'Manday Info'
    return yearMonth ? `Manday Info — ${crewId} (${yearMonth})` : `Manday Info — ${crewId}`
  }, [crewId, yearMonth])

  if (!crewId) return null

  return (
    <AppDialog
      open={open}
      onOpenChange={(o) => { if (!o) close() }}
      data-testid="manday-info-dialog"
      className="sm:max-w-[460px] max-h-[70vh]"
      resizable
      icon={<CalendarClock className="h-4 w-4" />}
      title={title}
      description={base ? `Base ${base}` : undefined}
      bodyClassName="flex min-h-0 flex-col"
      footer={<Button variant="ghost" onClick={close} data-testid="manday-info-close">Close</Button>}
    >
      <div className="flex h-full min-h-0 flex-col gap-2 py-1" data-testid="manday-info-body">
        {loading && <p className="text-xs text-muted-foreground">Loading…</p>}
        {error && <p className="text-xs text-destructive">{error}</p>}
        {!loading && !error && (
          <div className="min-h-0 flex-1 overflow-auto rounded-md border border-border">
            <table className="w-full text-xs" data-testid="manday-info-table">
              <thead className="sticky top-0 bg-muted/80">
                <tr className="border-b border-border text-left text-2xs font-medium text-muted-foreground">
                  <th className="px-2 py-1.5">Date</th>
                  <th className="px-2 py-1.5 text-right">Credit</th>
                  <th className="px-2 py-1.5 text-right">BH</th>
                  <th className="px-2 py-1.5 text-right">DP</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.date} className="border-b border-border/50 last:border-0" data-testid="manday-info-row">
                    <td className="px-2 py-1 font-mono tabular-nums">{r.date}</td>
                    <td className="px-2 py-1 text-right font-mono tabular-nums" data-testid="manday-info-credit">
                      {formatMandayMinutes(r.creditMin)}
                    </td>
                    <td className="px-2 py-1 text-right font-mono tabular-nums" data-testid="manday-info-bh">
                      {formatMandayMinutes(r.blhMin)}
                    </td>
                    <td className="px-2 py-1 text-right font-mono tabular-nums" data-testid="manday-info-dp">
                      {formatMandayMinutes(r.dpMin)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AppDialog>
  )
}
