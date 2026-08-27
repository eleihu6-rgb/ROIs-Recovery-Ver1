# 7501 Puck All In-Window FLY Pairings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** For rule 7501 only, paint puck `!` (and puck-hover message) on every FLY pairing of the affected crew that overlaps the violation time window — not only the persisted anchor `pairing_id`.

**Architecture:** Display-only. Keep one DB/engine row and `trigger_pairing`. Extend `violation-puck-window` helpers; Live `buildLiveViolationMap`, Scenario `buildViolationMap`, and puck-mode `collectViolationTooltipEntries` call them when `ruleCode === '7501'` and a paint window resolves. Non-7501 and crew-bell / Alert Center unchanged.

**Tech Stack:** TypeScript, Vitest (gantt), optional Playwright e2e; shared util under `gantt/src/utils/`.

## Global Constraints

- Scope: **7501 only** (not 8002 / other cumulative rules).
- FLY pairing = any loaded task of that pairing has `assignmentGroup === 'FLY'`.
- Paint / tooltip tasks = tasks of those pairings whose `[schStrDtUtc, schEndDtUtc]` overlaps `resolveViolationPaintWindow(v)`.
- Missing/invalid window → **legacy** (anchor pairing path only).
- No engine, persistence, or `CREW_BELL_ONLY_RULES` changes.
- Live + Scenario must share the same paint semantics (§Gantt-Unify).
- Preserve crew-923 regression: Aug FLY + Sep window → no Aug puck `!`.
- UI strings remain English.

## File map

| File | Responsibility |
|------|----------------|
| `gantt/src/utils/violation-puck-window.ts` | Shared window resolve + new FLY/window task selection |
| `gantt/src/utils/__tests__/violation-puck-window.test.ts` | Helper unit tests |
| `gantt/src/components/gantt/source/live-gantt-source.ts` | Live puck severity map |
| `gantt/src/components/gantt/source/scenario-gantt-source.ts` | Scenario puck severity map |
| `gantt/src/components/gantt/source/__tests__/violation-window-severity.test.ts` | Live/Scenario map regressions + 2438-shaped case |
| `gantt/src/components/gantt/violation-tooltip.tsx` | Puck hover entries for non-anchor 7501 |
| `gantt/src/components/gantt/__tests__/violation-tooltip.test.ts` | Tooltip regressions + non-anchor 7501 |
| `e2e/tests/gantt/rule-7501-puck-all-fly-in-window.spec.ts` | Optional UI/data smoke (Task 4) |

---

### Task 1: Shared helper — FLY pairings overlapping window

**Files:**
- Modify: `gantt/src/utils/violation-puck-window.ts`
- Test: `gantt/src/utils/__tests__/violation-puck-window.test.ts`

**Interfaces:**
- Consumes: existing `resolveViolationPaintWindow`, `ViolationTimeWindow`, `RosterItem`
- Produces:
  - `isFlyPairing(tasks: RosterItem[]): boolean`
  - `crewFlyTasksOverlappingWindow(crewTasks: RosterItem[], violation: ViolationTimeWindow): RosterItem[]`

- [ ] **Step 1: Write the failing tests**

Append to `gantt/src/utils/__tests__/violation-puck-window.test.ts`:

```typescript
import {
  pairingTasksOverlapViolationWindow,
  resolveViolationPaintWindow,
  isFlyPairing,
  crewFlyTasksOverlappingWindow,
} from '../violation-puck-window'

const task = (
  id: number,
  pairingId: number,
  start: string,
  end: string,
  assignmentGroup = 'FLY',
): RosterItem =>
  ({
    id,
    crewId: '2438',
    pairingId,
    assignmentGroup,
    schStrDtUtc: start,
    schEndDtUtc: end,
  }) as RosterItem

describe('isFlyPairing / crewFlyTasksOverlappingWindow', () => {
  const window7501 = {
    startDt: '2026-08-09T06:31:00.000Z',
    endDt: '2026-08-16T06:31:00.000Z',
  }

  it('isFlyPairing true when any segment is FLY', () => {
    expect(isFlyPairing([
      task(1, 15676, '2026-08-11T15:15:00.000Z', '2026-08-11T19:00:00.000Z', 'FLY'),
      task(2, 15676, '2026-08-11T19:30:00.000Z', '2026-08-11T21:00:00.000Z', 'DHD'),
    ])).toBe(true)
  })

  it('isFlyPairing false for ground-only pairing tasks', () => {
    expect(isFlyPairing([
      task(1, 99, '2026-08-11T00:00:00.000Z', '2026-08-12T00:00:00.000Z', 'DO'),
    ])).toBe(false)
  })

  it('returns overlapping tasks on all FLY pairings (2438 shape)', () => {
    const crewTasks = [
      task(10, 116335, '2026-08-10T15:15:00.000Z', '2026-08-10T19:10:00.000Z', 'FLY'),
      task(11, 15676, '2026-08-11T15:15:00.000Z', '2026-08-11T19:00:00.000Z', 'FLY'),
      task(12, 15676, '2026-08-11T19:30:00.000Z', '2026-08-11T21:00:00.000Z', 'DHD'),
      task(13, 15806, '2026-08-13T15:15:00.000Z', '2026-08-13T19:00:00.000Z', 'FLY'),
      task(14, 15806, '2026-08-14T10:05:00.000Z', '2026-08-14T14:15:00.000Z', 'FLY'),
    ]
    const out = crewFlyTasksOverlappingWindow(crewTasks, window7501)
    expect(out.map((t) => t.id).sort((a, b) => a - b)).toEqual([10, 11, 12, 13, 14])
  })

  it('returns empty when violation has no usable window (caller must use legacy path)', () => {
    expect(crewFlyTasksOverlappingWindow(
      [task(1, 1, '2026-08-11T15:15:00.000Z', '2026-08-11T19:00:00.000Z')],
      { startDt: null, endDt: null },
    )).toEqual([])
  })

  it('excludes tasks outside the window', () => {
    const crewTasks = [
      task(1, 16693, '2026-08-27T13:00:00.000Z', '2026-08-27T16:55:00.000Z'),
    ]
    expect(crewFlyTasksOverlappingWindow(crewTasks, {
      startDt: '2026-09-19T06:31:00.000Z',
      endDt: '2026-09-26T06:31:00.000Z',
    })).toEqual([])
  })
})
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
cd gantt && npx vitest run src/utils/__tests__/violation-puck-window.test.ts --reporter=list
```

Expected: FAIL — `isFlyPairing` / `crewFlyTasksOverlappingWindow` not exported.

- [ ] **Step 3: Implement helpers**

In `gantt/src/utils/violation-puck-window.ts` add:

```typescript
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
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
cd gantt && npx vitest run src/utils/__tests__/violation-puck-window.test.ts --reporter=list
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add gantt/src/utils/violation-puck-window.ts gantt/src/utils/__tests__/violation-puck-window.test.ts
git commit -m "feat(gantt): select 7501 puck tasks across in-window FLY pairings"
```

---

### Task 2: Live + Scenario violation maps

**Files:**
- Modify: `gantt/src/components/gantt/source/live-gantt-source.ts` (`buildLiveViolationMap`)
- Modify: `gantt/src/components/gantt/source/scenario-gantt-source.ts` (`buildViolationMap`)
- Test: `gantt/src/components/gantt/source/__tests__/violation-window-severity.test.ts`

**Interfaces:**
- Consumes: `crewFlyTasksOverlappingWindow`, `resolveViolationPaintWindow`, `pairingTasksOverlapViolationWindow`
- Produces: unchanged map signatures (`Map<number, number>` taskId → severity)

- [ ] **Step 1: Write the failing map tests**

Append to `violation-window-severity.test.ts` (reuse local `item` helper; override times):

```typescript
  it('7501 paints ! on all in-window FLY pairings for the crew (2438 shape)', () => {
    const a1 = {
      ...item(11, '2438', 15676),
      schStrDtUtc: '2026-08-11T15:15:00.000Z',
      schEndDtUtc: '2026-08-11T19:00:00.000Z',
    }
    const b1 = {
      ...item(13, '2438', 15806),
      schStrDtUtc: '2026-08-13T15:15:00.000Z',
      schEndDtUtc: '2026-08-13T19:00:00.000Z',
    }
    const itemsByCrew = new Map<string, RosterItem[]>([['2438', [a1, b1]]])
    const itemsByPairingId = new Map<number, RosterItem[]>([
      [15676, [a1]],
      [15806, [b1]],
    ])
    const displayViolations = new Map<number, DisplayViolation[]>([
      [15806, [{
        source: 'persisted',
        crewId: '2438',
        pairingId: 15806,
        ruleCode: '7501',
        ruleInstance: '001',
        ruleName: '7501',
        passed: false,
        severity: 1,
        actualValue: 0,
        limitValue: 1,
        unit: 'RH',
        message: 'Single day free from duty (0) must be at least 1 in 168 RH.',
        startDt: '2026-08-09T06:31:00.000Z',
        endDt: '2026-08-16T06:31:00.000Z',
      }]],
    ])

    const taskMap = buildLiveViolationMapForTest(new Map(), displayViolations, itemsByPairingId, itemsByCrew)
    expect(taskMap.get(11)).toBe(1)
    expect(taskMap.get(13)).toBe(1)
  })

  it('7501 Scenario map paints all in-window FLY pairings for the crew', () => {
    const a1 = {
      ...item(11, '2438', 15676),
      schStrDtUtc: '2026-08-11T15:15:00.000Z',
      schEndDtUtc: '2026-08-11T19:00:00.000Z',
    }
    const b1 = {
      ...item(13, '2438', 15806),
      schStrDtUtc: '2026-08-13T15:15:00.000Z',
      schEndDtUtc: '2026-08-13T19:00:00.000Z',
    }
    const itemsByCrew = new Map<string, RosterItem[]>([['2438', [a1, b1]]])
    const itemsByPairingId = new Map<number, RosterItem[]>([
      [15676, [a1]],
      [15806, [b1]],
    ])
    const violations = new Map<string, RuleViolation[]>([
      ['pairing:15806', [{
        crewId: '2438',
        anchorPairingId: 15806,
        targetType: 'pairing',
        targetId: 15806,
        source: 'roster',
        ruleCode: '7501',
        ruleName: '7501/001',
        severity: 1,
        canOverride: false,
        message: 'Single day free from duty (0) must be at least 1 in 168 RH.',
        startDt: '2026-08-09T06:31:00.000Z',
        endDt: '2026-08-16T06:31:00.000Z',
      } as RuleViolation]],
    ])

    const taskMap = buildScenarioViolationMapForTest(violations, itemsByCrew, itemsByPairingId)
    expect(taskMap.get(11)).toBe(1)
    expect(taskMap.get(13)).toBe(1)
  })
```

Note: if `RuleViolation` has no `startDt`/`endDt`, use `windowStartDt`/`windowEndDt` instead (match existing 8002 fixtures) — both are accepted by `resolveViolationPaintWindow`. Prefer:

```typescript
windowStartDt: '2026-08-09T06:31:00.000Z',
windowEndDt: '2026-08-16T06:31:00.000Z',
```

for Scenario if `startDt` is not on the type; for Live `DisplayViolation` use `startDt`/`endDt` as in the 923 test.

Also assert existing test `7501 Sep window does not paint ! on Aug...` still passes after the change.

- [ ] **Step 2: Run tests — expect FAIL on new cases**

```bash
cd gantt && npx vitest run src/components/gantt/source/__tests__/violation-window-severity.test.ts --reporter=list
```

Expected: new 2438-shaped cases FAIL (`taskMap.get(11)` undefined); 923 case still PASS.

- [ ] **Step 3: Wire Live `buildLiveViolationMap`**

Import `crewFlyTasksOverlappingWindow` and `resolveViolationPaintWindow`.

In the `displayViolations` loop (crewId branch), replace the per-anchor filter with:

```typescript
if (v.crewId) {
  if (v.ruleCode === '7501' && resolveViolationPaintWindow(v)) {
    for (const task of crewFlyTasksOverlappingWindow(itemsByCrew.get(v.crewId) ?? [], v)) {
      bump(task.id, v.severity)
    }
  } else {
    const crewPairingTasks = (itemsByCrew.get(v.crewId) ?? []).filter((task) => task.pairingId === pairingId)
    for (const task of crewPairingTasks) {
      if (!pairingTasksOverlapViolationWindow([task], v)) continue
      bump(task.id, v.severity)
    }
  }
} else {
  // unchanged: itemsByPairingId.get(pairingId) + overlap filter
}
```

Apply the same 7501 branch in the `ruleViolations` path when `v.targetType === 'pairing'` **and** a crew id is available on the violation object; if Live rule-check rows lack `crewId`, keep anchor-only for that path (persisted display path is the primary Live surface).

- [ ] **Step 4: Wire Scenario `buildViolationMap`**

Inside `targetType === 'pairing'`, for each `v`:

```typescript
if (v.ruleCode === '7501' && v.crewId && resolveViolationPaintWindow(v)) {
  for (const it of crewFlyTasksOverlappingWindow(itemsByCrew.get(v.crewId) ?? [], v)) {
    bump(it.id, v.severity)
  }
  continue
}
// existing per-pairingId + overlap logic
```

Ensure `resolveViolationPaintWindow` sees `windowStartDt`/`windowEndDt` and/or `startDt`/`endDt` on `RuleViolation` — if Scenario only has window_* fields, that is enough.

- [ ] **Step 5: Run tests — expect PASS**

```bash
cd gantt && npx vitest run src/components/gantt/source/__tests__/violation-window-severity.test.ts --reporter=list
```

Expected: all PASS (including 923 + new 2438 Live/Scenario).

- [ ] **Step 6: Commit**

```bash
git add gantt/src/components/gantt/source/live-gantt-source.ts \
  gantt/src/components/gantt/source/scenario-gantt-source.ts \
  gantt/src/components/gantt/source/__tests__/violation-window-severity.test.ts
git commit -m "feat(gantt): paint 7501 pucks on all in-window FLY pairings"
```

---

### Task 3: Puck tooltip includes non-anchor 7501

**Files:**
- Modify: `gantt/src/components/gantt/violation-tooltip.tsx` (`collectViolationTooltipEntries` puck mode)
- Test: `gantt/src/components/gantt/__tests__/violation-tooltip.test.ts`

**Interfaces:**
- Consumes: `crewFlyTasksOverlappingWindow`, `resolveViolationPaintWindow`, `isFlyPairing`, `pairingTasksOverlapViolationWindow`
- Produces: unchanged `ViolationTooltipEntry[]`

- [ ] **Step 1: Write the failing tooltip test**

```typescript
  it('shows 7501 on non-anchor FLY puck hover when task overlaps the window (2438 shape)', () => {
    const a1 = {
      ...rosterItem(11, '2438', 15676),
      schStrDtUtc: '2026-08-11T15:15:00.000Z',
      schEndDtUtc: '2026-08-11T19:00:00.000Z',
      assignmentGroup: 'FLY',
    }
    const b1 = {
      ...rosterItem(13, '2438', 15806),
      schStrDtUtc: '2026-08-13T15:15:00.000Z',
      schEndDtUtc: '2026-08-13T19:00:00.000Z',
      assignmentGroup: 'FLY',
    }
    const displayViolations = new Map<number, DisplayViolation[]>([
      [15806, [{
        source: 'persisted',
        crewId: '2438',
        pairingId: 15806,
        ruleCode: '7501',
        ruleName: '7501',
        ruleInstance: '001',
        passed: false,
        severity: 1,
        actualValue: 0,
        limitValue: 1,
        unit: 'RH',
        message: 'Single day free from duty (0) must be at least 1 in 168 RH.',
        startDt: '2026-08-09T06:31:00.000Z',
        endDt: '2026-08-16T06:31:00.000Z',
      }]],
    ])

    const puckEntries = collectViolationTooltipEntriesForTest({
      hoveredTaskId: 11,
      hoveredCrewId: null,
      violations: new Map(),
      displayViolations,
      items: [a1, b1],
    })
    expect(puckEntries.map((e) => e.ruleCode)).toEqual(['7501'])
  })
```

Keep existing `omits 7501 from Aug puck hover when violation window is Sep` green.

- [ ] **Step 2: Run test — expect FAIL**

```bash
cd gantt && npx vitest run src/components/gantt/__tests__/violation-tooltip.test.ts --reporter=list
```

Expected: new test FAIL (empty ruleCodes on hover of 15676).

- [ ] **Step 3: Implement puck-mode scan**

After the existing `displayViolations.get(task.pairingId)` block in puck mode, add a 7501 cross-key pass:

```typescript
// 7501: also surface rows keyed under other pairings when this FLY task overlaps the window.
for (const [, vs] of displayViolations) {
  for (const v of vs) {
    if (v.passed || v.ruleCode !== '7501') continue
    if (v.crewId && v.crewId !== String(task.crewId)) continue
    if (!resolveViolationPaintWindow(v)) continue
    const crewTasks = items.filter((i) => String(i.crewId) === String(task.crewId))
    const paintable = crewFlyTasksOverlappingWindow(crewTasks, v)
    if (!paintable.some((t) => t.id === task.id)) continue
    addEntry(v.ruleCode, v.ruleName, v.severity, v.message, v.ruleInstance, { skipCrewBellOnly: true })
  }
}
```

Mirror for `scenarioViolations` if Scenario puck hover uses pairing keys the same way (scan all keys for `ruleCode === '7501'` + crew + overlap). Dedup via existing `seen` set.

- [ ] **Step 4: Run tests — expect PASS**

```bash
cd gantt && npx vitest run src/components/gantt/__tests__/violation-tooltip.test.ts src/utils/__tests__/violation-puck-window.test.ts src/components/gantt/source/__tests__/violation-window-severity.test.ts --reporter=list
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add gantt/src/components/gantt/violation-tooltip.tsx \
  gantt/src/components/gantt/__tests__/violation-tooltip.test.ts
git commit -m "feat(gantt): show 7501 tooltip on non-anchor in-window FLY pucks"
```

---

### Task 4 (optional): Playwright smoke on Live gantt

**Files:**
- Create: `e2e/tests/gantt/rule-7501-puck-all-fly-in-window.spec.ts`

Only if local/SIT `f8_sit_live` still has crew `2438` with persisted Aug 7501 anchored on `15806` and duties on `15676`+`15806`. Skip with a clear message if fixture missing.

- [ ] **Step 1: Write spec that opens Aug Live, filters YYC/P, loads crew 2438, asserts violation map**

Use `readHook` / existing gantt hooks (same patterns as `rule-7501-edit-focus-assign.spec.ts`). Prefer asserting via `__ganttTest` violation map if exposed; otherwise assert puck severity through the hook used in `gantt-test-hook.ts` (`buildLiveViolationMapForTest` path already covered by Vitest — E2E is confirmation only).

Minimum assertion:

```typescript
// After roster loaded for 2438 in Aug 2026:
const severities = await page.evaluate(() => {
  // use whatever __ganttTest helper already exposes for task violation severity
})
expect(severities.some((s) => s.pairingId === 15676 && s.severity > 0)).toBe(true)
expect(severities.some((s) => s.pairingId === 15806 && s.severity > 0)).toBe(true)
```

If no stable hook exists without new test surface, **skip Task 4** and rely on Vitest — do not invent a fragile canvas pixel check.

- [ ] **Step 2: Run**

```bash
cd e2e && npx playwright test tests/gantt/rule-7501-puck-all-fly-in-window.spec.ts --reporter=list
```

- [ ] **Step 3: Commit if added**

```bash
git add e2e/tests/gantt/rule-7501-puck-all-fly-in-window.spec.ts
git commit -m "test(e2e): assert 7501 puck on all in-window FLY pairings for 2438"
```

---

## Spec coverage self-check

| Spec requirement | Task |
|------------------|------|
| 7501-only display expansion | 2, 3 |
| All FLY pairings overlapping window | 1, 2 |
| Same tooltip message on non-anchor | 3 |
| Live + Scenario | 2 |
| No engine/DB/bell change | Global + no tasks touch those |
| Keep 923 window filter | 1 + existing tests in 2/3 |
| 718 single long pairing still paints all days | Covered by helper (one FLY pairing, all overlapping tasks) |
| Optional E2E | 4 |

## Placeholder / type consistency

- Helpers named `isFlyPairing` / `crewFlyTasksOverlappingWindow` consistently across tasks.
- Live uses `DisplayViolation.startDt/endDt`; Scenario prefers `windowStartDt/windowEndDt` or fields already on `RuleViolation` that `resolveViolationPaintWindow` accepts — extend `ViolationTimeWindow` usage only, do not rename persisted columns.
