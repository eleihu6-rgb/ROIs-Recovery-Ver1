import type { DataChange } from '@/types/data-maintenance'

export interface ChangeSnapshot {
  draftChanges: DataChange[]
  timestamp: number
}

export const MAX_HISTORY = 50

export function pushSnapshot(
  stack: DataChange[][],
  current: DataChange[]
): DataChange[][] {
  const next = [...stack, [...current]]
  return next.length > MAX_HISTORY ? next.slice(next.length - MAX_HISTORY) : next
}
