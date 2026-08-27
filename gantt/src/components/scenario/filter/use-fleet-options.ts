import { useEffect, useMemo } from 'react'
import { useReferenceStore } from '@/stores/reference-store'
import type { MultiSelectOption } from '../multi-select'

/**
 * System fleet options for Scenario scope filters.
 *
 * Fleets must be selected from the airline fleet table so optimizer scope uses
 * valid fleet codes instead of free-text tags.
 */
export const useFleetOptions = (): { options: MultiSelectOption[]; loading: boolean } => {
  const fleets = useReferenceStore((s) => s.fleets)
  const loading = useReferenceStore((s) => s.loading)
  const load = useReferenceStore((s) => s.load)

  useEffect(() => {
    void load()
  }, [load])

  const options = useMemo<MultiSelectOption[]>(
    () =>
      fleets.map((f) => ({
        value: f.fleet,
        label: f.fleet,
      })),
    [fleets],
  )

  return { options, loading }
}
