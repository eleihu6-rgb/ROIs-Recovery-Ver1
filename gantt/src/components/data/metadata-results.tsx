import type { MetadataQueryResult } from '@/services/metadata-api'

interface MetadataResultsProps {
  result:      MetadataQueryResult | null
  isQueried:   boolean
  schema:      string
  table:       string
  page:        number
  pageSize:    number
  onPageChange: (page: number) => void
  onPageSizeChange: (size: number) => void
}

const PAGE_SIZE_OPTIONS = [100, 200, 500, 1000]

export const MetadataResults = ({
  result, isQueried, schema, table, page, pageSize, onPageChange, onPageSizeChange,
}: MetadataResultsProps) => {
  const columns = result && result.rows.length > 0 ? Object.keys(result.rows[0]) : []
  const totalPages = result ? Math.ceil(result.total / pageSize) : 0

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Empty / waiting state */}
      {!isQueried && (
        <div
          data-testid="metadata-empty-state"
          className="flex flex-1 flex-col items-center justify-center gap-2 text-muted-foreground"
        >
          <span className="text-sm">No results yet</span>
          <span className="text-2xs text-muted-foreground/60">▶ Run Query to fetch data</span>
        </div>
      )}

      {/* Results table */}
      {isQueried && result && result.rows.length > 0 && (
        <div className="flex-1 overflow-auto">
          <table
            data-testid="metadata-results-table"
            className="w-full border-collapse font-mono text-2xs"
          >
            <thead>
              <tr>
                {columns.map((col) => (
                  <th
                    key={col}
                    className="sticky top-0 whitespace-nowrap border-b border-border bg-muted px-3 py-1.5 text-left font-medium text-muted-foreground"
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result.rows.map((row, i) => (
                <tr key={i} className="border-b border-border/50 hover:bg-muted/40">
                  {columns.map((col) => {
                    const val = row[col]
                    const display = val === null || val === undefined ? '—' : String(val)
                    return (
                      <td key={col} className="whitespace-nowrap px-3 py-1 text-foreground">
                        {display}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Zero results after search */}
      {isQueried && result && result.rows.length === 0 && (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-muted-foreground">
          <span className="text-sm">0 rows returned</span>
          <span className="text-2xs">Try adjusting your filters</span>
        </div>
      )}

      {/* Status + pagination */}
      <div
        data-testid="metadata-pagination"
        className="flex shrink-0 items-center justify-between border-t border-border bg-muted/30 px-3 py-1.5"
      >
        <span className="font-mono text-2xs text-muted-foreground">
          {isQueried && result
            ? `${schema}.${table} · ${result.total.toLocaleString()} rows · read-only`
            : `${schema}.${table} · read-only`}
        </span>

        <div className="flex items-center gap-2">
          {isQueried && result && result.total > 0 && (
            <>
              <span className="font-mono text-2xs text-muted-foreground">
                {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, result.total)} of {result.total.toLocaleString()}
              </span>
              <button
                onClick={() => onPageChange(page - 1)}
                disabled={page <= 1}
                className="rounded border border-border px-1.5 py-0.5 font-mono text-2xs text-muted-foreground disabled:opacity-30 hover:text-foreground"
              >‹</button>
              {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                const p = i + 1
                return (
                  <button
                    key={p}
                    onClick={() => onPageChange(p)}
                    className={[
                      'rounded border px-1.5 py-0.5 font-mono text-2xs',
                      p === page
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border text-muted-foreground hover:text-foreground',
                    ].join(' ')}
                  >
                    {p}
                  </button>
                )
              })}
              <button
                onClick={() => onPageChange(page + 1)}
                disabled={page >= totalPages}
                className="rounded border border-border px-1.5 py-0.5 font-mono text-2xs text-muted-foreground disabled:opacity-30 hover:text-foreground"
              >›</button>
            </>
          )}

          <select
            data-testid="metadata-rows-select"
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            className="rounded border border-border bg-background px-1.5 py-0.5 font-mono text-2xs text-muted-foreground focus:outline-none"
          >
            {PAGE_SIZE_OPTIONS.map((n) => (
              <option key={n} value={n}>{n} rows</option>
            ))}
          </select>
        </div>
      </div>
    </div>
  )
}
