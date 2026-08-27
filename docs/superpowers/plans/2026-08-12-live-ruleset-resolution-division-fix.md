# live-server 法规告警自动刷新 ruleset 解析修正 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 去掉 live-server 法规告警自动刷新路径里 `resolveAffected` 的 workset-103 偏好和写死的 `division='P'`，改为由调用方传入 division / ruleset id；冷启动按 division 枚举 P/C 各跑一次；删除死代码 `rule-check-trigger.ts`。

**Architecture:** 四条自动刷新路径（冷启动、roster 变更重查、法规参数变更刷新、死代码 violation bell）当前都以 `category='RULE' AND type LIKE '%LIVE%' AND enabled=true` 动态解析 workset（无硬编码 103），但 `resolveAffected` 仍用 103 偏好判定"默认 live ruleset"，且冷启动 / violation bell 写死 `division='P'`。修正：`resolveAffected` 改为返回"受影响的 enabled LIVE workset 集合"；`refreshAllLiveRulesets` 直接接收 rulesetIds；`recheckLiveRosterMutation` 按受影响 crew 的 division 过滤；冷启动枚举 P/C 各 spawn 一次并传各自 `--division`；删除无引用的 `rule-check-trigger.ts`。

**Tech Stack:** Fastify + TypeScript + Vitest（live-server）。

## Global Constraints

- 所有 workset 查询保持 `category='RULE'` + `type LIKE '%LIVE%'` + `enabled=true`（与 PBS 侧 `%PBS%` 对称，允许 `LIVE,PBS,RO` 型共用）。
- **禁止 git commit / push**（CLAUDE.md §No-Auto-Commit）：所有"Commit"步骤由用户在确认后手动执行。
- 不删除 / 不重命名除 `rule-check-trigger.ts` 以外的文件；`resolveWorksetDivision`、`spawnLiveRecheck` 签名不变。
- `live-legality.mjs` 已按 `--division` 过滤 crew（脚本侧保证 division 对应），本计划只在 spawn 时传对 `--division`。
- 优化侧（engine-server / pbs-engine）不调用本计划修改的任何 TS 函数，不消费 `rule_violation` / `rule_check_result_*`；不做优化侧改动。
- 测试命令（live-server 目录下）：`npx vitest run <file>`；涉及真实 DB 的测试需 `node --env-file=.env`（本机 .env 为 UAT schema），本计划新增测试均为 mock，无需 DB。

---

### Task 1: `resolveAffected` — 去掉 103 偏好，返回 `liveWorksetIds`

**Files:**
- Modify: `live-server/src/services/rule/legality-recheck.ts:70-75`（`AffectedRosters` 接口）、`:114-141`（`resolveAffected`）
- Modify: `live-server/tests/unit/legality-recheck.spec.ts`
- Modify: `live-server/src/__tests__/unit/legality-rules-route.test.ts:23`、`live-server/src/__tests__/unit/legality-ruleset-crud.test.ts:13`

**Interfaces:**
- Produces: `AffectedRosters` 增加字段 `liveWorksetIds: number[]`；`resolveAffected(pool, ruleId)` 返回 `{ affectsLiveDefault, liveWorksetIds, inWindowScenarioIds, outOfWindowScenarioIds, scenarioCount }`。`affectsLiveDefault = liveWorksetIds.length > 0`。

- [ ] **Step 1: 改 `AffectedRosters` 接口与 `resolveAffected`**

`legality-recheck.ts:70-75` 的接口改为：

```ts
export interface AffectedRosters {
  affectsLiveDefault: boolean
  liveWorksetIds: number[]
  inWindowScenarioIds: number[]
  outOfWindowScenarioIds: number[]
  scenarioCount: number
}
```

`resolveAffected`（当前 114-141 行）整体替换为：

```ts
export async function resolveAffected(pool: Pick<Pool, 'query'>, ruleId: number): Promise<AffectedRosters> {
  const ws = await pool.query(
    `select distinct rs.workset_id
       from rule_set rs
       join rule r on r.rule_id = rs.rule_id
      where r.id = $1`, [ruleId])
  const worksetIds = ws.rows.map((w: { workset_id: string }) => Number(w.workset_id))
  if (worksetIds.length === 0) {
    return { affectsLiveDefault: false, liveWorksetIds: [], inWindowScenarioIds: [], outOfWindowScenarioIds: [], scenarioCount: 0 }
  }

  // 受改法规影响的、当前启用的 LIVE workset —— live 自动刷新实际要重查的对象。
  // 不再用 workset 103 偏好（原 ORDER BY case when id=103 then 0 else 1 end, id limit 1）。
  const live = await pool.query(
    `select id from workset
      where id = any($1::bigint[])
        and category = 'RULE'
        and type like '%LIVE%'
        and enabled = true`, [worksetIds])
  const liveWorksetIds = live.rows.map((w: { id: string }) => Number(w.id))
  const affectsLiveDefault = liveWorksetIds.length > 0

  const sc = await pool.query(
    `select s.id,
            (s.end_dt_loc >= date_trunc('month', now())
             and s.str_dt_loc < date_trunc('month', now()) + interval '2 months') as in_window
       from ${liveSchema()}.scenario s
      where s.workset_id = any($1::bigint[]) and s.status = 'DONE'`, [worksetIds])
  const inWindowScenarioIds: number[] = []
  const outOfWindowScenarioIds: number[] = []
  for (const row of sc.rows as Array<{ id: string; in_window: boolean }>) {
    ;(row.in_window ? inWindowScenarioIds : outOfWindowScenarioIds).push(Number(row.id))
  }
  return { affectsLiveDefault, liveWorksetIds, inWindowScenarioIds, outOfWindowScenarioIds, scenarioCount: sc.rows.length }
}
```

> 注意：`resolveAffected` 位于 `legality-recheck.ts`，`liveSchema()` 已在该文件定义，无需新增 import。

- [ ] **Step 2: 重写 `tests/unit/legality-recheck.spec.ts`（修复既有失败 + 覆盖新字段）**

该测试当前因 fakePool 的 SQL 路由不匹配而失败（scenario 查询是 `from "f8".scenario s`，原 `includes('from scenario s')` 匹配不到）——本次一并修复路由，并补 `vi.hoisted` 环境变量使测试可独立加载。整体替换文件内容：

```ts
import { describe, it, expect, vi } from 'vitest'
import { resolveAffected } from '../../src/services/rule/legality-recheck.js'

vi.hoisted(() => {
  process.env.DATABASE_URL ||= 'postgres://test:test@localhost:5432/test'
  process.env.FILIALE ||= 'F8'
  process.env.LIVE_SCHEMA ||= 'f8'
})

const fakePool = (rows: Record<string, unknown[]>) => ({
  query: vi.fn(async (sql: string) => {
    if (sql.includes('from rule_set')) return { rows: rows.worksets }
    if (sql.includes("category = 'RULE'")) return { rows: rows.liveFilter }
    if (sql.includes('.scenario s')) return { rows: rows.scenarios }
    return { rows: [] }
  }),
})

describe('resolveAffected', () => {
  it('flags enabled LIVE worksets and splits scenarios into in-window / out-of-window', async () => {
    const pool = fakePool({
      worksets: [{ workset_id: '103' }, { workset_id: '460' }],
      liveFilter: [{ id: '103' }],
      scenarios: [{ id: '6', in_window: true }, { id: '460', in_window: false }],
    }) as never
    const r = await resolveAffected(pool, 8002006)
    expect(r.affectsLiveDefault).toBe(true)
    expect(r.liveWorksetIds).toEqual([103])
    expect(r.inWindowScenarioIds).toEqual([6])
    expect(r.outOfWindowScenarioIds).toEqual([460])
    expect(r.scenarioCount).toBe(2)
  })
  it('returns empty when the rule maps to no workset', async () => {
    const pool = fakePool({ worksets: [], liveFilter: [{ id: '103' }], scenarios: [] }) as never
    const r = await resolveAffected(pool, 9999999)
    expect(r.affectsLiveDefault).toBe(false)
    expect(r.liveWorksetIds).toEqual([])
    expect(r.scenarioCount).toBe(0)
  })
  it('does not treat a non-enabled workset as affecting live (no 103 preference)', async () => {
    const pool = fakePool({
      worksets: [{ workset_id: '103' }],
      liveFilter: [],   // live filter 返回空（103 未启用）
      scenarios: [],
    }) as never
    const r = await resolveAffected(pool, 8002006)
    expect(r.affectsLiveDefault).toBe(false)
    expect(r.liveWorksetIds).toEqual([])
  })
})
```

> 说明：`liveSchema()` 返回 `quoteIdentifier(env.LIVE_SCHEMA)`，scenario 查询实为 `from "f8".scenario s`，故路由用 `includes('.scenario s')`；live 过滤查询含 `category = 'RULE'`，沿用 `includes("category = 'RULE'")` 分支。

- [ ] **Step 3: 更新两个 route 测试的 `resolveAffected` mock**

`live-server/src/__tests__/unit/legality-rules-route.test.ts:23` 与 `live-server/src/__tests__/unit/legality-ruleset-crud.test.ts:13` 的 mock 返回对象补充 `liveWorksetIds: []`：

```ts
resolveAffected: vi.fn(async () => ({ inWindowScenarioIds: [], outOfWindowScenarioIds: [], affectsLiveDefault: false, liveWorksetIds: [], scenarioCount: 0 })),
```

- [ ] **Step 4: 运行测试验证**

Run:
```bash
cd live-server && npx vitest run tests/unit/legality-recheck.spec.ts src/__tests__/unit/legality-rules-route.test.ts src/__tests__/unit/legality-ruleset-crud.test.ts
```
Expected: 全部 PASS（新增"无 103 偏好"测试通过，mock 更新后 route 测试通过）。

- [ ] **Step 5: 提交**

用户确认后 commit（见 Global Constraints）。

---

### Task 2: `refreshAllLiveRulesets` 直接接收 rulesetIds；接线 PATCH 处理器

**Files:**
- Modify: `live-server/src/routes/rule/legality.ts:38-47`（`refreshAllLiveRulesets`）、`:283`（PATCH 处理器）

**Interfaces:**
- Consumes: Task 1 的 `AffectedRosters.liveWorksetIds`。
- Produces: `refreshAllLiveRulesets(fastify: FastifyInstance, rulesetIds: number[], ruleCodes?: string[] | null): Promise<void>`。

- [ ] **Step 1: 改 `refreshAllLiveRulesets` 签名与实现**

`legality.ts:38-47` 替换为：

```ts
async function refreshAllLiveRulesets(fastify: FastifyInstance, rulesetIds: number[], ruleCodes?: string[] | null): Promise<void> {
  const window = await liveRulesetRefreshWindow(fastify)
  if (!window) return
  for (const id of rulesetIds) {
    spawnLiveRecheck(fastify, String(id), window.from, window.to, ruleCodes)
  }
}
```

> 不再内部重新解析 `type LIKE '%LIVE%'`；传入的 `rulesetIds` 已由 `resolveAffected` 过滤为 enabled LIVE workset。

- [ ] **Step 2: 改 PATCH `/rule/:ruleId/params` 处理器**

`legality.ts:283` 的：

```ts
      if (affected.affectsLiveDefault) await refreshAllLiveRulesets(fastify, recheckRuleCodes)
```

替换为：

```ts
      if (affected.liveWorksetIds.length > 0) await refreshAllLiveRulesets(fastify, affected.liveWorksetIds, recheckRuleCodes)
```

> 响应体（284-290 行）的 `affectsLiveDefault` 字段保留，语义已由 Task 1 定义为"是否含启用中的 LIVE workset"。

- [ ] **Step 3: 运行测试验证**

Run:
```bash
cd live-server && npx vitest run src/__tests__/unit/legality-rules-route.test.ts src/__tests__/unit/legality-ruleset-crud.test.ts
```
Expected: PASS（mock 已含 `liveWorksetIds`，PATCH 分支用 `affected.liveWorksetIds.length`）。

- [ ] **Step 4: 提交**

用户确认后 commit。

---

### Task 3: `recheckLiveRosterMutation` 按受影响 crew 的 division 过滤

**Files:**
- Modify: `live-server/src/services/rule/legality-recheck.ts:242-263`
- Test: `live-server/src/__tests__/services/rule/legality-recheck.test.ts`（追加用例）

**Interfaces:**
- Consumes: 现有调用方（`roster.ts:33`、`roster-bulk-delete-worker.ts:139`、`draft.ts:229`、`manday-operation-service.ts:40`）均传 `crewIds`。
- Produces: `recheckLiveRosterMutation(fastify, rulesetId, dates, crewIds=[])` 签名不变；`rulesetId` 未显式给出时，仅枚举受影响 crew 所在 division 的 enabled LIVE workset。

- [ ] **Step 1: 改 enumerate 分支，按 crew.division 过滤**

`recheckLiveRosterMutation`（242-263 行）整体替换为：

```ts
export async function recheckLiveRosterMutation(
  fastify: FastifyInstance,
  rulesetId: number | string | undefined,
  dates: Array<Date | string | null | undefined>,
  crewIds: string[] = [],
): Promise<void> {
  const requested = Number(rulesetId)
  let resolved = Number.isInteger(requested) && requested > 0 ? requested : null
  let resolvedIds: number[]
  if (resolved != null) {
    const active = await fastify.pgPool.query<{ id: number }>(
      `select id from workset where id = $1 and category = 'RULE' and type like '%LIVE%' and enabled = true`, [resolved])
    if (!active.rows[0]) return
    resolvedIds = [resolved]
  } else {
    // 只重查受影响 crew 所在 division 的 enabled LIVE workset（P 法规集只查 P crew）。
    let divisions: string[] | null = null
    const crewIdList = [...new Set(crewIds.map(String).filter(Boolean))]
    if (crewIdList.length > 0) {
      const dres = await fastify.pgPool.query<{ division: string }>(
        `select distinct division from crew
          where crew_id = any($1::text[]) and division in ('P', 'C')`, [crewIdList])
      const ds = dres.rows.map((r) => r.division)
      if (ds.length > 0) divisions = ds
    }
    const active = divisions != null
      ? await fastify.pgPool.query<{ id: number }>(
          `select id from workset
           where category = 'RULE' and type like '%LIVE%' and enabled = true and division = any($1::text[])
           order by division, id`, [divisions])
      : await fastify.pgPool.query<{ id: number }>(
          `select id from workset
           where category = 'RULE' and type like '%LIVE%' and enabled = true
           order by division, id`)
    resolvedIds = active.rows.map((row) => Number(row.id)).filter((id) => Number.isInteger(id) && id > 0)
  }
  if (resolvedIds.length === 0) return

  // —— 以下 266 行起不变：timestamps / focus / window / per-workset spawn ——
```

> 保留 266-293 行原有逻辑（`timestamps`、`focusCrewIds`、`mutationRefreshWindow`、循环 `spawnLiveRecheck`）不动。

- [ ] **Step 2: 追加测试**

在 `live-server/src/__tests__/services/rule/legality-recheck.test.ts` 的 `recheckLiveRosterMutation window` describe 内追加：

```ts
  it('filters enabled LIVE worksets by the affected crews\' division (P-only crew → only P workset)', async () => {
    const fastify = {
      redis: { set: vi.fn().mockResolvedValue('OK'), get: vi.fn().mockResolvedValue('computing') },
      log: { error: vi.fn() },
      pgPool: { query: vi.fn((sql: string) => {
        if (String(sql).includes('distinct division from crew')) {
          return Promise.resolve({ rows: [{ division: 'P' }] })
        }
        if (String(sql).includes('division = any')) {
          return Promise.resolve({ rows: [{ id: 103 }] })  // 只返回 P workset
        }
        return Promise.resolve({ rows: [] })
      }) },
    } as any

    await recheckLiveRosterMutation(fastify, undefined, ['2026-09-26T20:20:00.000Z'], ['2438'])
    await new Promise((r) => setImmediate(r))

    expect(spawn).toHaveBeenCalledOnce()
    const args = (spawn as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1] as string[]
    expect(args[args.indexOf('--group') + 1]).toBe('103')
    expect(args[args.indexOf('--division') + 1]).toBe('P')
  })

  it('falls back to all enabled LIVE worksets when crews have no resolvable division', async () => {
    const fastify = {
      redis: { set: vi.fn().mockResolvedValue('OK'), get: vi.fn().mockResolvedValue('computing') },
      log: { error: vi.fn() },
      pgPool: { query: vi.fn((sql: string) => {
        if (String(sql).includes('distinct division from crew')) {
          return Promise.resolve({ rows: [] })  // 无 P/C division
        }
        if (String(sql).includes('enabled = true')) {
          return Promise.resolve({ rows: [{ id: 103 }, { id: 637 }] })
        }
        return Promise.resolve({ rows: [] })
      }) },
    } as any

    await recheckLiveRosterMutation(fastify, undefined, ['2026-09-26T20:20:00.000Z'], ['2438'])
    await new Promise((r) => setImmediate(r))

    expect(spawn).toHaveBeenCalledTimes(2)
  })
```

- [ ] **Step 3: 运行测试验证**

Run:
```bash
cd live-server && npx vitest run src/__tests__/services/rule/legality-recheck.test.ts
```
Expected: PASS（原有 3 个显式 rulesetId 用例不受影响；新增 2 个 division 过滤用例通过）。

- [ ] **Step 4: 提交**

用户确认后 commit。

---

### Task 4: 删除死代码 `rule-check-trigger.ts` 与其测试

**Files:**
- Delete: `live-server/src/services/rule-check/rule-check-trigger.ts`
- Delete: `live-server/src/__tests__/unit/rule-check-trigger.test.ts`

- [ ] **Step 1: 确认无引用**

Run（在 live-server 目录）：
```bash
grep -rn "enqueueRuleCheckForMutation\|rule-check-trigger\|getDefaultRulesetId" src/ --include="*.ts" | grep -v "\.test\."
```
Expected: 无输出（src 内无引用；`dist/` 为陈旧产物，忽略）。

- [ ] **Step 2: 删除文件**

```bash
rm live-server/src/services/rule-check/rule-check-trigger.ts live-server/src/__tests__/unit/rule-check-trigger.test.ts
```

- [ ] **Step 3: 全仓 grep 断言无残留**

```bash
grep -rn "rule-check-trigger" live-server/src/ | head
```
Expected: 无输出。

- [ ] **Step 4: 运行相关测试确认不破坏**

Run:
```bash
cd live-server && npx vitest run src/__tests__/unit/rule-check-trigger.test.ts 2>&1 | tail -3
```
Expected: 文件已删（vitest 报 test file not found 可忽略）；随后跑 Task 3 的 `legality-recheck.test.ts` 确认 PASS。

- [ ] **Step 5: 提交**

用户确认后 commit。

---

### Task 5: `runLegalityOnStartup` 提取为可测模块，枚举 P/C 各跑一次并传 `--division`

**Files:**
- Create: `live-server/src/services/rule/legality-coldstart.ts`
- Modify: `live-server/src/index.ts:75-138`（删除内联 `runLegalityOnStartup`，改为 import 调用）
- Test: `live-server/src/__tests__/services/rule/legality-coldstart.test.ts`

**Interfaces:**
- Produces: `runLegalityOnStartup(fastify: FastifyInstance, filiale: string): Promise<void>`。

- [ ] **Step 1: 新建 `legality-coldstart.ts`**

```ts
import path from 'node:path'
import { spawn } from 'node:child_process'
import type { FastifyInstance } from 'fastify'

// ── cold-start Rust legality reload ──────────────────────────────────────────
// Spawns `node scripts/live-legality.mjs` per enabled LIVE workset (P and C) for a
// rolling 3-month window centred on today so the gantt bell + Alert Center reflect
// current roster state right after the server boots. Each workset spawn passes its
// OWN --division so live-legality only checks crews of that division (P ruleset → P
// crews, C ruleset → C crews; never cross-checked).
export async function runLegalityOnStartup(fastify: FastifyInstance, filiale: string): Promise<void> {
  const r = await fastify.pgPool.query<{ id: number; division: string }>(
    `select id, division from workset
      where category = 'RULE' and type like '%LIVE%' and enabled = true
      order by division, id`)
  if (!r.rows[0]) {
    fastify.log.warn('cold-start: no enabled LIVE RULE workset found, skipping legality reload')
    return
  }
  const today = new Date()
  const from = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1))
  const to = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 2, 0))
  const fmt = (d: Date) => d.toISOString().slice(0, 10)
  const script = path.resolve(process.cwd(), 'scripts/live-legality.mjs')

  for (const ws of r.rows) {
    const rulesetId = String(ws.id)
    const statusKey = `legality:recheck:${filiale}:${rulesetId}:status`
    const metaKey = `legality:recheck:${filiale}:${rulesetId}:meta`
    const startedAt = new Date().toISOString()
    const startedMs = Date.now()

    const writeMeta = (status: 'computing' | 'done' | 'failed', durationSec?: number) =>
      void fastify.redis
        .set(metaKey, JSON.stringify({
          status,
          startedAt,
          finishedAt: status === 'computing' ? null : new Date().toISOString(),
          ...(durationSec != null ? { durationSec } : {}),
          ruleCodes: null,
          ruleCount: 0,
          rangeDays: Math.round((to.getTime() - from.getTime()) / 86400000),
        }))
        .catch(() => undefined)
    writeMeta('computing')

    const args = [script, '--group', rulesetId, '--from', fmt(from), '--to', fmt(to)]
    if (ws.division) args.push('--division', ws.division)

    const child = spawn(process.execPath, args, { detached: true, stdio: 'ignore' })
    child.on('error', (err) => {
      fastify.log.error({ err }, 'cold-start live-legality spawn failed')
      writeMeta('failed')
      void fastify.redis.set(statusKey, 'failed')
    })
    child.on('exit', (code) => {
      const durationSec = (Date.now() - startedMs) / 1000
      if (code === 0) return
      fastify.log.error({ code }, 'cold-start live-legality exited non-zero')
      void fastify.redis.get(statusKey).then((s: string | null) => {
        if (s === 'computing') {
          writeMeta('failed', durationSec)
          return fastify.redis.set(statusKey, 'failed')
        }
      })
    })
    child.unref()
    fastify.log.info(
      { rulesetId, division: ws.division ?? null, from: fmt(from), to: fmt(to) },
      'cold-start: Rust legality recheck spawned (detached)',
    )
  }
}
```

- [ ] **Step 2: 改 `index.ts` 引用**

删除 `live-server/src/index.ts:75-138` 的内联 `runLegalityOnStartup` 函数（含其上注释块），在 import 区新增：

```ts
import { runLegalityOnStartup } from './services/rule/legality-coldstart.js'
```

`:310` 的调用保持不变（`runLegalityOnStartup(server, filiale)`）。

- [ ] **Step 3: 新建测试 `legality-coldstart.test.ts`**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.hoisted(() => {
  process.env.DATABASE_URL ||= 'postgres://test:test@localhost:5432/test'
  process.env.FILIALE ||= 'F8'
})

const handlers: Record<string, (arg?: unknown) => void> = {}
const fakeChild = {
  on: vi.fn((evt: string, cb: (arg?: unknown) => void) => {
    handlers[evt] = cb
    return fakeChild
  }),
  unref: vi.fn(),
}
vi.mock('node:child_process', () => ({ spawn: vi.fn(() => fakeChild) }))

import { spawn } from 'node:child_process'
import { runLegalityOnStartup } from '../../../services/rule/legality-coldstart.js'

const createFastify = (worksets: Array<{ id: number; division: string }>) => ({
  pgPool: { query: vi.fn(async () => ({ rows: worksets })) },
  redis: { set: vi.fn().mockResolvedValue('OK'), get: vi.fn().mockResolvedValue('computing') },
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
} as any)

describe('runLegalityOnStartup', () => {
  beforeEach(() => {
    for (const k of Object.keys(handlers)) delete handlers[k]
    vi.clearAllMocks()
  })

  it('spawns one live-legality per enabled LIVE workset with its OWN --division', async () => {
    const fastify = createFastify([
      { id: 103, division: 'P' },
      { id: 637, division: 'C' },
    ])
    await runLegalityOnStartup(fastify, 'F8')
    expect(spawn).toHaveBeenCalledTimes(2)

    const calls = (spawn as unknown as ReturnType<typeof vi.fn>).mock.calls.map((c: unknown[]) => c[1] as string[])
    const p = calls.find((a) => a.includes('--division') && a[a.indexOf('--division') + 1] === 'P')
    const c = calls.find((a) => a.includes('--division') && a[a.indexOf('--division') + 1] === 'C')
    expect(p?.[p.indexOf('--group') + 1]).toBe('103')
    expect(c?.[c.indexOf('--group') + 1]).toBe('637')
  })

  it('skips when no enabled LIVE workset exists', async () => {
    const fastify = createFastify([])
    await runLegalityOnStartup(fastify, 'F8')
    expect(spawn).not.toHaveBeenCalled()
    expect(fastify.log.warn).toHaveBeenCalled()
  })
})
```

- [ ] **Step 4: 运行测试验证**

Run:
```bash
cd live-server && npx vitest run src/__tests__/services/rule/legality-coldstart.test.ts
```
Expected: PASS（断言 103→P、637→C 各 spawn 一次，`--division` 对应正确）。

- [ ] **Step 5: 全量相关测试回归**

Run:
```bash
cd live-server && npx vitest run tests/unit/legality-recheck.spec.ts src/__tests__/services/rule/legality-recheck.test.ts src/__tests__/services/rule/legality-coldstart.test.ts src/__tests__/unit/legality-rules-route.test.ts src/__tests__/unit/legality-ruleset-crud.test.ts
```
Expected: 全部 PASS。

- [ ] **Step 6: 提交**

用户确认后 commit。

---

## Self-Review 备注

- Spec §3.1→Task 1、§3.2→Task 2、§3.3→Task 3、§3.4→Task 4、§3.5→Task 5，逐条对应。
- 优化侧（engine-server / pbs-engine）不调用被改函数、不消费 `rule_violation`；`legacy_ro_converter.py:336` / Rust connector 的 103 仅为防御兜底，不在此计划范围。
- 所有 workset 查询沿用 `category='RULE'` + `type LIKE '%LIVE%'` + `enabled=true`，未引入精确 `type='LIVE'`。
- 新增/修改测试均为 mock，不依赖真实 DB。
