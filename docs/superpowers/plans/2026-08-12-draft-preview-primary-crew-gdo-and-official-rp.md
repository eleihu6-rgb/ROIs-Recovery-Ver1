# Draft Preview Primary-Crew GDO + Official RP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Soft legality dialog only shows 7505/7507 for crews actually edited in this drop, and draft `preview-draft` never sends padded Gantt `dateRange` as `rpFrom`/`rpTo`.

**Architecture:** Keep mate expand on the preview request. Filter 7505/7507 into `showConfirmDialog` with `primaryCrewIds` (caller `affectedCrewIds` before expand). Resolve preview RP from selected `roster_period` strings, then scenario `strDtLoc`/`endDtLoc`, then `selectedRosterPeriodRange`; otherwise omit the fields.

**Tech Stack:** gantt React/Zustand, Vitest, Playwright. No live-server / engine changes.

**Spec:** `docs/superpowers/specs/2026-08-12-draft-preview-primary-crew-gdo-and-official-rp-design.md`

## Global Constraints

- Frontend only — do not change `live-server` preview-draft or `legality-recheck-core`.
- Do not shrink `previewCrewIds` / mate expand; 1001 and composition stay on the expanded set.
- Do not change session bells (`syncPeriodGdoSessionViolations`), Alert Center windows, or dialog copy.
- 7505/7507 remain overridable (Continue). Soft vs Hard policy unchanged.
- UI strings stay English.
- §Surgical: touch only the listed files. §Minimal-First: no extra abstractions.
- §No-Auto-Commit: do **not** `git commit` unless the user explicitly asks. Skip every Commit step.
- TDD: write the failing test first, run it, then implement.

## File map

| File | Role |
|------|------|
| `gantt/src/stores/roster-store.ts` | `checkLiveDraftLegality` relatedness for 7505/7507 |
| `gantt/src/stores/__tests__/roster-store-draft-legality.test.ts` | Dialog filter tests |
| `gantt/src/services/legality-preview-api.ts` | `currentGanttRpBounds` + `checkDraft` omit empty RP |
| `gantt/src/services/__tests__/legality-preview-api-rp.test.ts` | RP resolution tests |
| `e2e/tests/gantt/scenario-roster-edit.spec.ts` | Drag-assign UI: mate 7507 must not appear in confirm dialog |

---

### Task 1: Primary-crew filter for 7505/7507 in the soft dialog

**Files:**
- Modify: `gantt/src/stores/roster-store.ts` (`checkLiveDraftLegality`, `isRelated`)
- Test: `gantt/src/stores/__tests__/roster-store-draft-legality.test.ts`

**Interfaces:**
- Consumes: existing `checkLiveDraftLegality(affectedCrewIds, currentItems, simulatedItems, options?)`
- Produces: `primaryCrewIds = new Set(affectedCrewIds.map(String))` used only for 7505/7507 relatedness. `previewCrewIds` unchanged.

- [ ] **Step 1: Write the failing tests**

Add these cases next to the existing 7505 tests in `gantt/src/stores/__tests__/roster-store-draft-legality.test.ts`. Reuse `previewViolation`, `rosterItem`, `ruleViolation`, and `mocks`.

```typescript
  it('does not surface mate 7507 on the confirm dialog when assigning to a different crew', async () => {
    const mateGdo = previewViolation({
      crewId: '2807',
      pairingId: 138732,
      ruleCode: '7507',
      ruleInstance: '001',
      scopeKey: '1RP',
      startDt: '2026-09-01T04:00:00.000Z',
      endDt: '2026-10-01T03:59:59.000Z',
      message: 'The number of days off(9) must be at least 10 in 1 RP (2026-09-01, 2026-09-30).',
    })
    mocks.checkDraft
      .mockResolvedValueOnce({ allowed: false, violations: [mateGdo] })
      .mockResolvedValueOnce({ allowed: true, violations: [] })

    const allowed = await checkLiveDraftLegality(
      ['13645'],
      [rosterItem({ crewId: '2807', pairingId: 138734 })],
      [
        rosterItem({ crewId: '2807', pairingId: 138734 }),
        rosterItem({ id: 2, crewId: '13645', pairingId: 138734 }),
      ],
      {
        contextType: 'scenario',
        scenarioId: 740,
        relatedPairingIds: [138734],
        relatedItems: [rosterItem({ id: 2, crewId: '13645', pairingId: 138734 })],
      },
    )

    expect(allowed).toBe(true)
    expect(mocks.showConfirmDialog).not.toHaveBeenCalled()
    expect(mocks.checkDraft.mock.calls[0][0].affectedCrewIds.sort()).toEqual(['13645', '2807'])
  })

  it('still surfaces primary-crew 7507 when the anchor pairing is not the edited pairing', async () => {
    const primaryGdo = previewViolation({
      crewId: '13645',
      pairingId: 999,
      ruleCode: '7507',
      ruleInstance: '001',
      scopeKey: '1RP',
      startDt: '2026-09-01T04:00:00.000Z',
      endDt: '2026-10-01T03:59:59.000Z',
      message: 'The number of days off(9) must be at least 10 in 1 RP (2026-09-01, 2026-09-30).',
    })
    mocks.checkDraft
      .mockResolvedValueOnce({ allowed: true, violations: [primaryGdo] })
      .mockResolvedValueOnce({ allowed: true, violations: [] })

    const allowed = await checkLiveDraftLegality(
      ['13645'],
      [rosterItem({ crewId: '13645', pairingId: 100 })],
      [rosterItem({ crewId: '13645', pairingId: 138734 })],
      {
        relatedItems: [rosterItem({ crewId: '13645', pairingId: 138734 })],
        relatedPairingIds: [138734],
      },
    )

    expect(allowed).toBe(true)
    expect(mocks.toRuleViolations).toHaveBeenCalledWith([primaryGdo])
    expect(mocks.showConfirmDialog).toHaveBeenCalledWith([ruleViolation(primaryGdo)], false)
  })
```

Keep the existing tests:

- `always surfaces new 7505 Min-GDO findings even when anchor pairing differs` (crewId `911` is primary)
- `still surfaces 7505 when the crew already violated before the edit` (same)

- [ ] **Step 2: Run tests to verify the new ones fail**

Run:

```bash
cd gantt && npx vitest run src/stores/__tests__/roster-store-draft-legality.test.ts --reporter=verbose
```

Expected: `does not surface mate 7507...` **FAIL** because `showConfirmDialog` is called with the 2807 finding. Existing 7505 tests still pass.

- [ ] **Step 3: Implement the primary-crew filter**

In `gantt/src/stores/roster-store.ts` inside `checkLiveDraftLegality`, after `relatedPairingIds` / `focusPairingIds` are built and **before** `expandAffectedWithPairingMates`:

```typescript
    const primaryCrewIds = new Set(affectedCrewIds.map(String))
```

Leave `previewCrewIds` as the expanded set. Change only `isRelated`:

```typescript
    const isRelated = (v: typeof afterResult.violations[number]): boolean => {
      // Period Min-GDO anchors on an RP pairing, not necessarily the edited one.
      // Only warn for crews this edit actually moved/assigned/removed — not pairing mates.
      if (v.ruleCode === '7505' || v.ruleCode === '7507') {
        return primaryCrewIds.has(String(v.crewId))
      }
      if (relatedPairingIds.size === 0 && relatedWindows.length === 0) return true
      const pairingSet = spacingRelatedRules.has(v.ruleCode)
        ? spacingRelatedPairingIds
        : relatedPairingIds
      if (v.pairingId != null && pairingSet.has(v.pairingId)) return true
      return overlapsRelatedWindow(v.startDt, v.endDt)
    }
```

Do not change `relevantNewViolations`’s “always surface 7505/7507 even if present before” branch; it already goes through `isRelated`.

Do not change `syncPeriodGdoSessionViolations(afterResult.violations)`.

- [ ] **Step 4: Re-run tests**

```bash
cd gantt && npx vitest run src/stores/__tests__/roster-store-draft-legality.test.ts --reporter=verbose
```

Expected: all tests in that file **PASS**.

- [ ] **Step 5: Commit**

Skip unless the user asked to commit.

---

### Task 2: Official RP bounds for draft preview

**Files:**
- Modify: `gantt/src/services/legality-preview-api.ts` (`currentGanttRpBounds`, `checkDraft`)
- Test: `gantt/src/services/__tests__/legality-preview-api-rp.test.ts`

**Interfaces:**
- Consumes: `currentGanttRpBounds(contextId: GanttContextId)`
- Produces: `currentGanttRpBounds` returns `{ rpFrom: string; rpTo: string } | Record<string, never>`. `checkDraft` spreads that object; empty means omit `rpFrom`/`rpTo`.

- [ ] **Step 1: Write the failing tests**

In `gantt/src/services/__tests__/legality-preview-api-rp.test.ts`:

1. Change `falls back to scenario strDtLoc/endDtLoc when scenario has no RP ids selected` so `scenarioFilterState` uses a **padded** `dateRange` (Aug 25–Oct 7) and **null** `selectedRosterPeriodRange`. Expect POST `rpFrom: '2026-09-01'`, `rpTo: '2026-09-30'`.

```typescript
  it('falls back to scenario strDtLoc/endDtLoc when scenario has no RP ids selected', async () => {
    mocks.liveFilterState.mockReturnValue(augustFilter)
    mocks.scenarioFilterState.mockReturnValue({
      dateRange: {
        start: new Date('2026-08-25T00:00:00.000Z'),
        end: new Date('2026-10-07T23:59:59.000Z'),
      },
      selectedRosterPeriodIds: [],
      selectedRosterPeriodRange: null,
    })
    mocks.getScenarioData.mockReturnValue({
      strDtLoc: '2026-09-01T04:00:00.000Z',
      endDtLoc: '2026-09-30T04:00:00.000Z',
    })

    await legalityPreviewApi.checkDraft({
      contextType: 'scenario',
      scenarioId: 740,
      affectedCrewIds: ['13645'],
      afterItems: [{ id: 1, crewId: '13645' } as never],
    })

    expect(mocks.apiPost).toHaveBeenCalledWith(
      '/api/legality/preview-draft',
      expect.objectContaining({ rpFrom: '2026-09-01', rpTo: '2026-09-30' }),
      expect.any(Object),
    )
    const body = mocks.apiPost.mock.calls[0][1] as Record<string, unknown>
    expect(body.rpFrom).not.toBe('2026-08-25')
    expect(body.rpTo).not.toBe('2026-10-07')
  })
```

2. Add omit-when-unresolved (Live, no ids, no range — padded dateRange must not be sent):

```typescript
  it('omits rpFrom/rpTo when no official RP can be resolved (does not send padded dateRange)', async () => {
    mocks.liveFilterState.mockReturnValue({
      dateRange: {
        start: new Date('2026-08-25T00:00:00.000Z'),
        end: new Date('2026-10-07T23:59:59.000Z'),
      },
      selectedRosterPeriodIds: [],
      selectedRosterPeriodRange: null,
    })

    await legalityPreviewApi.checkDraft({
      contextType: 'live',
      affectedCrewIds: ['246'],
      afterItems: [{ id: 1, crewId: '246' } as never],
    })

    const body = mocks.apiPost.mock.calls[0][1] as Record<string, unknown>
    expect(body.rpFrom).toBeUndefined()
    expect(body.rpTo).toBeUndefined()
  })
```

Keep `falls back to biased ms→YMD when no RP ids are selected` — it still has `selectedRosterPeriodRange` for July and must keep posting `2026-07-01` / `2026-07-31`.

Keep Live selected-RP-ids and explicit `input.rpFrom`/`rpTo` tests.

- [ ] **Step 2: Run RP tests to verify new cases fail**

```bash
cd gantt && npx vitest run src/services/__tests__/legality-preview-api-rp.test.ts --reporter=verbose
```

Expected: omit test **FAIL** (body still has `rpFrom: '2026-08-25'`). Scenario padded-range test may already pass if `strDtLoc` is hit first; if `selectedRosterPeriodRange` was previously on `septemberFilter`, the rewritten test now forces the scenario-date path.

- [ ] **Step 3: Implement RP resolution**

Replace `currentGanttRpBounds` in `gantt/src/services/legality-preview-api.ts`:

```typescript
export const currentGanttRpBounds = (
  contextId: GanttContextId = 'live',
): { rpFrom: string; rpTo: string } | Record<string, never> => {
  const filter = getFilterStore(contextId).getState()
  const ids = filter.selectedRosterPeriodIds
  if (ids.length > 0) {
    const chosen = useRosterPeriodStore.getState().items.filter((rp) =>
      ids.includes(String(rp.id)),
    )
    if (chosen.length > 0) {
      const starts = chosen.map((rp) => rp.rpStart.slice(0, 10)).sort()
      const ends = chosen.map((rp) => rp.rpEnd.slice(0, 10)).sort()
      return { rpFrom: starts[0], rpTo: ends[ends.length - 1] }
    }
  }
  if (typeof contextId === 'number') {
    const data = getScenarioGanttStore(contextId).getState().data
    if (data?.strDtLoc && data?.endDtLoc) {
      return {
        rpFrom: data.strDtLoc.slice(0, 10),
        rpTo: data.endDtLoc.slice(0, 10),
      }
    }
  }
  if (filter.selectedRosterPeriodRange) {
    const bounds = resolveViolationViewBounds(filter.dateRange, filter.selectedRosterPeriodRange)
    return {
      rpFrom: ymdFromRpInstant(bounds.start.getTime(), 'start'),
      rpTo: ymdFromRpInstant(bounds.end.getTime(), 'end'),
    }
  }
  return {}
}
```

`checkDraft` already does `...(input.rpFrom && input.rpTo) ? { rpFrom, rpTo } : currentGanttRpBounds(rpContext)` and spreads into the POST body. Empty `{}` omits the fields. Do not add `rpFrom`/`rpTo` from `filter.dateRange`.

Stop importing `resolveViolationViewBounds` only if it becomes unused — it is still used in the `selectedRosterPeriodRange` branch.

- [ ] **Step 4: Re-run RP tests**

```bash
cd gantt && npx vitest run src/services/__tests__/legality-preview-api-rp.test.ts --reporter=verbose
```

Expected: all tests in that file **PASS**.

- [ ] **Step 5: Commit**

Skip unless the user asked to commit.

---

### Task 3: Playwright — drag-assign does not show mate 7507

**Files:**
- Modify: `e2e/tests/gantt/scenario-roster-edit.spec.ts`

**Interfaces:**
- Consumes: existing `wireMocks`, `openRoScenario`, `acquireEditLock`, `waitForPairingPuck`, `dragPairingToSecondCrew`, `readPending`
- Produces: new test `Scen-2016` that drives the real pairing→roster drag

- [ ] **Step 1: Write the failing Playwright test**

Add at the end of the `RO scenario roster edit` describe (after Scen-2015). `wireMocks` already stubs `preview-draft` with empty violations; this test **re-registers** the route afterward so the mate 7507 response wins (Playwright last-registered matching route).

```typescript
  test('Scen-2016 — mate 7507 from preview-draft does not open the assign confirm dialog', async ({ page }) => {
    const previewBodies: Array<Record<string, unknown>> = []
    await wireMocks(page)
    await page.route('**/api/legality/preview-draft', async (route) => {
      const body = route.request().postDataJSON() as Record<string, unknown>
      previewBodies.push(body)
      await route.fulfill(ok({
        allowed: false,
        violations: [
          {
            crewId: 'C0001',
            pairingId: 138732,
            dutySeq: null,
            ruleCode: '7507',
            ruleInstance: '001',
            scopeKey: '1RP',
            severity: 1,
            startDt: '2026-03-01T00:00:00.000Z',
            endDt: '2026-03-31T23:59:59.000Z',
            message: 'The number of days off(9) must be at least 10 in 1 RP (2026-03-01, 2026-03-31).',
          },
        ],
      }))
    })
    await openRoScenario(page)
    await acquireEditLock(page)

    const puck = await waitForPairingPuck(page)
    await dragPairingToSecondCrew(page, puck)

    await expect
      .poll(() => readPending(page), { timeout: 10_000, message: 'pairing drag never reached pendingChanges' })
      .toContainEqual({ op: 'add', crewId: 'C0002', pairingId: ASSIGN_PAIRING_ID, rosterActingRank: 'FO' })

    const dialog = page.getByTestId('rule-confirm-dialog')
    await expect(dialog).toHaveCount(0)
    expect(previewBodies.length).toBeGreaterThan(0)
    const posted = previewBodies[0]
    if (posted.rpFrom != null || posted.rpTo != null) {
      expect(posted.rpFrom).toBe('2026-03-01')
      expect(posted.rpTo).toBe('2026-03-31')
    }
  })
```

If `api.post` unwraps `{ code, data }` already in the app, fulfill with the inner `{ allowed, violations }` shape that `wireMocks` uses (`ok({ allowed: true, violations: [] })`). Match `wireMocks`’ `ok()` helper exactly so the client parses the same envelope.

Primary crew for this drag is `C0002`. The mocked 7507 is `C0001`. Before Task 1, the dialog opens and the add patch is rolled back — `readPending` fails or the dialog is visible. After Task 1, no dialog and the add stays.

- [ ] **Step 2: Run the test to confirm it fails on current main (or passes after Task 1)**

```bash
npx playwright test e2e/tests/gantt/scenario-roster-edit.spec.ts --grep "Scen-2016" --reporter=list
```

If Task 1 is already implemented in this working tree, expect **PASS**. If running this test in isolation before Task 1, expect **FAIL** (dialog visible and/or pending add reverted). Do not weaken assertions.

- [ ] **Step 3: Fix envelope / selectors only if the test is stale**

If fulfill envelope is wrong, copy `ok()` from this file. If `rule-confirm-dialog` never mounts on Scenario, that is a product bug — do not switch to `page.evaluate(showConfirmDialog)`.

- [ ] **Step 4: Re-run**

```bash
npx playwright test e2e/tests/gantt/scenario-roster-edit.spec.ts --grep "Scen-2016" --reporter=list
```

Expected: **PASS**. Paste the list reporter summary in the delivery message.

Also re-run Scen-2015 to prove the empty-preview path still assigns:

```bash
npx playwright test e2e/tests/gantt/scenario-roster-edit.spec.ts --grep "Scen-2015|Scen-2016" --reporter=list
```

- [ ] **Step 5: Commit**

Skip unless the user asked to commit.

---

## Spec coverage (self-review)

| Spec requirement | Task |
|------------------|------|
| 7505/7507 dialog only if `v.crewId ∈ primaryCrewIds` | Task 1 |
| Mate expand still on `checkDraft` | Task 1 (assert expanded `affectedCrewIds`) |
| Primary 7507 still dialogs when anchor pairing differs | Task 1 |
| Pre-existing primary 7505 still dialogs | existing tests, Task 1 must not break |
| Session bells unchanged | Task 1 explicit non-change |
| RP: selected `rpStart`/`rpEnd` | existing test + Task 2 |
| RP: scenario `strDtLoc`/`endDtLoc` over padded dateRange | Task 2 |
| RP: `selectedRosterPeriodRange` + `ymdFromRpInstant` | existing July fallback test |
| RP: omit when unresolved — never padded dateRange | Task 2 |
| Explicit `input.rpFrom`/`rpTo` win | existing test |
| Playwright drag-assign, dialog excludes mate 7507 | Task 3 |
| Backend / bells / copy / Hard-Soft policy | out of scope, no task |
