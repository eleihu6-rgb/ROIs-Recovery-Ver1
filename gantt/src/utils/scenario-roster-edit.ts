import type { AssignmentPatch, ScenarioGanttData } from '@/types/scenario-gantt'
import type { RosterItem } from '@/types/roster'

/** Scenario output may remove solver-created (CR) or user-assigned (MA) roster tasks. */
export const isScenarioRosterTaskDeletable = (item: Pick<RosterItem, 'source'>): boolean =>
  item.source === 'CR' || item.source === 'MA'

/** Build the persisted remove patch for either a pairing roster task or a ground task. */
export const buildScenarioRosterRemovePatch = (item: Pick<
  RosterItem,
  'crewId' | 'pairingId' | 'source' | 'schStrDtUtc' | 'schEndDtUtc' | 'assignmentGroup' | 'assignment'
>): AssignmentPatch | null => {
  if (!isScenarioRosterTaskDeletable(item)) return null

  if (item.pairingId != null) {
    return { op: 'remove', crewId: item.crewId, pairingId: item.pairingId }
  }

  if (
    item.schStrDtUtc == null ||
    item.schEndDtUtc == null ||
    item.assignment == null
  ) {
    return null
  }

  return {
    op: 'remove',
    crewId: item.crewId,
    pairingId: null,
    startDtUtc: item.schStrDtUtc,
    endDtUtc: item.schEndDtUtc,
    assignmentGroup: item.assignmentGroup,
    assignment: item.assignment,
  }
}

/**
 * Apply saved patches to the in-memory scenario gantt data so the roster reflects the
 * change immediately (no getGanttData reload). Mirrors the server-side apply for the
 * three patch ops; pairing segment geometry is unchanged by these ops.
 */
export const applyScenarioPatchesToData = (
  data: ScenarioGanttData,
  patches: AssignmentPatch[],
): ScenarioGanttData => {
  let assignments = data.assignments
  let groundItems = data.groundItems

  for (const patch of patches) {
    if (patch.op === 'remove') {
      if (patch.pairingId != null) {
        assignments = assignments.filter(
          (a) => !(a.crewId === patch.crewId && a.pairingId === patch.pairingId),
        )
      } else {
        groundItems = groundItems.filter(
          (g) => !(
            g.crewId === patch.crewId &&
            g.schStrDtUtc === patch.startDtUtc &&
            g.schEndDtUtc === patch.endDtUtc &&
            g.assignmentGroup === patch.assignmentGroup &&
            g.assignment === patch.assignment
          ),
        )
      }
    } else if (patch.op === 'reassign' && patch.pairingId != null && patch.toCrewId) {
      assignments = assignments.map((a) =>
        a.crewId === patch.crewId && a.pairingId === patch.pairingId
          ? { ...a, crewId: patch.toCrewId! }
          : a,
      )
    } else if (patch.op === 'add' && patch.pairingId != null) {
      assignments = [
        ...assignments,
        {
          crewId: patch.crewId,
          pairingId: patch.pairingId,
          source: 'MA' as const,
          rosterActingRank: patch.rosterActingRank,
        },
      ]
    }
  }

  return assignments === data.assignments && groundItems === data.groundItems
    ? data
    : { ...data, assignments, groundItems }
}
