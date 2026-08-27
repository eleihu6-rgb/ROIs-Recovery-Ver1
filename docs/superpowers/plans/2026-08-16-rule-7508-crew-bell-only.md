# Rule 7508 Crew-Bell-Only Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make rule 7508 light the crew-row bell and Alert Center on Live and Scenario Gantt, without painting puck `!` badges or appearing in puck-hover tooltips.

**Architecture:** Reuse the existing `CREW_BELL_ONLY_RULES` allowlist. Live/Scenario violation maps and the shared violation tooltip already skip that set for puck paint/hover while keeping crew severity. Implementation is one set membership change plus regression tests mirroring 7505.

**Tech Stack:** TypeScript, Vitest (`gantt`), React Gantt sources already wired to `isCrewBellOnlyRule`.

## Global Constraints

- Live + Scenario both (same set).
- Frontend display only — no engine / persistence / Alert Center schema changes.
- Do not hard-code `7508` outside `crew-bell-only-rules.ts`.
- Follow §Minimal-First / §Surgical; do not refactor unrelated violation code.
- §No-Auto-Commit unless the user asks; plan steps that say “Commit” wait for explicit user request.

## File map

| File | Responsibility |
|------|----------------|
| `gantt/src/components/gantt/crew-bell-only-rules.ts` | Single allowlist (`7505`, `7507`, then `7508`). |
| `gantt/src/components/gantt/source/__tests__/violation-window-severity.test.ts` | Live/Scenario puck vs crew severity maps. |
| `gantt/src/components/gantt/__tests__/violation-tooltip.test.ts` | Puck hover omit / crew hover keep. |

No production call-site edits beyond the allowlist (maps/tooltip already filter via `isCrewBellOnlyRule`).

---

### Task 1: Failing tests for 7508 crew-bell-only

**Files:**
- Modify: `gantt/src/components/gantt/source/__tests__/violation-window-severity.test.ts`
- Modify: `gantt/src/components/gantt/__tests__/violation-tooltip.test.ts`
- Test: same files

**Interfaces:**
- Consumes: `buildLiveViolationMapForTest`, `buildLiveCrewViolationSeverityMapForTest`, `buildScenarioViolationMapForTest`, `buildScenarioCrewViolationSeverityMapForTest`, `collectViolationTooltipEntriesForTest` (already exported for tests)
- Produces: failing assertions that 7508 is crew-bell-only

- [ ] **Step 1: Add Live severity test (copy 7505 shape)**

In `violation-window-severity.test.ts`, after the existing `7505 lights crew bell...` test, add:

```typescript
  it('7508 lights crew bell but does not create a puck badge when anchor pairing is visible', () => {
    const visible = item(8, '2380', 71302)
    const itemsByCrew = new Map<string, RosterItem[]>([['2380', [visible]]])
    const itemsByPairingId = new Map<number, RosterItem[]>([[71302, [visible]]])
    const displayViolations = new Map<number, DisplayViolation[]>([
      [71302, [{
        source: 'persisted',
        crewId: '2380',
        pairingId: 71302,
        ruleCode: '7508',
        ruleInstance: '001',
        ruleName: '7508',
        passed: false,
        severity: 1,
        actualValue: 10,
        limitValue: 12,
        unit: 'RH',
        message: 'Rest between duties is below the minimum.',
      }]],
    ])

    const taskMap = buildLiveViolationMapForTest(new Map(), displayViolations, itemsByPairingId, itemsByCrew)
    const crewMap = buildLiveCrewViolationSeverityMapForTest(displayViolations)

    expect(taskMap.get(8) ?? 0).toBe(0)
    expect(crewMap.get('2380')).toBe(1)
  })
```

- [ ] **Step 2: Add Scenario severity test**

Near the existing Scenario 7505 test in the same file, add:

```typescript
  it('Scenario 7508 lights crew severity without a puck badge; co-located 8002 still paints', () => {
    const visible = item(9, 'C0001', 9001)
    const itemsByCrew = new Map<string, RosterItem[]>([['C0001', [visible]]])
    const itemsByPairingId = new Map<number, RosterItem[]>([[9001, [visible]]])

    const only7508 = new Map<string, RuleViolation[]>([
      ['C0001', [{
        id: 1,
        crewId: 'C0001',
        pairingId: 9001,
        ruleCode: '7508',
        ruleName: '7508/001',
        severity: 1,
        message: 'Rest between duties is below the minimum.',
        targetType: 'pairing',
      } as RuleViolation]],
    ])
    const with8002 = new Map<string, RuleViolation[]>([
      ['C0001', [
        {
          id: 1,
          crewId: 'C0001',
          pairingId: 9001,
          ruleCode: '7508',
          ruleName: '7508/001',
          severity: 1,
          message: 'Rest between duties is below the minimum.',
          targetType: 'pairing',
        } as RuleViolation,
        {
          id: 2,
          crewId: 'C0001',
          pairingId: 9001,
          ruleCode: '8002',
          ruleName: '8002/001',
          severity: 2,
          message: 'Cumulative block exceeds limit.',
          targetType: 'pairing',
        } as RuleViolation,
      ]],
    ])

    expect(buildScenarioViolationMapForTest(only7508, itemsByCrew, itemsByPairingId).size).toBe(0)
    expect(buildScenarioCrewViolationSeverityMapForTest(only7508).get('C0001')).toBe(1)
    expect(buildScenarioViolationMapForTest(with8002, itemsByCrew, itemsByPairingId).get(9)).toBe(2)
    expect(buildScenarioCrewViolationSeverityMapForTest(with8002).get('C0001')).toBe(2)
  })
```

Adjust cast/`RuleViolation` fields to match neighboring Scenario 7505 test in the same file (copy that fixture’s exact shape; only change `ruleCode` to `7508`).

- [ ] **Step 3: Add tooltip test**

In `violation-tooltip.test.ts`, after the 7505 omit test, add:

```typescript
  it('omits crew-bell-only 7508 from puck hover but keeps it on crew-header hover', () => {
    const displayViolations = new Map<number, DisplayViolation[]>([
      [71302, [
        violation(71302, '7508', 'Rest between duties is below the minimum.'),
        violation(71302, '8002', 'Cumulative block exceeds limit.'),
      ]],
    ])
    const items = [rosterItem(8, '2380', 71302)]

    const puckEntries = collectViolationTooltipEntriesForTest({
      hoveredTaskId: 8,
      hoveredCrewId: null,
      violations: new Map(),
      displayViolations,
      items,
    })
    expect(puckEntries.map((e) => e.ruleCode)).toEqual(['8002'])

    const crewEntries = collectViolationTooltipEntriesForTest({
      hoveredTaskId: null,
      hoveredCrewId: '2380',
      violations: new Map(),
      displayViolations,
      items,
    })
    expect(crewEntries.map((e) => e.ruleCode)).toEqual(['8002', '7508'])
  })
```

- [ ] **Step 4: Run tests — expect FAIL**

```bash
cd gantt && npx vitest run \
  src/components/gantt/source/__tests__/violation-window-severity.test.ts \
  src/components/gantt/__tests__/violation-tooltip.test.ts
```

Expected: new 7508 cases FAIL (puck still painted / tooltip still includes 7508) because `CREW_BELL_ONLY_RULES` does not yet contain `7508`.

- [ ] **Step 5: Commit only if user asked** (otherwise leave staged/unstaged for later)

---

### Task 2: Add 7508 to CREW_BELL_ONLY_RULES

**Files:**
- Modify: `gantt/src/components/gantt/crew-bell-only-rules.ts`
- Test: files from Task 1

**Interfaces:**
- Consumes: none new
- Produces: `isCrewBellOnlyRule('7508') === true`

- [ ] **Step 1: Update the allowlist**

```typescript
export const CREW_BELL_ONLY_RULES = new Set(['7505', '7507', '7508'])
```

Optionally extend the file comment to mention 7508 alongside 7505/7507.

- [ ] **Step 2: Re-run the same Vitest command**

Expected: all tests in those two files PASS (including new 7508 cases).

- [ ] **Step 3: Commit only if user asked**

Suggested message when requested:

```text
fix(gantt): treat 7508 as crew-bell-only

Hide 7508 from puck badges and puck hover; keep crew bell and Alert Center (Live + Scenario).
```

---

## Spec coverage self-check

| Spec requirement | Task |
|------------------|------|
| Add `7508` to `CREW_BELL_ONLY_RULES` | Task 2 |
| Live + Scenario | Task 1 Live + Scenario tests; shared set |
| No puck `!` / no puck hover | Task 1 severity + tooltip |
| Keep bell + Alert Center | Crew severity maps unchanged path; Alert Center already uses persisted list not puck map |
| No backend change | No backend files in plan |
| Co-located puck rule still paints | Scenario test with 8002 |

## Placeholder / consistency check

- No TBD/TODO placeholders.
- Test helpers and rule codes match existing 7505 fixtures.
- Production change is only the shared Set membership.
