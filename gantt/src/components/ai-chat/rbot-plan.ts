// gantt/src/components/ai-chat/rbot-plan.ts
//
// R'Bot L2 plan card model (spec §16). A plan lists EVERY pending draft change that
// Save would commit — Save commits the whole draft, so the card must show exactly what
// gets saved, marking which changes R'Bot made. Pure functions; the card component
// reads the live draft/roster stores and feeds them here.

import type { DraftOperation } from '@/stores/draft-store'
import type { RosterItem } from '@/types/roster'
import type { RbotPolicy } from './rbot-policy'

/** Draft op types R'Bot may Save under L2. Everything else (pairing/flight deletes and
 *  edits, pairing builds, cross-base recovery) needs a manual Save — spec §16.6. */
export const L2_SAVABLE_OP_TYPES: ReadonlySet<string> = new Set([
  'move', 'swap', 'remove', 'remove-pairing-from-crew', 'add-ground-task', 'assign-pairing', 'add', 'update',
])

export interface PlanLine {
  opId: string
  text: string
  byRbot: boolean
  /** true = R'Bot may not Save this change (manual Save only) */
  manualOnly: boolean
}

const dutyName = (it: RosterItem | undefined): string => {
  if (!it) return 'a duty'
  const label = it.pairingLabel || it.label || it.assignment || (it.pairingId != null ? `pairing ${it.pairingId}` : 'ground task')
  const day = (it.schStrDtUtc ?? it.actStrDtUtc ?? '').slice(0, 10)
  return day ? `${label} on ${day}` : label
}

export const describeDraftOp = (o: DraftOperation, byId: Map<number, RosterItem>, byPairing: Map<number, RosterItem>): string => {
  const op = o.op
  switch (op.type) {
    case 'move': {
      const it = op.taskId != null ? byId.get(op.taskId) : undefined
      return `Move ${dutyName(it)} from ${it?.crewId ?? '?'} to ${op.toCrewId ?? '?'}`
    }
    case 'swap': {
      const a = op.taskIdA != null ? byId.get(op.taskIdA) : undefined
      const b = op.taskIdB != null ? byId.get(op.taskIdB) : undefined
      return `Swap ${dutyName(a)} (${a?.crewId ?? '?'}) with ${dutyName(b)} (${b?.crewId ?? '?'})`
    }
    case 'remove': {
      const it = op.taskId != null ? byId.get(op.taskId) : undefined
      return `Remove ${dutyName(it)} from ${it?.crewId ?? '?'}`
    }
    case 'remove-pairing-from-crew':
      return `Take ${op.crewId ?? '?'} off ${dutyName(op.pairingId != null ? byPairing.get(op.pairingId) : undefined)}`
    case 'assign-pairing':
      return `Assign ${dutyName(op.pairingId != null ? byPairing.get(op.pairingId) : undefined)} to ${op.crewId ?? '?'}`
    case 'add-ground-task': {
      const g = op.groundTaskData
      return g ? `Add ${g.assignment} for ${g.crewIds.join(', ')} on ${g.startDtUtc.slice(0, 10)}` : 'Add a ground task'
    }
    case 'add':
      return `Add a duty for ${String(op.task?.crewId ?? '?')}`
    case 'update': {
      const it = op.taskId != null ? byId.get(op.taskId) : undefined
      return `Edit ${dutyName(it)} for ${it?.crewId ?? '?'}`
    }
    case 'remove-pairing':
      return `Delete pairing${op.pairingIds && op.pairingIds.length > 1 ? `s ${op.pairingIds.join(', ')}` : ` ${op.pairingId ?? ''}`}`
    case 'edit-flight':
      return `Change flight times (flight ${op.flightId ?? '?'})`
    default:
      return `${op.type.replace(/-/g, ' ')} change`
  }
}

export const buildPlanLines = (
  operations: DraftOperation[],
  rbotOpIds: ReadonlySet<string>,
  baseItems: RosterItem[],
): PlanLine[] => {
  const byId = new Map(baseItems.map((i) => [i.id, i]))
  const byPairing = new Map<number, RosterItem>()
  for (const i of baseItems) if (i.pairingId != null && !byPairing.has(i.pairingId)) byPairing.set(i.pairingId, i)
  return operations.map((o) => ({
    opId: o.id,
    text: describeDraftOp(o, byId, byPairing),
    byRbot: rbotOpIds.has(o.id),
    manualOnly: !L2_SAVABLE_OP_TYPES.has(o.op.type),
  }))
}

export type SaveBlock =
  | { ok: true }
  | { ok: false; reason: string }

/** Can R'Bot press Save for these lines under this policy? Reasons are user-facing. */
export const canRbotSave = (lines: PlanLine[], policy: RbotPolicy): SaveBlock => {
  if (lines.length === 0) return { ok: false, reason: 'There are no unsaved changes.' }
  if (policy.autonomy !== 'L2') {
    return { ok: false, reason: `R'Bot is set to ${policy.autonomy} (stage only) — review the changes and press Save yourself.` }
  }
  const manual = lines.filter((l) => l.manualOnly)
  if (manual.length > 0) {
    return { ok: false, reason: `${manual.length} change(s) need a manual Save (${manual[0].text}).` }
  }
  if (lines.length > policy.maxPlanChanges) {
    return {
      ok: false,
      reason: policy.maxPlanChanges === 0
        ? 'R\'Bot saving is not configured — press Save yourself.'
        : `${lines.length} changes is over R'Bot's limit of ${policy.maxPlanChanges} per plan — press Save yourself.`,
    }
  }
  return { ok: true }
}
