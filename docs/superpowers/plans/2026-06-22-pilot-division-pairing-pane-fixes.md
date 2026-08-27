# Pilot-Division Pairing Pane Fixes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A division-scoped scenario (e.g. `#540 YVR-FC-Ver1`, pilots) shows only its own division's pairings; the pairing pane defaults to an Open+Partial hard filter (unified across Live + Scenario); each pairing row shows its Base.

**Architecture:** Backend scopes pairings by division at all three sourcing sites (solver export + two display builders) via one shared crew-division filter helper. Frontend lands two shared-layer changes (default coverage + Base column) plus unifies Live's coverage filter to Scenario's hard-filter semantics.

**Tech Stack:** Fastify + Drizzle + Vitest (live-server); React 19 + Zustand + Playwright (gantt).

**Spec:** `docs/superpowers/specs/2026-06-22-pilot-division-pairing-pane-fixes-design.md`
**Reference:** `docs/modules/gantt/live-scenario-gantt-playbook.md` (skill `115-gantt-playbook`)

## Global Constraints

- **§Gantt-Unify:** shared changes land once and benefit both Live and Scenario; differences hide behind source capability, never a forked UI.
- **§No-Illusion:** every task pastes its PASS/FAIL test receipt before being marked done.
- **§Simulate-User:** gantt Playwright clicks the real UI (login → `/fpqe/gantt/` → search → open `#540`); never call the business API to fake a user action.
- **§Stale-Test:** if a touched spec asserts the old all-coverage default or the old pairing columns, rewrite it to the current behavior; don't weaken it.
- **Version:** bump in `gantt/src/version.ts` — `BACKEND_VERSION` 153→154, `FRONTEND_VERSION` 296→297. `RULE_VERSION` unchanged.
- **UI gate:** `npm run check:ui` (root) must report 0 hard violations.
- **UI language:** English (`Base`, `Open`, `Partial`).
- **Branch:** `feat/gantt/pilot-division-pairing-pane` (already created off `main`).
- **e2e auth:** admin `Ryan` / `Our2027`; app base path `/fpqe/gantt/`; token in sessionStorage. Run a single gantt spec with `--no-deps` if pbs-server `:3002` is down. Test IDs: scenario range `Scen-2xxx`.

---

### Task 1: Shared crew-division pairing filter helper (backend)

**Files:**
- Create: `live-server/src/services/scenario/pairing-division-filter.ts`
- Test: `live-server/src/services/scenario/__tests__/pairing-division-filter.test.ts`

**Interfaces:**
- Produces: `filterPairingsByCrewDivision<C extends { division: string }, P extends { division: string }>(crew: C[], pairings: P[]): P[]` — keeps pairings whose `division` is present among the crew's divisions; returns all pairings when no crew has a (non-empty) division.

- [ ] **Step 1: Write the failing test**

```ts
// live-server/src/services/scenario/__tests__/pairing-division-filter.test.ts
import { describe, it, expect } from 'vitest'
import { filterPairingsByCrewDivision } from '../pairing-division-filter.js'

const crew = (divs: string[]) => divs.map((division, i) => ({ crewId: `c${i}`, division }))
const pair = (divs: string[]) => divs.map((division, i) => ({ pairingId: i, division }))

describe('filterPairingsByCrewDivision', () => {
  it('keeps only pairings whose division is present among the crew (pilot scenario)', () => {
    const out = filterPairingsByCrewDivision(crew(['P', 'P']), pair(['P', 'C', 'P']))
    expect(out.map((p) => p.division)).toEqual(['P', 'P'])
  })

  it('keeps all present divisions for a mixed-crew scenario', () => {
    const out = filterPairingsByCrewDivision(crew(['P', 'C']), pair(['P', 'C', 'A']))
    expect(out.map((p) => p.division).sort()).toEqual(['C', 'P'])
  })

  it('returns all pairings when crew carries no division (safe fallback)', () => {
    const out = filterPairingsByCrewDivision(crew(['', '']), pair(['P', 'C']))
    expect(out.length).toBe(2)
  })

  it('returns all pairings when crew is empty', () => {
    const out = filterPairingsByCrewDivision([], pair(['P', 'C']))
    expect(out.length).toBe(2)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd live-server && npx vitest run src/services/scenario/__tests__/pairing-division-filter.test.ts`
Expected: FAIL — cannot find module `../pairing-division-filter.js`.

- [ ] **Step 3: Write minimal implementation**

```ts
// live-server/src/services/scenario/pairing-division-filter.ts
//
// Scope scenario pairings to the divisions actually present among the loaded
// (already division-scoped) crew. Used by both gantt display builders so a
// pilot scenario never surfaces cabin pairings (and vice-versa). Deriving the
// scope from crew keeps the two display paths self-consistent and needs no
// filterParams threading. See spec 2026-06-22-pilot-division-pairing-pane-fixes.

/** Keep pairings whose division is present among the crew's divisions.
 *  No crew division present → return all pairings unchanged (safe fallback). */
export const filterPairingsByCrewDivision = <
  C extends { division: string },
  P extends { division: string },
>(
  crew: C[],
  pairings: P[],
): P[] => {
  const crewDivisions = new Set(crew.map((c) => c.division).filter(Boolean))
  if (crewDivisions.size === 0) return pairings
  return pairings.filter((p) => crewDivisions.has(p.division))
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd live-server && npx vitest run src/services/scenario/__tests__/pairing-division-filter.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add live-server/src/services/scenario/pairing-division-filter.ts live-server/src/services/scenario/__tests__/pairing-division-filter.test.ts
git commit -m "feat(scenario): add crew-division pairing filter helper"
```

---

### Task 2: Wire the division filter into both display builders (backend)

**Files:**
- Modify: `live-server/src/services/scenario/scenario-gantt-service.ts` (`parseCrewAndPairings`, return at ~line 210)
- Modify: `live-server/src/services/scenario/scenario-gantt-db-service.ts` (`buildGanttDataFromDb`, return at ~line 354-374)

**Interfaces:**
- Consumes: `filterPairingsByCrewDivision(crew, pairings)` from Task 1.
- Produces: both builders return `ScenarioGanttPairing[]` already scoped to the crew's divisions.

- [ ] **Step 1: Add the import + filter in the gz/snapshot builder**

In `scenario-gantt-service.ts`, add the import near the other scenario imports at the top of the file:

```ts
import { filterPairingsByCrewDivision } from './pairing-division-filter.js'
```

Then change the `parseCrewAndPairings` return (currently `return { crew, pairings }` at ~line 210):

```ts
  // Scope pairings to the divisions present among the (already division-scoped)
  // crew — the gz `pairing` section is not division-filtered at export time, so a
  // pilot scenario would otherwise surface cabin pairings. Covers buildGanttDataSnapshot
  // AND buildGanttDataLiveRefresh (both call this). See spec 2026-06-22.
  return { crew, pairings: filterPairingsByCrewDivision(crew, pairings) }
```

- [ ] **Step 2: Add the import + filter in the db builder**

In `scenario-gantt-db-service.ts`, add the import near the top:

```ts
import { filterPairingsByCrewDivision } from './pairing-division-filter.js'
```

Then, in `buildGanttDataFromDb`, after `const updatedPairings = recomputeCompositionFill(pairings, assignments, crew)` (~line 354) and before the `return {`, scope the pairings:

```ts
  const scopedPairings = filterPairingsByCrewDivision(crew, updatedPairings)
```

and change the returned `pairings: updatedPairings,` to `pairings: scopedPairings,`.

- [ ] **Step 3: Type-check the backend**

Run: `cd live-server && npx tsc --noEmit`
Expected: PASS (no new type errors from these edits).

- [ ] **Step 4: Sanity-run the existing db-service integration test**

Run: `cd live-server && npx vitest run src/services/scenario/__tests__/scenario-gantt-db-service.test.ts`
Expected: PASS — scenarios 459/460 still assemble (their crew/pairings share one division, so the filter is a no-op for them). If the remote DB is unreachable, note it and rely on the Task 6 Playwright proof instead.

- [ ] **Step 5: Commit**

```bash
git add live-server/src/services/scenario/scenario-gantt-service.ts live-server/src/services/scenario/scenario-gantt-db-service.ts
git commit -m "fix(scenario): scope gantt-data pairings to crew division in both display builders"
```

---

### Task 3: Division filter on the solver export (backend)

**Files:**
- Modify: `live-server/src/services/scenario/scenario-export-service.ts:79-97` (`pairingIdSet`)
- Test: `live-server/src/services/scenario/__tests__/scenario-export-pairing-division.test.ts`

**Interfaces:**
- Consumes: `pairingIdSet(s: ScenarioRow): SQL` (existing, module-private — exported for the test in Step 3).
- Produces: the solver `ro_input.gz` pairing set scoped by `filterParams.crew.division` when set.

- [ ] **Step 1: Write the failing test**

```ts
// live-server/src/services/scenario/__tests__/scenario-export-pairing-division.test.ts
import { describe, it, expect } from 'vitest'
import { PgDialect } from 'drizzle-orm/pg-core'
import { pairingIdSet, type ScenarioRow } from '../scenario-export-service.js'

const dialect = new PgDialect()
const row = (filterParams: Record<string, unknown>): ScenarioRow => ({
  id: 1, worksetId: 1,
  strDtLoc: new Date('2026-06-01T07:00:00Z'),
  endDtLoc: new Date('2026-06-30T07:00:00Z'),
  filterParams, ruleGroupCode: 'g', fileType: 'RO',
})

describe('pairingIdSet division scoping', () => {
  it('adds a division predicate when filterParams.crew.division is set', () => {
    const { sql: text, params } = dialect.sqlToQuery(pairingIdSet(row({ crew: { division: 'P' } })))
    expect(text).toContain('division =')
    expect(params).toContain('P')
  })

  it('omits the division predicate when no division is set', () => {
    const { sql: text } = dialect.sqlToQuery(pairingIdSet(row({})))
    expect(text).not.toContain('division =')
  })
})
```

- [ ] **Step 2: Export `pairingIdSet` + `ScenarioRow` and run the test to verify it fails**

In `scenario-export-service.ts`, change `const pairingIdSet = (s: ScenarioRow): SQL => {` to `export const pairingIdSet = (s: ScenarioRow): SQL => {`. (`ScenarioRow` is already exported.)

Run: `cd live-server && npx vitest run src/services/scenario/__tests__/scenario-export-pairing-division.test.ts`
Expected: FAIL on the first assertion — generated SQL has no `division =`.

- [ ] **Step 3: Add the division predicate**

In `pairingIdSet`, after reading `pf` and before building `parts`, resolve the division from the crew filter (the scenario's division authority, same value `crewIdSet` uses), and push the predicate:

```ts
const pairingIdSet = ... => {
  const fp = (s.filterParams ?? {}) as Record<string, Record<string, unknown>>
  const pf = (fp.pairing ?? {}) as Record<string, unknown>
  const cf = (fp.crew ?? {}) as Record<string, unknown>
  const division = (pf.division ?? cf.division) as string | undefined
  const bases  = (pf.bases  as string[] | undefined) ?? []
  const fleets = (pf.fleets as string[] | undefined) ?? []

  const parts: SQL[] = [sql`SELECT id FROM pairing
    WHERE sch_str_dt_utc <= ${s.endDtLoc}
      AND sch_end_dt_utc >= ${s.strDtLoc}
      AND is_deleted = 0`]

  if (division)
    parts.push(sql` AND division = ${division}`)

  if (bases.length > 0)
    parts.push(sql` AND base = ANY(ARRAY[${sqlStrArray(bases)}]::text[])`)

  if (fleets.length > 0)
    parts.push(sql` AND fleet = ANY(ARRAY[${sqlStrArray(fleets)}]::text[])`)

  return sql.join(parts, sql``)
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd live-server && npx vitest run src/services/scenario/__tests__/scenario-export-pairing-division.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add live-server/src/services/scenario/scenario-export-service.ts live-server/src/services/scenario/__tests__/scenario-export-pairing-division.test.ts
git commit -m "fix(scenario): scope solver-export pairings by crew division"
```

---

### Task 4: Default Open+Partial coverage, unified hard filter (frontend)

**Files:**
- Modify: `gantt/src/utils/pairing-coverage.ts` (add `coverageMatches`)
- Modify: `gantt/src/stores/filter-store.ts:66` (`DEFAULT_PAIRING_FILTER.coverage`)
- Modify: `gantt/src/components/gantt/source/live-gantt-source.ts:213-242` (`useRows` coverage float → hard filter)
- Modify: `gantt/src/components/gantt/source/scenario-gantt-source.ts:220-222` (`pairingMatchesSharedFilter` uses the shared predicate)
- Test: `e2e/tests/gantt/pairing-coverage-default.spec.ts`

**Interfaces:**
- Produces: `coverageMatches(coverage: CoverageState[], composition: CompositionSlot[]): boolean` — true when coverage is not narrowed, or the pairing's classified coverage is in the selection.

- [ ] **Step 1: Add the shared coverage predicate**

In `gantt/src/utils/pairing-coverage.ts`, add (reusing the existing `ALL_COVERAGE`, `classifyCoverage`, `CoverageState`, and the `CompositionSlot` type already used by `classifyCoverage`):

```ts
/** Coverage is "narrowed" when a strict, non-empty subset of all states is selected. */
export const coverageNarrowed = (coverage: CoverageState[]): boolean =>
  coverage.length > 0 && coverage.length < ALL_COVERAGE.length

/** Hard-filter predicate: keep a pairing when coverage is not narrowed, or its
 *  classified coverage is in the selection. Shared by Live + Scenario sources. */
export const coverageMatches = (
  coverage: CoverageState[],
  composition: Parameters<typeof classifyCoverage>[0],
): boolean => !coverageNarrowed(coverage) || coverage.includes(classifyCoverage(composition))
```

> Note: `scenario-gantt-source.ts` already exports a `pairingCoverageNarrowed` with the same logic; leave it (it re-exports for chips) and have it delegate to `coverageNarrowed` if trivial, otherwise leave as-is — do not churn unrelated call sites (§Surgical).

- [ ] **Step 2: Change the default coverage to Open+Partial**

In `gantt/src/stores/filter-store.ts`, change `DEFAULT_PAIRING_FILTER` (line 66):

```ts
const DEFAULT_PAIRING_FILTER: PairingFilter = { bases: [], fleets: [], divisions: [], depArps: [], coverage: ['open', 'partial'], assignments: [], label: '' }
```

- [ ] **Step 3: Convert Live coverage from float to hard filter**

In `gantt/src/components/gantt/source/live-gantt-source.ts`, import the predicate and `classifyCoverage` (the latter is already imported), then replace the float block (lines ~213-242, from `const coverageActive = ...` through the `const rows: PairingItem[] = [...frozen, ...nonFrozen]`):

```ts
import { ALL_COVERAGE, classifyCoverage, coverageMatches } from '@/utils/pairing-coverage'
// ...
      const coverageActive = coverageSel.length > 0 && coverageSel.length < ALL_COVERAGE.length
      const sorted = sortPairingRows(pairingItems, sortColumn, sortDirection)
      const foundSet = new Set(foundPairingIds)
      const frozenSet = new Set(frozenRowIds)

      // Coverage is a HARD filter (hide full/over) — unified with Scenario. Always keep
      // explicitly frozen + label-found rows regardless of coverage (those are user overlays).
      const afterCoverage = !coverageActive
        ? sorted
        : sorted.filter((pi) =>
            frozenSet.has(String(pi.pairing.id)) ||
            foundSet.has(String(pi.pairing.id)) ||
            coverageMatches(coverageSel, pi.pairing.composition ?? []))

      // Tier-1 float: explicit Label-search matches floated to top.
      let floated: PairingItem[]
      if (foundSet.size === 0) {
        floated = afterCoverage
      } else {
        const labelTier = afterCoverage.filter((pi) => foundSet.has(String(pi.pairing.id)))
        const rest = afterCoverage.filter((pi) => !foundSet.has(String(pi.pairing.id)))
        floated = labelTier.length === 0 ? afterCoverage : [...labelTier, ...rest]
      }

      // Frozen-first reorder (unchanged).
      const frozen: PairingItem[] = []
      const nonFrozen: PairingItem[] = []
      for (const item of floated) {
        if (frozenSet.has(String(item.pairing.id))) frozen.push(item)
        else nonFrozen.push(item)
      }
      const rows: PairingItem[] = [...frozen, ...nonFrozen]

      return { rows }
```

- [ ] **Step 4: Point Scenario's coverage check at the shared predicate**

In `gantt/src/components/gantt/source/scenario-gantt-source.ts`, in `pairingMatchesSharedFilter`, replace the coverage block (lines ~220-222):

```ts
  if (!coverageMatches(f.coverage, p.composition ?? [])) return false
```

and add `coverageMatches` to the existing import from `@/utils/pairing-coverage`. Behavior is identical (it already hard-filtered); this is DRY only.

- [ ] **Step 5: Write the Playwright regression (Live + Scenario)**

```ts
// e2e/tests/gantt/pairing-coverage-default.spec.ts
import { test, expect } from '@playwright/test'
import { openScenarioGantt, openLiveGantt } from './helpers/gantt-open' // existing harness; see scenario-540 spec for the login+open pattern

// Scen-2010
test('scenario pairing pane defaults to Open, Partial and hides full pairings', async ({ page }) => {
  await openScenarioGantt(page, 540) // login Ryan/Our2027 → /fpqe/gantt/ → search 540 → open
  const strip = page.getByTestId('pane-condition-strip-pairing')
  await expect(strip).toContainText('Open, Partial')
  // Every visible pairing row's composition shows an open/short slot (no fully-covered rows).
  // Assert at least one row and that the "full" badge/marker is absent from the visible set.
  const rows = page.getByTestId(/^pairing-row-/)
  await expect(rows.first()).toBeVisible()
  await expect(page.getByTestId('pairing-coverage-full-marker')).toHaveCount(0)
})

// Live-1010
test('live pairing pane defaults to Open, Partial', async ({ page }) => {
  await openLiveGantt(page)
  await expect(page.getByTestId('pane-condition-strip-pairing')).toContainText('Open, Partial')
})
```

> If the harness helpers / testids differ, align them to the existing `e2e/tests/gantt/scenario-540-yvr-rust-solver-run.spec.ts` selectors (it already logs in and opens #540). Use a real coverage signal that exists in the renderer; if no `full-marker` testid exists, assert the visible row count equals the open+partial count exposed via `window.__ganttTest` instead of inventing a DOM marker (§No-Illusion — assert real data, not just visibility).

- [ ] **Step 6: Run the spec**

Run: `cd e2e && npx playwright test tests/gantt/pairing-coverage-default.spec.ts --reporter=list`
Expected: PASS. Paste the summary. Update any stale spec that asserted the old all-coverage default (§Stale-Test) — check `e2e/tests/gantt/filter-bring-to-top.spec.ts`.

- [ ] **Step 7: Commit**

```bash
git add gantt/src/utils/pairing-coverage.ts gantt/src/stores/filter-store.ts gantt/src/components/gantt/source/live-gantt-source.ts gantt/src/components/gantt/source/scenario-gantt-source.ts e2e/tests/gantt/pairing-coverage-default.spec.ts
git commit -m "feat(gantt): default pairing pane to Open+Partial as a unified hard filter"
```

---

### Task 5: Base column on the pairing pane (frontend)

**Files:**
- Modify: `gantt/src/stores/column-store.ts:32-38` (`DEFAULT_PAIRING_COLUMNS`)
- Modify: `gantt/src/components/panes/shared/pairing-pane.tsx:106-123` (`buildPairingPanelRowData`)
- Test: `e2e/tests/gantt/pairing-base-column.spec.ts`

**Interfaces:**
- Consumes: `PanelRowData.values[key]` rendering in `PaneHeaderCanvas` (existing — any visible column with a matching `values` key renders).
- Produces: a `base` column between `pairingId` and `type`, value = `pairing.base`.

- [ ] **Step 1: Add the Base column to the shared pairing columns**

In `gantt/src/stores/column-store.ts`, replace `DEFAULT_PAIRING_COLUMNS` (lines 32-38):

```ts
const DEFAULT_PAIRING_COLUMNS: ColumnConfig[] = [
  { key: 'pairingId', label: 'Pairing', width: 54, visible: true,  order: 1, row: 1 },
  { key: 'base',      label: 'Base',    width: 36, visible: true,  order: 2, row: 1 },
  { key: 'type',      label: 'Tp',      width: 32, visible: true,  order: 3, row: 1 },
  { key: 'fleet',     label: 'Fleet',   width: 60, visible: true,  order: 4, row: 1 },
  { key: 'blh',       label: 'BLH',     width: 52, visible: false, order: 5, row: 1 },
  { key: 'cred',      label: 'Cred',    width: 52, visible: true,  order: 6, row: 1 },
]
```

(`'pairing'` and `'scenario-pairing'` both clone this set, so Live and Scenario both gain the column.)

- [ ] **Step 2: Populate the `base` value in the panel row**

In `gantt/src/components/panes/shared/pairing-pane.tsx`, in `buildPairingPanelRowData`, add `base` to `values`:

```ts
      values: {
        pairingId: p.pairingLabel ?? `P${p.id}`,
        base: p.base ?? '',
        type: p.assignment?.substring(0, 3) || 'DOM',
        fleet: p.fleet || p.base,
        cred,
      },
```

- [ ] **Step 3: Write the Playwright regression**

```ts
// e2e/tests/gantt/pairing-base-column.spec.ts
import { test, expect } from '@playwright/test'
import { openScenarioGantt } from './helpers/gantt-open'

// Scen-2011
test('pairing pane shows a Base column with the pairing base value', async ({ page }) => {
  await openScenarioGantt(page, 540)
  // Header shows Base between Pairing and Tp.
  await expect(page.getByTestId('pane-header-pairing')).toContainText('Base')
  // A pilot pairing row carries its base (YVR for #540's YVR-based pairings).
  const firstRowBase = page.getByTestId(/^pairing-cell-base-/).first()
  await expect(firstRowBase).toContainText('YVR')
})
```

> The pairing header/cell are Canvas-drawn. If there is no DOM `data-testid` for header text / base cell, assert via `window.__ganttTest` (the gantt Canvas test hook) that the `pairing` columns include `{ key: 'base', visible: true }` and that a row's `values.base` equals `'YVR'`, mirroring how existing Canvas specs assert (§No-Illusion — assert the real rendered model, not a bare visibility).

- [ ] **Step 4: Run the spec**

Run: `cd e2e && npx playwright test tests/gantt/pairing-base-column.spec.ts --reporter=list`
Expected: PASS. Paste the summary.

- [ ] **Step 5: Commit**

```bash
git add gantt/src/stores/column-store.ts gantt/src/components/panes/shared/pairing-pane.tsx e2e/tests/gantt/pairing-base-column.spec.ts
git commit -m "feat(gantt): add Base column to the pairing pane (Live + Scenario)"
```

---

### Task 6: Division integration proof on #540 + finalize

**Files:**
- Create: `e2e/tests/gantt/scenario-540-pilot-division-pairings.spec.ts`
- Modify: `gantt/src/version.ts:18-19` (version bump)

**Interfaces:**
- Consumes: the backend division scoping (Tasks 1-3) + the running stack serving `#540`.

- [ ] **Step 1: Write the division Playwright proof (would have caught the bug)**

```ts
// e2e/tests/gantt/scenario-540-pilot-division-pairings.spec.ts
import { test, expect } from '@playwright/test'
import { openScenarioGantt } from './helpers/gantt-open'

// Scen-2012 — regression for the cabin-pairing leak into a pilot (FC) scenario.
test('#540 pilot scenario shows no cabin pairings', async ({ page }) => {
  await openScenarioGantt(page, 540)
  // The leaking pairing from the bug report (cabin: IFD/FA composition).
  await expect(page.getByText('V4519', { exact: false })).toHaveCount(0)
  // No visible pairing carries a cabin-only composition (IFD = In-Flight Director, FA = Flight Attendant).
  const model = await page.evaluate(() => (window as any).__ganttTest?.getPairingModel?.('scenario-pairing', 540))
  expect(model, '__ganttTest pairing model present').toBeTruthy()
  for (const p of model.rows) {
    const ranks = (p.composition ?? []).map((c: { rank: string }) => c.rank)
    expect(ranks).not.toContain('IFD')
    expect(ranks).not.toContain('FA')
  }
  expect(model.rows.length).toBeGreaterThan(0)
})
```

> If `__ganttTest.getPairingModel` does not exist, use the equivalent existing introspection (see `gantt-live-view-and-test-hook` / the scenario-540 spec) — assert on the real loaded pairing composition, not a DOM snapshot. Do not weaken to a bare `toBeVisible` (§No-Illusion).

- [ ] **Step 2: Run the division proof**

Run: `cd e2e && npx playwright test tests/gantt/scenario-540-pilot-division-pairings.spec.ts --reporter=list`
Expected: PASS. Paste the summary. (This exercises whichever display path the env uses — db or gz/snapshot — both now division-scoped.)

- [ ] **Step 3: Bump the version**

In `gantt/src/version.ts`, set:

```ts
export const BACKEND_VERSION = 154  // live-server: scope scenario pairings by crew division (display builders + solver export) — pilot scenarios no longer leak cabin pairings
export const FRONTEND_VERSION = 297  // gantt: pairing pane defaults to Open+Partial hard filter (unified Live/Scenario) + Base column
```

- [ ] **Step 4: Run the UI-standard gate**

Run: `npm run check:ui`
Expected: 0 hard violations. Paste the PASS line.

- [ ] **Step 5: Run the full new/affected gantt specs together**

Run: `cd e2e && npx playwright test tests/gantt/pairing-coverage-default.spec.ts tests/gantt/pairing-base-column.spec.ts tests/gantt/scenario-540-pilot-division-pairings.spec.ts --reporter=list`
Expected: all PASS. Paste the summary.

- [ ] **Step 6: Commit**

```bash
git add gantt/src/version.ts e2e/tests/gantt/scenario-540-pilot-division-pairings.spec.ts
git commit -m "test(gantt): prove #540 pilot scenario hides cabin pairings; bump B154/F297"
```

---

## Self-Review

**Spec coverage:**
- Change 1 (division, 3 sites) → Tasks 1 (helper) + 2 (both display builders) + 3 (solver export); proof Task 6. ✓
- Change 2 (default Open+Partial, unified hard filter) → Task 4. ✓
- Change 3 (Base column, shared) → Task 5. ✓
- Testing strategy (helper unit, export unit, division/coverage/base Playwright, Live regression) → Tasks 1, 3, 4, 5, 6. ✓
- Conventions (version bump, check:ui) → Task 6. ✓
- Out of scope (label float/filter divergence, re-export #540 gz) → untouched. ✓

**Placeholder scan:** no TBD/TODO; every code step shows full code. e2e selector fallbacks are explicit instructions (align to existing harness / `__ganttTest`), not placeholders. ✓

**Type consistency:** `filterPairingsByCrewDivision(crew, pairings)` used identically in Tasks 1/2; `coverageMatches(coverage, composition)` defined in Task 4 Step 1 and consumed in Steps 3-4; `pairingIdSet`/`ScenarioRow` exported in Task 3 Step 2 before use in Step 1's import. ✓
