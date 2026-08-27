import { useEffect, useMemo } from 'react'
import { useReferenceStore } from '@/stores/reference-store'
import type { MultiSelectOption } from '../multi-select'

/**
 * System base options for scope-filter Base pickers.
 *
 * Bases must be chosen from the airline's configured base list (loaded once
 * into the shared reference-store) rather than typed as free text — this keeps
 * the selection valid and consistent across crew and pairing filters.
 */
export const useBaseOptions = (): { options: MultiSelectOption[]; loading: boolean } => {
  const bases   = useReferenceStore((s) => s.bases)
  const loading = useReferenceStore((s) => s.loading)
  const load    = useReferenceStore((s) => s.load)

  useEffect(() => {
    void load()
  }, [load])

  const options = useMemo<MultiSelectOption[]>(
    () =>
      bases.map((b) => ({
        value: b.base,
        label: b.name && b.name !== b.base ? `${b.base} — ${b.name}` : b.base,
      })),
    [bases],
  )

  return { options, loading }
}
