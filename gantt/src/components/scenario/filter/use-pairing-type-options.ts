import { useEffect, useMemo } from 'react'
import { useReferenceStore } from '@/stores/reference-store'
import type { MultiSelectOption } from '../multi-select'

/** Scenario Pairing Type options from distinct live pairing.assignment values. */
export const usePairingTypeOptions = (): { options: MultiSelectOption[]; loading: boolean } => {
  const types = useReferenceStore((s) => s.pairingTypes)
  const loading = useReferenceStore((s) => s.loading)
  const load = useReferenceStore((s) => s.load)

  useEffect(() => {
    void load()
  }, [load])

  const options = useMemo<MultiSelectOption[]>(
    () => types.map((type) => ({
      value: type.assignment,
      label: type.description ? `${type.assignment} — ${type.description}` : type.assignment,
    })),
    [types],
  )

  return { options, loading }
}
