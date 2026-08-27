import type { LegalityParamJson } from '@/types/legality'

/** Columns that describe WHO a rule applies to — tinted so they stand out. */
const APPLICABILITY_RE = /^(bases?|ranks?|fleets?|teams?|crew teams?)$/i

interface Props {
  paramJson: LegalityParamJson | null
  fn: number
  inst: string | null
  scrollMode?: 'local' | 'parent'
}

/**
 * Aligned parameter table — one row per entry, every column on a single line so
 * multi-entry rules (e.g. 8002's 28/90/365-day windows) line up for comparison.
 * Each table scrolls horizontally on its own only when it is genuinely too wide
 * (8056, 24 cols); narrow rules fit without scrolling. Used both inline (in-page)
 * and, roomier, inside the pop-out dialog.
 *
 * Leftmost "Row" column is UI-only (1-based index); not part of param_json / Save.
 */
export const LegalityParamTable = ({ paramJson, fn, inst, scrollMode = 'local' }: Props) => {
  const key = `${fn}-${inst ?? ''}`
  const tables = paramJson?.tables ?? []

  if (tables.length === 0) {
    return (
      <div data-testid={`legality-params-${key}`} className="px-4 py-3 text-xs text-muted-foreground">
        No configurable parameters for this rule — its values are defined in the rule engine
        (migrated from C++).
      </div>
    )
  }

  return (
    <div
      data-testid={`legality-params-${key}`}
      className={[
        'flex flex-col gap-3',
        scrollMode === 'parent' ? 'px-0 py-1' : 'px-4 py-3',
      ].join(' ')}
    >
      {tables.map((table, ti) => {
        const isApp = (ci: number) => APPLICABILITY_RE.test(table.header[ci])
        return (
          <div
            key={ti}
            className={[
              scrollMode === 'parent' ? 'w-max min-w-full overflow-visible' : 'overflow-x-auto',
              'rounded-md border border-border',
            ].join(' ')}
          >
            {tables.length > 1 && (
              <div className="border-b border-border bg-card px-3 py-1.5 text-2xs font-semibold text-foreground">
                Table {ti + 1}
              </div>
            )}
            <table data-testid={`legality-param-table-${key}-${ti}`} className="min-w-full border-collapse">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th
                    data-testid={`legality-param-rownum-col-${key}-${ti}`}
                    className="whitespace-nowrap px-2.5 py-1.5 text-left text-3xs font-bold uppercase tracking-wide text-muted-foreground"
                  >
                    Row
                  </th>
                  {table.header.map((h, ci) => (
                    <th
                      key={ci}
                      data-testid={`legality-param-col-${key}-${ti}-${ci}`}
                      className={[
                        'whitespace-nowrap px-2.5 py-1.5 text-left text-3xs font-bold uppercase tracking-wide',
                        isApp(ci) ? 'bg-primary/5 text-primary/80' : 'text-muted-foreground',
                      ].join(' ')}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.rows.map((row, ri) => (
                  <tr
                    key={ri}
                    data-testid={`legality-param-row-${key}-${ti}-${ri}`}
                    className="border-b border-border/40 last:border-0 hover:bg-muted/20"
                  >
                    <td
                      data-testid={`legality-param-rownum-${key}-${ti}-${ri}`}
                      className="whitespace-nowrap px-2.5 py-1.5 font-mono text-2xs tabular-nums text-muted-foreground"
                    >
                      {ri + 1}
                    </td>
                    {table.header.map((_, ci) => (
                      <td
                        key={ci}
                        className={[
                          'whitespace-nowrap px-2.5 py-1.5 font-mono text-2xs tabular-nums text-foreground',
                          isApp(ci) ? 'bg-primary/[0.03]' : '',
                        ].join(' ')}
                      >
                        {row[ci] ?? ''}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      })}
    </div>
  )
}
