# Import PBS Material Progress Chain Runtime Fix Design

Date: 2026-07-15

## Problem

The Import PBS Material dialog can close with "complete" while the visible progress bar never advances through the actual write stage.

The observed Crew import on UAT used:

- `importId`: `2be96b9e-b598-4e69-90e1-8a4d1a872633`
- `syncId`: `34e98bfc-e945-4962-96e6-a3d4f9bb5dc4`
- target schema: `f8_uat_live`
- material: `crew`

The database write succeeded: BullMQ job `connector.crew.inbound:6` completed with `{"entity":"crew","imported":1600,"errors":[]}` and `f8_uat_live.crew` updated 800 distinct crew at `2026-07-15T09:42:18.982Z`.

The progress chain was wrong:

- Redis progress state reached `complete`.
- The connector result returned `queueJobs: []`.
- The actual crew worker job payload had `importId: null`.
- Therefore live-server could not wait for the queued write job, and the worker could not emit `write` running/done events.

Source inspection shows the TypeScript source now contains the intended fixes in the crew-only branch, but the running connector process is `node dist/index.js`, and `connector-server/dist/services/sync/f8/f8-sync-orchestrator.js` is stale:

- explicit-scope crew path in `dist` enqueues without storing `queuedJob`
- crew-only legacy path in `dist` enqueues without storing `queuedJob`
- those stale paths cannot return `queueJobs` or preserve `importId` to the worker

## Goals

1. Make Import PBS Material progress truthful: complete is published only after all selected material write jobs finish.
2. Ensure Crew import emits `fetch`, `transform`, `enqueue`, and `write` stages through SSE.
3. Keep the change surgical: no new progress architecture, no UI redesign, no business-data changes.
4. Add regression coverage for the exact failure: crew import must return queue job ids and propagate `importId`.
5. Verify against the real running UAT path, not source inspection alone.

## Non-Goals

- Do not change F8/NOC transform logic.
- Do not change crew upsert semantics or schema.
- Do not redesign the dialog UI.
- Do not add new Redis channels, job tables, or polling fallbacks.
- Do not touch unrelated import materials unless tests reveal the same stale path.

## Approaches Considered

### Recommended: rebuild/restart stale runtime and add regression checks

Build `connector-server` so `dist` matches current source, restart the running connector process, then run a scoped Crew import smoke check. Add/strengthen tests that assert crew import returns `queueJobs` and includes `importId` on the queued BullMQ job.

Trade-off: this is the smallest real fix, but it depends on a controlled restart of connector-server.

### Alternative: patch only `dist`

Directly edit generated JavaScript under `connector-server/dist`.

Trade-off: fastest for the running process, but unsafe and non-durable. The next build would erase the fix, and it violates the source-of-truth workflow.

### Alternative: add live-server fallback polling

Have live-server infer the worker job from Redis when connector returns `queueJobs: []`.

Trade-off: hides connector contract breakage, adds brittle Redis coupling, and still cannot recover write events if the worker job lacks `importId`.

## Proposed Design

### Connector-server

Use the current source behavior as the intended contract:

- every queued inbound material job created for Import PBS Material carries `importId`
- every queued job is returned in `queueJobs` as `{ material, queueName, jobId }`
- explicit-scope crew and legacy crew-only paths both follow the same contract

If source and dist diverge, build `connector-server` and restart the process that currently runs `node dist/index.js`.

### Live-server

Keep the existing wait path:

- `triggerConnector()` passes `importId` to connector-server
- `triggerConnector()` waits for every returned `queueJobs` item with `waitForQueuedImportJob()`
- background import publishes `complete` only after those waits finish
- workers publish `write` running/done/fail when `data.importId` is present

No live-server source change is expected unless tests show a wait/complete ordering gap.

### Gantt

Keep the existing reducer and SSE consumption:

- stage `running` updates status but not percent
- stage `done` marks the stage complete
- final `complete` sets percent to 100

No UI layout or copy change is expected.

## Testing Plan

Focused automated tests:

- `npm --prefix connector-server test -- src/__tests__/unit/f8-import-progress.test.ts`
  - assert crew import emits ordered stage events
  - assert queued job payload includes `importId`
  - assert result contains `queueJobs`

- `npm --prefix live-server test -- src/__tests__/unit/scenario-import-pbs-material-route.test.ts src/__tests__/unit/import-progress-bus.test.ts src/__tests__/unit/import-progress-write.test.ts`
  - assert background route waits for queued jobs before complete
  - assert progress bus/write helpers publish expected events

- `npm --prefix gantt test -- src/services/__tests__/import-pbs-progress.test.ts src/services/__tests__/import-pbs-material-api.test.ts`
  - assert SSE progress reducer does not jump to complete before terminal event

Runtime verification:

1. Build `connector-server`.
2. Restart connector-server.
3. Trigger a Crew-only Import PBS Material run for `f8_uat_live`.
4. Confirm Redis/SSE events include `crew/write/running` and `crew/write/done`.
5. Confirm final Redis progress state has `type: "complete"` only after BullMQ job `finishedOn`.
6. Confirm `connector.crew.inbound` latest job has non-null `importId` and no failed jobs remain.

## Acceptance Criteria

- The progress bar visibly advances through write progress for Crew import.
- The dialog does not close as complete before the crew worker job finishes.
- The latest `connector.crew.inbound` job payload includes the UI `importId`.
- The connector result includes `queueJobs` for the Crew job.
- No failed or active Crew import jobs remain after completion.
- Tests listed above pass, or any unrun test is explicitly reported with blocker and residual risk.

## Risks

- Restarting connector-server interrupts any currently running import. Before restart, check active BullMQ jobs and avoid restart while active jobs exist.
- Source is already ahead of `dist`; the implementation step must avoid unrelated edits and focus on build/restart plus tests.
- If the running frontend is also stale, the backend fix will be correct but the visible UI may still need a gantt rebuild/restart. Only rebuild gantt if runtime verification shows frontend still consumes events incorrectly.

