# Scenario Run Empty Scope Precheck Design

## Problem

Scenario optimization currently transitions to RUNNING and starts the engine even when the selected scenario scope has no crew or no pairings. Scenario 669 is one example: its crew filters match zero crew, so the user sees a generic optimization failure instead of a configuration-focused message.

## Desired Behavior

Before starting an RO or TO optimization, live-server should count the exact crew and pairing scopes that the scenario exporter would send to the optimizer.

If the crew scope is empty, the run request should fail before RUNNING with:

`No crew matched the selected scenario scope. Check Crew Filters such as Division, Base, Fleet, and Status before running optimization.`

If the pairing scope is empty, the run request should fail before RUNNING with:

`No pairings matched the selected scenario scope. Check Pairing Filters such as Base, Fleet, Division, and date range before running optimization.`

The scenario should remain in its current status and no engine task should be created.

## Implementation

Add a focused `countScenarioRunScope` helper in `live-server/src/services/scenario/scenario-export-service.ts`. It reuses the existing exporter SQL builders so the precheck and optimizer payload stay aligned.

Call the helper from `scenarioService.run` after loading the scenario and before `transition(..., 'RUNNING', ...)`. Keep the check scoped to RO and TO scenario runs.

## Verification

Add Vitest regression coverage for both empty crew and empty pairing scopes. Each test asserts that `scenarioService.run` rejects with the targeted message, does not transition to RUNNING, and does not call `engineServerClient.startRoTask`.
