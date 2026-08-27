# Draft Preview Spacing Related Neighbors Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand draft-preview related FLY pairing ids with chronological previous/next FLY neighbors so spacing rules 7504/8056 (earlier-pairing anchors) still surface when the planner edits the later pairing.

**Architecture:** Pure helper `expandRelatedWithNeighborFlyPairings` over `afterItems`; `checkLiveDraftLegality` uses the expanded set only inside `isRelated` for rule codes `7504` and `8056`. Seed related set and `focusPairingIds` / pairing-mate expansion stay unchanged.

**Tech Stack:** TypeScript, Vitest (gantt).

## Global Constraints

- Scope: draft preview filter only (`checkLiveDraftLegality`). No Rust/bin/TSV changes.
- Spacing codes for expanded membership: **`7504`**, **`8056`** only.
- Neighbor definition: same crew, `assignmentGroup === 'FLY'`, order by earliest `schStrDtUtc`, add immediate prev/next pairing of each seed-related FLY pairing.
- 7505/7507 allow-list unchanged.
- Unrelated historical violations must stay filtered out.
- UI strings remain English.
- §Minimal-First / §Surgical: no speculative rule-code framework beyond a small `Set`/`includes` list.

## File map

| File | Responsibility |
|------|----------------|
| `gantt/src/stores/roster-store.ts` | Helper + wire into `isRelated` |
| `gantt/src/stores/__tests__/roster-store-draft-legality.test.ts` | Helper unit tests + 7504/8056 dialog regressions |

---

### Task 1: Helper `expandRelatedWithNeighborFlyPairings` (TDD)

**Files:**
- Modify: `gantt/src/stores/roster-store.ts`
- Test: `gantt/src/stores/__tests__/roster-store-draft-legality.test.ts`

**Interfaces:**
- Consumes: `RosterItem` (`crewId`, `pairingId`, `assignmentGroup`, `schStrDtUtc`)
- Produces:
  ```typescript
  export function expandRelatedWithNeighborFlyPairings(
    relatedPairingIds: Iterable<number>,
    afterItems: RosterItem[],
  ): Set<number>
  ```

- [ ] **Step 1: Write the failing tests**

Append to `gantt/src/stores/__tests__/roster-store-draft-legality.test.ts` (import the new export):

```typescript
import {
  checkLiveDraftLegality,
  expandAffectedWithPairingMates,
  expandRelatedWithNeighborFlyPairings,
} from '@/stores/roster-store'

describe('expandRelatedWithNeighborFlyPairings', () => {
  const fly = (
    crewId: string,
    pairingId: number,
    start: string,
    end: string,
  ): RosterItem =>
    rosterItem({
      id: pairingId,
      crewId,
      pairingId,
      assignmentGroup: 'FLY',
      schStrDtUtc: start,
      schEndDtUtc: end,
    })

  it('adds previous and next FLY pairings for the same crew (15152/15279 shape)', () => {
    const items = [
      fly('1318', 15152, '2026-08-03T12:45:00.000Z', '2026-08-03T18:05:00.000Z'),
      fly('1318', 15279, '2026-08-05T12:45:00.000Z', '2026-08-05T18:05:00.000Z'),
      fly('1318', 16000, '2026-08-10T12:00:00.000Z', '2026-08-10T18:00:00.000Z'),
    ]
    const expanded = expandRelatedWithNeighborFlyPairings([15279], items)
    expect([...expanded].sort((a, b) => a - b)).toEqual([15152, 15279, 16000])
  })

  it('does not add non-FLY pairings as neighbors', () => {
    const items = [
      rosterItem({
        id: 1,
        crewId: '1318',
        pairingId: 100,
        assignmentGroup: 'DO',
        schStrDtUtc: '2026-08-01T00:00:00.000Z',
        schEndDtUtc: '2026-08-02T00:00:00.000Z',
      }),
      fly('1318', 15279, '2026-08-05T12:45:00.000Z', '2026-08-05T18:05:00.000Z'),
    ]
    const expanded = expandRelatedWithNeighborFlyPairings([15279], items)
    expect([...expanded]).toEqual([15279])
  })

  it('keeps seed ids and ignores other crews', () => {
    const items = [
      fly('9999', 15152, '2026-08-03T12:45:00.000Z', '2026-08-03T18:05:00.000Z'),
      fly('1318', 15279, '2026-08-05T12:45:00.000Z', '2026-08-05T18:05:00.000Z'),
    ]
    const expanded = expandRelatedWithNeighborFlyPairings([15279], items)
    expect([...expanded]).toEqual([15279])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd gantt && npx vitest run src/stores/__tests__/roster-store-draft-legality.test.ts -t 'expandRelatedWithNeighborFlyPairings'
```

Expected: FAIL — export missing.

- [ ] **Step 3: Implement helper**

In `gantt/src/stores/roster-store.ts`, near `expandAffectedWithPairingMates`:

```typescript
/** Chronological prev/next FLY pairing ids for draft spacing relatedness (7504/8056). */
export const expandRelatedWithNeighborFlyPairings = (
  relatedPairingIds: Iterable<number>,
  afterItems: RosterItem[],
): Set<number> => {
  const seed = new Set(
    [...relatedPairingIds].filter((id) => Number.isFinite(id) && id > 0),
  )
  const out = new Set(seed)
  if (seed.size === 0) return out

  const crews = new Set<string>()
  for (const item of afterItems) {
    if (item.pairingId != null && seed.has(item.pairingId) && item.crewId) {
      crews.add(String(item.crewId))
    }
  }

  for (const crewId of crews) {
    const earliestByPairing = new Map<number, number>()
    for (const item of afterItems) {
      if (String(item.crewId) !== crewId) continue
      if (item.assignmentGroup !== 'FLY' || item.pairingId == null) continue
      const t = item.schStrDtUtc ? new Date(item.schStrDtUtc).getTime() : NaN
      if (!Number.isFinite(t)) continue
      const prev = earliestByPairing.get(item.pairingId)
      if (prev == null || t < prev) earliestByPairing.set(item.pairingId, t)
    }
    const ordered = [...earliestByPairing.entries()]
      .sort((a, b) => a[1] - b[1] || a[0] - b[0])
      .map(([id]) => id)
    for (let i = 0; i < ordered.length; i++) {
      if (!seed.has(ordered[i])) continue
      if (i > 0) out.add(ordered[i - 1])
      if (i + 1 < ordered.length) out.add(ordered[i + 1])
    }
  }
  return out
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd gantt && npx vitest run src/stores/__tests__/roster-store-draft-legality.test.ts -t 'expandRelatedWithNeighborFlyPairings'
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add gantt/src/stores/roster-store.ts \
  gantt/src/stores/__tests__/roster-store-draft-legality.test.ts
git commit -m "$(cat <<'EOF'
feat(gantt): expand draft-related FLY pairing neighbors

Pure helper for spacing preview relatedness (prev/next FLY on same crew).
EOF
)"
```

---

### Task 2: Wire 7504/8056 `isRelated` + dialog regressions

**Files:**
- Modify: `gantt/src/stores/roster-store.ts` (`checkLiveDraftLegality`)
- Modify: `gantt/src/stores/__tests__/roster-store-draft-legality.test.ts`

**Interfaces:**
- Consumes: `expandRelatedWithNeighborFlyPairings`, existing `afterItems` / `relatedPairingIds`
- Produces: `isRelated` for `7504`/`8056` uses expanded set; other rules unchanged

- [ ] **Step 1: Write the failing integration tests**

Append inside `describe('checkLiveDraftLegality')`:

```typescript
  it('shows new 7504 anchored on earlier pairing when related is later only (15152/15279)', async () => {
    const v7504 = previewViolation({
      ruleCode: '7504',
      pairingId: 15152,
      scopeKey: '7504-gap',
      startDt: '2026-08-03T18:05:00.000Z',
      endDt: '2026-08-05T12:45:00.000Z',
      message: 'Rest between consecutive WOCL flight duties (2026-08-03, 2026-08-05) is 42:40 less than 55 RH.',
      severity: 2,
    })
    mocks.checkDraft
      .mockResolvedValueOnce({ allowed: true, violations: [] })
      .mockResolvedValueOnce({ allowed: true, violations: [v7504] })

    const later = rosterItem({
      id: 2,
      crewId: '1318',
      pairingId: 15279,
      assignmentGroup: 'FLY',
      schStrDtUtc: '2026-08-05T12:45:00.000Z',
      schEndDtUtc: '2026-08-05T18:05:00.000Z',
    })
    const earlier = rosterItem({
      id: 1,
      crewId: '1318',
      pairingId: 15152,
      assignmentGroup: 'FLY',
      schStrDtUtc: '2026-08-03T12:45:00.000Z',
      schEndDtUtc: '2026-08-03T18:05:00.000Z',
    })

    mocks.showConfirmDialog.mockResolvedValueOnce(true)
    const allowed = await checkLiveDraftLegality(
      ['1318'],
      [earlier],
      [earlier, later],
      { relatedItems: [later], relatedPairingIds: [15279] },
    )

    expect(allowed).toBe(true)
    expect(mocks.toRuleViolations).toHaveBeenCalledWith([v7504])
    expect(mocks.showConfirmDialog).toHaveBeenCalledOnce()
  })

  it('shows new 8056 anchored on earlier pairing when related is later only', async () => {
    const v8056 = previewViolation({
      ruleCode: '8056',
      pairingId: 15152,
      scopeKey: '8056-gap',
      startDt: '2026-08-03T18:05:00.000Z',
      endDt: '2026-08-05T12:45:00.000Z',
      message: 'Rest between duties below required space.',
      severity: 2,
    })
    mocks.checkDraft
      .mockResolvedValueOnce({ allowed: true, violations: [] })
      .mockResolvedValueOnce({ allowed: true, violations: [v8056] })

    const later = rosterItem({
      id: 2,
      crewId: '1318',
      pairingId: 15279,
      assignmentGroup: 'FLY',
      schStrDtUtc: '2026-08-05T12:45:00.000Z',
      schEndDtUtc: '2026-08-05T18:05:00.000Z',
    })
    const earlier = rosterItem({
      id: 1,
      crewId: '1318',
      pairingId: 15152,
      assignmentGroup: 'FLY',
      schStrDtUtc: '2026-08-03T12:45:00.000Z',
      schEndDtUtc: '2026-08-03T18:05:00.000Z',
    })

    mocks.showConfirmDialog.mockResolvedValueOnce(true)
    await checkLiveDraftLegality(
      ['1318'],
      [earlier],
      [earlier, later],
      { relatedItems: [later], relatedPairingIds: [15279] },
    )

    expect(mocks.toRuleViolations).toHaveBeenCalledWith([v8056])
  })

  it('still hides unrelated historical spacing on a non-neighbor pairing', async () => {
    const historical = previewViolation({
      ruleCode: '7504',
      pairingId: 999,
      scopeKey: 'scope-999',
      startDt: '2026-07-20T12:00:00Z',
      endDt: '2026-07-20T14:00:00Z',
      message: 'Historical unrelated 7504',
    })
    mocks.checkDraft
      .mockResolvedValueOnce({ allowed: true, violations: [historical] })
      .mockResolvedValueOnce({ allowed: true, violations: [historical] })

    const later = rosterItem({
      id: 2,
      crewId: '1318',
      pairingId: 15279,
      assignmentGroup: 'FLY',
      schStrDtUtc: '2026-08-05T12:45:00.000Z',
      schEndDtUtc: '2026-08-05T18:05:00.000Z',
    })
    const earlier = rosterItem({
      id: 1,
      crewId: '1318',
      pairingId: 15152,
      assignmentGroup: 'FLY',
      schStrDtUtc: '2026-08-03T12:45:00.000Z',
      schEndDtUtc: '2026-08-03T18:05:00.000Z',
    })

    await checkLiveDraftLegality(
      ['1318'],
      [earlier, later],
      [earlier, later],
      { relatedItems: [later], relatedPairingIds: [15279] },
    )

    expect(mocks.showConfirmDialog).not.toHaveBeenCalled()
  })
```

Ensure `previewViolation` helper accepts `ruleCode` / `severity` overrides (extend if needed).

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd gantt && npx vitest run src/stores/__tests__/roster-store-draft-legality.test.ts -t '15152/15279|8056 anchored|non-neighbor'
```

Expected: FAIL — 7504/8056 filtered out (dialog not called / wrong args).

- [ ] **Step 3: Wire into `checkLiveDraftLegality`**

After `afterItems` is computed:

```typescript
const spacingRelatedPairingIds = expandRelatedWithNeighborFlyPairings(
  relatedPairingIds,
  afterItems,
)
const SPACING_RELATED_RULES = new Set(['7504', '8056'])
```

Update `isRelated`:

```typescript
const isRelated = (v: typeof afterResult.violations[number]): boolean => {
  if (v.ruleCode === '7505' || v.ruleCode === '7507') return true
  if (relatedPairingIds.size === 0 && relatedWindows.length === 0) return true
  const pairingSet = SPACING_RELATED_RULES.has(v.ruleCode)
    ? spacingRelatedPairingIds
    : relatedPairingIds
  if (v.pairingId != null && pairingSet.has(v.pairingId)) return true
  return overlapsRelatedWindow(v.startDt, v.endDt)
}
```

Do **not** pass expanded ids into `focusPairingIds` or `expandAffectedWithPairingMates` (keeps preview focus/mates scoped to the edit).

- [ ] **Step 4: Run full draft-legality test file**

```bash
cd gantt && npx vitest run src/stores/__tests__/roster-store-draft-legality.test.ts
```

Expected: all PASS (including prior cases).

- [ ] **Step 5: Commit**

```bash
git add gantt/src/stores/roster-store.ts \
  gantt/src/stores/__tests__/roster-store-draft-legality.test.ts
git commit -m "$(cat <<'EOF'
fix(gantt): surface spacing preview hits on earlier gap pairing

7504/8056 related checks use FLY neighbor-expanded pairing ids so
assigning the later duty still shows the draft confirm dialog.
EOF
)"
```

---

## Spec coverage checklist

| Spec requirement | Task |
|------------------|------|
| Neighbor expand helper | Task 1 |
| 7504/8056 use expanded set | Task 2 |
| focusPairingIds / mates unchanged | Task 2 (explicit) |
| 7505/7507 unchanged | Task 2 |
| Unrelated history still filtered | Task 2 |
| Anchor 15152/15279 dialog | Task 2 |

## Out of scope

- Inclusive `overlapsRelatedWindow` endpoint tweak  
- Backend dual pairing ids  
- Playwright (unit gate sufficient per spec unless SIT assign fixture is easy)
