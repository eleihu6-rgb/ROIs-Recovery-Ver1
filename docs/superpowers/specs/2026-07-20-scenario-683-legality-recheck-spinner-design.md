# Scenario 683 Legality Recheck Spinner Fix Design

## Problem

Scenario 683 legality recheck appears to spin forever in the Scenario Gantt UI.

Evidence from the SIT API and database shows the compute path is not actually stuck:

- `POST /api/scenario/683/legality/recheck` returns `COMPUTING`.
- `f8_sit_scenario.legality_status` for scenario 683 is `READY`.
- `f8_sit_scenario.rule_violation` contains persisted violations for scenario 683.
- `GET /api/scenario/683/legality` fails with PostgreSQL `42P01` because the READY read query references `f8_sit_scenario.scenario`, but the scenario metadata table lives in the live schema.

The user-visible spinner persists because the frontend optimistically marks legality as computing, then repeated GET failures do not reliably restore a non-computing state.

## Goals

- Fix the backend READY read path so scenario legality reads scenario metadata from the live schema and violations from the scenario schema.
- Add a regression test that would catch the wrong-schema query.
- Add frontend recovery so a failed recheck poll does not leave the Scenario Gantt UI in an indefinite local computing state.
- Keep the change surgical: no solver, rule-engine, schema, or data migration changes.

## Non-Goals

- Do not change legality compute behavior.
- Do not change persisted violation format.
- Do not change Gantt rendering or alert display behavior except the failed-recheck recovery state.
- Do not alter scenario 683 database rows manually.

## Approaches Considered

### A. Backend-only fix

Change `live-server/src/routes/scenario/legality.ts` so the `bounds` CTE reads `${liveSchema()}.scenario`, while persisted violations still read `${scenarioSchema()}.rule_violation`.

Pros: fixes the root cause with minimal risk.

Cons: future API failures can still look like a long spinner until the existing stuck timeout path kicks in.

### B. Backend fix plus frontend failed-poll recovery

Apply Approach A, and update the Scenario Gantt recheck handler so failed POST or polling errors are reflected in the scenario violation store as a non-computing failed/error state.

Pros: fixes the root cause and prevents this class of API failure from leaving the UI in an indefinite local computing state.

Cons: touches both live-server and gantt, requiring both focused backend tests and frontend type/test verification.

### C. Frontend-only timeout adjustment

Shorten or change the stuck timeout so the button becomes usable earlier.

Pros: smallest frontend-only change.

Cons: does not fix the broken GET API; users still cannot see READY violations for scenario 683.

## Recommended Design

Use Approach B.

Backend data flow:

1. `GET /api/scenario/:id/legality` calls `ensureLegality`.
2. If state is not `READY`, return the status with an empty violation list as today.
3. If state is `READY`, build the display bounds from the live schema `scenario` table.
4. Read persisted violation rows from the scenario schema `rule_violation` table.
5. Return `READY`, `paramsStale`, `computedAt`, and the persisted violation rows.

Frontend data flow:

1. The Recheck button still calls `markRecheckTriggered()` optimistically.
2. It posts `recheckScenarioLegality(scenarioId)`.
3. It polls `pollScenarioLegality(...)` and applies successful responses through the existing `applyScenarioLegalityResponse`.
4. If the POST or poll fails, the scenario violation store is updated to a failed/non-computing state and a notification is shown.

## Test Plan

- Update `live-server/src/__tests__/routes/scenario-legality-window-overlap.test.ts` so it mocks both `liveSchema()` and `scenarioSchema()`.
- The backend regression assertion must verify:
  - the bounds CTE contains `from "f8_sit_live".scenario s`;
  - the violation read still contains `from "f8_sit_scenario".rule_violation rv`;
  - the rolling-window overlap predicates remain intact.
- Add or update a focused frontend test for the Scenario Gantt recheck failure path if an existing unit seam is available.
- Run focused live-server Vitest.
- Run live-server TypeScript check.
- Run focused gantt verification for the touched frontend code.

## Risks

- The backend route uses generated SQL with schema interpolation. The schema helper must remain the only source of schema identifiers.
- If the frontend violation store has no existing action for failed recheck recovery, add the smallest explicit action rather than overloading unrelated state transitions.
- Local tests do not prove the deployed SIT service is fixed until the live-server build is deployed or restarted on SIT.
