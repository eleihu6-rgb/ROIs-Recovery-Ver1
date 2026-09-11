import type { CSSProperties, ReactNode } from 'react'
import { useMemo } from 'react'
import { AppDialog } from '@rois/ui'
import { ReceiptText, AlertTriangle, Info } from 'lucide-react'
import type { CostLibraryBreakdownRow } from '@/services/recovery-api'

const money = (amount: number, currency: string = 'CNY'): string =>
  new Intl.NumberFormat('zh-CN', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount)

export interface RecoveryCostBreakdownDialogProps {
  /** Controlled open state. */
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The plan title shown in the dialog header (e.g. "Roster transfer C001 -> C002"). */
  planTitle: string
  /** Per-component breakdown from the cost library. */
  breakdown: CostLibraryBreakdownRow[] | undefined
  /** Optional notes from the bridge (e.g. "fallback to other-airline because own-airline unpriced"). */
  notes?: string[]
  /** Total currency label (usually the first row's currency). */
  currency: string
  /** Sum of priced components. */
  total: number
  /** True if the cost library enrichment call failed. Renders an error banner instead of a table. */
  enrichmentFailed?: boolean
  /** Test ID prefix (e.g. "recovery-option-cost"). */
  testIdPrefix?: string
}

const STATUS_LABEL: Record<CostLibraryBreakdownRow['status'], string> = {
  priced: 'priced',
  unpriced: 'unpriced',
  disabled: 'disabled',
  'missing-revision': 'no rev',
}

const STATUS_CLASS: Record<CostLibraryBreakdownRow['status'], string> = {
  priced: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  unpriced: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  disabled: 'bg-muted text-muted-foreground',
  'missing-revision': 'bg-rose-500/15 text-rose-700 dark:text-rose-300',
}

/**
 * Pop-up dialog that shows how a recovery option's `directCost` is composed
 * of one row per cost-library cost type. Triggered by clicking the cost
 * number on an option card.
 *
 * Intentionally minimal (P0-1 lite): no drill-through to the cost library,
 * no CSV export. Just the rule ID + value so the user can answer
 * "where does this amount come from?".
 */
export const RecoveryCostBreakdownDialog = ({
  open,
  onOpenChange,
  planTitle,
  breakdown,
  notes,
  currency,
  total,
  enrichmentFailed,
  testIdPrefix = 'recovery-cost-breakdown',
}: RecoveryCostBreakdownDialogProps): ReactNode => {
  const rows = breakdown ?? []

  // Detect mixed-currency plans and group the totals per currency.
  const currencyTotals = useMemo(() => {
    const map = new Map<string, number>()
    for (const row of rows) {
      if (typeof row.amount !== 'number') continue
      map.set(row.currencyCode, (map.get(row.currencyCode) ?? 0) + row.amount)
    }
    return Array.from(map.entries())
  }, [rows])
  const mixedCurrencies = currencyTotals.length > 1

  const unpricedCount = rows.filter((row) => row.status !== 'priced').length
  const headerStatus = enrichmentFailed
    ? { label: 'unavailable', className: 'bg-rose-500/15 text-rose-700 dark:text-rose-300' }
    : unpricedCount === 0
      ? { label: 'all priced', className: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' }
      : { label: `${unpricedCount} unpriced`, className: 'bg-amber-500/15 text-amber-700 dark:text-amber-300' }

  return (
    <AppDialog
      open={open}
      onOpenChange={onOpenChange}
      data-testid={`${testIdPrefix}-dialog`}
      className="sm:max-w-[min(560px,94vw)]"
      icon={<ReceiptText className="h-4 w-4" />}
      title={`Cost breakdown - ${planTitle}`}
      footer={null}
    >
      <div className="p-4" data-testid={`${testIdPrefix}-body`}>
        {/* Header row: item count + status + total */}
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2">
          <div className="flex items-center gap-2 text-2xs text-muted-foreground">
            <span>{rows.length} cost {rows.length === 1 ? 'rule' : 'rules'}</span>
            <span
              className={`inline-flex items-center rounded px-1.5 py-0.5 text-2xs font-semibold ${headerStatus.className}`}
              data-testid={`${testIdPrefix}-status`}
            >
              {headerStatus.label}
            </span>
          </div>
          <div className="text-right">
            <div className="text-3xs uppercase tracking-wide text-muted-foreground">Priced total</div>
            <div className="text-sm font-semibold tabular-nums text-foreground" data-testid={`${testIdPrefix}-total`}>
              {money(total, currency)}
            </div>
          </div>
        </div>

        {/* Mixed-currency banner */}
        {mixedCurrencies && (
          <div
            className="mb-3 flex items-start gap-2 rounded border border-amber-500/30 bg-amber-500/[0.06] px-2.5 py-1.5 text-2xs text-amber-900 dark:text-amber-200"
            data-testid={`${testIdPrefix}-mixed-currency`}
          >
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <div>
              Mixed currencies in this plan:
              {currencyTotals.map(([code, sum]) => (
                <span key={code} className="ml-1.5 font-mono font-semibold">{money(sum, code)}</span>
              ))}
            </div>
          </div>
        )}

        {/* Error state: enrichment failed, show hard-coded cost warning */}
        {enrichmentFailed && (
          <div
            className="mb-3 flex items-start gap-2 rounded border border-rose-500/30 bg-rose-500/[0.06] px-2.5 py-2 text-2xs text-rose-900 dark:text-rose-200"
            data-testid={`${testIdPrefix}-enrichment-error`}
          >
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <div>
              Cost library unreachable. Showing the hard-coded estimate
              ({money(total, currency)}) without per-component breakdown.
            </div>
          </div>
        )}

        {/* Empty state */}
        {!enrichmentFailed && rows.length === 0 && (
          <div className="py-6 text-center text-2xs text-muted-foreground" data-testid={`${testIdPrefix}-empty`}>
            No cost components for this option.
          </div>
        )}

        {/* Breakdown table */}
        {!enrichmentFailed && rows.length > 0 && (
          <div className="overflow-auto" data-testid={`${testIdPrefix}-table-wrapper`}>
            <table className="w-full border-collapse text-xs">
              <thead className="bg-muted/70 text-left text-2xs text-muted-foreground">
                <tr>
                  <th className="px-2 py-1.5">Cost rule</th>
                  <th className="px-2 py-1.5 text-right">Qty</th>
                  <th className="px-2 py-1.5 text-right">Unit</th>
                  <th className="px-2 py-1.5 text-right">Amount</th>
                  <th className="px-2 py-1.5">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => {
                  const amount = typeof row.amount === 'number' ? row.amount : null
                  const unitPrice = amount !== null && row.quantity > 0 ? amount / row.quantity : null
                  const cellStyle: CSSProperties = {}
                  return (
                    <tr
                      key={`${row.typeCode}-${row.calculatorCode}-${index}`}
                      className="border-b border-border/40 align-top"
                      data-testid={`${testIdPrefix}-row`}
                    >
                      <td className="px-2 py-2" style={cellStyle}>
                        <div className="font-medium text-foreground">{row.label}</div>
                        <div className="text-2xs text-muted-foreground">
                          <span className="font-mono">{row.calculatorCode}</span>
                          {row.revisionId !== null && (
                            <span className="ml-1.5">rev {row.revisionId}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums text-foreground">
                        {row.quantity}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">
                        {unitPrice !== null ? money(unitPrice, row.currencyCode) : '—'}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums font-semibold text-foreground">
                        {amount !== null ? money(amount, row.currencyCode) : '—'}
                      </td>
                      <td className="px-2 py-2">
                        <span
                          className={`inline-flex items-center rounded px-1.5 py-0.5 text-2xs font-semibold ${STATUS_CLASS[row.status]}`}
                          data-testid={`${testIdPrefix}-row-status`}
                          data-status={row.status}
                        >
                          {STATUS_LABEL[row.status]}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Notes section */}
        {notes && notes.length > 0 && (
          <div
            className="mt-3 rounded border border-amber-500/20 bg-amber-500/[0.04] px-2.5 py-2 text-2xs text-amber-900 dark:text-amber-200"
            data-testid={`${testIdPrefix}-notes`}
          >
            <div className="mb-1 flex items-center gap-1 font-semibold">
              <Info className="h-3 w-3" />Notes
            </div>
            <ul className="list-disc space-y-0.5 pl-4">
              {notes.map((note, idx) => (
                <li key={idx}>{note}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </AppDialog>
  )
}
