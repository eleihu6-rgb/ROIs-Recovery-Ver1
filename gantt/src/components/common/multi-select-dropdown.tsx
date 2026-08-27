import { useState, useMemo, useRef, useEffect, useCallback } from 'react'

export interface SelectOption {
  value: string
  label: string
  /** Optional right-aligned hint on the option row (e.g. a date range). */
  hint?: string
}

interface MultiSelectDropdownProps {
  options: SelectOption[]
  selected: string[]
  onChange: (values: string[]) => void
  placeholder?: string
  /** Optional test id; trigger gets `${testId}-trigger`, options get `${testId}-opt-${value}`. */
  testId?: string
  /** Extra classes for the trigger (e.g. min-width to enlarge the control). */
  triggerClassName?: string
  /** Title tooltip on the trigger. */
  triggerTooltip?: string
  /** Optional line below the selected chips (e.g. the merged loaded date range). */
  summary?: string
  summaryTestId?: string
  /** Show a "Load more" row above the options (for older/historical items). */
  loadMoreAvailable?: boolean
  onLoadMore?: () => void
  loadingMore?: boolean
  loadMoreLabel?: string
  loadMoreTestId?: string
  /** Optional footer hint line (e.g. a selection limit note). */
  footerHint?: string
  /** Render the option label instead of the raw value inside selected chips. */
  showChipLabels?: boolean
  /** Compact trigger mode: show only `summary` (e.g. a date range) instead of chips. */
  summaryOnly?: boolean
  /** Minimum width (px) of the dropdown panel — widen when option rows wrap. */
  dropdownMinWidth?: number
}

export const MultiSelectDropdown = ({
  options,
  selected,
  onChange,
  placeholder = 'All',
  testId,
  triggerClassName,
  triggerTooltip,
  summary,
  summaryTestId,
  loadMoreAvailable = false,
  onLoadMore,
  loadingMore = false,
  loadMoreLabel = 'Load more',
  loadMoreTestId,
  footerHint,
  showChipLabels = false,
  summaryOnly = false,
  dropdownMinWidth = 180,
}: MultiSelectDropdownProps) => {
  const [open, setOpen]     = useState(false)
  const [search, setSearch] = useState('')
  const [hasMore, setHasMore] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const listRef      = useRef<HTMLDivElement>(null)

  const checkScroll = useCallback(() => {
    const el = listRef.current
    if (!el) return
    setHasMore(el.scrollHeight > el.clientHeight + 2 && el.scrollTop + el.clientHeight < el.scrollHeight - 4)
  }, [])

  useEffect(() => {
    if (!open) { setSearch(''); setHasMore(false); return }
    const onDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const filtered = useMemo(
    () => options.filter((o) =>
      o.label.toLowerCase().includes(search.toLowerCase()) ||
      o.value.toLowerCase().includes(search.toLowerCase()),
    ),
    [options, search],
  )

  // Re-check whenever the visible option list changes
  useEffect(() => { if (open) setTimeout(checkScroll, 0) }, [open, filtered, checkScroll])

  const toggle = (value: string) => {
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value])
  }

  // Chips render in `options` (chronological) order, not click order.
  const orderedSelected = useMemo(
    () => options.filter((o) => selected.includes(o.value)),
    [options, selected],
  )

  return (
    <div ref={containerRef} className="relative">
      {/* Trigger */}
      <div
        className={`flex min-h-8 cursor-pointer flex-wrap items-center gap-1 rounded-md bg-background px-2 py-1 transition-colors ${open ? 'border border-blue-500' : 'border border-border'} ${triggerClassName ?? ''}`}
        onClick={() => setOpen((o) => !o)}
        title={triggerTooltip}
        data-testid={testId ? `${testId}-trigger` : undefined}
      >
        {summaryOnly ? (
          orderedSelected.length > 0 && summary ? (
            <span className="font-mono text-2xs tabular-nums text-foreground" data-testid={summaryTestId}>
              {summary}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground/50">{placeholder}</span>
          )
        ) : (
          orderedSelected.length === 0 ? (
            <span className="text-xs text-muted-foreground/50">{placeholder}</span>
          ) : (
            orderedSelected.map((o) => (
              <span key={o.value}
                className="inline-flex items-center gap-1 rounded bg-blue-500/15 px-1.5 py-0.5 text-2xs font-semibold text-blue-400">
                {showChipLabels ? o.label : o.value}
                <button
                  type="button"
                  className="leading-none opacity-70 hover:opacity-100"
                  data-testid={testId ? `${testId}-remove-${o.value}` : undefined}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => { e.stopPropagation(); toggle(o.value) }}
                >
                  ✕
                </button>
              </span>
            ))
          )
        )}
        <span className={`ml-auto shrink-0 text-2xs ${open ? 'text-blue-400' : 'text-muted-foreground/50'}`}>
          {open ? '▴' : '▾'}
        </span>
        {!summaryOnly && orderedSelected.length > 0 && summary && (
          <span className="w-full font-mono text-2xs tabular-nums text-muted-foreground" data-testid={summaryTestId}>
            {summary}
          </span>
        )}
      </div>

      {/* Dropdown */}
      {open && (
        <div
          className="absolute left-0 top-full z-50 mt-0.5 min-w-full overflow-hidden rounded border border-border bg-card shadow-xl"
          style={{ minWidth: dropdownMinWidth }}>
          {/* Search */}
          <div className="border-b border-border/60 px-2 py-1.5">
            <input
              className="w-full rounded border border-border bg-background px-2 py-1 text-xs text-foreground outline-none"
              placeholder="Search…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
              onClick={(e) => e.stopPropagation()}
            />
          </div>

          {/* Load earlier RPs */}
          {loadMoreAvailable && (
            <button
              type="button"
              className="flex w-full items-center justify-center gap-2 border-b border-border/60 px-3 py-1.5 text-2xs text-muted-foreground transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
              onClick={onLoadMore}
              disabled={loadingMore}
              data-testid={loadMoreTestId}
            >
              {loadingMore ? 'Loading…' : loadMoreLabel}
            </button>
          )}

          {/* Options */}
          <div className="relative">
            <div ref={listRef} className="max-h-48 overflow-y-auto py-1" onScroll={checkScroll}>
              {filtered.length === 0 ? (
                <div className="px-3 py-1.5 text-xs text-muted-foreground/50">No options</div>
              ) : (
                filtered.map((o) => {
                  const isSel = selected.includes(o.value)
                  return (
                    <button key={o.value} type="button"
                      className={`flex w-full items-center gap-2 px-3 py-1.5 text-xs transition-colors hover:bg-accent ${isSel ? 'text-blue-400' : 'text-muted-foreground'}`}
                      onClick={() => toggle(o.value)}
                      data-testid={testId ? `${testId}-opt-${o.value}` : undefined}>
                      <div className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded text-3xs text-white ${isSel ? 'border border-blue-500 bg-blue-500' : 'border border-border bg-transparent'}`}>
                        {isSel && '✓'}
                      </div>
                      <span className="shrink-0">{o.label}</span>
                      {o.hint && (
                        <span className="ml-auto shrink-0 whitespace-nowrap font-mono text-2xs tabular-nums text-muted-foreground/60">{o.hint}</span>
                      )}
                    </button>
                  )
                })
              )}
            </div>
            {hasMore && (
              <div
                className="pointer-events-none absolute bottom-0 left-0 right-0 flex items-end justify-end pb-1 pr-2"
                style={{ height: 32, background: 'linear-gradient(to top, var(--card) 40%, transparent)' }}
              >
                <span className="text-3xs font-semibold uppercase tracking-widest text-muted-foreground/45 leading-none">
                  more ↓
                </span>
              </div>
            )}
          </div>

          {/* Footer */}
          {(orderedSelected.length > 0 || footerHint) && (
            <div className="border-t border-border/60">
              {orderedSelected.length > 0 && (
                <div className="flex items-center px-3 py-1.5">
                  <button type="button" className="text-2xs text-muted-foreground/50 transition-colors hover:text-foreground"
                    onClick={() => onChange([])}>
                    Clear all
                  </button>
                  {!summaryOnly && (
                    <span className="ml-auto text-2xs text-muted-foreground/50">{orderedSelected.length} selected</span>
                  )}
                </div>
              )}
              {footerHint && (
                <div className="px-3 py-1.5 text-2xs text-muted-foreground/50">{footerHint}</div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
