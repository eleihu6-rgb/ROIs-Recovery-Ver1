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

const taskMs = (t: RosterItem): { ts: number; te: number } | null => {
  if (!t.schStrDtUtc || !t.schEndDtUtc) return null
  const ts = new Date(t.schStrDtUtc).getTime()
  const te = new Date(t.schEndDtUtc).getTime()
  if (!Number.isFinite(ts) || !Number.isFinite(te)) return null
  return { ts, te }
}

type FlyDutyGroup = {
  pairingId: number
  dutySeq: number
  tasks: RosterItem[]
  startMs: number
  endMs: number
}

const groupFlyDutyTasks = (crewTasks: RosterItem[]): FlyDutyGroup[] => {
  const byKey = new Map<string, RosterItem[]>()
  for (const task of crewTasks) {
    if (task.pairingId == null || task.dutySeq == null) continue
    if (task.assignmentGroup !== 'FLY') continue
    const key = `${task.pairingId}:${task.dutySeq}`
    const arr = byKey.get(key)
    if (arr) arr.push(task)
    else byKey.set(key, [task])
  }

  const out: FlyDutyGroup[] = []
  for (const tasks of byKey.values()) {
    let startMs = Infinity
    let endMs = -Infinity
    for (const task of tasks) {
      const bounds = taskMs(task)
      if (!bounds) continue
      startMs = Math.min(startMs, bounds.ts)
      endMs = Math.max(endMs, bounds.te)
    }
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) continue
    const head = tasks[0]
    if (head.pairingId == null || head.dutySeq == null) continue
    out.push({
      pairingId: head.pairingId,
      dutySeq: head.dutySeq,
      tasks,
      startMs,
      endMs,
    })
  }
  return out
}

/**
 * Rule 7504 WOCL spacing: the violation window is the rest GAP between two consecutive
 * WOCL flight duties (`startDt` = end of the before duty incl. rest, `endDt` = start of
 * the after duty). Mark only those two duty pucks — including when both duties live inside
 * the same pairing.
 */
export const crew7504GapEndpointTasks = (
  violation: ViolationTimeWindow,
  crewTasks: RosterItem[],
): RosterItem[] => {
  const win = resolveViolationPaintWindow(violation)
  if (!win) return []

  let before: FlyDutyGroup | null = null
  let after: FlyDutyGroup | null = null
  for (const duty of groupFlyDutyTasks(crewTasks)) {
    if (duty.endMs <= win.startMs && (!before || duty.endMs > before.endMs)) {
      before = duty
    }
    if (duty.startMs >= win.endMs && (!after || duty.startMs < after.startMs)) {
      after = duty
    }
  }

  const out: RosterItem[] = []
  if (before) out.push(...before.tasks)
  if (after && after !== before) out.push(...after.tasks)
  return out
}

export const mark7504GapDutyPucks = (
  violation: ViolationTimeWindow,
  crewId: string | null | undefined,
  severity: number,
  itemsByCrew: Map<string, RosterItem[]>,
  bump: (taskId: number, sev: number) => void,
): void => {
  if (!crewId) return
  for (const task of crew7504GapEndpointTasks(violation, itemsByCrew.get(crewId) ?? [])) {
    bump(task.id, severity)
  }
}
