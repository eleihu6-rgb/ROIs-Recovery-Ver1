import { useRef } from 'react'
import { Search } from 'lucide-react'

export interface QuickFilterState {
  search: string
  frozenOnly: boolean
}

export const EMPTY_QUICK_FILTER: QuickFilterState = { search: '', frozenOnly: false }

interface PaneQuickFilterProps {
  value: QuickFilterState
  onChange: (v: QuickFilterState) => void
  frozenLabel?: string
  showFrozen?: boolean
  /** Pulse the search icon while a server search is in flight */
  searching?: boolean
  placeholder?: string
}

export const PaneQuickFilter = ({
  value,
  onChange,
  frozenLabel = 'Active rows only',
  showFrozen = false,
  searching = false,
  placeholder = 'Search...',
}: PaneQuickFilterProps) => {
  const inputRef = useRef<HTMLInputElement>(null)

  return (
    <div className="flex h-7 shrink-0 items-center gap-3 border-b bg-amber-500/5 px-2">
      <div className="flex flex-1 items-center gap-1.5 rounded border bg-background px-2">
        <Search className={`h-3 w-3 shrink-0 ${searching ? 'animate-pulse text-amber-400' : 'text-muted-foreground'}`} />
        <input
          ref={inputRef}
          className="flex-1 bg-transparent py-0.5 text-xs text-foreground outline-none placeholder:text-muted-foreground"
          placeholder={placeholder}
          value={value.search}
          onChange={(e) => onChange({ ...value, search: e.target.value })}
          autoFocus
        />
      </div>
      {showFrozen && (
        <label className="flex cursor-pointer items-center gap-1 text-xs text-muted-foreground">
          <input
            type="checkbox"
            className="h-3 w-3 cursor-pointer accent-amber-500"
            checked={value.frozenOnly}
            onChange={(e) => onChange({ ...value, frozenOnly: e.target.checked })}
          />
          {frozenLabel}
        </label>
      )}
    </div>
  )
}

/** Derive chips from QuickFilterState for PaneToolbar Row 1 */
export function getQuickFilterChips(
  state: QuickFilterState,
  onClearSearch: () => void,
  onClearFrozen: () => void,
): { key: string; label: string; onRemove: () => void }[] {
  const chips: { key: string; label: string; onRemove: () => void }[] = []
  if (state.search) {
    chips.push({ key: 'search', label: `search:${state.search}`, onRemove: onClearSearch })
  }
  if (state.frozenOnly) {
    chips.push({ key: 'frozen', label: 'active only', onRemove: onClearFrozen })
  }
  return chips
}
