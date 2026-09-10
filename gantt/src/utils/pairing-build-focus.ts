import type { PairingItem } from '@/types'

/** Completion order is explicit; database ids and the active pane sort cannot reorder it. */
export const prependBuiltPairings = (rows: PairingItem[], created: PairingItem[]): PairingItem[] => {
  const seen = new Set<number>()
  const canonical = new Map(rows.map((row) => [row.pairing.id, row]))
  return [...created.map((row) => canonical.get(row.pairing.id) ?? row), ...rows].filter((row) => {
    if (seen.has(row.pairing.id)) return false
    seen.add(row.pairing.id)
    return true
  })
}
