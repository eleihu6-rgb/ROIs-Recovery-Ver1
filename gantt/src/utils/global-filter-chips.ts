/**
 * Shared builder for the global-filter condition chips (the base/rank/fleet/…
 * values applied via the Filter dialog) shown in each pane's condition strip.
 *
 * The chip source differs per pane (crew-store.activeGlobalFilter for roster,
 * filter-store.appliedFilters for pairing/flight) but the chip shape and the
 * "one chip per value, × removes that value and re-applies" behavior are
 * identical — so the loop lives here (root CLAUDE.md「代码复用」).
 */
import type { GlobalFilterChip } from '@/components/panes/pane-toolbar'

/**
 * Build one chip per applied value across the given string-array dimensions.
 * `removeValue` drops a single value from the live filter draft and re-applies
 * (the caller wires it to filter-store + applyGanttFilters). `D` is inferred
 * from the dims literals so the callback only ever sees those keys.
 */
export const buildGlobalFilterChips = <F, D extends Extract<keyof F, string>>(
  filter: F | null | undefined,
  dims: { dim: D; label: string }[],
  removeValue: (dim: D, value: string) => void,
): GlobalFilterChip[] => {
  if (!filter) return []
  const chips: GlobalFilterChip[] = []
  for (const { dim, label } of dims) {
    const values = filter[dim]
    if (!Array.isArray(values)) continue
    for (const value of values as string[]) {
      chips.push({
        id: `${dim}:${value}`,
        label,
        value,
        onRemove: () => removeValue(dim, value),
      })
    }
  }
  return chips
}
