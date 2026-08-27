# Scenario Scope Filter Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align Scenario scope controls, optimizer input, and Scenario Gantt data so visible filters are authoritative and Scenario panes only show scoped data.

**Architecture:** Reuse the existing reference store for fleet options, remove the unused Pairing Source control without changing DB schema, and tighten backend Scenario data builders so flights are derived from scoped pairing segments. Preserve compatibility with existing `leadinLive` data while treating Live pre-occupied roster context as default behavior.

**Tech Stack:** React 19 + Zustand + Vitest in `gantt`; Fastify + Drizzle SQL + Vitest in `live-server`; Playwright for Scenario UI verification.

---

## File Structure

- Modify `gantt/src/components/scenario/filter/ro-crew-filter.tsx`: use fleet reference options in a `MultiSelect` instead of free-text `TagInput`.
- Modify `gantt/src/components/scenario/filter/ro-pairing-filter.tsx`: use fleet reference options, remove Pairing Source controls and summary contribution.
- Modify `gantt/src/components/scenario/scenario-filter-section.tsx`: remove `sources` from defaults and force `leadinLive` to the product default when saving through this section.
- Modify `gantt/src/types/scenario.ts`: make `sources` legacy/optional so old rows still type-check but new UI no longer requires it.
- Add or modify focused frontend tests near `gantt/src/components/scenario/filter/`.
- Modify `live-server/src/services/scenario/scenario-export-service.ts`: remove stale `sources` comments and add base/fleet scoping regression coverage.
- Modify `live-server/src/services/scenario/scenario-gantt-db-service.ts`: derive DB Scenario flights from scoped pairing segment `flt_id`s instead of the whole date window.
- Modify `live-server/src/services/scenario/scenario-gantt-service.ts`: derive gz/seed/live-refresh flights from scoped pairing segments.
- Modify `live-server/src/services/scenario/__tests__/scenario-gantt-db-service.test.ts`: update lead-in default expectations and add flight-scope regression.
- Modify `live-server/src/services/scenario/__tests__/scenario-export-pairing-division.test.ts`: add pairing base scope assertion.
- Modify `gantt/src/version.ts`: bump `FRONTEND_VERSION` for frontend runtime changes.

## Task 1: Frontend Scenario Scope Controls

**Files:**
- Modify: `gantt/src/components/scenario/filter/ro-crew-filter.tsx`
- Modify: `gantt/src/components/scenario/filter/ro-pairing-filter.tsx`
- Modify: `gantt/src/components/scenario/scenario-filter-section.tsx`
- Modify: `gantt/src/types/scenario.ts`
- Test: `gantt/src/components/scenario/filter/__tests__/scenario-scope-filters.test.tsx`

- [ ] **Step 1: Write the failing frontend test**

Create `gantt/src/components/scenario/filter/__tests__/scenario-scope-filters.test.tsx` with tests that render `RoCrewFilter` and `RoPairingFilter` under a mocked `useReferenceStore`. Assert that fleet choices come from the mocked `fleet` table rows and that `Pairing Source` is absent.

- [ ] **Step 2: Run the focused frontend test to verify RED**

Run: `cd gantt && npx vitest run src/components/scenario/filter/__tests__/scenario-scope-filters.test.tsx --reporter=verbose`

Expected: FAIL because the current components use `TagInput` placeholders and still render `Pairing Source`.

- [ ] **Step 3: Implement minimal frontend control changes**

Use `useReferenceStore((s) => s.fleets)` and `useReferenceStore((s) => s.loading)` to build `MultiSelectOption[]` values for fleet controls. Remove `Pairing Source` controls, `SOURCE_OPTIONS`, `ALL_SOURCES`, `toggleSource`, and the sources portion of the compiled pairing summary. Keep old `sources` data ignored.

- [ ] **Step 4: Run focused frontend test to verify GREEN**

Run: `cd gantt && npx vitest run src/components/scenario/filter/__tests__/scenario-scope-filters.test.tsx --reporter=verbose`

Expected: PASS.

## Task 2: Backend Export Scope Regression

**Files:**
- Modify: `live-server/src/services/scenario/scenario-export-service.ts`
- Modify: `live-server/src/services/scenario/__tests__/scenario-export-pairing-division.test.ts`

- [ ] **Step 1: Write failing/guarding export test**

Extend `scenario-export-pairing-division.test.ts` with an assertion that `pairingIdSet(row({ crew: { division: 'P' }, pairing: { bases: ['YYZ'], fleets: ['7M8'] } }))` contains `base = ANY` and `fleet = ANY` predicates with `YYZ` and `7M8` parameters, and contains no `source` predicate.

- [ ] **Step 2: Run export test**

Run: `cd live-server && npx vitest run src/services/scenario/__tests__/scenario-export-pairing-division.test.ts --reporter=verbose`

Expected: PASS or a focused failure showing stale expectations. This is a regression guard because base filtering already exists.

- [ ] **Step 3: Update stale comments only**

Edit `scenario-export-service.ts` comments so they describe the actual filters: pairing base, pairing fleet, division, and time-window overlap. Do not add a source filter.

- [ ] **Step 4: Re-run export test**

Run: `cd live-server && npx vitest run src/services/scenario/__tests__/scenario-export-pairing-division.test.ts --reporter=verbose`

Expected: PASS.

## Task 3: Scenario Gantt Flight Scoping

**Files:**
- Modify: `live-server/src/services/scenario/scenario-gantt-db-service.ts`
- Modify: `live-server/src/services/scenario/scenario-gantt-service.ts`
- Modify: `live-server/src/services/scenario/__tests__/scenario-gantt-db-service.test.ts`
- Modify: `live-server/src/__tests__/services/scenario-gantt-service.test.ts` if gz path expectations need updating.

- [ ] **Step 1: Run GitNexus impact for changed backend symbols**

Run:

```powershell
node .gitnexus/run.cjs impact buildGanttDataFromDb
node .gitnexus/run.cjs impact buildGanttDataSeed
node .gitnexus/run.cjs impact buildGanttDataLiveRefresh
node .gitnexus/run.cjs impact buildGanttDataSnapshot
```

Expected: record callers and risk before editing. If the CLI cannot resolve a symbol, record that and continue with local `rg` call-site evidence.

- [ ] **Step 2: Write failing flight-scope regression**

In `scenario-gantt-db-service.test.ts`, add a test that mocks pairings/segments/flights where one flight is referenced by a scoped pairing segment and another flight only matches the date window. Assert `buildGanttDataFromDb(...).flights` contains only the referenced flight id.

- [ ] **Step 3: Run DB Gantt test to verify RED**

Run: `cd live-server && npx vitest run src/services/scenario/__tests__/scenario-gantt-db-service.test.ts --reporter=verbose`

Expected: FAIL because current DB builder loads date-window flights.

- [ ] **Step 4: Implement DB flight scoping**

After loading scoped `pairingSegments`, collect non-null `fltId` values and use them for the flight query. If no `fltId` values exist, return an empty `flights` array.

- [ ] **Step 5: Implement gz/seed/live-refresh flight scoping helper**

In `scenario-gantt-service.ts`, add a small pure helper that filters `ScenarioGanttFlight[]` to ids referenced by the current `pairingSegments`. Use it in snapshot, live-refresh, and seed builders.

- [ ] **Step 6: Re-run backend Gantt tests**

Run: `cd live-server && npx vitest run src/services/scenario/__tests__/scenario-gantt-db-service.test.ts src/__tests__/services/scenario-gantt-service.test.ts --reporter=verbose`

Expected: PASS.

## Task 4: Lead-In Live Default

**Files:**
- Modify: `gantt/src/components/scenario/*` where create/edit exposes `leadinLive`
- Modify: `live-server/src/services/scenario/scenario-gantt-service.ts`
- Modify: `live-server/src/services/scenario/__tests__/scenario-gantt-db-service.test.ts`
- Modify: relevant E2E Scenario create/detail tests

- [ ] **Step 1: Locate LeadIn UI and tests**

Run: `rg -n "leadinLive|LeadIn|Lead-in|Live lead-in|Empty · no lead-in" gantt/src e2e/tests/gantt live-server/src`

- [ ] **Step 2: Write/update failing UI/E2E expectation**

Update the most focused Scenario create/detail test so the LeadIn Live control/text is not present, while scenario payload/default still uses `leadinLive: 1`.

- [ ] **Step 3: Make backend seed behavior default to lead-in**

In `buildGanttDataSeed`, remove the conditional that suppresses lead-in when `leadinLive` is `0`; always call `loadLeadinFromLive` for scoped crew.

- [ ] **Step 4: Hide frontend lead-in option**

Remove the user-facing control. When constructing create/update payloads, default `leadinLive` to `1`.

- [ ] **Step 5: Run lead-in focused tests**

Run the updated frontend/E2E or Vitest tests and `cd live-server && npx vitest run src/services/scenario/__tests__/scenario-gantt-db-service.test.ts --reporter=verbose`.

Expected: PASS with old `leadinLive=0` scenarios now showing Live lead-in preview behavior.

## Task 5: Version and Verification

**Files:**
- Modify: `gantt/src/version.ts`

- [ ] **Step 1: Bump frontend version**

Increment `FRONTEND_VERSION` by 1. If backend runtime code changed, increment `BACKEND_VERSION` by 1 too.

- [ ] **Step 2: Run UI standard gate**

Run: `npm run check:ui`

Expected: PASS with hard violations = 0.

- [ ] **Step 3: Run builds**

Run:

```powershell
cd gantt; npm run build
cd ../live-server; npm run build
```

Expected: PASS.

- [ ] **Step 4: Run focused Playwright**

Run the focused Scenario filter/create/Gantt spec selected during implementation:

```powershell
cd e2e
npx playwright test --config=config/playwright.config.ts --project=gantt --no-deps tests/gantt/scenario-create.spec.ts tests/gantt/scenario/scenario-filter-flight.spec.ts --reporter=list
```

Expected: PASS, or document any environmental blocker with manual verification.

- [ ] **Step 5: Run GitNexus detect changes**

Run: `node .gitnexus/run.cjs detect-changes`

Expected: affected symbols match Scenario filter/export/Gantt scope only.
