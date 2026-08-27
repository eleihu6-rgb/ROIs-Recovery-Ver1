import { useEffect, useMemo } from 'react'
import { useReferenceStore } from '@/stores/reference-store'
import type { MultiSelectOption } from '../multi-select'

/** True when a rank's comma-separated divisions include the given division ('' = any). */
export const rankAppliesToDivision = (rankDivision: string, division: string): boolean =>
  !division ||
  rankDivision.split(',').map((d) => d.trim().toUpperCase()).includes(division.trim().toUpperCase())

/** Rank options for Scenario scope filters, scoped by Basic Info division. */
export const useRankOptions = (division: string): { options: MultiSelectOption[]; loading: boolean } => {
  const ranks = useReferenceStore((s) => s.ranks)
  const loading = useReferenceStore((s) => s.loading)
  const load = useReferenceStore((s) => s.load)

  useEffect(() => {
    void load()
  }, [load])

  const normalizedDivision = division.trim().toUpperCase()
  const options = useMemo<MultiSelectOption[]>(
    () => ranks
      .filter((r) => r.isCrewRank === 1)
      .filter((r) => rankAppliesToDivision(r.division, normalizedDivision))
      .sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0) || a.rank.localeCompare(b.rank))
      .map((r) => ({
        value: r.rank,
        label: r.rank,
      })),
    [normalizedDivision, ranks],
  )

  return { options, loading }
}
