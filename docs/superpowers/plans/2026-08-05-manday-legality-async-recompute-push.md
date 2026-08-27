# Manday / 法规 / KPI 异步化 + 推送定向刷新 — 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 Live + Scenario 的保存流程非阻塞：manday / 法规 / KPI 重算全部异步，WS 信号推送 + 定向刷新替代 `getGanttData` 全量重拉与法规轮询，保存点击后界面快速响应。

**Architecture:** 新增 BullMQ worker（`manday-recompute`、`scenario-kpi-recompute`）承载异步重算，保存请求只应用变更 + 入队 + 触发法规即返回；重算完成后经现有 `/ws/locks` schema channel 推送信号，前端按现有 GET 端点定向刷新。法规保持 detached 脚本（`scenario-legality.mjs` / `spawnLiveRecheck`），完成后经 Redis pub/sub → live-server WS 转发推送。前端场景保存改为本地应用 patch + Tier-1 乐观 RP Credit delta（复用 `crewMandayDelta`）。

**Tech Stack:** Fastify + BullMQ + Redis + PostgreSQL（live-server）；React 19 + Zustand + WS（gantt）。

**Spec:** `docs/superpowers/specs/2026-08-05-manday-legality-async-recompute-push-design.md`

## Global Constraints

- §Surgical / §Minimal-First：只动任务所需行，不顺手重构；新代码不引入投机性抽象。
- 数据模型以 DB 为准；禁止硬编码业务常量（时间阈值走参数化/现有 util）。
- §信息安全：无明文密码入代码/文档；脚本读 Redis/DATABASE_URL 走 `live-server/.env`。
- 前端 UI 文案英文；样式 token 驱动；改动前端样式后跑 `npm run check:ui`。
- 后端改动必须带 Vitest 测试；前端 UI 改动必须带 Playwright 测试（§Playwright-Required / §No-Illusion / §Stale-Test）。
- 工作区已有未提交的 P0 代码改动（Intl 缓存 + 范围重算 + `scenario-patch-service.test.ts` 部分修改），Task 1-2 负责补测试并提交它们。

---

## 文件结构

**后端（live-server）：**
- `src/plugins/bullmq.ts` — 新增 producer 队列 `mandayRecomputeQueue` / `scenarioKpiRecomputeQueue`
- `src/workers/manday-recompute-worker.ts`（新建）— 消费 manday 重算 job，compute → wsBroadcastAll
- `src/workers/scenario-kpi-recompute-worker.ts`（新建）— 消费 scenario KPI 重算 job
- `src/workers/index.ts` — 导出新 worker
- `src/index.ts` — 启动新 worker
- `src/routes/draft/draft.ts` — Live commit 去同步 recompute，改入队
- `src/routes/scenario/scenario.ts` — patch-output 去同步 recompute + KPI，改入队
- `src/services/scenario/scenario-patch-service.ts` — 移除 recomputeManday 同步调用
- `src/plugins/websocket.ts` — 新增 `scenario-recompute:*` Redis 订阅转发
- `scripts/scenario-legality.mjs`（+ live-legality 脚本）— 完成后 Redis publish
- `src/services/scenario/legality-status.ts` / `src/services/rule/legality-recheck.ts` — spawn 时把 airline schema 传给脚本

**前端（gantt）：**
- `src/stores/scenario-gantt-store.ts` — save 本地应用 + 去 getGanttData
- `src/utils/scenario-roster-edit.ts` — 新增 `applyScenarioPatchesToData`
- `src/components/shell/scenario-gantt-view.tsx`（或新 hook）— WS 订阅 + 定向刷新
- `src/components/gantt/source/scenario-gantt-source.ts` — Tier-1 乐观 RP Credit delta
- `src/services/scenario-legality-api.ts` — 去轮询改等推送
- `src/stores/draft-store.ts` — Live 去立即 loadCrewStats、去法规轮询
- `src/stores/lock-store.ts` — 处理 `manday-updated` / `legality-updated`（Live）

---

### Task 1: Intl formatter 缓存 — 补测试并提交

**Files:**
- Modify（已在工作区）: `live-server/src/utils/zoned-time.ts`、`live-server/src/services/manday/manday-tool.ts`、`live-server/src/services/manday/manday-blh-split.ts`
- Test（新建）: `live-server/src/__tests__/unit/zoned-time.test.ts`

**Interfaces:**
- Consumes: 工作区已有的 `localDateInZone(utcIso: string, zoneId: string): string`（`zoned-time.ts` 导出）
- Produces: 无新接口（行为输出逐字节不变）

- [ ] **Step 1: 写测试**

```ts
import { describe, expect, it } from 'vitest'
import { localDateInZone, localWallTimeToUtc } from '../../utils/zoned-time.js'

describe('localDateInZone', () => {
  it('formats UTC ISO in the given IANA zone', () => {
    expect(localDateInZone('2026-08-01T00:00:00Z', 'America/Vancouver')).toBe('2026-07-31')
    expect(localDateInZone('2026-08-01T05:30:00Z', 'America/Vancouver')).toBe('2026-08-01')
    expect(localDateInZone('2026-07-01T12:00:00Z', 'UTC')).toBe('2026-07-01')
  })
  it('cached output is identical to a fresh per-call formatter', () => {
    const zone = 'America/Toronto'
    for (const iso of ['2026-07-01T03:00:00Z', '2026-07-01T06:00:00Z', '2026-12-31T23:30:00Z']) {
      const expected = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso))
      expect(localDateInZone(iso, zone)).toBe(expected)
    }
  })
  it('localWallTimeToUtc stays DST-correct (Vancouver PDT = UTC-7)', () => {
    expect(localWallTimeToUtc(2026, 7, 1, 12, 0, 'America/Vancouver').toISOString()).toBe('2026-07-01T19:00:00.000Z')
  })
})
```

- [ ] **Step 2: 运行测试**

Run: `cd live-server && npx vitest run src/__tests__/unit/zoned-time.test.ts`
Expected: PASS（实现已在工作区）

- [ ] **Step 3: 运行既有 manday golden 测试确认输出不变**

Run: `cd live-server && npx vitest run src/__tests__/services/manday-blh-split.test.ts src/__tests__/services/manday-tool.test.ts src/__tests__/services/manday-tool-scenario.test.ts 2>&1 | tail -20`
Expected: 全部 PASS（DB 类测试在无 `DATABASE_URL` 时 skip 属正常）

- [ ] **Step 4: Commit**

```bash
cd /home/yuan.z/rois/rois-ai
git add live-server/src/utils/zoned-time.ts live-server/src/services/manday/manday-tool.ts live-server/src/services/manday/manday-blh-split.ts live-server/src/__tests__/unit/zoned-time.test.ts
git commit -m "perf: cache Intl formatters in manday date helpers

toLocalDate/offsetMinutes created a new Intl.DateTimeFormat per call (~20k
instantiations ≈ 1.8s per scenario manday recompute). Cache by locale/zone/
opts; output is byte-identical. Cuts scenario 623 recompute JS time ~50%.
Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: 范围重算受影响机组 — 补测试并提交

**Files:**
- Modify（已在工作区）: `live-server/src/services/scenario/scenario-patch-service.ts`（`affectedCrewIds` 传给 `recomputeManday`）
- Test（修改，已在工作区部分改动）: `live-server/src/__tests__/services/scenario-patch-service.test.ts`

**Interfaces:**
- Consumes: `mandayMocks`（`vi.hoisted`）已在测试文件顶部；`applyScenarioRosterPatches` 现有签名不变
- Produces: 断言 `recompute`（mock）以 `crewIds` 被调用

- [ ] **Step 1: 在 `applyScenarioRosterPatches` describe 加 `beforeEach` + 范围断言测试**

在 `describe('applyScenarioRosterPatches', ...)` 内加：

```ts
beforeEach(() => {
  vi.clearAllMocks()
})

it('recomputes manday only for the patched crews (not the whole scenario)', async () => {
  const query = vi.fn()
    .mockResolvedValueOnce({ rowCount: 1 }) // BEGIN
    .mockResolvedValueOnce({ rowCount: 1 }) // remove ground
    .mockResolvedValueOnce({ rowCount: 1 }) // reassign
    .mockResolvedValueOnce({ rowCount: 1 }) // COMMIT
  const release = vi.fn()
  const client = { query, release }
  const pool = {
    connect: vi.fn().mockResolvedValue(client),
    query: vi.fn()
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 702, pairing_scenario_id: 0, flight_scenario_id: 0 }] })
      .mockResolvedValue({ rowCount: 1 }),
  } as never

  await applyScenarioRosterPatches(pool, 702, [
    { op: 'remove', crewId: 'F80001', pairingId: null, startDtUtc: '2026-07-01T08:00:00Z', endDtUtc: '2026-07-01T16:00:00Z', assignmentGroup: 'GRD', assignment: 'SIM' },
    { op: 'reassign', crewId: 'F80002', pairingId: 200, toCrewId: 'F80003' },
  ], 'planner')

  expect(recomputeManday).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ schema: 'scenario', scenarioId: 702, crewIds: ['F80001', 'F80002', 'F80003'] }),
  )
})
```

- [ ] **Step 2: 运行测试**

Run: `cd live-server && npx vitest run src/__tests__/services/scenario-patch-service.test.ts`
Expected: PASS（含既有 `applies add and CR-only reassign...` 用例——其 pool mock 已满足新调用路径）

- [ ] **Step 3: Commit**

```bash
git add live-server/src/services/scenario/scenario-patch-service.ts live-server/src/__tests__/services/scenario-patch-service.test.ts
git commit -m "perf: scope scenario manday recompute to patched crews

applyScenarioRosterPatches recomputed the whole scenario roster on every
patch (~4.5s). Pass affected crewIds (incl. reassign target) to recompute;
a single DO delete now recomputes one crew instead of all 148.
Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: `manday-recompute` BullMQ 队列 + worker

**Files:**
- Modify: `live-server/src/plugins/bullmq.ts`（加 producer 队列）
- Create: `live-server/src/workers/manday-recompute-worker.ts`
- Modify: `live-server/src/workers/index.ts`、`live-server/src/index.ts`
- Test（新建）: `live-server/src/__tests__/services/manday-recompute-worker.test.ts`

**Interfaces:**
- Consumes: `recompute` from `../services/manday/manday-tool.js`；`getBullmqRedisConnection` from `../utils/bullmq-redis.js`；`fastify.pgPool` / `fastify.wsBroadcastAll`
- Produces:
  - `export interface MandayRecomputeJobData { kind: 'live' | 'scenario'; schema: string; airlineSchema: string; scenarioId?: number; crewIds: string[]; window?: { startDt: string; endDt: string }; updatedBy: string }`
  - `export function startMandayRecomputeWorker(fastify: FastifyInstance): Worker`
  - `fastify.mandayRecomputeQueue: Queue<MandayRecomputeJobData>`（producer）

- [ ] **Step 1: bullmq.ts 注册 producer 队列**

`bullmq.ts` 顶部加类型 import（`import type { MandayRecomputeJobData } from '../workers/manday-recompute-worker.js'`），`declare module 'fastify'` 内加 `mandayRecomputeQueue: Queue<MandayRecomputeJobData>`，插件体内加：

```ts
const mandayRecomputeQueue = new Queue<MandayRecomputeJobData>('manday-recompute', {
  connection,
  defaultJobOptions: { removeOnComplete: { count: 100 }, removeOnFail: { count: 50 }, attempts: 2, backoff: { type: 'exponential', delay: 2000 } },
})
// ...在 return 或装饰处：
fastify.decorate('mandayRecomputeQueue', mandayRecomputeQueue)
```

（参照现有 `rosterBulkDeleteQueue` 的注册/装饰方式，保持同文件既有风格。）

- [ ] **Step 2: 写 worker 文件**

```ts
// live-server/src/workers/manday-recompute-worker.ts
import { Worker } from 'bullmq'
import type { FastifyInstance } from 'fastify'
import { recompute } from '../services/manday/manday-tool.js'
import { getBullmqRedisConnection } from '../utils/bullmq-redis.js'

export interface MandayRecomputeJobData {
  kind: 'live' | 'scenario'
  schema: string // value passed to recompute(): 'scenario' or live schema (e.g. 'f8')
  airlineSchema: string // WS broadcast channel (airline schema the client subscribed to)
  scenarioId?: number
  crewIds: string[]
  window?: { startDt: string; endDt: string }
  updatedBy: string
}

export function startMandayRecomputeWorker(fastify: FastifyInstance): Worker {
  const worker = new Worker<MandayRecomputeJobData>(
    'manday-recompute',
    async (job) => {
      const { kind, schema, airlineSchema, scenarioId, crewIds, window, updatedBy } = job.data
      await recompute(fastify.pgPool, {
        schema,
        scenarioId,
        crewIds,
        startDt: window?.startDt,
        endDt: window?.endDt,
        updatedBy,
      })
      fastify.wsBroadcastAll(airlineSchema, {
        type: kind === 'scenario' ? 'scenario-manday-updated' : 'manday-updated',
        ...(scenarioId != null ? { scenarioId } : {}),
        crewIds,
      })
    },
    { connection: getBullmqRedisConnection(), concurrency: 2 },
  )
  worker.on('failed', (job, err) => {
    fastify.log.error({ jobId: job?.id, err: err.message }, 'manday-recompute worker failed')
  })
  worker.on('error', (err) => {
    fastify.log.error({ err: err.message }, 'manday-recompute worker error')
  })
  return worker
}
```

- [ ] **Step 3: index.ts 导出 + 启动**

`workers/index.ts` 加 `export { startMandayRecomputeWorker } from './manday-recompute-worker.js'`。
`index.ts` 的 worker 启动区（参照 `startCheckRosterWorker` 附近）加 `startMandayRecomputeWorker(server)`。

- [ ] **Step 4: 写 worker 测试**

```ts
// live-server/src/__tests__/services/manday-recompute-worker.test.ts
import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { FastifyInstance } from 'fastify'

vi.mock('../../services/manday/manday-tool.js', () => ({
  recompute: vi.fn(async () => ({ crews: 1, daily: 1, monthly: 1, yearly: 1 })),
}))
vi.mock('../../utils/bullmq-redis.js', () => ({ getBullmqRedisConnection: vi.fn(() => ({})) }))

import { Worker } from 'bullmq'
import { recompute } from '../../services/manday/manday-tool.js'
import { startMandayRecomputeWorker } from '../../workers/manday-recompute-worker.js'

// 用最小 fake worker 取代真实 BullMQ，直接调用 processor
const make = () => {
  const wsBroadcastAll = vi.fn()
  const fastify = {
    pgPool: { query: vi.fn() },
    wsBroadcastAll,
    log: { error: vi.fn() },
  } as unknown as FastifyInstance
  const started = startMandayRecomputeWorker(fastify)
  const processor = (started as unknown as { process: (p: unknown) => unknown }).process as unknown as (
    job: { name: string; data: Record<string, unknown> },
  ) => Promise<unknown>
  return { fastify, started, wsBroadcastAll }
}

describe('manday-recompute worker', () => {
  beforeEach(() => vi.clearAllMocks())

  it('runs recompute scoped to crewIds and broadcasts a scenario signal', async () => {
    const { wsBroadcastAll } = make()
    const processor = (startMandayRecomputeWorker as unknown as { _lastProcessor?: unknown })._lastProcessor
      ?? (await import('../../workers/manday-recompute-worker.js')).startMandayRecomputeWorker
    // 通过真实 worker 的 process 方法不可行（连 Redis）；改为验证 startMandayRecomputeWorker
    // 返回的 Worker 暴露的 processor——见下方注。
    expect(startMandayRecomputeWorker).toBeTypeOf('function')
    expect(recompute).not.toHaveBeenCalled()
    expect(wsBroadcastAll).not.toHaveBeenCalled()
  })
})
```

> 注：BullMQ `Worker` 在构造时即连接 Redis，测试不便。可行的替代断言策略：把 worker 的 job 处理逻辑抽为 `export async function handleMandayRecomputeJob(fastify, jobData): Promise<void>`，worker processor 只做 `return handleMandayRecomputeJob(fastify, job.data)`。测试直接调 `handleMandayRecomputeJob`，mock `recompute` 与 `fastify.wsBroadcastAll`，断言信号 payload。**采用此方案**：在 `manday-recompute-worker.ts` 导出 `handleMandayRecomputeJob`，processor 内调用它。

`handleMandayRecomputeJob`：

```ts
export const handleMandayRecomputeJob = async (
  fastify: FastifyInstance,
  data: MandayRecomputeJobData,
): Promise<void> => {
  const { kind, schema, airlineSchema, scenarioId, crewIds, window, updatedBy } = data
  await recompute(fastify.pgPool, {
    schema, scenarioId, crewIds,
    startDt: window?.startDt, endDt: window?.endDt, updatedBy,
  })
  fastify.wsBroadcastAll(airlineSchema, {
    type: kind === 'scenario' ? 'scenario-manday-updated' : 'manday-updated',
    ...(scenarioId != null ? { scenarioId } : {}),
    crewIds,
  })
}
```

最终测试：

```ts
import { handleMandayRecomputeJob } from '../../workers/manday-recompute-worker.js'
// ...
it('recomputes scoped crews and broadcasts scenario-manday-updated', async () => {
  const fastify = {
    pgPool: { query: vi.fn() },
    wsBroadcastAll: vi.fn(),
    log: { error: vi.fn() },
  } as unknown as FastifyInstance
  await handleMandayRecomputeJob(fastify, {
    kind: 'scenario', schema: 'scenario', airlineSchema: 'f8', scenarioId: 623,
    crewIds: ['F80001'], updatedBy: 'planner',
  })
  expect(recompute).toHaveBeenCalledWith(fastify.pgPool, expect.objectContaining({
    schema: 'scenario', scenarioId: 623, crewIds: ['F80001'],
  }))
  expect(fastify.wsBroadcastAll).toHaveBeenCalledWith('f8', {
    type: 'scenario-manday-updated', scenarioId: 623, crewIds: ['F80001'],
  })
})

it('live job broadcasts manday-updated without scenarioId', async () => {
  const fastify = { pgPool: { query: vi.fn() }, wsBroadcastAll: vi.fn(), log: { error: vi.fn() } } as unknown as FastifyInstance
  await handleMandayRecomputeJob(fastify, { kind: 'live', schema: 'f8', airlineSchema: 'f8', crewIds: ['386'], updatedBy: 'planner' })
  expect(fastify.wsBroadcastAll).toHaveBeenCalledWith('f8', { type: 'manday-updated', crewIds: ['386'] })
})
```

- [ ] **Step 5: 运行测试**

Run: `cd live-server && npx vitest run src/__tests__/services/manday-recompute-worker.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add live-server/src/plugins/bullmq.ts live-server/src/workers/manday-recompute-worker.ts live-server/src/workers/index.ts live-server/src/index.ts live-server/src/__tests__/services/manday-recompute-worker.test.ts
git commit -m "feat: add async manday-recompute BullMQ worker
Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Live draft commit — manday 改入队

**Files:**
- Modify: `live-server/src/routes/draft/draft.ts`（同步 recompute 块 → 入队）
- Test（修改）: `live-server/src/__tests__/...`（如存在 draft 相关测试则补断言；无则依赖 worker 单测 + 既有测试回归）

**Interfaces:**
- Consumes: `fastify.mandayRecomputeQueue`（Task 3）；`mandayMutationWindow`（现有）
- Produces: 无新接口

- [ ] **Step 1: 替换 draft.ts 同步 recompute 块**

把当前 `if (affectedCrewIds.length > 0) { ... await recomputeManday(fastify.pgPool, {...}) }` 整块替换为：

```ts
if (affectedCrewIds.length > 0) {
  const dates = [...refDates].map((d) => new Date(d)).filter((d) => !Number.isNaN(d.getTime()))
  const window = await mandayMutationWindow(
    fastify,
    affectedCrewIds,
    dates.length > 0 ? dates : [new Date()],
    { backDays: 2, forwardDays: 10 },
  )
  if (window) {
    await fastify.mandayRecomputeQueue.add('manday-recompute', {
      kind: 'live',
      schema: liveSchemaName(),
      airlineSchema: requestSchema(request),
      crewIds: affectedCrewIds,
      window: { startDt: window.startDt, endDt: window.endDt },
      updatedBy: username,
    }, { jobId: `manday:live:${[...affectedCrewIds].sort().join(',')}` })
  }
}
```

同步注释「Recompute all manday KPIs...SYNCHRONOUSLY」改为说明已异步。

- [ ] **Step 2: 检查并移除未用的 `recomputeManday` import**

`draft.ts` 若不再引用 `recomputeManday`，从其 import 行删除（§Surgical）。

- [ ] **Step 3: 运行 live-server 相关测试 + 编译**

Run: `cd live-server && npx tsc --noEmit` 与 `npx vitest run src/routes/draft 2>&1 | tail -20`（若有）
Expected: 编译通过，既有测试通过（无 draft 测试则 tsc 通过即可）

- [ ] **Step 4: Commit**

```bash
git add live-server/src/routes/draft/draft.ts
git commit -m "refactor: enqueue async manday recompute on live draft save
Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Scenario patch-output — manday 改入队

**Files:**
- Modify: `live-server/src/services/scenario/scenario-patch-service.ts`（移除 recomputeManday 同步调用）
- Modify: `live-server/src/routes/scenario/scenario.ts`（patch-output 内入队 manday job）
- Test（修改）: `live-server/src/__tests__/services/scenario-patch-service.test.ts`、`live-server/src/__tests__/unit/scenario-patch-output-route.test.ts`

**Interfaces:**
- Consumes: `fastify.mandayRecomputeQueue`（Task 3）
- Produces: 无新接口；`applyScenarioRosterPatches` 不再触发 recompute

- [ ] **Step 1: scenario-patch-service.ts 移除 recompute 调用**

删除 `applyScenarioRosterPatches` 尾部 `affectedCrewIds` 计算 + `await recomputeManday(...)` 块；删除 `recompute as recomputeManday` import（若不再使用）。保留 legality_status UPDATE（在 recompute 块之后独立存在）。

- [ ] **Step 2: scenario.ts patch-output 内入队**

在 `await applyScenarioRosterPatches(...)` 之后、`syncScenarioPairingKpisFromDb` 之前（或后），加：

```ts
const affectedCrewIds = [...new Set(
  patches.flatMap((patch) => [patch.crewId, patch.toCrewId]).filter((id): id is string => !!id),
)]
if (affectedCrewIds.length > 0) {
  await fastify.mandayRecomputeQueue.add('manday-recompute', {
    kind: 'scenario',
    schema: 'scenario',
    airlineSchema: requestSchema(request),
    scenarioId: numId,
    crewIds: affectedCrewIds,
    updatedBy: callerCode,
  }, { jobId: `manday:scenario:${numId}:${[...affectedCrewIds].sort().join(',')}` })
}
```

- [ ] **Step 3: 更新测试**

`scenario-patch-output-route.test.ts`：`patchServiceMocks.applyScenarioRosterPatches` 是 mock，无需改；新增断言 `fastify.mandayRecomputeQueue.add` 被调用——需在 `build()` 的 app 上装饰 `mandayRecomputeQueue`（`app.decorate('mandayRecomputeQueue', { add: vi.fn() })`）。加用例：

```ts
it('enqueues an async manday recompute for the patched crews', async () => {
  const app = await build()
  const add = vi.fn(async () => undefined)
  app.decorate('mandayRecomputeQueue', { add } as never)
  await app.inject({
    method: 'POST', url: '/702/patch-output',
    payload: { patches: [{ op: 'remove', crewId: 'F80001', pairingId: null, startDtUtc: '2026-07-01T08:00:00Z', endDtUtc: '2026-07-01T16:00:00Z', assignmentGroup: 'GRD', assignment: 'SIM' }] },
  })
  expect(add).toHaveBeenCalledWith(
    'manday-recompute',
    expect.objectContaining({ kind: 'scenario', scenarioId: 702, crewIds: ['F80001'] }),
    expect.objectContaining({ jobId: expect.stringContaining('manday:scenario:702') }),
  )
})
```

`scenario-patch-service.test.ts`：把 Task 2 加的「recomputes manday only for the patched crews」用例**改为断言不再调用 recompute**（服务层不再触发），recompute mock 断言删除。

- [ ] **Step 4: 运行测试**

Run: `cd live-server && npx vitest run src/__tests__/unit/scenario-patch-output-route.test.ts src/__tests__/services/scenario-patch-service.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add live-server/src/services/scenario/scenario-patch-service.ts live-server/src/routes/scenario/scenario.ts live-server/src/__tests__/unit/scenario-patch-output-route.test.ts live-server/src/__tests__/services/scenario-patch-service.test.ts
git commit -m "refactor: enqueue async manday recompute on scenario patch save
Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: `scenario-kpi-recompute` worker + patch-output 入队

**Files:**
- Modify: `live-server/src/plugins/bullmq.ts`（加 producer 队列）
- Create: `live-server/src/workers/scenario-kpi-recompute-worker.ts`
- Modify: `live-server/src/workers/index.ts`、`live-server/src/index.ts`
- Modify: `live-server/src/routes/scenario/scenario.ts`（patch-output 去同步 KPI，改入队）
- Test: `live-server/src/__tests__/services/scenario-kpi-recompute-worker.test.ts`（新建）

**Interfaces:**
- Consumes: `syncScenarioPairingKpisFromDb` from `../services/scenario/scenario-result-service.js`
- Produces:
  - `export interface ScenarioKpiRecomputeJobData { scenarioId: number; strDtLoc: Date; endDtLoc: Date; filterParams: Record<string, unknown>; division: string; airlineSchema: string; updatedBy: string }`
  - `export const handleScenarioKpiRecomputeJob: (fastify, data) => Promise<void>`
  - `fastify.scenarioKpiRecomputeQueue: Queue<ScenarioKpiRecomputeJobData>`

- [ ] **Step 1: worker 文件（含可测的 handler）**

```ts
// live-server/src/workers/scenario-kpi-recompute-worker.ts
import { Worker } from 'bullmq'
import type { FastifyInstance } from 'fastify'
import { syncScenarioPairingKpisFromDb } from '../services/scenario/scenario-result-service.js'
import { getBullmqRedisConnection } from '../utils/bullmq-redis.js'

export interface ScenarioKpiRecomputeJobData {
  scenarioId: number
  strDtLoc: Date
  endDtLoc: Date
  filterParams: Record<string, unknown>
  division: string
  airlineSchema: string
  updatedBy: string
}

export const handleScenarioKpiRecomputeJob = async (
  fastify: FastifyInstance,
  data: ScenarioKpiRecomputeJobData,
): Promise<void> => {
  await syncScenarioPairingKpisFromDb(fastify, data.scenarioId, {
    strDtLoc: data.strDtLoc,
    endDtLoc: data.endDtLoc,
    filterParams: data.filterParams,
    division: data.division,
  }, data.updatedBy)
  fastify.wsBroadcastAll(data.airlineSchema, { type: 'scenario-kpi-updated', scenarioId: data.scenarioId })
}

export function startScenarioKpiRecomputeWorker(fastify: FastifyInstance): Worker {
  const worker = new Worker<ScenarioKpiRecomputeJobData>(
    'scenario-kpi-recompute',
    async (job) => { await handleScenarioKpiRecomputeJob(fastify, job.data) },
    { connection: getBullmqRedisConnection(), concurrency: 2 },
  )
  worker.on('failed', (job, err) => {
    fastify.log.error({ jobId: job?.id, err: err.message }, 'scenario-kpi-recompute worker failed')
  })
  return worker
}
```

- [ ] **Step 2: bullmq.ts / index.ts 注册**（同 Task 3 模式：`scenarioKpiRecomputeQueue` producer + `startScenarioKpiRecomputeWorker` 启动）

- [ ] **Step 3: scenario.ts patch-output 去同步 KPI，改入队**

把 `await syncScenarioPairingKpisFromDb(fastify, numId, {...}, callerCode)` 替换为：

```ts
await fastify.scenarioKpiRecomputeQueue.add('scenario-kpi-recompute', {
  scenarioId: numId,
  strDtLoc: new Date(sc.strDtLoc),
  endDtLoc: new Date(sc.endDtLoc),
  filterParams: (sc.filterParams ?? {}) as Record<string, unknown>,
  division: sc.division ?? 'P',
  airlineSchema: requestSchema(request),
  updatedBy: callerCode,
}, { jobId: `scenario-kpi:${numId}` })
```

- [ ] **Step 4: worker 测试**

`scenario-kpi-recompute-worker.test.ts`：mock `syncScenarioPairingKpisFromDb`，调 `handleScenarioKpiRecomputeJob`，断言它被以正确 scope 调用、并 `wsBroadcastAll` 发 `scenario-kpi-updated`。

- [ ] **Step 5: 运行测试**

Run: `cd live-server && npx vitest run src/__tests__/services/scenario-kpi-recompute-worker.test.ts src/__tests__/unit/scenario-patch-output-route.test.ts`
Expected: PASS（route 测试里 `syncScenarioPairingKpisFromDb` 现为入队，无需 mock 该函数）

- [ ] **Step 6: Commit**

```bash
git add live-server/src/plugins/bullmq.ts live-server/src/workers/scenario-kpi-recompute-worker.ts live-server/src/workers/index.ts live-server/src/index.ts live-server/src/routes/scenario/scenario.ts live-server/src/__tests__/services/scenario-kpi-recompute-worker.test.ts
git commit -m "feat: async scenario KPI recompute worker; dequeue from patch-output
Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: 法规/重算完成信号（Redis pub/sub → WS）

**Files:**
- Modify: `live-server/src/plugins/websocket.ts`（新增 `scenario-recompute:*` 订阅转发）
- Modify: `live-server/scripts/scenario-legality.mjs`（完成后 publish）
- Modify: `live-server/src/services/scenario/legality-status.ts`（spawn 时传 airline schema 给脚本）
- Modify: live-legality 脚本（`scripts/live-legality.mjs` 或等价）+ `live-server/src/services/rule/legality-recheck.ts`（spawn 传 schema）
- Test: `live-server/src/__tests__/unit/websocket-scenario-recompute.test.ts`（新建，纯逻辑断言）

**Interfaces:**
- Produces: Redis channel 约定 `scenario-recompute:<airlineSchema>:<scope>`；WS 消息 `{ type: 'scenario-legality-updated', scenarioId }`

- [ ] **Step 1: websocket.ts 订阅转发**

在现有 `subscriber.pSubscribe('violations:*', ...)` 后加：

```ts
await subscriber.pSubscribe('scenario-recompute:*', (message, channel) => {
  // channel: scenario-recompute:{schema}:{scenarioId}
  const parts = channel.split(':')
  if (parts.length < 3) return
  const schema = parts[1]
  const scenarioId = Number(parts.slice(2).join(':'))
  for (const client of clients) {
    if (client.authenticated && client.schema === schema && client.ws.readyState === 1) {
      client.ws.send(JSON.stringify({ type: 'scenario-legality-updated', scenarioId }))
    }
  }
})
```

> 注：若 scenario 的 airline schema 与 WS schema 不一致（如 SIT `f8_sit_scenario` vs WS `f8`），以 publish 方传入的 schema 为准；任务执行时按实际 schema 取值实现。

- [ ] **Step 2: scenario-legality.mjs 完成后 publish**

在 `main()` 的 READY/FAILED 落库之后、`db.end()` 前，用 redis（从 `REDIS_URL` env 连接）`PUBLISH scenario-recompute:{schema}:{SCENARIO_ID} 1`。schema 通过新 env `WS_AIRLINE_SCHEMA` 传入（spawn 时注入）。失败 publish 不阻断（`try/catch` + console 提示）。

- [ ] **Step 3: legality-status.ts spawn 时注入 schema**

`spawnCompute` 里 `spawn(process.execPath, [script, String(scenarioId)], { env: { ...process.env, WS_AIRLINE_SCHEMA: <schema> } })`。schema 来源：调用 `ensureLegality` 的路由上下文（route 传入或在 `ensureLegality` 加可选参数，默认取 `fastify` 可得的 schema）。

- [ ] **Step 4: live-legality 脚本同法 publish**（`legality-recheck.ts` 的 spawn 传 `WS_AIRLINE_SCHEMA`；脚本完成后 publish `scenario-recompute:{schema}:live` 或复用 live 专用 channel 名）

- [ ] **Step 5: 测试**

对纯转发逻辑做单测：把「channel → 广播」抽为 `export function broadcastScenarioRecompute(channel: string, message: string, clients)`，单测断言不同 channel 解析出的 schema/scenarioId 与发送的 WS 消息。

- [ ] **Step 6: 运行测试 + 编译**

Run: `cd live-server && npx vitest run src/__tests__/unit/websocket-scenario-recompute.test.ts && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add live-server/src/plugins/websocket.ts live-server/scripts/scenario-legality.mjs live-server/src/services/scenario/legality-status.ts live-server/src/services/rule/legality-recheck.ts live-server/src/__tests__/unit/websocket-scenario-recompute.test.ts
git commit -m "feat: push legality recompute completion via Redis pub/sub + WS
Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: 场景前端保存 — 本地应用 patch + 去 getGanttData

**Files:**
- Modify: `gantt/src/stores/scenario-gantt-store.ts`（`save()`）
- Modify: `gantt/src/utils/scenario-roster-edit.ts`（新增 `applyScenarioPatchesToData`）
- Test: `gantt/src/stores/__tests__/scenario-gantt-store-save-local.test.ts`（新建，Vitest）

**Interfaces:**
- Consumes: `ScenarioGanttData` 类型；`AssignmentPatch` 类型
- Produces:
  - `export function applyScenarioPatchesToData(data: ScenarioGanttData, patches: AssignmentPatch[]): ScenarioGanttData`
  - `save()` 成功后不再调 `getGanttData`

- [ ] **Step 1: 写 `applyScenarioPatchesToData`**

对 `data.groundItems`（`pairingId == null` 的 remove：按 crewId+时间+assignment 过滤掉）、`data.assignments`（pairing remove / reassign / add 的更新）、`data.pairingSegments`（reassign 改 crew_id）做不可变更新。参照 `buildScenarioRosterRemovePatch` 的字段匹配。返回新对象（`{ ...data, groundItems, assignments }`）。

- [ ] **Step 2: save() 改造**

```ts
save: async () => {
  const { pendingChanges } = get()
  if (pendingChanges.length === 0) return
  set({ saving: true })
  try {
    await scenarioGanttApi.patchOutput(scenarioId, pendingChanges)
    set((state) => ({
      data: state.data ? applyScenarioPatchesToData(state.data, pendingChanges) : state.data,
      pendingChanges: [],
      redoStack: [],
      isDirty: false,
      saving: false,
      dataRevision: state.dataRevision + 1,
    }))
    notify.success('Scenario adjustments saved')
  } catch (err) {
    set({ saving: false })
    notify.error((err as Error).message)
  }
}
```

- [ ] **Step 3: Vitest 单测**

用最小 `ScenarioGanttData` fixture + `addPatch` 删除 ground task，断言 save 后 `groundItems` 不含该任务、`getGanttData` 未被调用（mock `scenarioGanttApi.patchOutput` 成功 + `getGanttData` 失败不应发生）。

- [ ] **Step 4: 运行测试**

Run: `cd gantt && npx vitest run src/stores/__tests__/scenario-gantt-store-save-local.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add gantt/src/stores/scenario-gantt-store.ts gantt/src/utils/scenario-roster-edit.ts gantt/src/stores/__tests__/scenario-gantt-store-save-local.test.ts
git commit -m "feat: apply scenario patches locally on save; drop getGanttData reload
Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: 场景前端 WS 订阅 + 定向刷新

**Files:**
- Modify: `gantt/src/components/shell/scenario-gantt-view.tsx`（或新建 `gantt/src/hooks/use-scenario-ws-updates.ts`）
- Modify: `gantt/src/services/scenario-gantt-api.ts`（如需暴露 crewStats/manday-daily 拉取）
- Test: Playwright `e2e/gantt/scenario-save-push.spec.ts`（新建）

**Interfaces:**
- Consumes: `wsClient.onMessage`（现有）；`GET /api/scenario/:id/manday-daily`（已有）
- Produces: 订阅处理 `scenario-manday-updated` / `scenario-kpi-updated` / `scenario-legality-updated`

- [ ] **Step 1: 新建订阅 hook**

`use-scenario-ws-updates.ts`：

```ts
export const useScenarioWsUpdates = (scenarioId: number): void => {
  useEffect(() => {
    return wsClient.onMessage((msg) => {
      if (!msg || typeof msg !== 'object') return
      const m = msg as Record<string, unknown>
      if (m.type === 'scenario-manday-updated' && Number(m.scenarioId) === scenarioId) {
        const crewIds = Array.isArray(m.crewIds) ? m.crewIds.map(String) : []
        void refreshScenarioCrewStats(scenarioId, crewIds)
      } else if (m.type === 'scenario-kpi-updated' && Number(m.scenarioId) === scenarioId) {
        void refreshScenarioKpis(scenarioId)
      } else if (m.type === 'scenario-legality-updated' && Number(m.scenarioId) === scenarioId) {
        void refreshScenarioLegality(scenarioId)
      }
    })
  }, [scenarioId])
}
```

`refreshScenarioCrewStats` 调 `GET /api/scenario/:id/manday-daily?crewId=...` 并把结果合并进 `data.crewStats`（set store）。`refreshScenarioKpis` 调 `GET /api/scenario/:id/kpi`。`refreshScenarioLegality` 调 `fetchScenarioLegality` 并 `getScenarioViolationStore(scenarioId).applyPersisted(...)`（复用现有 `scenario-legality-api.ts`）。

- [ ] **Step 2: scenario-gantt-view 挂载 hook**

在 `ScenarioGanttView` 组件内 `useScenarioWsUpdates(scenarioId)`。

- [ ] **Step 3: Playwright 测试**

`e2e/gantt/scenario-save-push.spec.ts`：打开 scenario 623 → 右键删 DO → 点 Save → 断言任务从 DOM 消失（本地应用）、**断言没有发起 `gantt-data` 请求**（`page.on('request')` 拦截）、等待 WS `scenario-manday-updated`（可用 `page.on('websocket')` 捕获或后端真实推送）后 crewStats 列更新。

- [ ] **Step 4: 运行 Playwright**

Run: `cd /home/yuan.z/rois/rois-ai && npx playwright test e2e/gantt/scenario-save-push.spec.ts --reporter=list`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add gantt/src/components/shell/scenario-gantt-view.tsx gantt/src/hooks/use-scenario-ws-updates.ts gantt/src/services/scenario-gantt-api.ts e2e/gantt/scenario-save-push.spec.ts
git commit -m "feat: scenario gantt subscribes to manday/kpi/legality push signals
Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: 场景 Tier-1 乐观 RP Credit delta

**Files:**
- Modify: `gantt/src/components/gantt/source/scenario-gantt-source.ts`（crewStats 渲染时叠加 delta）
- Test: `gantt/src/components/scenario-gantt/__tests__/scenario-gantt-source-manday-delta.test.ts`（新建，Vitest）

**Interfaces:**
- Consumes: `crewMandayDelta` from `@/utils/manday-delta`；`buildScenarioRosterItems`
- Produces: 场景 crew stats 行叠加乐观 delta（与 `live-gantt-source.ts:596` 同构）

- [ ] **Step 1: 在 scenario-gantt-source 计算 delta**

当 `pendingChanges.length > 0` 时：`base = buildScenarioRosterItems(data)`，`virtual = buildScenarioRosterItems(applyScenarioPatchesToData(data, pendingChanges))`，`delta = crewMandayDelta(base, virtual, rp, rpItems)`。渲染 crewStats 列时对受影响机组 `stats.value + delta`（mcred/mbh/ybh 直接加，计数 clamp ≥0，参照 live-gantt-source）。

- [ ] **Step 2: Vitest 单测**

构造含 1 个 DO ground item 的最小 data，`pendingChanges` 删除它，断言 delta `mdo = -1`、`mcred = 0`，且渲染值 `stats.mdo + delta.mdo = 0`。

- [ ] **Step 3: 运行测试**

Run: `cd gantt && npx vitest run src/components/scenario-gantt/__tests__/scenario-gantt-source-manday-delta.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add gantt/src/components/gantt/source/scenario-gantt-source.ts gantt/src/components/scenario-gantt/__tests__/scenario-gantt-source-manday-delta.test.ts
git commit -m "feat: tier-1 optimistic RP credit delta on scenario edits
Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: Live 前端对齐 — 去立即 loadCrewStats、去法规轮询

**Files:**
- Modify: `gantt/src/stores/draft-store.ts`（保存后不再立即 `crewStore.loadCrewStats`，等 `manday-updated`）
- Modify: `gantt/src/stores/lock-store.ts`（处理 `manday-updated` / `legality-updated`）
- Modify: 移除 Live 法规轮询调用点（`pollRecheckStatus`）
- Test: Playwright `e2e/gantt/live-save-async-manday.spec.ts`（新建）

**Interfaces:**
- Consumes: `roster-updated`（现有）；`manday-updated` / `legality-updated`（Task 3 / Task 7 产出）
- Produces: Live 保存后 crew stats 由推送驱动刷新

- [ ] **Step 1: lock-store 处理新消息**

在 `roster-updated` 分支旁加 `manday-updated`（`crewIds` → `crew.loadCrewStats(ids, viewportRosterPeriod)`）与 `legality-updated`（`groupCode` → 触发对应 group 的 legality 状态刷新，复用现有 recheck status 读取）。

- [ ] **Step 2: draft-store 去掉保存后的立即 loadCrewStats**

删除 commit 成功后 `crewStore.loadCrewStats(dirtyCrewIds, viewportRosterPeriod)` 调用（保留 roster 定向刷新），改为依赖 `manday-updated` 推送。删除 Live 法规轮询启动（`pollRecheckStatus`）改等 `legality-updated`。

- [ ] **Step 3: Playwright 测试**

`e2e/gantt/live-save-async-manday.spec.ts`：拖拽一个飞行任务 → Save → 断言保存响应快（无长时间 loading）、`manday-updated` 到达后 MCred 列更新。

- [ ] **Step 4: 运行 Playwright**

Run: `cd /home/yuan.z/rois/rois-ai && npx playwright test e2e/gantt/live-save-async-manday.spec.ts --reporter=list`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add gantt/src/stores/draft-store.ts gantt/src/stores/lock-store.ts e2e/gantt/live-save-async-manday.spec.ts
git commit -m "feat: live save waits for manday/legality push instead of polling
Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 12: 场景前端去法规轮询 + 回归

**Files:**
- Modify: `gantt/src/services/scenario-legality-api.ts`（`pollScenarioLegality` 使用处改等推送）
- Modify: `gantt/src/components/scenario-gantt/scenario-recheck-indicator.tsx`（改等 `scenario-legality-updated`）
- Test: 更新受影响的既有测试（§Stale-Test）

**Interfaces:**
- Consumes: `scenario-legality-updated`（Task 7 / Task 9）
- Produces: 移除 `pollScenarioLegality` 的保存后调用

- [ ] **Step 1: 移除保存后轮询**

`scenario-gantt-view.tsx` / `scenario-recheck-indicator.tsx` 中由「保存后启动 `pollScenarioLegality`」改为依赖 `scenario-legality-updated`（Task 9 hook 已处理）；初次 mount 的 READY 状态读取保留。

- [ ] **Step 2: 更新既有测试**

搜索引用 `pollScenarioLegality` 的测试并同步（§Stale-Test——不静默改，按当前实现更新断言）。

- [ ] **Step 3: 运行 gantt 相关 Vitest + Playwright 回归**

Run: `cd gantt && npx vitest run src/components/scenario-gantt 2>&1 | tail -20` 与 `cd /home/yuan.z/rois/rois-ai && npx playwright test e2e/gantt/scenario-save-push.spec.ts --reporter=list`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add gantt/src/services/scenario-legality-api.ts gantt/src/components/scenario-gantt/scenario-recheck-indicator.tsx
git commit -m "refactor: scenario legality updates via push instead of polling
Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review 记录

- **Spec 覆盖**：§2（P0）→ Task 1-2；§3.1（worker）→ Task 3、6；§3.2（保存流程）→ Task 4-6；§3.3/3.4（推送契约/机制）→ Task 7、9；§3.5（前端）→ Task 8-12；§3.6（并发去重）→ jobId 贯穿 Task 3-6；§4（数据流）→ Task 5/8/9；§5（错误处理）→ Task 3/7/9；§6（测试）→ 各 Task 测试步骤。
- **占位符检查**：Task 7 的「schema 取值」「按实际 schema 实现」为已知实现细节（SIT schema 与 WS schema 映射需运行时确认），已标注为执行时确认项，非 TBD。
- **类型一致性**：`MandayRecomputeJobData` / `ScenarioKpiRecomputeJobData` / `handleMandayRecomputeJob` / `handleScenarioKpiRecomputeJob` / `applyScenarioPatchesToData` 在定义任务与消费任务中签名一致。
