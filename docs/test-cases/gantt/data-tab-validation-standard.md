# Data Tab Mandatory Test and Validation Standard

Date: 2026-06-07
Applies to: `gantt` Data tab and `live-server` `/api/data/*`
Related spec: `docs/superpowers/specs/2026-06-07-gantt-data-tab-design.md`
Related plan: `docs/superpowers/plans/2026-06-06-231433-gantt-data-tab-implementation-plan-Ver1.md`

This standard extends:

- `docs/test-cases/gantt/anti-illusion-rules.md`
- `docs/test-cases/gantt/filter-test-rules.md`

## Principle

Data tab tests must prove data integrity and data semantics, not just UI visibility.

Passing evidence must answer:

- Which table/entity was queried or changed?
- Which row(s) were affected?
- Which field(s) changed?
- Which validation rule allowed or blocked the change?
- Was the server state actually committed or rolled back?

## Anti-Illusion Rules

### Rule 1 - Visibility Is Not Data Proof

Forbidden as final proof:

- `expect(page.getByText('Crew Master')).toBeVisible()` alone.
- `expect(grid).toBeVisible()` alone.
- Screenshot/manual visual check alone.
- "No console error" alone.

Required proof:

- Query API/store/test hook returns rows.
- Rows carry `entityId`, `rowId` or `crewId`, and field values.
- Assertions inspect the relevant fields.

### Rule 2 - No Vacuous Filter Passes

Every positive filter test must first prove the selected value exists.

Allowed methods:

- Discover a value from API data before applying the filter.
- Discover a value from reference options and then confirm matching row count > 0.
- Use a seeded fixture explicitly documented in the test.

Forbidden:

- Hard-coding `BKK`, `YVR`, `CA`, `ETOPS`, or any other value unless the test proves it exists first.
- Accepting 0 rows as success for a positive filter.

### Rule 3 - Per-Row Assertions Required

After applying a filter, assert every returned row satisfies the filter.

Examples:

- Crew ID filter: every `crew.crew_id` contains or equals the searched value, depending on operator.
- Rank filter: every returned crew has at least one matching `crew_rank.rank` row in the active/expiry window.
- Base filter: every returned crew has at least one matching `crew_base.base` row in the active/expiry window.
- Qualification filter: every returned crew has at least one matching `crew_qualification.qualification` row.
- Team filter: every returned crew has at least one matching `crew_team.team_id`/team row.

If the UI only returns summary rows, the test must call the API/test hook for detail rows before asserting.

### Rule 4 - Expiry Queries Must Assert Date Math

For `expired`:

- Every asserted section row must have `exp_dt` not null.
- `exp_dt < referenceDate`.

For `expiring_in_days`:

- Every asserted section row must have `exp_dt` not null.
- `referenceDate <= exp_dt <= referenceDate + days`.

For `current`:

- `exp_dt is null OR exp_dt >= referenceDate`.

For `range`:

- `from <= exp_dt <= to`.

Tests must compute these windows in test code and compare actual row dates. Do not trust filter chips as proof.

### Rule 5 - Integrity Tests Must Verify No Commit

When save is blocked or server validation fails:

- Assert the returned validation issue code, e.g. `missing_parent`.
- Re-query the affected entity.
- Assert no invalid row was committed.
- Assert unrelated valid rows in the same rejected batch were not committed if the endpoint is transactional.

### Rule 6 - Reference Select Tests Must Check Options

For parent-key fields, tests must verify invalid values are unavailable in normal UI controls.

Examples:

- `crew_base.base` select options must come from `base`.
- `crew_rank.rank` select options must come from `rank`.
- `crew_fleet.fleet_specific` select options must come from `fleet`.
- `crew_qualification.qualification` select options must come from `qualification`.
- `crew_team.team_id` select options must come from `team`.

If a test forces invalid data through API or test hook, it must be labeled as a server validation test.

### Rule 7 - Undo/Redo Must Assert State, Not Button Clicks

Undo/redo tests must assert:

- Initial value.
- Edited value.
- Undo restores initial value.
- Redo restores edited value.
- Save payload contains only the final active draft state.

Button enabled/disabled state is supporting evidence only.

### Rule 8 - Dirty Navigation Must Assert Preservation or Warning

For unsaved changes:

- Navigating to another Data page should either preserve the draft or show a blocking warning.
- Closing/switching tabs should warn.
- Returning to the page must show the same pending changes if the user chooses not to discard.

Do not pass a test by only checking that a browser dialog appeared; assert draft state after the user choice.

### Rule 9 - No Operational Domain Leakage

Data tab tests must fail if Data tab offers editable pages for:

- flight
- pairing
- roster
- scenario
- rule authoring
- security/profile authorization

Those domains have separate modules.

### Rule 10 - Test Output Is Required Evidence

Every completion report must include the exact commands run and PASS/FAIL summaries. No command output means the task is not complete.

## Mandatory Validation Matrix

| Area | Required validation | Required proof |
| --- | --- | --- |
| Parent key | Missing parent rejected | `missing_parent` issue + re-query shows no commit |
| Duplicate key | Duplicate business key rejected | `duplicate_key` issue points to entity and fields |
| Effective dates | `exp_dt <= eff_dt` rejected | `invalid_effective_range` issue |
| Overlap | Illegal overlapping active windows rejected | `overlap_effective_range` issue |
| Parent in use | Referenced parent cannot be deleted/deactivated | `parent_in_use` issue + reference count/details |
| Transaction | Mixed valid/invalid batch commits nothing | Re-query all rows in batch |
| Undo/redo | Draft state changes correctly | Store/API payload assertions |
| Expiry filter | Date window is correct | Per-row `exp_dt` assertions |
| Multi-filter | AND across fields, OR within field | Per-row detail assertions |
| PII safety | No sensitive values logged | Test/log review for document IDs/tokens |

## Required Playwright Specs

Create or maintain:

- `e2e/tests/gantt/data-tab-navigation.spec.ts`
- `e2e/tests/gantt/data-tab-crew-expiry.spec.ts`
- `e2e/tests/gantt/data-tab-integrity.spec.ts`
- `e2e/tests/gantt/data-tab-undo-redo.spec.ts`

Minimum commands:

```bash
npx playwright test --config=config/playwright.config.ts tests/gantt/data-tab-navigation.spec.ts --project=gantt --reporter=list
npx playwright test --config=config/playwright.config.ts tests/gantt/data-tab-crew-expiry.spec.ts --project=gantt --reporter=list
npx playwright test --config=config/playwright.config.ts tests/gantt/data-tab-integrity.spec.ts --project=gantt --reporter=list
npx playwright test --config=config/playwright.config.ts tests/gantt/data-tab-undo-redo.spec.ts --project=gantt --reporter=list
```

## Data Discovery Pattern

Before testing a positive filter:

1. Query candidate rows from API/test hook.
2. Choose a value that has at least one row.
3. Apply the filter.
4. Assert filtered count > 0.
5. Assert every row matches.
6. Clear filter.
7. Assert baseline restored or widened.

Pseudocode:

```typescript
const baseline = await dataRows(page, 'crew_base')
const candidate = firstValueWithCount(baseline, 'base')
expect(candidate.count).toBeGreaterThan(0)

await applyCrewFilter(page, { base: candidate.value })

const filtered = await dataRows(page, 'crew_base')
expect(filtered.length).toBeGreaterThan(0)
expect(filtered.every((row) => row.base === candidate.value)).toBe(true)

await clearCrewFilters(page)
const restored = await dataRows(page, 'crew_base')
expect(restored.length).toBeGreaterThanOrEqual(filtered.length)
```

## Server Test Requirements

Backend tests must not depend on the browser. They should directly call service/route behavior and assert:

- Zod parsing rejects invalid DTO shapes.
- Entity allow-list rejects disallowed operational tables.
- Validation returns structured `DataValidationIssue[]`.
- Save is transactional.
- Expiry SQL returns correct windows.
- Cache invalidation is called for changed entity families.

## Completion Checklist

- [ ] TypeScript passes for `gantt`.
- [ ] TypeScript passes for `live-server`.
- [ ] Backend validation tests pass.
- [ ] Playwright Data tab tests pass.
- [ ] Positive filters use discovered or seeded values.
- [ ] Expiry tests assert actual dates.
- [ ] Integrity tests re-query to prove failed saves did not commit.
- [ ] No evidence relies only on visibility or screenshots.
- [ ] No flight/pairing/roster editable pages appear in Data tab.
- [ ] Final report includes command summaries.
