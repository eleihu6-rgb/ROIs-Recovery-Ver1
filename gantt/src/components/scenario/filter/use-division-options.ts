import { useEffect, useMemo } from 'react'
import { useReferenceStore } from '@/stores/reference-store'
import type { MultiSelectOption } from '../multi-select'

/**
 * Division options from the division master table (via reference store).
 * Label prefers description; value is the division code.
 */
export const useDivisionOptions = (): { options: MultiSelectOption[]; loading: boolean } => {
  const divisions = useReferenceStore((s) => s.divisions)
  const loading = useReferenceStore((s) => s.loading)
  const load = useReferenceStore((s) => s.load)

  useEffect(() => {
    void load()
  }, [load])

  const options = useMemo<MultiSelectOption[]>(() => {
    const mapped = divisions
      .filter((d) => d.division)
      .map((d) => ({
        value: d.division,
        label: d.description && d.description !== d.division
          ? `${d.division} — ${d.description}`
          : d.division,
      }))
    // Stable order: P, C, then remaining codes alphabetically
    const rank = (code: string): number => (code === 'P' ? 0 : code === 'C' ? 1 : 2)
    return mapped.sort((a, b) => {
      const rd = rank(a.value) - rank(b.value)
      return rd !== 0 ? rd : a.value.localeCompare(b.value)
    })
  }, [divisions])

  return { options, loading }
}
