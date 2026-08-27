import { useState, useEffect } from 'react'
import { metadataApi, type MetadataColumn, type MetadataQueryResult } from '@/services/metadata-api'
import { metadataSchemaLabel, resolveMetadataSchema, useMetadataStore } from '@/stores/metadata-store'
import { MetadataFilterRow } from './metadata-filter-row'
import { MetadataResults } from './metadata-results'

export const MetadataView = () => {
  const selectedSchema = useMetadataStore((s) => s.selectedSchema)
  const selectedTable  = useMetadataStore((s) => s.selectedTable)
  const physicalSchema = resolveMetadataSchema(selectedSchema)

  const [columns,   setColumns]   = useState<MetadataColumn[]>([])
  const [filters,   setFilters]   = useState<Record<string, string>>({})
  const [result,    setResult]    = useState<MetadataQueryResult | null>(null)
  const [isQueried, setIsQueried] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [page,      setPage]      = useState(1)
  const [pageSize,  setPageSize]  = useState(200)

  useEffect(() => {
    if (!selectedTable || !physicalSchema) { setColumns([]); return }
    setColumns([])
    setFilters({})
    setResult(null)
    setIsQueried(false)
    setPage(1)
    metadataApi.getColumns(physicalSchema, selectedTable)
      .then((res) => setColumns(res.columns))
      .catch(() => setColumns([]))
  }, [physicalSchema, selectedTable])

  const handleFilterChange = (col: string, value: string) => {
    setFilters((prev) => ({ ...prev, [col]: value }))
  }

  const handleRun = async (overridePage?: number, overridePageSize?: number) => {
    if (!selectedTable || !physicalSchema) return
    setIsLoading(true)
    try {
      const res = await metadataApi.query({
        schema:   physicalSchema,
        table:    selectedTable,
        filters:  Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== '')),
        page:     overridePage ?? page,
        pageSize: overridePageSize ?? pageSize,
      })
      setResult(res)
      setIsQueried(true)
      if (overridePage) setPage(overridePage)
    } finally {
      setIsLoading(false)
    }
  }

  const handleClear = () => {
    setFilters({})
    setResult(null)
    setIsQueried(false)
    setPage(1)
  }

  const handlePageChange = (p: number) => {
    setPage(p)
    handleRun(p)
  }

  const handlePageSizeChange = (size: number) => {
    setPageSize(size)
    setPage(1)
    if (isQueried) handleRun(1, size)
  }

  return (
    <div
      data-testid="metadata-view"
      className="flex h-full w-full flex-col overflow-hidden"
    >
      {/* Header */}
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border px-4">
        {selectedTable ? (
          <>
            <span className="text-sm font-semibold text-foreground">{selectedTable}</span>
            <span className="rounded bg-primary/10 px-1.5 py-0.5 text-2xs text-primary">
              {physicalSchema ?? metadataSchemaLabel(selectedSchema)} · {selectedSchema}
            </span>
            <span className="rounded bg-muted px-1.5 py-0.5 text-2xs text-muted-foreground">read-only</span>
          </>
        ) : (
          <span className="text-sm text-muted-foreground">Select a table from the sidebar</span>
        )}
      </div>

      {/* Column filter row */}
      {columns.length > 0 && (
        <MetadataFilterRow
          columns={columns}
          filters={filters}
          onChange={handleFilterChange}
        />
      )}

      {/* Action bar */}
      {selectedTable && (
        <div className="flex shrink-0 items-center gap-2 border-b border-border bg-muted/30 px-4 py-2">
          <button
            data-testid="metadata-run-btn"
            onClick={() => handleRun()}
            disabled={isLoading}
            className="flex items-center gap-1.5 rounded bg-primary px-3 py-1 text-2xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {isLoading ? '⟳ Running…' : '▶ Run Query'}
          </button>
          <button
            data-testid="metadata-clear-btn"
            onClick={handleClear}
            className="rounded border border-border px-3 py-1 text-2xs text-muted-foreground hover:text-foreground"
          >
            ✕ Clear
          </button>
        </div>
      )}

      {/* Results */}
      {selectedTable ? (
        <MetadataResults
          result={result}
          isQueried={isQueried}
          schema={physicalSchema ?? metadataSchemaLabel(selectedSchema)}
          table={selectedTable}
          page={page}
          pageSize={pageSize}
          onPageChange={handlePageChange}
          onPageSizeChange={handlePageSizeChange}
        />
      ) : (
        <div
          data-testid="metadata-no-table-state"
          className="flex flex-1 flex-col items-center justify-center gap-2 text-muted-foreground"
        >
          <span className="text-sm">Select a table to begin</span>
        </div>
      )}
    </div>
  )
}
