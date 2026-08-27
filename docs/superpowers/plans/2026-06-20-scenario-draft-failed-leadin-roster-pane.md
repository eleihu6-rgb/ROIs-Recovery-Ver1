# Scenario DRAFT/FAILED Lead-in / Empty Roster Pane — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When opening an **RO** scenario in **DRAFT/FAILED** status that has no loaded roster, seed the Roster Pane from the Live roster as read-only pre-occupied assignments when `leadinLive=1`, or show crew rows with an empty timeline when `leadinLive=0` — instead of today's `409 "Scenario has no loaded result"`.

**Architecture:** Backend adds `buildGanttDataSeed` (= `buildGanttDataLiveRefresh` minus the engine `output.gz` fetch and optimizer assignments) reusing `buildRoInputGz` + existing gz parsers + an extracted live-leadin loader. The route gates the new builder on `!hasLoadedRoster && fileType==='RO' && status∈{DRAFT,FAILED}` and returns read-only capabilities. Frontend accepts the new `dataSource:'seed'`, shows a context badge, and relies on the existing source-based renderer (leadin pucks already render without the optimizer ⚡ badge) + capability-gated read-only.

**Tech Stack:** live-server (Fastify + Drizzle + Vitest), gantt (React 19 + Vite + Canvas + Playwright).

**Spec:** `docs/superpowers/specs/2026-06-20-scenario-draft-failed-leadin-roster-pane-design.md`

---

## File map

| File | Change |
|---|---|
| `live-server/src/services/scenario/scenario-gantt-service.ts` | Extract `mapLeadinRows` (exported) + `loadLeadinFromLive`; refactor `buildGanttDataLiveRefresh` to use them; add `buildGanttDataSeed`; add `'seed'` + `readOnly?` to `ScenarioGanttData` type |
| `live-server/src/__tests__/services/scenario-gantt-service.test.ts` | Unit test for `mapLeadinRows` |
| `live-server/src/services/scenario/__tests__/scenario-gantt-db-service.test.ts` | Integration test for `buildGanttDataSeed` (scope from a real scenario) |
| `live-server/src/routes/scenario/scenario.ts` | Seed branch in the `gantt-data` db path |
| `gantt/src/types/scenario-gantt.ts` | Add `'seed'` to `dataSource`; add `readOnly?: boolean` |
| `gantt/src/components/scenario-gantt/scenario-gantt-toolbar.tsx` | Seed-state context badge |
| `gantt/src/components/scenario-gantt/__tests__/build-scenario-roster-items.test.ts` | Test: leadin source flows; crew row built with zero assignments |
| `gantt/src/version.ts` | `BACKEND_VERSION` 136→137, `FRONTEND_VERSION` 288→289 |
| `e2e/tests/gantt/scenario-draft-leadin-roster.spec.ts` | Playwright e2e (3 cases) |

---

## Task 1: Extract the live-leadin loader (no behavior change)

**Files:**
- Modify: `live-server/src/services/scenario/scenario-gantt-service.ts` (add helpers ~after line 360; refactor `buildGanttDataLiveRefresh` lines 578–616)
- Test: `live-server/src/__tests__/services/scenario-gantt-service.test.ts`

- [ ] **Step 1: Write the failing unit test for `mapLeadinRows`**

Add to `live-server/src/__tests__/services/scenario-gantt-service.test.ts` (create the file if it does not already import from the service; otherwise append the `describe`):

```ts
import { describe, it, expect } from 'vitest'
import { mapLeadinRows } from '../../services/scenario/scenario-gantt-service.js'

describe('mapLeadinRows', () => {
  const base = {
    assignmentGroup: 'FLT', assignment: 'FLT', actingRank: 'CA',
    schStrDtUtc: new Date('2026-06-02T01:00:00Z'),
    schEndDtUtc: new Date('2026-06-02T05:00:00Z'),
    actCreditedMinutes: '240',
  }

  it('maps pairing-linked rows to leadin assignments', () => {
    const { assignments, groundItems } = mapLeadinRows([
      { ...base, crewId: 'C1', pairingId: 99, isDeleted: 0 },
    ])
    expect(assignments).toEqual([{ crewId: 'C1', pairingId: 99, source: 'leadin' }])
    expect(groundItems).toHaveLength(0)
  })

  it('maps pairing-less rows to leadin ground items', () => {
    const { assignments, groundItems } = mapLeadinRows([
      { ...base, crewId: 'C1', pairingId: null, isDeleted: 0 },
    ])
    expect(assignments).toHaveLength(0)
    expect(groundItems[0]).toMatchObject({ crewId: 'C1', source: 'leadin', actCreditedMinutes: 240 })
    expect(groundItems[0].schStrDtUtc).toBe('2026-06-02T01:00:00.000Z')
  })

  it('drops deleted rows and ground rows missing a window', () => {
    const { assignments, groundItems } = mapLeadinRows([
      { ...base, crewId: 'C1', pairingId: 99, isDeleted: 1 },
      { ...base, crewId: 'C2', pairingId: null, isDeleted: 0, schStrDtUtc: null },
    ])
    expect(assignments).toHaveLength(0)
    expect(groundItems).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run it — expect FAIL (mapLeadinRows not exported)**

Run: `cd live-server && npx vitest run src/__tests__/services/scenario-gantt-service.test.ts -t mapLeadinRows`
Expected: FAIL — `mapLeadinRows is not a function` / import error.

- [ ] **Step 3: Add the extracted helpers to `scenario-gantt-service.ts`**

Insert after the `injectSbyAssignments`/`recomputeCompositionFill` helpers (before `buildGanttDataSnapshot`, ~line 449):

```ts
/** Row shape selected from live `roster_flight` for lead-in. */
export interface LeadinRow {
  crewId: string
  pairingId: number | null
  assignmentGroup: string | null
  assignment: string | null
  schStrDtUtc: Date | null
  schEndDtUtc: Date | null
  actingRank: string | null
  isDeleted: number
  actCreditedMinutes: string | number | null
}

/** Pure mapper: live roster rows → lead-in assignments + ground items (source='leadin'). */
export function mapLeadinRows(rows: LeadinRow[]): {
  assignments: ScenarioGanttAssignment[]
  groundItems: ScenarioGanttGroundItem[]
} {
  const assignments: ScenarioGanttAssignment[] = rows
    .filter((r) => r.pairingId !== null && r.isDeleted === 0)
    .map((r) => ({ crewId: r.crewId, pairingId: r.pairingId!, source: 'leadin' as const }))

  const groundItems: ScenarioGanttGroundItem[] = rows
    .filter((r) => r.pairingId === null && r.isDeleted === 0 && r.schStrDtUtc && r.schEndDtUtc)
    .map((r) => ({
      crewId:             r.crewId,
      assignmentGroup:    r.assignmentGroup,
      assignment:         r.assignment ?? r.assignmentGroup,
      schStrDtUtc:        r.schStrDtUtc!.toISOString(),
      schEndDtUtc:        r.schEndDtUtc!.toISOString(),
      actingRank:         r.actingRank ?? '',
      source:             'leadin' as const,
      actCreditedMinutes: r.actCreditedMinutes != null ? Number(r.actCreditedMinutes) : undefined,
    }))

  return { assignments, groundItems }
}

/** Load the same crew's live roster (pairing-linked + ground) as lead-in. */
async function loadLeadinFromLive(
  db: FastifyInstance['db'],
  crewIds: string[],
): Promise<{ assignments: ScenarioGanttAssignment[]; groundItems: ScenarioGanttGroundItem[] }> {
  if (crewIds.length === 0) return { assignments: [], groundItems: [] }
  const rows = await db
    .select({
      crewId:             rosterFlight.crewId,
      pairingId:          rosterFlight.pairingId,
      assignmentGroup:    rosterFlight.assignmentGroup,
      assignment:         rosterFlight.assignment,
      schStrDtUtc:        rosterFlight.schStrDtUtc,
      schEndDtUtc:        rosterFlight.schEndDtUtc,
      actingRank:         rosterFlight.flightActingRank,
      isDeleted:          rosterFlight.isDeleted,
      actCreditedMinutes: rosterFlight.actCreditedMinutes,
    })
    .from(rosterFlight)
    .where(inArray(rosterFlight.crewId, crewIds))
  return mapLeadinRows(rows as LeadinRow[])
}
```

- [ ] **Step 4: Refactor `buildGanttDataLiveRefresh` to use the helper**

Replace lines 578–616 (the inline `crewIds` / `leadinRows` / `leadinAssignments` / `leadinGroundItems` block) with:

```ts
  // Lead-in: live roster entries for the same crew (pairing-linked + ground tasks)
  const { assignments: leadinAssignments, groundItems: leadinGroundItems } =
    await loadLeadinFromLive(fastify.db, crew.map((c) => c.crewId))
```

Leave the downstream combine (`assignments: [...optAssignments, ...leadinAssignments]`, `groundItems: [...optGroundItems, ...leadinGroundItems]`) unchanged.

- [ ] **Step 5: Remove now-unused imports if any**

Check whether `and` / `isNotNull` (line 1) are still referenced elsewhere in the file:
Run: `cd live-server && grep -nE '\band\(|isNotNull\(' src/services/scenario/scenario-gantt-service.ts`
If a symbol has no remaining uses, drop it from the `import { ... } from 'drizzle-orm'` on line 1. (Keep `inArray` — `loadLeadinFromLive` uses it.)

- [ ] **Step 6: Run the unit test — expect PASS**

Run: `cd live-server && npx vitest run src/__tests__/services/scenario-gantt-service.test.ts -t mapLeadinRows`
Expected: PASS (3 tests).

- [ ] **Step 7: Typecheck the service**

Run: `cd live-server && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add live-server/src/services/scenario/scenario-gantt-service.ts \
        live-server/src/__tests__/services/scenario-gantt-service.test.ts
git commit -m "refactor(scenario): extract loadLeadinFromLive + mapLeadinRows from live-refresh

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Add `buildGanttDataSeed` + `'seed'` data source

**Files:**
- Modify: `live-server/src/services/scenario/scenario-gantt-service.ts` (type union ~line 104; new function after `buildGanttDataLiveRefresh`)
- Test: `live-server/src/services/scenario/__tests__/scenario-gantt-db-service.test.ts`

- [ ] **Step 1: Write the failing integration test**

Append to `live-server/src/services/scenario/__tests__/scenario-gantt-db-service.test.ts`:

```ts
import { buildGanttDataSeed } from '../scenario-gantt-service.js'

describe('buildGanttDataSeed', () => {
  // Reuse a real scenario's scope (460 = RO, PO-backed) so the input is bounded.
  const loadScope = async (id: number) => {
    const r = await db.execute<{
      workset_id: string; rule_group_code: string | null
      str_dt_loc: string; end_dt_loc: string; filter_params: unknown
    }>(sql`SELECT workset_id, rule_group_code, str_dt_loc, end_dt_loc, filter_params
           FROM scenario.scenario WHERE id = ${id}`)
    const row = r.rows[0]
    return {
      worksetId: Number(row.workset_id),
      ruleGroupCode: row.rule_group_code ?? '',
      strDtLoc: new Date(row.str_dt_loc),
      endDtLoc: new Date(row.end_dt_loc),
      filterParams: (row.filter_params ?? {}) as Record<string, unknown>,
    }
  }
  const fastify = () => ({ db }) as never

  it('leadinLive=0 → crew rows with no assignments, dataSource=seed', async () => {
    const scope = await loadScope(460)
    const d = await buildGanttDataSeed(fastify(), {
      id: 460, name: 'seed-test', fileType: 'RO', leadinLive: 0, ...scope,
    })
    expect(d.dataSource).toBe('seed')
    expect(d.readOnly).toBe(true)
    expect(d.crew.length).toBeGreaterThan(0)
    expect(d.assignments).toHaveLength(0)
    expect(d.groundItems).toHaveLength(0)
    expect(d.pairings.length).toBeGreaterThan(0)
  })

  it('leadinLive=1 → assignments seeded from live, all source=leadin', async () => {
    const scope = await loadScope(460)
    const d = await buildGanttDataSeed(fastify(), {
      id: 460, name: 'seed-test', fileType: 'RO', leadinLive: 1, ...scope,
    })
    expect(d.dataSource).toBe('seed')
    expect(d.crew.length).toBeGreaterThan(0)
    for (const a of d.assignments) expect(a.source).toBe('leadin')
    for (const g of d.groundItems) expect(g.source).toBe('leadin')
  })
})
```

> Note: this test connects to the same remote DB the existing `buildGanttDataFromDb` tests use (top of the file). If scenario 460 is unavailable in the target DB, substitute any existing RO scenario id with non-empty scope.

- [ ] **Step 2: Run it — expect FAIL (buildGanttDataSeed not exported)**

Run: `cd live-server && npx vitest run src/services/scenario/__tests__/scenario-gantt-db-service.test.ts -t buildGanttDataSeed`
Expected: FAIL — import error / not a function.

- [ ] **Step 3: Extend the `ScenarioGanttData` type**

In `scenario-gantt-service.ts`, in the `ScenarioGanttData` interface (~line 104), change the `dataSource` line and add `readOnly`:

```ts
  dataSource: 'live-refresh' | 'snapshot' | 'db' | 'seed'
  /** Seed/preview view (DRAFT/FAILED, no loaded roster) — editing disabled. */
  readOnly?: boolean
```

- [ ] **Step 4: Add `buildGanttDataSeed`**

Insert after `buildGanttDataLiveRefresh` (end of file, ~line 640):

```ts
/** Seed view for DRAFT/FAILED RO scenarios with no loaded roster.
 *  Renders the RO input (scope-resolved crew/pairings/segments/flights) with NO optimizer
 *  output. leadinLive=1 seeds read-only pre-occupied assignments from the live roster;
 *  leadinLive=0 shows crew rows with an empty timeline. */
export async function buildGanttDataSeed(
  fastify: FastifyInstance,
  sc: {
    id: number
    name: string | null
    worksetId: number
    strDtLoc: Date
    endDtLoc: Date
    leadinLive: number
    filterParams: Record<string, unknown>
    ruleGroupCode: string
    fileType: string
  },
): Promise<ScenarioGanttData> {
  const scenarioRow: ScenarioRow = {
    id: sc.id,
    worksetId: sc.worksetId,
    strDtLoc: sc.strDtLoc,
    endDtLoc: sc.endDtLoc,
    filterParams: sc.filterParams,
    ruleGroupCode: sc.ruleGroupCode,
    fileType: sc.fileType,
  }

  const inputGz = await buildRoInputGz(fastify, scenarioRow)
  const { crew, pairings } = parseCrewAndPairings(inputGz)
  const pairingSegments = parsePairingSegments(inputGz)
  const flights = parseFlights(inputGz)
  const { strDtLoc, endDtLoc } = deriveDateRange(pairings, sc.strDtLoc, sc.endDtLoc)

  // Lead-in only when the flag is set; otherwise an empty timeline.
  const leadin = sc.leadinLive
    ? await loadLeadinFromLive(fastify.db, crew.map((c) => c.crewId))
    : { assignments: [] as ScenarioGanttAssignment[], groundItems: [] as ScenarioGanttGroundItem[] }

  const { assignments, groundItems } =
    injectSbyAssignments(pairings, pairingSegments, leadin.groundItems, leadin.assignments)
  const updatedPairings = recomputeCompositionFill(pairings, assignments, crew)

  return {
    scenarioId: sc.id,
    scenarioName: sc.name,
    fileType: (sc.fileType as 'PO' | 'RO' | 'TO') ?? 'RO',
    capabilities: capabilitiesFromDict([], sc.fileType),
    strDtLoc,
    endDtLoc,
    scenarioStrDt: new Date(sc.strDtLoc).toISOString(),
    scenarioEndDt: new Date(sc.endDtLoc).toISOString(),
    leadinLive: sc.leadinLive,
    dataSource: 'seed',
    readOnly: true,
    crew,
    pairings: updatedPairings,
    assignments,
    pairingSegments,
    flights,
    groundItems,
    crewStats: {},
  }
}
```

- [ ] **Step 5: Run the integration test — expect PASS**

Run: `cd live-server && npx vitest run src/services/scenario/__tests__/scenario-gantt-db-service.test.ts -t buildGanttDataSeed`
Expected: PASS (2 tests).

- [ ] **Step 6: Typecheck**

Run: `cd live-server && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add live-server/src/services/scenario/scenario-gantt-service.ts \
        live-server/src/services/scenario/__tests__/scenario-gantt-db-service.test.ts
git commit -m "feat(scenario): buildGanttDataSeed for DRAFT/FAILED RO scenarios

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Route gating — call the seed builder

**Files:**
- Modify: `live-server/src/routes/scenario/scenario.ts` (db branch of `GET /:id/gantt-data`, lines 590–617)

- [ ] **Step 1: Add the seed branch**

In the `if (env.SCENARIO_GANTT_SOURCE === 'db')` block, replace the `hasLoadedRoster` guard (lines 592–594):

```ts
        if (!(await hasLoadedRoster(fastify, numId))) {
          return fail(reply, 409, 'Scenario has no loaded result')
        }
```

with:

```ts
        if (!(await hasLoadedRoster(fastify, numId))) {
          // No loaded roster yet: seed DRAFT/FAILED RO scenarios from scope
          // (live lead-in when leadinLive=1, else crew rows with an empty timeline).
          if (sc.fileType === 'RO' && (sc.status === 'DRAFT' || sc.status === 'FAILED')) {
            const { buildGanttDataSeed } = await import(
              '../../services/scenario/scenario-gantt-service.js'
            )
            const data = await buildGanttDataSeed(fastify, sc as never)
            // Read-only: keep pane visibility from the dictionary, disable all editing.
            const capRows = await dictionaryService.getByParentCode(fastify, `SCENARIO_CAP_${sc.fileType}`)
            const caps = capabilitiesFromDict(capRows, sc.fileType)
            data.capabilities = {
              ...caps,
              roster: { canAssign: false, canRemove: false, canReassign: false },
              pairing: { canEditSegments: false },
            }
            return success(reply, data)
          }
          return fail(reply, 409, 'Scenario has no loaded result')
        }
```

- [ ] **Step 2: Verify `capabilitiesFromDict` is imported in the route**

Run: `cd live-server && grep -n "capabilitiesFromDict" src/routes/scenario/scenario.ts`
Expected: an existing import line (it is already used at ~line 610). If absent, add `import { capabilitiesFromDict } from '../../services/scenario/scenario-capabilities.js'`.

- [ ] **Step 3: Typecheck + bump backend version**

Run: `cd live-server && npx tsc --noEmit`
Expected: no errors.

Then edit `gantt/src/version.ts`: `export const BACKEND_VERSION = 137  // scenario DRAFT/FAILED leadin/empty roster pane seed`

- [ ] **Step 4: Commit**

```bash
git add live-server/src/routes/scenario/scenario.ts gantt/src/version.ts
git commit -m "feat(scenario): serve seed gantt-data for DRAFT/FAILED RO with no roster

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Frontend type accepts `'seed'`

**Files:**
- Modify: `gantt/src/types/scenario-gantt.ts` (line 104)

- [ ] **Step 1: Extend the union**

Change line 104 and add `readOnly`:

```ts
  dataSource: 'live-refresh' | 'snapshot' | 'db' | 'seed'
  /** Seed/preview view (DRAFT/FAILED, no loaded roster) — editing disabled. */
  readOnly?: boolean
```

- [ ] **Step 2: Typecheck the frontend**

Run: `cd gantt && npx tsc --noEmit`
Expected: no errors (capabilities already gate editing; no source change needed for read-only).

- [ ] **Step 3: Commit**

```bash
git add gantt/src/types/scenario-gantt.ts
git commit -m "feat(gantt): accept 'seed' scenario gantt dataSource

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Toolbar context badge for the seed state

**Files:**
- Modify: `gantt/src/components/scenario-gantt/scenario-gantt-toolbar.tsx` (the `dataSource` badge, ~lines 80–83)

- [ ] **Step 1: Replace the two-way badge with a three-way badge**

Replace:

```tsx
      {data.dataSource === 'live-refresh'
        ? <span className="rounded px-1.5 py-0.5 text-3xs font-semibold bg-amber-500/15 text-amber-400">Live Context</span>
        : <span className="rounded px-1.5 py-0.5 text-3xs font-semibold bg-blue-500/15 text-blue-400">Snapshot</span>
      }
```

with:

```tsx
      {data.dataSource === 'seed'
        ? <span
            data-testid="sg-source-badge"
            className="rounded px-1.5 py-0.5 text-3xs font-semibold bg-amber-500/15 text-amber-400">
            {data.leadinLive ? 'Live lead-in · preview' : 'Empty · no lead-in'}
          </span>
        : data.dataSource === 'live-refresh'
          ? <span data-testid="sg-source-badge" className="rounded px-1.5 py-0.5 text-3xs font-semibold bg-amber-500/15 text-amber-400">Live Context</span>
          : <span data-testid="sg-source-badge" className="rounded px-1.5 py-0.5 text-3xs font-semibold bg-blue-500/15 text-blue-400">Snapshot</span>
      }
```

- [ ] **Step 2: Typecheck + bump frontend version**

Run: `cd gantt && npx tsc --noEmit`
Expected: no errors.

Edit `gantt/src/version.ts`: `export const FRONTEND_VERSION = 289  // scenario DRAFT/FAILED leadin/empty roster pane badge`

- [ ] **Step 3: Run the UI-standard gate**

Run: `npm run check:ui`
Expected: PASS — 0 hard violations (the badge reuses existing `text-3xs` token + semantic colors).

- [ ] **Step 4: Commit**

```bash
git add gantt/src/components/scenario-gantt/scenario-gantt-toolbar.tsx gantt/src/version.ts
git commit -m "feat(gantt): seed-state source badge in scenario toolbar

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Roster items — leadin source flows through the builder

**Files:**
- Test: `gantt/src/components/scenario-gantt/__tests__/build-scenario-roster-items.test.ts`

> Note: `buildScenarioRosterItems` keys `itemsByCrew` off assignments and does **not** use the `crew` arg, so a crew with no assignments produces no map entry — the empty-timeline **row** is rendered by the roster pane iterating the `crew` list, and is proven by the Playwright case in Task 7 (leadinLive=0). This task only locks in that `source:'leadin'` survives the builder (so the renderer draws leadin pucks without the optimizer ⚡).

- [ ] **Step 1: Write the failing/regression test**

Append to `build-scenario-roster-items.test.ts` (reuse its existing `mkPairing` / `mkSeg` builders):

```ts
describe('scenario seed — leadin source', () => {
  it('preserves source=leadin on seeded assignments', () => {
    const pairingMap = new Map([[1, mkPairing(1)]])
    const assignments: ScenarioGanttAssignment[] = [{ crewId: 'C1', pairingId: 1, source: 'leadin' }]
    const { items, itemsByCrew } = buildScenarioRosterItems({
      crew: [{ crewId: 'C1' }],
      pairingMap,
      assignments,
      pairingSegments: [mkSeg(1)],
      groundItems: [],
      pendingChanges: [],
    })
    const c1 = itemsByCrew.get('C1') ?? []
    expect(c1.length).toBeGreaterThan(0)
    expect(items.every((i) => i.source === 'leadin')).toBe(true)
  })

  it('produces no items for a leadinLive=0 (empty) assignment set', () => {
    const { items } = buildScenarioRosterItems({
      crew: [{ crewId: 'C1' }, { crewId: 'C2' }],
      pairingMap: new Map([[1, mkPairing(1)]]),
      assignments: [],
      pairingSegments: [mkSeg(1)],
      groundItems: [],
      pendingChanges: [],
    })
    expect(items).toHaveLength(0) // crew rows themselves come from the pane (see Task 7)
  })
})
```

- [ ] **Step 2: Run the test**

Run: `cd gantt && npx vitest run src/components/scenario-gantt/__tests__/build-scenario-roster-items.test.ts`
Expected: PASS (existing tests + 2 new). If `source` does not survive, fix `build-scenario-roster-items.ts` (the `addItem` calls already set `source: a.source`), then re-run to PASS.

- [ ] **Step 3: Commit**

```bash
git add gantt/src/components/scenario-gantt/
git commit -m "test(gantt): leadin source + empty-roster crew rows for scenario seed

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Playwright e2e — the integration proof

**Files:**
- Create: `e2e/tests/gantt/scenario-draft-leadin-roster.spec.ts`

- [ ] **Step 1: Inspect helpers from a sibling scenario spec**

Run: `cd e2e && sed -n '1,80p' tests/gantt/scenario-duplicate.spec.ts && ls utils pages fixtures`
Note the login/setup helpers, how a scenario is created (to make a fresh DRAFT RO with `leadinLive` set), how the scenario gantt is opened (`sg-scenario-name` / Open button), and the roster pane testids.

- [ ] **Step 2: Write the e2e test (3 cases)**

Create `e2e/tests/gantt/scenario-draft-leadin-roster.spec.ts` using the helpers from Step 1. Implement three sequential, asserted scenarios:

```ts
import { test, expect } from '@playwright/test'
// + project setup/login helpers discovered in Step 1

test.describe('Scenario DRAFT/FAILED leadin/empty roster pane', () => {
  test('leadinLive=1 DRAFT RO → roster seeded with read-only live lead-in', async ({ page }) => {
    // 1. create (or open) a DRAFT RO scenario with Lead-in live CHECKED
    // 2. open its gantt
    // 3. assert source badge: expect(page.getByTestId('sg-source-badge')).toContainText('Live lead-in')
    // 4. assert roster pucks present (count > 0) for a known crew row
    // 5. assert read-only: attempt a drag → puck does not move / no save-enabled state
    // 6. assert Flight & Pairing panes are non-empty
  })

  test('leadinLive=0 DRAFT RO → crew rows, empty timeline', async ({ page }) => {
    // 1. create (or open) a DRAFT RO scenario with Lead-in live UNCHECKED
    // 2. open its gantt
    // 3. assert source badge: expect(page.getByTestId('sg-source-badge')).toContainText('Empty')
    // 4. assert crew rows visible (roster row count > 0) AND zero pucks
    // 5. assert Flight & Pairing panes non-empty
  })

  test('regression: DRAFT RO with no roster renders instead of 409 error banner', async ({ page }) => {
    // open the DRAFT RO scenario gantt; assert NO "Scenario has no loaded result"
    // error banner is shown and the gantt canvas/roster header renders.
  })
})
```

> Use real assertions on **specific** values (badge text, row/puck counts), not bare `toBeVisible()` — per §Playwright anti-patterns. Mirror selector/testid conventions from the sibling spec. Prefer creating a throwaway scenario in the test (clean up after) over depending on a fixed id.

- [ ] **Step 3: Run the e2e (backend + frontend must be running)**

Run: `npx playwright test e2e/tests/gantt/scenario-draft-leadin-roster.spec.ts --reporter=list`
Expected: 3 passed. Paste the PASS summary into the completion message (§No-Illusion).

- [ ] **Step 4: Commit**

```bash
git add e2e/tests/gantt/scenario-draft-leadin-roster.spec.ts
git commit -m "test(e2e/gantt): DRAFT/FAILED RO leadin/empty roster pane

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Full verification sweep

- [ ] **Step 1: Backend unit + integration tests**

Run: `cd live-server && npx vitest run src/__tests__/services/scenario-gantt-service.test.ts src/services/scenario/__tests__/scenario-gantt-db-service.test.ts`
Expected: all PASS.

- [ ] **Step 2: Frontend unit tests + typecheck + UI gate**

Run: `cd gantt && npx vitest run src/components/scenario-gantt/__tests__/build-scenario-roster-items.test.ts && npx tsc --noEmit && cd .. && npm run check:ui`
Expected: PASS, no type errors, 0 hard UI violations.

- [ ] **Step 3: E2E**

Run: `npx playwright test e2e/tests/gantt/scenario-draft-leadin-roster.spec.ts --reporter=list`
Expected: 3 passed.

- [ ] **Step 4: Paste all PASS receipts into the completion message and mark done.**

---

## Self-review notes (spec coverage)

- §2 leadinLive=1 read-only live lead-in → Tasks 2 (builder), 3 (read-only caps), 7 (e2e case 1). ✓
- §2 leadinLive=0 empty crew rows → Tasks 2, 6 (empty rows), 7 (e2e case 2). ✓
- §2 precedence (only when no scenario rows) → Task 3 gate on `!hasLoadedRoster`. ✓
- §2 RO-only / DRAFT+FAILED → Task 3 `fileType==='RO' && status∈{DRAFT,FAILED}`. ✓
- §2 Flight & Pairing populate → Task 2 parses pairings/segments/flights from inputGz; e2e asserts non-empty. ✓
- §2 visually marked leadin → existing renderer (CR gets ⚡, leadin does not); Task 6 asserts source flows. ✓
- §4 build mechanism (reuse buildRoInputGz) → Task 2. ✓
- §9 version bump both → Tasks 3 (B137) + 5 (F289). ✓
- Unchanged paths (loaded roster, PO/TO, RUNNING, gz escape hatch) → Task 3 leaves them intact. ✓
