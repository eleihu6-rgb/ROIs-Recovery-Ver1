# Import PBS Material Real Stage Progress (Redis + SSE) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace cosmetic Import PBS Material progress with stage-true events published over Redis and streamed to gantt via live-server SSE, with Writing complete only after inbound DB workers finish for every selected material.

**Architecture:** Connector and live-server workers publish `ImportProgressEvent` JSON to Redis channel `import:progress:{importId}` (use **BULLMQ_REDIS_URL** so both services share the same bus as the queues). live-server `POST` returns `{ importId, materials, … }` immediately and runs import in the background; `GET …/:importId/events` SSE-subscribes and forwards events. Gantt POSTs, then consumes SSE with Bearer auth via `fetch`+stream (not bare `EventSource`). Progress percent = completed `(material × 4 stages)` steps; UI maps to three labels (Fetching / Transforming / Writing).

**Tech Stack:** Fastify, `redis` package (node-redis), BullMQ, React, axios, Vitest, Playwright

**Spec:** `docs/superpowers/specs/2026-07-15-import-pbs-material-real-progress-sse-design.md`

---

## File map

| Path | Responsibility |
|------|----------------|
| `live-server/src/types/import-progress.ts` | Shared event types + channel/key helpers (copy same shapes into connector) |
| `connector-server/src/types/import-progress.ts` | Same event types (duplicated intentionally; no monorepo package for this yet — keep files in sync) |
| `live-server/src/utils/import-progress-bus.ts` | Publish + snapshot on BULLMQ redis |
| `connector-server/src/utils/import-progress-bus.ts` | Publish + snapshot on BULLMQ redis |
| `connector-server/src/services/sync/f8/f8-sync-orchestrator.ts` | Stage events + full `queueJobs` + `importId` on jobs |
| `connector-server/src/routes/admin/connector.ts` | Pass `importId` into orchestrator |
| `connector-server/src/types/import-jobs.ts` (+ live-server mirror) | `importId?: string` on `ImportJobMeta` |
| `live-server/src/workers/*-inbound-worker.ts` | Publish `write` done/fail when job has `importId` |
| `live-server/src/routes/scenario/import-pbs-material.ts` | Async POST + SSE GET + wait all jobs |
| `gantt/src/services/import-pbs-material-api.ts` | POST start + SSE consume + progress reducer |
| `gantt/src/components/scenario/import-pbs-dialog.tsx` | Real progress props (no wall-clock stage guess) |
| `gantt/src/components/scenario/scenario-list-panel.tsx` | Wire start+SSE into confirm handler |
| Tests under each package + e2e Scen-2035 update | |

**Redis rule:** Always use `BULLMQ_REDIS_URL` (falls back to `REDIS_URL`) for progress pub/sub so connector publishers and live-server workers/SSE share one bus.

---

### Task 1: Progress event types + Redis bus (both servers)

**Files:**
- Create: `live-server/src/types/import-progress.ts`
- Create: `live-server/src/utils/import-progress-bus.ts`
- Create: `connector-server/src/types/import-progress.ts` (identical types)
- Create: `connector-server/src/utils/import-progress-bus.ts`
- Create: `live-server/src/__tests__/unit/import-progress-bus.test.ts`
- Create: `connector-server/src/__tests__/unit/import-progress-bus.test.ts` (optional mirror; one package is enough if timeboxed — prefer live-server unit)

- [ ] **Step 1: Add types**

```ts
// live-server/src/types/import-progress.ts
export type ImportMaterial = 'crew' | 'flight' | 'pairing' | 'roster' | 'rosterGround'
export type ImportStage = 'fetch' | 'transform' | 'enqueue' | 'write'

export type ImportProgressEvent =
  | {
      type: 'started'
      importId: string
      rosterPeriodId: number
      rosterPeriod: string
      startDt: string
      endDt: string
      materials: ImportMaterial[]
      at: string
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
      result: unknown
      at: string
    }
  | {
      type: 'error'
      importId: string
      message: string
      at: string
    }

export const importProgressChannel = (importId: string): string =>
  `import:progress:${importId}`

export const importProgressStateKey = (importId: string): string =>
  `import:state:${importId}`

export const IMPORT_PROGRESS_STATE_TTL_SEC = 60 * 60
```

Copy the same file to `connector-server/src/types/import-progress.ts`.

- [ ] **Step 2: Add bus helper (live-server)**

Use node-redis against BULLMQ URL (create ephemeral client or reuse a dedicated publisher client created from `env.BULLMQ_REDIS_URL`). Pattern:

```ts
// live-server/src/utils/import-progress-bus.ts
import { createClient, type RedisClientType } from 'redis'
import { env } from '../config/index.js'
import {
  IMPORT_PROGRESS_STATE_TTL_SEC,
  importProgressChannel,
  importProgressStateKey,
  type ImportProgressEvent,
} from '../types/import-progress.js'

let publisher: RedisClientType | null = null

const getPublisher = async (): Promise<RedisClientType> => {
  if (publisher?.isOpen) return publisher
  publisher = createClient({ url: env.BULLMQ_REDIS_URL }) as RedisClientType
  publisher.on('error', () => undefined)
  await publisher.connect()
  return publisher
}

export const publishImportProgress = async (event: ImportProgressEvent): Promise<void> => {
  const client = await getPublisher()
  const channel = importProgressChannel(event.importId)
  const payload = JSON.stringify(event)
  await client.publish(channel, payload)
  await client.set(importProgressStateKey(event.importId), payload, {
    EX: IMPORT_PROGRESS_STATE_TTL_SEC,
  })
}

export const readImportProgressSnapshot = async (
  importId: string,
): Promise<ImportProgressEvent | null> => {
  const client = await getPublisher()
  const raw = await client.get(importProgressStateKey(importId))
  if (!raw) return null
  try {
    return JSON.parse(raw) as ImportProgressEvent
  } catch {
    return null
  }
}
```

Mirror in connector-server with its `env.BULLMQ_REDIS_URL`.

- [ ] **Step 3: Unit test channel helpers + publish shape (mock redis)**

```ts
// live-server/src/__tests__/unit/import-progress-bus.test.ts
import { describe, expect, it } from 'vitest'
import { importProgressChannel, importProgressStateKey } from '../../types/import-progress.js'

describe('import progress keys', () => {
  it('builds stable channel and state keys', () => {
    expect(importProgressChannel('abc')).toBe('import:progress:abc')
    expect(importProgressStateKey('abc')).toBe('import:state:abc')
  })
})
```

- [ ] **Step 4: Run test**

```bash
npm --prefix live-server test -- src/__tests__/unit/import-progress-bus.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add live-server/src/types/import-progress.ts live-server/src/utils/import-progress-bus.ts \
  live-server/src/__tests__/unit/import-progress-bus.test.ts \
  connector-server/src/types/import-progress.ts connector-server/src/utils/import-progress-bus.ts
git commit -m "feat: add import progress Redis bus helpers"
```

---

### Task 2: Connector stage events + full queueJobs + importId

**Files:**
- Modify: `connector-server/src/types/import-jobs.ts` — add `importId?: string` to `ImportJobMeta`
- Modify: `live-server/src/types/import-jobs.ts` — same field
- Modify: `connector-server/src/services/sync/f8/f8-sync-orchestrator.ts`
- Modify: `connector-server/src/routes/admin/connector.ts`
- Create: `connector-server/src/__tests__/unit/f8-import-progress.test.ts`

- [ ] **Step 1: Extend job meta**

```ts
export interface ImportJobMeta {
  syncId: string
  filiale: string
  syncRangeDt: [string, string]
  importId?: string
}
```

Both servers.

- [ ] **Step 2: Orchestrator API**

Change signature to accept optional progress context:

```ts
export async function runF8ImportSync(
  fastify: FastifyInstance,
  config: ConnectorConfig,
  overrideStartDt?: string,
  overrideEndDt?: string,
  scope?: F8ImportScope,
  importId?: string,
): Promise<F8ImportSyncResult>
```

Add helper inside the file:

```ts
const emitStage = async (
  importId: string | undefined,
  material: ImportMaterial,
  stage: ImportStage,
  status: 'running' | 'done' | 'fail',
  extra?: Partial<Extract<ImportProgressEvent, { type: 'stage' }>>,
) => {
  if (!importId) return
  await publishImportProgress({
    type: 'stage',
    importId,
    material,
    stage,
    status,
    at: new Date().toISOString(),
    ...extra,
  })
}
```

Wrap each material path (crew example in explicit scope):

```ts
if (scope.crew) {
  await emitStage(importId, 'crew', 'fetch', 'running')
  // existing fetchChunked...
  await emitStage(importId, 'crew', 'fetch', 'done', { recordsIn: rawCrew.length })
  await emitStage(importId, 'crew', 'transform', 'running')
  const crewRecords = transformF8Crew(rawCrew, filiale)
  await emitStage(importId, 'crew', 'transform', 'done', { recordsOut: crewRecords.length })
  await emitStage(importId, 'crew', 'enqueue', 'running')
  const crewJob: CrewImportJob = { ...meta, importId, records: crewRecords }
  const queued = await fastify.queues.crewInbound.add('crew-import', crewJob, jobOpts)
  await emitStage(importId, 'crew', 'enqueue', 'done')
  if (queued.id) {
    queueJobs.push({
      material: 'crew',
      queueName: 'connector.crew.inbound',
      jobId: String(queued.id),
    })
  }
}
```

Repeat for flight / pairing / roster / rosterGround in **both** explicit-scope and legacy connector-code branches used by live-server triggers (`f8-crew`, `f8-flight`, `f8-pairing`, `f8-roster-flight`).

On throw inside a material path: `emitStage(..., 'fail', { message })` then rethrow.

- [ ] **Step 3: Admin route passes importId**

```ts
const importId = query?.importId
syncResult = await runF8ImportSync(
  fastify, c, overrideStartDt, overrideEndDt, scopeParse.data, importId,
)
```

- [ ] **Step 4: Unit test with mocks**

Mock `publishImportProgress`, mock queues `.add` returning `{ id: '1' }`, mock fetch/transform helpers as needed — or spy at bus level and stub `fetchChunked` via module mock. Minimal assertion:

```ts
it('emits fetch/transform/enqueue for crew when importId set and returns queueJobs', async () => {
  // arrange orchestrator with stubs so crew path runs
  // assert publish order: fetch running, fetch done, transform running, transform done, enqueue running, enqueue done
  // assert result.queueJobs contains material crew
})

it('does not publish when importId omitted', async () => {
  // assert publish not called
})
```

- [ ] **Step 5: Run tests**

```bash
npm --prefix connector-server test -- f8-import-progress
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git commit -m "feat(connector): publish import stage progress and return all queueJobs"
```

---

### Task 3: live-server workers publish write terminal events

**Files:**
- Modify: `live-server/src/workers/crew-inbound-worker.ts`
- Modify: `live-server/src/workers/flight-inbound-worker.ts`
- Modify: `live-server/src/workers/pairing-inbound-worker.ts`
- Modify: `live-server/src/workers/roster-inbound-worker.ts`
- Modify: `live-server/src/workers/roster-ground-inbound-worker.ts`
- Create: `live-server/src/utils/import-progress-write.ts` (shared helper)
- Create: `live-server/src/__tests__/unit/import-progress-write.test.ts`

- [ ] **Step 1: Shared helper**

```ts
// live-server/src/utils/import-progress-write.ts
import { publishImportProgress } from './import-progress-bus.js'
import type { ImportMaterial } from '../types/import-progress.js'

export const publishWriteTerminal = async (
  importId: string | undefined,
  material: ImportMaterial,
  status: 'done' | 'fail',
  message?: string,
): Promise<void> => {
  if (!importId) return
  await publishImportProgress({
    type: 'stage',
    importId,
    material,
    stage: 'write',
    status,
    message,
    at: new Date().toISOString(),
  })
}
```

- [ ] **Step 2: Wire each worker**

Crew pattern:

```ts
async (job) => {
  const data = job.data as CrewImportJob
  try {
    if (data.importId) {
      await publishImportProgress({
        type: 'stage',
        importId: data.importId,
        material: 'crew',
        stage: 'write',
        status: 'running',
        at: new Date().toISOString(),
      })
    }
    const result = await processCrewImportJob(data, fastify.db)
    await publishWriteTerminal(data.importId, 'crew', 'done')
    return result
  } catch (err) {
    await publishWriteTerminal(
      data.importId,
      'crew',
      'fail',
      err instanceof Error ? err.message : String(err),
    )
    throw err
  }
}
```

Same for other materials with correct `material` string.

- [ ] **Step 3: Unit test helper**

Mock `publishImportProgress`; assert no-op without importId; assert payload with importId.

- [ ] **Step 4: Run + commit**

```bash
npm --prefix live-server test -- import-progress-write
git commit -m "feat(live-server): publish write stage on inbound import jobs"
```

---

### Task 4: live-server async POST + SSE + wait all jobs

**Files:**
- Modify: `live-server/src/routes/scenario/import-pbs-material.ts`
- Modify: `live-server/src/__tests__/unit/scenario-import-pbs-material-route.test.ts`

- [ ] **Step 1: Rewrite POST to return importId immediately**

After RP validation:

```ts
const importId = randomUUID()
const materials: ImportMaterial[] = []
if (scope.crew) materials.push('crew')
if (scope.flight) materials.push('flight')
// ... etc for pairing, roster, rosterGround

// fire-and-forget background (do not await full import before reply)
void runImportPbsMaterialBackground({
  importId,
  requestAuth: bearerHeader(request),
  materials,
  filiale,
  startDt,
  endDt,
  rosterPeriodId: Number(row.id),
  rosterPeriod: row.roster_period,
  scope,
  log: fastify.log,
}).catch((err) => {
  fastify.log.error({ err, importId }, 'background import failed')
})

return success(reply, {
  importId,
  rosterPeriodId: Number(row.id),
  rosterPeriod: row.roster_period,
  startDt,
  endDt,
  materials,
})
```

Background function:

1. `publishImportProgress({ type: 'started', ... })`
2. For each selected connector trigger: add `importId` query param.
3. Collect `queueJobs` from all results.
4. For each job: publish write running (if not already), `waitForQueuedImportJob` (all materials, not only rosterGround).
5. Build final `result` object (same shape as old success body).
6. `publishImportProgress({ type: 'complete', result })` or `error`.

Update `triggerConnector` to pass `importId` in query string.

- [ ] **Step 2: SSE route**

```ts
fastify.get('/import-pbs-material/:importId/events', async (request, reply) => {
  if (!request.authUser?.isAdmin) return error(reply, 403, 'Admin access required')
  const { importId } = request.params as { importId: string }
  if (!/^[0-9a-f-]{36}$/i.test(importId)) return fail(reply, 400, 'Invalid importId')

  reply.hijack()
  reply.raw.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
  })

  const writeEvent = (data: unknown) => {
    reply.raw.write(`data: ${JSON.stringify(data)}\n\n`)
  }

  const snapshot = await readImportProgressSnapshot(importId)
  if (snapshot) writeEvent(snapshot)

  const sub = createClient({ url: env.BULLMQ_REDIS_URL })
  await sub.connect()
  const channel = importProgressChannel(importId)

  const onMessage = (message: string) => {
    reply.raw.write(`data: ${message}\n\n`)
    try {
      const parsed = JSON.parse(message) as { type?: string }
      if (parsed.type === 'complete' || parsed.type === 'error') {
        cleanup()
      }
    } catch { /* ignore */ }
  }

  await sub.subscribe(channel, onMessage)
  const heartbeat = setInterval(() => {
    reply.raw.write(': heartbeat\n\n')
  }, 15_000)

  const cleanup = () => {
    clearInterval(heartbeat)
    void sub.unsubscribe(channel).finally(() => void sub.quit())
    if (!reply.raw.writableEnded) reply.raw.end()
  }

  request.raw.on('close', cleanup)
})
```

(Adjust subscribe API to node-redis v4 style used in the repo.)

- [ ] **Step 3: Update unit tests**

- POST with mocked background: response has `importId`, does not require connector finish before 200.
- Wait loop: all queueJobs waited (spy `Job.fromId` / Queue).
- Optional: SSE harder to unit-test; prefer integration-style mock of `reply.raw`.

- [ ] **Step 4: Run + commit**

```bash
npm --prefix live-server test -- scenario-import-pbs-material
git commit -m "feat(live-server): async Import PBS material with SSE progress"
```

---

### Task 5: Gantt progress reducer + API SSE client

**Files:**
- Modify: `gantt/src/services/import-pbs-material-api.ts`
- Create: `gantt/src/services/import-pbs-progress.ts` (pure reducer — easy unit tests)
- Create: `gantt/src/services/__tests__/import-pbs-progress.test.ts`
- Modify: `gantt/src/services/__tests__/import-pbs-material-api.test.ts`

- [ ] **Step 1: Pure reducer**

```ts
// gantt/src/services/import-pbs-progress.ts
export type UiStage = 'fetch' | 'transform' | 'write'

export interface ImportProgressState {
  materials: string[]
  // material -> stage -> done?
  done: Record<string, Partial<Record<'fetch'|'transform'|'enqueue'|'write', boolean>>>
  headline: UiStage
  percent: number
  status: 'idle' | 'running' | 'complete' | 'error'
  errorMessage?: string
  result?: ImportPbsMaterialResult
}

export const createInitialProgress = (materials: string[]): ImportProgressState => ({
  materials,
  done: Object.fromEntries(materials.map((m) => [m, {}])),
  headline: 'fetch',
  percent: 0,
  status: 'running',
})

export const applyImportProgressEvent = (
  state: ImportProgressState,
  event: ImportProgressEvent,
): ImportProgressState => {
  // handle started / stage / complete / error
  // percent = floor(100 * completed / (materials.length * 4)); cap 99 until complete
  // headline: earliest incomplete among fetch | transform | (enqueue|write)->write
}
```

Unit tests:

```ts
it('stays on fetch until all materials finish fetch', () => { ... })
it('moves to transform when fetches done', () => { ... })
it('maps enqueue+write to Writing headline', () => { ... })
it('caps at 99 until complete then 100', () => { ... })
```

- [ ] **Step 2: API**

```ts
export interface ImportPbsMaterialStartResult {
  importId: string
  rosterPeriodId: number
  rosterPeriod: string
  startDt: string
  endDt: string
  materials: Array<'crew'|'flight'|'pairing'|'roster'|'rosterGround'>
}

export const startImportPbsMaterial = async (input: ImportPbsMaterialInput) =>
  api.post('/api/scenario/import-pbs-material', input, {
    timeout: IMPORT_PBS_MATERIAL_TIMEOUT_MS,
  }) as Promise<ImportPbsMaterialStartResult>

export const subscribeImportPbsMaterialProgress = async (
  importId: string,
  onEvent: (event: ImportProgressEvent) => void,
  signal?: AbortSignal,
): Promise<void> => {
  const base = api.defaults.baseURL ?? ''
  const auth = api.defaults.headers.common['Authorization']
  const res = await fetch(`${base}/api/scenario/import-pbs-material/${importId}/events`, {
    headers: {
      Accept: 'text/event-stream',
      ...(typeof auth === 'string' ? { Authorization: auth } : {}),
    },
    signal,
  })
  if (!res.ok || !res.body) throw new Error(`SSE failed: HTTP ${res.status}`)
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const parts = buffer.split('\n\n')
    buffer = parts.pop() ?? ''
    for (const part of parts) {
      const line = part.split('\n').find((l) => l.startsWith('data: '))
      if (!line) continue
      const json = line.slice(6)
      onEvent(JSON.parse(json) as ImportProgressEvent)
    }
  }
}
```

Keep `importPbsMaterial` as a high-level helper used by the panel:

```ts
export const importPbsMaterial = async (
  input: ImportPbsMaterialInput,
  onProgress?: (state: ImportProgressState) => void,
): Promise<ImportPbsMaterialResult> => {
  const start = await startImportPbsMaterial(input)
  let state = createInitialProgress(start.materials)
  onProgress?.(state)
  return await new Promise((resolve, reject) => {
    const ac = new AbortController()
    void subscribeImportPbsMaterialProgress(start.importId, (event) => {
      state = applyImportProgressEvent(state, event)
      onProgress?.(state)
      if (event.type === 'complete') {
        ac.abort()
        resolve(event.result as ImportPbsMaterialResult)
      }
      if (event.type === 'error') {
        ac.abort()
        reject(new Error(event.message))
      }
    }, ac.signal).catch(reject)
  })
}
```

- [ ] **Step 3: Tests + commit**

```bash
npm --prefix gantt test -- import-pbs-progress import-pbs-material-api
git commit -m "feat(gantt): consume Import PBS material SSE progress"
```

---

### Task 6: Dialog + panel wiring + e2e

**Files:**
- Modify: `gantt/src/components/scenario/import-pbs-dialog.tsx`
- Modify: `gantt/src/components/scenario/scenario-list-panel.tsx`
- Modify: `gantt/src/components/scenario/__tests__/import-pbs-dialog.test.tsx`
- Modify: `e2e/tests/gantt/scenario-toolbar-buttons.spec.ts`

- [ ] **Step 1: Dialog props**

Replace wall-clock `resolveImportProgress` usage with optional external progress:

```ts
interface ImportPbsDialogProps {
  // existing...
  importing?: boolean
  progress?: {
    headline: 'fetch' | 'transform' | 'write'
    percent: number
  } | null
}
```

When `importing && progress`: bar width = `progress.percent`, active stage = `progress.headline`.  
When `importing && !progress`: show Fetching at 0% (waiting for first event).  
Delete time-based stage thresholds (or keep `resolveImportProgress` only in tests if unused — prefer delete).

- [ ] **Step 2: Panel**

```ts
const [importProgress, setImportProgress] = useState<ImportProgressState | null>(null)

const handleImportConfirm = async (payload: ImportPbsPayload) => {
  setImporting(true)
  setImportProgress(null)
  const startedAt = Date.now()
  try {
    const result = await importPbsMaterial(
      { rosterPeriodId: payload.rosterPeriodId, scope: payload.scope },
      (state) => setImportProgress(state),
    )
    // existing success toast from result.timings
    setImportOpen(false)
  } catch (err) {
    // existing error toast
  } finally {
    setImporting(false)
    setImportProgress(null)
  }
}
```

Pass `progress={importProgress ? { headline: importProgress.headline, percent: importProgress.percent } : null}` into dialog.

- [ ] **Step 3: Unit + e2e**

Dialog unit: with `importing` and `progress={{ headline: 'fetch', percent: 5 }}` asserts fetch active and bar 5.

E2E Scen-2035:
1. Mock POST to return `{ importId: '…', materials: ['rosterGround'], … }` immediately.
2. Mock SSE (or second route) to push stage events then complete — if Playwright cannot easily mock streams, mock at network with chunked body; alternatively unit covers reducer and e2e only checks progress region appears with fetch active after confirm using fulfilled SSE single snapshot.

Minimal e2e acceptance:

- After Confirm, `import-pbs-stage-fetch` has `data-active=true` and bar not stuck at 50% pulse.
- On complete toast, dialog closes.

- [ ] **Step 4: UI gate + commit**

```bash
npm --prefix gantt test -- import-pbs
npm run check:ui
git commit -m "feat(gantt): wire Import PBS dialog to real progress events"
```

---

### Task 7: End-to-end verification checklist

- [ ] **Step 1: Run package tests**

```bash
npm --prefix connector-server test -- f8-import-progress import-progress
npm --prefix live-server test -- import-pbs-material import-progress
npm --prefix gantt test -- import-pbs
npm run check:ui
```

Expected: all PASS, UI hard violations 0.

- [ ] **Step 2: Manual smoke (when services up)**

1. Open Scenario → Import PBS Material → Crew only → Confirm.
2. Observe stages: Fetching stays until connector publishes fetch done; then Transforming; then Writing until crew worker finishes.
3. Success toast; crew data present.

- [ ] **Step 3: Final commit if any cleanups**

```bash
git commit -m "test: finish Import PBS real progress coverage"
```

---

## Spec coverage self-check

| Spec requirement | Task |
|------------------|------|
| Stage-true events | 2, 3 |
| Redis bus + TTL snapshot | 1 |
| SSE GET | 4 |
| POST returns importId immediately | 4 |
| Wait all materials for write | 4 |
| Workers publish write | 3 |
| queueJobs all materials | 2 |
| Gantt SSE + reducer | 5, 6 |
| Remove cosmetic timeline | 6 |
| Admin trigger without importId unchanged | 2 |
| Tests | 1–6 |

## Notes for implementers

- **Do not** use live-server `fastify.redis` (app REDIS_URL) for progress if BULLMQ is on a different DB index — always BULLMQ URL.
- Pairing may enqueue multiple jobs: treat material `pairing` write done when **all** pairing jobs for that importId complete (count expected jobs from connector `queueJobs`).
- Keep §Surgical: no drive-by refactors outside import progress.
- UI language English only.
