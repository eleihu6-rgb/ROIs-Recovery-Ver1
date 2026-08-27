# Filter Test Design Rules

> Applies to: all e2e tests under `e2e/tests/gantt/` that exercise the Filter dialog
> (Crew / Pairing / Flight tabs) and any regression catalog entries that test filtering.
> Enforcement level: same as §Playwright-Required / §No-Illusion (commit-gate quality).
> Complements `anti-illusion-rules.md` with filter-specific patterns.

---

## Rule 1 — Data-Existence Pre-Check (no phantom values)

**Problem:** A test that hardcodes `bases: ['BKK']` fails with 0 results (or passes vacuously)
when the loaded dataset has no BKK crew. "0 results" is not caught by `toBeGreaterThan(0)` —
it fails with a confusing error — but a test that only checks "no error occurred" passes
falsely. Both outcomes mislead the reader.

**This does NOT apply to AI-chat stub tests** (see Rule 6).

Use one of these three approaches before filtering by a specific value:

| Method | When to use |
|--------|-------------|
| **Data-driven discovery** — read first option from dropdown via `selectFirstAvailableOption()` | Rank, fleet, pairing fleet, flight fleet — values vary by dataset |
| **Confirmed constant** — hardcode values documented as verified in the demo dataset | YVR (pairing base), YYZ (flight dep) — stable across deployments |
| **Dynamic baseline read** — before filtering, call `pairingObjects()` / `flightObjects()` and extract a value from actually loaded data | When you need a value guaranteed to exist in a loaded item |

```ts
// ❌ Hardcoded value not verified to exist in dataset
await selectDropdownOption(page, 'filter-crew-base', 'BKK', 'crew')

// ✅ Data-driven: first option in the dropdown (whatever the dataset has)
const base = await selectFirstAvailableOption(page, 'filter-crew-base', 'crew')

// ✅ Confirmed constant (document the verification)
// YVR confirmed to exist in demo dataset: pairings 6054→1455 after filter
await selectDropdownOption(page, 'filter-pairing-base', 'YVR', 'pairing')
```

---

## Rule 2 — Per-Item Assertion (no illusion)

**Problem:** `expect(results.length).toBeGreaterThan(0)` only proves data loaded.
The filter might be broken — returning all records — and this assertion still passes.

After applying a filter, assert **every** result matches the filter criteria:

```ts
// ✅ Per-item (correct — from query-filter.spec.ts gold standard)
const pairings = await pairingObjects(page)
expect(pairings.length, 'filtered pairings present').toBeGreaterThan(0)
expect(pairings.every((p) => p.base === BASE), `every pairing.base === ${BASE}`).toBe(true)
expect([...new Set(pairings.map((p) => p.base))], 'only one base present').toEqual([BASE])

// ❌ Count-only (passes even if filter is broken)
expect(pairings.length).toBeGreaterThan(0)
```

**Exception — when the hook does not expose the filtered field** (e.g., crew rank is not
in `rosterPanel()` items): use the filter store as primary assertion + chip as UI evidence:

```ts
// Acceptable fallback when per-item field unavailable
await expect.poll(() =>
  page.evaluate(() => window.__ganttTest!.activeCrewFilter())
).toMatchObject({ ranks: [rank] })
// Plus chip visible + count > 0 as supporting evidence
```

---

## Rule 3 — Coverage Matrix (all 3 tabs × all dimensions)

At least one test must cover each row:

| Tab | Dimension | Test file | Primary assertion |
|-----|-----------|-----------|-------------------|
| Crew | base | `filter-coverage.spec.ts` | `crewBases()` — every crew has the base |
| Crew | rank | `filter-coverage.spec.ts` | store `ranks` + chip + count > 0 |
| Crew | fleet | `filter-coverage.spec.ts` | store `fleets` + chip + count > 0 |
| Crew | division (P/C) | `filter-coverage.spec.ts` | store `divisions` + chip + clear restores |
| Pairing | base | `query-filter.spec.ts` | `pairingObjects().every(p => p.base === v)` |
| Pairing | fleet | `filter-coverage.spec.ts` | store + count ≤ unfiltered |
| Pairing | origin arpt | `filter-coverage.spec.ts` | data-driven from loaded pairings |
| Pairing | isFull=full | `query-filter.spec.ts` | `every(p => p.isFull === true)` |
| Pairing | isFull=partial | `filter-coverage.spec.ts` | per-item if data exists; else 0 count + clear restore |
| Pairing | isFull=all | implied by multi-step-workflow reset | pairings restore to baseline |
| Flight | depArp | `query-filter.spec.ts` | `flightObjects().every(f => f.depArp === v)` |
| Flight | arrArp | `filter-coverage.spec.ts` | data-driven from `flightObjects()` if field exposed |
| Flight | fltNum | `filter-coverage.spec.ts` | data-driven from loaded flights |
| Flight | fleet | `filter-coverage.spec.ts` | store + count ≤ unfiltered |
| Flight | status=full | `filter-coverage.spec.ts` | chip + count per dataset |
| Flight | status=partial | `filter-coverage.spec.ts` | chip + count per dataset |
| Flight | status=open | `filter-coverage.spec.ts` | chip + count per dataset |

---

## Rule 4 — Clear/Restore Validation

After Reset + Apply, assert the session is fully clean:

1. Filter chips count returns to 0 (no stale chips on pane strip)
2. `activeCrewFilter()` returns null (crew filter completely cleared)
3. Loaded object count ≥ pre-clear count (narrowed → widened)
4. Object set equals the pre-filter baseline (not just "some data")

```ts
// Gold standard: full clear + restore (from multi-step-workflow.spec.ts)
const baseline = await pairingObjects(page)
// ... apply filter ...
await openFilter(page, 'pairing')
await page.getByTestId('filter-reset').click()
await applyFilter(page)             // applyFilter calls waitGanttReady internally
const restored = await pairingObjects(page)
expect([...new Set(restored.map(p => p.base))].sort())
  .toEqual([...new Set(baseline.map(p => p.base))].sort())
```

---

## Rule 5 — Multi-Step Lifecycle

Filter tests covering a "real" filter path must exercise the full lifecycle:

1. **Baseline** — note unfiltered count and data characteristics
2. **Apply** — verify narrowed results match criteria (per-item where possible)
3. **Clear** — Reset + Apply; verify count and data set restored
4. **Re-apply** — verify filter works again (no session state corruption)

Tests that only cover steps 1–2 are acceptable for exploratory coverage of new dimensions
not yet covered by the multi-step pattern. But the multi-step pattern is preferred.

---

## Rule 6 — AI Chat Filter Tests Are Store-Dispatch Tests (not data tests)

`ai-chat.spec.ts` tests that use network stubs (e.g., `filter_crew bases: ['BKK']`) are
**explicitly testing the dispatch pipeline**: AI response → `filter_crew` action →
Zustand store mutation. These tests:

- **May hardcode any value** (BKK, YEG) because the stub injects it — the DB is never queried
- **Must assert store state** (`window.__ganttTest.filters()` or `activeCrewFilter()`) and the confirmation chip
- **Must NOT assert that real crew data matching that filter is visible** (stub does not load data)
- Are correctly labeled `@smoke` because they smoke-test the AI → store pathway

If a new AI chat test needs to verify REAL filtered data, it must use a live (un-stubbed) AI
call, or use a stub that injects a value confirmed to exist in the demo dataset.

---

## Rule 7 — Data Gaps Are Not Test Failures; Document Them

If the demo dataset lacks data for a dimension (e.g., "all pairings are fully crewed" →
isFull=partial returns 0), write the test to **explicitly assert the 0-result behavior**
AND verify that clearing the filter restores data. Document the gap in a comment.

```ts
// Demo dataset note: all pairings are fully crewed (isFull=true).
// The partial filter correctly returns 0. This test proves the filter mechanism
// works (applies and clears correctly) even when no partial data exists.
const filtered = await pairingObjects(page)
if (hasPartialData) {
  expect(filtered.length).toBeGreaterThan(0)
  expect(filtered.every(p => p.isFull === false)).toBe(true)
} else {
  expect(filtered.length, 'no partial pairings in dataset — filter correctly returns 0').toBe(0)
}
// Clear restores full pairing set regardless.
await openFilter(page, 'pairing')
await page.getByTestId('filter-reset').click()
await applyFilter(page)
expect((await pairingObjects(page)).length).toBeGreaterThan(0)
```

---

## Rule 8 — isFull Filter Is Client-Side (per-item assert is unreliable)

**Finding (2026-06-05):** The gantt's `isFull=partial` and `isFull=full` filter options operate
CLIENT-SIDE — the display filters already-loaded pairings without making a new server request.
The server DB stores `isFull=true` for all pairings; the 3 "partial" values the client shows
are computed from live crew assignment state.

**Consequence:** `pairingObjects()` always returns the server-fetched set (unchanged by isFull filter).
`every(p => p.isFull === false)` after a partial filter will always be false.

**Correct test pattern for isFull filters:**
```ts
// ✅ Test via filter store (synchronous, reliable)
await expect.poll(() =>
  page.evaluate(() => (window.__ganttTest!.filters() as any).applied?.pairing?.isFull)
).toBe(false)  // false = partial selected

// ✅ Test via pane chip (UI proof)
await expect(
  page.locator('[data-testid="pane-filter-chip"]').filter({ hasText: /partial/i }).first()
).toBeVisible()

// ❌ Don't test via pairingObjects() per-item — server store is unaffected by isFull filter
// (pairingObjects() will still return the full pre-filter set)
```

For `isFull=full`, the existing `query-filter.spec.ts` test passes because ALL YVR pairings
happen to be fully crewed — the assertion is accidentally correct, not because isFull filter
made a server request. Do not rely on that pattern as a model for isFull filter tests.

---

## Quick-Reference: Known Demo Dataset Values

| Value | Type | Confirmed status |
|-------|------|-----------------|
| `YVR` | Pairing base | ✅ Verified (query-filter.spec.ts: 6054→1455 pairings) |
| `YEG` | Pairing base | ✅ Verified (pane-filter-button.spec.ts: pairings load) |
| `YYZ` | Flight dep airport | ✅ Verified (query-filter.spec.ts: all hits) |
| `BKK` | Crew base (stub only) | ⚠️ Only used in AI-chat stub tests; no real BKK crew confirmed |
| Partial pairings | isFull=false | ⚠️ Demo data may have all isFull=true; verify before asserting count > 0 |

Add confirmed values here as new dataset verification probes are run.
