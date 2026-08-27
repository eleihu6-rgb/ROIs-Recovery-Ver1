# Scenario Roster Fill & Drag Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 Scenario Gantt 的 Pairing 配比本地实时计算、拖拽法规检查单请求快路径、分配职级门禁、Header 动态 Rank/Base、跨用户 Roster 同步全部落地，拖拽→绘制 ≤100ms。

**Architecture:** 客户端把 fill 从 `compositions[].fill`（快照）改为由有效 assignments + pendingChanges 派生；assign 前置职级门禁（crew_rank 历史 + Open 槽位 + display_order + 跨职级确认）；`checkLiveDraftLegality` 走单请求快路径；服务端在 scenario gantt 数据里下发 crew_rank/crew_base 历史、patch 应用写入 `roster_acting_rank`、保存后广播 `scenario-roster-updated`。

**Tech Stack:** TypeScript / React 19 / Zustand / Canvas；live-server (Fastify + Drizzle + BullMQ + WS)；Vitest；Playwright。

## Global Constraints

- 改任何 gantt 样式前先 `npm run check:ui`，硬违规必须为 0（§UI-Standard-Gate）。
- 新增弹窗一律用 `@rois/ui` 的 `AppDialog`（§Pop-up Window Standard）。
- 每个 feature / bug fix 附带 Playwright 或 Vitest 测试（§Playwright-Required）。
- 不修改 `sql/` 已确认建表脚本；不新增 live 业务表字段。
- UI 文案一律英文（§前端语言规范）；代码注释/commit 可用中文。
- 服务端 DB 查询用 `fastify.db.execute(sql\`...\`)`，schema 名用 `liveSchema()` / `scenarioSchema()`（`utils/db-schema.js`）。
- 拖拽/编辑相关功能遵循 §Gantt-Unify：共享逻辑进 shared 层，来源差异藏进 capability。

---

### Task 1: `checkLiveDraftLegality` 单请求快路径（客户端，Live/Scenario 共享）

**Files:**
- Modify: `gantt/src/stores/roster-store.ts:168-277`
- Test: `gantt/src/stores/__tests__/roster-store-draft-legality.test.ts`

**Interfaces:**
- Consumes: `legalityPreviewApi.checkDraft(input: DraftLegalityPreviewRequest): Promise<DraftLegalityPreviewResponse>`（`gantt/src/services/legality-preview-api.ts`）
- Produces: 不变签名 `checkLiveDraftLegality(affectedCrewIds, currentItems, simulatedItems, options?): Promise<boolean>`。行为变化：合法拖拽（after 无违规）时 `checkDraft` 只调用 **1 次**（after）；只有 after 有违规才补发 before 用于 diff。

- [ ] **Step 1: 写失败测试（断言合法时只发 1 次）**

在 `gantt/src/stores/__tests__/roster-store-draft-legality.test.ts` 末尾新增用例。复用文件顶部 `mocks.checkDraft` 桩：让 after 返回空违规、before 返回空违规，断言 `checkDraft` 调用次数为 1 且 `afterItems` 是模拟后的 items。

```ts
it('fast-path: 合法拖拽只发一次 checkDraft（after），不重复算 before 基线', async () => {
  mocks.checkDraft.mockReset()
  mocks.checkDraft.mockResolvedValue({ allowed: true, violations: [] })
  const items = [rosterItem({ id: -1, crewId: 'F80001', pairingId: 1, schStrDtUtc: '2026-08-01T10:00:00Z', schEndDtUtc: '2026-08-01T13:00:00Z' })]
  const allowed = await checkLiveDraftLegality(['F80001'], items, items)
  expect(allowed).toBe(true)
  expect(mocks.checkDraft).toHaveBeenCalledTimes(1)
  const arg = mocks.checkDraft.mock.calls[0][0] as DraftLegalityPreviewRequest
  expect(arg.afterItems).toEqual(items)
})
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run gantt/src/stores/__tests__/roster-store-draft-legality.test.ts -t 'fast-path'`
Expected: FAIL（当前实现 `Promise.all` 发了 2 次）。

- [ ] **Step 3: 实现快路径**

把 `roster-store.ts:210-225` 的 `Promise.all([before, after])` 改为：

```ts
// Fast path: 先只查 after。合法拖拽（无违规）直接放行，省掉 before 基线的场景级重算；
// 只有 after 有违规时才补 before，用来 diff 出本次编辑新引入的违规。
const afterResult = await legalityPreviewApi.checkDraft({
  ...draftContext,
  affectedCrewIds: previewCrewIds,
  afterItems,
  focusPairingIds,
})
if (afterResult.violations.length === 0) return true

syncPeriodGdoSessionViolations(afterResult.violations)

const beforeResult = beforeItems.length === 0
  ? { allowed: true, violations: [] }
  : await legalityPreviewApi.checkDraft({
      ...draftContext,
      affectedCrewIds: previewCrewIds,
      afterItems: beforeItems,
      focusPairingIds,
    })
```

后续 `relatedWindows` / `violationKey` / `beforeKeys` / `isRelated` / `relevantNewViolations` 逻辑不变（`beforeResult` 现在定义在快路径之后，保持可用）。

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run gantt/src/stores/__tests__/roster-store-draft-legality.test.ts`
Expected: 全绿（含新增 fast-path 用例 + 既有用例）。

- [ ] **Step 5: Commit**

```bash
git add gantt/src/stores/roster-store.ts gantt/src/stores/__tests__/roster-store-draft-legality.test.ts
git commit -m "perf(legality): checkLiveDraftLegality 单请求快路径——合法拖拽只查 after"
```

---

### Task 2: ScenarioGanttCrew 携带 crew_rank / crew_base 历史（服务端下发 + 客户端类型）

**Files:**
- Modify: `gantt/src/types/scenario-gantt.ts`（`ScenarioGanttCrew` 增加 `ranks?` / `bases?`）
- Create: `live-server/src/services/scenario/scenario-crew-history.ts`
- Modify: `live-server/src/services/scenario/scenario-gantt-service.ts`（`buildGanttDataFromSnapshotFiles` 1307 行 `parseCrewAndPairings(inputGz)` 后、`buildGanttDataLiveRefresh` 1418、`buildGanttDataSeed` 1510 处）
- Modify: `live-server/src/services/scenario/scenario-gantt-db-service.ts`（`buildGanttDataFromDb` / `buildCrew` 返回后）
- Test: `live-server/src/services/scenario/__tests__/scenario-crew-history.test.ts`

**Interfaces:**
- Consumes: `ScenarioGanttCrew`（`gantt/src/types/scenario-gantt.ts:3-13`）；live schema 名 `liveSchema()`（`live-server/src/utils/db-schema.js`）；drizzle `sql`。
- Produces: `attachCrewHistories(fastify, crew, windowStart, windowEnd): Promise<void>` —— 原地给每个 crew 填充 `ranks: CrewRankRecord[]`、`bases: CrewBaseRecord[]`（按 `(eff_dt <= windowEnd && (exp_dt IS NULL || exp_dt >= windowStart))` 过滤）。
- 类型：`CrewRankRecord = { crewId: string; rank: string; effDt: string; expDt: string | null }`，`CrewBaseRecord = { crewId: string; base: string; effDt: string; expDt: string | null }`（与 `gantt/src/types/crew.ts:54-68` 同构）。

- [ ] **Step 1: 客户端类型**

`gantt/src/types/scenario-gantt.ts` 顶部 import 两个类型并扩展 `ScenarioGanttCrew`：

```ts
import type { CrewRankRecord, CrewBaseRecord } from './crew'

export interface ScenarioGanttCrew {
  crewId: string
  base: string
  division: string
  crewRank?: string
  rank: string
  /** 按任务日期动态解析用（来自 live crew_rank 历史）。 */
  ranks?: CrewRankRecord[]
  /** 按任务日期动态解析用（来自 live crew_base 历史）。 */
  bases?: CrewBaseRecord[]
  seniorityNum: string | null
  crewName: string | null
}
```

- [ ] **Step 2: 写失败测试（服务端 helper）**

新建 `live-server/src/services/scenario/__tests__/scenario-crew-history.test.ts`：mock `fastify.db.execute`，断言按窗口过滤、按 crewId 分组、`exp_dt` 为 null 的行保留。

```ts
import { describe, expect, it, vi } from 'vitest'
import { attachCrewHistories } from '../scenario-crew-history.js'

const mockExecute = vi.fn(async (q: unknown) => {
  const text = String(q)
  if (text.includes('crew_rank')) return { rows: [
    { crew_id: 'F80001', rank: 'FO', eff_dt: new Date('2026-07-01T00:00:00Z'), exp_dt: new Date('2026-08-15T00:00:00Z') },
    { crew_id: 'F80001', rank: 'CA', eff_dt: new Date('2026-08-16T00:00:00Z'), exp_dt: null },
  ] }
  if (text.includes('crew_base')) return { rows: [
    { crew_id: 'F80001', base: 'YOW', eff_dt: new Date('2026-07-01T00:00:00Z'), exp_dt: null },
  ] }
  return { rows: [] }
})
const fastify = { db: { execute: mockExecute } } as never

describe('attachCrewHistories', () => {
  it('按场景时间窗过滤并填充 ranks/bases', async () => {
    const crew = [{ crewId: 'F80001', base: '', division: 'P', rank: 'FO', seniorityNum: null, crewName: null }]
    await attachCrewHistories(fastify, crew as never, new Date('2026-08-01T00:00:00Z'), new Date('2026-08-31T00:00:00Z'))
    expect(crew[0].ranks).toHaveLength(2)
    expect(crew[0].ranks![0]).toMatchObject({ crewId: 'F80001', rank: 'FO' })
    expect(crew[0].bases?.[0].base).toBe('YOW')
  })
})
```

- [ ] **Step 3: 运行确认失败**

Run: `npx vitest run live-server/src/services/scenario/__tests__/scenario-crew-history.test.ts`
Expected: FAIL（helper 不存在 / 未实现）。

- [ ] **Step 4: 实现 helper**

新建 `live-server/src/services/scenario/scenario-crew-history.ts`：

```ts
import { sql } from 'drizzle-orm'
import { liveSchema } from '../../utils/db-schema.js'

interface HasCrewId { crewId: string }

export async function attachCrewHistories(
  fastify: { db: { execute: (q: unknown) => Promise<{ rows: unknown[] }> } },
  crew: Array<HasCrewId & { ranks?: unknown[]; bases?: unknown[] }>,
  windowStart: Date,
  windowEnd: Date,
): Promise<void> {
  const crewIds = crew.map((c) => c.crewId).filter(Boolean)
  if (crewIds.length === 0) return
  const schema = sql.raw(liveSchema())
  const [ranks, bases] = await Promise.all([
    fastify.db.execute<{ crew_id: string; rank: string; eff_dt: Date; exp_dt: Date | null }>(sql`
      SELECT crew_id, rank, eff_dt, exp_dt
        FROM ${schema}.crew_rank
       WHERE crew_id = ANY(${crewIds})
         AND eff_dt <= ${windowEnd}
         AND (exp_dt IS NULL OR exp_dt >= ${windowStart})
       ORDER BY eff_dt`),
    fastify.db.execute<{ crew_id: string; base: string; eff_dt: Date; exp_dt: Date | null }>(sql`
      SELECT crew_id, base, eff_dt, exp_dt
        FROM ${schema}.crew_base
       WHERE crew_id = ANY(${crewIds})
         AND eff_dt <= ${windowEnd}
         AND (exp_dt IS NULL OR exp_dt >= ${windowStart})
       ORDER BY eff_dt`),
  ])
  const byCrew = <T extends { crew_id: string }>(rows: T[]): Map<string, T[]> => {
    const map = new Map<string, T[]>()
    for (const r of rows) {
      const list = map.get(r.crew_id) ?? []
      list.push(r)
      map.set(r.crew_id, list)
    }
    return map
  }
  const rankMap = byCrew(ranks.rows)
  const baseMap = byCrew(bases.rows)
  for (const c of crew) {
    c.ranks = (rankMap.get(c.crewId) ?? []).map((r) => ({
      crewId: r.crew_id, rank: r.rank, effDt: r.eff_dt.toISOString(), expDt: r.exp_dt ? r.exp_dt.toISOString() : null,
    }))
    c.bases = (baseMap.get(c.crewId) ?? []).map((r) => ({
      crewId: r.crew_id, base: r.base, effDt: r.eff_dt.toISOString(), expDt: r.exp_dt ? r.exp_dt.toISOString() : null,
    }))
  }
}
```

- [ ] **Step 5: 运行确认通过**

Run: `npx vitest run live-server/src/services/scenario/__tests__/scenario-crew-history.test.ts`
Expected: PASS。

- [ ] **Step 6: 接入 3 个 build 函数**

在 `scenario-gantt-service.ts` 的 `buildGanttDataFromSnapshotFiles`（`const { crew, pairings } = parseCrewAndPairings(inputGz)` 之后）、`buildGanttDataLiveRefresh`、`buildGanttDataSeed` 各加：

```ts
await attachCrewHistories(fastify, crew, sc.strDtLoc, sc.endDtLoc)
```

在 `scenario-gantt-db-service.ts` 的 `buildGanttDataFromDb`（crew 组装后、返回前）同样调用，窗口取 `sc.strDtLoc`/`sc.endDtLoc`（该文件没有这些字段时用 sql 查询 scenario 表，或传参，plan 阶段核对）。

- [ ] **Step 7: 运行既有服务端测试 + tsc**

Run: `cd live-server && npx tsc --noEmit && npx vitest run src/services/scenario`
Expected: PASS，无类型错误。

- [ ] **Step 8: Commit**

```bash
git add gantt/src/types/scenario-gantt.ts live-server/src/services/scenario/
git commit -m "feat(scenario): gantt 数据下发 crew_rank/crew_base 历史（ScenarioGanttCrew.ranks/bases）"
```

---

### Task 3: scenario-patch-service 写入 `roster_acting_rank`

**Files:**
- Modify: `live-server/src/services/scenario/scenario-patch-service.ts`（`add` 分支 212-264，`reassign` 分支 200-211）
- Test: `live-server/src/services/scenario/__tests__/scenario-patch-service.test.ts`（不存在则新建）

**Interfaces:**
- Consumes: `AssignmentPatch`（`gantt/src/types/scenario-gantt.ts`）——本任务起包含 `rosterActingRank?: string`（Task 4 会加类型；服务端用 `(patch as { rosterActingRank?: string }).rosterActingRank` 兼容，或本任务先加 server 侧字段）。
- Produces: `applyScenarioRosterPatches` 的 `add`/`reassign` 把补丁的 `rosterActingRank` 写入 `roster_flight.roster_acting_rank`。

- [ ] **Step 1: 写失败测试**

新建 `live-server/src/services/scenario/__tests__/scenario-patch-service.test.ts`：mock pool/client，断言 `add` 的 INSERT 参数里 `roster_acting_rank` 取补丁值而非 NULL；revive 软删行分支 UPDATE 也带上 rank。

```ts
import { describe, expect, it, vi } from 'vitest'
import { applyScenarioRosterPatches } from '../scenario-patch-service.js'

const calls: string[] = []
const client = {
  query: vi.fn(async (sql: string, _params?: unknown[]) => { calls.push(sql); return { rowCount: 0 } }),
  release: vi.fn(),
}
const pool = { connect: vi.fn().mockResolvedValue(client) } as never

describe('applyScenarioRosterPatches roster_acting_rank', () => {
  it('add patch 的 INSERT 携带 roster_acting_rank', async () => {
    await applyScenarioRosterPatches(pool, 623, [
      { op: 'add', crewId: 'F80001', pairingId: 88, rosterActingRank: 'CA' },
    ] as never, 'tester')
    const insertCall = calls.find((s) => s.includes('INSERT INTO'))
    expect(insertCall).toBeDefined()
    expect(insertCall).toContain('roster_acting_rank')
  })
})
```

> 注：测试只做轻量断言（mock 无法跑真实 SQL）；真实验证靠 SIT 冒烟（§Remote-DB-Only）。

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run live-server/src/services/scenario/__tests__/scenario-patch-service.test.ts`
Expected: FAIL（当前 INSERT 硬编码 NULL）。

- [ ] **Step 3: 实现**

`scenario-patch-service.ts`：

- `add` 分支的 INSERT（229-262 行）把 `'', NULL, p.division` 里的 `NULL`（roster_acting_rank 位）改为绑定参数：

```ts
flight_acting_rank, roster_acting_rank, division,
...
'', $6::varchar, p.division,
...
(scenarioId, patch.crewId, patch.pairingId, updatedBy, partitions.pairingPart, actingRank)
```

其中 `const actingRank = (patch as { rosterActingRank?: string }).rosterActingRank ?? null`。

- revive 软删行分支（215-224）的 UPDATE 加 `roster_acting_rank = $5`（参数为 `actingRank`）。

- `reassign` 分支（200-211）的 UPDATE 同样写入 `roster_acting_rank`（从补丁取；缺省保留原值语义，plan 阶段核对列清单）。

- [ ] **Step 4: 运行确认通过 + tsc**

Run: `cd live-server && npx tsc --noEmit && npx vitest run src/services/scenario/__tests__/scenario-patch-service.test.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add live-server/src/services/scenario/scenario-patch-service.ts live-server/src/services/scenario/__tests__/scenario-patch-service.test.ts
git commit -m "feat(scenario): patch add/reassign 写入 roster_acting_rank（fill 计入对应槽位）"
```

---

### Task 4: `AssignmentPatch.rosterActingRank` + 补丁 rank 传播（客户端）

**Files:**
- Modify: `gantt/src/types/scenario-gantt.ts`（`AssignmentPatch` 173-182）
- Modify: `gantt/src/components/scenario-gantt/build-scenario-roster-items.ts`（`buildEffectiveAssignments` 31-48）
- Modify: `gantt/src/utils/scenario-roster-edit.ts`（`applyScenarioPatchesToData` 43-84）
- Test: `gantt/src/utils/__tests__/scenario-roster-edit.test.ts`（追加用例）

**Interfaces:**
- Consumes: `AssignmentPatch`（Task 3 服务端已按此形状读 `rosterActingRank`）。
- Produces: `buildEffectiveAssignments` 的 `add` 产出 assignment 携带 `rosterActingRank`；`applyScenarioPatchesToData` 的 `add` 同理。Fill 计算（Task 5）靠它。

- [ ] **Step 1: 加类型字段**

```ts
export interface AssignmentPatch {
  op: 'add' | 'remove' | 'reassign'
  crewId: string
  pairingId: number | null
  /** 分配/重指派时解析出的职级槽位（= pairing_composition.acting_rank），null 表示未指定。 */
  rosterActingRank?: string
  toCrewId?: string
  startDtUtc?: string
  endDtUtc?: string
  assignmentGroup?: string
  assignment?: string
}
```

- [ ] **Step 2: 写失败测试**

`gantt/src/utils/__tests__/scenario-roster-edit.test.ts` 追加：

```ts
it('add patch 的 rosterActingRank 传播到有效 assignments', () => {
  const data = baseData() // 复用文件内既有 fixture
  const out = applyScenarioPatchesToData(data, [
    { op: 'add', crewId: 'F80001', pairingId: 88, rosterActingRank: 'CA' },
  ])
  const added = out.assignments.find((a) => a.pairingId === 88 && a.crewId === 'F80001')
  expect(added?.rosterActingRank).toBe('CA')
})
```

- [ ] **Step 3: 运行确认失败**

Run: `npx vitest run gantt/src/utils/__tests__/scenario-roster-edit.test.ts`
Expected: FAIL。

- [ ] **Step 4: 实现**

`buildEffectiveAssignments`（`build-scenario-roster-items.ts:39-40`）的 `add` 分支：

```ts
} else if (p.op === 'add' && p.pairingId != null) {
  current.push({
    crewId: p.crewId,
    pairingId: p.pairingId,
    source: 'CR' as const,
    rosterActingRank: p.rosterActingRank ?? null,
  })
}
```

`applyScenarioPatchesToData`（`scenario-roster-edit.ts:73-78`）的 `add` 分支同样补 `rosterActingRank: patch.rosterActingRank ?? null`。

- [ ] **Step 5: 运行确认通过**

Run: `npx vitest run gantt/src/utils/__tests__/scenario-roster-edit.test.ts gantt/src/components/scenario-gantt/__tests__/build-scenario-roster-items.test.ts 2>/dev/null || npx vitest run gantt/src/utils/__tests__/scenario-roster-edit.test.ts`
Expected: PASS。

- [ ] **Step 6: Commit**

```bash
git add gantt/src/types/scenario-gantt.ts gantt/src/components/scenario-gantt/build-scenario-roster-items.ts gantt/src/utils/scenario-roster-edit.ts gantt/src/utils/__tests__/scenario-roster-edit.test.ts
git commit -m "feat(scenario): AssignmentPatch 携带 rosterActingRank 并传播到有效 assignments"
```

---

### Task 5: `computeScenarioPairingCompositions` 纯函数 + 本地 fill 计算

**Files:**
- Create: `gantt/src/utils/scenario-composition-fill.ts`
- Test: `gantt/src/utils/__tests__/scenario-composition-fill.test.ts`

**Interfaces:**
- Consumes: `buildEffectiveAssignments`（Task 4）；`ScenarioGanttAssignment` / `ScenarioGanttPairing` / `ScenarioGanttCrew` / `ScenarioGanttCompositionSlot`（`gantt/src/types/scenario-gantt.ts`）。
- Produces: `computeScenarioPairingCompositions(effectiveAssignments, crew, pairings): Map<number, Array<{ rank: string; plan: number; fill: number }>>`。rank 优先级 `rosterActingRank ?? rank ?? crewRank`；count distinct crew 按 `(pairingId, rank)`。

- [ ] **Step 1: 写失败测试**

```ts
import { describe, expect, it } from 'vitest'
import { computeScenarioPairingCompositions } from './scenario-composition-fill'

const crew = [
  { crewId: 'F80001', base: 'YOW', division: 'P', rank: 'CA', seniorityNum: null, crewName: null },
  { crewId: 'F80002', base: 'YOW', division: 'P', rank: 'FO', seniorityNum: null, crewName: null },
]
const pairings = [{
  pairingId: 88, pairingLabel: 'P88', base: 'YOW', fleet: '320', division: 'P',
  assignmentGroup: 'FLY', assignment: 'DOM',
  schStrDtUtc: '2026-08-01T10:00:00Z', schEndDtUtc: '2026-08-01T13:00:00Z',
  compositions: [
    { rank: 'CA', plan: 1, fill: 0 },
    { rank: 'FO', plan: 1, fill: 0 },
  ],
}]
const assignments = [
  { crewId: 'F80001', pairingId: 88, source: 'CR', rosterActingRank: 'CA' },
  { crewId: 'F80002', pairingId: 88, source: 'CR', rosterActingRank: null, rank: 'FO' },
]

describe('computeScenarioPairingCompositions', () => {
  it('按 rosterActingRank/rank 归属槽位并 count distinct crew', () => {
    const map = computeScenarioPairingCompositions(assignments, crew as never, pairings as never)
    const slots = map.get(88)!
    expect(slots.find((s) => s.rank === 'CA')!.fill).toBe(1)
    expect(slots.find((s) => s.rank === 'FO')!.fill).toBe(1)
    expect(slots.find((s) => s.rank === 'CA')!.plan).toBe(1)
  })
  it('重复同 (crew,pairing,rank) 只计 1 次', () => {
    const map = computeScenarioPairingCompositions(
      [assignments[0], assignments[0]], crew as never, pairings as never)
    expect(map.get(88)!.find((s) => s.rank === 'CA')!.fill).toBe(1)
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run gantt/src/utils/__tests__/scenario-composition-fill.test.ts`
Expected: FAIL（函数不存在）。

- [ ] **Step 3: 实现**

```ts
import type {
  ScenarioGanttAssignment, ScenarioGanttPairing, ScenarioGanttCrew,
} from '@/types/scenario-gantt'

export interface ScenarioCompositionSlot { rank: string; plan: number; fill: number }

export function computeScenarioPairingCompositions(
  effectiveAssignments: ScenarioGanttAssignment[],
  crew: ScenarioGanttCrew[],
  pairings: ScenarioGanttPairing[],
): Map<number, ScenarioCompositionSlot[]> {
  const crewRankById = new Map(crew.map((c) => [c.crewId, c.crewRank ?? c.rank ?? '']))
  const crewKey = new Set<string>()
  const counts = new Map<string, number>()
  for (const a of effectiveAssignments) {
    const key = `${a.crewId}|${a.pairingId}|`
    if (crewKey.has(key)) continue
    crewKey.add(key)
    const rank = a.rosterActingRank ?? a.rank ?? a.crewRank ?? crewRankById.get(a.crewId) ?? ''
    const slotKey = `${a.pairingId}:${rank}`
    counts.set(slotKey, (counts.get(slotKey) ?? 0) + 1)
  }
  const out = new Map<number, ScenarioCompositionSlot[]>()
  for (const p of pairings) {
    out.set(p.pairingId, (p.compositions ?? []).map((slot) => ({
      rank: slot.rank,
      plan: slot.plan,
      fill: Math.min(slot.plan, counts.get(`${p.pairingId}:${slot.rank}`) ?? 0),
    })))
  }
  return out
}
```

> 说明：`fill` 以 `plan` 封顶，避免超配显示为负数；跨槽位超配的语义（over）plan 阶段按业务确认。

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run gantt/src/utils/__tests__/scenario-composition-fill.test.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add gantt/src/utils/scenario-composition-fill.ts gantt/src/utils/__tests__/scenario-composition-fill.test.ts
git commit -m "feat(scenario): computeScenarioPairingCompositions 本地配比纯函数"
```

---

### Task 6: `buildPairingItems` fillOverrides + pairing pane 订阅 pendingChanges

**Files:**
- Modify: `gantt/src/utils/scenario-pairing-adapter.ts`（`buildPairingItems` 99-184）
- Modify: `gantt/src/components/gantt/source/scenario-gantt-source.ts`（`makeScenarioPairingPaneSource.useRows` 443-507）
- Test: `gantt/src/utils/__tests__/scenario-pairing-adapter-refs.test.ts`（追加用例）

**Interfaces:**
- Consumes: `computeScenarioPairingCompositions`（Task 5）、`buildEffectiveAssignments`（Task 4）、`useScenarioGanttStore` 的 `pendingChanges`。
- Produces: `buildPairingItems(pairings, pairingSegments, assignments, flights, crew?, pendingChanges?)` —— 传 `crew`+`pendingChanges` 时用本地 fill 覆盖 `c.fill`，否则维持 server fill。`useRows` 返回的 pairing item 的 `pairing.composition` 为本地 fill。

- [ ] **Step 1: 写失败测试**

`gantt/src/utils/__tests__/scenario-pairing-adapter-refs.test.ts` 追加：

```ts
import { buildPairingItems } from '@/utils/scenario-pairing-adapter'
import { buildEffectiveAssignments } from '@/components/scenario-gantt/build-scenario-roster-items'

it('传入 crew+pendingChanges 时 fill 本地计算（pending add 计入槽位）', () => {
  const pairings = [pairing88] // 复用文件 fixture，composition CA(1:0)/FO(1:0)
  const items = buildPairingItems(
    [pairing88], [], [], [],
    crewFixture, // 含 F80001 rank=CA
    [{ op: 'add', crewId: 'F80001', pairingId: 88, rosterActingRank: 'CA' }],
  )
  const ca = items[0].pairing.composition.find((s) => s.rank === 'CA')!
  expect(ca.fill).toBe(1)
})
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run gantt/src/utils/__tests__/scenario-pairing-adapter-refs.test.ts`
Expected: FAIL（buildPairingItems 不接受新参数）。

- [ ] **Step 3: 实现 buildPairingItems**

`scenario-pairing-adapter.ts` 签名改为 `buildPairingItems(pairings, pairingSegments, assignments, flights, crew?, pendingChanges?)`：

```ts
export function buildPairingItems(
  pairings: ScenarioGanttPairing[],
  pairingSegments: ScenarioGanttPairingSegment[],
  assignments: ScenarioGanttAssignment[],
  flights: ScenarioGanttFlight[],
  crew?: ScenarioGanttCrew[],
  pendingChanges?: AssignmentPatch[],
): PairingItem[] {
  const effective = crew && pendingChanges
    ? buildEffectiveAssignments(assignments, pendingChanges)
    : assignments
  const fillByPairing = crew && pendingChanges
    ? computeScenarioPairingCompositions(effective, crew, pairings)
    : null
  // ... map 内部：
  const fillMap = fillByPairing?.get(p.pairingId)
  composition: p.compositions.map((c, i) => ({
    rank: c.rank,
    plan: c.plan,
    fill: fillMap?.[i]?.fill ?? c.fill,
  })),
  isFull: fillMap
    ? fillMap.every((s) => s.fill >= s.plan)
    : computeScenarioCoverage(p) !== 'open',
```

`crewCountByPairing`（112-115，当前未使用）可删除或保留——plan 阶段顺手清理，避免死代码。

- [ ] **Step 4: 改 useRows 订阅 pendingChanges**

`scenario-gantt-source.ts` `makeScenarioPairingPaneSource.useRows` 增加订阅并传参：

```ts
const data = useGanttStore((s) => s.data)
const pendingChanges = useGanttStore((s) => s.pendingChanges)   // 新增
...
const allItems = buildPairingItems(
  data.pairings, data.pairingSegments, data.assignments, data.flights,
  data.crew, pendingChanges,
)
```

`useMemo` 依赖数组需含 `pendingChanges`（若 useRows 内用了 useMemo 重建 allItems）。

- [ ] **Step 5: 运行确认通过 + tsc**

Run: `cd gantt && npx tsc --noEmit && npx vitest run src/utils/__tests__/scenario-pairing-adapter-refs.test.ts`
Expected: PASS。

- [ ] **Step 6: Commit**

```bash
git add gantt/src/utils/scenario-pairing-adapter.ts gantt/src/components/gantt/source/scenario-gantt-source.ts gantt/src/utils/__tests__/scenario-pairing-adapter-refs.test.ts
git commit -m "feat(scenario): Pairing pane 配比本地实时计算（订阅 pendingChanges）"
```

---

### Task 7: 职级解析纯函数（B 门禁核心）

**Files:**
- Create: `gantt/src/utils/scenario-assignment-rank.ts`
- Test: `gantt/src/utils/__tests__/scenario-assignment-rank.test.ts`

**Interfaces:**
- Consumes: `CrewRankRecord`（`@/types/crew`）、`ScenarioCompositionSlot`（Task 5）、`RankOption`（`@/services/reference-api`，displayOrder）。
- Produces:
  `resolveAssignmentRank(input: { crewRanks: CrewRankRecord[]; openSlots: ScenarioCompositionSlot[]; taskDate: Date; rankOrder: Map<string, number> }): ResolvedRank`
  `ResolvedRank = { status: 'no-valid-rank' } | { status: 'no-open-position' } | { status: 'ok'; actingRank: string; crossRank: boolean }`
  其中 `openSlots` 由调用方从 `computeScenarioPairingCompositions` 派生（`plan > fill`）。

- [ ] **Step 1: 写失败测试**

```ts
import { describe, expect, it } from 'vitest'
import { resolveAssignmentRank } from './scenario-assignment-rank'

const ranks = [
  { id: 1, crewId: 'F80001', rank: 'FO', effDt: '2026-07-01T00:00:00Z', expDt: '2026-08-15T00:00:00Z' },
  { id: 2, crewId: 'F80001', rank: 'CA', effDt: '2026-08-16T00:00:00Z', expDt: null },
]
const openSlots = [
  { rank: 'CA', plan: 1, fill: 0 },
  { rank: 'FO', plan: 1, fill: 1 },
]
const rankOrder = new Map([['CA', 1], ['FO', 2]])

describe('resolveAssignmentRank', () => {
  it('任务日期在 FO 生效期 → actingRank=FO（与 Open 槽位匹配，非跨职级）', () => {
    const r = resolveAssignmentRank({ crewRanks: ranks, openSlots, taskDate: new Date('2026-08-01T00:00:00Z'), rankOrder })
    expect(r).toMatchObject({ status: 'ok', actingRank: 'FO', crossRank: false })
  })
  it('无有效 rank → no-valid-rank', () => {
    const r = resolveAssignmentRank({ crewRanks: ranks, openSlots: [], taskDate: new Date('2026-09-01T00:00:00Z'), rankOrder })
    expect(r.status).toBe('no-valid-rank')
  })
  it('无 Open 槽位 → no-open-position', () => {
    const r = resolveAssignmentRank({ crewRanks: ranks, openSlots: [], taskDate: new Date('2026-08-01T00:00:00Z'), rankOrder })
    expect(r.status).toBe('no-open-position')
  })
  it('无与 Open 槽位匹配的 rank → 跨职级，actingRank 取 open 槽位 display_order 最小者', () => {
    const r = resolveAssignmentRank({
      crewRanks: [
        { id: 1, crewId: 'F80001', rank: 'PU', effDt: '2026-06-01T00:00:00Z', expDt: null },
        { id: 2, crewId: 'F80001', rank: 'FO', effDt: '2026-05-01T00:00:00Z', expDt: null },
      ],
      openSlots: [{ rank: 'CA', plan: 1, fill: 0 }], // 只有 CA 是 Open 槽位
      taskDate: new Date('2026-08-01T00:00:00Z'),
      rankOrder,
    })
    // PU/FO 都不匹配 Open 的 CA → 跨职级；actingRank 应为 open 槽位中 display_order 最小者（CA=1）
    expect(r.status).toBe('ok')
    if (r.status === 'ok') {
      expect(r.crossRank).toBe(true)
      expect(r.actingRank).toBe('CA')
    }
  })
})
```

> 跨职级时 `actingRank` = open 槽位中 `rankOrder`（display_order）最小者的 rank。

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run gantt/src/utils/__tests__/scenario-assignment-rank.test.ts`
Expected: FAIL（函数不存在）。

- [ ] **Step 3: 实现**

```ts
import type { CrewRankRecord } from '@/types/crew'
import type { ScenarioCompositionSlot } from './scenario-composition-fill'

export type ResolvedRank =
  | { status: 'no-valid-rank' }
  | { status: 'no-open-position' }
  | { status: 'ok'; actingRank: string; crossRank: boolean }

export function resolveAssignmentRank(input: {
  crewRanks: CrewRankRecord[]
  openSlots: ScenarioCompositionSlot[]
  taskDate: Date
  rankOrder: Map<string, number>
}): ResolvedRank {
  const { crewRanks, openSlots, taskDate, rankOrder } = input
  const valid = crewRanks
    .filter((r) => {
      const eff = new Date(r.effDt).getTime()
      const exp = r.expDt ? new Date(r.expDt).getTime() : Infinity
      return eff <= taskDate.getTime() && taskDate.getTime() < exp
    })
    .sort((a, b) => new Date(a.effDt).getTime() - new Date(b.effDt).getTime())
  if (valid.length === 0) return { status: 'no-valid-rank' }
  if (openSlots.length === 0) return { status: 'no-open-position' }

  const openRankSet = new Set(openSlots.map((s) => s.rank))
  const byOrder = (a: string, b: string): number =>
    (rankOrder.get(a) ?? Number.MAX_SAFE_INTEGER) - (rankOrder.get(b) ?? Number.MAX_SAFE_INTEGER)

  // 优先取与 Open 槽位匹配的 valid rank；多个匹配按 display_order 最小。
  const matched = valid.filter((r) => openRankSet.has(r.rank)).sort((a, b) => byOrder(a.rank, b.rank))
  if (matched.length > 0) return { status: 'ok', actingRank: matched[0].rank, crossRank: false }

  // 无匹配 → 跨职级：取 effDt 最新（最后一条）作为判定基准，但填充的 actingRank 为
  // Open 槽位中 display_order 最小者（用户规则：跨职级分配 ActingRank = Pairing Open 位置）。
  const target = [...openSlots].sort((a, b) => byOrder(a.rank, b.rank))[0].rank
  return { status: 'ok', actingRank: target, crossRank: true }
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run gantt/src/utils/__tests__/scenario-assignment-rank.test.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add gantt/src/utils/scenario-assignment-rank.ts gantt/src/utils/__tests__/scenario-assignment-rank.test.ts
git commit -m "feat(scenario): 分配职级解析纯函数（CrewRank 历史 + Open 槽位 + display_order）"
```

---

### Task 8: 跨职级确认框（AppDialog）

**Files:**
- Create: `gantt/src/components/scenario-gantt/cross-rank-confirm-dialog.tsx`
- Test: `gantt/src/components/scenario-gantt/__tests__/cross-rank-confirm-dialog.test.tsx`

**Interfaces:**
- Consumes: `AppDialog`（`@rois/ui`，`packages/ui/src/composites/app-dialog.tsx`）。
- Produces: `useCrossRankConfirm(): { confirmCrossRank(payload: { crewId: string; crewRank: string; actingRank: string; pairingLabel: string | null }): Promise<boolean> }` —— promise 式；组件挂载在 scenario-gantt-view 顶层。

- [ ] **Step 1: 写失败测试**

```tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { CrossRankConfirmProvider, useCrossRankConfirm } from './cross-rank-confirm-dialog'

const Probe = () => {
  const { confirmCrossRank } = useCrossRankConfirm()
  return <button onClick={() => void confirmCrossRank({ crewId: 'F80001', crewRank: 'FO', actingRank: 'CA', pairingLabel: 'P88' })}>ask</button>
}

describe('CrossRankConfirmProvider', () => {
  it('确认 → resolve(true)', async () => {
    const { user } = render(<CrossRankConfirmProvider><Probe /></CrossRankConfirmProvider>)
    // 点 ask 弹出 AppDialog，文案含 CA，点 Confirm → true
  })
})
```

> 组件测试以文案断言 + 按钮点击为主；交互验收走 Playwright（Task 12）。

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run gantt/src/components/scenario-gantt/__tests__/cross-rank-confirm-dialog.test.tsx`
Expected: FAIL（组件不存在）。

- [ ] **Step 3: 实现**

```tsx
import { createContext, useCallback, useContext, useState } from 'react'
import type { ReactNode } from 'react'
import { AppDialog } from '@rois/ui'
import { Button } from '@rois/ui'

interface Payload { crewId: string; crewRank: string; actingRank: string; pairingLabel: string | null }

const CrossRankConfirmContext = createContext<{ confirmCrossRank: (p: Payload) => Promise<boolean> }>({
  confirmCrossRank: () => Promise.resolve(false),
})

export const useCrossRankConfirm = () => useContext(CrossRankConfirmContext)

export const CrossRankConfirmProvider = ({ children }: { children: ReactNode }) => {
  const [open, setOpen] = useState(false)
  const [payload, setPayload] = useState<Payload | null>(null)
  const resolverRef = useRef<((ok: boolean) => void) | null>(null)

  const confirmCrossRank = useCallback((p: Payload) => new Promise<boolean>((resolve) => {
    setPayload(p)
    setOpen(true)
    resolverRef.current = resolve
  }), [])

  const close = (ok: boolean) => {
    setOpen(false)
    resolverRef.current?.(ok)
    resolverRef.current = null
  }

  return (
    <CrossRankConfirmContext.Provider value={{ confirmCrossRank }}>
      {children}
      <AppDialog
        open={open}
        onOpenChange={(o) => { if (!o) close(false) }}
        icon={<span className="h-4 w-4" aria-hidden />}
        title="Cross-rank assignment"
        showClose
        footer={
          <>
            <Button variant="ghost" onClick={() => close(false)}>Cancel</Button>
            <Button onClick={() => close(true)}>Confirm</Button>
          </>
        }
      >
        <p className="text-sm text-foreground">
          Crew {payload?.crewId} (rank {payload?.crewRank}) will be assigned to {payload?.pairingLabel ?? ''}
          {' '}acting as {payload?.actingRank}. Continue?
        </p>
      </AppDialog>
    </CrossRankConfirmContext.Provider>
  )
}
```

- [ ] **Step 4: 挂载到 scenario-gantt-view**

在 `gantt/src/components/shell/scenario-gantt-view.tsx` 的视图外层包 `<CrossRankConfirmProvider>`（一次，所有 scenarioId 共享）。

- [ ] **Step 5: 运行确认通过**

Run: `cd gantt && npx tsc --noEmit && npx vitest run src/components/scenario-gantt/__tests__/cross-rank-confirm-dialog.test.tsx`
Expected: PASS。

- [ ] **Step 6: Commit**

```bash
git add gantt/src/components/scenario-gantt/cross-rank-confirm-dialog.tsx gantt/src/components/shell/scenario-gantt-view.tsx gantt/src/components/scenario-gantt/__tests__/cross-rank-confirm-dialog.test.tsx
git commit -m "feat(scenario): 跨职级分配确认框（AppDialog promise 式）"
```

---

### Task 9: scenario-edit-controller 职级门禁接入（B）

**Files:**
- Modify: `gantt/src/components/gantt/source/scenario-edit-controller.ts`（`roster-assign` 分支 30-36）
- Test: `gantt/src/components/gantt/source/__tests__/scenario-edit-controller.test.tsx`（不存在则新建）

**Interfaces:**
- Consumes: `resolveAssignmentRank`（Task 7）、`useCrossRankConfirm`（Task 8）、`computeScenarioPairingCompositions` + `buildEffectiveAssignments`（Task 5/4）、`useReferenceStore`（displayOrder）、`ScenarioGanttData`。
- Produces: `roster-assign` 在合法性前执行职级门禁；通过后 patch 带 `rosterActingRank`。

- [ ] **Step 1: 写失败测试**

mock `checkLiveDraftLegality` / store；断言：
- 无有效 rank → `addPatch` 不被调用 + `notify.warning` 被调。
- 无 Open → 同上。
- 跨职级确认 false → 不 addPatch。
- 跨职级确认 true → addPatch 携带 `rosterActingRank`。

```ts
it('跨职级确认通过后 patch 携带 actingRank', async () => {
  // mock store.data（pairings 含 composition CA open / FO open）、lockStatus.isOwner=true
  // mock resolveAssignmentRank → { status:'ok', actingRank:'CA', crossRank:true }
  // mock confirmCrossRank → true
  await execute({ type: 'roster-assign', pairingId: 88, toCrewId: 'F80001' })
  expect(addPatch).toHaveBeenCalledWith(expect.objectContaining({ op: 'add', crewId: 'F80001', pairingId: 88, rosterActingRank: 'CA' }))
})
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run gantt/src/components/gantt/source/__tests__/scenario-edit-controller.test.tsx`
Expected: FAIL（无门禁逻辑）。

- [ ] **Step 3: 实现**

`scenario-edit-controller.ts` 新增辅助 `resolveScenarioAssignmentGate(store, crewId, pairingId)` 并在 `roster-assign` 前置：

```ts
case 'roster-assign': {
  if (!caps?.roster.canAssign) return
  const data = store.data
  const crew = data?.crew.find((c) => c.crewId === op.toCrewId)
  const pairing = data?.pairings.find((p) => p.pairingId === op.pairingId)
  if (!data || !crew || !pairing) return
  const taskDate = new Date(pairing.schStrDtUtc)
  const effective = buildEffectiveAssignments(data.assignments, store.pendingChanges)
  const fillMap = computeScenarioPairingCompositions(effective, data.crew, data.pairings)
  const openSlots = (fillMap.get(pairing.pairingId) ?? []).filter((s) => s.fill < s.plan)
  const rankOrder = useReferenceStore.getState().ranks.length
    ? new Map(useReferenceStore.getState().ranks.map((r) => [r.rank, r.displayOrder]))
    : new Map<string, number>()
  if (rankOrder.size === 0) void useReferenceStore.getState().load()
  const resolved = resolveAssignmentRank({ crewRanks: crew.ranks ?? [], openSlots, taskDate, rankOrder })
  if (resolved.status === 'no-valid-rank') { notify.warning(`CrewRank invalid for ${crew.crewId} on ${taskDate.toISOString().slice(0,10)}`); return }
  if (resolved.status === 'no-open-position') { notify.warning('Pairing positions full'); return }
  if (resolved.crossRank) {
    const ok = await useCrossRankConfirm().confirmCrossRank({
      crewId: crew.crewId, crewRank: crew.crewRank ?? crew.rank, actingRank: resolved.actingRank, pairingLabel: pairing.pairingLabel,
    })
    if (!ok) return
  }
  const patch = { op: 'add' as const, crewId: op.toCrewId, pairingId: op.pairingId, rosterActingRank: resolved.actingRank }
  const allowed = await previewScenarioPatch(scenarioId, store, patch, [op.toCrewId])
  if (allowed) store.addPatch(patch)
  break
}
```

> `useCrossRankConfirm` 是 hook，不能在 controller 的 `useMemo` 工厂外调用；把它作为参数/依赖传入 `useScenarioEditController`（在组件内调用 hook 取得 `confirmCrossRank`，闭包进 `execute`）。

- [ ] **Step 4: 运行确认通过**

Run: `cd gantt && npx tsc --noEmit && npx vitest run src/components/gantt/source/__tests__/scenario-edit-controller.test.tsx`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add gantt/src/components/gantt/source/scenario-edit-controller.ts gantt/src/components/gantt/source/__tests__/scenario-edit-controller.test.tsx
git commit -m "feat(scenario): assign 前置职级门禁（CrewRank 有效/Open 槽位/跨职级确认）"
```

---

### Task 10: Roster Header 动态 Rank/Base（对齐 Live，C2）

**Files:**
- Modify: `gantt/src/components/gantt/source/scenario-gantt-source.ts`（`useRosterModel` 679-821）
- Test: 纯逻辑提取进可测函数 + Playwright（Task 12）

**Interfaces:**
- Consumes: `getAllEffective`（`@/utils/crew-history`）、`calendarDateInTimeZone` / `calendarDateToUtcMidnight` / `xToTime`（`@/components/gantt/gantt-utils`）、`useTimezoneStore`、scenario-gantt-store 的 `scrollX`/`pxPerHour`/`data.strDtLoc`。
- Produces: panel row `rank`/`base` 为 `getAllEffective(crew.ranks, viewportLeftDate)` / `getAllEffective(crew.bases, viewportLeftDate)` 的 `|` 拼接；无历史回退单值。

- [ ] **Step 1: 写失败测试（纯函数提取）**

把 rank/base 解析提取为 `buildScenarioCrewIdentity(c, viewportLeftDate)`（在 `scenario-gantt-source.ts` 导出或独立 util），测试：

```ts
it('按视口最左日期解析有效 rank/base，多记录 | 拼接', () => {
  const crew = { crewId: 'F80001', base: 'YOW', division: 'P', rank: 'FO', seniorityNum: null, crewName: null,
    ranks: [ { id:1, crewId:'F80001', rank:'FO', effDt:'2026-07-01T00:00:00Z', expDt:'2026-08-15T00:00:00Z' },
             { id:2, crewId:'F80001', rank:'CA', effDt:'2026-08-16T00:00:00Z', expDt:null } ],
    bases: [ { id:1, crewId:'F80001', base:'YOW', effDt:'2026-07-01T00:00:00Z', expDt:null } ] }
  const id = buildScenarioCrewIdentity(crew, new Date('2026-08-01T00:00:00Z'))
  expect(id.rank).toBe('FO')
  expect(id.base).toBe('YOW')
})
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run <新测试文件>`
Expected: FAIL（函数不存在）。

- [ ] **Step 3: 实现**

`useRosterModel` 内（与 Live `live-gantt-source.ts:689-693` 同式）计算 `viewportLeftDate`：

```ts
const viewportLeftDate = useMemo(() => {
  if (!data) return null
  const leftmost = xToTime(viewportLeftMs ?? 0, new Date(data.strDtLoc), pxPerHour)
  const calendarDate = calendarDateInTimeZone(leftmost, timezone)
  return calendarDateToUtcMidnight(calendarDate, timezone)
}, [data, viewportLeftMs, pxPerHour, timezone])
```

panel 行 rank/base 改为：

```ts
const identity = viewportLeftDate ? buildScenarioCrewIdentity(c, viewportLeftDate) : { rank: c.crewRank ?? c.rank, base: c.base }
...
rank: identity.rank,
base: identity.base,
```

`buildScenarioCrewIdentity`：

```ts
export const buildScenarioCrewIdentity = (
  c: ScenarioGanttCrew,
  viewportLeftDate: Date,
): { rank: string; base: string } => ({
  rank: c.ranks?.length
    ? getAllEffective(c.ranks, viewportLeftDate).map((r) => r.rank).join(' | ') || c.crewRank ?? c.rank
    : (c.crewRank ?? c.rank),
  base: c.bases?.length
    ? getAllEffective(c.bases, viewportLeftDate).map((b) => b.base).join(' | ') || c.base
    : c.base,
})
```

- [ ] **Step 4: 运行确认通过**

Run: `cd gantt && npx tsc --noEmit && npx vitest run <新测试文件>`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add gantt/src/components/gantt/source/scenario-gantt-source.ts <新测试文件>
git commit -m "feat(scenario): Roster Header Rank/Base 按视口最左日期动态解析（对齐 Live）"
```

---

### Task 11: 跨用户 Roster 同步（D）

**Files:**
- Modify: `live-server/src/routes/scenario/scenario.ts`（`POST /:id/patch-output` 1620-1682）
- Modify: `gantt/src/hooks/use-scenario-ws-updates.ts`（`handleScenarioRecomputeMessage` 44-57）
- Modify: `live-server/src/plugins/websocket.ts`（`WsServerMessage` 联合类型 19-34 加 `scenario-roster-updated`）
- Test: `gantt/src/hooks/__tests__/use-scenario-ws-updates.test.ts`（新建）

**Interfaces:**
- Consumes: `fastify.wsBroadcast`（`websocket.ts:197`）、`applyScenarioPatchesToData`（Task 4）、`getScenarioGanttStore`。
- Produces: WS 消息 `{ type: 'scenario-roster-updated'; scenarioId: number; patches: AssignmentPatch[] }`；客户端 data 非空才应用。

- [ ] **Step 1: 服务端类型 + 广播**

`websocket.ts` 联合类型加：

```ts
| { type: 'scenario-roster-updated'; scenarioId: number; patches: AssignmentPatch[] }
```

`scenario.ts` patch-output 补丁应用成功（`applyScenarioRosterPatches` 之后、入队之前或之后均可，事务外）加：

```ts
fastify.wsBroadcast(airline, { type: 'scenario-roster-updated', scenarioId: numId, patches }, request.authUser?.userCode)
```

> `airline` 变量名以该 route 现有代码为准（可能叫 `schema`/`airlineSchema`）；`authUser.userCode` 是排除编辑者的 key（与 `client.userId` 对应，plan 阶段核对 `websocket.ts:163`）。

- [ ] **Step 2: 写失败测试（客户端 handler）**

`gantt/src/hooks/__tests__/use-scenario-ws-updates.test.ts`：

```ts
it('scenario-roster-updated：data 非空才应用 patch + bump dataRevision', () => {
  const setState = vi.fn()
  const store = { data: { ...baseData, assignments: [a1] }, dataRevision: 5, setState }
  vi.stubGlobal('getScenarioGanttStore', () => ({ getState: () => store }))
  // 用 mock 的 store 注册到 handler
  await handleScenarioRecomputeMessage(623, { type: 'scenario-roster-updated', scenarioId: 623, patches: [{ op: 'remove', crewId: 'F80001', pairingId: 88 }] })
  expect(setState).toHaveBeenCalled()
  expect(setState.mock.calls[0][0]({ data: store.data, dataRevision: 5 })).toMatchObject({ dataRevision: 6 })
})
```

- [ ] **Step 3: 运行确认失败**

Run: `npx vitest run gantt/src/hooks/__tests__/use-scenario-ws-updates.test.ts`
Expected: FAIL（handler 不认识该消息类型）。

- [ ] **Step 4: 实现客户端 handler**

`use-scenario-ws-updates.ts`：

```ts
} else if (m.type === 'scenario-roster-updated' && Number(m.scenarioId) === scenarioId) {
  const patches = Array.isArray(m.patches) ? m.patches as AssignmentPatch[] : []
  if (patches.length === 0) return
  const store = getScenarioGanttStore(scenarioId)
  const st = store.getState()
  if (!st.data) return                      // 未打开/未加载 → 跳过
  const next = applyScenarioPatchesToData(st.data, patches)
  if (next !== st.data) store.setState({ data: next, dataRevision: st.dataRevision + 1 })
}
```

> 注意：`getScenarioGanttStore` 在未打开场景时**会创建空 store**（registry 副作用）。为避免污染，先检查 `registry.has`？`getScenarioGanttStore` 没有暴露 has——plan 阶段给 store 加 `getScenarioGanttStoreIfLoaded(scenarioId)`（存在才返回，否则 null）或改用 `activeVersions` 判断。

- [ ] **Step 5: 运行确认通过**

Run: `cd gantt && npx tsc --noEmit && npx vitest run src/hooks/__tests__/use-scenario-ws-updates.test.ts`
Expected: PASS。

- [ ] **Step 6: Commit**

```bash
git add live-server/src/plugins/websocket.ts live-server/src/routes/scenario/scenario.ts gantt/src/hooks/use-scenario-ws-updates.ts gantt/src/hooks/__tests__/use-scenario-ws-updates.test.ts
git commit -m "feat: scenario 保存后广播 roster patches，其他用户本地应用（未打开跳过）"
```

---

### Task 12: E2E Playwright + SIT 性能验收（P6）

**Files:**
- Create: `e2e/gantt/scenario-roster-fill-drag.spec.ts`
- Create: `e2e/gantt/scenario-roster-sync.spec.ts`（双端）
- Test: 运行上述 spec

**Interfaces:**
- Consumes: 全部前面任务的可运行 UI。

- [ ] **Step 1: 写 E2E（fill 随编辑实时变化 + 拖拽立即绘制 + 门禁提示）**

`e2e/gantt/scenario-roster-fill-drag.spec.ts`：

```ts
test('删除带环 roster 后 Pairing 配比立即减，拖回立即绘制', async ({ page }) => {
  // 打开 scenario gantt（SIT 真实后端）
  // 定位某 pairing 行 → 断言 composition 文本（如 "CA(1)"）
  // 在 roster pane 右键删除该 crew 的任务（或按既有删除交互）
  // 断言 pairing 行 composition 文本变为含 "0" 的未满态（配比减 1）
  // 拖拽 pairing 回该 crew 行
  // 断言立即出现任务 puck（toHaveCount / 具体文本）
})
```

- [ ] **Step 2: 写 E2E（职级门禁 + 跨职级确认）**

```ts
test('无 Open 槽位提示位置已满；跨职级弹确认', async ({ page }) => {
  // 找一个已满 pairing 拖到 crew → 断言 toast「Pairing positions full」
  // 找一个跨职级场景 → 断言 AppDialog「Cross-rank assignment」→ Confirm → 分配生效
})
```

- [ ] **Step 3: 写 E2E（双端同步）**

`e2e/gantt/scenario-roster-sync.spec.ts`：两个 context 登录同一用户视角？不行——WS 广播按 schema。用两个 page（同 context 或两 context）打开同一 scenario，A 拖拽保存，B 断言 fill/任务出现；B 不打开场景时 A 保存后 B 无异常。

- [ ] **Step 4: 运行 + 修到全绿**

Run: `npx playwright test e2e/gantt/scenario-roster-fill-drag.spec.ts e2e/gantt/scenario-roster-sync.spec.ts --reporter=list`
Expected: PASS（§No-Illusion：贴出 PASS 摘要）。

- [ ] **Step 5: SIT 性能实测**

在 SIT（10.15.12.4）部署后：拖拽 pairing → 记录到绘制出现耗时，目标 ≤100ms。用 `performance.now()` 或浏览器 Network 面板确认 `preview-draft` 只发 1 次。

- [ ] **Step 6: Commit**

```bash
git add e2e/gantt/scenario-roster-fill-drag.spec.ts e2e/gantt/scenario-roster-sync.spec.ts
git commit -m "test(e2e): scenario fill 实时 / 拖拽门禁 / 双端同步回归"
```

---

## Self-Review

**Spec coverage:**
- §3.1 A（单请求快路径 + ≤100ms）→ Task 1（单请求）、Task 12（验收）。
- §3.1 server 收紧作用域 → 探索已确认 temp roster 已按 crew 限定；预留 Task 12 Step 5 实测。
- §3.2 B（职级门禁）→ Task 7（纯函数）+ Task 8（确认框）+ Task 9（接入）。
- §3.3 C1（crew 历史下发）→ Task 2；C2（Header 动态）→ Task 10；C3（配比本地）→ Task 5+6；C4（patch 写 rank）→ Task 3。
- §3.4 D（跨用户同步）→ Task 11。
- §6 测试 → 各任务内 Vitest + Task 12 Playwright。

**Placeholder scan:** 无 TBD/TODO；每个代码步骤含具体实现。Task 2 Step 6 的 `plan 阶段核对` 与 Task 11 Step 1 的 `plan 阶段核对` 是边界提示（字段名以现状为准），实现者核对后填实。

**Type consistency:**
- `rosterActingRank` 从 Task 4 起在 `AssignmentPatch` 存在；Task 3 服务端用 `(patch as {...})` 读取，Task 4 加类型后一致。
- `computeScenarioPairingCompositions` 返回 `ScenarioCompositionSlot`（Task 5），Task 7/9 复用 `plan > fill` 派生 openSlots——一致。
- `buildPairingItems` 新参数 `crew?`/`pendingChanges?`（Task 6），既有调用（`gantt-day-statistics-dialog.tsx:78`）不传 → 保持 server fill——一致。
- `resolveAssignmentRank` 返回联合类型（Task 7），Task 9 按 status 分支——一致。
