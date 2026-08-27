import type { RosterItem } from '@/types'

export type ViolationTimeWindow = {
  startDt?: string | null
  endDt?: string | null
  windowStartDt?: string | null
  windowEndDt?: string | null
}

/** Prefer explicit window_* bounds; fall back to start/end (7501 stores the RH window there). */
export const resolveViolationPaintWindow = (
  v: ViolationTimeWindow,
): { startMs: number; endMs: number } | null => {
  const startRaw = v.windowStartDt ?? v.startDt
  const endRaw = v.windowEndDt ?? v.endDt
  if (!startRaw || !endRaw) return null
  const startMs = new Date(startRaw).getTime()
  const endMs = new Date(endRaw).getTime()
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return null
  return { startMs, endMs }
}

/**
 * True when at least one task overlaps the violation window, or when the violation
 * has no usable window (keep legacy puck painting).
 */
export const pairingTasksOverlapViolationWindow = (
  tasks: RosterItem[],
  violation: ViolationTimeWindow,
): boolean => {
  const win = resolveViolationPaintWindow(violation)
  if (!win) return true
  return tasks.some((t) => {
    if (!t.schStrDtUtc || !t.schEndDtUtc) return false
    const ts = new Date(t.schStrDtUtc).getTime()
    const te = new Date(t.schEndDtUtc).getTime()
    if (!Number.isFinite(ts) || !Number.isFinite(te)) return false
    return ts < win.endMs && te > win.startMs
  })
}

export const isFlyPairing = (tasks: RosterItem[]): boolean =>
  tasks.some((t) => t.assignmentGroup === 'FLY')

/**
 * Tasks belonging to FLY pairings that overlap the violation paint window.
 * Empty when the window is missing/invalid — callers must fall back to legacy
 * anchor-only painting.
 */
export const crewFlyTasksOverlappingWindow = (
  crewTasks: RosterItem[],
  violation: ViolationTimeWindow,
): RosterItem[] => {
  const win = resolveViolationPaintWindow(violation)
  if (!win) return []

  const byPairing = new Map<number, RosterItem[]>()
  for (const t of crewTasks) {
    if (t.pairingId == null) continue
    let arr = byPairing.get(t.pairingId)
    if (!arr) {
      arr = []
      byPairing.set(t.pairingId, arr)
    }
    arr.push(t)
  }

  const out: RosterItem[] = []
  for (const tasks of byPairing.values()) {
    if (!isFlyPairing(tasks)) continue
    for (const t of tasks) {
      if (!t.schStrDtUtc || !t.schEndDtUtc) continue
      const ts = new Date(t.schStrDtUtc).getTime()
      const te = new Date(t.schEndDtUtc).getTime()
      if (!Number.isFinite(ts) || !Number.isFinite(te)) continue
      if (ts < win.endMs && te > win.startMs) out.push(t)
    }
  }
  return out
}

/**
 * Any crew roster tasks (FLY / RES / ground) that overlap the violation paint window.
 * Used by 7305 so consecutive-day spans light every duty in the span, not only the
 * first pairing anchor. Empty when the window is missing/invalid.
 */
export const crewTasksOverlappingWindow = (
  crewTasks: RosterItem[],
  violation: ViolationTimeWindow,
): RosterItem[] => {
  const win = resolveViolationPaintWindow(violation)
  if (!win) return []
  const out: RosterItem[] = []
  for (const t of crewTasks) {
    if (!t.schStrDtUtc || !t.schEndDtUtc) continue
    const ts = new Date(t.schStrDtUtc).getTime()
    const te = new Date(t.schEndDtUtc).getTime()
    if (!Number.isFinite(ts) || !Number.isFinite(te)) continue
    if (ts < win.endMs && te > win.startMs) out.push(t)
  }
  return out
}
