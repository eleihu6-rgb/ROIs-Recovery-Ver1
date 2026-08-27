# Roster ↔ Pairing DHD Color Align Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Roster pane deadhead (DHD) segment pucks use the same purple fill as Pairing pane, for both Live and Scenario, by sharing segment-assignment detection (`DH` / `DHD`).

**Architecture:** Add `isDeadheadSegAssignment` (+ roster fallback helper) in `puck-duty-color.ts`. Pairing and Roster renderers call it. Scenario roster builder maps `DH|DHD` → `assignmentGroup: 'DHD'` and copies `segAssignment` onto each item. Live `roster-service` already joins `pairing_segment` — project `segAssignment` onto the gantt DTO. Optimistic Live assign placeholders set the same fields.

**Tech Stack:** TypeScript, Vitest (gantt + live-server), existing Canvas renderers, Fastify/Drizzle roster load path.

**Spec:** `docs/superpowers/specs/2026-08-17-roster-pairing-dhd-color-align-design.md`

## Global Constraints

- Do **not** `git commit` or `git push` unless the user explicitly asks.
- Touch only files required for this paint/mapping fix (§Surgical).
- UI language stays English; no new UI copy.
- Do not change `FLIGHT_COLOR_DH_*` hex values.
- Do not backfill `roster_flight` rows.
- Do not treat Scenario S3 carrier codes (`AC`, `PD`, …) as deadhead unless already `DH`/`DHD`.

## File map

| File | Role |
|---|---|
| `gantt/src/utils/puck-duty-color.ts` | Shared deadhead helpers |
| `gantt/src/utils/__tests__/puck-duty-color.test.ts` | Unit tests for helpers |
| `gantt/src/types/roster.ts` | Optional `segAssignment` on `RosterItem` |
| `gantt/src/components/scenario-gantt/build-scenario-roster-items.ts` | Map DH\|DHD + copy `segAssignment` |
| `gantt/src/components/scenario-gantt/__tests__/build-scenario-roster-items.test.ts` | Scenario mapping tests |
| `gantt/src/components/gantt/renderers/pairing-renderer.ts` | Use shared helper |
| `gantt/src/components/gantt/renderers/roster-renderer.ts` | Prefer `segAssignment` for DHD paint |
| `gantt/src/utils/gantt-test-hook.ts` | Optional: expose deadhead probe |
| `gantt/src/components/layout/pane-container.tsx` | Live optimistic placeholders |
| `gantt/src/components/layout/app-layout.tsx` | Live optimistic placeholders (duplicate block) |
| `live-server/src/services/roster/roster-service.ts` | Select + map `segAssignment` |
| `live-server/src/__tests__/services/roster/roster-service.test.ts` | Assert DTO includes `segAssignment` |
| `live-server/src/services/scenario/scenario-patch-service.ts` | Widen SQL `DH` → `DH\|DHD` |

---

### Task 1: Shared deadhead classifiers

**Files:**
- Modify: `gantt/src/utils/puck-duty-color.ts`
- Modify: `gantt/src/utils/__tests__/puck-duty-color.test.ts`

**Interfaces:**
- Produces:
  - `isDeadheadSegAssignment(code: string | null | undefined): boolean`
  - `isDeadheadRosterPuck(item: { segAssignment?: string | null; assignmentGroup?: string | null; assignment?: string | null }): boolean`
    - Prefer `segAssignment` via `isDeadheadSegAssignment`
    - Else `assignmentGroup` normalized `=== 'DHD'` OR `isDeadheadSegAssignment(assignment)`

- [ ] **Step 1: Write failing tests**

Append to `gantt/src/utils/__tests__/puck-duty-color.test.ts`:

```ts
import { isDeadheadSegAssignment, isDeadheadRosterPuck } from '../puck-duty-color'

describe('isDeadheadSegAssignment', () => {
  it('returns true for DH and DHD (trimmed / mixed case)', () => {
    expect(isDeadheadSegAssignment('DH')).toBe(true)
    expect(isDeadheadSegAssignment('DHD')).toBe(true)
    expect(isDeadheadSegAssignment(' dh ')).toBe(true)
    expect(isDeadheadSegAssignment('dHd')).toBe(true)
  })

  it('returns false for flying / reserve / empty', () => {
    expect(isDeadheadSegAssignment('FLY')).toBe(false)
    expect(isDeadheadSegAssignment('FLT')).toBe(false)
    expect(isDeadheadSegAssignment('RES')).toBe(false)
    expect(isDeadheadSegAssignment('')).toBe(false)
    expect(isDeadheadSegAssignment(null)).toBe(false)
    expect(isDeadheadSegAssignment(undefined)).toBe(false)
  })
})

describe('isDeadheadRosterPuck', () => {
  it('prefers segAssignment over group/assignment', () => {
    expect(isDeadheadRosterPuck({
      segAssignment: 'DHD',
      assignmentGroup: 'FLY',
      assignment: 'FLY',
    })).toBe(true)
  })

  it('falls back to assignmentGroup DHD or assignment DH/DHD', () => {
    expect(isDeadheadRosterPuck({ assignmentGroup: 'DHD', assignment: 'FLY' })).toBe(true)
    expect(isDeadheadRosterPuck({ assignmentGroup: 'FLY', assignment: 'DHD' })).toBe(true)
    expect(isDeadheadRosterPuck({ assignmentGroup: 'FLY', assignment: 'FLY' })).toBe(false)
  })
})
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
cd /home/qianggong/Documents/Crew/rois-ai/gantt && npx vitest run src/utils/__tests__/puck-duty-color.test.ts --reporter=list
```

Expected: FAIL (exports missing).

- [ ] **Step 3: Implement helpers**

In `puck-duty-color.ts`, after `normalizeCode`:

```ts
const DEADHEAD_SEG_CODES = new Set(['DH', 'DHD'])

/** True when pairing_segment.seg_assignment (or equivalent) is deadhead. */
export const isDeadheadSegAssignment = (code: string | null | undefined): boolean =>
  DEADHEAD_SEG_CODES.has(normalizeCode(code))

/** Roster segment-mode deadhead: prefer segAssignment, then group/assignment fallback. */
export const isDeadheadRosterPuck = (item: {
  segAssignment?: string | null
  assignmentGroup?: string | null
  assignment?: string | null
}): boolean => {
  if (item.segAssignment != null && String(item.segAssignment).trim() !== '') {
    return isDeadheadSegAssignment(item.segAssignment)
  }
  if (normalizeCode(item.assignmentGroup) === 'DHD') return true
  return isDeadheadSegAssignment(item.assignment)
}
```

- [ ] **Step 4: Run tests — expect PASS**

Same vitest command. Expected: all tests PASS.

- [ ] **Step 5: Commit (only if user asks)**

```bash
git add gantt/src/utils/puck-duty-color.ts gantt/src/utils/__tests__/puck-duty-color.test.ts
git commit -m "$(cat <<'EOF'
feat(gantt): shared DH/DHD deadhead classifiers for puck paint

EOF
)"
```

---

### Task 2: Scenario roster item mapping

**Files:**
- Modify: `gantt/src/types/roster.ts` — add `segAssignment?: string | null` near other duty-level fields (~line 54)
- Modify: `gantt/src/components/scenario-gantt/build-scenario-roster-items.ts`
- Modify: `gantt/src/components/scenario-gantt/__tests__/build-scenario-roster-items.test.ts`

**Interfaces:**
- Consumes: `isDeadheadSegAssignment` from Task 1
- Produces: flying `RosterItem` with `segAssignment` set and `assignmentGroup: 'DHD'` when segment is deadhead

- [ ] **Step 1: Write failing tests**

In `build-scenario-roster-items.test.ts`, add:

```ts
it('maps DH and DHD segAssignment to assignmentGroup DHD and copies segAssignment', () => {
  const pairingMap = new Map([[100, mkPairing(100, { assignmentGroup: 'FLY', assignment: 'FLY' })]])
  const forDhd = buildScenarioRosterItems({
    crew: [{ crewId: 'CREW1' }],
    pairingMap,
    assignments: [{ crewId: 'CREW1', pairingId: 100, source: 'CR' }],
    pairingSegments: [mkSeg(100, { segAssignment: 'DHD', segSeq: 3, fltNum: 'GT' })],
    groundItems: [],
    pendingChanges: [],
  })
  expect(forDhd.items[0]).toMatchObject({
    assignmentGroup: 'DHD',
    segAssignment: 'DHD',
  })

  const forDh = buildScenarioRosterItems({
    crew: [{ crewId: 'CREW1' }],
    pairingMap,
    assignments: [{ crewId: 'CREW1', pairingId: 100, source: 'CR' }],
    pairingSegments: [mkSeg(100, { segAssignment: 'DH', segSeq: 2 })],
    groundItems: [],
    pendingChanges: [],
  })
  expect(forDh.items[0]).toMatchObject({
    assignmentGroup: 'DHD',
    segAssignment: 'DH',
  })
})

it('keeps pairing assignmentGroup for non-deadhead segments', () => {
  const { items } = buildScenarioRosterItems({
    crew: [{ crewId: 'CREW1' }],
    pairingMap: new Map([[100, mkPairing(100, { assignmentGroup: 'FLY' })]]),
    assignments: [{ crewId: 'CREW1', pairingId: 100, source: 'CR' }],
    pairingSegments: [mkSeg(100, { segAssignment: 'FLY' })],
    groundItems: [],
    pendingChanges: [],
  })
  expect(items[0].assignmentGroup).toBe('FLY')
  expect(items[0].segAssignment).toBe('FLY')
})
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
cd /home/qianggong/Documents/Crew/rois-ai/gantt && npx vitest run src/components/scenario-gantt/__tests__/build-scenario-roster-items.test.ts --reporter=list
```

Expected: FAIL on `assignmentGroup` / missing `segAssignment`.

- [ ] **Step 3: Implement type + builder**

1. In `roster.ts`, add:

```ts
  /** From pairing_segment.seg_assignment when known (Live join / Scenario build). */
  segAssignment?: string | null
```

2. In `build-scenario-roster-items.ts`, import `isDeadheadSegAssignment` and replace the flying-segment `assignmentGroup` line (~159) with:

```ts
          assignmentGroup: isDeadheadSegAssignment(seg.segAssignment)
            ? 'DHD'
            : (pairing.assignmentGroup || 'FLT'),
          assignment: pairing.assignment,
          segAssignment: seg.segAssignment,
```

- [ ] **Step 4: Run tests — expect PASS**

Same vitest command. Expected: PASS.

- [ ] **Step 5: Commit (only if user asks)** — message e.g. `fix(gantt): map scenario DHD segments onto roster items`

---

### Task 3: Pairing + Roster renderers

**Files:**
- Modify: `gantt/src/components/gantt/renderers/pairing-renderer.ts` (~330)
- Modify: `gantt/src/components/gantt/renderers/roster-renderer.ts` (~690–708)
- Modify: `gantt/src/utils/gantt-test-hook.ts` (optional probe)
- Modify: `gantt/src/utils/__tests__/puck-duty-color.test.ts` (if hook not covered — renderer logic covered via helper tests)

**Interfaces:**
- Consumes: `isDeadheadSegAssignment`, `isDeadheadRosterPuck`, `resolveSegmentDutyFill`

- [ ] **Step 1: Update pairing-renderer**

Import `isDeadheadSegAssignment`. Replace:

```ts
const isDH = seg.segAssignment === 'DH' || seg.segAssignment === 'DHD'
```

with:

```ts
const isDH = isDeadheadSegAssignment(seg.segAssignment)
```

Keep passing `isDeadhead: isDH` into `resolveSegmentDutyFill`.

- [ ] **Step 2: Update roster-renderer segment fill**

Import `isDeadheadRosterPuck` and `resolveSegmentDutyFill` (already imports resolve).

Replace the block that sets `isDH` / fill (~690–718) with:

```ts
      const isDH = isDeadheadRosterPuck(item)
      const isSBY = item.assignmentGroup === 'SBY'
      const severity = violationMap.get(item.id) ?? 0

      let puckTextColor: string | undefined
      if (isDH) {
        gradientFill(ctx, segStart, flightY, segWidth, flightHeight, FLIGHT_COLOR_DH_TOP, FLIGHT_COLOR_DH_BOTTOM, 3)
        ctx.strokeStyle = 'rgba(168, 85, 247, 0.35)'
      } else if (isSBY) {
        // ... existing SBY branch unchanged ...
      } else {
        const fill = resolveSegmentDutyFill({
          assignmentGroup: item.assignmentGroup,
          assignment: item.assignment,
          isDeadhead: false,
        })
        // ... existing reserve / fly branches unchanged ...
      }
```

Critical: `isDH` must use `isDeadheadRosterPuck(item)` so `segAssignment: 'DHD'` with `assignmentGroup: 'FLY'` paints purple.

- [ ] **Step 3: Extend test-hook (small)**

In `gantt-test-hook.ts`, import `isDeadheadRosterPuck` and add beside `segmentDutyFill`:

```ts
    isDeadheadRosterPuck: (item: {
      segAssignment?: string | null
      assignmentGroup?: string | null
      assignment?: string | null
    }) => isDeadheadRosterPuck(item),
```

- [ ] **Step 4: Run unit tests**

```bash
cd /home/qianggong/Documents/Crew/rois-ai/gantt && npx vitest run src/utils/__tests__/puck-duty-color.test.ts src/components/scenario-gantt/__tests__/build-scenario-roster-items.test.ts --reporter=list
```

Expected: PASS. (No separate Canvas pixel test required per spec.)

- [ ] **Step 5: Commit (only if user asks)**

---

### Task 4: Live roster DTO — project `segAssignment`

**Files:**
- Modify: `live-server/src/services/roster/roster-service.ts` (select + DTO map ~178–290; assignPairing merge ~742–754)
- Modify: `live-server/src/__tests__/services/roster/roster-service.test.ts` (`mockRow` + assertion)

**Interfaces:**
- Produces: gantt roster DTO field `segAssignment: string | null`

- [ ] **Step 1: Extend mock + failing assertion**

In `roster-service.test.ts` `mockRow`, add:

```ts
segAssignment: null,
```

In the test that maps nested rows to the gantt DTO, set one row:

```ts
segAssignment: 'DHD',
```

and assert:

```ts
expect(result.../* the mapped item for that crew */).toEqual(expect.objectContaining({
  segAssignment: 'DHD',
}))
```

(Adjust to match the existing `result` shape in that test — it already asserts other duty fields.)

- [ ] **Step 2: Run test — expect FAIL**

```bash
cd /home/qianggong/Documents/Crew/rois-ai/live-server && npx vitest run src/__tests__/services/roster/roster-service.test.ts --reporter=list
```

Expected: FAIL until field is mapped.

- [ ] **Step 3: Implement select + map**

1. In the drizzle select that already loads duty fields, add:

```ts
segAssignment: pairingSegment.segAssignment,
```

(alongside `dutyPickupStartUtc: pairingSegment.pickupStartUtc`, etc.)

2. In the DTO builder (~277+), add:

```ts
segAssignment: dutyFields.segAssignment ?? null,
```

3. In `assignPairing` merge (~742), add:

```ts
segAssignment: seg.segAssignment,
```

so the immediate assign response carries the paint signal.

- [ ] **Step 4: Run test — expect PASS**

Same vitest command.

- [ ] **Step 5: Commit (only if user asks)**

---

### Task 5: Live optimistic assign placeholders

**Files:**
- Modify: `gantt/src/components/layout/pane-container.tsx` (~95–123)
- Modify: `gantt/src/components/layout/app-layout.tsx` (~175–206)

**Interfaces:**
- Consumes: `isDeadheadSegAssignment`

- [ ] **Step 1: Update both placeholder maps**

Import `isDeadheadSegAssignment` from `@/utils/puck-duty-color`.

For each `pairingItem.segments.map((seg) => ({...}))` block, set:

```ts
assignmentGroup: isDeadheadSegAssignment(seg.segAssignment)
  ? 'DHD'
  : pairing.assignmentGroup,
assignment: pairing.assignment,
segAssignment: seg.segAssignment,
```

(Keep other fields unchanged.)

Do **not** extract a shared factory unless a third copy appears — update both call sites (§Minimal-First).

- [ ] **Step 2: Typecheck / focused test**

```bash
cd /home/qianggong/Documents/Crew/rois-ai/gantt && npx tsc --noEmit -p tsconfig.json 2>&1 | head -40
```

Expected: no new errors on these files. (If full `tsc` is slow/noisy, at least ensure the edited files typecheck in IDE / existing vitest suite still passes.)

- [ ] **Step 3: Commit (only if user asks)**

---

### Task 6: Scenario patch SQL deadhead predicate

**Files:**
- Modify: `live-server/src/services/scenario/scenario-patch-service.ts` (~244)

- [ ] **Step 1: Widen CASE**

Replace:

```sql
CASE WHEN ps.seg_assignment = 'DH' THEN 'DHD' ELSE COALESCE(p.assignment_group, 'FLT') END,
```

with:

```sql
CASE WHEN upper(btrim(ps.seg_assignment)) IN ('DH', 'DHD') THEN 'DHD' ELSE COALESCE(p.assignment_group, 'FLT') END,
```

- [ ] **Step 2: Add a lightweight source assertion test**

In `live-server/src/__tests__/services/scenario-patch-service.test.ts` (or a tiny new adjacent test file), add:

```ts
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

it('maps DH and DHD seg_assignment to roster assignment_group DHD in SQL', () => {
  const src = readFileSync(
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../services/scenario/scenario-patch-service.ts'),
    'utf8',
  )
  expect(src).toMatch(/upper\(btrim\(ps\.seg_assignment\)\)\s+IN\s*\(\s*'DH'\s*,\s*'DHD'\s*\)/)
})
```

(Adjust relative path if the test file location differs — goal is to lock the SQL predicate.)

- [ ] **Step 3: Run test**

```bash
cd /home/qianggong/Documents/Crew/rois-ai/live-server && npx vitest run src/__tests__/services/scenario-patch-service.test.ts --reporter=list
```

Expected: PASS (including new assertion).

- [ ] **Step 4: Commit (only if user asks)**

---

### Task 7: Final verification

- [ ] **Step 1: Run gantt unit suite for touched areas**

```bash
cd /home/qianggong/Documents/Crew/rois-ai/gantt && npx vitest run \
  src/utils/__tests__/puck-duty-color.test.ts \
  src/components/scenario-gantt/__tests__/build-scenario-roster-items.test.ts \
  --reporter=list
```

Expected: all PASS.

- [ ] **Step 2: Run live-server unit suite for touched areas**

```bash
cd /home/qianggong/Documents/Crew/rois-ai/live-server && npx vitest run \
  src/__tests__/services/roster/roster-service.test.ts \
  src/__tests__/services/scenario-patch-service.test.ts \
  --reporter=list
```

Expected: all PASS.

- [ ] **Step 3: Manual smoke (if SIT/local gantt available)**

Open Scenario with a multi-leg pairing that has a `DHD` segment (e.g. T4159 pattern). Confirm Roster and Pairing third-segment fills match (same purple gradient).

- [ ] **Step 4: Report results to user; do not commit unless asked**

---

## Spec coverage check

| Spec requirement | Task |
|---|---|
| Shared `isDeadheadSegAssignment` | Task 1 |
| Roster fallback classifier | Task 1 (`isDeadheadRosterPuck`) |
| Pairing renderer uses helper | Task 3 |
| Roster renderer prefers `segAssignment` | Task 3 |
| Scenario build maps DH\|DHD + copies field | Task 2 |
| `RosterItem.segAssignment` type | Task 2 |
| Live join projects `segAssignment` | Task 4 |
| Optimistic Live placeholders | Task 5 |
| Scenario patch SQL IN ('DH','DHD') | Task 6 |
| Vitest coverage | Tasks 1–2, 4, 6, 7 |
| No color constant / DB backfill changes | Global constraints |

## Execution handoff

Plan saved to `docs/superpowers/plans/2026-08-17-roster-pairing-dhd-color-align.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks  
2. **Inline Execution** — run tasks in this session with checkpoints  

Which approach? (Still no commits until you say so.)
