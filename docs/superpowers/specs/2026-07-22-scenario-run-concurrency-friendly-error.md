# Scenario Run Concurrency Friendly Error

## Context

SIT can exhaust memory when more than one LegacyRO optimization runs at the same time. The engine-server now supports per-optimizer concurrency limits and returns HTTP 429 when the limit is reached.

Today the Gantt UI already shows a toast on run start failure, but the message can expose the raw engine-server error body:

`engine-server /optimize/start 429: {"detail":"Maximum concurrency limit reached for optimizer LegacyRO: 1"}`

That is technically accurate but not planner-friendly.

## Decision

Normalize engine-server 429 concurrency-limit failures inside live-server before they reach Gantt. Keep the existing Gantt toast path unchanged so the UI displays the normalized message.

User-facing message for LegacyRO limit 1:

`Another optimization is already running. This environment allows 1 LegacyRO optimization at a time. Please wait for the current run to finish.`

For non-concurrency engine-server errors, keep the existing technical error format for debugging.

## Scope

- `live-server/src/services/engine-server-client.ts`
  - Parse JSON or text error bodies from `/api/optimize/start`.
  - Convert HTTP 429 concurrency-limit details into the friendly message.
  - Preserve status metadata on thrown start errors.
- `live-server/src/routes/scenario/scenario.ts`
  - Return the preserved error status where present instead of always converting run-start errors to HTTP 500.
- Focused Vitest coverage for the 429 mapping.

## Out Of Scope

- No frontend layout or toast component changes.
- No queueing UI.
- No change to engine-server concurrency enforcement.
- No SIT runtime patch in this spec.

## Verification

- Run focused live-server tests for `engine-server-client`.
- Run the existing scenario-service focused test if startup-chain behavior is affected.
