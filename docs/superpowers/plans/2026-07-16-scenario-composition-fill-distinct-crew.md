# Scenario Composition Fill Distinct Crew Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent Scenario Gantt pairing composition fill from counting multi-segment roster rows as multiple crew.

**Architecture:** Keep the fix in `live-server/src/services/scenario/scenario-gantt-service.ts`, where Scenario Gantt data is shaped. Assignment records may carry an optional slot rank, and recomputation counts distinct `(pairingId, rank, crewId)` tuples before updating `fill`.

**Tech Stack:** TypeScript, Fastify service layer, Drizzle model rows, Vitest.

## Global Constraints

- Preserve existing Scenario Gantt source paths: seed, DB-backed result, snapshot, and live-refresh.
- Do not change frontend display formatting.
- Do not modify persisted database `pairing_composition.fill`.
- Use TDD: write the failing regression first, run it red, then implement.
- Keep the change surgical and avoid unrelated refactors.

---

### Task 1: Regression Test And Backend Fix

**Files:**
- Modify: `live-server/src/services/scenario/scenario-gantt-service.ts`
- Modify: `live-server/src/services/scenario/__tests__/scenario-gantt-db-service.test.ts`

**Interfaces:**
- Consumes: `mapLeadinRows(rows: LeadinRow[])`, `recomputeCompositionFill(pairings, assignments, crew)`
- Produces: `ScenarioGanttAssignment` with optional `rank?: string | null`; recomputation dedupes by crew/rank/pairing.

- [ ] **Step 1: Write the failing test**

Add a focused unit test that creates two segment rows per crew for the same pairing and proves recomputed fill must remain one per rank:

```ts
import { buildGanttDataSeed, mapLeadinRows, recomputeCompositionFill } from '../scenario-gantt-service.js'
```

```ts
describe('scenario composition fill recompute', () => {
  it('counts each live lead-in crew once per pairing rank across multi-segment rows', () => {
    const leadin = mapLeadinRows([
      { crewId: '197', pairingId: 10544, assignmentGroup: 'FLY', assignment: 'FLY', schStrDtUtc: null, schEndDtUtc: null, actingRank: 'CA', rosterActingRank: 'CA', isDeleted: 0, actCreditedMinutes: null },
      { crewId: '197', pairingId: 10544, assignmentGroup: 'FLY', assignment: 'FLY', schStrDtUtc: null, schEndDtUtc: null, actingRank: 'CA', rosterActingRank: 'CA', isDeleted: 0, actCreditedMinutes: null },
      { crewId: '1811', pairingId: 10544, assignmentGroup: 'FLY', assignment: 'FLY', schStrDtUtc: null, schEndDtUtc: null, actingRank: 'FO', rosterActingRank: 'FO', isDeleted: 0, actCreditedMinutes: null },
      { crewId: '1811', pairingId: 10544, assignmentGroup: 'FLY', assignment: 'FLY', schStrDtUtc: null, schEndDtUtc: null, actingRank: 'FO', rosterActingRank: 'FO', isDeleted: 0, actCreditedMinutes: null },
    ])

    const updated = recomputeCompositionFill(
      [{
        pairingId: 10544,
        pairingLabel: 'C4110',
        base: 'YYC',
        schStrDtUtc: '2026-06-04T13:00:00Z',
        schEndDtUtc: '2026-06-04T22:05:00Z',
        assignmentGroup: 'FLY',
        assignment: 'FLY',
        division: 'P',
        compositions: [
          { rank: 'CA', plan: 1, fill: 0 },
          { rank: 'FO', plan: 1, fill: 0 },
        ],
      }],
      leadin.assignments,
      [
        { crewId: '197', base: 'YYC', division: 'P', rank: 'CA', seniorityNum: null, crewName: null },
        { crewId: '1811', base: 'YYC', division: 'P', rank: 'FO', seniorityNum: null, crewName: null },
      ],
    )

    expect(updated[0].compositions).toEqual([
      { rank: 'CA', plan: 1, fill: 1 },
      { rank: 'FO', plan: 1, fill: 1 },
    ])
  })
})
```

- [ ] **Step 2: Run the focused test and verify red**

Run: `npm --prefix live-server run test -- src/services/scenario/__tests__/scenario-gantt-db-service.test.ts --run`

Expected: FAIL because `LeadInRow` has no `rosterActingRank`, or because recompute counts four assignment rows and returns fill `2`.

- [ ] **Step 3: Implement the minimal fix**

Update `ScenarioGanttAssignment` with `rank?: string | null`. Update `LeadinRow` and `loadLeadinFromLive` to select `rosterFlight.rosterActingRank`. Map pairing-linked lead-in rows to assignments carrying `rank: r.rosterActingRank ?? r.actingRank ?? null`.

In `recomputeCompositionFill`, resolve rank as `assignment.rank ?? rankByCrewId.get(crewId)` and count each `(pairingId, rank, crewId)` only once.

- [ ] **Step 4: Verify green**

Run: `npm --prefix live-server run test -- src/services/scenario/__tests__/scenario-gantt-db-service.test.ts --run`

Expected: PASS.

- [ ] **Step 5: Type-check live-server if available**

Run: `npm --prefix live-server exec tsc -p tsconfig.json --noEmit`

Expected: PASS.
