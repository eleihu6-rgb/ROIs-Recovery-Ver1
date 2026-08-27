import { describe, expect, it } from 'vitest'
import { buildScenarioRosterItems } from '@/components/scenario-gantt/build-scenario-roster-items'
import { crewMandayDelta } from '@/utils/manday-delta'
import type { ScenarioGanttPairing, AssignmentPatch } from '@/types/scenario-gantt'

// RosterPeriodOption needs only the fields rpForTimestamp reads (rpStart/rpEnd) plus
// rosterPeriod for the delta bucketing.
const rpItems = [
  { id: 1, rosterPeriod: '2026RP07', name: '2026-07', rpStart: '2026-07-01', rpEnd: '2026-07-31', isCurrent: false },
]

const build = (pendingChanges: AssignmentPatch[]) => {
  const pairingMap = new Map<number, ScenarioGanttPairing>()
  return buildScenarioRosterItems({
    crew: [{ crewId: 'F80001' }],
    pairingMap,
    assignments: [],
    pairingSegments: [],
    groundItems: [
      { crewId: 'F80001', assignmentGroup: 'GRD', assignment: 'DO', schStrDtUtc: '2026-07-10T08:00:00Z', schEndDtUtc: '2026-07-10T16:00:00Z', actingRank: 'CA', source: 'CR' },
    ],
    pendingChanges,
  })
}

describe('scenario Tier-1 optimistic manday delta', () => {
  it('deleting a DO yields delta mdo=-1 with no credit change', () => {
    const base = build([])
    const virtual = build([{
      op: 'remove', crewId: 'F80001', pairingId: null,
      startDtUtc: '2026-07-10T08:00:00Z', endDtUtc: '2026-07-10T16:00:00Z',
      assignmentGroup: 'GRD', assignment: 'DO',
    }])
    const delta = crewMandayDelta(base.items, virtual.items, '2026RP07', rpItems)
    const d = delta.get('F80001')
    expect(d?.mdo).toBe(-1)
    expect(d?.mcred).toBe(0)
  })

  it('no patch → empty delta', () => {
    const base = build([])
    const virtual = build([])
    const delta = crewMandayDelta(base.items, virtual.items, '2026RP07', rpItems)
    expect(delta.size).toBe(0)
  })
})
