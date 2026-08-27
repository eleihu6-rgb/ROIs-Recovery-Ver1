# Import PBS Material Real Stage Progress (Redis + SSE)

Date: 2026-07-15

## Context

Import PBS Material currently blocks on a single synchronous HTTP call:

```
Gantt POST → live-server → connector runF8ImportSync (fetch+transform+enqueue)
         → (rosterGround only) wait BullMQ write
         → final JSON
```

The 2026-07-10 progress pass intentionally shipped **cosmetic** UI feedback only (elapsed timer + static / time-estimated stages). Non-goals at that time: no import job table, no progressive events.

User-visible problems:

1. Axios default 30s aborted long imports (fixed separately with a 30 min client timeout).
2. Progress UI is not backed by backend stages — Confirm can look like “Transforming” immediately, or stages advance by wall-clock guess rather than real work.

Approved product goal: **stage-true progress** over **SSE**, with **Writing only complete after live-server inbound workers finish DB work** for every selected material (not only rosterGround).

## Goals

1. Gantt Import dialog shows the **current real stage** from backend events:
   - Fetching data
   - Transforming data
   - Enqueueing / queue handoff (internal; may map to “Writing database” once enqueue completes, or show as part of pipeline — see UI mapping)
   - Writing database
2. Progress bar advances from **completed stage steps**, not wall-clock fiction.
3. Import remains correct for crew-only and multi-material scopes.
4. Scheduled / admin connector trigger without `importId` keeps existing JSON behavior (no SSE requirement).

## Non-goals

- Persistent import job table / admin job dashboard.
- Chunk-level or record-level percent (NOC page progress).
- Changing F8 fetch chunking, transform business rules, or material scope semantics.
- Replacing the locks WebSocket channel with import traffic.

## Approved approach

**Redis progress bus + live-server SSE subscription (Approach A).**

```
Gantt
  POST /api/scenario/import-pbs-material  → { importId, ...meta }
  GET  /api/scenario/import-pbs-material/:importId/events  (SSE)

live-server
  starts import in background
  forwards connector trigger with importId
  waits for all material queueJobs to finish (write stage)
  publishes write/complete/error
  SSE reader: Redis SUBSCRIBE → text/event-stream

connector-server
  runF8ImportSync(..., { importId? })
  on each material stage: Redis PUBLISH import:progress:{importId}
  returns queueJobs for every enqueued material (not only rosterGround)

live-server inbound workers (crew/flight/pairing/roster/rosterGround/…)
  on job complete/fail for jobs carrying importId: publish write done/fail
```

## Event model

### Redis channel

- Channel: `import:progress:{importId}`
- Message: JSON string (one event per message)
- Optional snapshot key: `import:state:{importId}` (JSON, TTL 1 hour) for late SSE subscribers / reconnect

### Event types

```ts
type ImportMaterial =
  | 'crew'
  | 'flight'
  | 'pairing'
  | 'roster'
  | 'rosterGround'

type ImportStage = 'fetch' | 'transform' | 'enqueue' | 'write'

type ImportProgressEvent =
  | {
      type: 'started'
      importId: string
      rosterPeriodId: number
      rosterPeriod: string
      startDt: string
      endDt: string
      materials: ImportMaterial[]
      at: string // ISO
    }
  | {
      type: 'stage'
      importId: string
      material: ImportMaterial
      stage: ImportStage
      status: 'running' | 'done' | 'fail'
      message?: string
      recordsIn?: number
      recordsOut?: number
      at: string
    }
  | {
      type: 'complete'
      importId: string
      result: ImportPbsMaterialResult // same shape as today’s final success body
      at: string
    }
  | {
      type: 'error'
      importId: string
      message: string
      at: string
    }
```

### Stage ownership

| Stage | Publisher | When |
|-------|-----------|------|
| `fetch` running/done/fail | connector orchestrator | around NOC/chunk fetch for that material |
| `transform` running/done/fail | connector orchestrator | around transform for that material |
| `enqueue` running/done/fail | connector orchestrator | around BullMQ `add`; done includes `queueName` + `jobId` in optional fields if useful for ops logs |
| `write` running | live-server import orchestrator (or worker start) | when waiting on that job, or worker begins processing job with `importId` |
| `write` done/fail | live-server inbound worker | job return / failure for job whose payload includes `importId` |

All selected materials must emit the four stages. Materials not selected are omitted from the step denominator.

### UI stage mapping

Dialog keeps three user-facing labels (English):

1. **Fetching data** — active while any selected material has incomplete `fetch`, or the earliest incomplete stage is `fetch`.
2. **Transforming data** — active when all fetches done and any `transform` incomplete (or earliest incomplete is `transform`).
3. **Writing database** — active when all transforms done and any `enqueue` or `write` incomplete.

Rationale: users already know three labels; enqueue is infrastructure handoff and belongs under Writing once fetch/transform are done. Internal events still use four stages for accuracy.

### Progress percent

```
percent = floor(100 * completedStepCount / max(1, materials.length * 4))
```

- A step is completed when that material’s stage has `status: 'done'`.
- Cap display at 99 until `complete` event, then 100.
- Do **not** interpolate by elapsed time when real events are flowing.
- Fallback only if SSE disconnects without error: show last known stage + “Reconnecting…” (optional follow-up; not required for v1 if complete fails hard).

## API changes

### `POST /api/scenario/import-pbs-material`

**Request (unchanged body):**

```ts
{ rosterPeriodId: number, scope: { flight, pairing, roster, rosterGround, crew } }
```

**Response (changed):** return immediately after validation + job start:

```ts
{
  importId: string
  rosterPeriodId: number
  rosterPeriod: string
  startDt: string
  endDt: string
  materials: ImportMaterial[]
}
```

Background work:

1. Publish `started`.
2. Trigger connector(s) with `importId` (+ existing scope + dates).
3. Collect all `queueJobs` from connector results.
4. Wait for each job (same BullMQ wait pattern as rosterGround today; timeout still 30 min per job or shared budget).
5. Publish `write` done if worker did not (defensive), then `complete` or `error`.

Auth: admin only (unchanged).

### `GET /api/scenario/import-pbs-material/:importId/events`

- Auth: admin + same session/token rules as other scenario routes.
- Response: `Content-Type: text/event-stream`.
- On connect: optionally emit last snapshot from `import:state:{importId}` if present.
- Stream Redis messages for `import:progress:{importId}` as SSE `data: {json}\n\n`.
- Heartbeat comment every 15s to keep proxies open.
- Close stream after `complete` or `error` (and a short grace flush).

### Connector trigger

- Accept optional query/body `importId`.
- Pass into `runF8ImportSync`.
- When `importId` is set:
  - Publish stage events for each material path in explicit scope and legacy connector-code paths used by import proxy.
  - Return `queueJobs` for **every** enqueued inbound job (crew, flight, pairing, roster, rosterGround), not only rosterGround.
- When `importId` is absent: no publish; keep today’s response shape (additive `queueJobs` expansion is OK).

### Job payload

Inbound jobs already carry `syncId`. Add optional:

```ts
importId?: string
```

Workers check `importId` and publish write terminal events. Jobs without `importId` behave as today.

## Frontend

### Service

1. `importPbsMaterial(input)` → POST, receives `importId` (not final result).
2. Open `EventSource` (or fetch-stream if auth header required — prefer cookie/Bearer pattern already used by gantt; if EventSource cannot send Authorization, use `fetch` + `ReadableStream` SSE parser with the shared `api` auth).
3. Map events into dialog state: current headline stage, per-stage active flags, percent, error.
4. On `complete`: success toast (reuse timing summary from `result` if present), close dialog.
5. On `error`: error toast with elapsed, stop importing state.
6. Keep long client timeout only for POST start + SSE lifetime (SSE should not use 30s axios default).

### Dialog

- Remove wall-clock `resolveImportProgress` as the source of truth.
- Keep elapsed timer (still useful).
- Progress bar width = real percent from events.
- Stage labels use `data-active` from mapped earliest incomplete user-facing stage.

## Failure handling

| Failure | Behavior |
|---------|----------|
| RP / scope validation | POST 4xx; no importId |
| Connector missing / trigger fail | `error` event; SSE ends; toast |
| Stage fail mid-material | `stage` fail + overall `error`; cancel remaining waits where safe |
| Worker fail | `write` fail + `error` |
| Client disconnects SSE | background import continues; user can re-open dialog only by new import (v1 no resume UI) |
| Redis down | fail import start with clear message |

## Security

- `importId` is a random UUID; SSE requires admin auth.
- Do not put secrets in progress payloads.
- TTL state keys so channels cannot grow unbounded.

## Testing

### connector-server

- Unit: with `importId`, orchestrator emits fetch/transform/enqueue for crew-only path in order.
- Unit: without `importId`, no publish calls.
- Unit: `queueJobs` includes crew job when crew imported.

### live-server

- Unit: POST returns `importId` without waiting for connector finish (mock background).
- Unit: SSE route streams published events (mock redis).
- Unit: wait loop covers all queueJobs materials.
- Unit: worker publish on write complete when `importId` present.

### gantt

- Unit: progress state machine maps events → headline stage + percent.
- Unit: dialog starts at Fetching only after `stage fetch running` (or `started` then idle until first stage).
- E2E (mock SSE or route): Confirm → progress shows Fetching with `data-active=true` on fetch; inject transform/write events; assert labels; complete closes dialog.

### Verification commands

```bash
npm --prefix connector-server test -- f8-sync
npm --prefix live-server test -- import-pbs-material
npm --prefix gantt test -- import-pbs
npx playwright test e2e/tests/gantt/scenario-toolbar-buttons.spec.ts  # when env available
npm run check:ui
```

## Rollout / compatibility

1. Ship connector publish + expanded `queueJobs` first (backward compatible).
2. Ship live-server async POST + SSE + wait-all + worker write events.
3. Ship gantt consumer; remove fake stage resolver.

Old gantt against new live-server: POST shape changes — **breaking for that one endpoint**. Acceptable: single SPA deploy with live-server. Document in release notes.

## Open decisions (resolved)

| Question | Decision |
|----------|----------|
| Progress fidelity | Stage-true (not chunk percent) |
| Transport | SSE on live-server import events route |
| Architecture | Redis bus + SSE |
| Writing complete | Wait for DB inbound workers for all selected materials |

## Implementation order (for writing-plans)

1. Shared event type + Redis channel helpers (live-server + connector; minimal duplication).
2. Connector: stage publish + full `queueJobs` + `importId` on jobs.
3. live-server workers: write terminal publish.
4. live-server import route: async start + wait-all + SSE.
5. gantt API + dialog real progress.
6. Tests + remove cosmetic `resolveImportProgress` timeline.
