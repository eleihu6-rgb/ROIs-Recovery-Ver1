# Overall Regression Test Rules And Findings - enhance-Ver5

Timestamp: 2026-06-05 19:52:28 America/Vancouver

Scope: entire project automated/manual regression inventory, with specific focus on `/fpqe/pbs` PBS Portal and Gantt query/filter coverage.

## Current Inventory

| Area | Test files | Automated cases | Notes |
|------|------------|-----------------|-------|
| PBS Portal unit/component/service | 58 | 405 | Strong mocked coverage for pairing, days-off, line, reserve, tier, dashboard, routing, shared services. |
| PBS Server | 42 | 379 | Service, route, script, cache, validation, and export tests. |
| Gantt unit | 8 | 73 | Store/util/API coverage only; browser coverage is under `e2e/tests/gantt`. |
| Live Server | 30 | 211 | Service, worker, plugin, scenario, Gantt data, crew, pairing, flight tests. |
| Connector Server | 15 | 101 | Transform, crypto, registry, lookup, inbound post, metrics tests. |
| AI Server | 15 | 93 | Regression store/routes/importer plus AI client/config tests. |
| PO Engine | 11 | 62 | Python pytest cases discovered under `po-engine`. |
| RO Engine | 9 | 69 | Python pytest cases discovered under `ro-engine`. |
| Rule Engine | 25 | 162 | TypeScript rule-engine tests discovered in this pass. |
| Browser E2E total | 53 | 131 | Playwright declaration count: 116 Gantt, 11 PBS Portal, 2 PBS App, 2 perf/header cases. |
| Gantt Regression tab catalog | n/a | 107 | The UI total at `/fpqe/gantt/` is 106 runnable catalog entries plus 1 manual case from `ai-server/regression_tests.json`. |
| Shared packages | 0 | 0 | No discovered package-local test files in this pass. |
| Manual QA docs | 45 | n/a | 41 under `docs/test-cases/pbs`, 2 `pbs-portal`, 1 `gantt`, 1 `e2e`. |

Count note: the Gantt Regression tab does not count every Playwright declaration in the repo. Its importer scans only top-level `e2e/tests/gantt/*.spec.ts`, stores unique `(spec_file, test_name)` pairs, and also includes manual cases. Current breakdown: 116 Gantt Playwright declarations in all `e2e/tests/gantt`, 109 top-level declarations, 106 unique top-level runnable catalog entries because `other-bindings.spec.ts` repeats three titles, and 1 manual catalog entry, so the UI total of 107 is accurate for that catalog.

## Top-Tier Query/Filter Test Rules

These rules should be treated as the project test-case skill for query/filter regression. They extend `docs/test-cases/gantt/anti-illusion-rules.md` to the whole project.

1. Every positive filter test must validate data existence before using a value. Do not hard-code `BKK`, `YEG`, `YVR`, `YYZ`, base, rank, fleet, or coverage values unless the seed fixture guarantees them.
2. A filter test only passes when matching result data is shown and every displayed row/object can be checked against the selected filter. Visibility-only checks are not enough.
3. Query coverage must include all query sub-tabs/views required by the feature: Roster, Pairing, and Flight.
4. The minimum filter matrix is base, rank, fleet, and coverage status. Coverage must include all meaningful states: all, partial, open, plus any app-specific equivalent labels.
5. Apply and clear/disable are one scenario. Capture baseline count/visible IDs, apply filter, assert narrowed matching result, clear/disable filter, then assert the view returns to baseline or loads a larger unfiltered Gantt set.
6. Empty-result behavior is a separate negative case. If `BKK` has no crew in the current dataset, the positive test must select another real base; a `BKK` case can only assert the explicit empty state.
7. Dataset-dependent tests must use one of two strategies: seed a deterministic fixture or preflight-discover valid values through API/DB/UI before the test body.
8. Any generated/manual test case must state its data preconditions and validation method. Wording like "there is at least one matching pairing" is not enough without naming how it is verified.
9. Tests on Canvas/Gantt must read `window.__ganttTest` truth (`counts`, `render`, `ready`, object lists) instead of relying on pixels or pane visibility.
10. Tests that use AI actions must assert both the command/action state and the resulting business data, unless explicitly labeled as an AI dispatch-only unit.

## Required Top-Tier Scenario For Filter Example 1076

No literal `1076` test case or filter ID was found in the searched automated and docs paths. Treat `1076` as the required example case to add or rewrite.

| Case | Requirement |
|------|-------------|
| TC-1076-01 preflight | Discover valid base, rank, fleet, and coverage values with positive counts for Roster, Pairing, and Flight. |
| TC-1076-02 roster | Apply base/rank/fleet/coverage filters on Roster and assert matching roster rows/objects are shown. |
| TC-1076-03 pairing | Apply the same matrix on Pairing and assert matching pairing objects/results are shown. |
| TC-1076-04 flight | Apply the same matrix on Flight and assert matching flight objects/results are shown. |
| TC-1076-05 clear | Disable/clear each filter and assert the original status returns or the Gantt loads a larger unfiltered set. |
| TC-1076-06 empty | Use a known missing value only to assert the empty-result state; do not mix this with positive matching-result cases. |

## Dataset Rule For Case #1002 / BKK

I did not find a current automated PBS Portal `#1002` case that filters crew to `BKK`. I did find the same risk pattern in Gantt AI and regression examples: `e2e/tests/gantt/ai-chat.spec.ts` stubs an AI action to `bases: ['BKK']` and verifies the filter store/chip, but it does not prove the roster has matching BKK crew. If the current dataset has no BKK-base crew, a positive "filters crew to BKK" test is invalid.

Correct handling:

| Situation | Correct test behavior |
|-----------|-----------------------|
| BKK crew count > 0 | Use BKK as a positive case and assert every shown crew row/object has base BKK. |
| BKK crew count = 0 | Use BKK only as a negative empty-state case, or dynamically choose a base with count > 0 for the positive case. |
| BKK is a product requirement | Seed a deterministic BKK crew fixture before the test and verify the fixture exists before filtering. |

## Findings

| ID | Category | Finding | Evidence | Proposed change | Impact | Effort | Risk / Verification |
|----|----------|---------|----------|-----------------|--------|--------|---------------------|
| T-001 | Coverage | PBS Portal browser E2E has only auth/smoke/schedule cases and no Roster/Pairing/Flight query-filter matrix. | `e2e/tests/pbs-portal` has 3 files and 11 tests; none covers base/rank/fleet/coverage filters across Roster, Pairing, and Flight. | Add a PBS Portal E2E suite for the TC-1076 matrix using preflight-discovered data. | High: PBS Portal has 405 lower-level tests but almost no real browser workflow proof. | M | Could be flaky if data is not deterministic; verify by seeding or preflight-selecting values. |
| T-002 | Quality | `e2e/tests/pbs-portal/schedule.spec.ts` is too shallow for business regression and appears legacy against current routes. | It goes through `PbsPortalDashboardPage`, checks `pairingList` visibility, then clicks the first `[data-testid^="pairing-"]`; no semantic match assertion or current `/pairing`/`/pairing/search` workflow coverage. | Replace with current-route business E2E cases for dashboard, pairing, pairing search, and bid actions. | High: gives false confidence for PBS Portal workflows. | M | Route selectors may need updates; verify by running only PBS Portal E2E first. |
| T-003 | Coverage | No existing automated case satisfies the full requested filter behavior: query, matching result, disable filter, restore/load-more. | Gantt has strong partial tests (`query-filter`, `pane-count-badges`, `multi-step-workflow`), but no single suite covers all Roster/Pairing/Flight tabs and the full base/rank/fleet/coverage matrix. | Create one cross-pane matrix suite and reuse data preflight/helpers. | High: this is exactly the user-visible regression risk for large Gantt/PBS filtering. | M | May lengthen E2E runtime; verify with per-case timings and split by tab if needed. |
| T-004 | Quality | Hard-coded data values can turn positive cases into false positives or invalid failures. | `ai-chat.spec.ts` hard-codes BKK as an AI filter action; `query-filter.spec.ts` hard-codes YVR/YYZ; `pane-filter-button.spec.ts` and `pane-count-badges.spec.ts` hard-code YEG. | Add a rule that every hard-coded positive value must be seeded or preflight-validated; otherwise choose values dynamically. | High: directly addresses the "no BKK base crew" problem. | S | Dynamic values can hide specific-value regressions; verify by keeping separate fixed-fixture tests for required values. |
| T-005 | Coverage | PBS Portal unit/component coverage is high, but it does not validate real current dataset behavior. | `pbs-portal/src` has 405 cases, including 143 pairing feature cases, but these are mocked component/service tests rather than browser tests against real or seeded data. | Keep these tests, but add dataset-aware E2E for high-risk workflows: pairing search, bid preview, dashboard calendar, tier summary, days off, line, reserve. | Medium: unit tests catch logic regressions but not integration/data mismatch. | M | More E2E can be slower; verify by tagging smoke vs full regression. |
| T-006 | Coverage | Confirmed too-simple or not-business-relevant browser cases are at least 15 of 131 E2E cases. | 11 PBS Portal E2E are auth/smoke/schedule only; 2 PBS App E2E are home/schedule smoke; 2 perf/header E2E are infrastructure checks, not product workflow regressions. | Reclassify these as smoke/infra tests and do not count them as business regression coverage. | Medium: prevents reporting smoke tests as coverage for query/filter workflows. | S | Classification may affect dashboards; verify test tags/report grouping. |
| T-007 | Coverage | Shared packages have no discovered package-local tests. | `packages` returned zero discovered test files in this pass; engines and AI server do have tests and are now counted in the inventory. | Add or document package-local test strategy before relying on shared packages in regression claims. | Medium: gaps may be intentional, but should be explicit. | M | Test scaffolding can change CI time; verify with module-specific commands. |
| T-008 | Quality | Manual PBS test docs often use loose prerequisites instead of executable data validation. | Several docs state prerequisites such as current draft has Pairing bid or API can return results, but do not define how to prove the data exists before execution. | Add a "Data Validation" section to manual cases with API/DB/UI preflight steps and expected counts. | Medium: reduces manual test ambiguity. | S | Docs may become stale if endpoints change; verify during QA runs. |

## Too-Simple Case Summary

| Scope | Count | Meaning |
|-------|-------|---------|
| Full automated repo | 1,687 cases | Total discovered automated test definitions across app, server, AI server, engines, and E2E. |
| Browser E2E | 131 cases | Only browser-level Playwright declarations counted for user-facing workflows. |
| Gantt browser E2E | 116 cases | All Playwright declarations under `e2e/tests/gantt`, including nested help specs. |
| Gantt Regression tab catalog | 107 cases | 106 unique runnable top-level Gantt catalog entries plus 1 manual case; this matches the UI total. |
| PBS Portal E2E | 11 / 11 too shallow for requested query/filter coverage | Useful as auth/smoke only; not enough for PBS Portal business regression. |
| PBS App E2E | 2 / 2 smoke only | Not current dataset or workflow regression coverage. |
| Perf/header E2E | 2 / 2 infra-only | Useful infrastructure checks, not product business regression. |
| Current top-tier query/filter coverage | 0 complete cases | No case covers all required tabs, dimensions, matching results, and clear/restore behavior. |

## Five-Line Summary

First, add a dataset-preflight rule so hard-coded values like BKK cannot be used as positive cases unless matching data exists.
Second, build TC-1076 as the canonical top-tier query/filter regression across Roster, Pairing, Flight, base, rank, fleet, and coverage states.
Third, stop counting PBS Portal auth/smoke E2E as business regression coverage; it currently has 11 browser cases but none meet the required filter matrix.
Fourth, keep the 405 PBS Portal unit/component cases, but add dataset-aware browser coverage for the critical user workflows.
Fifth, update manual test docs with explicit data validation steps before each dataset-dependent scenario.
