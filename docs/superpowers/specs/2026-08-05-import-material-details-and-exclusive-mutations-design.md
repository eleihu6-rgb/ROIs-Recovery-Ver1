# Import PBS Material Details and Exclusive Long-Running Mutations

Date: 2026-08-05
Module: Gantt Scenario import dialog, live-server import orchestration, roster bulk-delete worker
Status: Approved for implementation

## Problem

The Import PBS Material result already carries the worker warning array, but the dialog renders only
the first three errors and first three warnings. The remaining records are replaced by text such as
`3 more details not shown`, which prevents an administrator from diagnosing skipped roster rows such
as `pairing 118557 not found, skipping crew 417` after the dialog is closed.

The import route starts its background orchestration immediately for every request. Two administrators
can therefore trigger connector fetches and live-server writes at the same time. The inbound queues
being configured with worker `concurrency: 1` only serializes jobs within one queue/worker process; it
does not serialize the full import across server instances or coordinate it with the asynchronous
roster bulk-delete worker.

## Goals

- Render every warning and error returned in the import result, in a bounded scrollable detail region.
- Keep the completed result in the open dialog until the user explicitly closes it; do not auto-close or
  replace the detail list with a summary-only toast.
- Reject a second Import PBS Material request immediately while the current long-running data
  mutation is active, with a clear owner/operation message telling the user to retry after it
  finishes.
- Make roster bulk delete use the same exclusive mutation gate, including when the import or delete is
  running in another live-server process.
- Show a clear conflict message before a second operation is created; do not create a hidden queued
  task or start it automatically later.
- Make the conflict message friendly and actionable: explain that the request was not started, name
  the operation currently in progress when available, and tell the user to retry manually after it
  finishes.
- Preserve existing import dependency ordering, progress event history, worker result fields, and
  normal single-record editing behavior.

## Non-goals

- No import-history database table or permanent report storage.
- No change to NOC payloads, pairing/roster business rules, or worker dependency order.
- No serialization of ordinary single-task roster edits unless they are already protected by the
  existing crew/pairing or scenario edit locks.
- No frontend-only lock. The server remains the source of truth for exclusivity.

## Design

### 1. Complete import detail rendering

Keep `ImportPbsMaterialStats.warnings` and `.errors` as the authoritative arrays. Update
`gantt/src/components/scenario/import-pbs-dialog.tsx` so `DetailList` renders all entries instead of
calling `slice(0, 3)`. Put the list in a bounded `overflow-y-auto` region with stable test ids and
explicit error/warning styling. Remove the `more details not shown` fallback; long results remain
fully accessible by scrolling without making the dialog unbounded.

The dialog continues to stay open after a successful or partial import. The toast remains a short
secondary notification only. Closing the dialog intentionally clears the transient result, so the
user-facing guarantee is that all returned detail is visible before close rather than silently
discarded by the UI during completion.

### 2. Shared Redis exclusive mutation lease

Add a small live-server service dedicated to long-running data mutations. The lock key is scoped to
the authenticated live schema, for example `mutation:exclusive:f8`; it is not scoped to a browser tab
or process.

The lease value contains only a random lease token, operation name, owner user code, and acquisition
time. It must not contain the bearer token or other secrets. Acquire uses Redis `SET NX EX`; release
and renewal verify the lease token before changing the key. A short lease with periodic renewal allows
a crashed process to stop blocking the system while covering imports longer than the default HTTP
request timeout.

The service exposes:

- `tryAcquire(schema, operation, userCode)` for an atomic non-blocking attempt.
- `getOwner(schema)` for the conflict response shown to a second user.
- token-checked `renew` and `release` operations.

There is intentionally no wait loop. If acquisition fails, the route returns HTTP `409` with the
current operation and owner user code. This makes the conflict visible immediately and requires the
second user to retry manually after the current operation finishes. Lease loss or an unrecoverable
Redis error fails the operation rather than continuing without exclusivity.

### 3. Import lifecycle

In `runImportPbsMaterialBackground`:

1. Validate the roster period and attempt the shared mutation lease before creating an `importId` or
   starting any background work.
2. If another lease exists, return `409` with a message such as `Another user is importing PBS material
   (owner: lei). Wait for that operation to finish, then try again.` No SSE stream or background task is
   created for the rejected request.
3. Publish `started` after the lease is acquired, then keep the lease renewed for the complete connector
   fetch, transform/enqueue, queued DB writes, and
   result aggregation.
4. Publish `complete` or `error` as today, then release the lease in `finally`.

The frontend catches the structured `409` and shows the conflict as a visible notification. The import
dialog stays available for a manual retry; it does not switch into a progress state for a request that
was never accepted. Existing SSE history replay still works for accepted imports.

### 4. Roster bulk-delete lifecycle

In the roster bulk-delete route, acquire the same shared lease before adding a BullMQ job. If another
operation owns it, return `409` with the same explicit retry message and do not add a job. Pass the
non-secret lease token with the accepted job data; `processRosterBulkDelete` validates/renews that lease
through `rosterService.bulkRemove`, recheck, manday recomputation, and broadcasting, and releases it in
`finally`. If queue submission fails, the route releases the reserved lease. The BullMQ queue continues
to use worker concurrency 1; the distributed lease adds cross-process coordination and cross-operation
coordination without creating a hidden waiter.

The bulk-delete dialog handles the `409` response with a visible notification. Accepted tasks keep the
existing progress behavior; rejected tasks never show a progress bar because no task was created.
Close/delete controls remain disabled while an accepted task is active, as they are today.

The existing Scenario Gantt draft bulk-delete dialog is not part of this server-side path: it mutates
the scenario draft and is already gated by the scenario edit lock. It does not need a second lock.

## Verification

- Gantt component tests: every warning/error is rendered, no truncation marker is shown, and result
  remains present after completion.
- Gantt service/component tests: a `409` conflict is surfaced as a retry notification; existing
  running/complete states remain unchanged.
- Live-server lock service tests: concurrent acquisition, owner conflict, token ownership, renewal,
  and release behavior.
- Live-server import route tests: a second import returns `409`, does not trigger the connector, and
  does not publish an accepted import progress stream.
- Live-server bulk-delete route/worker tests: a conflicting request returns `409` without adding a job;
  an accepted job's lease wraps the full mutation lifecycle.
- Playwright: import result displays all supplied detail lines, a second import shows the conflict
  notification, and a conflicting bulk-delete submission shows the conflict notification without a
  progress task.
- `npm run check:ui` after frontend style changes.

## Risks and mitigations

- A Redis outage can affect all long-running mutations. The operation fails visibly rather than
  silently bypassing the lock.
- A crashed worker can leave a lease until its short expiry. Token-checked renewal and expiry bound
  the stale-lock window; the user retries after expiry.
- Very large warning arrays can produce a large DOM. The bounded scroll region keeps layout stable;
  all entries remain available to the user.
- Existing tests/mock Redis clients may not expose the new lease methods. Add focused service mocks
  rather than weakening production type checks.
